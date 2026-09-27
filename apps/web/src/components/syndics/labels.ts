import {
  MaintenanceContract,
  MeetingStatus,
  MeetingType,
  ProviderInvoiceStatus,
  ProviderPaymentMethod
} from '../../types/syndic-types';
import { t } from '../../i18n/t';

export const contractStatusLabels: Record<MaintenanceContract['status'], string> = {
  ACTIVE: 'Actif',
  EXPIRED: t('Expiré'),
  TERMINATED: t('Résilié')
};

/** Statut d'une facture de prestataire (lot S6). */
export const providerInvoiceStatusLabels: Record<ProviderInvoiceStatus, string> = {
  RECORDED: t('Enregistrée'),
  PARTIALLY_PAID: t('Partiellement payée'),
  PAID: t('Payée'),
  CANCELLED: t('Annulée')
};

export const providerInvoiceStatusColors: Record<ProviderInvoiceStatus, string> = {
  RECORDED: 'gold',
  PARTIALLY_PAID: 'blue',
  PAID: 'green',
  CANCELLED: 'default'
};

/** Mode de paiement d'un paiement de facture prestataire (lot S6). */
export const providerPaymentMethodLabels: Record<ProviderPaymentMethod, string> = {
  MOBILE_MONEY: t('Mobile money'),
  BANK_TRANSFER: t('Virement bancaire'),
  CASH: t('Espèces'),
  CHECK: t('Chèque'),
  CARD: t('Carte'),
  OTHER: t('Autre')
};

export const meetingTypeLabels: Record<MeetingType, string> = {
  ORDINARY: 'Ordinaire',
  EXTRAORDINARY: 'Extraordinaire'
};

export const meetingStatusLabels: Record<MeetingStatus, string> = {
  PLANNED: t('Planifiée'),
  IN_PROGRESS: t('En cours'),
  COMPLETED: t('Clôturée'),
  CANCELLED: t('Annulée')
};
