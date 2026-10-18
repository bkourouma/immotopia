import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  DatePicker,
  Descriptions,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Typography
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { formatMoney } from '../../primitives';
import {
  ApproveDeclarationBody,
  ApproveDeclarationResponse,
  SyndicDeclarationRow,
  approveSyndicDeclaration
} from '../../../services/syndic-declared-payment-service';
import { t } from '../../../i18n/t';
import {
  DECLARATION_NOT_PENDING_CODE,
  NOTE_MAX_LENGTH,
  NOTE_MIN_LENGTH,
  alertView,
  apiErrorCode,
  apiErrorMessage,
  formatDateTime,
  formatPhone,
  operatorLabel
} from './helpers';

const { Text } = Typography;

export interface ApproveModalProps {
  tenantId: string;
  syndicId: string;
  /** Déclaration à valider ; `null` = modale fermée. */
  declaration: SyndicDeclarationRow | null;
  onClose: () => void;
  onApproved: (result: ApproveDeclarationResponse) => void;
  /** La déclaration n'est plus `PENDING` : la page recharge. */
  onStale?: () => void;
}

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every(id => b.includes(id));

/**
 * Validation d'une déclaration de paiement mobile money (contrat §1.9, règles
 * R17 à R19). Par défaut « telle que déclarée » (corps sans `correction`) ; le
 * mode correction envoie toutes les lignes avec le montant retenu et exige une
 * note, montrée au copropriétaire.
 */
export const ApproveModal: React.FC<ApproveModalProps> = ({
  tenantId,
  syndicId,
  declaration,
  onClose,
  onApproved,
  onStale
}) => {
  const { message } = App.useApp();
  const [correcting, setCorrecting] = useState(false);
  const [paidAt, setPaidAt] = useState<Dayjs | null>(null);
  const [amounts, setAmounts] = useState<Record<string, number | null>>({});
  const [calls, setCalls] = useState<Record<string, string[]>>({});
  // Appels choisis PAR le gestionnaire : seuls ceux-là partent. Sans choix, la liste affichée n'est qu'indicative
  // et la ligne garde son affectation (« plus anciens d'abord » si la déclaration n'en nommait aucun).
  const [callsTouched, setCallsTouched] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yearClosed = declaration?.alerts.some(alert => alert.kind === 'FISCAL_YEAR_CLOSED') ?? false;

  useEffect(() => {
    // Remise à zéro à chaque ouverture ; l'exercice clos impose la correction.
    setCorrecting(declaration?.alerts.some(alert => alert.kind === 'FISCAL_YEAR_CLOSED') ?? false);
    setPaidAt(declaration ? dayjs(declaration.paidAt) : null);
    setAmounts(Object.fromEntries((declaration?.lines ?? []).map(line => [line.id, line.amount])));
    setCalls(Object.fromEntries((declaration?.lines ?? []).map(line => [line.id, line.chargeCalls.map(c => c.id)])));
    setCallsTouched({});
    setNote('');
    setError(null);
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declaration?.id]);

  const view = useMemo(() => {
    if (!declaration) return null;
    const dateChanged = !!paidAt && !paidAt.isSame(dayjs(declaration.paidAt));
    const linesChanged = declaration.lines.some(
      line =>
        amounts[line.id] !== line.amount ||
        (callsTouched[line.id] === true &&
          !sameSet(
            calls[line.id] ?? [],
            line.chargeCalls.map(c => c.id)
          ))
    );
    const accepted = declaration.lines.map(line => amounts[line.id]);
    const amountsValid = accepted.every(value => typeof value === 'number' && value >= 0);
    const total = accepted.reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
    return {
      dateChanged,
      linesChanged,
      amountsValid,
      total,
      hasPositive: total > 0,
      overDeclared: total > declaration.amount
    };
  }, [declaration, paidAt, amounts, calls, callsTouched]);

  if (!declaration || !view) return null;

  const noteTrimmed = note.trim();
  const realCorrection = correcting && (view.dateChanged || view.linesChanged);
  const noteLengthOk = noteTrimmed.length >= NOTE_MIN_LENGTH && noteTrimmed.length <= NOTE_MAX_LENGTH;
  const noteOk = realCorrection ? noteLengthOk : noteTrimmed.length === 0 || noteLengthOk;
  const dateOk = !yearClosed || (!!paidAt && view.dateChanged);
  const linesOk = !correcting || (view.amountsValid && view.hasPositive && !view.overDeclared);
  const canSubmit = noteOk && dateOk && linesOk;

  const buildBody = (): ApproveDeclarationBody => {
    const body: ApproveDeclarationBody = {};
    if (correcting) {
      if (!realCorrection) {
        body.correction = null;
      } else {
        body.correction = {
          ...(view.dateChanged && paidAt ? { paidAt: paidAt.format() } : {}),
          ...(view.linesChanged
            ? {
                lines: declaration.lines.map(line => ({
                  lineId: line.id,
                  acceptedAmount: amounts[line.id] ?? 0,
                  // Choix explicite du gestionnaire seulement ([] = plus anciens d'abord) ; sinon l'affectation de la ligne reste.
                  ...(callsTouched[line.id] ? { chargeCallIds: calls[line.id] ?? [] } : {})
                }))
              }
            : {})
        };
      }
    }
    if (noteTrimmed) body.note = noteTrimmed;
    return body;
  };

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await approveSyndicDeclaration(tenantId, syndicId, declaration.id, buildBody());
      const numbers = result.documents.map(doc => doc.number).join(', ');
      message.success(
        numbers
          ? t('Déclaration validée. Documents émis : {{numeros}}', { numeros: numbers })
          : t('Déclaration validée')
      );
      onApproved(result);
    } catch (e) {
      if (apiErrorCode(e) === DECLARATION_NOT_PENDING_CODE) {
        message.warning(t('Cette déclaration vient d’être traitée ou annulée.'));
        onStale?.();
      } else {
        setError(apiErrorMessage(e, t('La validation n’a pas pu être enregistrée')));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Excédent ou solde restant d'une ligne, mesuré contre le reste dû des appels retenus (jamais contre le montant
  // déclaré). Sans appel sélectionné (« plus anciens d'abord »), le reste dû n'est pas connu ici : aucun message.
  const lineBalance = (line: SyndicDeclarationRow['lines'][number]) => {
    const accepted = amounts[line.id];
    const selected = calls[line.id] ?? [];
    if (typeof accepted !== 'number' || accepted <= 0 || selected.length === 0) return null;
    const due = line.chargeCalls.filter(call => selected.includes(call.id)).reduce((sum, c) => sum + c.remainingDue, 0);
    if (accepted > due) return { kind: 'excess' as const, amount: accepted - due };
    if (accepted < due) return { kind: 'partial' as const, amount: due - accepted };
    return null;
  };

  return (
    <Modal
      open
      title={t('Valider la déclaration de paiement')}
      onCancel={onClose}
      onOk={() => void submit()}
      okText={realCorrection ? t('Valider avec correction') : t('Valider telle que déclarée')}
      cancelText={t('Annuler')}
      okButtonProps={{ disabled: !canSubmit, loading: submitting }}
      cancelButtonProps={{ disabled: submitting }}
      destroyOnClose
      width={680}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {declaration.alerts.map((alert, index) => {
          const { severity, text } = alertView(alert, declaration);
          return <Alert key={`${alert.kind}-${index}`} type={severity} showIcon message={text} />;
        })}

        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={t('Déclarant')}>{declaration.declaredBy.name}</Descriptions.Item>
          <Descriptions.Item label={t('Numéro de réception')}>
            {operatorLabel(declaration.receivingNumber.operator)} ·{' '}
            {formatPhone(declaration.receivingNumber.phoneNumber)}
          </Descriptions.Item>
          <Descriptions.Item label={t('Payeur')}>{formatPhone(declaration.payerPhone)}</Descriptions.Item>
          <Descriptions.Item label={t('Référence')}>{declaration.transactionReference}</Descriptions.Item>
          <Descriptions.Item label={t('Montant déclaré')}>{formatMoney(declaration.amount)}</Descriptions.Item>
          <Descriptions.Item label={t('Date et heure déclarées')}>
            {formatDateTime(declaration.paidAt)}
          </Descriptions.Item>
        </Descriptions>

        <Space align="center" wrap>
          <Switch
            checked={correcting}
            disabled={yearClosed || submitting}
            onChange={setCorrecting}
            aria-label={t('Corriger avant de valider')}
          />
          <Text strong>{t('Corriger avant de valider')}</Text>
        </Space>

        {correcting ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <label htmlFor="approve-paid-at">
                <Text strong>{t('Date et heure du paiement retenues')}</Text>
              </label>
              <DatePicker
                id="approve-paid-at"
                showTime={{ format: 'HH:mm' }}
                format="DD/MM/YYYY HH:mm"
                allowClear={false}
                style={{ display: 'block', marginBlockStart: 8, width: '100%' }}
                value={paidAt}
                onChange={value => setPaidAt(value)}
                disabledDate={date => date.isAfter(dayjs(), 'day')}
              />
              {yearClosed ? (
                <Text type={dateOk ? 'secondary' : 'danger'} style={{ fontSize: 12 }}>
                  {t('La date déclarée tombe dans un exercice clos : indiquez une date dans un exercice ouvert.')}
                </Text>
              ) : null}
            </div>

            {declaration.lines.map(line => (
              <div key={line.id} style={{ borderBlockEnd: '1px solid #f0f0f0', paddingBlockEnd: 12 }}>
                <Text strong>{t('Lot {{lot}}', { lot: line.lot.lotNumber })}</Text>
                <div style={{ marginBlockStart: 4 }}>
                  <Text type="secondary">
                    {t('Part déclarée : {{montant}}', { montant: formatMoney(line.amount) })}
                  </Text>
                </div>
                <label htmlFor={`approve-amount-${line.id}`}>
                  <Text>{t('Montant retenu')}</Text>
                </label>
                <InputNumber
                  id={`approve-amount-${line.id}`}
                  min={0}
                  precision={0}
                  step={1000}
                  style={{ display: 'block', width: '100%', marginBlockStart: 4 }}
                  value={amounts[line.id] ?? null}
                  onChange={value => setAmounts(prev => ({ ...prev, [line.id]: value }))}
                />
                {amounts[line.id] === 0 ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('Ligne non encaissée')}
                  </Text>
                ) : null}
                <div style={{ marginBlockStart: 8 }}>
                  <label htmlFor={`approve-calls-${line.id}`}>
                    <Text>{t('Appels de charges visés')}</Text>
                  </label>
                  <Select
                    id={`approve-calls-${line.id}`}
                    mode="multiple"
                    allowClear
                    style={{ width: '100%', marginBlockStart: 4 }}
                    placeholder={t('Plus anciens d’abord')}
                    value={calls[line.id] ?? []}
                    onChange={value => {
                      setCalls(prev => ({ ...prev, [line.id]: value }));
                      setCallsTouched(prev => ({ ...prev, [line.id]: true }));
                    }}
                    options={line.chargeCalls.map(call => ({
                      value: call.id,
                      label: t('{{periode}} · reste dû {{montant}}', {
                        periode: call.period,
                        montant: formatMoney(call.remainingDue)
                      })
                    }))}
                  />
                </div>
                {(() => {
                  const balance = lineBalance(line);
                  if (!balance) return null;
                  return (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {balance.kind === 'excess'
                        ? t('L’excédent de {{montant}} deviendra une avance du lot {{lot}}.', {
                            montant: formatMoney(balance.amount),
                            lot: line.lot.lotNumber
                          })
                        : t('Paiement partiel : il restera {{montant}} dû sur le lot {{lot}}.', {
                            montant: formatMoney(balance.amount),
                            lot: line.lot.lotNumber
                          })}
                    </Text>
                  );
                })()}
              </div>
            ))}

            <div>
              <Text strong>
                {t('Total retenu : {{retenu}} sur {{declare}} déclarés', {
                  retenu: formatMoney(view.total),
                  declare: formatMoney(declaration.amount)
                })}
              </Text>
              {view.amountsValid && !view.hasPositive ? (
                <div>
                  <Text type="danger">{t('Au moins une ligne doit avoir un montant retenu supérieur à 0.')}</Text>
                </div>
              ) : null}
              {view.overDeclared ? (
                <div>
                  <Text type="danger">{t('Le total retenu ne peut pas dépasser le montant déclaré.')}</Text>
                </div>
              ) : null}
            </div>
          </Space>
        ) : null}

        <div>
          <label htmlFor="approve-note">
            <Text strong>{realCorrection ? t('Note (obligatoire)') : t('Note (facultative)')}</Text>
          </label>
          <Input.TextArea
            id="approve-note"
            style={{ marginBlockStart: 8 }}
            rows={3}
            maxLength={NOTE_MAX_LENGTH}
            showCount
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder={t('Entre 10 et 500 caractères')}
          />
          {realCorrection ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('Cette note sera montrée au copropriétaire, avec le montant déclaré et le montant retenu.')}
            </Text>
          ) : null}
          {!noteOk ? (
            <div>
              <Text type="danger" style={{ fontSize: 12 }}>
                {t('La note doit comporter entre 10 et 500 caractères.')}
              </Text>
            </div>
          ) : null}
        </div>

        {error ? <Alert type="error" showIcon message={error} /> : null}
      </Space>
    </Modal>
  );
};

export default ApproveModal;
