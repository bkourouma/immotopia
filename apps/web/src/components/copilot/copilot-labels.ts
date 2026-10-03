import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';
import type { CopilotToolName } from '../../types/copilot';
import { statusLabel } from '../primitives/StatusTag';

/**
 * Libellés des énumérations affichées par les cartes du copilote. Mêmes textes
 * que les écrans biens et baux (`PropertyCard`, `LeaseDetailPage`) : un type ou
 * un statut ne doit pas s'appeler autrement selon l'écran. Valeur inconnue :
 * la valeur brute est affichée.
 */
export function propertyTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    APPARTEMENT: t('Appartement'),
    MAISON_VILLA: t('Maison / Villa'),
    STUDIO: t('Studio'),
    DUPLEX_TRIPLEX: t('Duplex / Triplex'),
    CHAMBRE_COLOCATION: t('Chambre / Colocation'),
    BUREAU: t('Bureau'),
    BOUTIQUE_COMMERCIAL: t('Boutique / Commercial'),
    ENTREPOT_INDUSTRIEL: t('Entrepôt / Industriel'),
    TERRAIN: t('Terrain'),
    IMMEUBLE: t('Immeuble'),
    PARKING_BOX: t('Parking / Box'),
    LOT_PROGRAMME_NEUF: t('Lot programme neuf')
  };
  return labels[value] ?? value;
}

export function propertyStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    DRAFT: t('Brouillon'),
    UNDER_REVIEW: t('En révision'),
    AVAILABLE: t('Disponible'),
    RESERVED: t('Réservé'),
    UNDER_OFFER: t('Sous offre'),
    RENTED: t('Loué'),
    SOLD: t('Vendu'),
    ARCHIVED: t('Archivé')
  };
  return labels[value] ?? value;
}

export function leaseStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    DRAFT: t('Brouillon'),
    ACTIVE: t('Actif'),
    SUSPENDED: t('Suspendu'),
    ENDED: t('Terminé'),
    CANCELED: t('Annulé')
  };
  return labels[value] ?? value;
}

/** Montant reçu du serveur sous forme de chaîne : séparateurs de milliers selon la langue active. */
export function formatCopilotAmount(amount: string | number | null): string {
  if (amount === null || amount === '') return '';
  const n = Number(amount);
  return Number.isFinite(n) ? n.toLocaleString(activeLocale()) : String(amount);
}

/**
 * Libellé d'état d'un outil du copilote (« en cours »). La passerelle générique
 * (`list_capabilities`, `call_read`) consulte n'importe quel écran en lecture :
 * le texte le dit, sans prétendre écrire quoi que ce soit.
 */
export function copilotToolLabel(tool: CopilotToolName): string {
  const labels: Record<CopilotToolName, string> = {
    search_properties: t('Recherche de biens'),
    search_leases: t('Recherche de baux'),
    list_lease_documents: t('Liste des documents du bail'),
    list_property_documents: t('Liste des documents du bien'),
    propose_rental_document: t('Préparation d’un document'),
    show_artifact: t('Affichage dans le panneau'),
    list_capabilities: t('Recherche dans les consultations disponibles'),
    call_read: t('Consultation d’une donnée')
  };
  return labels[tool];
}

const ENUM_CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

/**
 * Libellé d'une valeur d'énumération connue (type ou statut de bien, de bail, de
 * paiement…), réutilisant les textes des écrans. `null` si le texte n'est pas EXACTEMENT
 * un code connu : un nom, une référence ou une phrase ne sont jamais traduits.
 */
export function knownEnumLabel(value: string): string | null {
  if (!ENUM_CODE.test(value)) return null;
  const type = propertyTypeLabel(value);
  if (type !== value) return type;
  return statusLabel(value);
}
