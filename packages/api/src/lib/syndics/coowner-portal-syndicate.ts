import { prisma } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import {
  issuerFromMandant,
  issuerFromTenant,
  MANDANT_IDENTITY_SELECT,
  resolveDocumentBranding,
  TENANT_IDENTITY_SELECT,
  type DocumentIssuer
} from '../documents/document-branding';
import { readBrandingImage, type BrandingImage } from '../documents/branding-storage';
import { contactDisplayName } from './charge-receipt-snapshot';
import type { CoOwnerPortalScope } from './coowner-portal';

/**
 * Fiche d'une copropriété vue du portail copropriétaire (lot S5).
 *
 * Seulement une copropriété où le copropriétaire connecté a au moins un lot
 * ouvert au portail ; sinon 404, comme une copropriété inexistante. Rend
 * l'identité TEXTUELLE de l'émetteur des documents (mandant, sinon agence) et
 * deux drapeaux d'image. Jamais la signature ni le cachet, jamais une clé de
 * stockage : les deux images publiables (logo de la copropriété, logo de
 * l'émetteur) passent par leurs routes authentifiées.
 */

export const SYNDICATE_NOT_FOUND = 'Copropriété introuvable.';
const IMAGE_NOT_FOUND = 'Image introuvable.';

/** Chemins (relatifs à la base de l'API) des routes d'images du portail. */
export function coOwnerSyndicateLogoPath(syndicateId: string): string {
  return `/portal/copropriete/coproprietes/${syndicateId}/logo`;
}
export function coOwnerIssuerLogoPath(syndicateId: string): string {
  return `/portal/copropriete/coproprietes/${syndicateId}/logo-emetteur`;
}

function assertSyndicateInScope(scope: CoOwnerPortalScope, syndicateId: string): void {
  if (!scope.syndicateIds.includes(syndicateId)) throw new NotFoundError(SYNDICATE_NOT_FOUND);
}

async function loadSyndicate(scope: CoOwnerPortalScope, syndicateId: string) {
  assertSyndicateInScope(scope, syndicateId);
  const syndicate = await prisma.syndicate.findFirst({
    where: { id: syndicateId, tenantId: scope.tenantId },
    select: {
      id: true,
      name: true,
      address: true,
      registrationNo: true,
      cadastralReference: true,
      logoPath: true,
      mandatingAgencyId: true,
      syndicManagerId: true
    }
  });
  if (!syndicate) throw new NotFoundError(SYNDICATE_NOT_FOUND);
  return syndicate;
}

/** Émetteur des documents : identité textuelle et présence d'un logo. */
async function loadIssuer(tenantId: string, mandatingAgencyId: string | null) {
  const mandant = mandatingAgencyId
    ? await prisma.syndicMandatingAgency.findFirst({
        where: { id: mandatingAgencyId, tenantId },
        select: { ...MANDANT_IDENTITY_SELECT, logoPath: true }
      })
    : null;
  if (mandant) return { issuer: issuerFromMandant(mandant), hasLogo: Boolean(mandant.logoPath) };
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { ...TENANT_IDENTITY_SELECT, logoUrl: true }
  });
  return { issuer: issuerFromTenant(tenant), hasLogo: Boolean(tenant?.logoUrl) };
}

/** Coordonnées publiées : ni RCCM, ni numéro fiscal, ni raison sociale interne. */
function publicIssuer(issuer: DocumentIssuer) {
  return { kind: issuer.kind, name: issuer.name, address: issuer.address, phone: issuer.phone, email: issuer.email };
}

/** Contact du syndic (gestionnaire désigné sur la copropriété), s'il est de l'agence. */
async function loadSyndicContact(tenantId: string, contactId: string | null) {
  if (!contactId) return null;
  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId, tenantId },
    select: { firstName: true, lastName: true, legalName: true, email: true, phonePrimary: true }
  });
  if (!contact) return null;
  return {
    name: contactDisplayName(contact),
    email: contact.email?.trim() || null,
    phone: contact.phonePrimary?.trim() || null
  };
}

export async function getCoOwnerSyndicate(scope: CoOwnerPortalScope, syndicateId: string) {
  const syndicate = await loadSyndicate(scope, syndicateId);
  const [lotCount, myLots, issuer, syndicContact] = await Promise.all([
    prisma.syndicateLot.count({ where: { syndicateId: syndicate.id } }),
    prisma.syndicateLot.findMany({
      where: { syndicateId: syndicate.id, id: { in: scope.lotIds } },
      select: { id: true, lotNumber: true, lotType: true },
      orderBy: { lotNumber: 'asc' }
    }),
    loadIssuer(scope.tenantId, syndicate.mandatingAgencyId),
    loadSyndicContact(scope.tenantId, syndicate.syndicManagerId)
  ]);

  return {
    id: syndicate.id,
    name: syndicate.name,
    address: syndicate.address,
    registrationNo: syndicate.registrationNo ?? null,
    cadastralReference: syndicate.cadastralReference ?? null,
    lotCount,
    myLots,
    issuer: publicIssuer(issuer.issuer),
    syndicContact,
    hasLogo: Boolean(syndicate.logoPath),
    logoDownloadPath: syndicate.logoPath ? coOwnerSyndicateLogoPath(syndicate.id) : null,
    hasIssuerLogo: issuer.hasLogo,
    issuerLogoDownloadPath: issuer.hasLogo ? coOwnerIssuerLogoPath(syndicate.id) : null
  };
}

/** Logo de la copropriété (stockage privé). */
export async function readCoOwnerSyndicateLogo(scope: CoOwnerPortalScope, syndicateId: string): Promise<BrandingImage> {
  const syndicate = await loadSyndicate(scope, syndicateId);
  const image = await readBrandingImage(scope.tenantId, syndicate.logoPath);
  if (!image) throw new NotFoundError(IMAGE_NOT_FOUND);
  return image;
}

/** Logo de l'émetteur (mandant, sinon agence) — jamais sa signature ni son cachet. */
export async function readCoOwnerIssuerLogo(scope: CoOwnerPortalScope, syndicateId: string): Promise<BrandingImage> {
  const syndicate = await loadSyndicate(scope, syndicateId);
  const mandant = syndicate.mandatingAgencyId
    ? await prisma.syndicMandatingAgency.findFirst({
        where: { id: syndicate.mandatingAgencyId, tenantId: scope.tenantId },
        select: { logoPath: true }
      })
    : null;
  // Même règle que `loadIssuer` : le mandant s'il existe, sinon l'agence
  // (dont le logo public est lu par l'identité S1 sans copropriété).
  const image = mandant
    ? await readBrandingImage(scope.tenantId, mandant.logoPath)
    : (await resolveDocumentBranding(scope.tenantId, null)).issuerLogo;
  if (!image) throw new NotFoundError(IMAGE_NOT_FOUND);
  return image;
}
