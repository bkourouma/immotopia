import dayjs from 'dayjs';
import type { CrmContact } from '../../../types/crm-types';
import type { Property } from '../../../types/property-types';
import type { LotTenantProfile, SyndicateLot } from '../../../types/syndic-types';
import { formatLotLabel } from '../../../utils/syndic-lot-label';
import { t } from '../../../i18n/t';

/** Libellés et aides partagés par la page « Profils lot et incidents » et ses onglets. */

export function getIncidentTypeLabel(type: string): string {
  switch (type) {
    case 'BREAKDOWN':
      return t('Panne');
    case 'LEAK':
      return t('Fuite');
    case 'VANDALISM':
      return t('Vandalisme');
    case 'SAFETY':
      return t('Sécurité');
    case 'OTHER':
      return t('Autre');
    default:
      return type;
  }
}

export function getIncidentUrgencyLabel(urgency: string): string {
  switch (urgency) {
    case 'LOW':
      return t('Basse');
    case 'MEDIUM':
      return t('Moyenne');
    case 'HIGH':
      return t('Haute');
    case 'CRITICAL':
      return t('Critique');
    default:
      return urgency;
  }
}

export function getIncidentStatusLabel(status: string): string {
  switch (status) {
    case 'REPORTED':
      return t('Signalé');
    case 'ASSIGNED':
      return t('Assigné');
    case 'IN_PROGRESS':
      return t('En cours');
    case 'RESOLVED':
      return t('Résolu');
    case 'CLOSED':
      return t('Clôturé');
    default:
      return status;
  }
}

export const incidentStatusColors: Record<string, string> = {
  REPORTED: 'default',
  ASSIGNED: 'blue',
  IN_PROGRESS: 'processing',
  RESOLVED: 'green',
  CLOSED: 'default'
};

export const INCIDENT_TYPES = ['BREAKDOWN', 'LEAK', 'VANDALISM', 'SAFETY', 'OTHER'];
export const INCIDENT_URGENCIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const INCIDENT_STATUSES = ['REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
export const IMPUTATION_TYPES = ['SYNDICATE_BUDGET', 'INSURANCE', 'LOT_OWNER', 'THIRD_PARTY'];

export function getImputationTypeLabel(type: string): string {
  switch (type) {
    case 'SYNDICATE_BUDGET':
      return t('Budget syndic');
    case 'INSURANCE':
      return t('Assurance');
    case 'LOT_OWNER':
      return t('Lot propriétaire');
    case 'THIRD_PARTY':
      return t('Tiers');
    default:
      return type;
  }
}

/** Un profil locataire est « actuel » s'il est marqué ainsi et que sa fin est vide ou à venir. */
export function isTenantProfileCurrent(profile: LotTenantProfile): boolean {
  if (!profile.isCurrent) return false;
  return !profile.tenantUntil || dayjs(profile.tenantUntil).isAfter(dayjs());
}

/** Libellé d'un contact affiché dans un formulaire : nom (ou raison sociale) et e-mail. */
export function contactDisplayName(contact: CrmContact): string {
  const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  const label = name || contact.legalName || contact.email || contact.id;
  return contact.email ? `${label} (${contact.email})` : label;
}

interface ProfileContact {
  firstName?: string | null;
  lastName?: string | null;
  legalName?: string | null;
  email?: string | null;
}

/** Nom d'un contact de profil : prénom et nom, à défaut raison sociale, e-mail, puis identifiant. */
export function profileContactName(contact: ProfileContact | null | undefined, contactId: string): string {
  if (!contact) return contactId;
  const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  return name || contact.legalName || contact.email || contactId;
}

/**
 * Libellé d'un lot pour les tableaux de profils/incidents.
 *
 * `fallbackProperty` couvre les lots importés dont la relation `property`
 * n'est pas chargée directement : on la retrouve par référence interne.
 * Toujours construit par `formatLotLabel` (numéro de lot en tête) — voir ce
 * module pour le pourquoi (constat de recette, module 5.1).
 */
export function getLotDisplayName(
  lot?: SyndicateLot | null,
  fallbackProperty?: {
    title?: string | null;
  } | null
): string {
  if (!lot) return '-';
  return formatLotLabel({ ...lot, property: lot.property || fallbackProperty || null });
}

/** Libellé d'un lot, avec le bien retrouvé par référence interne quand la relation n'est pas chargée. */
export function getLotOptionLabel(lot: SyndicateLot, propertiesByInternalReference: Record<string, Property>): string {
  const lotReference = lot.property?.internalReference || lot.lotNumber || '';
  const propertyByReference = lotReference
    ? propertiesByInternalReference[lotReference.trim().toUpperCase()]
    : undefined;
  return getLotDisplayName(lot, propertyByReference);
}
