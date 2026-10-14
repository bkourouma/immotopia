import dayjs from 'dayjs';
import { dateFormat } from '../../../../i18n/format';
import { t } from '../../../../i18n/t';
import type {
  CaptureOutcome,
  RegistrationAccessReason,
  RegistrationStatus,
  SessionCloseReason,
  SessionState,
  SiteIneligibleReason,
  StockVisionFailureReason,
  StockVisionMethod,
  StockVisionQuality,
  WhatsappVia
} from '../../../../types/finance-stock-whatsapp-types';

/**
 * Libellés partagés des écrans de l'inventaire par WhatsApp (lot 041,
 * ecrans §3 à §5). Texte français = clé de traduction.
 *
 * Des FONCTIONS et non des constantes : un `t()` évalué à l'import resterait
 * figé dans la langue active à ce moment-là.
 */

export type WhatsappTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Ce que le chef a fait de la proposition (ecrans §4.4). */
export function captureOutcomeLabel(outcome: CaptureOutcome | null | undefined): string {
  switch (outcome) {
    case 'ACCEPTED':
      return t('Validée telle quelle');
    case 'CORRECTED':
      return t('Corrigée par le chef');
    case 'CANCELLED':
      return t('Annulée');
    case 'EXPIRED':
      return t('Abandonnée (sans réponse)');
    case 'UNREADABLE':
      return t('Photo illisible');
    case 'UNRECOGNIZED':
      return t('Article non reconnu');
    case 'FAILED':
      return t('Analyse en échec');
    case 'PENDING':
      return t('En attente de la réponse du chef');
    case 'RECEIVED':
      return t('Photo reçue, analyse en cours');
    default:
      return '—';
  }
}

export function visionMethodLabel(method: StockVisionMethod | null | undefined): string {
  switch (method) {
    case 'SACKS_STACKED':
      return t('Sacs empilés');
    case 'BARS_BUNDLE':
      return t('Barres ou tubes en fagot');
    case 'BLOCKS_PALLET':
      return t('Blocs sur palette');
    case 'OTHER':
      return t('Autre');
    default:
      return '—';
  }
}

export function visionQualityLabel(quality: StockVisionQuality | null | undefined): string {
  switch (quality) {
    case 'OK':
      return t('Bonne');
    case 'TOO_DARK':
      return t('Trop sombre');
    case 'BLURRY':
      return t('Floue');
    case 'NOT_STOCK':
      return t('Aucun matériau visible');
    default:
      return '—';
  }
}

export function visionFailureLabel(reason: StockVisionFailureReason | null | undefined): string {
  switch (reason) {
    case 'TIMEOUT':
      return t('délai dépassé');
    case 'PROVIDER_ERROR':
      return t('service indisponible');
    case 'INVALID_OUTPUT':
      return t('réponse illisible');
    case 'DISABLED':
      return t('analyse désactivée');
    default:
      return '';
  }
}

export function viaLabel(via: WhatsappVia | null | undefined): string {
  return via === 'SIMULATOR' ? t('simulateur (recette)') : t('WhatsApp');
}

export function registrationStatusDisplay(status: RegistrationStatus): { label: string; tone: WhatsappTone } {
  switch (status) {
    case 'PENDING_ACTIVATION':
      return { label: t('En attente du code'), tone: 'warning' };
    case 'ACTIVE':
      return { label: t('Actif'), tone: 'success' };
    case 'REVOKED':
    default:
      return { label: t('Révoqué'), tone: 'neutral' };
  }
}

export function registrationAccessReasonLabel(reason: RegistrationAccessReason | null | undefined): string {
  switch (reason) {
    case 'TENANT_SUSPENDED':
      return t('Agence suspendue');
    case 'MEMBERSHIP_NOT_ACTIVE':
      return t('Adhésion inactive');
    case 'USER_INACTIVE':
      return t('Compte désactivé');
    case 'ROLE_MISSING':
      return t('Rôle Chef de chantier retiré');
    case 'OPTION_MISSING':
      return t('Option non souscrite');
    default:
      return t('Accès suspendu');
  }
}

export function siteIneligibleReasonLabel(reason: SiteIneligibleReason | null | undefined): string {
  switch (reason) {
    case 'CLOSED':
      return t('Chantier clos');
    case 'NOT_STOCK_ENABLED':
      return t('Chantier non basculé au stock');
    case 'LOCATION_INACTIVE':
      return t('Lieu du chantier inactif');
    default:
      return t('Chantier non éligible');
  }
}

export function sessionStateLabel(state: SessionState): string {
  switch (state) {
    case 'AWAITING_SITE':
      return t('Choix du chantier');
    case 'ANALYZING':
      return t('Analyse de la photo');
    case 'AWAITING_ITEM':
      return t('Choix de l’article');
    case 'AWAITING_CONFIRMATION':
      return t('Attente de confirmation');
    case 'AWAITING_MERGE':
      return t('Attente du choix ajouter ou remplacer');
    case 'READY':
      return t('Prête pour une photo');
    case 'CLOSED':
    default:
      return t('Close');
  }
}

export function sessionCloseReasonLabel(reason: SessionCloseReason | null | undefined): string {
  switch (reason) {
    case 'FIN':
      return t('Close par le chef (FIN)');
    case 'SITE_CHANGE':
      return t('Changement de chantier');
    case 'TIMEOUT':
      return t('Sans réponse');
    case 'ACCESS_LOST':
      return t('Accès perdu');
    case 'REVOKED':
      return t('Inscription révoquée');
    case 'NO_SITE':
      return t('Aucun chantier ouvert');
    default:
      return '';
  }
}

/** « 3fa9…c21e » : début et fin de l'empreinte, l'empreinte complète se copie. */
export function shortHash(sha: string | null | undefined): string {
  const valeur = (sha ?? '').trim();
  if (valeur.length <= 10) return valeur;
  return `${valeur.slice(0, 4)}…${valeur.slice(-4)}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = dayjs(iso);
  return date.isValid() ? date.format(dateFormat('dateTime')) : '—';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = dayjs(iso);
  return date.isValid() ? date.format(dateFormat('short')) : '—';
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = dayjs(iso);
  return date.isValid() ? date.format('HH:mm') : '—';
}

/** Ce que le serveur a rendu dans une réponse d'erreur (`{ code, message, data }`). */
export interface WhatsappApiError {
  status: number | null;
  code: string | null;
  message: string | null;
  data: Record<string, unknown> | null;
}

export function apiErrorOf(error: unknown): WhatsappApiError {
  const response = (
    error as { response?: { status?: number; data?: { code?: unknown; message?: unknown; data?: unknown } } } | null
  )?.response;
  const corps = response?.data;
  return {
    status: typeof response?.status === 'number' ? response.status : null,
    code: typeof corps?.code === 'string' ? corps.code : null,
    message: typeof corps?.message === 'string' ? corps.message : null,
    data: corps?.data && typeof corps.data === 'object' ? (corps.data as Record<string, unknown>) : null
  };
}

/** Un refus de droit, et non une fonction absente de l'abonnement. */
export function isForbiddenError(error: unknown): boolean {
  const { status, code } = apiErrorOf(error);
  return status === 403 && code !== 'MODULE_NOT_INCLUDED';
}

/** Lien vers l'inventaire du lot 040, détail ouvert. */
export function inventoryHref(tenantId: string, countId: string): string {
  return `/tenant/${tenantId}/finance/stock/inventaire?inventaire=${encodeURIComponent(countId)}`;
}
