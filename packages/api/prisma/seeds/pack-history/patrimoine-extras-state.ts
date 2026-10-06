/**
 * État partagé des blocs du complément PATRIMOINE : biens, baux et personnel de
 * l'agence relus en base (le générateur de base les a déjà écrits), plus
 * quelques gestes communs (document de bien avec fichier réel, auteur d'une
 * écriture).
 */
import type { Prisma, PropertyDocumentType } from '@prisma/client';
import { MembershipStatus } from '@prisma/client';
import { buildPdf, writeUpload } from './seed-files';
import { sha256, slug } from './patrimoine-extras-files';
import type { DocContent, PropFacts } from './patrimoine-extras-docs';
import { pick } from './types';
import type { HistoryContext } from './types';

export type PatPack = 'PATRIMOINE_ESSENTIEL' | 'PATRIMOINE_PRO';

export interface PatProperty {
  id: string;
  ref: string;
  title: string;
  type: string;
  address: string;
  zone: string;
  surface: number | null;
  status: string;
  createdAt: Date;
  assetId: string | null;
  acquisitionCost: number | null;
  legalStatus: string | null;
}

export interface PatLease {
  id: string;
  number: string;
  propertyId: string;
  clientId: string;
  userId: string;
  renterName: string;
  rent: number;
  service: number;
  deposit: number;
  status: string;
  start: Date;
  end: Date | null;
  moveOut: Date | null;
}

export interface PatState {
  ctx: HistoryContext;
  pack: PatPack;
  isPro: boolean;
  tenantId: string;
  /** Membres actifs (administrateur compris) : auteurs des écritures. */
  staff: string[];
  /** Titulaire du patrimoine, tel qu'il figure sur les actes. */
  ownerName: string;
  properties: PatProperty[];
  leases: PatLease[];
}

export const facts = (p: PatProperty): PropFacts => ({
  title: p.title,
  ref: p.ref,
  type: p.type,
  address: p.address,
  zone: p.zone,
  surface: p.surface
});

export const isCommercial = (type: string): boolean =>
  ['BUREAU', 'BOUTIQUE_COMMERCIAL', 'ENTREPOT_INDUSTRIEL'].includes(type);

export function author(s: PatState): string {
  return pick(s.ctx.rng, s.staff);
}

export function byRef(s: PatState, ref: string): PatProperty | undefined {
  return s.properties.find(p => p.ref === `PAT-${ref}`);
}

export async function loadState(ctx: HistoryContext, pack: PatPack): Promise<PatState> {
  const { prisma, tenantId, adminUserId } = ctx;
  const [members, admin, properties, assets, leases] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId, status: MembershipStatus.ACTIVE },
      select: { userId: true }
    }),
    prisma.user.findUnique({ where: { id: adminUserId }, select: { fullName: true } }),
    prisma.property.findMany({
      where: { tenantId },
      select: {
        id: true,
        internalReference: true,
        title: true,
        propertyType: true,
        address: true,
        locationZone: true,
        surfaceArea: true,
        status: true,
        createdAt: true
      },
      orderBy: { internalReference: 'asc' }
    }),
    prisma.asset.findMany({
      where: { tenantId, propertyId: { not: null } },
      select: { id: true, propertyId: true, acquisitionCost: true, details: true }
    }),
    prisma.rentalLease.findMany({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        lease_number: true,
        property_id: true,
        primary_renter_client_id: true,
        rent_amount: true,
        service_charge_amount: true,
        security_deposit_amount: true,
        status: true,
        start_date: true,
        end_date: true,
        move_out_date: true,
        primaryRenter: { select: { userId: true, user: { select: { fullName: true } } } }
      },
      orderBy: { lease_number: 'asc' }
    })
  ]);
  const assetByProp = new Map(assets.map(a => [a.propertyId as string, a]));
  return {
    ctx,
    pack,
    isPro: pack === 'PATRIMOINE_PRO',
    tenantId,
    staff: Array.from(new Set([adminUserId, ...members.map(m => m.userId)])),
    ownerName: admin?.fullName?.trim() || 'Le propriétaire',
    properties: properties.map(p => {
      const asset = assetByProp.get(p.id);
      const details = (asset?.details ?? {}) as { legalStatus?: string };
      return {
        id: p.id,
        ref: p.internalReference ?? p.id,
        title: p.title,
        type: p.propertyType,
        address: p.address ?? '',
        zone: p.locationZone ?? '',
        surface: p.surfaceArea === null ? null : Number(p.surfaceArea),
        status: p.status,
        createdAt: p.createdAt,
        assetId: asset?.id ?? null,
        acquisitionCost: asset?.acquisitionCost == null ? null : Number(asset.acquisitionCost),
        legalStatus: details.legalStatus ?? null
      };
    }),
    leases: leases.map(l => ({
      id: l.id,
      number: l.lease_number ?? l.id.slice(0, 8),
      propertyId: l.property_id,
      clientId: l.primary_renter_client_id,
      userId: l.primaryRenter?.userId ?? adminUserId,
      renterName: l.primaryRenter?.user?.fullName ?? 'Locataire',
      rent: Number(l.rent_amount),
      service: Number(l.service_charge_amount ?? 0),
      deposit: Number(l.security_deposit_amount ?? 0),
      status: l.status,
      start: l.start_date,
      end: l.end_date,
      moveOut: l.move_out_date
    }))
  };
}

export interface PropertyDocSpec {
  type: PropertyDocumentType;
  /** Nom affiché (avec extension). Sert aussi de clé d'idempotence avec le bien. */
  fileName: string;
  createdAt: Date;
  content?: DocContent;
  png?: Buffer;
  expiration?: Date | null;
  required?: boolean;
  warningSentAt?: Date | null;
}

/**
 * Document de bien avec fichier réel (`uploads/properties/<bien>/documents/`,
 * chemin servi par la route authentifiée des documents de bien). Idempotent
 * par (bien, nom affiché) : renvoie l'id existant ou celui qui vient d'être créé.
 */
export async function putPropertyDoc(
  s: PatState,
  property: { id: string },
  spec: PropertyDocSpec
): Promise<{ id: string; created: boolean }> {
  const { prisma, tenantId, end } = s.ctx;
  const existing = await prisma.propertyDocument.findFirst({
    where: { tenantId, propertyId: property.id, fileName: spec.fileName },
    select: { id: true }
  });
  if (existing) return { id: existing.id, created: false };

  const buffer = spec.png ?? buildPdf(spec.content?.title ?? spec.fileName, spec.content?.lines ?? []);
  const ext = spec.png ? 'png' : 'pdf';
  const stored = `${spec.type}-${slug(spec.fileName.replace(/\.[a-z]+$/i, ''))}-${sha256(buffer).slice(0, 8)}.${ext}`;
  const file = await writeUpload(['properties', property.id, 'documents'], stored, buffer);
  const row = await prisma.propertyDocument.create({
    data: {
      propertyId: property.id,
      tenantId,
      documentType: spec.type,
      filePath: file.filePath,
      fileUrl: file.fileUrl,
      fileName: spec.fileName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
      expirationDate: spec.expiration ?? null,
      warningSentAt: spec.warningSentAt ?? null,
      isRequired: spec.required ?? false,
      isValid: spec.expiration ? spec.expiration.getTime() > end.getTime() : true,
      createdAt: spec.createdAt
    } satisfies Prisma.PropertyDocumentUncheckedCreateInput,
    select: { id: true }
  });
  return { id: row.id, created: true };
}
