import React, { useRef, useState } from 'react';
import { Alert, Button, Checkbox, DatePicker, Drawer, Input, InputNumber, Radio, Space, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { t } from '../../../i18n/t';
import { feedback } from '../../../lib/feedback';
import {
  MAX_DECLARATION_CHARGE_CALLS_PER_LINE,
  MAX_DECLARATION_LINES,
  createDeclaration,
  readPaymentProof,
  type CoOwnerChargeCall,
  type CoOwnerDeclaration,
  type CoOwnerDeclaredAvailability,
  type CoOwnerLot,
  type DeclarationInput,
  type PaymentProofReading,
  type ReceivingNumber
} from '../../../services/coowner-portal-service';
import { MoneyValue } from '../../primitives';
import {
  aiFieldHint,
  aiReadFailedMessage,
  formatPhoneForDisplay,
  isValidTransactionReference,
  normalizeTransactionReference,
  operatorLabel,
  parseDeclarationApiError,
  validateProofFile
} from './labels';

/**
 * Formulaire « J'ai payé par mobile money » (spec 047, parcours P2, contrat §2.4).
 * Un Drawer, un état local contrôlé. La capture peut être lue par l'IA
 * (contrat §2.3) : les valeurs lues sont des propositions, jamais imposées.
 */

export interface DeclarationFormProps {
  open: boolean;
  onClose: () => void;
  onSubmitted: (declaration: CoOwnerDeclaration) => void;
  syndicate: { id: string; name: string };
  availability: CoOwnerDeclaredAvailability;
  /** Lots du copropriétaire dans CETTE copropriété (le parent filtre). */
  lots: Array<Pick<CoOwnerLot, 'id' | 'lotNumber'>>;
  /** Tous les appels du copropriétaire : le formulaire garde ceux du lot avec outstanding > 0. */
  calls: CoOwnerChargeCall[];
  /** Numéro du profil, prérempli dans « Numéro qui a payé » (peut être absent). */
  defaultPayerPhone?: string;
}

const TOUCH = 40;
const DATE_FORMAT = 'DD/MM/YYYY HH:mm';
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_PAST_DAYS = 90;
const MAX_FUTURE_MINUTES = 10;

type AiField = 'amount' | 'paidAt' | 'reference' | 'payerPhone' | 'receivingNumberId';

interface FormState {
  receivingNumberId: string | null;
  payerPhone: string;
  amount: number | null;
  paidAt: Dayjs | null;
  reference: string;
  checkedLots: string[];
  shares: Record<string, number | null>;
  callIds: Record<string, string[]>;
  comment: string;
  /** Valeur lue par l'IA, par champ : la mention disparaît dès que le champ en diffère. */
  ai: Partial<Record<AiField, string | number>>;
}

type Errors = Record<string, string>;

function activeNumbers(availability: CoOwnerDeclaredAvailability): ReceivingNumber[] {
  return availability.receivingNumbers.filter(n => n.isActive !== false);
}

function initialState(props: DeclarationFormProps): FormState {
  const numbers = activeNumbers(props.availability);
  return {
    receivingNumberId: numbers.length === 1 ? numbers[0].id : null,
    payerPhone: props.defaultPayerPhone ?? '',
    amount: null,
    paidAt: null,
    reference: '',
    checkedLots: props.lots.length === 1 ? [props.lots[0].id] : [],
    shares: {},
    callIds: {},
    comment: '',
    ai: {}
  };
}

function inPaidAtWindow(value: Dayjs): boolean {
  return (
    value.isValid() &&
    !value.isAfter(dayjs().add(MAX_FUTURE_MINUTES, 'minute')) &&
    !value.isBefore(dayjs().subtract(MAX_PAST_DAYS, 'day'))
  );
}

function openCallsOf(calls: CoOwnerChargeCall[], lotId: string): CoOwnerChargeCall[] {
  return calls.filter(c => c.lot?.id === lotId && c.outstanding > 0);
}

/** Part d'un lot coché : le montant s'il est seul, la saisie sinon. */
function shareOf(state: FormState, lotId: string): number | null {
  return state.checkedLots.length === 1 ? state.amount : (state.shares[lotId] ?? null);
}

function sumOfShares(state: FormState): number {
  return state.checkedLots.reduce((sum, id) => sum + (shareOf(state, id) ?? 0), 0);
}

function validateForm(state: FormState, availability: CoOwnerDeclaredAvailability): Errors {
  const errors: Errors = {};
  if (!state.receivingNumberId) errors.receivingNumber = t('Choisissez le numéro de réception utilisé.');
  if (state.payerPhone.replace(/\D/g, '').length < 8) {
    errors.payerPhone = t('Saisissez le numéro qui a payé (8 chiffres au moins).');
  }
  if (state.amount === null || !Number.isInteger(state.amount) || state.amount < 1) {
    errors.amount = t('Saisissez un montant entier supérieur à zéro.');
  } else if (state.amount > availability.maxAmount) {
    errors.amount = t('Le montant ne peut pas dépasser {{max}} FCFA.', { max: availability.maxAmount });
  }
  if (!state.paidAt) errors.paidAt = t('Indiquez la date et l’heure du transfert.');
  else if (!inPaidAtWindow(state.paidAt)) {
    errors.paidAt = t('La date doit être comprise dans les 90 derniers jours et ne peut pas être dans le futur.');
  }
  if (!isValidTransactionReference(normalizeTransactionReference(state.reference))) {
    errors.reference = t('La référence doit comporter 4 à 40 caractères : lettres, chiffres, tiret ou point.');
  }
  validateLots(state, errors);
  return errors;
}

function validateLots(state: FormState, errors: Errors): void {
  if (state.checkedLots.length === 0) errors.lots = t('Cochez au moins un lot.');
  if (state.checkedLots.length > MAX_DECLARATION_LINES) {
    errors.lots = t('Un transfert ne peut pas couvrir plus de {{max}} lots.', { max: MAX_DECLARATION_LINES });
  }
  if (state.checkedLots.length < 2) return;
  for (const id of state.checkedLots) {
    const share = state.shares[id];
    if (!share || share < 1 || !Number.isInteger(share)) errors[`share-${id}`] = t('Indiquez la part de ce lot.');
  }
  if (state.amount !== null && sumOfShares(state) !== state.amount) {
    errors.shares = t('La somme des parts doit être égale au montant envoyé.');
  }
}

/** Applique une lecture IA : jamais d'écrasement d'une saisie humaine. */
function applyReading(prev: FormState, reading: PaymentProofReading, ctx: ReadingContext): FormState {
  if (reading.quality !== 'OK') return prev;
  const next: FormState = { ...prev, ai: { ...prev.ai } };

  if (typeof reading.amount === 'number' && Number.isInteger(reading.amount) && reading.amount > 0) {
    if (reading.amount <= ctx.maxAmount && (prev.amount === null || prev.amount === prev.ai.amount)) {
      next.amount = reading.amount;
      next.ai.amount = reading.amount;
    }
  }
  if (reading.paidAt) {
    const read = dayjs(reading.paidAt);
    if (inPaidAtWindow(read) && (prev.paidAt === null || prev.paidAt.valueOf() === prev.ai.paidAt)) {
      next.paidAt = read;
      next.ai.paidAt = read.valueOf();
    }
  }
  if (reading.transactionReference) {
    const read = normalizeTransactionReference(reading.transactionReference);
    if (read && (prev.reference.trim() === '' || normalizeTransactionReference(prev.reference) === prev.ai.reference)) {
      next.reference = read;
      next.ai.reference = read;
    }
  }
  if (reading.payerPhone) {
    const current = prev.payerPhone.trim();
    if (current === '' || current === prev.ai.payerPhone || current === (ctx.defaultPayerPhone ?? '').trim()) {
      next.payerPhone = reading.payerPhone;
      next.ai.payerPhone = reading.payerPhone;
    }
  }
  const matched = reading.matchedReceivingNumberId;
  if (matched && ctx.numberIds.includes(matched)) {
    if (prev.receivingNumberId === null || prev.receivingNumberId === prev.ai.receivingNumberId) {
      next.receivingNumberId = matched;
      next.ai.receivingNumberId = matched;
    }
  }
  return next;
}

interface ReadingContext {
  maxAmount: number;
  defaultPayerPhone?: string;
  numberIds: string[];
}

function isAiValue(state: FormState, field: AiField): boolean {
  const read = state.ai[field];
  if (read === undefined) return false;
  switch (field) {
    case 'amount':
      return state.amount === read;
    case 'paidAt':
      return state.paidAt !== null && state.paidAt.valueOf() === read;
    case 'reference':
      return normalizeTransactionReference(state.reference) === read;
    case 'payerPhone':
      return state.payerPhone.trim() === read;
    default:
      return state.receivingNumberId === read;
  }
}

// ---------------------------------------------------------------------------
// Présentation
// ---------------------------------------------------------------------------

interface FieldProps {
  id?: string;
  label: string;
  required?: boolean;
  aiField?: AiField;
  aiActive?: boolean;
  help?: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ id, label, required, aiField, aiActive, help, error, children }: FieldProps): React.ReactElement {
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={id} style={{ fontWeight: 600 }}>
        {label}
      </label>
      {required ? <span aria-hidden="true"> *</span> : null}
      {aiActive && aiField ? (
        <div data-testid={`ai-hint-${aiField}`}>
          <Typography.Text type="secondary">{aiFieldHint()}</Typography.Text>
        </div>
      ) : null}
      <div style={{ marginTop: 4 }}>{children}</div>
      {help ? (
        <div>
          <Typography.Text type="secondary">{help}</Typography.Text>
        </div>
      ) : null}
      {error ? (
        <div role="alert">
          <Typography.Text type="danger">{error}</Typography.Text>
        </div>
      ) : null}
    </div>
  );
}

function groupDigits(value: string | number | undefined): string {
  return `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function parseDigits(value: string | undefined): number {
  return Number((value ?? '').replace(/\D/g, ''));
}

interface MoneyInputProps {
  id: string;
  value: number | null;
  max?: number;
  ariaLabel?: string;
  onChange: (value: number | null) => void;
}

function MoneyInput({ id, value, max, ariaLabel, onChange }: MoneyInputProps): React.ReactElement {
  return (
    <InputNumber<number>
      id={id}
      aria-label={ariaLabel}
      value={value}
      min={1}
      max={max}
      precision={0}
      controls={false}
      inputMode="numeric"
      style={{ width: '100%', minHeight: TOUCH }}
      formatter={groupDigits}
      parser={parseDigits}
      onChange={v => onChange(typeof v === 'number' ? v : null)}
    />
  );
}

interface PatchProps {
  state: FormState;
  errors: Errors;
  patch: (change: Partial<FormState>) => void;
}

function ReceivingNumberField(
  props: PatchProps & { numbers: ReceivingNumber[]; instructions: string | null }
): React.ReactElement {
  const { state, errors, patch, numbers, instructions } = props;
  return (
    <>
      {instructions?.trim() ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title={<span style={{ whiteSpace: 'pre-wrap' }}>{instructions}</span>}
        />
      ) : null}
      <Field
        label={t('Numéro de réception utilisé')}
        required
        aiField="receivingNumberId"
        aiActive={isAiValue(state, 'receivingNumberId')}
        error={errors.receivingNumber}
      >
        <Radio.Group
          value={state.receivingNumberId}
          onChange={e => patch({ receivingNumberId: e.target.value as string })}
        >
          <Space orientation="vertical">
            {numbers.map(n => (
              <Radio key={n.id} value={n.id} style={{ minHeight: TOUCH, alignItems: 'center' }}>
                {operatorLabel(n.operator)} — {formatPhoneForDisplay(n.phoneNumber)} — {n.holderName}
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      </Field>
    </>
  );
}

function AmountFields({ state, errors, patch, maxAmount }: PatchProps & { maxAmount: number }): React.ReactElement {
  return (
    <>
      <Field
        id="declaration-payer-phone"
        label={t('Numéro qui a payé')}
        required
        aiField="payerPhone"
        aiActive={isAiValue(state, 'payerPhone')}
        error={errors.payerPhone}
      >
        <Input
          id="declaration-payer-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          style={{ minHeight: TOUCH }}
          value={state.payerPhone}
          onChange={e => patch({ payerPhone: e.target.value })}
        />
      </Field>
      <Field
        id="declaration-amount"
        label={t('Montant envoyé (FCFA)')}
        required
        aiField="amount"
        aiActive={isAiValue(state, 'amount')}
        help={t('Indiquez le montant que le syndic a reçu (celui du SMS de l’opérateur).')}
        error={errors.amount}
      >
        <MoneyInput
          id="declaration-amount"
          value={state.amount}
          max={maxAmount}
          onChange={amount => patch({ amount })}
        />
      </Field>
    </>
  );
}

function PaidAtAndReference({ state, errors, patch }: PatchProps & { refError?: string }): React.ReactElement {
  const normalized = normalizeTransactionReference(state.reference);
  return (
    <>
      <Field
        id="declaration-paid-at"
        label={t('Date et heure du transfert')}
        required
        aiField="paidAt"
        aiActive={isAiValue(state, 'paidAt')}
        error={errors.paidAt}
      >
        <DatePicker
          id="declaration-paid-at"
          showTime={{ format: 'HH:mm' }}
          format={DATE_FORMAT}
          inputReadOnly={false}
          style={{ width: '100%', minHeight: TOUCH }}
          value={state.paidAt}
          disabledDate={d => d.isAfter(dayjs(), 'day') || d.isBefore(dayjs().subtract(MAX_PAST_DAYS, 'day'), 'day')}
          onChange={paidAt => patch({ paidAt })}
        />
      </Field>
      <Field
        id="declaration-reference"
        label={t('Référence de la transaction')}
        required
        aiField="reference"
        aiActive={isAiValue(state, 'reference')}
        help={normalized ? t('Référence enregistrée : {{ref}}', { ref: normalized }) : undefined}
        error={errors.reference}
      >
        <Input
          id="declaration-reference"
          autoComplete="off"
          style={{ minHeight: TOUCH }}
          value={state.reference}
          onChange={e => patch({ reference: e.target.value })}
          onBlur={() => patch({ reference: normalizeTransactionReference(state.reference) })}
        />
      </Field>
    </>
  );
}

interface LotRowProps {
  lot: Pick<CoOwnerLot, 'id' | 'lotNumber'>;
  state: FormState;
  calls: CoOwnerChargeCall[];
  locked: boolean;
  blocked: boolean;
  showShare: boolean;
  error?: string;
  onToggle: (checked: boolean) => void;
  onShare: (value: number | null) => void;
  onCalls: (ids: string[]) => void;
}

function CallOption(props: {
  call: CoOwnerChargeCall;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}): React.ReactElement {
  const { call, checked, onChange } = props;
  // Paiement en ligne en cours ou à vérifier : l'appel ne se déclare pas en même temps (cas limite 9).
  const onlineBlocked = call.onlineCheckout !== undefined && call.onlineCheckout !== 'NONE';
  const disabled = props.disabled || (onlineBlocked && !checked);
  return (
    <div style={{ minHeight: TOUCH, display: 'flex', alignItems: 'center' }}>
      <Checkbox checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}>
        {call.period} — {t('échéance')} {dayjs(call.dueDate).format('DD/MM/YYYY')} — {t('reste dû')}{' '}
        <MoneyValue value={call.outstanding} />
        {onlineBlocked ? (
          <Tag color="warning" style={{ marginInlineStart: 8 }}>
            {t('Paiement en ligne en cours ou en vérification : attendez son issue avant de le déclarer')}
          </Tag>
        ) : null}
        {call.pendingDeclaration ? (
          <Tag color="warning" style={{ marginInlineStart: 8 }}>
            {t('Déjà déclaré, en vérification')}
          </Tag>
        ) : null}
      </Checkbox>
    </div>
  );
}

function LotCalls({
  calls,
  selected,
  onCalls
}: {
  calls: CoOwnerChargeCall[];
  selected: string[];
  onCalls: (ids: string[]) => void;
}) {
  if (calls.length === 0) {
    return (
      <Typography.Text type="secondary">
        {t('Aucun appel ouvert sur ce lot : le paiement deviendra une avance.')}
      </Typography.Text>
    );
  }
  const total = calls.filter(c => selected.includes(c.id)).reduce((sum, c) => sum + c.outstanding, 0);
  const full = selected.length >= MAX_DECLARATION_CHARGE_CALLS_PER_LINE;
  return (
    <div>
      {calls.map(c => {
        const checked = selected.includes(c.id);
        return (
          <CallOption
            key={c.id}
            call={c}
            checked={checked}
            disabled={!checked && full}
            onChange={on => onCalls(on ? [...selected, c.id] : selected.filter(id => id !== c.id))}
          />
        );
      })}
      {selected.length === 0 ? (
        <Typography.Text type="secondary">
          {t('Aucun appel coché : le paiement sera affecté aux appels les plus anciens, puis en avance.')}
        </Typography.Text>
      ) : (
        <Typography.Text>
          {t('Total du reste dû des appels cochés :')} <MoneyValue value={total} />
        </Typography.Text>
      )}
    </div>
  );
}

function LotRow(props: LotRowProps): React.ReactElement {
  const { lot, state, calls, locked, blocked, showShare, error, onToggle, onShare, onCalls } = props;
  const checked = state.checkedLots.includes(lot.id);
  const label = t('Lot {{numero}}', { numero: lot.lotNumber });
  return (
    <div
      style={{
        border: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 8
      }}
    >
      {locked ? (
        <Typography.Text strong>{label}</Typography.Text>
      ) : (
        <Checkbox checked={checked} disabled={!checked && blocked} onChange={e => onToggle(e.target.checked)}>
          <strong>{label}</strong>
        </Checkbox>
      )}
      {checked ? (
        <div style={{ marginTop: 8 }}>
          {showShare ? (
            <Field id={`declaration-share-${lot.id}`} label={t('Part de ce lot')} required error={error}>
              <MoneyInput
                id={`declaration-share-${lot.id}`}
                ariaLabel={t('Part du lot {{numero}}', { numero: lot.lotNumber })}
                value={state.shares[lot.id] ?? null}
                onChange={onShare}
              />
            </Field>
          ) : null}
          <LotCalls calls={calls} selected={state.callIds[lot.id] ?? []} onCalls={onCalls} />
        </div>
      ) : null}
    </div>
  );
}

function SharesSummary({ state }: { state: FormState }): React.ReactElement | null {
  if (state.checkedLots.length < 2) return null;
  const sum = sumOfShares(state);
  const amount = state.amount ?? 0;
  const gap = amount - sum;
  return (
    <div data-testid="declaration-shares-summary">
      <Typography.Text strong>
        {t('Somme des parts : {{sum}} FCFA — montant : {{amount}} FCFA', {
          sum: groupDigits(sum),
          amount: groupDigits(amount)
        })}
      </Typography.Text>
      {gap !== 0 ? (
        <div role="alert">
          <Typography.Text type="danger">{t('La somme des parts doit être égale au montant envoyé.')}</Typography.Text>
          <div>
            <Typography.Text type="danger">
              {t('Écart restant : {{gap}} FCFA', { gap: groupDigits(gap) })}
            </Typography.Text>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface LotsSectionProps extends PatchProps {
  lots: DeclarationFormProps['lots'];
  calls: CoOwnerChargeCall[];
}

function LotsSection({ lots, calls, state, errors, patch }: LotsSectionProps): React.ReactElement {
  const multi = state.checkedLots.length > 1;
  const toggle = (id: string, on: boolean) =>
    patch({ checkedLots: on ? [...state.checkedLots, id] : state.checkedLots.filter(x => x !== id) });
  return (
    <div style={{ marginBottom: 16 }}>
      <Typography.Title level={5}>{t('Lots concernés')}</Typography.Title>
      {lots.map(lot => (
        <LotRow
          key={lot.id}
          lot={lot}
          state={state}
          calls={openCallsOf(calls, lot.id)}
          locked={lots.length === 1}
          blocked={state.checkedLots.length >= MAX_DECLARATION_LINES}
          showShare={multi}
          error={errors[`share-${lot.id}`]}
          onToggle={on => toggle(lot.id, on)}
          onShare={v => patch({ shares: { ...state.shares, [lot.id]: v } })}
          onCalls={ids => patch({ callIds: { ...state.callIds, [lot.id]: ids } })}
        />
      ))}
      <SharesSummary state={state} />
      {errors.lots ? (
        <div role="alert">
          <Typography.Text type="danger">{errors.lots}</Typography.Text>
        </div>
      ) : null}
    </div>
  );
}

interface ProofBlockProps {
  file: File | null;
  fileError: string | null;
  reading: boolean;
  required: boolean;
  aiAvailable: boolean;
  missing: boolean;
  notices: React.ReactNode;
  onPick: (file: File | null) => void;
}

function formatFileSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? t('{{n}} Mo', { n: (bytes / (1024 * 1024)).toFixed(1) })
    : t('{{n}} Ko', { n: Math.max(1, Math.round(bytes / 1024)) });
}

function ProofBlock(props: ProofBlockProps): React.ReactElement {
  const { file, fileError, reading, required, aiAvailable, missing, notices, onPick } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const title = aiAvailable ? t('1. Joignez la capture du SMS') : t('Capture du SMS ou de l’écran de confirmation');
  return (
    <div style={{ marginBottom: 16 }}>
      <Typography.Title level={5}>
        {title}{' '}
        {required ? (
          <span aria-hidden="true">*</span>
        ) : (
          <Typography.Text type="secondary">({t('facultative')})</Typography.Text>
        )}
      </Typography.Title>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={ACCEPT}
        data-testid="declaration-proof-input"
        onChange={e => {
          const picked = e.target.files?.[0] ?? null;
          e.target.value = '';
          if (picked) onPick(picked);
        }}
      />
      {file ? (
        <Space wrap>
          <Typography.Text>
            {file.name} ({formatFileSize(file.size)})
          </Typography.Text>
          <Button style={{ minHeight: TOUCH }} onClick={() => onPick(null)}>
            {t('Retirer')}
          </Button>
        </Space>
      ) : (
        <Button style={{ minHeight: TOUCH }} onClick={() => inputRef.current?.click()}>
          {t('Joindre une capture')}
        </Button>
      )}
      {reading ? (
        <div role="status">
          <Typography.Text type="secondary">{t('Lecture de la capture…')}</Typography.Text>
        </div>
      ) : null}
      {fileError ? (
        <div role="alert">
          <Typography.Text type="danger">{fileError}</Typography.Text>
        </div>
      ) : null}
      {missing ? (
        <div role="alert">
          <Typography.Text type="danger">{t('La capture est obligatoire pour cette copropriété.')}</Typography.Text>
        </div>
      ) : null}
      {notices}
    </div>
  );
}

function ReadingNotices({ reading, failure }: { reading: PaymentProofReading | null; failure: string | null }) {
  if (failure) return <Alert style={{ marginTop: 8 }} type="info" showIcon title={failure} />;
  if (!reading) return null;
  if (reading.quality !== 'OK') {
    return (
      <Alert
        style={{ marginTop: 8 }}
        type="info"
        showIcon
        title={t(
          "Cette capture n'a pas pu être lue comme une preuve de paiement : remplissez les champs. Vous pouvez la joindre quand même."
        )}
      />
    );
  }
  return (
    <>
      {reading.warnings.includes('RECIPIENT_NOT_A_RECEIVING_NUMBER') ? (
        <Alert
          style={{ marginTop: 8 }}
          type="warning"
          showIcon
          title={t(
            'La capture montre un autre numéro de réception que ceux de la copropriété. Vérifiez le numéro choisi.'
          )}
        />
      ) : null}
      {reading.warnings.includes('REFERENCE_ALREADY_DECLARED') ? (
        <Alert
          style={{ marginTop: 8 }}
          type="warning"
          showIcon
          title={t('Cette référence semble déjà avoir été déclarée. Vérifiez-la.')}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Contenu et envoi
// ---------------------------------------------------------------------------

function buildInput(props: DeclarationFormProps, state: FormState, readId: string | null): DeclarationInput {
  const comment = state.comment.trim();
  const input: DeclarationInput = {
    syndicId: props.syndicate.id,
    receivingNumberId: state.receivingNumberId as string,
    payerPhone: state.payerPhone.trim(),
    amount: state.amount as number,
    paidAt: dayjs(state.paidAt as Dayjs).format(),
    transactionReference: normalizeTransactionReference(state.reference),
    lines: props.lots
      .filter(lot => state.checkedLots.includes(lot.id))
      .map(lot => ({
        lotId: lot.id,
        amount: shareOf(state, lot.id) as number,
        chargeCallIds: state.callIds[lot.id] ?? []
      }))
  };
  if (comment) input.comment = comment;
  if (readId) input.proofReadId = readId;
  return input;
}

function useProofReading(props: DeclarationFormProps, applyToForm: (r: PaymentProofReading) => void) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<PaymentProofReading | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const token = useRef(0);

  const reset = () => {
    token.current += 1;
    setResult(null);
    setFailure(null);
    setReading(false);
  };

  const cancelPending = () => {
    token.current += 1;
    setReading(false);
  };

  const read = async (picked: File) => {
    const mine = ++token.current;
    setReading(true);
    try {
      const response = await readPaymentProof(props.syndicate.id, picked);
      if (mine !== token.current) return;
      setResult(response);
      applyToForm(response);
    } catch (e) {
      if (mine !== token.current) return;
      const parsed = parseDeclarationApiError(e, aiReadFailedMessage());
      setFailure(parsed.status === 429 ? parsed.message : aiReadFailedMessage());
    } finally {
      if (mine === token.current) setReading(false);
    }
  };

  const pick = (picked: File | null) => {
    reset();
    setFile(null);
    const problem = picked ? validateProofFile(picked) : null;
    setFileError(problem);
    if (!picked || problem) return;
    setFile(picked);
    if (props.availability.aiPrefillAvailable) void read(picked);
  };

  return { file, fileError, reading, result, failure, pick, cancelPending, forgetResult: () => setResult(null) };
}

function DeclarationDrawer(props: DeclarationFormProps): React.ReactElement {
  const { open, onClose, onSubmitted, syndicate, availability, lots, calls } = props;
  const numbers = activeNumbers(availability);
  const [state, setState] = useState<FormState>(() => initialState(props));
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [refError, setRefError] = useState<string | undefined>();
  const submitLock = useRef(false);

  const patch = (change: Partial<FormState>) => {
    if (change.reference !== undefined) setRefError(undefined);
    setState(prev => ({ ...prev, ...change }));
  };
  const ctx: ReadingContext = {
    maxAmount: availability.maxAmount,
    defaultPayerPhone: props.defaultPayerPhone,
    numberIds: numbers.map(n => n.id)
  };
  const proof = useProofReading(props, r => setState(prev => applyReading(prev, r, ctx)));

  const errors: Errors = attempted ? validateForm(state, availability) : {};
  if (refError) errors.reference = refError;
  const readId = proof.result?.readId ?? null;
  const proofMissing = attempted && availability.proofRequired && !proof.file;

  const submit = async () => {
    if (submitLock.current) return;
    setAttempted(true);
    setSubmitError(null);
    if (Object.keys(validateForm(state, availability)).length > 0 || (availability.proofRequired && !proof.file))
      return;
    submitLock.current = true;
    setSubmitting(true);
    proof.cancelPending();
    try {
      const declaration = await createDeclaration(buildInput(props, state, readId), readId ? null : proof.file);
      feedback.success(t('Déclaration envoyée au syndic. Elle sera vérifiée avant d’être portée à votre compte.'));
      onSubmitted(declaration);
      onClose();
    } catch (e) {
      handleSubmitError(e);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const handleSubmitError = (e: unknown) => {
    const parsed = parseDeclarationApiError(e, t("La déclaration n'a pas pu être envoyée."));
    if (parsed.code === 'PROOF_READ_INVALID') {
      proof.forgetResult();
      setSubmitError(t('La lecture de la capture a expiré : envoyez de nouveau la déclaration.'));
      return;
    }
    if (parsed.code === 'DECLARATION_REFERENCE_USED') setRefError(parsed.message);
    setSubmitError(parsed.message);
  };

  const proofBlock = (
    <ProofBlock
      file={proof.file}
      fileError={proof.fileError}
      reading={proof.reading}
      required={availability.proofRequired}
      aiAvailable={availability.aiPrefillAvailable}
      missing={proofMissing}
      notices={<ReadingNotices reading={proof.result} failure={proof.failure} />}
      onPick={proof.pick}
    />
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      size="min(100vw, 640px)"
      destroyOnHidden
      title={t("J'ai payé par mobile money")}
      footer={
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button style={{ minHeight: TOUCH }} onClick={onClose}>
            {t('Annuler')}
          </Button>
          <Button type="primary" style={{ minHeight: TOUCH }} loading={submitting} onClick={() => void submit()}>
            {t('Envoyer la déclaration')}
          </Button>
        </Space>
      }
    >
      {submitError ? <Alert type="error" showIcon style={{ marginBottom: 16 }} title={submitError} /> : null}
      <Typography.Paragraph type="secondary">{syndicate.name}</Typography.Paragraph>
      {availability.aiPrefillAvailable ? proofBlock : null}
      <ReceivingNumberField
        state={state}
        errors={errors}
        patch={patch}
        numbers={numbers}
        instructions={availability.payerInstructions}
      />
      <AmountFields state={state} errors={errors} patch={patch} maxAmount={availability.maxAmount} />
      <PaidAtAndReference state={state} errors={errors} patch={patch} />
      <LotsSection lots={lots} calls={calls} state={state} errors={errors} patch={patch} />
      <Field id="declaration-comment" label={t('Commentaire (facultatif)')}>
        <Input.TextArea
          id="declaration-comment"
          maxLength={500}
          showCount
          rows={3}
          value={state.comment}
          onChange={e => patch({ comment: e.target.value })}
        />
      </Field>
      {availability.aiPrefillAvailable ? null : proofBlock}
    </Drawer>
  );
}

export function DeclarationForm(props: DeclarationFormProps): React.ReactElement {
  // Chaque ouverture repart d'un formulaire vierge (nouvel état par session).
  const [wasOpen, setWasOpen] = useState(props.open);
  const [session, setSession] = useState(0);
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) setSession(s => s + 1);
  }
  return <DeclarationDrawer key={session} {...props} />;
}

export default DeclarationForm;
