/**
 * Dérivation des entrées du moteur fiscal (lot P4, territoire A1).
 *
 * Contrat : section 2 de `p4-contrat.md`. Fonctions pures.
 */

import type { CountrySource, FiscalCountry, HoldingEntityForm, Occupancy, OwnerKind, PropertyKind } from './types';

/**
 * Statut bâti/non bâti : le profil fiscal est prioritaire ; sinon un bien de
 * type `TERRAIN` est non bâti, tout le reste est bâti.
 */
export function deriveBuiltStatus(
  propertyType: string | null | undefined,
  profileBuilt: PropertyKind | null | undefined
): PropertyKind {
  if (profileBuilt) return profileBuilt;
  if (propertyType === 'TERRAIN') return 'UNBUILT';
  return 'BUILT';
}

/**
 * Occupation : le profil fiscal est prioritaire ; sinon un loyer positif
 * signifie loué, faute de quoi le bien est considéré vacant.
 */
export function deriveOccupancy(annualRent: number, profileOccupancy: Occupancy | null | undefined): Occupancy {
  if (profileOccupancy) return profileOccupancy;
  return annualRent > 0 ? 'RENTED' : 'VACANT';
}

/**
 * Type de propriétaire fiscal d'une entité détentrice : la surcharge
 * `fiscalOwnerKind` prime ; sinon `INDIVIDUAL` reste `INDIVIDUAL`, toute
 * autre forme juridique devient `COMPANY`.
 */
export function ownerKindOf(entity: { legalForm: HoldingEntityForm; fiscalOwnerKind: OwnerKind | null }): OwnerKind {
  if (entity.fiscalOwnerKind) return entity.fiscalOwnerKind;
  return entity.legalForm === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'COMPANY';
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toUpperCase();
}

const CI_ALIASES = new Set(['CI', 'COTEDIVOIRE', 'IVORYCOAST']);
const ML_ALIASES = new Set(['ML', 'MALI']);

/**
 * Normalise un texte de pays libre en code ISO du moteur (`CI` ou `ML`),
 * insensible à la casse, aux accents et aux apostrophes. Toute autre valeur
 * (y compris vide ou absente) retourne `null`.
 */
export function normalizeCountry(text: string | null | undefined): FiscalCountry | null {
  if (!text) return null;
  const folded = fold(text);
  if (!folded) return null;
  if (CI_ALIASES.has(folded)) return 'CI';
  if (ML_ALIASES.has(folded)) return 'ML';
  return null;
}

export interface ResolveTaxCountryArgs {
  query?: FiscalCountry | null;
  profile?: FiscalCountry | null;
  entityCountries?: FiscalCountry[];
  agencyCountry?: string | null;
}

export interface ResolveTaxCountryResult {
  country: FiscalCountry | null;
  countrySource: CountrySource | null;
}

/**
 * Résout le pays fiscal applicable, par ordre de priorité : requête, puis
 * profil fiscal du bien, puis pays des entités détentrices (si elles
 * partagent toutes le même pays et qu'il y en a au moins une), puis pays de
 * l'agence (normalisé).
 */
export function resolveTaxCountry(args: ResolveTaxCountryArgs): ResolveTaxCountryResult {
  if (args.query) {
    return { country: args.query, countrySource: 'QUERY' };
  }
  if (args.profile) {
    return { country: args.profile, countrySource: 'PROFILE' };
  }
  const entityCountries = args.entityCountries ?? [];
  if (entityCountries.length > 0) {
    const first = entityCountries[0];
    const allSame = entityCountries.every(country => country === first);
    if (allSame) {
      return { country: first, countrySource: 'ENTITY' };
    }
  }
  const agencyCountry = normalizeCountry(args.agencyCountry);
  if (agencyCountry) {
    return { country: agencyCountry, countrySource: 'AGENCY' };
  }
  return { country: null, countrySource: null };
}
