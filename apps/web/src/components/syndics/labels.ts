import {
  MaintenanceContract,
  MeetingStatus,
  MeetingType,
  ProviderInvoiceStatus,
  ProviderPaymentMethod
} from '../../types/syndic-types';
import { t } from '../../i18n/t';

import { localizedRecord } from '../../i18n/localized';
export const contractStatusLabels: Record<MaintenanceContract['status'], string> = localizedRecord(() => ({
  ACTIVE: t('Actif'),
  EXPIRED: t('Expiré'),
  TERMINATED: t('Résilié')
}));

/** Statut d'une facture de prestataire (lot S6). */
export const providerInvoiceStatusLabels: Record<ProviderInvoiceStatus, string> = localizedRecord(() => ({
  RECORDED: t('Enregistrée'),
  PARTIALLY_PAID: t('Partiellement payée'),
  PAID: t('Payée'),
  CANCELLED: t('Annulée')
}));

export const providerInvoiceStatusColors: Record<ProviderInvoiceStatus, string> = {
  RECORDED: 'gold',
  PARTIALLY_PAID: 'blue',
  PAID: 'green',
  CANCELLED: 'default'
};

/** Mode de paiement d'un paiement de facture prestataire (lot S6). */
export const providerPaymentMethodLabels: Record<ProviderPaymentMethod, string> = localizedRecord(() => ({
  MOBILE_MONEY: t('Mobile money'),
  BANK_TRANSFER: t('Virement bancaire'),
  CASH: t('Espèces'),
  CHECK: t('Chèque'),
  CARD: t('Carte'),
  OTHER: t('Autre')
}));

export const meetingTypeLabels: Record<MeetingType, string> = localizedRecord(() => ({
  ORDINARY: t('Ordinaire'),
  EXTRAORDINARY: t('Extraordinaire')
}));

export const meetingStatusLabels: Record<MeetingStatus, string> = localizedRecord(() => ({
  PLANNED: t('Planifiée'),
  IN_PROGRESS: t('En cours'),
  COMPLETED: t('Clôturée'),
  CANCELLED: t('Annulée')
}));

/** Mode de paiement d'une affectation de paiement à un appel (lot S2). */
export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return '';
  const upper = method.toUpperCase();
  const methodMap: Record<string, string> = {
    CASH: t('Espèces'),
    ESPECES: t('Espèces'),
    BANK_TRANSFER: t('Virement bancaire'),
    VIREMENT: t('Virement bancaire'),
    CHECK: t('Chèque'),
    CHEQUE: t('Chèque'),
    MOBILE_MONEY: t('Mobile money'),
    DIRECT_DEBIT: t('Prélèvement'),
    PREVEMENT: t('Prélèvement'),
    CARD: t('Carte'),
    CARTE: t('Carte'),
    ONLINE: t('Paiement en ligne'),
    OTHER: t('Autre'),
    AUTRE: t('Autre')
  };
  return methodMap[upper] || method;
}

/** Canal d'une relance de paiement (lot S5). */
export function reminderChannelLabel(channel: string | null | undefined): string {
  if (!channel) return '';
  const upper = channel.toUpperCase();
  const channelMap: Record<string, string> = {
    EMAIL: t('E-mail'),
    SMS: t('SMS'),
    WHATSAPP: t('WhatsApp'),
    LETTER: t('Courrier'),
    COURRIER: t('Courrier'),
    CALL: t('Appel téléphonique'),
    PHONE: t('Appel téléphonique'),
    PUSH: t('Notification')
  };
  return channelMap[upper] || channel;
}

/** Statut d'un plan de paiement (lot S2). */
export function paymentScheduleStatusLabel(status: string | null | undefined): string {
  if (!status) return '';
  const upper = status.toUpperCase();
  const statusMap: Record<string, string> = {
    ACTIVE: t('Actif'),
    COMPLETED: t('Terminé'),
    CANCELLED: t('Annulé'),
    DEFAULTED: t('En défaut')
  };
  return statusMap[upper] || status;
}
