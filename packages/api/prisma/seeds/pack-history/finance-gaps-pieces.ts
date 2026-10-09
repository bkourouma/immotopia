/**
 * Trous de finance, partie 3 : pièces en attente et diversité des statuts.
 *
 *  - file de validation (« Pièces à valider ») : factures fournisseur en
 *    brouillon, règlement fournisseur non validé et, pour les agences à
 *    chantiers, bons de caisse en brouillon, saisis par PLUSIEURS membres, à des
 *    âges variés (le filtre « Saisi par » s'appuie sur eux) ;
 *  - factures fournisseur partiellement payées (le seed de base n'en avait que
 *    des soldées ou des impayées) ;
 *  - bons de commande (agences à chantiers) : brouillon, émis non facturé,
 *    partiellement facturé, annulé avec motif, en plus des bons soldés ;
 *  - journal des achats : les écritures des factures fournisseurs passent du
 *    journal général au journal « charges » (l'application distingue ses
 *    journaux par code, un seul n'était jamais plus qu'un fourre-tout).
 *
 * Tout passe par les vrais services (`createSupplierInvoiceTx`,
 * `createSupplierPaymentTx`, `createPurchaseOrderTx`…). Seules les dates, que
 * les services ne laissent pas choisir, sont ramenées dans le passé.
 * Idempotent par bloc.
 */
import { between, pick } from './types';
import type { HistoryContext } from './types';
import { DAY, loadTreasury, roundTo } from './finance-transverse-ops';
import type { TreasuryRef } from './finance-transverse-ops';

type Tx = Parameters<Parameters<typeof import('../../../src/utils/database').prisma.$transaction>[0]>[0];

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
];
const monthName = (d: Date) => `${MONTHS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const ago = (ctx: HistoryContext, days: number, hour = 10) => {
  const d = new Date(ctx.end.getTime() - days * DAY);
  d.setUTCHours(hour, between(ctx.rng, 0, 50), 0, 0);
  return d;
};

/** Membres qui saisissent : l'équipe sans l'administrateur d'abord (l'administrateur valide). */
function creators(ctx: HistoryContext, staff: string[]): string[] {
  const others = staff.filter(s => s !== ctx.adminUserId);
  return others.length > 0 ? others : staff;
}

// ───────────────────────────────────────────────────────── brouillons à valider

const DRAFT_INVOICES = [
  { label: 'Maintenance annuelle des climatiseurs', base: 185_000, ref: 'MAINT' },
  { label: 'Renouvellement de la licence du logiciel de gestion', base: 240_000, ref: 'LIC' },
  { label: 'Remplacement de deux serrures et clés', base: 96_000, ref: 'SERR' },
  { label: 'Fournitures et impression de documents contractuels', base: 128_000, ref: 'IMP' },
  { label: 'Dépannage de la toiture du local technique', base: 312_000, ref: 'TOIT' },
  { label: 'Frais de coursier et de courrier recommandé', base: 54_000, ref: 'COUR' }
];

const VOUCHER_REASONS = [
  { who: 'Ibrahim Konaté — manœuvre', reason: 'Avance sur salaire journalier — équipe de maçonnerie', amount: 85_000 },
  { who: 'Quincaillerie Marcory Sud', reason: 'Achat de petit outillage et de vis pour le coffrage', amount: 63_500 },
  { who: 'Station Total Bietry', reason: 'Carburant du groupe électrogène du chantier', amount: 120_000 }
];

export async function seedPendingPieces(
  ctx: HistoryContext,
  staff: string[],
  withConstruction: boolean
): Promise<void> {
  const { prisma, tenantId, log, rng } = ctx;
  const drafts =
    (await prisma.supplierInvoice.count({ where: { tenantId, status: 'DRAFT' } })) +
    (await prisma.supplierPayment.count({ where: { tenantId, validatedAt: null } })) +
    (await prisma.cashVoucher.count({ where: { tenantId, validatedAt: null } }));
  if (drafts > 0) return;
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId },
    select: { id: true, name: true, kind: true },
    orderBy: { name: 'asc' }
  });
  if (suppliers.length === 0) return;
  const authors = creators(ctx, staff);
  const [{ prisma: appPrisma }, supplierSvc] = await Promise.all([
    import('../../../src/utils/database'),
    import('../../../src/lib/finance/suppliers')
  ]);

  // Âges (en jours) des pièces en attente : certaines sont là depuis plus d'un mois.
  const invoiceAges = [2, 6, 12, 23, 38];
  let n = 0;
  for (const [i, age] of invoiceAges.entries()) {
    const spec = DRAFT_INVOICES[i % DRAFT_INVOICES.length];
    const supplier = suppliers[(i * 2 + 1) % suppliers.length];
    const createdAt = ago(ctx, age, 9 + (i % 6));
    const invoiceDate = new Date(createdAt.getTime() - between(rng, 0, 3) * DAY);
    const amount = roundTo(spec.base * (0.9 + rng() * 0.3), 500);
    await appPrisma.$transaction(
      async tx => {
        const created = await supplierSvc.createSupplierInvoiceTx(tx, tenantId, {
          supplierId: supplier.id,
          invoiceDate,
          reference: `${spec.ref}-${invoiceDate.getUTCFullYear()}${String(invoiceDate.getUTCMonth() + 1).padStart(2, '0')}-${String(between(rng, 100, 99999)).padStart(5, '0')}`,
          lines: [{ label: `${spec.label} — ${monthName(invoiceDate)}`, amount }],
          allocations: [],
          createdByUserId: authors[i % authors.length],
          siteRequired: false
        });
        await tx.supplierInvoice.update({ where: { id: created.id, tenantId }, data: { createdAt } });
      },
      { timeout: 60_000 }
    );
    n += 1;
  }

  // Un règlement saisi mais pas encore validé, sur une facture récente impayée.
  const target = await prisma.supplierInvoice.findFirst({
    where: {
      tenantId,
      status: 'VALIDATED',
      invoiceDate: { gt: new Date(ctx.end.getTime() - 70 * DAY) },
      paymentAllocations: { none: {} },
      purchaseOrderId: null
    },
    select: { id: true, supplierId: true, amount: true },
    orderBy: { invoiceDate: 'desc' }
  });
  if (target) {
    const createdAt = ago(ctx, 3, 15);
    await appPrisma.$transaction(
      async tx => {
        const pay = await supplierSvc.createSupplierPaymentTx(tx, tenantId, {
          supplierId: target.supplierId,
          paymentDate: ago(ctx, 2, 10),
          amount: Number(target.amount),
          method: 'BANK_TRANSFER',
          allocations: [{ invoiceId: target.id, amount: Number(target.amount) }],
          createdByUserId: authors[(authors.length > 1 ? 1 : 0) % authors.length]
        });
        await tx.supplierPayment.update({ where: { id: pay.id, tenantId }, data: { createdAt } });
      },
      { timeout: 60_000 }
    );
    n += 1;
  }

  // Bons de caisse en brouillon, pour les agences à chantiers.
  if (withConstruction) {
    const cash = await import('../../../src/lib/finance/cash');
    const site = await prisma.constructionSite.findFirst({
      where: { tenantId, status: 'IN_PROGRESS' },
      select: { id: true },
      orderBy: { startDate: 'asc' }
    });
    const category = await prisma.costCategory.findFirst({
      where: { tenantId, isActive: true },
      select: { id: true },
      orderBy: { label: 'asc' }
    });
    if (site && category) {
      for (const [i, v] of VOUCHER_REASONS.entries()) {
        const age = [1, 4, 9][i];
        const createdAt = ago(ctx, age, 14);
        await appPrisma.$transaction(
          async tx => {
            const rec = await cash.createCashVoucherTx(tx, tenantId, {
              siteId: site.id,
              costCategoryId: category.id,
              beneficiary: v.who,
              amount: v.amount,
              voucherDate: createdAt,
              reason: v.reason,
              createdByUserId: authors[(i + 1) % authors.length]
            });
            await tx.cashVoucher.update({ where: { id: rec.id }, data: { createdAt } });
          },
          { timeout: 60_000 }
        );
        n += 1;
      }
    }
  }
  log(`pièces à valider : ${n} pièce(s) en attente de validation`);
}

// ───────────────────────────────────────────── factures partiellement payées

export async function seedPartialInvoices(ctx: HistoryContext, staff: string[]): Promise<void> {
  const { prisma, tenantId, log, rng } = ctx;
  const partial = await prisma.supplierPaymentAllocation.groupBy({
    by: ['invoiceId'],
    where: { payment: { tenantId, validatedAt: { not: null } } },
    _sum: { amount: true }
  });
  const invoices = partial.length
    ? await prisma.supplierInvoice.findMany({
        where: { tenantId, id: { in: partial.map(p => p.invoiceId) }, status: 'VALIDATED' },
        select: { id: true, amount: true }
      })
    : [];
  const sums = new Map(partial.map(p => [p.invoiceId, Number(p._sum.amount ?? 0)]));
  const already = invoices.filter(i => (sums.get(i.id) ?? 0) < Number(i.amount) && (sums.get(i.id) ?? 0) > 0).length;
  if (already >= 1) return;

  const candidates = await prisma.supplierInvoice.findMany({
    where: {
      tenantId,
      status: 'VALIDATED',
      invoiceDate: { lt: new Date(ctx.end.getTime() - 25 * DAY), gt: new Date(ctx.end.getTime() - 400 * DAY) },
      paymentAllocations: { none: {} },
      purchaseOrderId: null,
      amount: { gte: 60_000 }
    },
    select: { id: true, supplierId: true, amount: true, invoiceDate: true, reference: true },
    orderBy: { invoiceDate: 'desc' },
    take: 40
  });
  const picks = candidates.filter(c => !c.reference.endsWith('-DUP')).slice(0, 3);
  if (picks.length === 0) return;
  const [{ prisma: appPrisma }, supplierSvc, accounting] = await Promise.all([
    import('../../../src/utils/database'),
    import('../../../src/lib/finance/suppliers'),
    import('../../../src/lib/finance/accounting')
  ]);
  const { repointPaymentEntry } = await import('./finance-transverse-ops');
  const treasury: TreasuryRef[] = await loadTreasury(ctx);
  const authors = creators(ctx, staff);
  let k = 0;
  for (const inv of picks) {
    k += 1;
    const paid = roundTo(Number(inv.amount) * (0.35 + rng() * 0.3), 500);
    const date = new Date(Math.min(inv.invoiceDate.getTime() + between(rng, 6, 18) * DAY, ctx.end.getTime() - 2 * DAY));
    const method = pick(rng, ['BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE'] as const);
    await appPrisma.$transaction(
      async tx => {
        const pay = await supplierSvc.createSupplierPaymentTx(tx, tenantId, {
          supplierId: inv.supplierId,
          paymentDate: date,
          amount: paid,
          method,
          allocations: [{ invoiceId: inv.id, amount: paid }],
          createdByUserId: authors[k % authors.length]
        });
        await supplierSvc.validateSupplierPaymentTx(tx, tenantId, pay.id, ctx.adminUserId);
        const row = await tx.supplierPayment.update({
          where: { id: pay.id, tenantId },
          data: { createdAt: date, validatedAt: date },
          select: { journalEntryId: true }
        });
        await repointPaymentEntry(
          tx as Tx,
          ctx,
          row.journalEntryId,
          treasury,
          method,
          k * 7,
          accounting.ensureOperationalJournalTx
        );
      },
      { timeout: 60_000 }
    );
  }
  log(`fournisseurs : ${picks.length} facture(s) partiellement payée(s)`);
}

// ───────────────────────────────────────────────────── bons de commande variés

const CANCEL_REASONS = [
  'Fournisseur en rupture de stock : commande reprise chez un autre fournisseur',
  'Chantier suspendu pour intempéries : commande annulée avant livraison'
];

export async function seedPurchaseOrderStatuses(ctx: HistoryContext, staff: string[]): Promise<void> {
  const { prisma, tenantId, log, rng } = ctx;
  if ((await prisma.purchaseOrder.count({ where: { tenantId } })) === 0) return;
  if ((await prisma.purchaseOrder.count({ where: { tenantId, status: { in: ['DRAFT', 'CANCELLED'] } } })) > 0) return;
  const site = await prisma.constructionSite.findFirst({
    where: { tenantId, status: 'IN_PROGRESS' },
    select: { id: true, name: true },
    orderBy: { startDate: 'asc' }
  });
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId, kind: { in: ['MATERIALS', 'MIXED'] } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  });
  const categories = await prisma.costCategory.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, label: true },
    orderBy: { label: 'asc' }
  });
  if (!site || suppliers.length === 0 || categories.length === 0) return;

  const [{ prisma: appPrisma }, orders, supplierSvc] = await Promise.all([
    import('../../../src/utils/database'),
    import('../../../src/lib/finance/purchase-orders'),
    import('../../../src/lib/finance/suppliers')
  ]);
  const authors = creators(ctx, staff);
  const year = ctx.end.getUTCFullYear();

  type Plan = {
    state: 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'CANCELLED';
    age: number;
    amount: number;
    label: string;
    qty?: number;
    unit?: number;
    cancelNote?: string;
  };
  const plans: Plan[] = [
    {
      state: 'DRAFT',
      age: 2,
      amount: 3_900_000,
      label: 'Fer à béton HA 12 et HA 10 — dalle du R+3',
      qty: 650,
      unit: 6_000
    },
    {
      state: 'DRAFT',
      age: 6,
      amount: 1_680_000,
      label: 'Carreaux de sol 60x60 — parties communes',
      qty: 420,
      unit: 4_000
    },
    { state: 'DRAFT', age: 13, amount: 2_250_000, label: 'Gaines et câbles électriques — second œuvre' },
    {
      state: 'ISSUED',
      age: 8,
      amount: 4_800_000,
      label: 'Ciment CPJ 42,5 — 800 sacs livrés en trois fois',
      qty: 800,
      unit: 6_000
    },
    { state: 'ISSUED', age: 15, amount: 2_940_000, label: 'Agrégats et sable lavé — élévation des murs' },
    { state: 'ISSUED', age: 26, amount: 1_350_000, label: 'Appareils sanitaires — logements témoins' },
    { state: 'ISSUED', age: 41, amount: 5_600_000, label: 'Menuiseries aluminium — fenêtres et baies' },
    { state: 'PARTIAL', age: 48, amount: 6_300_000, label: 'Briques creuses 15 et 20 — maçonnerie' },
    { state: 'PARTIAL', age: 77, amount: 3_800_000, label: 'Peinture et enduits de façade' },
    { state: 'PARTIAL', age: 112, amount: 8_200_000, label: 'Carrelage et faïence des salles d’eau' },
    {
      state: 'CANCELLED',
      age: 62,
      amount: 2_100_000,
      label: 'Portes isoplanes — lot de 30',
      cancelNote: CANCEL_REASONS[0]
    },
    {
      state: 'CANCELLED',
      age: 95,
      amount: 4_400_000,
      label: 'Location de coffrages métalliques',
      cancelNote: CANCEL_REASONS[1]
    }
  ];

  let done = 0;
  for (const [i, plan] of plans.entries()) {
    const supplier = suppliers[i % suppliers.length];
    const category = categories[i % categories.length];
    const orderDate = ago(ctx, plan.age, 9);
    const reference = `BC-${year}-${String(900 + i + 1)}`;
    const author = authors[i % authors.length];
    try {
      const po = await appPrisma.$transaction(
        async tx => {
          const created = await orders.createPurchaseOrderTx(tx, tenantId, {
            siteId: site.id,
            supplierId: supplier.id,
            reference,
            orderDate,
            lines: [
              {
                costCategoryId: category.id,
                label: plan.label,
                amount: plan.amount,
                quantity: plan.qty ?? null,
                unitPrice: plan.unit ?? null
              }
            ],
            createdByUserId: author
          } as never);
          await tx.purchaseOrder.update({ where: { id: created.id, tenantId }, data: { createdAt: orderDate } });
          return created;
        },
        { timeout: 60_000 }
      );
      if (plan.state === 'DRAFT') {
        done += 1;
        continue;
      }
      const issuedAt = new Date(orderDate.getTime() + DAY);
      if (plan.state !== 'CANCELLED' || i % 2 === 1) {
        await appPrisma.$transaction(
          async tx => {
            await orders.issuePurchaseOrderTx(tx, tenantId, po.id, ctx.adminUserId);
            await tx.purchaseOrder.update({ where: { id: po.id, tenantId }, data: { issuedAt } });
          },
          { timeout: 60_000 }
        );
      }
      if (plan.state === 'CANCELLED') {
        await appPrisma.$transaction(
          async tx => {
            await orders.cancelPurchaseOrderTx(tx, tenantId, po.id, plan.cancelNote as string);
            await tx.purchaseOrder.update({
              where: { id: po.id, tenantId },
              data: { cancelledAt: new Date(orderDate.getTime() + 4 * DAY) }
            });
          },
          { timeout: 60_000 }
        );
      }
      if (plan.state === 'PARTIAL') {
        // Une première livraison facturée aux alentours de 55 à 65 % du bon.
        const part = roundTo(plan.amount * (0.55 + rng() * 0.1), 1_000);
        const invoiceDate = new Date(orderDate.getTime() + between(rng, 6, 12) * DAY);
        await appPrisma.$transaction(
          async tx => {
            const inv = await supplierSvc.createSupplierInvoiceTx(tx, tenantId, {
              supplierId: supplier.id,
              invoiceDate,
              reference: `FAC-${reference.slice(3)}-A`,
              lines: [{ label: `${plan.label} — première livraison`, amount: part }],
              allocations: [{ siteId: site.id, costCategoryId: category.id, amount: part }],
              createdByUserId: author
            });
            await orders.linkInvoiceToPurchaseOrderTx(tx, tenantId, inv.id, po.id);
            await supplierSvc.validateSupplierInvoiceTx(tx, tenantId, inv.id, ctx.adminUserId);
            await tx.supplierInvoice.update({
              where: { id: inv.id, tenantId },
              data: { createdAt: invoiceDate, validatedAt: invoiceDate }
            });
            await tx.costAllocation.updateMany({
              where: { tenantId, sourceType: 'SUPPLIER_INVOICE', sourceId: inv.id, validatedAt: { not: null } },
              data: { validatedAt: invoiceDate }
            });
          },
          { timeout: 60_000 }
        );
      }
      done += 1;
    } catch (error) {
      log(`bons de commande : ${reference} ignoré (${(error as Error).message.slice(0, 140)})`);
    }
  }
  log(`bons de commande : ${done} bon(s) ajouté(s) (brouillon, émis, partiellement facturé, annulé)`);
}

// ───────────────────────────────────────────────────────── journal des achats

/**
 * Journal « charges » (achats) : les écritures de factures fournisseurs quittent
 * le journal général. Le journal est créé (un par exercice) par le moteur.
 */
export async function seedPurchasesJournal(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  const entries = await prisma.journalEntry.findMany({
    where: { tenantId, documentType: { in: ['SUPPLIER_INVOICE', 'SALARY_NOTE'] }, journal: { journalType: 'GENERAL' } },
    select: { id: true, entryDate: true }
  });
  if (entries.length === 0) return;
  const { prisma: appPrisma } = await import('../../../src/utils/database');
  const accounting = await import('../../../src/lib/finance/accounting');
  const byYear = new Map<number, string[]>();
  for (const e of entries) {
    const y = e.entryDate.getUTCFullYear();
    byYear.set(y, [...(byYear.get(y) ?? []), e.id]);
  }
  await appPrisma.$transaction(
    async tx => {
      for (const [year, ids] of byYear) {
        const journalId = await accounting.ensureOperationalJournalTx(tx, tenantId, year, 'CHARGES');
        await tx.journalEntry.updateMany({ where: { tenantId, id: { in: ids } }, data: { journalId } });
      }
    },
    { timeout: 120_000 }
  );
  log(`comptabilité : ${entries.length} écriture(s) d’achats rangées au journal des charges`);
}
