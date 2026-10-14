/**
 * Côté propriétaires : réglages du portail propriétaire, statut fiscal et retenue
 * à la source sur loyers (matérialisée par la synchronisation des comptes
 * propriétaires du produit), puis reversements liés aux relevés déjà générés.
 *
 * Les reversements reprennent exactement la transaction de `createOwnerPayout`
 * (ligne de reversement, mouvement au compte du propriétaire, écriture au grand
 * livre) sans rejouer la synchronisation complète du compte à chaque ligne, qui
 * coûterait plusieurs secondes par reversement ; le solde dû est vérifié ici,
 * propriétaire par propriétaire.
 */
import { Prisma } from '@prisma/client';
import { between } from './types';
import { noonUtc, pickOne, pickWeighted, plusDays, roundTo, ym } from './agence-locatif-base';
import type { LocatifBase } from './agence-locatif-base';

export async function seedOwnerPortalSettings(base: LocatifBase): Promise<void> {
  const { prisma, tenantId, log } = base.ctx;
  const existing = await prisma.ownerPortalSettings.findUnique({ where: { tenantId }, select: { id: true } });
  if (existing) return;
  await prisma.ownerPortalSettings.create({
    data: {
      tenantId,
      patrimonyEnabled: true,
      patrimonyShowValuation: true,
      patrimonyShowYield: true,
      patrimonyShowLoans: false,
      patrimonyShowWorks: true,
      patrimonyShowDocuments: true,
      updatedByUserId: base.signers[0].id,
      createdAt: base.ctx.start
    }
  });
  log('portail propriétaire : réglages enregistrés.');
}

/** Statut fiscal des propriétaires, retenue à la source activée, puis comptes propriétaires à jour. */
export async function seedWithholdings(base: LocatifBase): Promise<void> {
  const { prisma, tenantId, end, log } = base.ctx;
  if ((await prisma.rentWithholding.count({ where: { tenantId } })) > 0) {
    log('retenues à la source : déjà présentes, bloc sauté.');
    return;
  }

  const owners = await prisma.tenantClient.findMany({
    where: { tenantId, clientType: 'OWNER' },
    select: { id: true, ownerTaxStatus: true },
    orderBy: { id: 'asc' }
  });
  const pattern = [
    'INDIVIDUAL',
    'INDIVIDUAL',
    'COMPANY',
    'INDIVIDUAL',
    'EXEMPT',
    'COMPANY',
    'INDIVIDUAL',
    'INDIVIDUAL'
  ] as const;
  for (let i = 0; i < owners.length; i++) {
    if (owners[i].ownerTaxStatus) continue;
    const status = i === owners.length - 1 && owners.length > 6 ? null : pattern[i % pattern.length];
    await prisma.tenantClient.update({ where: { id: owners[i].id, tenantId }, data: { ownerTaxStatus: status } });
  }

  const startsOn = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 22, 1));
  const settings = await prisma.agencyFinanceSettings.findUnique({ where: { tenantId }, select: { id: true } });
  if (settings) {
    await prisma.agencyFinanceSettings.update({
      where: { tenantId },
      data: { withholdingEnabled: true, withholdingStartsOn: startsOn }
    });
  } else {
    await prisma.agencyFinanceSettings.create({
      data: { tenantId, withholdingEnabled: true, withholdingStartsOn: startsOn }
    });
  }

  const { syncAllOwnerAccounts } = await import('../../../src/lib/owner-account/service');
  await syncAllOwnerAccounts(tenantId);
  const rows = await prisma.rentWithholding.count({ where: { tenantId } });
  log(`retenues à la source : ${rows} retenues sur loyers, comptes propriétaires synchronisés.`);
}

interface PlannedPayout {
  ownerClientId: string;
  amount: number;
  paidAt: Date;
  statementId: string | null;
  statementPeriod: string | null;
  notes: string | null;
}

export async function seedOwnerPayouts(base: LocatifBase): Promise<void> {
  const { prisma, tenantId, rng, end, log } = base.ctx;
  if ((await prisma.ownerPayout.count({ where: { tenantId } })) > 0) {
    log('reversements propriétaires : déjà présents, bloc sauté.');
    return;
  }

  const { prisma: appPrisma } = await import('../../../src/utils/database');
  const { getOrCreateOwnerAccountTx, OWNER_SOURCE, reverseDocumentEntryTx } =
    await import('../../../src/lib/owner-account/sync');
  const { ensureRentalAccountsTx, journalResolver } = await import('../../../src/lib/owner-account/accounts');
  const { resolveTreasuryAccountTx } = await import('../../../src/lib/treasury/accounts');
  const { postDocumentEntryTx } = await import('../../../src/lib/finance/accounting');
  const { appendThirdPartyMovementTx } = await import('../../../src/lib/finance/ledger');
  const { getAgencyFinanceSettings } = await import('../../../src/lib/settings/finance-settings');
  const { syncAllOwnerAccounts } = await import('../../../src/lib/owner-account/service');

  // Les comptes propriétaires doivent exister et être à jour avant de les débiter.
  await syncAllOwnerAccounts(tenantId);

  // Propriétaire de chaque relevé : celui des biens du relevé (quote-part).
  const shares = await prisma.propertyOwnershipShare.findMany({
    where: { tenantId },
    select: { propertyId: true, ownerClientId: true }
  });
  const ownerByProperty = new Map(shares.map(s => [s.propertyId, s.ownerClientId]));
  const statements = await prisma.ownerStatement.findMany({
    where: { tenantId, status: 'PAID', paidAt: { not: null } },
    orderBy: { paidAt: 'asc' },
    select: { id: true, period: true, netAmount: true, paidAt: true, propertyIds: true }
  });

  const accounts = await prisma.thirdPartyAccount.findMany({
    where: { tenantId, kind: 'OWNER' },
    select: { tenantClientId: true, balance: true }
  });
  // Convention : le solde stocké est négatif quand l'agence doit de l'argent au propriétaire.
  const remaining = new Map<string, number>(accounts.map(a => [a.tenantClientId as string, -Number(a.balance)]));

  const planned: PlannedPayout[] = [];
  for (const st of statements) {
    const ownerId = st.propertyIds.map(id => ownerByProperty.get(id)).find(Boolean);
    const net = Number(st.netAmount);
    if (!ownerId || net <= 0 || !st.paidAt) continue;
    planned.push({
      ownerClientId: ownerId,
      amount: net,
      paidAt: noonUtc(st.paidAt),
      statementId: st.id,
      statementPeriod: st.period,
      notes: `Reversement du relevé de gérance ${st.period}.`
    });
  }
  // Quelques avances demandées par les propriétaires, hors relevé (dont deux récentes).
  const ownerIds = Array.from(remaining.keys());
  const advanceNotes = [
    'Avance sur loyers à la demande du propriétaire (frais de scolarité).',
    'Avance exceptionnelle sur les loyers du trimestre.',
    'Avance pour travaux de ravalement de l’immeuble.',
    'Avance sur loyers avant la fin du mois.'
  ];
  advanceNotes.forEach((notes, i) => {
    if (ownerIds.length === 0) return;
    const ownerClientId = ownerIds[(i * 5 + 1) % ownerIds.length];
    const daysAgo = i < 2 ? between(rng, 3, 24) : between(rng, 120, 400);
    planned.push({
      ownerClientId,
      amount: roundTo(between(rng, 250_000, 900_000), 10_000),
      paidAt: noonUtc(plusDays(end, -daysAgo)),
      statementId: null,
      statementPeriod: null,
      notes
    });
  });
  planned.sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());

  const settings = await getAgencyFinanceSettings(tenantId);
  const sequenceByYear = new Map<number, number>();
  const label = (year: number, sequence: number) => `REV-${year}-${String(sequence).padStart(4, '0')}`;
  const adminId = base.signers[0].id;
  let created = 0;
  let voided = 0;
  let skipped = 0;

  const createPayout = async (p: PlannedPayout, paidAt: Date, reference: string, voidIt: boolean) => {
    const year = paidAt.getUTCFullYear();
    const sequence = (sequenceByYear.get(year) ?? 0) + 1;
    sequenceByYear.set(year, sequence);
    const method = pickWeighted(rng, [
      ['BANK_TRANSFER', 62],
      ['MOBILE_MONEY', 18],
      ['CHECK', 12],
      ['CASH', 8]
    ] as const);
    const number = label(year, sequence);
    const author = pickOne(rng, base.signers).id;
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
          paidAt,
          method,
          reference,
          notes: p.notes,
          statementId: p.statementId,
          createdByUserId: author,
          createdAt: paidAt
        }
      });
      await appendThirdPartyMovementTx(tx, {
        tenantId,
        accountId: account.id,
        type: 'PAYOUT',
        billed: p.amount,
        settled: 0,
        movementDate: paidAt,
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
        journalId: await journalFor(paidAt, treasury.journal),
        entryDate: paidAt,
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
      if (voidIt) {
        const voidedAt = plusDays(paidAt, 2);
        const reason = 'Virement rejeté par la banque du propriétaire : RIB à corriger.';
        await tx.ownerPayout.update({
          where: { id: row.id, tenantId },
          data: { status: 'VOIDED', voidReason: reason, voidedAt, voidedByUserId: adminId }
        });
        await appendThirdPartyMovementTx(tx, {
          tenantId,
          accountId: account.id,
          type: 'VOID',
          billed: 0,
          settled: p.amount,
          movementDate: voidedAt,
          label: `Annulation du reversement ${number} — ${reason}`,
          sourceType: OWNER_SOURCE.PAYOUT,
          sourceId: row.id,
          leaseId: null
        } as never);
        await reverseDocumentEntryTx(tx, {
          tenantId,
          documentType: 'OWNER_PAYOUT',
          documentId: row.id,
          entryDate: voidedAt,
          description: `Annulation du reversement ${number} : ${reason}`,
          journalFor
        });
      }
    });
  };

  let voidBudget = 2;
  for (let i = 0; i < planned.length; i++) {
    const p = planned[i];
    const due = remaining.get(p.ownerClientId) ?? 0;
    if (p.amount > due) {
      skipped += 1;
      continue;
    }
    const ref = `VIR-${ym(p.paidAt).replace('-', '')}-${String(i + 1).padStart(3, '0')}`;
    const voidIt = voidBudget > 0 && p.statementId !== null && i % 53 === 17;
    try {
      await createPayout(p, p.paidAt, ref, voidIt);
      created += 1;
      if (voidIt) {
        voidBudget -= 1;
        voided += 1;
        // Réémis deux jours plus tard, RIB corrigé : le relevé redevient réglé.
        const again = new Date(Math.min(end.getTime(), plusDays(p.paidAt, 4).getTime()));
        await createPayout(p, again, `${ref}-R`, false);
        created += 1;
        remaining.set(p.ownerClientId, due - p.amount);
      } else {
        remaining.set(p.ownerClientId, due - p.amount);
      }
    } catch (error) {
      log(`reversement ${ref} ignoré — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  log(
    `reversements propriétaires : ${created} reversements (${voided} annulés puis réémis), ${skipped} ignorés (solde insuffisant).`
  );
}
