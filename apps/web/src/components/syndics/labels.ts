import { MaintenanceContract, MeetingStatus, MeetingType } from '../../types/syndic-types';

export const contractStatusLabels: Record<MaintenanceContract['status'], string> = {
  ACTIVE: 'Actif',
  EXPIRED: 'Expiré',
  TERMINATED: 'Résilié'
};

export const meetingTypeLabels: Record<MeetingType, string> = {
  ORDINARY: 'Ordinaire',
  EXTRAORDINARY: 'Extraordinaire'
};

export const meetingStatusLabels: Record<MeetingStatus, string> = {
  PLANNED: 'Planifiée',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Clôturée',
  CANCELLED: 'Annulée'
};
