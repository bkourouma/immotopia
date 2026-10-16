import React, { useEffect, useMemo, useState } from 'react';
import { Alert, DatePicker, Form, Input, Modal, Select } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { createRemittance, CreditorDto, RemittanceWithSkipped } from '../../../services/direct-debit-service';
import { dateFormat } from '../../../i18n/format';
import { firstPossibleCollectionDate, isCollectionDateAllowed, toIsoDay } from './business-days';
import { apiErrorMessage } from './direct-debit-shared';
import { t } from '../../../i18n/t';

interface PrepareRemittanceModalProps {
  tenantId: string;
  open: boolean;
  /** Tous les créanciers : seuls les actifs sont proposés. */
  creditors: CreditorDto[];
  /** Créancier présélectionné (filtre de la liste). */
  initialCreditorId?: string;
  /** « Aujourd'hui » ; injectable pour les tests. */
  today?: Date;
  onClose: () => void;
  onCreated: (result: RemittanceWithSkipped) => void;
}

/** Date proposée : premier jour de collecte du créancier encore possible. */
function defaultDateFor(creditor: CreditorDto | undefined, today: Date): Dayjs | null {
  if (!creditor) return null;
  const date = firstPossibleCollectionDate(creditor.collectionDay, creditor.prenotificationBusinessDays, today);
  return date ? dayjs(date) : null;
}

/**
 * « Préparer une remise » (spec 042, P2, §7.10) : créancier actif, date de
 * prélèvement, notes. Les dates trop proches pour la prénotification sont
 * désactivées ; l'API reste juge.
 */
export const PrepareRemittanceModal: React.FC<PrepareRemittanceModalProps> = ({
  tenantId,
  open,
  creditors,
  initialCreditorId,
  today,
  onClose,
  onCreated
}) => {
  const activeCreditors = useMemo(() => creditors.filter(creditor => creditor.isActive), [creditors]);
  const [creditorId, setCreditorId] = useState<string | undefined>();
  const [date, setDate] = useState<Dayjs | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clé stable : un tableau recréé à chaque rendu ne doit pas réinitialiser la saisie.
  const activeKey = activeCreditors.map(item => item.id).join(',');
  const creditor = activeCreditors.find(item => item.id === creditorId);
  const reference = today ?? new Date();

  // À l'ouverture : créancier unique ou présélectionné, date proposée.
  useEffect(() => {
    if (!open) return;
    const preferred =
      activeCreditors.find(item => item.id === initialCreditorId) ??
      (activeCreditors.length === 1 ? activeCreditors[0] : undefined);
    setCreditorId(preferred?.id);
    setDate(defaultDateFor(preferred, today ?? new Date()));
    setNotes('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeKey, initialCreditorId]);

  const handleCreditorChange = (value: string) => {
    setCreditorId(value);
    setDate(
      defaultDateFor(
        activeCreditors.find(item => item.id === value),
        reference
      )
    );
    setError(null);
  };

  const handleSubmit = async () => {
    if (!creditorId || !date) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createRemittance(tenantId, {
        creditorId,
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

  return (
    <Modal
      open={open}
      title={t('Préparer une remise')}
      okText={t('Préparer')}
      cancelText={t('Fermer')}
      okButtonProps={{ disabled: !creditorId || !date, loading: busy }}
      onOk={() => void handleSubmit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form layout="vertical">
        <Form.Item label={t('Créancier')} required>
          <Select
            placeholder={t('Choisir un créancier')}
            value={creditorId}
            onChange={handleCreditorChange}
            options={activeCreditors.map(item => ({ value: item.id, label: item.label }))}
            notFoundContent={t('Aucun créancier actif')}
          />
        </Form.Item>
        <Form.Item
          label={t('Date de prélèvement')}
          required
          extra={
            creditor
              ? t('Prénotification : {{n}} jours ouvrés avant la date de prélèvement.', {
                  n: creditor.prenotificationBusinessDays
                })
              : undefined
          }
        >
          <DatePicker
            style={{ width: '100%' }}
            value={date}
            format={dateFormat('short')}
            disabled={!creditor}
            onChange={value => setDate(value)}
            disabledDate={current =>
              !creditor || !isCollectionDateAllowed(current.toDate(), reference, creditor.prenotificationBusinessDays)
            }
          />
        </Form.Item>
        <Form.Item label={t('Notes')}>
          <Input.TextArea rows={2} value={notes} onChange={event => setNotes(event.target.value)} />
        </Form.Item>
      </Form>
      {error && <Alert type="error" showIcon message={error} />}
    </Modal>
  );
};
