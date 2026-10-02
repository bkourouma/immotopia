import { requirePermission } from './rbac-middleware';

/**
 * Droits sur les donnees PERSONNELLES d'un espace patrimoine (actifs non
 * immobiliers, dettes, valorisations, entites detentrices, projections).
 *
 * Meme forme que `finance-rbac-middleware.ts` : un garde nomme par
 * permission, pose route par route. Ces droits ne sont PAS accordes aux roles
 * d'agence (TENANT_ADMIN, TENANT_MANAGER, TENANT_AGENT...) : ils vont au
 * role `PERSONAL_SPACE_OWNER` du proprietaire d'un espace PARTICULIER
 * (`lib/patrimoine/personal-permissions.ts`). Les donnees IMMOBILIERES (biens,
 * valorisations et prets d'un bien, rendement) restent sous `PROPERTIES_*`.
 *
 * `requirePermission` expose la cle sur le middleware (`permissionKey`) :
 * l'inventaire des routes la lit sans mock.
 */

/** Lire les donnees personnelles du patrimoine. */
export const requirePatrimoinePersonalView = requirePermission('PATRIMOINE_PERSONAL_VIEW');

/** Creer, modifier ou supprimer les donnees personnelles du patrimoine. */
export const requirePatrimoinePersonalEdit = requirePermission('PATRIMOINE_PERSONAL_EDIT');
