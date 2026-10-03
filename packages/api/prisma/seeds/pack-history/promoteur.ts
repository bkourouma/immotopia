/**
 * Historique du module PROMOTEUR (MODULE_PROMOTER) d'une agence de test.
 *
 * Ce que le module expose réellement (feature CONSTRUCTION) : des chantiers
 * (= programmes immobiliers), leurs lots, un budget validé avec avenants, des
 * bons de commande, des fournisseurs et leurs factures/règlements, des marchés
 * de tâcherons avec situations d'avancement, l'avancement physique mois par
 * mois, un bail de terrain avec constatations mensuelles, la clôture du
 * chantier livré. Il n'existe PAS de prospects, réservations, contrats de
 * vente VEFA ni d'échéanciers d'appels de fonds : rien n'est inventé pour eux.
 *
 * Tout passe par les vrais services de `src/lib/finance` (écritures
 * comptables, comptes de tiers, imputations de coût). Dates relatives à
 * `ctx.end`, hasard seedé, idempotent (un chantier existant = on s'arrête),
 * aucun envoi sortant.
 */
import type { PrismaClient } from '@prisma/client';
import { neutralizeOutbound, addDays, between, pick } from './types';
import type { HistoryContext, HistorySeeder } from './types';

type Tx = any;

interface SiteSpec {
  code: string;
  name: string;
  zone: string;
  lots: number;
  /** Mois (depuis ctx.start) du démarrage ; peut dépasser `months` (lancement). */
  startMonth: number;
  /** Durée de chantier prévue, en mois. */
  durationMonths: number;
  status: 'CLOSED' | 'IN_PROGRESS' | 'PLANNED';
  /** Coût de revient par lot visé, en XOF. */
  costPerLot: number;
  withLease: boolean;
  withAmendment: boolean;
  /** Dépassement volontaire (+) du réalisé sur le budget, pour l'alerte. */
  overrun: number;
}

const CATEGORY_LABELS = [
  'Gros œuvre',
  'Toiture',
  'Plomberie',
  'Électricité',
  "Main-d'œuvre",
  'Matériaux',
  'Divers'
] as const;

/** Part de chaque poste dans le budget total. */
const CATEGORY_SHARE: Record<(typeof CATEGORY_LABELS)[number], number> = {
  'Gros œuvre': 0.36,
  Toiture: 0.08,
  Plomberie: 0.07,
  Électricité: 0.08,
  "Main-d'œuvre": 0.16,
  Matériaux: 0.19,
  Divers: 0.06
};

const SUPPLIERS = [
  { key: 'MAT', name: 'Ciments et Matériaux du Golfe', kind: 'MATERIALS', contact: 'Yao Konan', phone: '+22507000101' },
  { key: 'PLB', name: 'Plomberie Sanitaire Ivoire', kind: 'MIXED', contact: 'Awa Ouattara', phone: '+22507000102' },
  { key: 'ELE', name: 'Électro Bâtiment CI', kind: 'MIXED', contact: 'Serge Bamba', phone: '+22507000103' },
  {
    key: 'SRV',
    name: 'Transports et Engins de Yopougon',
    kind: 'SERVICES',
    contact: 'Ibrahim Coulibaly',
    phone: '+22507000104'
  }
] as const;

function specsFor(ctx: HistoryContext): SiteSpec[] {
  if (ctx.profile === '6m') {
    return [
      {
        code: 'PAL',
        name: 'Résidence Les Palmiers',
        zone: 'Bingerville, Abidjan',
        lots: 20,
        startMonth: 0,
        durationMonths: 16,
        status: 'IN_PROGRESS',
        costPerLot: 31_000_000,
        withLease: true,
        withAmendment: false,
        overrun: 0
      }
    ];
  }
  return [
    {
      code: 'COC',
      name: 'Résidence Les Cocotiers',
      zone: 'Grand-Bassam',
      lots: 36,
      startMonth: 0,
      durationMonths: 22,
      status: 'CLOSED',
      costPerLot: 28_000_000,
      withLease: false,
      withAmendment: true,
      overrun: 0
    },
    {
      code: 'ANG',
      name: "Les Jardins d'Angré",
      zone: 'Cocody Angré, Abidjan',
      lots: 48,
      startMonth: 12,
      durationMonths: 30,
      status: 'IN_PROGRESS',
      costPerLot: 33_000_000,
      withLease: true,
      withAmendment: true,
      overrun: 0.07
    },
    {
      code: 'VAL',
      name: 'Domaine des Vallons',
      zone: 'Bingerville, Abidjan',
      lots: 24,
      startMonth: ctx.months + 2,
      durationMonths: 18,
      status: 'PLANNED',
      costPerLot: 35_000_000,
      withLease: false,
      withAmendment: false,
      overrun: 0
    }
  ];
}

const round5k = (n: number): number => Math.max(5_000, Math.round(n / 5_000) * 5_000);

function monthDate(ctx: HistoryContext, offset: number, day: number): Date {
  return new Date(ctx.start.getFullYear(), ctx.start.getMonth() + offset, day, 10, 0, 0, 0);
}

/** Courbe en S : fraction d'avancement à la fraction de durée t (0..1). */
function curve(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export const seedPromoteurHistory: HistorySeeder = async ctx => {
  // Idempotence : un chantier existant = le module est déjà peuplé.
  const existing = await ctx.prisma.constructionSite.count({ where: { tenantId: ctx.tenantId } });
  if (existing > 0) {
    ctx.log(`promoteur : ${existing} chantier(s) déjà présent(s), rien à faire`);
    return;
  }

  neutralizeOutbound();
  const [
    {
      createSupplierTx,
      createSupplierInvoiceTx,
      validateSupplierInvoiceTx,
      createSupplierPaymentTx,
      validateSupplierPaymentTx
    },
    budgets,
    orders,
    contractors,
    progress,
    closing,
    leases
  ] = await Promise.all([
    import('../../../src/lib/finance/suppliers'),
    import('../../../src/lib/finance/budgets'),
    import('../../../src/lib/finance/purchase-orders'),
    import('../../../src/lib/finance/contractors'),
    import('../../../src/lib/finance/site-progress'),
    import('../../../src/lib/finance/site-closing'),
    import('../../../src/lib/finance/land-leases')
  ]);

  const prisma: PrismaClient = ctx.prisma;
  const { tenantId, adminUserId: admin, rng } = ctx;
  const run = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
    prisma.$transaction(fn as never, { timeout: 120_000, maxWait: 30_000 }) as Promise<T>;
  const clampPast = (d: Date): Date => (d > ctx.end ? addDays(ctx.end, -1) : d);
  const inPast = (d: Date): boolean => d <= ctx.end;

  // Postes de dépense : le jeu par défaut de l'application.
  let categories = await prisma.costCategory.findMany({ where: { tenantId } });
  if (categories.length === 0) {
    await prisma.costCategory.createMany({ data: CATEGORY_LABELS.map(label => ({ tenantId, label })) });
    categories = await prisma.costCategory.findMany({ where: { tenantId } });
  }
  const catId = new Map(categories.map(c => [c.label, c.id]));
  const cat = (label: (typeof CATEGORY_LABELS)[number]): string => {
    const id = catId.get(label);
    if (!id) throw new Error(`Poste de dépense « ${label} » introuvable`);
    return id;
  };

  // Fournisseurs et tâcherons (communs à tous les programmes).
  const supplierId = new Map<string, string>();
  for (const s of SUPPLIERS) {
    const rec: any = await run(tx =>
      createSupplierTx(tx, tenantId, {
        name: s.name,
        kind: s.kind as never,
        contactName: s.contact,
        phone: s.phone,
        email: null
      })
    );
    supplierId.set(s.key, rec.id);
  }
  const mason: any = await run(tx =>
    contractors.createContractorTx(tx, tenantId, { fullName: 'Entreprise Kouassi Bâtiment', trade: 'Maçonnerie' })
  );
  const finisher: any = await run(tx =>
    contractors.createContractorTx(tx, tenantId, { fullName: 'Traoré Finitions', trade: 'Carrelage et peinture' })
  );

  const unpaidInvoices = { n: 0 };

  for (const spec of specsFor(ctx)) {
    const startDate = monthDate(ctx, spec.startMonth, 3);
    const plannedEnd = monthDate(ctx, spec.startMonth + spec.durationMonths, 28);
    const site = await prisma.constructionSite.create({
      data: {
        tenantId,
        name: `${spec.name} — ${spec.zone.split(',')[0]}`,
        zone: spec.zone,
        managerId: admin,
        status: 'PLANNED',
        startDate,
        plannedEndDate: plannedEnd,
        budgetThresholdPercent: 90,
        createdAt: addDays(startDate, -45) > ctx.end ? addDays(ctx.end, -20) : addDays(startDate, -45)
      }
    });

    // Lots du programme (grille de surfaces), clé de répartition à la surface.
    const typologies = [58, 72, 85, 96, 110, 128];
    for (let i = 1; i <= spec.lots; i++) {
      const surface = pick(rng, typologies) + between(rng, 0, 4);
      const block = String.fromCharCode(64 + Math.ceil(i / 12));
      await run(tx =>
        closing.createSiteLotTx(tx, tenantId, {
          siteId: site.id,
          name: `Lot ${block}${((i - 1) % 12) + 1}`,
          surfaceArea: surface
        })
      );
    }
    await run(tx => closing.setLotAllocationMethodTx(tx, tenantId, site.id, 'SURFACE' as never));

    // Budget : un poste par ligne, validé à l'ouverture (brouillon si lancement).
    const totalBudget = spec.lots * spec.costPerLot;
    const budgetByCat = new Map<string, number>();
    const budgetLines = CATEGORY_LABELS.map(label => {
      const amount = round5k(totalBudget * CATEGORY_SHARE[label]);
      budgetByCat.set(label, amount);
      return { costCategoryId: cat(label), label, amountForecast: amount };
    });
    const budget: any = await run(tx =>
      budgets.createSiteBudgetTx(tx, tenantId, {
        siteId: site.id,
        label: `Budget initial — ${spec.name}`,
        lines: budgetLines
      })
    );
    if (spec.status === 'PLANNED') {
      ctx.log(`promoteur : ${spec.name} en lancement (${spec.lots} lots, budget en brouillon)`);
      continue;
    }
    await run(tx => budgets.validateSiteBudgetTx(tx, tenantId, budget.id, admin));
    await prisma.siteBudget.update({
      where: { id: budget.id },
      data: { validatedAt: addDays(startDate, -5) > ctx.end ? ctx.end : addDays(startDate, -5) }
    });

    await prisma.constructionSite.update({ where: { id: site.id }, data: { status: 'IN_PROGRESS' } });

    // Avenant sur le gros œuvre au milieu de la vie du chantier.
    const midOffset = spec.startMonth + Math.floor(spec.durationMonths / 2);
    if (spec.withAmendment && inPast(monthDate(ctx, midOffset, 15))) {
      const delta = round5k(totalBudget * 0.035);
      const amendment: any = await run(tx =>
        budgets.createBudgetAmendmentTx(tx, tenantId, {
          budgetId: budget.id,
          amendmentDate: monthDate(ctx, midOffset, 15),
          reason: 'Hausse du prix du fer à béton et reprise de fondations',
          lines: [
            { costCategoryId: cat('Gros œuvre'), amountDelta: delta },
            { costCategoryId: cat('Divers'), amountDelta: -round5k(delta * 0.2) }
          ],
          createdByUserId: admin
        })
      );
      await run(tx => budgets.validateBudgetAmendmentTx(tx, tenantId, amendment.id, admin));
    }

    // Bail de terrain rattaché au chantier, loyer annuel payé d'avance.
    let lease: any = null;
    if (spec.withLease) {
      lease = await run(tx =>
        leases.createLandLeaseTx(tx, tenantId, {
          landlordName: 'Famille Gnamien (propriétaire coutumier)',
          landLabel: `Terrain ${spec.name}, ${spec.zone.split(',')[0]}`,
          annualAmount: 18_000_000,
          costCategoryId: cat('Divers'),
          startDate,
          endDate: null
        })
      );
      await run(tx => leases.attachSiteToLandLeaseTx(tx, tenantId, site.id, lease.id));
    }

    // Marchés de tâcherons : gros œuvre (45 %) et main-d'œuvre de finition (75 %).
    const goAgreed = round5k((budgetByCat.get('Gros œuvre') ?? 0) * 0.45);
    const moAgreed = round5k((budgetByCat.get("Main-d'œuvre") ?? 0) * 0.75);
    const goContract: any = await run(tx =>
      contractors.createContractorContractTx(tx, tenantId, {
        contractorId: mason.id,
        siteId: site.id,
        costCategoryId: cat('Gros œuvre'),
        reference: `MT-${spec.code}-GO`,
        agreedAmount: goAgreed,
        signedDate: addDays(startDate, 10)
      })
    );
    const moContract: any = await run(tx =>
      contractors.createContractorContractTx(tx, tenantId, {
        contractorId: finisher.id,
        siteId: site.id,
        costCategoryId: cat("Main-d'œuvre"),
        reference: `MT-${spec.code}-MO`,
        agreedAmount: moAgreed,
        signedDate: addDays(startDate, 40)
      })
    );

    // Mois par mois : avancement, bon de commande, factures, situations, règlements.
    let prevPct = 0;
    let goStated = 0;
    let moStated = 0;
    let pendingMasonPay: { amount: number; date: Date } | null = null;
    let pendingFinisherPay: { amount: number; date: Date } | null = null;
    let setbackDone = false;

    const lastMonth =
      spec.status === 'CLOSED'
        ? spec.durationMonths - 1
        : Math.min(spec.durationMonths - 1, ctx.months - spec.startMonth);
    for (let k = 0; k <= lastMonth; k++) {
      const off = spec.startMonth + k;
      const entryDate = monthDate(ctx, off, 27);
      if (!inPast(monthDate(ctx, off, 3))) break;
      const isFinal = spec.status === 'CLOSED' && k === lastMonth;
      let pct = isFinal ? 100 : Math.round(100 * curve((k + 1) / spec.durationMonths) * 0.99);
      if (!isFinal && !setbackDone && pct > 40 && spec.status === 'IN_PROGRESS' && rng() < 0.15) {
        pct = Math.max(prevPct, pct - 2); // un point d'avancement revu à la baisse
        setbackDone = true;
      }
      pct = Math.max(prevPct, Math.min(100, pct));
      const delta = (pct - prevPct) / 100;
      const effDate = clampPast(entryDate);

      // Règlements des tâcherons dus ce mois-ci (situation du mois précédent).
      for (const [pending, contractorId] of [
        [pendingMasonPay, mason.id],
        [pendingFinisherPay, finisher.id]
      ] as const) {
        if (pending && inPast(pending.date)) {
          const pay: any = await run(tx =>
            contractors.createContractorPaymentTx(tx, tenantId, {
              contractorId,
              paymentDate: pending.date,
              amount: pending.amount,
              createdByUserId: admin
            })
          );
          await run(tx => contractors.validateContractorPaymentTx(tx, tenantId, pay.id, admin));
          await prisma.contractorPayment.update({ where: { id: pay.id }, data: { validatedAt: pending.date } });
        }
      }
      pendingMasonPay = null;
      pendingFinisherPay = null;

      if (delta > 0) {
        const jitter = () => 0.92 + rng() * 0.16 + spec.overrun;

        // Situations des tâcherons (plafonnées au montant du marché).
        const goAmt = Math.min(goAgreed - goStated, round5k(goAgreed * delta * (0.95 + rng() * 0.1)));
        if (goAmt >= 5_000) {
          const st: any = await run(tx =>
            contractors.createProgressStatementTx(tx, tenantId, {
              contractId: goContract.id,
              statementDate: monthDate(ctx, off, 25) > ctx.end ? effDate : monthDate(ctx, off, 25),
              amount: goAmt,
              description: `Situation n°${k + 1} — élévation, dalles et maçonnerie`,
              createdByUserId: admin
            })
          );
          await run(tx => contractors.validateProgressStatementTx(tx, tenantId, st.id, admin));
          goStated += goAmt;
          pendingMasonPay = { amount: round5k(goAmt * 0.85), date: monthDate(ctx, off + 1, 8) };
        }
        const moAmt = Math.min(moAgreed - moStated, round5k(moAgreed * delta * (0.9 + rng() * 0.2)));
        if (moAmt >= 5_000 && pct > 25) {
          const st: any = await run(tx =>
            contractors.createProgressStatementTx(tx, tenantId, {
              contractId: moContract.id,
              statementDate: monthDate(ctx, off, 26) > ctx.end ? effDate : monthDate(ctx, off, 26),
              amount: moAmt,
              description: `Situation n°${k + 1} — second œuvre, carrelage et peinture`,
              createdByUserId: admin
            })
          );
          await run(tx => contractors.validateProgressStatementTx(tx, tenantId, st.id, admin));
          moStated += moAmt;
          pendingFinisherPay = { amount: round5k(moAmt * 0.9), date: monthDate(ctx, off + 1, 12) };
        }

        // Achats de matériaux : bon de commande émis, facture rapprochée, validée, réglée.
        const matLines = [
          { c: 'Matériaux' as const, label: 'Ciment, sable et gravier', share: 1 },
          { c: 'Gros œuvre' as const, label: 'Fer à béton et agglos', share: 0.55 },
          { c: 'Toiture' as const, label: 'Charpente et tôles', share: 1 }
        ].map(l => ({ ...l, amount: round5k((budgetByCat.get(l.c) ?? 0) * l.share * delta * jitter()) }));
        const yyyymm = `${monthDate(ctx, off, 1).getFullYear()}${String(monthDate(ctx, off, 1).getMonth() + 1).padStart(2, '0')}`;
        const orderDate = clampPast(monthDate(ctx, off, 3));
        const po: any = await run(tx =>
          orders.createPurchaseOrderTx(tx, tenantId, {
            siteId: site.id,
            supplierId: supplierId.get('MAT')!,
            reference: `BC-${spec.code}-${yyyymm}`,
            orderDate,
            lines: matLines.map(l => ({ costCategoryId: cat(l.c), label: l.label, amount: l.amount })),
            createdByUserId: admin
          })
        );
        await run(tx => orders.issuePurchaseOrderTx(tx, tenantId, po.id, admin));
        await prisma.purchaseOrder.update({ where: { id: po.id }, data: { issuedAt: orderDate } });

        const invoiceDate = clampPast(monthDate(ctx, off, 12));
        const invoiceTotal = matLines.reduce((s, l) => s + l.amount, 0);
        const inv: any = await run(tx =>
          createSupplierInvoiceTx(tx, tenantId, {
            supplierId: supplierId.get('MAT')!,
            invoiceDate,
            reference: `FAC-MAT-${spec.code}-${yyyymm}`,
            lines: matLines.map(l => ({ label: l.label, amount: l.amount })),
            allocations: matLines.map(l => ({ siteId: site.id, costCategoryId: cat(l.c), amount: l.amount })),
            createdByUserId: admin
          })
        );
        await run(tx => orders.linkInvoiceToPurchaseOrderTx(tx, tenantId, inv.id, po.id));
        await run(tx => validateSupplierInvoiceTx(tx, tenantId, inv.id, admin));
        await prisma.supplierInvoice.update({ where: { id: inv.id }, data: { validatedAt: invoiceDate } });
        await payInvoice(supplierId.get('MAT')!, inv.id, invoiceTotal, invoiceDate, 25 + between(rng, 0, 20));

        // Plomberie et électricité : surtout en second œuvre (30 % à 90 %).
        if (pct > 30 && prevPct < 95) {
          for (const [key, label, text] of [
            ['PLB', 'Plomberie', 'Tuyauterie et appareils sanitaires'],
            ['ELE', 'Électricité', 'Câblage, tableaux et appareillage']
          ] as const) {
            const amount = round5k((budgetByCat.get(label) ?? 0) * delta * 1.2 * jitter());
            if (amount < 100_000) continue;
            const d = clampPast(monthDate(ctx, off, 15 + (key === 'ELE' ? 2 : 0)));
            const si: any = await run(tx =>
              createSupplierInvoiceTx(tx, tenantId, {
                supplierId: supplierId.get(key)!,
                invoiceDate: d,
                reference: `FAC-${key}-${spec.code}-${yyyymm}`,
                lines: [{ label: text, amount }],
                allocations: [{ siteId: site.id, costCategoryId: cat(label), amount }],
                createdByUserId: admin
              })
            );
            await run(tx => validateSupplierInvoiceTx(tx, tenantId, si.id, admin));
            await prisma.supplierInvoice.update({ where: { id: si.id }, data: { validatedAt: d } });
            await payInvoice(supplierId.get(key)!, si.id, amount, d, 30 + between(rng, 0, 25));
          }
        }

        // Prestations diverses (engins, évacuation de déblais) un mois sur deux.
        if (k % 2 === 0) {
          const amount = round5k((budgetByCat.get('Divers') ?? 0) * delta * 1.6 * jitter());
          if (amount >= 100_000) {
            const d = clampPast(monthDate(ctx, off, 18));
            const si: any = await run(tx =>
              createSupplierInvoiceTx(tx, tenantId, {
                supplierId: supplierId.get('SRV')!,
                invoiceDate: d,
                reference: `FAC-SRV-${spec.code}-${yyyymm}`,
                lines: [{ label: 'Location d’engins et évacuation de déblais', amount }],
                allocations: [{ siteId: site.id, costCategoryId: cat('Divers'), amount }],
                createdByUserId: admin
              })
            );
            await run(tx => validateSupplierInvoiceTx(tx, tenantId, si.id, admin));
            await prisma.supplierInvoice.update({ where: { id: si.id }, data: { validatedAt: d } });
            await payInvoice(supplierId.get('SRV')!, si.id, amount, d, 20 + between(rng, 0, 15));
          }
        }
      }

      await run(tx =>
        progress.recordSiteProgressTx(tx, tenantId, {
          siteId: site.id,
          entryDate: effDate,
          percent: pct,
          note: isFinal ? 'Réception des travaux et levée des réserves' : `Avancement de fin de mois : ${pct} %`,
          createdByUserId: admin
        })
      );
      prevPct = pct;
    }

    // Bail de terrain : loyer annuel payé d'avance, puis constatation mensuelle.
    if (lease) {
      for (let y = 0; ; y++) {
        const payDate = monthDate(ctx, spec.startMonth + 12 * y, 5);
        if (!inPast(payDate)) break;
        const pay: any = await run(tx =>
          leases.createLandLeasePaymentTx(tx, tenantId, {
            landLeaseId: lease.id,
            paymentDate: payDate,
            amount: 18_000_000,
            coverageStartDate: monthDate(ctx, spec.startMonth + 12 * y, 1),
            coverageEndDate: addDays(monthDate(ctx, spec.startMonth + 12 * (y + 1), 1), -1),
            createdByUserId: admin
          })
        );
        await run(tx => leases.validateLandLeasePaymentTx(tx, tenantId, pay.id, admin));
      }
      // Mois échus uniquement : le mois courant n'est pas encore constaté.
      for (let k = 0; ; k++) {
        const d = monthDate(ctx, spec.startMonth + k, 1);
        const monthEnd = monthDate(ctx, spec.startMonth + k + 1, 1);
        if (monthEnd > ctx.end) break;
        await run(tx =>
          leases.recordLandLeaseAccrualTx(tx, tenantId, {
            landLeaseId: lease.id,
            periodYear: d.getFullYear(),
            periodMonth: d.getMonth() + 1
          })
        );
      }
    }

    // Chantier livré : clôture (coût final figé) puis date de clôture historique.
    if (spec.status === 'CLOSED') {
      await run(tx => closing.closeSiteTx(tx, tenantId, site.id, { closedByUserId: admin }));
      await prisma.constructionSite.update({
        where: { id: site.id },
        data: { closedAt: clampPast(monthDate(ctx, spec.startMonth + spec.durationMonths, 10)) }
      });
    }
    ctx.log(`promoteur : ${spec.name} (${spec.lots} lots, ${spec.status}) généré`);
  }

  if (unpaidInvoices.n > 0)
    ctx.log(`promoteur : ${unpaidInvoices.n} facture(s) fournisseur laissée(s) impayée(s) (retards)`);

  /** Règle une facture validée, sauf si l'échéance est future ou si elle reste en retard. */
  async function payInvoice(
    supplier: string,
    invoiceId: string,
    amount: number,
    invoiceDate: Date,
    delayDays: number
  ): Promise<void> {
    const payDate = addDays(invoiceDate, delayDays);
    if (!inPast(payDate)) return; // pas encore échue
    const roll = rng();
    const old = ctx.end.getTime() - invoiceDate.getTime() > 90 * 86_400_000;
    if (old && roll < 0.04) {
      unpaidInvoices.n += 1; // facture ancienne restée impayée : un retard
      return;
    }
    const paid = roll > 0.9 ? Math.round((amount * 0.5) / 1000) * 1000 : amount; // règlement partiel
    const pay: any = await run(tx =>
      createSupplierPaymentTx(tx, tenantId, {
        supplierId: supplier,
        paymentDate: payDate,
        amount: paid,
        method: pick(rng, ['BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY'] as const),
        allocations: [{ invoiceId, amount: paid }],
        createdByUserId: admin
      })
    );
    await run(tx => validateSupplierPaymentTx(tx, tenantId, pay.id, admin));
    await prisma.supplierPayment.update({ where: { id: pay.id }, data: { validatedAt: payDate } });
  }
};
