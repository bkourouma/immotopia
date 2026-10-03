import { getContactRoleLabel, getContactStatusLabel, getDealTypeLabel, getMaturityLabel } from '../../utils/crm-utils';
import { t } from '../../i18n/t';

/** Données de référence qui traduisent les identifiants d'un filtre en noms. */
export interface FilterReferences {
  communes: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
  users: Array<{ id: string; fullName: string | null }>;
}

function filterLabel(key: string): string {
  const labels: Record<string, string> = {
    searchQuery: t('Recherche'),
    firstName: t('Prénom'),
    lastName: t('Nom'),
    email: t('Email'),
    phone: t('Téléphone'),
    city: t('Ville'),
    district: t('Quartier'),
    communeIds: t('Communes'),
    targetCommuneIds: t('Zones cibles'),
    contactTypes: t('Types'),
    statuses: t('Statuts'),
    maturityLevels: t('Maturité'),
    dealTypes: t("Types d'affaire"),
    budgetMin: t('Budget min (FCFA)'),
    budgetMax: t('Budget max (FCFA)'),
    incomeMin: t('Revenu min (FCFA)'),
    incomeMax: t('Revenu max (FCFA)'),
    borrowingCapacities: t("Capacité d'emprunt"),
    tagIds: t('Tags'),
    hasAllTags: t('Doit avoir TOUS les tags (sinon au moins un)'),
    assignedToUserIds: t('Assigné à'),
    unassigned: t('Inclure les contacts non assignés'),
    roles: t('Rôles CRM'),
    consentEmail: t('Consentement Email'),
    consentWhatsapp: t('Consentement WhatsApp'),
    consentMarketing: t('Consentement Marketing')
  };
  return labels[key] ?? key;
}

function contactTypeLabel(value: string): string {
  if (value === 'PERSON') return t('Personne');
  if (value === 'COMPANY') return t('Société');
  return value;
}

function borrowingLabel(value: string): string {
  if (value === 'YES') return t('Oui');
  if (value === 'NO') return t('Non');
  if (value === 'UNKNOWN') return t('Inconnu');
  return value;
}

function valueLabel(key: string, value: string, refs: FilterReferences): string {
  switch (key) {
    case 'communeIds':
    case 'targetCommuneIds':
      return refs.communes.find(c => c.id === value)?.name ?? value;
    case 'tagIds':
      return refs.tags.find(tag => tag.id === value)?.name ?? value;
    case 'assignedToUserIds':
      return refs.users.find(u => u.id === value)?.fullName ?? value;
    case 'statuses':
      return getContactStatusLabel(value);
    case 'maturityLevels':
      return getMaturityLabel(value);
    case 'dealTypes':
      return getDealTypeLabel(value);
    case 'roles':
      return getContactRoleLabel(value);
    case 'contactTypes':
      return contactTypeLabel(value);
    case 'borrowingCapacities':
      return borrowingLabel(value);
    default:
      return value;
  }
}

/**
 * Texte d'une puce de filtre actif : « Communes : Bingerville », jamais
 * « communeIds: 5626458e-… ». Renvoie `null` pour un filtre vide.
 */
export function describeFilter(key: string, value: unknown, refs: FilterReferences): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value) && value.length === 0) return null;
  const label = filterLabel(key);
  if (typeof value === 'boolean') return value ? label : null;
  const text = Array.isArray(value)
    ? value.map(v => valueLabel(key, String(v), refs)).join(', ')
    : typeof value === 'object'
      ? JSON.stringify(value)
      : valueLabel(key, String(value), refs);
  const short = text.length > 60 ? `${text.slice(0, 60)}…` : text;
  return `${label} : ${short}`;
}
