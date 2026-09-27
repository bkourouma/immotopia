import type { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import { resolveDocumentBranding } from '../documents/document-branding';
import { contactDisplayName } from './charge-receipt-snapshot';
import type { CoOwnerPortalScope } from './coowner-portal';
import { LOT_NOT_FOUND, lotInScope } from './coowner-portal-finance';
import type { CoOwnerStatementQuery } from './coowner-portal-schemas';
import { roundMoney } from './finance-utils';
import { buildOwnerAccountStatementPdf } from './owner-account-statement';

/**
 * Relevé de compte d'un lot en PDF, côté portail copropriétaire (lot S5).
 *
 * Même générateur que la gestion (`buildOwnerAccountStatementPdf`) avec
 * l'identité S1 (mandant de la copropriété, sinon l'agence). Deux
 * différences, voulues :
 *   - lecture seule : le compte n'est JAMAIS créé ici (la gestion le crée à
 *     sa première consultation) ; sans compte, le relevé sort vide, à zéro ;
 *   - le nom imprimé est celui de la fiche du copropriétaire connecté, pas
 *     celui du titulaire enregistré sur le compte.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Filtre `transactionDate` d'un relevé : `to` inclusif (jour entier). */
export function statementDateWhere(from?: Date, to?: Date): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lt: new Date(to.getTime() + DAY_MS) } : {})
  };
}

type StatementRow = {
  transactionDate: Date;
  type: string;
  label: string;
  debit: Prisma.Decimal | number | string | null;
  credit: Prisma.Decimal | number | string | null;
  balanceAfter: Prisma.Decimal | number | string;
};

/** Solde d'ouverture : avant le premier mouvement de la période, sinon le dernier solde antérieur. */
async function openingBalance(accountId: string, rows: StatementRow[], from?: Date): Promise<number> {
  if (rows.length > 0) {
    const first = rows[0];
    return roundMoney(Number(first.balanceAfter) - Number(first.debit ?? 0) + Number(first.credit ?? 0));
  }
  if (!from) return 0;
  const previous = await prisma.ownerAccountTransaction.findFirst({
    where: { accountId, transactionDate: { lt: from } },
    orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
    select: { balanceAfter: true }
  });
  return previous ? roundMoney(Number(previous.balanceAfter)) : 0;
}

async function loadStatementRows(accountId: string, query: CoOwnerStatementQuery): Promise<StatementRow[]> {
  const dates = statementDateWhere(query.from, query.to);
  return prisma.ownerAccountTransaction.findMany({
    where: { accountId, ...(dates ? { transactionDate: dates } : {}) },
    orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
    select: { transactionDate: true, type: true, label: true, debit: true, credit: true, balanceAfter: true }
  });
}

async function ownerNameOf(tenantId: string, contactId: string): Promise<string> {
  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId, tenantId },
    select: { firstName: true, lastName: true, legalName: true }
  });
  return contactDisplayName(contact) ?? 'Proprietaire';
}

export async function buildCoOwnerLotStatement(scope: CoOwnerPortalScope, lotId: string, query: CoOwnerStatementQuery) {
  const lotScope = lotInScope(scope, lotId);
  const lot = await prisma.syndicateLot.findFirst({
    where: { id: lotScope.lotId, syndicateId: lotScope.syndicateId },
    select: { id: true, lotNumber: true }
  });
  const syndicate = await prisma.syndicate.findFirst({
    where: { id: lotScope.syndicateId, tenantId: scope.tenantId },
    select: { id: true, name: true }
  });
  if (!lot || !syndicate) throw new NotFoundError(LOT_NOT_FOUND);

  const account = await prisma.ownerAccount.findFirst({
    where: { lotId: lot.id, syndicateId: syndicate.id },
    select: { id: true, currency: true }
  });
  const rows = account ? await loadStatementRows(account.id, query) : [];
  const opening = account ? await openingBalance(account.id, rows, query.from) : 0;
  const closing = rows.length > 0 ? roundMoney(Number(rows[rows.length - 1].balanceAfter)) : opening;

  const branding = await resolveDocumentBranding(scope.tenantId, syndicate.id);
  const buffer = await buildOwnerAccountStatementPdf(
    {
      syndicateName: syndicate.name,
      lotNumber: lot.lotNumber,
      ownerName: await ownerNameOf(scope.tenantId, lotScope.contactId),
      currency: account?.currency || 'XOF',
      openingBalance: opening,
      closingBalance: closing,
      transactions: rows.map(row => ({
        transactionDate: row.transactionDate,
        type: row.type,
        label: row.label,
        debit: row.debit === null ? null : Number(row.debit),
        credit: row.credit === null ? null : Number(row.credit),
        balanceAfter: Number(row.balanceAfter)
      }))
    },
    branding
  );
  const safeNumber = lot.lotNumber.replace(/[^A-Za-z0-9 _.-]/g, '-').trim() || 'lot';
  return { buffer, fileName: `Releve lot ${safeNumber}.pdf`, mimeType: 'application/pdf' };
}
