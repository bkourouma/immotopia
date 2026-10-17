import React, { useEffect, useState } from 'react';
import { Alert, DatePicker, Form, Input, Modal } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import type { RemittanceLineDto, SettleAllResult } from '../../../services/direct-debit-service';
import { dateFormat } from '../../../i18n/format';
import { parseIsoDay, startOfDay, toIsoDay } from './business-days';
import { formatDay } from './direct-debit-shared';
import { t } from '../../../i18n/t';

/**
 * Fenêtres de constat du retour banque (spec 042, P3, §8.3, §8.4 et §8.10) :
 * règlement d'une ligne, rejet (y compris tardif) et règlement de toute la
 * remise. La date est bornée entre la date de prélèvement et aujourd'hui ;
 * l'API reste juge.
 */

const CODE_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;
const MAX_CODE_LENGTH = 20;
const MAX_REASON_LENGTH = 500;

interface DateBounds {
  collectionDate: string;
  /** « Aujourd'hui » ; injectable pour les tests. */
  today?: Date;
}

function boundsOf({ collectionDate, today }: DateBounds): { min: Date | null; max: Date } {
  return { min: parseIsoDay(collectionDate), max: startOfDay(today ?? new Date()) };
}

/** Date par défaut : la date de prélèvement (ramenée à aujourd'hui si elle est encore à venir). */
function defaultDay(bounds: DateBounds): Dayjs | null {
  const { min, max } = boundsOf(bounds);
  if (!min) return null;
  return dayjs(min.getTime() > max.getTime() ? max : min);
}

const ReturnDateField: React.FC<{
  label: string;
  value: Dayjs | null;
  onChange: (value: Dayjs | null) => void;
  bounds: DateBounds;
}> = ({ label, value, onChange, bounds }) => {
  const { min, max } = boundsOf(bounds);
  const tooEarly = min !== null && min.getTime() > max.getTime();
  return (
    <Form.Item
      label={label}
      required
      extra={t("Entre la date de prélèvement ({{date}}) et aujourd'hui.", { date: formatDay(bounds.collectionDate) })}
      validateStatus={tooEarly ? 'error' : undefined}
      help={tooEarly ? t("La date de prélèvement n'est pas encore passée : aucun constat n'est possible.") : undefined}
    >
      <DatePicker
        style={{ width: '100%' }}
        value={value}
        format={dateFormat('short')}
        allowClear={false}
        onChange={next => onChange(next)}
        disabledDate={current => {
          const day = startOfDay(current.toDate()).getTime();
          return (min !== null && day < min.getTime()) || day > max.getTime();
        }}
      />
    </Form.Item>
  );
};

/** La date choisie est dans les bornes (sinon le bouton de confirmation reste inactif). */
function dateIsValid(value: Dayjs | null, bounds: DateBounds): boolean {
  if (!value) return false;
  const { min, max } = boundsOf(bounds);
  const day = startOfDay(value.toDate()).getTime();
  return (min === null || day >= min.getTime()) && day <= max.getTime();
}

interface BaseModalProps extends DateBounds {
  open: boolean;
  loading?: boolean;
  /** Message d'erreur de l'API, affiché dans la fenêtre. */
  error?: string | null;
  onCancel: () => void;
}

// --- Constater le règlement d'une ligne ---------------------------------------------

export const SettleLineModal: React.FC<
  BaseModalProps & { line: RemittanceLineDto | null; onSubmit: (settledAt: string) => void }
> = ({ open, line, collectionDate, today, loading, error, onCancel, onSubmit }) => {
  const [date, setDate] = useState<Dayjs | null>(null);
  const bounds = { collectionDate, today };

  useEffect(() => {
    if (open) setDate(defaultDay({ collectionDate, today }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, collectionDate, line?.id]);

  return (
    <Modal
      open={open}
      title={t('Constater le règlement de {{reference}}', { reference: line?.reference ?? '' })}
      okText={t('Constater le règlement')}
      cancelText={t('Fermer')}
      okButtonProps={{ disabled: !dateIsValid(date, bounds), loading }}
      onOk={() => date && onSubmit(toIsoDay(date.toDate()))}
      onCancel={onCancel}
      destroyOnHidden
    >
      <p>
        {t(
          'Le prélèvement a été payé par la banque : un encaissement est enregistré sur le bail et sa quittance est émise.'
        )}
      </p>
      <Form layout="vertical">
        <ReturnDateField label={t('Date de valeur')} value={date} onChange={setDate} bounds={bounds} />
      </Form>
      {error && <Alert type="error" showIcon message={error} />}
    </Modal>
  );
};

// --- Constater le rejet d'une ligne (ou un rejet tardif) -----------------------------

export const RejectLineModal: React.FC<
  BaseModalProps & {
    line: RemittanceLineDto | null;
    /** Rejet d'une ligne déjà constatée réglée. */
    late: boolean;
    onSubmit: (input: { rejectedAt: string; code?: string; reason?: string }) => void;
  }
> = ({ open, line, late, collectionDate, today, loading, error, onCancel, onSubmit }) => {
  const [date, setDate] = useState<Dayjs | null>(null);
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const bounds = { collectionDate, today };

  useEffect(() => {
    if (open) {
      setDate(defaultDay({ collectionDate, today }));
      setCode('');
      setReason('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, collectionDate, line?.id]);

  const trimmedCode = code.trim();
  const trimmedReason = reason.trim();
  const codeInvalid = trimmedCode !== '' && !CODE_PATTERN.test(trimmedCode);
  const missing = trimmedCode === '' && trimmedReason === '';

  return (
    <Modal
      open={open}
      title={
        late
          ? t('Constater un rejet tardif de {{reference}}', { reference: line?.reference ?? '' })
          : t('Constater le rejet de {{reference}}', { reference: line?.reference ?? '' })
      }
      okText={late ? t('Constater le rejet tardif') : t('Constater le rejet')}
      cancelText={t('Fermer')}
      okButtonProps={{
        danger: true,
        disabled: !dateIsValid(date, bounds) || missing || codeInvalid,
        loading
      }}
      onOk={() =>
        date &&
        onSubmit({
          rejectedAt: toIsoDay(date.toDate()),
          ...(trimmedCode ? { code: trimmedCode } : {}),
          ...(trimmedReason ? { reason: trimmedReason } : {})
        })
      }
      onCancel={onCancel}
      destroyOnHidden
    >
      {late && (
        <Alert
          style={{ marginBottom: 12 }}
          type="warning"
          showIcon
          message={t(
            "Cette ligne est déjà constatée réglée : l'encaissement enregistré et sa quittance seront annulés."
          )}
        />
      )}
      <p>
        {t(
          'Des frais de rejet peuvent être refacturés au locataire selon le réglage du créancier. Le mandat est suspendu automatiquement après un certain nombre de rejets consécutifs.'
        )}
      </p>
      <Form layout="vertical">
        <ReturnDateField label={t('Date du rejet')} value={date} onChange={setDate} bounds={bounds} />
        <Form.Item
          label={t('Code de rejet')}
          validateStatus={codeInvalid ? 'error' : undefined}
          help={codeInvalid ? t('Lettres, chiffres, tiret et tiret bas seulement (20 caractères au plus).') : undefined}
        >
          <Input
            maxLength={MAX_CODE_LENGTH}
            value={code}
            onChange={event => setCode(event.target.value)}
            dir="ltr"
            aria-label={t('Code de rejet')}
          />
        </Form.Item>
        <Form.Item label={t('Motif du rejet')} extra={t('Le code ou le motif est obligatoire (au moins un des deux).')}>
          <Input.TextArea
            rows={3}
            maxLength={MAX_REASON_LENGTH}
            showCount
            value={reason}
            onChange={event => setReason(event.target.value)}
            aria-label={t('Motif du rejet')}
          />
        </Form.Item>
      </Form>
      {error && <Alert type="error" showIcon message={error} />}
    </Modal>
  );
};

// --- Tout constater réglé -------------------------------------------------------------

export const SettleAllModal: React.FC<
  BaseModalProps & {
    pendingCount: number;
    /** Résultat de l'action : la fenêtre passe de la confirmation au compte rendu. */
    result: SettleAllResult | null;
    onSubmit: (settledAt: string) => void;
  }
> = ({ open, pendingCount, result, collectionDate, today, loading, error, onCancel, onSubmit }) => {
  const [date, setDate] = useState<Dayjs | null>(null);
  const bounds = { collectionDate, today };

  useEffect(() => {
    if (open) setDate(defaultDay({ collectionDate, today }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, collectionDate]);

  if (result) {
    return (
      <Modal
        open={open}
        title={t('Constat de la remise')}
        footer={null}
        cancelText={t('Fermer')}
        onCancel={onCancel}
        destroyOnHidden
      >
        <Alert
          type={result.failed.length > 0 ? 'warning' : 'success'}
          showIcon
          message={
            result.settled === 1
              ? t('1 ligne constatée réglée.')
              : t('{{n}} lignes constatées réglées.', { n: result.settled })
          }
          description={
            result.failed.length > 0 ? (
              <div>
                <div>
                  {result.failed.length === 1
                    ? t("1 ligne n'a pas pu être constatée :")
                    : t("{{n}} lignes n'ont pas pu être constatées :", { n: result.failed.length })}
                </div>
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  {result.failed.map(item => (
                    <li key={item.lineId}>
                      <bdi dir="ltr">{item.reference}</bdi> : {item.error}
                    </li>
                  ))}
                </ul>
              </div>
            ) : undefined
          }
        />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title={t('Tout constater réglé')}
      okText={t('Tout constater réglé')}
      cancelText={t('Fermer')}
      okButtonProps={{ disabled: !dateIsValid(date, bounds) || pendingCount === 0, loading }}
      onOk={() => date && onSubmit(toIsoDay(date.toDate()))}
      onCancel={onCancel}
      destroyOnHidden
    >
      <p>
        {pendingCount === 1
          ? t(
              "Constater réglée la ligne encore en attente de cette remise ? Un encaissement et sa quittance sont enregistrés. Cette action ne s'annule que par un rejet tardif."
            )
          : t(
              "Constater réglées les {{n}} lignes encore en attente de cette remise, à la même date de valeur ? Un encaissement et sa quittance sont enregistrés pour chacune. Cette action ne s'annule que par un rejet tardif.",
              { n: pendingCount }
            )}
      </p>
      <Form layout="vertical">
        <ReturnDateField label={t('Date de valeur')} value={date} onChange={setDate} bounds={bounds} />
      </Form>
      {error && <Alert type="error" showIcon message={error} />}
    </Modal>
  );
};
