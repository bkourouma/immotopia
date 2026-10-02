import { t, type Language } from '../../../i18n';
import type { DocumentState } from './data';

/**
 * Libellés français des textes de l'export patrimoine, en un seul endroit.
 *
 * Mêmes libellés que côté web (`apps/web/src/components/patrimoine/patrimoine-labels.ts`),
 * repris ici parce que le serveur ne peut pas importer le bundle front. Un
 * paramètre `language` explicite permet au PDF de forcer le français quand la
 * requête est en arabe (les polices standard de pdf-lib ne l'encodent pas —
 * voir `pdf.ts`), sans changer la langue du reste de la réponse.
 */

export function documentTypeLabel(type: string, language?: Language): string {
  switch (type) {
    case 'TITLE_DEED':
      return t('Titre de propriété', undefined, language);
    case 'LAND_CONCESSION':
      return t('Arrêté de concession définitive (ACD)', undefined, language);
    case 'NOTARIAL_DEED':
      return t('Acte notarié', undefined, language);
    case 'BUILDING_PERMIT':
      return t('Permis de construire', undefined, language);
    // `PropertyDocumentType` nomme ce document `PLAN`, `PatrimonyDocType`
    // (schema.prisma) l'appelle `FLOOR_PLAN` : même libellé pour les deux.
    case 'PLAN':
    case 'FLOOR_PLAN':
      return t('Plan', undefined, language);
    case 'TECHNICAL_DIAGNOSIS':
      return t('Diagnostic technique', undefined, language);
    case 'INSURANCE':
      return t('Assurance', undefined, language);
    case 'TAX_DOCUMENT':
      return t('Document fiscal', undefined, language);
    case 'MANDATE':
      return t('Mandat', undefined, language);
    case 'SYNDICATE_PV':
      return t("Procès-verbal d'assemblée", undefined, language);
    case 'SYNDICATE_BUDGET':
      return t('Budget du syndicat', undefined, language);
    case 'SYNDICATE_CONTRAT':
      return t('Contrat du syndicat', undefined, language);
    case 'SYNDICATE_REGL_COPRO':
      return t('Règlement de copropriété', undefined, language);
    case 'OTHER':
      return t('Autre', undefined, language);
    default:
      return type;
  }
}

export function documentStateLabel(state: DocumentState, language?: Language): string {
  switch (state) {
    case 'EXPIRED':
      return t('Expiré', undefined, language);
    case 'EXPIRING_SOON':
      return t('Expire bientôt', undefined, language);
    case 'UP_TO_DATE':
      return t('À jour', undefined, language);
    case 'NO_DEADLINE':
      return t('Sans échéance', undefined, language);
    default:
      return state;
  }
}

export function loanStatusLabel(status: string, language?: Language): string {
  if (status === 'ACTIVE') return t('Actif', undefined, language);
  if (status === 'CLOSED') return t('Clôturé', undefined, language);
  if (status === 'DEFAULTED') return t('Défaillant', undefined, language);
  return status;
}

export function valuationMethodLabel(method: string, language?: Language): string {
  if (method === 'MANUAL') return t('Manuelle', undefined, language);
  if (method === 'MARKET_ESTIMATE') return t('Estimation de marché', undefined, language);
  if (method === 'EXPERT_APPRAISAL') return t('Expertise', undefined, language);
  if (method === 'DEPRECIATION_LINEAR') return t('Amortissement linéaire', undefined, language);
  if (method === 'DEPRECIATION_DECLINING') return t('Amortissement dégressif', undefined, language);
  if (method === 'EQUITY_SHARE') return t("Quote-part de l'entreprise", undefined, language);
  if (method === 'UNIT_COST') return t('Quantité × coût unitaire', undefined, language);
  if (method === 'ACCRUED_SAVINGS') return t('Épargne capitalisée', undefined, language);
  if (method === 'DISCOUNTED_CLAIM') return t('Créance décotée', undefined, language);
  if (method === 'UNIT_VALUE') return t('Valeur unitaire', undefined, language);
  if (method === 'BALANCE') return t('Solde', undefined, language);
  return method;
}

export function expenseCategoryLabel(category: string, language?: Language): string {
  switch (category) {
    case 'PROPERTY_TAX':
      return t('Taxe foncière', undefined, language);
    case 'CONDO_FEES':
      return t('Charges de copropriété', undefined, language);
    case 'INSURANCE':
      return t('Assurance', undefined, language);
    case 'ROUTINE_MAINTENANCE':
      return t('Entretien courant', undefined, language);
    case 'RENOVATION':
      return t('Rénovation', undefined, language);
    case 'MANAGEMENT_FEES':
      return t('Honoraires de gestion', undefined, language);
    case 'UTILITIES':
      return t('Charges communes', undefined, language);
    case 'OTHER':
      return t('Autre', undefined, language);
    default:
      return category;
  }
}

/** Libellés de `PropertyType` (schema.prisma) — mêmes textes que le web (`pages/OwnerPortal/PropertyDetails.tsx`). */
export function propertyTypeLabel(type: string, language?: Language): string {
  switch (type) {
    case 'APPARTEMENT':
      return t('Appartement', undefined, language);
    case 'MAISON_VILLA':
      return t('Maison/Villa', undefined, language);
    case 'STUDIO':
      return t('Studio', undefined, language);
    case 'DUPLEX_TRIPLEX':
      return t('Duplex/Triplex', undefined, language);
    case 'CHAMBRE_COLOCATION':
      return t('Chambre en colocation', undefined, language);
    case 'BUREAU':
      return t('Bureau', undefined, language);
    case 'BOUTIQUE_COMMERCIAL':
      return t('Boutique/Commercial', undefined, language);
    case 'ENTREPOT_INDUSTRIEL':
      return t('Entrepôt/Industriel', undefined, language);
    case 'TERRAIN':
      return t('Terrain', undefined, language);
    case 'IMMEUBLE':
      return t('Immeuble', undefined, language);
    case 'PARKING_BOX':
      return t('Parking/Box', undefined, language);
    case 'LOT_PROGRAMME_NEUF':
      return t('Lot programme neuf', undefined, language);
    default:
      return type;
  }
}

/** Libellés de `PropertyStatus` (schema.prisma) — mêmes textes que le web (`pages/OwnerPortal/PropertyDetails.tsx`). */
export function propertyStatusLabel(status: string, language?: Language): string {
  switch (status) {
    case 'DRAFT':
      return t('Brouillon', undefined, language);
    case 'UNDER_REVIEW':
      return t("En cours d'examen", undefined, language);
    case 'AVAILABLE':
      return t('Disponible', undefined, language);
    case 'RESERVED':
      return t('Réservé', undefined, language);
    case 'UNDER_OFFER':
      return t('Sous offre', undefined, language);
    case 'RENTED':
      return t('Loué', undefined, language);
    case 'SOLD':
      return t('Vendu', undefined, language);
    case 'ARCHIVED':
      return t('Archivé', undefined, language);
    default:
      return status;
  }
}

export function workProgramStatusLabel(status: string, language?: Language): string {
  switch (status) {
    case 'PLANNED':
      return t('Planifié', undefined, language);
    case 'IN_PROGRESS':
      return t('En cours', undefined, language);
    case 'COMPLETED':
      return t('Terminé', undefined, language);
    case 'CANCELLED':
      return t('Annulé', undefined, language);
    default:
      return status;
  }
}
