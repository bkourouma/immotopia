import { MaintenanceContract, MeetingStatus, MeetingType } from '../../types/syndic-types';
import { t } from '../../i18n/t';

export function contractStatusLabels(): Record<MaintenanceContract['status'], string> {
  return {
    ACTIVE: t('Actif'),
    EXPIRED: t('Expiré'),
    TERMINATED: t('Résilié')
  };
}

export function meetingTypeLabels(): Record<MeetingType, string> {
  return {
    ORDINARY: t('Ordinaire'),
    EXTRAORDINARY: t('Extraordinaire')
  };
}

export function meetingStatusLabels(): Record<MeetingStatus, string> {
  return {
    PLANNED: t('Planifiée'),
    IN_PROGRESS: t('En cours'),
    COMPLETED: t('Clôturée'),
    CANCELLED: t('Annulée')
  };
}
