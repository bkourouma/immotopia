import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Checkbox, Modal, Select, Space, Spin, Typography } from 'antd';
import { previewPaymentReminders, sendInstallmentReminder } from '../../../services/rental-payment-reminder-service';
import type {
  RentalReminderChannel,
  RentalReminderExclusionReason,
  RentalReminderLevel,
  RentalReminderPreviewItemDto,
  SendReminderResultDto
} from '../../../types/rental-payment-reminder';
import { formatMoney } from '../../primitives';
import { libellePeriodeEcheance } from '../../../lib/rental-labels';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import {
  asReminderLevel,
  reminderChannelLabel,
  reminderExclusionText,
  reminderFailureText,
  reminderLevelLabel
} from './reminder-labels';

const { Paragraph, Text } = Typography;

/** Une échéance exigible avec un reste à payer accepte une relance si son bail est actif. */
const STATUTS_RELANCABLES = ['DUE', 'PARTIAL', 'OVERDUE'];
export function canOfferReminder(remaining: number, status?: string | null, leaseStatus?: string): boolean {
  return (
    remaining > 0 &&
    STATUTS_RELANCABLES.includes(status ?? '') &&
    (leaseStatus === undefined || leaseStatus === 'ACTIVE')
  );
}

const LEVELS: RentalReminderLevel[] = [1, 2, 3];

/** Motifs d'exclusion portés par une réponse 409, quelle que soit l'enveloppe ; null si ce n'est pas un 409. */
function conflictExclusions(e: any): RentalReminderExclusionReason[] | null {
  const response = e?.response;
  if (response?.status !== 409) return null;
  const body = response?.data;
  const code = body?.code ?? body?.error?.code;
  const list = body?.data?.exclusions ?? body?.exclusions ?? body?.error?.data?.exclusions;
  if (Array.isArray(list) && list.length > 0) return list;
  if (code === 'RENTAL_REMINDER_TOO_SOON') return ['TOO_SOON'];
  return [];
}

function findItem(groups: { items: RentalReminderPreviewItemDto[] }[], installmentId: string) {
  for (const g of groups) {
    const found = g.items.find(i => i.installmentId === installmentId);
    if (found) return found;
  }
  return null;
}

export interface InstallmentReminderModalProps {
  tenantId: string;
  installmentId: string;
  periodLabel?: string;
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}

/** Fenêtre de relance manuelle d'une échéance : aperçu, canaux, niveau, confirmation. */
export const InstallmentReminderModal: React.FC<InstallmentReminderModalProps> = ({
  tenantId,
  installmentId,
  periodLabel,
  open,
  onClose,
  onSent
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [item, setItem] = useState<RentalReminderPreviewItemDto | null>(null);
  const [channels, setChannels] = useState<RentalReminderChannel[]>([]);
  const [level, setLevel] = useState<RentalReminderLevel | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SendReminderResultDto | null>(null);
  const [conflict, setConflict] = useState<RentalReminderExclusionReason[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setItem(null);
    setResult(null);
    setConflict(null);
    previewPaymentReminders(tenantId, { eligibleOnly: false, daysBefore: 30, minDaysLate: 0 })
      .then(preview => {
        if (cancelled) return;
        const found = findItem(preview?.groups ?? [], installmentId);
        setItem(found);
        setChannels(found ? [...found.channels] : []);
        setLevel(found ? (found.nextLevel ?? undefined) : undefined);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, installmentId]);

  const period = useMemo(
    () => (item ? libellePeriodeEcheance(item.periodMonth, item.periodYear) : (periodLabel ?? '')),
    [item, periodLabel]
  );

  const exclusions = item?.exclusions ?? [];
  const blocked = exclusions.length > 0;
  const canConfirm = !!item && !blocked && channels.length > 0 && !submitting && !result;

  const submit = async () => {
    if (!item) return;
    setSubmitting(true);
    setConflict(null);
    try {
      const res = await sendInstallmentReminder(tenantId, installmentId, { channels, level });
      setResult(res);
      if (res.status === 'SKIPPED') {
        setConflict(res.reason ? [res.reason] : []);
        return;
      }
      if (res.status === 'SENT') message.success(t('Relance envoyée.'));
      else message.warning(t("La relance n'a pas pu être envoyée."));
      onSent?.();
    } catch (e: any) {
      const reasons = conflictExclusions(e);
      if (reasons) setConflict(reasons);
      else message.error(t("Échec de l'envoi de la relance"));
    } finally {
      setSubmitting(false);
    }
  };

  const messagePreview = item
    ? t(
        'Bonjour {{tenant}}, nous vous rappelons que le loyer de {{period}} reste à régler : {{amount}}, échéance du {{date}}. ({{level}})',
        {
          tenant: item.tenantName ?? t('cher locataire'),
          period,
          amount: formatMoney(item.amountDue, { currency: item.currency }),
          date: new Date(item.dueDate).toLocaleDateString(activeLocale()),
          level: reminderLevelLabel(level ?? item.nextLevel)
        }
      )
    : '';

  const sent = result && result.status !== 'SKIPPED' ? result : null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      destroyOnHidden
      title={period ? t('Relance de loyer · échéance {{value}}', { value: period }) : t('Relance de loyer')}
      footer={
        sent ? (
          <Button type="primary" onClick={onClose}>
            {t('Fermer')}
          </Button>
        ) : (
          <Space>
            <Button onClick={onClose}>{t('Annuler')}</Button>
            <Button type="primary" disabled={!canConfirm} loading={submitting} onClick={() => void submit()}>
              {t('Envoyer la relance')}
            </Button>
          </Space>
        )
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : loadError ? (
        <Alert type="error" showIcon message={t("Impossible de charger l'aperçu de la relance.")} />
      ) : !item ? (
        <Alert type="info" showIcon message={t("Cette échéance n'est pas relançable pour le moment.")} />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {blocked ? (
            <Alert
              type="warning"
              showIcon
              message={t("Cette échéance ne peut pas être relancée pour l'instant :")}
              description={
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  {exclusions.map(r => (
                    <li key={r}>{reminderExclusionText(r)}</li>
                  ))}
                </ul>
              }
            />
          ) : null}

          <div>
            <label htmlFor="relance-niveau">{t('Niveau de la relance')}</label>
            <div>
              <Select<RentalReminderLevel>
                id="relance-niveau"
                style={{ minWidth: 260 }}
                value={level}
                disabled={!!sent}
                placeholder={reminderLevelLabel(asReminderLevel(item.nextLevel))}
                options={LEVELS.map(l => ({ value: l, label: reminderLevelLabel(l) }))}
                onChange={v => setLevel(v)}
              />
            </div>
            <Text type="secondary">
              {t('Niveau proposé : {{level}}', { level: reminderLevelLabel(item.nextLevel) })}
            </Text>
          </div>

          <div>
            <div>{t('Canaux')}</div>
            <Checkbox.Group
              value={channels}
              disabled={!!sent}
              onChange={v => setChannels(v as RentalReminderChannel[])}
              options={item.channels.map(c => ({ value: c, label: reminderChannelLabel(c) }))}
            />
            {item.channels.length === 0 ? <Text type="secondary">{t('Aucun canal utilisable')}</Text> : null}
          </div>

          <div>
            <div>{t('Aperçu du message')}</div>
            <Paragraph style={{ margin: 0 }} type="secondary">
              {messagePreview}
            </Paragraph>
          </div>

          <Alert
            type={item.paymentLinkIncluded ? 'info' : 'warning'}
            showIcon
            message={
              item.paymentLinkIncluded
                ? t('Un lien de paiement en ligne sera joint au message')
                : t('Aucun lien de paiement ne sera joint (paiement en ligne indisponible)')
            }
          />

          {conflict ? (
            <Alert
              type="error"
              showIcon
              message={t("La relance n'a pas été envoyée :")}
              description={
                conflict.length > 0 ? (
                  <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                    {conflict.map(r => (
                      <li key={r}>{reminderExclusionText(r)}</li>
                    ))}
                  </ul>
                ) : (
                  t("L'échéance n'est pas éligible à une relance.")
                )
              }
            />
          ) : null}

          {sent ? (
            <Alert
              type={sent.status === 'SENT' ? 'success' : 'error'}
              showIcon
              message={sent.status === 'SENT' ? t('Relance envoyée.') : t("La relance n'a pas pu être envoyée.")}
              description={
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  {sent.channels.map(c => (
                    <li key={c.channel}>
                      {reminderChannelLabel(c.channel)} :{' '}
                      {c.status === 'SENT' ? t('Envoyée') : reminderFailureText(c.failureCode)}
                    </li>
                  ))}
                </ul>
              }
            />
          ) : null}
        </Space>
      )}
    </Modal>
  );
};
