/**
 * Plafond implicite de l'API pour les sinistres d'un bien.
 *
 * `useInsuranceData` appelle `listInsuranceClaims({ propertyId })` sans `limit` :
 * l'API applique alors `DEFAULT_LIMIT` (200), défini dans
 * `packages/api/src/lib/patrimoine/insurance/claim-service.ts`. À garder aligné
 * avec cette valeur : au-delà, la liste du bien est tronquée.
 */
export const PROPERTY_CLAIMS_API_LIMIT = 200;
