import apiClient from '../utils/api-client';
import type { LiveMeetingPublicView } from '../types/syndic-live-types';
import type { VoteChoice } from '../types/syndic-types';

type ApiResponse<T> = { success: boolean; data: T };

/** Échec commun aux appels publics de l'AG en direct. */
export type PublicMeetingFailure = 'invalid' | 'rate_limited' | 'unavailable';

export type PublicMeetingResult = { status: 'ok'; view: LiveMeetingPublicView } | { status: PublicMeetingFailure };

/** Un vote refusé parce que l'état a changé (résolution close, AG terminée) vaut `conflict`. */
export type PublicMeetingVoteResult = PublicMeetingResult | { status: 'conflict' };

// Appels publics : sans session (`withCredentials: false`), statut HTTP lu ici
// (`validateStatus`) pour que le refresh de session et les redirections de
// l'intercepteur ne se déclenchent jamais. Le jeton part dans le CORPS, jamais
// dans l'adresse.
const PUBLIC_CONFIG = { withCredentials: false, validateStatus: () => true } as const;
const BASE = '/public/assemblees';

function failureFor(status: number): PublicMeetingFailure {
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  // 404 uniforme, 400, etc. : se confondent volontairement en « lien invalide ».
  return 'invalid';
}

async function post(path: string, body: Record<string, unknown>): Promise<PublicMeetingVoteResult> {
  try {
    const response = await apiClient.post<ApiResponse<LiveMeetingPublicView>>(`${BASE}${path}`, body, PUBLIC_CONFIG);
    if (response.status === 200 && response.data?.success && response.data.data) {
      return { status: 'ok', view: response.data.data };
    }
    if (response.status === 409) return { status: 'conflict' };
    return { status: failureFor(response.status) };
  } catch {
    return { status: 'unavailable' };
  }
}

/** État de la séance pour le porteur du lien (met à jour sa dernière présence en ligne). */
export async function fetchPublicMeetingState(token: string): Promise<PublicMeetingResult> {
  const result = await post('/etat', { token });
  return result.status === 'conflict' ? { status: 'invalid' } : result;
}

/** « Rejoindre l'assemblée » : émarge les lots du copropriétaire (idempotent). */
export async function joinPublicMeeting(token: string): Promise<PublicMeetingVoteResult> {
  return post('/rejoindre', { token });
}

/** Vote pour un ou plusieurs lots du porteur du lien. */
export async function votePublicMeeting(
  token: string,
  resolutionId: string,
  votes: Array<{ lotId: string; vote: VoteChoice }>
): Promise<PublicMeetingVoteResult> {
  return post('/voter', { token, resolutionId, votes });
}

/** Un lien de visioconférence n'est suivi que s'il est absolu en https, sans identifiants intégrés. */
export function isSafeVideoUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value === '' || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
