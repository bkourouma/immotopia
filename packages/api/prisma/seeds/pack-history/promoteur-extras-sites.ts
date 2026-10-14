/**
 * Chantiers supplémentaires du promoteur, menés « stock d'abord » : le chantier
 * est basculé au stock à son ouverture, les matériaux entrent au magasin par
 * des réceptions rattachées à leurs factures, et c'est la SORTIE de magasin qui
 * impute le coût (principe P-7 du module).
 *
 *  - « Résidence Les Orchidées » (Marcory) : livrée et clôturée (inventaire de
 *    clôture, reliquat reversé au magasin central) ; pack Promoteur ET Intégré.
 *  - « Villas du Lagon » (Grand-Bassam) : suspendue en dérive de budget, stock
 *    gelé, factures impayées ; seulement pour l'opérateur intégré (le pack
 *    Promoteur est limité à 2 chantiers actifs, un chantier suspendu en compte).
 *
 * Tout passe par les services de `src/lib/finance` ; seules les dates (posées
 * « maintenant » par les services) sont recalées sur la date métier.
 */
import { addDays, between, pick } from './types';
import type { Env } from './promoteur-extras-shared';
import { CATEGORY_LABELS, STOCK_CATALOG, curve, round1k, round5k } from './promoteur-extras-shared';
import type { CategoryLabel } from './promoteur-extras-shared';
import type { StockBook } from './promoteur-extras-stock';
import {
  balanceOf,
  countLinesFromBalances,
  enableSiteStock,
  issue,
  receive,
  runCount,
  scrap,
  supplierReturn,
  transfer
} from './promoteur-extras-stock';

interface ExtraSiteSpec {
  code: 'ORC' | 'LAG';
  name: string;
  zone: string;
  lots: number;
  startMonth: number;
  durationMonths: number;
  /** Mois d'activité (le reste de la vie du chantier n'a pas eu lieu : suspension). */
  activeMonths: number;
  costPerLot: number;
  status: 'CLOSED' | 'SUSPENDED';
  overrun: number;
  thresholdPercent: number;
  /** Part des matériaux courants livrée d'abord au magasin central. */
  viaWarehouse: number;
  mainContractor: { name: string; trade: string } | { existing: string };
  finisher: { name: string; trade: string } | { existing: string };
  amendmentReason: string;
  pendingAmendment?: string;
}

const SPECS: ExtraSiteSpec[] = [
  {
    code: 'ORC',
    name: 'Résidence Les Orchidées',
    zone: 'Marcory Zone 4, Abidjan',
    lots: 18,
    startMonth: 8,
    durationMonths: 17,
    activeMonths: 17,
    costPerLot: 36_000_000,
    status: 'CLOSED',
    overrun: 0.18,
    thresholdPercent: 85,
    viaWarehouse: 0.5,
    mainContractor: { name: 'Société Sanogo Construction', trade: 'Gros œuvre' },
    finisher: { existing: 'Traoré Finitions' },
    amendmentReason: 'Reprise des fondations après étude de sol complémentaire'
  },
  {
    code: 'LAG',
    name: 'Villas du Lagon',
    zone: 'Grand-Bassam, Quartier France',
    lots: 12,
    startMonth: 14,
    durationMonths: 32,
    activeMonths: 17,
    costPerLot: 62_000_000,
    status: 'SUSPENDED',
    overrun: 0.55,
    thresholdPercent: 65,
    viaWarehouse: 1,
    mainContractor: { name: 'Konaté Terrassement et Fondations', trade: 'Terrassement et fondations' },
    finisher: { existing: 'Entreprise Kouassi Bâtiment' },
    amendmentReason: 'Hausse du prix du fer à béton et du ciment importé',
    pendingAmendment: "Reprise des fondations côté lagune après l'étude de sol : arbitrage de la direction attendu"
  }
];

const SHARE: Record<CategoryLabel, number> = {
  'Gros œuvre': 0.36,
  Toiture: 0.08,
  Plomberie: 0.07,
  Électricité: 0.08,
  "Main-d'œuvre": 0.16,
  Matériaux: 0.19,
  Divers: 0.06
};

interface PurchaseLine {
  ref: string;
  qty: number;
}
interface Purchase {
  supplier: 'MAT' | 'FER' | 'PLB' | 'ELE';
  lines: PurchaseLine[];
}

/** Les achats d'un mois, selon la phase du chantier ; quantités tirées des montants visés. */
function planPurchases(
  budgetByCat: Map<string, number>,
  pct: number,
  prevPct: number,
  delta: number,
  jit: () => number
): Purchase[] {
  const out: Purchase[] = [];
  const price = (ref: string): number => STOCK_CATALOG.find(c => c.reference === ref)!.price;
  const mk = (supplier: Purchase['supplier'], parts: Array<[string, number]>, target: number): void => {
    const total = parts.reduce((s, p) => s + p[1], 0);
    const lines = parts
      .map(([ref, w]) => ({ ref, qty: Math.max(1, Math.round((target * w) / total / price(ref))) }))
      .filter(l => l.qty > 0);
    if (lines.length > 0) {
      // fusion avec un achat du même fournisseur déjà prévu
      const existing = out.find(o => o.supplier === supplier);
      if (existing) {
        for (const l of lines) {
          const same = existing.lines.find(x => x.ref === l.ref);
          if (same) same.qty += l.qty;
          else existing.lines.push(l);
        }
      } else out.push({ supplier, lines });
    }
  };
  const bud = (c: CategoryLabel): number => budgetByCat.get(c) ?? 0;
  if (prevPct < 55) {
    mk(
      'MAT',
      [
        ['CIM-425', 0.5],
        ['SAB-LAG', 0.2],
        ['GRA-1525', 0.3]
      ],
      bud('Matériaux') * delta * 0.62 * jit()
    );
    mk(
      'MAT',
      [
        ['PAR-15', 0.55],
        ['PAR-20', 0.45]
      ],
      bud('Gros œuvre') * delta * 0.25 * jit()
    );
    mk(
      'FER',
      [
        ['FER-08', 0.2],
        ['FER-10', 0.25],
        ['FER-12', 0.3],
        ['FER-14', 0.18],
        ['FIL-LIG', 0.07]
      ],
      bud('Gros œuvre') * delta * 0.3 * jit()
    );
  }
  if (pct > 30 && prevPct < 80) {
    mk(
      'MAT',
      [
        ['TOL-BAC', 0.7],
        ['CHE-BOI', 0.3]
      ],
      bud('Toiture') * delta * 1.6 * jit()
    );
  }
  if (pct > 55) {
    mk(
      'MAT',
      [
        ['CAR-6060', 0.65],
        ['PEI-VIN', 0.35]
      ],
      bud('Matériaux') * delta * 0.55 * jit()
    );
  }
  if (pct > 35 && prevPct < 96) {
    mk(
      'PLB',
      [
        ['PLB-PVC32', 0.4],
        ['PLB-WC', 0.35],
        ['PLB-LAV', 0.25]
      ],
      bud('Plomberie') * delta * 1.2 * jit()
    );
    mk(
      'ELE',
      [
        ['ELE-CAB25', 0.4],
        ['ELE-DIS20', 0.2],
        ['ELE-TAB', 0.4]
      ],
      bud('Électricité') * delta * 1.2 * jit()
    );
  }
  return out;
}

const TEAM_BY_FAMILY: Record<string, string[]> = {
  Ciment: ['Équipe maçonnerie', 'Équipe coffrage'],
  Granulats: ['Équipe maçonnerie', 'Équipe coffrage'],
  Agglomérés: ['Équipe maçonnerie'],
  'Fer à béton': ['Équipe ferraillage'],
  Quincaillerie: ['Équipe ferraillage'],
  Couverture: ['Entreprise Kouassi Bâtiment', 'Chef de chantier'],
  Finition: ['Équipe carrelage', 'Équipe peinture'],
  Plomberie: ['Équipe plomberie'],
  Électricité: ['Équipe électricité']
};

/** Le preneur le plus vraisemblable pour une famille d'articles. */
export function takerFor(book: StockBook, family: string, rng: () => number): string {
  const teams = TEAM_BY_FAMILY[family] ?? ['Chef de chantier'];
  const candidates = book.takers.filter(t => t.team && teams.includes(t.team));
  const pool = candidates.length > 0 ? candidates : book.takers;
  return pool[Math.floor(rng() * pool.length) % pool.length].id;
}

async function ensureSupplier(env: Env, key: 'MAT' | 'FER' | 'PLB' | 'ELE'): Promise<string> {
  const names: Record<string, { name: string; kind: string; contact: string; phone: string }> = {
    MAT: { name: 'Ciments et Matériaux du Golfe', kind: 'MATERIALS', contact: 'Yao Konan', phone: '+22507000101' },
    PLB: { name: 'Plomberie Sanitaire Ivoire', kind: 'MIXED', contact: 'Awa Ouattara', phone: '+22507000102' },
    ELE: { name: 'Électro Bâtiment CI', kind: 'MIXED', contact: 'Serge Bamba', phone: '+22507000103' },
    FER: {
      name: "Aciers et Fers d'Afrique de l'Ouest",
      kind: 'MATERIALS',
      contact: 'Moussa Diallo',
      phone: '+22507000105'
    }
  };
  const spec = names[key];
  const found = await env.prisma.supplier.findFirst({
    where: { tenantId: env.tenantId, name: spec.name },
    select: { id: true }
  });
  if (found) return found.id;
  const created: any = await env.run(tx =>
    env.svc.suppliers.createSupplierTx(tx, env.tenantId, {
      name: spec.name,
      kind: spec.kind as never,
      contactName: spec.contact,
      phone: spec.phone,
      email: null
    })
  );
  return created.id;
}

async function ensureContractor(
  env: Env,
  who: { name: string; trade: string } | { existing: string }
): Promise<string> {
  const name = 'existing' in who ? who.existing : who.name;
  const found = await env.prisma.contractor.findFirst({
    where: { tenantId: env.tenantId, fullName: name },
    select: { id: true }
  });
  if (found) return found.id;
  const created: any = await env.run(tx =>
    env.svc.contractors.createContractorTx(tx, env.tenantId, {
      fullName: name,
      trade: 'trade' in who ? who.trade : 'Maçonnerie'
    })
  );
  return created.id;
}

export interface SiteRun {
  spec: ExtraSiteSpec;
  siteId: string;
  siteName: string;
  siteLocation: string;
  lastMonth: number;
  /** Un mois d'activité du chantier (k = rang depuis son démarrage). */
  step: (k: number) => Promise<void>;
  /** Clôture (chantier livré) ou suspension. */
  finish: () => Promise<void>;
}

/** Prépare les chantiers à ajouter (lots, budget, marchés, bascule au stock) ; le déroulé mensuel est piloté par la chronologie. */
export async function prepareExtraSites(env: Env, book: StockBook): Promise<SiteRun[]> {
  const specs = SPECS.filter(s => s.status === 'CLOSED' || env.isIntegrated);
  const runs: SiteRun[] = [];
  for (const spec of specs) {
    const name = `${spec.name} — ${spec.zone.split(',')[0].replace(/ Zone 4| Quartier France/, '')}`;
    const exists = await env.prisma.constructionSite.findFirst({
      where: { tenantId: env.tenantId, name },
      select: { id: true }
    });
    if (exists) {
      env.ctx.log(`promoteur : ${name} déjà présent, rien à faire`);
      continue;
    }
    runs.push(await prepareSite(env, book, spec, name));
  }
  return runs;
}

async function prepareSite(env: Env, book: StockBook, spec: ExtraSiteSpec, siteName: string): Promise<SiteRun> {
  const { prisma, tenantId, rng, admin } = env;
  const { budgets, orders, contractors, progress, closing, suppliers } = env.svc;
  const startDate = env.at(spec.startMonth, 3);
  const plannedEnd = env.at(spec.startMonth + spec.durationMonths, 28);

  const supplier = {
    MAT: await ensureSupplier(env, 'MAT'),
    FER: await ensureSupplier(env, 'FER'),
    PLB: await ensureSupplier(env, 'PLB'),
    ELE: await ensureSupplier(env, 'ELE')
  };
  const mainId = await ensureContractor(env, spec.mainContractor);
  const finisherId = await ensureContractor(env, spec.finisher);

  const site = await prisma.constructionSite.create({
    data: {
      tenantId,
      name: siteName,
      zone: spec.zone,
      managerId: env.pickStaff(),
      status: 'PLANNED',
      startDate,
      plannedEndDate: plannedEnd,
      budgetThresholdPercent: spec.thresholdPercent,
      createdAt: addDays(startDate, -50)
    }
  });

  const typologies = [58, 72, 85, 96, 110, 128];
  for (let i = 1; i <= spec.lots; i++) {
    const block = String.fromCharCode(64 + Math.ceil(i / 6));
    await env.run(tx =>
      closing.createSiteLotTx(tx, tenantId, {
        siteId: site.id,
        name: `Lot ${block}${((i - 1) % 6) + 1}`,
        surfaceArea: pick(rng, typologies) + between(rng, 0, 4)
      })
    );
  }
  await env.run(tx => closing.setLotAllocationMethodTx(tx, tenantId, site.id, 'SURFACE' as never));

  const totalBudget = spec.lots * spec.costPerLot;
  const budgetByCat = new Map<string, number>();
  const lines = CATEGORY_LABELS.map(label => {
    const amount = round5k(totalBudget * SHARE[label]);
    budgetByCat.set(label, amount);
    return { costCategoryId: env.cat(label), label, amountForecast: amount };
  });
  const budget: any = await env.run(tx =>
    budgets.createSiteBudgetTx(tx, tenantId, { siteId: site.id, label: `Budget initial — ${spec.name}`, lines })
  );
  await env.run(tx => budgets.validateSiteBudgetTx(tx, tenantId, budget.id, admin));
  await prisma.siteBudget.update({ where: { id: budget.id }, data: { validatedAt: addDays(startDate, -6) } });
  await prisma.constructionSite.update({ where: { id: site.id }, data: { status: 'IN_PROGRESS' } });

  // Le chantier passe au stock dès l'ouverture : les factures de matériaux n'imputent plus, les sorties imputent.
  const siteLocation = await enableSiteStock(env, book, site.id, addDays(startDate, -2));

  const goAgreed = round5k((budgetByCat.get('Gros œuvre') ?? 0) * 0.45);
  const moAgreed = round5k((budgetByCat.get("Main-d'œuvre") ?? 0) * 0.75);
  const goContract: any = await env.run(tx =>
    contractors.createContractorContractTx(tx, tenantId, {
      contractorId: mainId,
      siteId: site.id,
      costCategoryId: env.cat('Gros œuvre'),
      reference: `MT-${spec.code}-GO`,
      agreedAmount: goAgreed,
      signedDate: addDays(startDate, 8)
    })
  );
  const moContract: any = await env.run(tx =>
    contractors.createContractorContractTx(tx, tenantId, {
      contractorId: finisherId,
      siteId: site.id,
      costCategoryId: env.cat("Main-d'œuvre"),
      reference: `MT-${spec.code}-MO`,
      agreedAmount: moAgreed,
      signedDate: addDays(startDate, 45)
    })
  );

  const midOffset = spec.startMonth + Math.floor(Math.min(spec.durationMonths, spec.activeMonths) / 2);
  const amendDelta = round5k(totalBudget * 0.035);
  const amendment: any = await env.run(tx =>
    budgets.createBudgetAmendmentTx(tx, tenantId, {
      budgetId: budget.id,
      amendmentDate: env.at(midOffset, 15),
      reason: spec.amendmentReason,
      lines: [
        { costCategoryId: env.cat('Gros œuvre'), amountDelta: amendDelta },
        { costCategoryId: env.cat('Divers'), amountDelta: -round5k(amendDelta * 0.2) }
      ],
      createdByUserId: admin
    })
  );
  await env.run(tx => budgets.validateBudgetAmendmentTx(tx, tenantId, amendment.id, admin));
  if (spec.pendingAmendment) {
    await env.run(tx =>
      budgets.createBudgetAmendmentTx(tx, tenantId, {
        budgetId: budget.id,
        amendmentDate: addDays(env.ctx.end, -40),
        reason: spec.pendingAmendment,
        lines: [
          { costCategoryId: env.cat('Gros œuvre'), amountDelta: round5k(totalBudget * 0.05) },
          { costCategoryId: env.cat('Matériaux'), amountDelta: round5k(totalBudget * 0.02) }
        ],
        createdByUserId: admin
      })
    );
  }

  // ---- Mois par mois ------------------------------------------------------
  const unpaidFrom = spec.status === 'SUSPENDED' ? spec.activeMonths - 3 : Infinity;
  const lastMonth = Math.min(spec.durationMonths - 1, spec.activeMonths - 1);
  let prevPct = 0;
  let goStated = 0;
  let moStated = 0;
  let pendingGo: { amount: number; date: Date } | null = null;
  let pendingMo: { amount: number; date: Date } | null = null;
  const received = new Map<string, number>();
  const pendingTransfers: Array<{ ref: string; qty: number; date: Date; from: string }> = [];
  let excessDone = false;
  let returnDone = false;

  const payInvoice = async (
    supplierId: string,
    invoiceId: string,
    amount: number,
    invoiceDate: Date,
    delay: number,
    k: number
  ) => {
    if (k >= unpaidFrom) return; // chantier à l'arrêt : factures récentes impayées
    const payDate = addDays(invoiceDate, delay);
    if (payDate > env.ctx.end) return;
    const roll = rng();
    const paid = roll > 0.93 ? Math.round((amount * 0.6) / 1000) * 1000 : amount;
    const pay: any = await env.run(tx =>
      suppliers.createSupplierPaymentTx(tx, tenantId, {
        supplierId,
        paymentDate: payDate,
        amount: paid,
        method: pick(rng, ['BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY'] as const),
        allocations: [{ invoiceId, amount: paid }],
        createdByUserId: admin
      })
    );
    await env.run(tx => suppliers.validateSupplierPaymentTx(tx, tenantId, pay.id, admin));
    await prisma.supplierPayment.update({ where: { id: pay.id }, data: { validatedAt: payDate } });
  };

  const step = async (k: number): Promise<void> => {
    const off = spec.startMonth + k;
    if (!env.inPast(env.at(off, 3))) return;
    const isFinal = spec.status === 'CLOSED' && k === lastMonth;
    let pct = isFinal ? 100 : Math.round(100 * curve((k + 1) / spec.durationMonths) * 0.99);
    pct = Math.max(prevPct, Math.min(100, pct));
    const delta = (pct - prevPct) / 100;
    const effDate = env.clampPast(env.at(off, 27));

    for (const [pending, contractorId] of [
      [pendingGo, mainId],
      [pendingMo, finisherId]
    ] as const) {
      if (pending && env.inPast(pending.date) && k < unpaidFrom + 1) {
        const pay: any = await env.run(tx =>
          contractors.createContractorPaymentTx(tx, tenantId, {
            contractorId,
            paymentDate: pending.date,
            amount: pending.amount,
            createdByUserId: admin
          })
        );
        await env.run(tx => contractors.validateContractorPaymentTx(tx, tenantId, pay.id, admin));
        await prisma.contractorPayment.update({ where: { id: pay.id }, data: { validatedAt: pending.date } });
      }
    }
    pendingGo = null;
    pendingMo = null;

    if (delta > 0) {
      const jit = (): number => 0.92 + rng() * 0.16 + spec.overrun;

      const goAmt = Math.min(goAgreed - goStated, round5k(goAgreed * delta * (0.95 + rng() * 0.1)));
      if (goAmt >= 5_000) {
        const st: any = await env.run(tx =>
          contractors.createProgressStatementTx(tx, tenantId, {
            contractId: goContract.id,
            statementDate: env.clampPast(env.at(off, 25)),
            amount: goAmt,
            description: `Situation n°${k + 1} — fondations, élévation et dalles`,
            createdByUserId: admin
          })
        );
        await env.run(tx => contractors.validateProgressStatementTx(tx, tenantId, st.id, admin));
        goStated += goAmt;
        pendingGo = { amount: round5k(goAmt * 0.85), date: env.at(off + 1, 8) };
      }
      const moAmt = Math.min(moAgreed - moStated, round5k(moAgreed * delta * (0.9 + rng() * 0.2)));
      if (moAmt >= 5_000 && pct > 25) {
        const st: any = await env.run(tx =>
          contractors.createProgressStatementTx(tx, tenantId, {
            contractId: moContract.id,
            statementDate: env.clampPast(env.at(off, 26)),
            amount: moAmt,
            description: `Situation n°${k + 1} — second œuvre et finitions`,
            createdByUserId: admin
          })
        );
        await env.run(tx => contractors.validateProgressStatementTx(tx, tenantId, st.id, admin));
        moStated += moAmt;
        pendingMo = { amount: round5k(moAmt * 0.9), date: env.at(off + 1, 12) };
      }

      // Achats : facture avec quantités et prix unitaires, bon de commande pour les gros fournisseurs, réception en magasin.
      const purchases = planPurchases(budgetByCat, pct, prevPct, delta, jit);
      const yyyymm = `${env.at(off, 1).getFullYear()}${String(env.at(off, 1).getMonth() + 1).padStart(2, '0')}`;
      for (const purchase of purchases) {
        const day =
          purchase.supplier === 'MAT' ? 5 : purchase.supplier === 'FER' ? 7 : purchase.supplier === 'PLB' ? 9 : 11;
        const invoiceDate = env.clampPast(env.at(off, day));
        const invLines = purchase.lines.map(l => {
          const meta = STOCK_CATALOG.find(c => c.reference === l.ref)!;
          const unitPrice = round1k(meta.price * (0.97 + rng() * 0.08));
          return { ...l, meta, unitPrice, amount: l.qty * unitPrice };
        });
        const byCat = new Map<CategoryLabel, number>();
        for (const l of invLines) byCat.set(l.meta.category, (byCat.get(l.meta.category) ?? 0) + l.amount);
        const total = invLines.reduce((s, l) => s + l.amount, 0);
        const supplierId = supplier[purchase.supplier];
        const tag = `${spec.code}-${yyyymm}`;

        let poId: string | null = null;
        if (purchase.supplier === 'MAT' || purchase.supplier === 'FER') {
          const po: any = await env.run(tx =>
            orders.createPurchaseOrderTx(tx, tenantId, {
              siteId: site.id,
              supplierId,
              reference: `BC-${purchase.supplier}-${tag}`,
              orderDate: env.clampPast(env.at(off, day - 3 > 0 ? day - 3 : 1)),
              lines: [...byCat.entries()].map(([c, amount]) => ({
                costCategoryId: env.cat(c),
                label: `Fournitures — ${c}`,
                amount
              })),
              createdByUserId: admin
            })
          );
          await env.run(tx => orders.issuePurchaseOrderTx(tx, tenantId, po.id, admin));
          await prisma.purchaseOrder.update({
            where: { id: po.id },
            data: { issuedAt: env.clampPast(env.at(off, day - 3 > 0 ? day - 3 : 1)) }
          });
          poId = po.id;
        }
        const inv: any = await env.run(tx =>
          suppliers.createSupplierInvoiceTx(tx, tenantId, {
            supplierId,
            invoiceDate,
            reference: `FAC-${purchase.supplier}-${tag}`,
            lines: invLines.map(l => ({
              label: l.meta.label,
              amount: l.amount,
              quantity: l.qty,
              unitPrice: l.unitPrice
            })),
            allocations: [...byCat.entries()].map(([c, amount]) => ({
              siteId: site.id,
              costCategoryId: env.cat(c),
              amount
            })),
            createdByUserId: admin
          })
        );
        if (poId) await env.run(tx => orders.linkInvoiceToPurchaseOrderTx(tx, tenantId, inv.id, poId));
        await env.run(tx => suppliers.validateSupplierInvoiceTx(tx, tenantId, inv.id, admin));
        await prisma.supplierInvoice.update({ where: { id: inv.id }, data: { validatedAt: invoiceDate } });
        await prisma.costAllocation.updateMany({
          where: { tenantId, sourceType: 'SUPPLIER_INVOICE', sourceId: inv.id, validatedAt: { not: null } },
          data: { validatedAt: invoiceDate }
        });
        await payInvoice(supplierId, inv.id, total, invoiceDate, 25 + between(rng, 0, 25), k);

        // Réception
        const dbLines = await prisma.supplierInvoiceLine.findMany({ where: { invoiceId: inv.id } });
        const lineId = (label: string): string | null => dbLines.find(d => d.label === label)?.id ?? null;
        const toWarehouse = purchase.supplier === 'MAT' && rng() < spec.viaWarehouse;
        const dest = toWarehouse ? book.warehouseId : siteLocation;
        const receiptDate = addDays(invoiceDate, between(rng, 1, 3));
        const partial = rng() < 0.14;
        const factor = partial ? 0.9 : 1;
        const by = env.pickStaff();
        const receiptLines = invLines.map(l => ({
          ref: l.ref,
          quantity: partial ? Math.max(1, Math.floor(l.qty * factor)) : l.qty,
          invoiceLineId: lineId(l.meta.label)
        }));
        const done = await receive(env, book, {
          locationId: dest,
          invoiceId: inv.id,
          date: receiptDate,
          lines: receiptLines,
          by
        });
        if (done) for (const l of receiptLines) received.set(l.ref, (received.get(l.ref) ?? 0) + l.quantity);
        if (done && partial) {
          const rest = invLines
            .map(l => ({
              ref: l.ref,
              quantity: l.qty - Math.floor(l.qty * factor),
              invoiceLineId: lineId(l.meta.label)
            }))
            .filter(l => l.quantity > 0);
          const second = await receive(env, book, {
            locationId: dest,
            invoiceId: inv.id,
            date: addDays(receiptDate, between(rng, 5, 9)),
            lines: rest,
            by
          });
          if (second) for (const l of rest) received.set(l.ref, (received.get(l.ref) ?? 0) + l.quantity);
        }
        // Livraison en trop (une fois par chantier) : alerte sur la facture, puis retour au fournisseur.
        if (done && !excessDone && purchase.supplier === 'MAT' && k > 2 && invLines[0].meta.reference === 'CIM-425') {
          excessDone = true;
          const extra = Math.max(10, Math.round(invLines[0].qty * 0.06));
          const dateExtra = addDays(receiptDate, 4);
          const over = await receive(env, book, {
            locationId: dest,
            invoiceId: inv.id,
            date: dateExtra,
            lines: [{ ref: 'CIM-425', quantity: extra, invoiceLineId: lineId(invLines[0].meta.label) }],
            by
          });
          if (over) {
            await supplierReturn(env, book, {
              locationId: dest,
              invoiceId: inv.id,
              ref: 'CIM-425',
              quantity: extra,
              date: addDays(dateExtra, 3),
              reasonCode: 'EXCESS_DELIVERY',
              reason: `Livraison de ${extra} sacs au-delà de la commande, reprise par le fournisseur`,
              by
            });
          }
        }
        // Fer rouillé reçu non conforme (une fois) : retour fournisseur.
        if (done && !returnDone && purchase.supplier === 'FER' && k > 4) {
          returnDone = true;
          await supplierReturn(env, book, {
            locationId: dest,
            invoiceId: inv.id,
            ref: invLines.find(l => l.ref === 'FER-12')?.ref ?? invLines[0].ref,
            quantity: 12,
            date: addDays(receiptDate, 2),
            reasonCode: 'NON_CONFORMING',
            reason: 'Barres présentant une corrosion avancée, refusées au déchargement',
            by
          });
        }
        if (toWarehouse && done) {
          for (const l of receiptLines)
            pendingTransfers.push({
              ref: l.ref,
              qty: Math.max(1, Math.floor(l.quantity * 0.85)),
              date: addDays(receiptDate, between(rng, 2, 6)),
              from: dest
            });
        }
      }

      // Approvisionnement du chantier depuis le magasin central.
      for (const t of pendingTransfers.splice(0)) {
        await transfer(env, book, {
          from: t.from,
          to: siteLocation,
          ref: t.ref,
          quantity: t.qty,
          date: t.date,
          reasonCode: 'SITE_SUPPLY',
          reason: null,
          takerId: book.takers.find(x => x.team === 'Magasin central')?.id ?? book.takers[0].id,
          by: env.pickStaff()
        });
      }

      // Consommation : sorties vers le chantier, quatre dates dans le mois.
      await consumeMonth(env, book, site.id, siteLocation, off, received, isFinal);
      received.clear();
    }

    await env.run(tx =>
      progress.recordSiteProgressTx(tx, tenantId, {
        siteId: site.id,
        entryDate: effDate,
        percent: pct,
        note: isFinal ? 'Réception des travaux et levée des réserves' : `Avancement de fin de mois : ${pct} %`,
        createdByUserId: admin
      })
    );
    prevPct = pct;

    // Un rebut occasionnel (casse de carrelage, sacs durcis) et un inventaire trimestriel.
    if (k > 1 && k % 5 === 2) {
      await scrap(env, book, {
        locationId: siteLocation,
        ref: pick(rng, ['CIM-425', 'PAR-15', 'CAR-6060', 'PEI-VIN'] as const),
        quantity: between(rng, 3, 14),
        date: env.clampPast(env.at(off, 20)),
        reasonCode: pick(rng, ['BREAKAGE', 'DETERIORATION'] as const),
        reason: 'Matériau inutilisable constaté lors du rangement du magasin de chantier',
        by: env.pickStaff()
      });
    }
    if (k > 0 && k % 4 === 3 && !isFinal) await quarterlyCount(env, book, siteLocation, env.clampPast(env.at(off, 29)));
  };

  // ---- Fin de vie
  const finish = async (): Promise<void> => {
    if (spec.status === 'CLOSED') {
      const closeDate = env.clampPast(env.at(spec.startMonth + spec.durationMonths, 10));
      // Reliquat rendu au magasin central, puis inventaire de clôture du lieu (vide), puis clôture.
      const leftovers = await prisma.stockBalance.findMany({
        where: { tenantId, locationId: siteLocation, quantity: { gt: 0 } },
        include: { item: { select: { reference: true } } }
      });
      for (const b of leftovers) {
        await transfer(env, book, {
          from: siteLocation,
          to: book.warehouseId,
          ref: b.item.reference,
          quantity: Number(b.quantity),
          date: addDays(closeDate, -6),
          reasonCode: 'RETURN_TO_WAREHOUSE',
          reason: null,
          takerId: book.takers.find(x => x.team === 'Chef de chantier')?.id ?? book.takers[0].id,
          by: env.pickStaff()
        });
      }
      const closingBy = env.staff.filter(s => s !== admin)[0] ?? admin;
      await runCount(env, book, {
        locationId: siteLocation,
        date: addDays(closeDate, -3),
        kind: 'CLOSING',
        counters: [closingBy],
        validator: admin,
        lines: [],
        final: 'VALIDATED'
      });
      await env.run(tx => closing.closeSiteTx(tx, tenantId, site.id, { closedByUserId: admin }), closeDate);
      await prisma.constructionSite.update({ where: { id: site.id }, data: { closedAt: closeDate } });
      // Le coût figé est celui d'aujourd'hui : la date de clôture a seule changé.
    } else {
      await prisma.constructionSite.update({ where: { id: site.id }, data: { status: 'SUSPENDED' } });
      // Stock gelé : inventaire de suspension, avec un manquant sans explication à instruire.
      const frozen = await countLinesFromBalances(env, siteLocation, 'forced');
      await runCount(env, book, {
        locationId: siteLocation,
        date: env.clampPast(env.at(spec.startMonth + spec.activeMonths, 12)),
        counters: env.staff
          .filter(s => s !== admin)
          .slice(0, 1)
          .concat(env.staff.length === 1 ? [admin] : []),
        validator: admin,
        lines: frozen.lines,
        reasons: frozen.reasons,
        final: 'VALIDATED'
      });
    }
    env.ctx.log(`promoteur : ${siteName} (${spec.lots} lots, ${spec.status}) généré avec son stock`);
  };

  return { spec, siteId: site.id, siteLocation, lastMonth, step, finish, siteName };
}

/** Quatre sorties étalées sur la fin du mois, au coût moyen du lieu. */
export async function consumeMonth(
  env: Env,
  book: StockBook,
  siteId: string,
  locationId: string,
  off: number,
  received: Map<string, number>,
  isFinal: boolean
): Promise<void> {
  const { rng } = env;
  const balances = await env.prisma.stockBalance.findMany({
    where: { tenantId: env.tenantId, locationId, quantity: { gt: 0 } },
    include: { item: { select: { reference: true } } }
  });
  const wanted: Array<{ ref: string; qty: number }> = [];
  for (const b of balances) {
    const ref = b.item.reference;
    const bal = Number(b.quantity);
    const take = isFinal
      ? bal * (0.94 + rng() * 0.05)
      : Math.min(
          bal * 0.78,
          (received.get(ref) ?? 0) * (0.62 + rng() * 0.16) + Math.max(0, bal - (received.get(ref) ?? 0)) * 0.3
        );
    const qty = Math.floor(take * 100) / 100;
    if (qty > 0) wanted.push({ ref, qty: qty >= 1 ? Math.floor(qty) : qty });
  }
  const days = [18, 22, 25, 28].filter(d => env.inPast(env.at(off, d)));
  if (days.length === 0) return;
  const buckets: Array<Array<{ ref: string; qty: number }>> = days.map(() => []);
  wanted.forEach((w, i) => buckets[(i + off) % days.length].push(w));
  for (let i = 0; i < days.length; i++) {
    const lines = buckets[i];
    if (lines.length === 0) continue;
    const family = STOCK_CATALOG.find(c => c.reference === lines[0].ref)!.family;
    await issue(env, book, {
      locationId,
      siteId,
      date: env.at(off, days[i]),
      lines: lines.map(l => ({ ref: l.ref, quantity: l.qty })),
      takerId: takerFor(book, family, rng),
      by: env.pickStaff()
    });
  }
}

/** Inventaire courant d'un lieu : l'écart est faible, parfois un article manque sans explication. */
export async function quarterlyCount(env: Env, book: StockBook, locationId: string, date: Date): Promise<void> {
  const { rng, prisma, tenantId } = env;
  const balances = await prisma.stockBalance.findMany({
    where: { tenantId, locationId, quantity: { gt: 0 } },
    include: { item: { select: { reference: true } } }
  });
  if (balances.length === 0) return;
  const lines = balances.map((b, i) => {
    const q = Number(b.quantity);
    const roll = rng();
    let counted = q;
    if (roll < 0.25) counted = Math.max(0, q - Math.max(1, Math.round(q * (0.01 + rng() * 0.05))));
    else if (roll < 0.33) counted = q + Math.max(1, Math.round(q * 0.02));
    return { ref: b.item.reference, counted: i % 9 === 8 ? q : counted };
  });
  // quelques articles de plus que le comptage n'a pas couverts : ils seront écartés
  const kept = lines.length > 6 ? lines.slice(0, lines.length - 1) : lines;
  const counters = env.staff.filter(s => s !== env.admin);
  await runCount(env, book, {
    locationId,
    date,
    counters: counters.length > 0 ? counters.slice(0, 2) : [env.admin],
    validator: env.admin,
    lines: kept,
    final: 'VALIDATED'
  });
}

export { balanceOf };
