/**
 * Forme d'une copropriété renvoyée au client (lot S1).
 *
 * La ligne Prisma porte `logoPath`, clé de stockage PRIVÉE : elle ne sort
 * jamais. À la place, `hasLogo`, l'URL d'API authentifiée du logo, et un
 * résumé de l'agence mandante (`{ id, name }` ou `null`). Fonction pure : les
 * lectures (`listSyndicatesByTenant`, `getSyndicateWithLotsAndStats`)
 * incluent déjà `mandatingAgency: { select: { id, name } }`.
 */

export interface SyndicateBrandingFields {
  hasLogo: boolean;
  logoUrl: string | null;
  mandatingAgencyId: string | null;
  mandatingAgency: { id: string; name: string } | null;
}

/** URL d'API (relative à `/api`) qui sert le logo d'une copropriété. */
export function syndicateLogoApiPath(tenantId: string, syndicateId: string): string {
  return `/tenants/${tenantId}/syndics/${syndicateId}/logo`;
}

type SyndicateRow = {
  id?: string;
  tenantId?: string;
  logoPath?: string | null;
  mandatingAgencyId?: string | null;
  mandatingAgency?: { id: string; name: string } | null;
};

export function toSyndicateResponse<T extends SyndicateRow>(
  row: T
): Omit<T, 'logoPath' | 'mandatingAgency'> & SyndicateBrandingFields {
  const { logoPath, mandatingAgency, ...rest } = row;
  const hasLogo = Boolean(logoPath);
  return {
    ...rest,
    mandatingAgencyId: row.mandatingAgencyId ?? null,
    mandatingAgency: mandatingAgency ? { id: mandatingAgency.id, name: mandatingAgency.name } : null,
    hasLogo,
    logoUrl: hasLogo && row.tenantId && row.id ? syndicateLogoApiPath(row.tenantId, row.id) : null
  };
}
