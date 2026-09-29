import { t } from '../../i18n/t';

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
