import { CrmDealType } from '../types/crm-types';
import { t } from '../i18n/t';
import { formatNumber, DEFAULT_CURRENCY } from '../i18n/format';

/**
 * Libellés français des codes CRM. Les codes bruts de l'API (`VENTE`,
 * `ACTIVE_CLIENT`, `COLD`, `PROPRIETAIRE`…) ne s'affichent jamais tels quels.
 * Les fonctions (et non des constantes de module) suivent la langue active.
 */

/**
 * Get the French label for a deal type
 */
export function getDealTypeLabel(type: CrmDealType | string): string {
  const labels: Record<string, string> = {
    ACHAT: t('Achat'),
    LOCATION: t('Location'),
    VENTE: t('Vente'),
    GESTION: t('Gestion de biens'),
    MANDAT: t('Mandat')
  };
  return labels[type] || type;
}

export function getDealStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    NEW: t('Nouveau'),
    QUALIFIED: t('Qualifié'),
    VISIT: t('Visite'),
    NEGOTIATION: t('Négociation'),
    WON: t('Gagné'),
    LOST: t('Perdu')
  };
  return labels[stage] || stage;
}

export function getContactRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    PROPRIETAIRE: t('Propriétaire'),
    LOCATAIRE: t('Locataire'),
    COPROPRIETAIRE: t('Copropriétaire'),
    ACQUEREUR: t('Acquéreur')
  };
  return labels[role] || role;
}

export function getContactStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    LEAD: t('Prospect'),
    ACTIVE_CLIENT: t('Client actif'),
    ARCHIVED: t('Archivé')
  };
  return labels[status] || status;
}

export function getMaturityLabel(level: string): string {
  const labels: Record<string, string> = {
    COLD: t('Froid'),
    WARM: t('Tiède'),
    HOT: t('Chaud')
  };
  return labels[level] || level;
}

export function getActivityDirectionLabel(direction: string): string {
  const labels: Record<string, string> = {
    IN: t('Entrant'),
    OUT: t('Sortant'),
    INTERNAL: t('Interne')
  };
  return labels[direction] || direction;
}

/** Montant en francs CFA, avec séparateur de milliers : « 45 000 000 FCFA ». */
export function formatFcfa(amount: number | string | null | undefined): string {
  const value = Number(amount);
  if (amount === null || amount === undefined || amount === '' || !Number.isFinite(value)) return '—';
  return `${formatNumber(value)} ${DEFAULT_CURRENCY}`;
}

/** « Vente - Qualifié - 50 000 000 FCFA » : intitulé d'une affaire dans une liste ou un champ. */
export function describeDeal(deal: { type: string; stage: string; budgetMax?: number | string | null }): string {
  const parts = [getDealTypeLabel(deal.type), getDealStageLabel(deal.stage)];
  if (deal.budgetMax) parts.push(formatFcfa(deal.budgetMax));
  return parts.join(' - ');
}
