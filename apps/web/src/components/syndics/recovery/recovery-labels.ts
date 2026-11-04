import { localizedList, localizedRecord } from '../../../i18n/localized';
import { t } from '../../../i18n/t';
import type { ReminderChannel, ReminderStatus } from '../../../types/syndic-types';
import { paymentScheduleStatusLabel } from '../labels';

export const reminderChannelOptions: Array<{ label: string; value: ReminderChannel }> = localizedList(() => [
  { label: t('Email'), value: 'EMAIL' },
  { label: 'SMS', value: 'SMS' },
  { label: 'WhatsApp', value: 'WHATSAPP' },
  { label: t('Push'), value: 'PUSH' }
]);

export const reminderStatusLabels: Record<ReminderStatus, string> = localizedRecord(() => ({
  SENT: t('Envoyé'),
  DELIVERED: t('Distribué'),
  FAILED: t('Échec')
}));

export const reminderStatusOptions: Array<{ label: string; value: ReminderStatus }> = localizedList(() =>
  (['SENT', 'DELIVERED', 'FAILED'] as const).map(value => ({ label: reminderStatusLabels[value], value }))
);

/** Statuts d'échéancier filtrables côté serveur. */
export const scheduleStatusOptions: Array<{ label: string; value: string }> = localizedList(() =>
  ['ACTIVE', 'COMPLETED', 'DEFAULTED'].map(value => ({ label: paymentScheduleStatusLabel(value), value }))
);

/** Pénalité active ou remise : valeur envoyée à l'API sous `waived`. */
export const penaltyWaivedOptions: Array<{ label: string; value: 'false' | 'true' }> = localizedList(() => [
  { label: t('Active'), value: 'false' },
  { label: t('Remise'), value: 'true' }
]);

export function ownerLabel(
  owner?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null
) {
  if (!owner) return t('Sans propriétaire');
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
  return name || owner.email || t('Propriétaire');
}
