import { MaintenanceContract, MeetingStatus, MeetingType } from '../../types/syndic-types';
import { t } from '../../i18n/t';

export const contractStatusLabels: Record<MaintenanceContract['status'], string> = {
  ACTIVE: 'Actif',
  EXPIRED: t('Expiré'),
  TERMINATED: t('Résilié')
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
