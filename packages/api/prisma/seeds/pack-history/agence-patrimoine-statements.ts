/**
 * Relevés de gérance sur 36 mois.
 *
 * Le générateur de base n'avait produit les relevés que des 12 derniers mois alors que les
 * loyers courent sur 36. Ce bloc génère, par le service du produit (`generateOwnerStatement`,
 * qui relit les loyers réellement encaissés de la période, les honoraires et les charges),
 * les relevés des 24 mois précédents pour chaque propriétaire, sur les biens de ses relevés
 * existants. Tous sont réglés (les relevés anciens ont été payés au propriétaire) et chacun
 * reçoit son reversement, écrit comme `createOwnerPayout` (ligne de reversement, mouvement au
 * compte du propriétaire, écriture au grand livre), dans la limite du solde dû au propriétaire.
 */
import { Prisma } from '@prisma/client';
import { runWithTenantContext } from '../../../src/utils/tenant-context';
import { between, neutralizeOutbound } from './types';
import type { HistoryContext } from './types';
import { addDaysTo, addMonths, firstOfMonth, periodOf } from './agence-plan';
import { noonUtc, pickOne, pickWeighted, ym } from './agence-locatif-base';

/** Mois (avant maintenant) couverts : les 12 derniers sont déjà faits par le générateur de base. */
const FROM_AGO = 36;
const TO_AGO = 13;

interface Planned {
  statementId: string;
  period: string;
  ownerClientId: string;
  amount: number;
  paidAt: Date;
}

export async function seedStatements36(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, end, log } = ctx;
  neutralizeOutbound();
  const { generateOwnerStatement, updateOwnerStatement } = await import('../../../src/lib/patrimoine/queries');

  const owners = await prisma.tenantClient.findMany({
    where: { tenantId, clientType: 'OWNER' },
    select: { id: true, details: true, user: { select: { fullName: true } } },
    orderBy: { createdAt: 'asc' }
  });

  let generated = 0;
  let failed = 0;
  await runWithTenantContext({ tenantId, userId: ctx.adminUserId }, async () => {
    for (const owner of owners) {
      const contactId = (owner.details as { crmContactId?: string } | null)?.crmContactId;
      if (!contactId) continue;
      // Biens du propriétaire : ceux de ses relevés existants, à défaut ses quotes-parts.
      const recent = await prisma.ownerStatement.findFirst({
        where: { tenantId, ownerContactId: contactId },
        orderBy: { period: 'desc' },
        select: { propertyIds: true }
      });
      let propertyIds = recent?.propertyIds ?? [];
      if (propertyIds.length === 0) {
        const shares = await prisma.propertyOwnershipShare.findMany({
          where: { tenantId, ownerClientId: owner.id },
          select: { propertyId: true }
        });
        propertyIds = shares.map(s => s.propertyId);
      }
      if (propertyIds.length === 0) continue;
      const firstLease = await prisma.rentalLease.aggregate({
        where: { tenant_id: tenantId, property_id: { in: propertyIds } },
        _min: { start_date: true }
      });
      const firstStart = firstLease._min.start_date;
      if (!firstStart) continue;

      for (let m = FROM_AGO; m >= TO_AGO; m--) {
        const monthStart = firstOfMonth(end, m);
        if (addMonths(monthStart, 1) <= firstStart) continue;
        const period = periodOf(monthStart);
        const exists = await prisma.ownerStatement.findUnique({
          where: { tenantId_ownerContactId_period: { tenantId, ownerContactId: contactId, period } },
          select: { id: true }
        });
        if (exists) continue;
        try {
          const statement = await generateOwnerStatement(tenantId, { ownerContactId: contactId, period, propertyIds });
          if (!statement) continue;
          const sentAt = addDaysTo(addMonths(monthStart, 1), 2);
          const paidAt = addDaysTo(addMonths(monthStart, 1), 8);
          await updateOwnerStatement(tenantId, statement.id, { status: 'PAID', paidAt });
          await prisma.ownerStatement.update({ where: { id: statement.id }, data: { sentAt, createdAt: sentAt } });
          generated += 1;
        } catch (error) {
          failed += 1;
          log(
            `relevés 36 mois : relevé ${period} de ${owner.user.fullName ?? owner.id} ignoré — ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  });
  log(`relevés 36 mois : ${generated} relevé(s) généré(s) et réglé(s)${failed ? `, ${failed} en échec` : ''}.`);
}

/** Reversements des relevés réglés de plus de 12 mois qui n'en ont pas encore. */
export async function seedOldStatementPayouts(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, rng, end, log } = ctx;
  const cutoff = periodOf(firstOfMonth(end, 12));
  const pending = await prisma.ownerStatement.findMany({
    where: { tenantId, status: 'PAID', paidAt: { not: null }, period: { lt: cutoff } },
    orderBy: { paidAt: 'asc' },
    select: { id: true, period: true, netAmount: true, paidAt: true, propertyIds: true }
  });
  const paidIds = new Set(
    (
      await prisma.ownerPayout.findMany({
        where: { tenantId, statementId: { not: null } },
        select: { statementId: true }
      })
    ).map(p => p.statementId as string)
  );
  const todo = pending.filter(s => !paidIds.has(s.id) && Number(s.netAmount) > 0);
  if (todo.length === 0) {
    log('reversements 36 mois : aucun relevé ancien sans reversement.');
    return;
  }

  neutralizeOutbound();
  const { prisma: appPrisma } = await import('../../../src/utils/database');
  const { getOrCreateOwnerAccountTx, OWNER_SOURCE } = await import('../../../src/lib/owner-account/sync');
  const { ensureRentalAccountsTx, journalResolver } = await import('../../../src/lib/owner-account/accounts');
  const { resolveTreasuryAccountTx } = await import('../../../src/lib/treasury/accounts');
  const { postDocumentEntryTx } = await import('../../../src/lib/finance/accounting');
  const { appendThirdPartyMovementTx } = await import('../../../src/lib/finance/ledger');
  const { getAgencyFinanceSettings } = await import('../../../src/lib/settings/finance-settings');
  const { syncAllOwnerAccounts } = await import('../../../src/lib/owner-account/service');

  await runWithTenantContext({ tenantId, userId: ctx.adminUserId }, async () => {
    await syncAllOwnerAccounts(tenantId);
    const shares = await prisma.propertyOwnershipShare.findMany({
      where: { tenantId },
      select: { propertyId: true, ownerClientId: true }
    });
    const ownerByProperty = new Map(shares.map(s => [s.propertyId, s.ownerClientId]));
    const accounts = await prisma.thirdPartyAccount.findMany({
      where: { tenantId, kind: 'OWNER' },
      select: { tenantClientId: true, balance: true }
    });
    // Solde stocké négatif quand l'agence doit de l'argent au propriétaire.
    const remaining = new Map<string, number>(accounts.map(a => [a.tenantClientId as string, -Number(a.balance)]));

    const planned: Planned[] = [];
    for (const st of todo) {
      const ownerClientId = st.propertyIds.map(id => ownerByProperty.get(id)).find(Boolean);
      if (!ownerClientId || !st.paidAt) continue;
      planned.push({
        statementId: st.id,
        period: st.period,
        ownerClientId,
        amount: Number(st.netAmount),
        paidAt: noonUtc(st.paidAt)
      });
    }

    const settings = await getAgencyFinanceSettings(tenantId);
    const lastSequence = await prisma.ownerPayout.groupBy({
      by: ['year'],
      where: { tenantId },
      _max: { sequence: true }
    });
    const sequenceByYear = new Map<number, number>(lastSequence.map(r => [r.year, r._max.sequence ?? 0]));
    const staff = (
      await prisma.membership.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: { userId: true }
      })
    ).map(m => m.userId);
    const authors = staff.length > 0 ? staff : [ctx.adminUserId];
    let created = 0;
    let skipped = 0;
    for (let i = 0; i < planned.length; i++) {
      const p = planned[i];
      const due = remaining.get(p.ownerClientId) ?? 0;
      if (p.amount > due) {
        skipped += 1;
        continue;
      }
      const year = p.paidAt.getUTCFullYear();
      const sequence = (sequenceByYear.get(year) ?? 0) + 1;
      sequenceByYear.set(year, sequence);
      const number = `REV-${year}-${String(sequence).padStart(4, '0')}`;
      const method = pickWeighted(rng, [
        ['BANK_TRANSFER', 62],
        ['MOBILE_MONEY', 18],
        ['CHECK', 12],
        ['CASH', 8]
      ] as const);
      const author = pickOne(rng, authors);
      const reference = `VIR-${ym(p.paidAt).replace('-', '')}-${String(between(rng, 100, 899))}`;
      await appPrisma.$transaction(async tx => {
        const account = await getOrCreateOwnerAccountTx(tx, tenantId, p.ownerClientId);
        const row = await tx.ownerPayout.create({
          data: {
            tenantId,
            ownerClientId: p.ownerClientId,
            accountId: account.id,
            year,
            sequence,
            amount: new Prisma.Decimal(p.amount),
            paidAt: p.paidAt,
            method,
            reference,
            notes: `Reversement du relevé de gérance ${p.period}.`,
            statementId: p.statementId,
            createdByUserId: author,
            createdAt: p.paidAt
          }
        });
        await appendThirdPartyMovementTx(tx, {
          tenantId,
          accountId: account.id,
          type: 'PAYOUT',
          billed: p.amount,
          settled: 0,
          movementDate: p.paidAt,
          label: `Reversement ${number}`,
          sourceType: OWNER_SOURCE.PAYOUT,
          sourceId: row.id,
          leaseId: null
        } as never);
        const ledger = await ensureRentalAccountsTx(tx, tenantId, settings);
        const treasury = await resolveTreasuryAccountTx(tx, tenantId, { method });
        const journalFor = journalResolver(tx, tenantId);
        await postDocumentEntryTx(tx, {
          tenantId,
          journalId: await journalFor(p.paidAt, treasury.journal),
          entryDate: p.paidAt,
          reference: number,
          description: `Reversement ${number} au propriétaire`,
          documentType: 'OWNER_PAYOUT',
          documentId: row.id,
          lines: [
            {
              accountId: ledger.ownerFunds,
              debit: p.amount,
              label: `Reversement ${number}`,
              thirdPartyAccountId: account.id,
              fundsNature: 'CURRENT'
            },
            { accountId: treasury.chartOfAccountId, credit: p.amount, label: `Reversement ${number}` }
          ]
        } as never);
      });
      remaining.set(p.ownerClientId, due - p.amount);
      created += 1;
    }
    log(`reversements 36 mois : ${created} reversement(s) écrit(s), ${skipped} ignoré(s) (solde dû insuffisant).`);
  });
}
