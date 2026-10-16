import apiClient from '../utils/api-client';
import type {
  DiscussionMessageView,
  LiveMeetingPublicView,
  PublicDiscussionView,
  VisioJoinInfo
} from '../types/syndic-live-types';
import type { VoteChoice } from '../types/syndic-types';

type ApiResponse<T> = { success: boolean; data: T };

/** Échec commun aux appels publics de l'AG en direct. */
export type PublicMeetingFailure = 'invalid' | 'rate_limited' | 'unavailable';

export type PublicMeetingResult = { status: 'ok'; view: LiveMeetingPublicView } | { status: PublicMeetingFailure };

/** Un vote refusé parce que l'état a changé (résolution close, AG terminée) vaut `conflict`. */
export type PublicMeetingVoteResult = PublicMeetingResult | { status: 'conflict'; message?: string };

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
    if (response.status === 409) {
      // Le serveur donne la raison (vote du syndic, vote du copropriétaire, vote clos) dans la langue de la requête.
      const message = (response.data as { message?: unknown } | undefined)?.message;
      return typeof message === 'string' && message.trim() ? { status: 'conflict', message } : { status: 'conflict' };
    }
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

/* ------------------------------------------------------------------- visio */

/** Résultat d'un appel de visio : mêmes échecs que l'AG, plus la raison d'un 409. */
export type PublicVisioResult<T> =
  { status: 'ok'; data: T } | { status: PublicMeetingFailure } | { status: 'conflict'; message?: string };

async function postVisio<T>(path: string, body: Record<string, unknown>): Promise<PublicVisioResult<T>> {
  try {
    const response = await apiClient.post<ApiResponse<T>>(`${BASE}${path}`, body, PUBLIC_CONFIG);
    if (response.status === 200 && response.data?.success && response.data.data) {
      return { status: 'ok', data: response.data.data };
    }
    if (response.status === 409) {
      const message = (response.data as { message?: unknown } | undefined)?.message;
      return typeof message === 'string' && message.trim() ? { status: 'conflict', message } : { status: 'conflict' };
    }
    return { status: failureFor(response.status) };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Jeton de connexion à la salle de visio (AG en cours, participant ayant rejoint). */
export async function fetchPublicVisioToken(token: string): Promise<PublicVisioResult<VisioJoinInfo>> {
  return postVisio<VisioJoinInfo>('/visio', { token });
}

/** Lève ou baisse la main dans la salle. */
export async function setPublicHandRaised(
  token: string,
  raised: boolean
): Promise<PublicVisioResult<{ raised: boolean }>> {
  return postVisio<{ raised: boolean }>('/visio/main', { token, raised });
}

/* -------------------------------------------------------------- discussion (spec 046) */

/** Résultat d'un appel de discussion : un 400 (texte refusé) se distingue d'un lien invalide. */
export type PublicDiscussionResult<T> =
  | { status: 'ok'; data: T }
  | { status: PublicMeetingFailure }
  | { status: 'conflict'; message?: string }
  | { status: 'rejected'; message?: string };

function serverMessage(response: { data?: unknown }): string | undefined {
  const message = (response.data as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' && message.trim() ? message : undefined;
}

async function postDiscussion<T>(path: string, body: Record<string, unknown>): Promise<PublicDiscussionResult<T>> {
  try {
    const response = await apiClient.post<ApiResponse<T>>(`${BASE}${path}`, body, PUBLIC_CONFIG);
    if (response.status === 200 && response.data?.success && response.data.data) {
      return { status: 'ok', data: response.data.data };
    }
    if (response.status === 409) {
      const message = serverMessage(response);
      return message ? { status: 'conflict', message } : { status: 'conflict' };
    }
    if (response.status === 400) {
      const message = serverMessage(response);
      return message ? { status: 'rejected', message } : { status: 'rejected' };
    }
    return { status: failureFor(response.status) };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Historique de la discussion (200 derniers messages) et droits d'écriture du porteur du lien. */
export async function fetchPublicDiscussion(token: string): Promise<PublicDiscussionResult<PublicDiscussionView>> {
  return postDiscussion<PublicDiscussionView>('/discussion', { token });
}

/** Envoie un message ; le serveur le diffuse à la salle. */
export async function sendPublicDiscussionMessage(
  token: string,
  body: string
): Promise<PublicDiscussionResult<DiscussionMessageView>> {
  return postDiscussion<DiscussionMessageView>('/discussion/envoyer', { token, body });
}
