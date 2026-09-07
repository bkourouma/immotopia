/**
 * Format d'affichage des propriétés : "Nom du propriétaire - Libellé de la propriété ( Immeuble )"
 * Même format que dans le formulaire de bail (LeaseForm) et la page /rental/leases/new.
 */
export interface PropertyDisplayInput {
  title?: string | null;
  internalReference?: string | null;
  owner?: { fullName?: string | null } | null;
  containerParent?: { title?: string | null } | null;
}

/**
 * Retourne le libellé d'affichage d'une propriété :
 * "Nom du propriétaire - Libellé ( Immeuble )" ou "Nom du propriétaire - Libellé" si pas d'immeuble.
 * Sans propriétaire : uniquement "Libellé ( Immeuble )" ou "Libellé" (jamais la référence interne type PROP-...).
 */
export function getPropertyDisplayLabel(property: PropertyDisplayInput | null | undefined): string {
  if (!property) return 'N/A';
  const ownerLabel = property.owner?.fullName?.trim() || '';
  const title = property.title?.trim() || property.internalReference || 'Sans libellé';
  const buildingPart = property.containerParent?.title?.trim() ? ` ( ${property.containerParent.title.trim()} )` : '';
  const titleWithBuilding = title + buildingPart;
  if (ownerLabel) {
    return `${ownerLabel} - ${titleWithBuilding}`;
  }
  return titleWithBuilding;
}
