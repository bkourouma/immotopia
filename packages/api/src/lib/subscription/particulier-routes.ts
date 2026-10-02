/**
 * Liste blanche des routes d'un espace PARTICULIER (lot 4, garde de type).
 * Pure : aucun acces base, aucune configuration.
 *
 * Un espace personnel est un tenant comme un autre pour l'API : son
 * administrateur porte les permissions de TENANT_ADMIN et atteindrait le CRM,
 * la copropriete, les chantiers, la finance, les invitations, la newsletter,
 * les notifications ou la passerelle de paiement de l'agence. Le garde
 * d'abonnement ne protege pas de cela : il n'agit qu'en mode `enforce`
 * (defaut `warn`). Ce garde-ci depend du TYPE de l'espace, jamais de
 * SUBSCRIPTION_ENFORCEMENT.
 *
 * Regle : DEFAUT REFUSE. Une route d'agence oubliee ici est refusee pour un
 * particulier ; la regle la plus specifique l'emporte (meme correspondance que
 * `route-features.ts`), si bien qu'une exception (`allow: false`) vit a cote de
 * sa regle generale. Le test `particulier-routes.test.ts` parcourt la pile
 * Express reelle et echoue si une route sensible devient accessible.
 *
 * Chemins relatifs a `/api/tenants/:tenantId`, segments `:param` = jokers.
 */

import { findBestRule } from './route-features';

export interface ParticulierRouteRule {
  prefix: string;
  /** Vrai : le chemin doit correspondre exactement (pas de sous-chemins). */
  exact?: boolean;
  allow: boolean;
  note?: string;
}

export const PARTICULIER_ROUTE_RULES: readonly ParticulierRouteRule[] = [
  { prefix: '/', exact: true, allow: true, note: "Fiche de l'espace (lecture, nom, coordonnees)." },
  { prefix: '/logo', allow: true },
  { prefix: '/dashboard', allow: true },
  { prefix: '/entitlements', allow: true, note: 'Le menu web lit les droits.' },
  { prefix: '/subscription', allow: true, note: 'Abonnement, factures, paiement et montee de palier.' },
  { prefix: '/patrimoine', allow: true },
  { prefix: '/work-programs', allow: true },
  { prefix: '/rental', allow: true, note: 'Location directe : baux, echeances, paiements.' },
  { prefix: '/documents', allow: true, note: 'Quittances et documents generes.' },
  { prefix: '/properties', allow: true, note: 'Biens, medias, documents, valorisations, prets.' },
  {
    prefix: '/clients',
    allow: true,
    note: 'Locataires et proprietaires rattaches a ses baux.'
  },
  { prefix: '/crm/contacts', allow: true, note: 'Contacts (locataires) des baux, du socle.' },
  { prefix: '/crm/contacts-search', allow: true },

  // Exceptions sous /properties : mise en marche et mandats d'agence.
  { prefix: '/properties/:propertyId/mandates', allow: false, note: "Mandats d'agence." },
  { prefix: '/properties/:propertyId/publish', allow: false, note: 'Publication en vitrine.' },
  { prefix: '/properties/:propertyId/unpublish', allow: false },
  { prefix: '/properties/:propertyId/visits', allow: false, note: 'Visites commerciales.' },
  { prefix: '/properties/visits', allow: false }
];

/** Vrai si un espace PARTICULIER peut atteindre ce chemin relatif (defaut : refuse). */
export function isRouteAllowedForParticulier(relativePath: string): boolean {
  return findBestRule(PARTICULIER_ROUTE_RULES, relativePath)?.allow === true;
}
