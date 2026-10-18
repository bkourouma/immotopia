import React, { useEffect, useState } from 'react';
import { Alert, DatePicker, Form, Input, Modal } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import type { CreditorDto, RemittanceWithSkipped } from '../../../services/direct-debit-service';
import { createSyndicRemittance } from '../../../services/syndic-direct-debit-service';
import { dateFormat } from '../../../i18n/format';
import {
  firstPossibleCollectionDate,
  isCollectionDateAllowed,
  toIsoDay
} from '../../rental/direct-debit/business-days';
import { apiErrorMessage } from '../../rental/direct-debit/direct-debit-shared';
import { t } from '../../../i18n/t';

interface SyndicPrepareRemittanceModalProps {
  tenantId: string;
  syndicId: string;
  open: boolean;
  /** Créancier du syndicat : il fixe le jour de collecte et le délai d'avis. */
  creditor: CreditorDto | null | undefined;
  /** « Aujourd'hui » ; injectable pour les tests. */
  today?: Date;
  onClose: () => void;
  onCreated: (result: RemittanceWithSkipped) => void;
}

const MAX_NOTES_LENGTH = 2000;

/**
 * « Préparer une remise » du syndicat (spec 042, P4, §9.6) : date de
 * prélèvement et notes. Pas de choix de créancier : c'est celui du syndicat.
 */
export const SyndicPrepareRemittanceModal: React.FC<SyndicPrepareRemittanceModalProps> = ({
  tenantId,
  syndicId,
  open,
  creditor,
  today,
  onClose,
  onCreated
}) => {
  const [date, setDate] = useState<Dayjs | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reference = today ?? new Date();

  useEffect(() => {
    if (!open) return;
    const proposed = creditor
      ? firstPossibleCollectionDate(creditor.collectionDay, creditor.prenotificationBusinessDays, today ?? new Date())
      : null;
    setDate(proposed ? dayjs(proposed) : null);
    setNotes('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, creditor?.id, creditor?.collectionDay, creditor?.prenotificationBusinessDays]);

  const handleSubmit = async () => {
    if (!date) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createSyndicRemittance(tenantId, syndicId, {
        collectionDate: toIsoDay(date.toDate()),
        ...(notes.trim() ? { notes: notes.trim() } : {})
      });
      onCreated(result);
    } catch (err) {
      setError(apiErrorMessage(err, t('Erreur lors de la préparation de la remise')));
    } finally {
      setBusy(false);
    }
  };

  const days = creditor?.prenotificationBusinessDays ?? 0;

  return (
    <Modal
      open={open}
      title={t('Préparer une remise')}
      okText={t('Préparer')}
      cancelText={t('Fermer')}
      okButtonProps={{ disabled: !creditor || !creditor.isActive || !date, loading: busy }}
      onOk={() => void handleSubmit()}
      onCancel={onClose}
      destroyOnHidden
    >
      {!creditor?.isActive && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('Le compte de prélèvement du syndicat doit être configuré et actif.')}
        />
      )}
      <Form layout="vertical">
        <Form.Item
          label={t('Date de prélèvement')}
          required
          extra={
            creditor
              ? days <= 1
                ? t('Avis de prélèvement : {{n}} jour ouvré avant la date de prélèvement.', { n: days })
                : t('Avis de prélèvement : {{n}} jours ouvrés avant la date de prélèvement.', { n: days })
              : undefined
          }
        >
          <DatePicker
            style={{ width: '100%' }}
            value={date}
            format={dateFormat('short')}
            disabled={!creditor}
            onChange={value => setDate(value)}
            disabledDate={current => !creditor || !isCollectionDateAllowed(current.toDate(), reference, days)}
          />
        </Form.Item>
        <Form.Item label={t('Notes')}>
          <Input.TextArea
            rows={2}
            maxLength={MAX_NOTES_LENGTH}
            showCount
            value={notes}
            onChange={event => setNotes(event.target.value)}
          />
        </Form.Item>
      </Form>
      {error && <Alert type="error" showIcon message={error} />}
    </Modal>
  );
};
