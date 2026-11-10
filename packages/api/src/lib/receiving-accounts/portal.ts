import type { Prisma } from '@prisma/client';
import { t } from '../../i18n';
import { NotFoundError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';
import type { PrivateFile } from '../files/private-files';
import { readQr } from './qr-files';
import type { CoOwnerReceivingAccountPublic, ReceivingAccountPublic } from './types';

/**
 * Lecture des comptes de réception par les portails (spec 048, lot Q, contrat §3).
 *
 * Seuls les comptes ACTIFS sont visibles. L'agence vient du contexte du portail
 * (jamais du client). Un compte inactif, d'une autre agence ou hors du périmètre
 * du payeur lève la même `NotFoundError` qu'un compte inexistant.
 */

const PORTAL_SELECT = {
  id: true,
  syndicateId: true,
  institution: true,
  scannableWith: true,
  alias: true,
  holderName: true,
  instructions: true,
  qrMimeType: true
} satisfies Prisma.ReceivingAccountSelect;

type PortalRow = Prisma.ReceivingAccountGetPayload<{ select: typeof PORTAL_SELECT }>;

const ORDER: Prisma.ReceivingAccountOrderByWithRelationInput[] = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];

export type PortalKind = 'tenant' | 'copropriete';

const notFound = () => new NotFoundError(t('Compte de réception introuvable.'));

function qrPath(portal: PortalKind, accountId: string): string {
  return `/api/portal/${portal}/receiving-accounts/${accountId}/qr`;
}

function toPublic(row: PortalRow, portal: PortalKind): ReceivingAccountPublic {
  const hasQr = row.qrMimeType !== null;
  return {
    id: row.id,
    institution: row.institution,
    scannableWith: row.scannableWith,
    alias: row.alias,
    holderName: row.holderName,
    instructions: row.instructions,
    hasQr,
    qrPath: hasQr ? qrPath(portal, row.id) : null
  };
}

/** Comptes actifs de l'agence (portée `AGENCY`), portail locataire. */
export async function listTenantPortalReceivingAccounts(tenantId: string): Promise<ReceivingAccountPublic[]> {
  const rows = await prisma.receivingAccount.findMany({
    where: { tenantId, scope: 'AGENCY', isActive: true },
    select: PORTAL_SELECT,
    orderBy: ORDER
  });
  return rows.map(row => toPublic(row, 'tenant'));
}

/**
 * Comptes actifs des copropriétés du périmètre du copropriétaire. `syndicateId`
 * restreint à une copropriété : elle doit être dans le périmètre, sinon 404.
 */
export async function listCoOwnerPortalReceivingAccounts(
  tenantId: string,
  scopeSyndicateIds: string[],
  syndicateId?: string
): Promise<CoOwnerReceivingAccountPublic[]> {
  if (syndicateId && !scopeSyndicateIds.includes(syndicateId)) {
    throw new NotFoundError(t('Copropriété introuvable ou inaccessible.'));
  }
  const syndicateIds = syndicateId ? [syndicateId] : scopeSyndicateIds;
  if (syndicateIds.length === 0) return [];
  const rows = await prisma.receivingAccount.findMany({
    where: { tenantId, scope: 'SYNDICATE', syndicateId: { in: syndicateIds }, isActive: true },
    select: PORTAL_SELECT,
    orderBy: ORDER
  });
  return rows.map(row => ({ ...toPublic(row, 'copropriete'), syndicateId: row.syndicateId as string }));
}

/** Image d'un compte actif de l'agence, portail locataire. */
export async function readTenantPortalReceivingAccountQr(tenantId: string, accountId: string): Promise<PrivateFile> {
  const row = await prisma.receivingAccount.findFirst({
    where: { id: accountId, tenantId, scope: 'AGENCY', isActive: true },
    select: { qrFileUrl: true }
  });
  if (!row?.qrFileUrl) throw notFound();
  return readQr(tenantId, row.qrFileUrl);
}

/** Image d'un compte actif d'une copropriété du périmètre, portail copropriétaire. */
export async function readCoOwnerPortalReceivingAccountQr(
  tenantId: string,
  scopeSyndicateIds: string[],
  accountId: string
): Promise<PrivateFile> {
  if (scopeSyndicateIds.length === 0) throw notFound();
  const row = await prisma.receivingAccount.findFirst({
    where: { id: accountId, tenantId, scope: 'SYNDICATE', syndicateId: { in: scopeSyndicateIds }, isActive: true },
    select: { qrFileUrl: true }
  });
  if (!row?.qrFileUrl) throw notFound();
  return readQr(tenantId, row.qrFileUrl);
}
