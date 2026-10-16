import type { ResolutionVoteStatus, VoteChoice, VoteSource } from '../../../types/syndic-types';
import type { AttendanceStatus, PublicResolutionResult } from '../../../types/syndic-live-types';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';

// Libellés construits à l'appel (et non au chargement du module) pour suivre la langue.

export function voteChoiceLabel(vote: VoteChoice): string {
  if (vote === 'FOR') return t('Pour');
  if (vote === 'AGAINST') return t('Contre');
  return t('Abstention');
}

export const VOTE_CHOICES: VoteChoice[] = ['FOR', 'AGAINST', 'ABSTAIN'];

export function voteStatusLabel(status: ResolutionVoteStatus | undefined): string {
  if (status === 'OPEN') return t('Vote ouvert');
  if (status === 'CLOSED') return t('Vote clos');
  return t('Vote pas encore ouvert');
}

export function voteStatusColor(status: ResolutionVoteStatus | undefined): string {
  if (status === 'OPEN') return 'green';
  if (status === 'CLOSED') return 'default';
  return 'blue';
}

export function voteSourceLabel(source: VoteSource | undefined): string {
  if (source === 'CO_OWNER') return t('Vote en ligne');
  if (source === 'PROXY_HOLDER') return t('Vote du mandataire');
  return t('Saisi par le gestionnaire');
}

export function resultLabel(result: PublicResolutionResult | undefined): string {
  if (result === 'APPROVED') return t('Approuvée');
  if (result === 'REJECTED') return t('Rejetée');
  if (result === 'DEFERRED') return t('Reportée');
  return t('En attente');
}

export function resultColor(result: PublicResolutionResult | undefined): string {
  if (result === 'APPROVED') return 'green';
  if (result === 'REJECTED') return 'red';
  if (result === 'DEFERRED') return 'orange';
  return 'default';
}

export function attendanceLabel(status: AttendanceStatus | null | undefined): string {
  if (status === 'PRESENT') return t('Présent');
  if (status === 'REPRESENTED') return t('Représenté');
  return t('Absent');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(activeLocale(), { dateStyle: 'long', timeStyle: 'short' });
}

/** Pourcentage de quorum borné pour une jauge. */
export function clampPercent(value: number | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Number(n.toFixed(2))));
}

export function meetingTypeTitle(type: string | undefined): string {
  if (type === 'EXTRAORDINARY') return t('Assemblée générale extraordinaire');
  if (type === 'ORDINARY') return t('Assemblée générale ordinaire');
  return t('Assemblée générale');
}
