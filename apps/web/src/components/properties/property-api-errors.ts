/**
 * Lecture d'un refus de l'API sur l'enregistrement ou la publication d'un bien.
 *
 * Le serveur répond `{ message, errors: [{ field, message }] }`. Le formulaire
 * lisait `response.data.error`, qui n'existe pas : l'écran n'affichait que
 * « Erreur lors de l'enregistrement », sans désigner le champ fautif
 * (BUG-2026-09-28-013).
 */
import { t } from '../../i18n/t';

export interface ApiFieldError {
  field: string;
  message: string;
}

interface ApiErrorBody {
  message?: string;
  errors?: Array<{ field?: string; message?: string }>;
}

/** Libellés visibles des champs du formulaire, pour nommer le champ fautif. */
const FIELD_LABELS: Record<string, () => string> = {
  title: () => t('Titre du bien'),
  description: () => t('Description'),
  address: () => t('Adresse'),
  locationZone: () => t('Quartier/Zone (optionnel)'),
  latitude: () => t('Latitude'),
  longitude: () => t('Longitude'),
  ownerUserId: () => t('Propriétaire'),
  status: () => t('Statut'),
  availability: () => t('Disponibilité'),
  surfaceArea: () => t('Surface principale (m²)'),
  surfaceUseful: () => t('Surface utile (m²)'),
  surfaceTerrain: () => t('Surface terrain (m²)'),
  rooms: () => t('Nombre de pièces'),
  bedrooms: () => t('Chambres'),
  bathrooms: () => t('Salles de bain / WC'),
  furnishingStatus: () => t('Meublé')
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field]?.() ?? field;
}

/** Les erreurs par champ d'une réponse d'API (liste vide si elle n'en porte pas). */
export function apiFieldErrors(error: unknown): ApiFieldError[] {
  const body = (error as { response?: { data?: ApiErrorBody } })?.response?.data;
  if (!body || !Array.isArray(body.errors)) return [];
  return body.errors
    .filter(entry => entry && entry.field && entry.message)
    .map(entry => ({ field: String(entry.field), message: String(entry.message) }));
}

/**
 * Texte d'erreur à afficher : un champ par ligne (« Meublé : … ») quand l'API
 * en désigne, sinon son message, sinon le repli fourni.
 */
export function apiErrorText(error: unknown, fallback: string): string {
  const fields = apiFieldErrors(error);
  if (fields.length > 0) {
    return fields.map(entry => `${fieldLabel(entry.field)} : ${entry.message}`).join('\n');
  }
  const body = (error as { response?: { data?: ApiErrorBody } })?.response?.data;
  return body?.message || fallback;
}
