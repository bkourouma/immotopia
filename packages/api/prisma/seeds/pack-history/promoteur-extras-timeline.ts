/**
 * Chronologie du stock : les chantiers ajoutés, le chantier d'Angré (basculé au
 * stock il y a une centaine de jours), le magasin central et le dépôt de
 * Bingerville vivent mois après mois dans UNE boucle, pour que chaque lieu
 * enchaîne ses mouvements dans l'ordre des dates (le solde « après » de chaque
 * mouvement reste cohérent dans le journal).
 */
import { addDays } from './types';
import type { Env } from './promoteur-extras-shared';
import { STOCK_CATALOG } from './promoteur-extras-shared';
import type { StockBook } from './promoteur-extras-stock';
import { countLinesFromBalances, enableSiteStock, receive, runCount, transfer } from './promoteur-extras-stock';
import { consumeMonth, prepareExtraSites, quarterlyCount } from './promoteur-extras-sites';
import type { SiteRun } from './promoteur-extras-sites';
import type { FieldKit } from './promoteur-extras-field';
import { ensureWhatsappRegistry, whatsappCount, whatsappMisfires } from './promoteur-extras-field';

/** Découpage des lignes de facture d'Angré (sans quantités) en articles du catalogue. */
const LINE_SPLIT: Record<string, Array<[string, number]>> = {
  'Ciment, sable et gravier': [
    ['CIM-425', 0.55],
    ['SAB-LAG', 0.15],
    ['GRA-1525', 0.3]
  ],
  'Fer à béton et agglos': [
    ['FER-10', 0.2],
    ['FER-12', 0.25],
    ['FER-14', 0.15],
    ['PAR-15', 0.25],
    ['PAR-20', 0.15]
  ],
  'Charpente et tôles': [
    ['TOL-BAC', 0.7],
    ['CHE-BOI', 0.3]
  ],
  'Tuyauterie et appareils sanitaires': [
    ['PLB-PVC32', 0.4],
    ['PLB-WC', 0.35],
    ['PLB-LAV', 0.25]
  ],
  'Câblage, tableaux et appareillage': [
    ['ELE-CAB25', 0.4],
    ['ELE-DIS20', 0.2],
    ['ELE-TAB', 0.4]
  ]
};

/** Part des factures d'Angré qui passe par le magasin de chantier (le reste va directement aux équipes). */
const ANG_STOCK_SHARE = 0.6;

const priceOf = (ref: string): number => STOCK_CATALOG.find(c => c.reference === ref)!.price;

function monthOffsetOf(env: Env, d: Date): number {
  return (d.getFullYear() - env.ctx.start.getFullYear()) * 12 + d.getMonth() - env.ctx.start.getMonth();
}

interface AngRun {
  siteId: string;
  siteName: string;
  locationId: string;
  bascule: Date;
  offB: number;
}

async function prepareAng(env: Env, book: StockBook): Promise<AngRun | null> {
  const ang = await env.prisma.constructionSite.findFirst({
    where: { tenantId: env.tenantId, name: { contains: 'Angré' }, status: 'IN_PROGRESS' }
  });
  if (!ang || ang.stockEnabledAt) return null;
  const bascule = addDays(env.ctx.end, -100);
  const locationId = await enableSiteStock(env, book, ang.id, bascule);
  return { siteId: ang.id, siteName: ang.name, locationId, bascule, offB: monthOffsetOf(env, bascule) };
}

export async function runStockTimeline(env: Env, book: StockBook): Promise<void> {
  const { prisma, tenantId, ctx } = env;
  const runs: SiteRun[] = await prepareExtraSites(env, book);
  const ang = await prepareAng(env, book);
  if (runs.length === 0 && !ang) {
    ctx.log('stock : chronologie déjà jouée, rien à faire');
    return;
  }
  const centralCountMonths = new Set([11, 14, 17, 20, 23, 26, 29, 32, 35]);
  const startOff = Math.min(...runs.map(r => r.spec.startMonth), ang ? ang.offB : 99);
  const finished = new Set<string>();
  let kit: FieldKit | null = null;
  const waDone = new Set<string>();

  for (let off = startOff; off <= ctx.months; off++) {
    if (!env.inPast(env.at(off, 2))) break;

    for (const run of runs) {
      const k = off - run.spec.startMonth;
      if (k >= 0 && k <= run.lastMonth) await run.step(k);
      const endOff =
        run.spec.status === 'CLOSED'
          ? run.spec.startMonth + run.spec.durationMonths
          : run.spec.startMonth + run.spec.activeMonths;
      if (off === endOff && !finished.has(run.siteId) && env.inPast(env.at(off, 10))) {
        await run.finish();
        finished.add(run.siteId);
      }
    }

    if (ang && off < ang.offB) await centralReceipts(env, book, ang, off);

    if (ang && off >= ang.offB) {
      const received = new Map<string, number>();
      if (off === ang.offB) {
        await angOpening(env, book, ang);
        kit = await ensureWhatsappRegistry(
          env,
          [ang.siteId, ...runs.filter(r => r.spec.status === 'SUSPENDED').map(r => r.siteId)],
          ang.bascule
        );
      }
      await angReceipts(env, book, ang, off, received);
      await consumeMonth(env, book, ang.siteId, ang.locationId, off, received, false);
      const sinceB = off - ang.offB;
      const countDay = env.clampPast(env.at(off, off === ctx.months ? 1 : 29));
      if (sinceB === 1) await quarterlyCount(env, book, ang.locationId, countDay);
      if (kit && sinceB === 2 && !waDone.has('1')) {
        waDone.add('1');
        await whatsappCount(env, book, kit, {
          siteId: ang.siteId,
          locationId: ang.locationId,
          siteName: ang.siteName,
          date: countDay,
          final: 'VALIDATED',
          variance: 'clean'
        });
      }
      if (kit && sinceB === 3 && !waDone.has('2')) {
        waDone.add('2');
        await whatsappCount(env, book, kit, {
          siteId: ang.siteId,
          locationId: ang.locationId,
          siteName: ang.siteName,
          date: countDay,
          final: 'VALIDATED',
          variance: 'forced'
        });
      }
      if (kit && sinceB >= 4 && !waDone.has('3')) {
        waDone.add('3');
        await whatsappCount(env, book, kit, {
          siteId: ang.siteId,
          locationId: ang.locationId,
          siteName: ang.siteName,
          date: addDays(ctx.end, -2),
          final: 'COUNTED',
          variance: 'forced'
        });
        await whatsappMisfires(
          env,
          kit,
          { siteId: ang.siteId, locationId: ang.locationId, siteName: ang.siteName },
          book
        );
      }
    }

    // Magasin central : inventaire trimestriel ; le 32e mois, un écart marqué à instruire.
    if (centralCountMonths.has(off) && env.inPast(env.at(off, 29))) {
      const forced = off === 32;
      const plan = await countLinesFromBalances(env, book.warehouseId, forced ? 'forced' : 'clean');
      if (plan.lines.length > 0) {
        const counters = env.staff.filter(s => s !== env.admin);
        await runCount(env, book, {
          locationId: book.warehouseId,
          date: env.at(off, 29),
          counters: counters.length > 0 ? counters.slice(0, 2) : [env.admin],
          validator: env.admin,
          lines: plan.lines.slice(0, Math.max(3, plan.lines.length - 2)),
          reasons: plan.reasons,
          final: 'VALIDATED'
        });
      }
    }

    // Le mois précédant l'ouverture des Vallons : le magasin central approvisionne le dépôt de Bingerville.
    if (off === ctx.months - 1) await stockDepot(env, book);
  }

  await finalCentralStates(env, book);
  void prisma;
  void tenantId;
}

/** Inventaire d'ouverture d'Angré (matière déjà sur place, entrée à valeur nulle) et premiers approvisionnements du magasin central. */
async function angOpening(env: Env, book: StockBook, ang: AngRun): Promise<void> {
  const counters = env.staff.filter(s => s !== env.admin);
  await runCount(env, book, {
    locationId: ang.locationId,
    date: addDays(ang.bascule, 2),
    kind: 'OPENING',
    counters: counters.length > 0 ? counters.slice(0, 1) : [env.admin],
    validator: env.admin,
    lines: [
      { ref: 'CIM-425', counted: 220 },
      { ref: 'FER-10', counted: 90 },
      { ref: 'FER-12', counted: 70 },
      { ref: 'PAR-15', counted: 1800 },
      { ref: 'SAB-LAG', counted: 14 },
      { ref: 'GRA-1525', counted: 11 },
      { ref: 'FIL-LIG', counted: 60 },
      { ref: 'TOL-BAC', counted: 150 }
    ],
    final: 'VALIDATED'
  });
  // Le magasin central dépanne le chantier avec ce qui lui reste des programmes livrés.
  const taker = book.takers.find(t => t.team === 'Magasin central')?.id ?? book.takers[0].id;
  for (const [ref, qty] of [
    ['CIM-425', 400],
    ['FER-12', 150],
    ['FER-14', 80],
    ['PAR-15', 2500],
    ['CAR-6060', 120],
    ['PEI-VIN', 30]
  ] as const) {
    await transfer(env, book, {
      from: book.warehouseId,
      to: ang.locationId,
      ref,
      quantity: qty,
      date: addDays(ang.bascule, 8),
      reasonCode: 'SITE_SUPPLY',
      reason: null,
      takerId: taker,
      by: env.pickStaff()
    });
  }
}

/** Le magasin central s'approvisionne sur une part des factures de matériaux d'Angré avant la bascule du chantier. */
async function centralReceipts(env: Env, book: StockBook, ang: AngRun, off: number): Promise<void> {
  const from = env.at(off, 1, 0);
  const to = new Date(Math.min(env.at(off + 1, 1, 0).getTime(), ang.bascule.getTime()));
  if (to <= from) return;
  const invoices = await env.prisma.supplierInvoice.findMany({
    where: { tenantId: env.tenantId, siteId: ang.siteId, status: 'VALIDATED', invoiceDate: { gte: from, lt: to } },
    include: { lines: true, supplier: { select: { name: true } } },
    orderBy: { invoiceDate: 'asc' }
  });
  for (const inv of invoices) {
    if (!inv.supplier.name.includes('Matériaux')) continue;
    const lines: Array<{ ref: string; quantity: number }> = [];
    for (const l of inv.lines) {
      for (const [ref, share] of LINE_SPLIT[l.label] ?? []) {
        const qty = Math.floor((Number(l.amount) * share * 0.12) / priceOf(ref));
        if (qty > 0) lines.push({ ref, quantity: qty });
      }
    }
    if (lines.length === 0) continue;
    await receive(env, book, {
      locationId: book.warehouseId,
      invoiceId: inv.id,
      date: addDays(inv.invoiceDate, 3),
      lines: lines.map(l => ({ ref: l.ref, quantity: l.quantity, unitCost: priceOf(l.ref) })),
      by: env.pickStaff()
    });
  }
}

/** Réceptions du mois sur les factures déjà imputées d'Angré, au prix catalogue déclaré. */
async function angReceipts(
  env: Env,
  book: StockBook,
  ang: AngRun,
  off: number,
  received: Map<string, number>
): Promise<void> {
  const from = new Date(Math.max(env.at(off, 1, 0).getTime(), ang.bascule.getTime()));
  const to = env.at(off + 1, 1, 0);
  const invoices = await env.prisma.supplierInvoice.findMany({
    where: { tenantId: env.tenantId, siteId: ang.siteId, status: 'VALIDATED', invoiceDate: { gte: from, lt: to } },
    include: { lines: true },
    orderBy: { invoiceDate: 'asc' }
  });
  for (const inv of invoices) {
    const lines: Array<{ ref: string; quantity: number }> = [];
    for (const l of inv.lines) {
      for (const [ref, share] of LINE_SPLIT[l.label] ?? []) {
        const qty = Math.floor((Number(l.amount) * share * ANG_STOCK_SHARE) / priceOf(ref));
        if (qty > 0) lines.push({ ref, quantity: qty });
      }
    }
    if (lines.length === 0) continue;
    const done = await receive(env, book, {
      locationId: ang.locationId,
      invoiceId: inv.id,
      date: addDays(inv.invoiceDate, 2),
      lines: lines.map(l => ({ ref: l.ref, quantity: l.quantity, unitCost: priceOf(l.ref) })),
      by: env.pickStaff()
    });
    if (done) for (const l of lines) received.set(l.ref, (received.get(l.ref) ?? 0) + l.quantity);
  }
}

/** Le dépôt de Bingerville reçoit du magasin central de quoi démarrer les Vallons ; un inventaire interrompu, puis un inventaire validé. */
async function stockDepot(env: Env, book: StockBook): Promise<void> {
  const taker = book.takers.find(t => t.team === 'Magasin central')?.id ?? book.takers[0].id;
  const date = addDays(env.ctx.end, -26);
  for (const [ref, qty] of [
    ['CIM-425', 150],
    ['FER-10', 80],
    ['FER-12', 60],
    ['PAR-15', 1500],
    ['SAB-LAG', 20],
    ['GRA-1525', 12]
  ] as const) {
    await transfer(env, book, {
      from: book.warehouseId,
      to: book.depotId,
      ref,
      quantity: qty,
      date,
      reasonCode: 'REBALANCING',
      reason: null,
      takerId: taker,
      by: env.pickStaff()
    });
  }
  const counters = env.staff.filter(s => s !== env.admin);
  const who = counters.length > 0 ? counters.slice(0, 1) : [env.admin];
  const first = await countLinesFromBalances(env, book.depotId, 'clean');
  if (first.lines.length === 0) return;
  await runCount(env, book, {
    locationId: book.depotId,
    date: addDays(env.ctx.end, -19),
    counters: who,
    validator: env.admin,
    lines: first.lines.slice(0, 3),
    final: 'CANCELLED',
    cancelReason: 'Comptage interrompu par la pluie : à reprendre sur un dépôt couvert'
  });
  await runCount(env, book, {
    locationId: book.depotId,
    date: addDays(env.ctx.end, -12),
    counters: who,
    validator: env.admin,
    lines: first.lines,
    final: 'VALIDATED'
  });
}

/** État du jour du magasin central : un inventaire en cours, compté à l'aveugle (rien n'est révélé avant la clôture). */
async function finalCentralStates(env: Env, book: StockBook): Promise<void> {
  const open = await env.prisma.stockCount.findFirst({
    where: { tenantId: env.tenantId, locationId: book.warehouseId, status: { in: ['DRAFT', 'COUNTED'] } }
  });
  if (open) return;
  const plan = await countLinesFromBalances(env, book.warehouseId, 'clean');
  if (plan.lines.length === 0) return;
  const counters = env.staff.filter(s => s !== env.admin);
  await runCount(env, book, {
    locationId: book.warehouseId,
    date: addDays(env.ctx.end, -1),
    counters: counters.length > 0 ? counters.slice(0, 2) : [env.admin],
    validator: env.admin,
    lines: plan.lines.slice(0, Math.max(2, Math.ceil(plan.lines.length / 2))),
    final: 'DRAFT'
  });
}
