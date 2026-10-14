/**
 * Stock de chantier (lots 040/041) : référentiel, preneurs et gestes du magasin
 * rejoués par les VRAIS services (réception, sortie, transfert, rebut, retour
 * fournisseur, inventaire), datés dans le passé.
 *
 * Les services refusent un stock négatif et calculent le coût moyen pondéré ;
 * ce module ne fait que dater leurs écritures (créées « maintenant ») à la date
 * métier du geste, et dater leur audit (journal immuable) par l'horloge.
 */
import { addDays } from './types';
import type { Env, Tx } from './promoteur-extras-shared';
import { STOCK_CATALOG, formatXof } from './promoteur-extras-shared';

export interface BookItem {
  id: string;
  reference: string;
  label: string;
  unit: string;
  category: string;
  price: number;
}

export interface BookTaker {
  id: string;
  label: string;
  team: string | null;
}

export interface StockBook {
  items: Map<string, BookItem>;
  warehouseId: string;
  depotId: string;
  takers: BookTaker[];
  siteLocation: Map<string, string>;
}

const hours = (d: Date, h: number, m = 0): Date => {
  const out = new Date(d.getTime());
  out.setHours(h, m, 0, 0);
  return out;
};

// ===========================================================================
// Réglages, référentiel, preneurs
// ===========================================================================

/** Seuils de contrôle propres à l'agence (le dirigeant a réglé les défauts) et dates ouvertes à l'historique. */
export async function openStockSettings(env: Env): Promise<{ restore: () => Promise<void> }> {
  const { prisma, tenantId } = env;
  const current = await prisma.stockSettings.findUnique({ where: { tenantId } });
  if (!current) {
    await env.run(tx => env.svc.stockRef.ensureStockSettingsTx(tx, tenantId));
  }
  const before = await prisma.stockSettings.findUniqueOrThrow({ where: { tenantId } });
  await prisma.stockSettings.update({
    where: { tenantId },
    data: {
      backdatingLimitDays: 4000,
      requireTaker: true,
      issueAlertAmount: 5_000_000,
      countVarianceAlertAmount: 150_000,
      countVarianceAlertPercent: 4,
      cashMaterialAlertAmount: 150_000
    }
  });
  return {
    restore: async () => {
      await prisma.stockSettings.update({
        where: { tenantId },
        data: {
          backdatingLimitDays: before.backdatingLimitDays === 4000 ? 7 : before.backdatingLimitDays,
          requireTaker: true,
          issueAlertAmount: 5_000_000,
          countVarianceAlertAmount: 150_000,
          countVarianceAlertPercent: 4,
          cashMaterialAlertAmount: 150_000,
          decisionNote:
            'Coût moyen pondéré retenu par la direction financière : une seule méthode pour tous les chantiers.',
          decidedAt: env.at(env.ctx.months - 20, 5),
          controlsUpdatedAt: env.at(env.ctx.months - 4, 12),
          controlsUpdatedByUserId: env.admin
        }
      });
    }
  };
}

export async function ensureStockBook(env: Env): Promise<StockBook> {
  const { prisma, tenantId, admin } = env;
  const firstUse = env.at(env.ctx.months - 28, 4);

  for (const item of STOCK_CATALOG) {
    const exists = await prisma.stockItem.findFirst({ where: { tenantId, reference: item.reference } });
    if (exists) continue;
    await prisma.stockItem.create({
      data: {
        tenantId,
        reference: item.reference,
        label: item.label,
        unit: item.unit,
        category: item.family,
        defaultCostCategoryId: env.cat(item.category),
        createdAt: firstUse
      }
    });
  }
  const itemRows = await prisma.stockItem.findMany({ where: { tenantId } });
  const items = new Map<string, BookItem>();
  for (const row of itemRows) {
    const meta = STOCK_CATALOG.find(c => c.reference === row.reference);
    if (!meta) continue;
    items.set(row.reference, {
      id: row.id,
      reference: row.reference,
      label: row.label,
      unit: row.unit,
      category: meta.category,
      price: meta.price
    });
  }

  const ensureLocation = async (label: string, createdAt: Date): Promise<string> => {
    const found = await prisma.stockLocation.findFirst({ where: { tenantId, label } });
    if (found) return found.id;
    const created = await prisma.stockLocation.create({
      data: { tenantId, kind: 'WAREHOUSE', label, createdAt }
    });
    return created.id;
  };
  const warehouseId = await ensureLocation('Magasin central — Yopougon', firstUse);
  const depotId = await ensureLocation('Dépôt de Bingerville (Domaine des Vallons)', env.at(env.ctx.months - 1, 6));

  const takerSpecs: Array<{ name: string; team: string | null; phone: string | null; contractor?: string }> = [
    { name: 'Koné Ibrahim', team: 'Équipe maçonnerie', phone: '+2250707112233' },
    { name: 'Ouattara Salif', team: 'Équipe ferraillage', phone: '+2250505447788' },
    { name: 'Yao Kouadio Marcel', team: 'Équipe coffrage', phone: '+2250101556677' },
    { name: 'Traoré Mamadou', team: 'Chef de chantier', phone: '+2250708990011' },
    { name: 'Bamba Adama', team: 'Équipe plomberie', phone: '+2250506223344' },
    { name: 'Coulibaly Seydou', team: 'Équipe électricité', phone: '+2250102334455' },
    { name: "N'Guessan Aya", team: 'Magasin central', phone: null },
    { name: 'Soro Lanciné', team: 'Équipe carrelage', phone: '+2250709887766' },
    {
      name: 'Kouassi Jean-Baptiste',
      team: 'Entreprise Kouassi Bâtiment',
      phone: '+2250707000555',
      contractor: 'Entreprise Kouassi Bâtiment'
    },
    { name: 'Diomandé Fanta', team: 'Équipe peinture', phone: '+2250504112200' }
  ];
  const { normalizeTakerName } = await import('../../../src/lib/finance/stock-preneurs');
  for (const t of takerSpecs) {
    const normalizedName = normalizeTakerName(t.name);
    const exists = await prisma.stockTaker.findFirst({ where: { tenantId, normalizedName, teamOrCompany: t.team } });
    if (exists) continue;
    const contractor = t.contractor
      ? await prisma.contractor.findFirst({ where: { tenantId, fullName: t.contractor }, select: { id: true } })
      : null;
    await prisma.stockTaker.create({
      data: {
        tenantId,
        fullName: t.name,
        normalizedName,
        teamOrCompany: t.team,
        phone: t.phone,
        contractorId: contractor?.id ?? null,
        isActive: true,
        createdByUserId: admin,
        createdAt: addDays(firstUse, Math.floor(env.rng() * 400))
      }
    });
  }
  // Un ancien preneur parti de l'agence : désactivé, ses sorties restent lisibles.
  const former = await prisma.stockTaker.findFirst({
    where: { tenantId, normalizedName: normalizeTakerName('Gnahoré Désiré') }
  });
  if (!former) {
    await prisma.stockTaker.create({
      data: {
        tenantId,
        fullName: 'Gnahoré Désiré',
        normalizedName: normalizeTakerName('Gnahoré Désiré'),
        teamOrCompany: 'Équipe maçonnerie',
        isActive: false,
        createdByUserId: admin,
        createdAt: firstUse
      }
    });
  }
  const takerRows = await prisma.stockTaker.findMany({
    where: { tenantId, isActive: true },
    orderBy: { createdAt: 'asc' }
  });
  const takers: BookTaker[] = takerRows.map(r => ({
    id: r.id,
    label: r.teamOrCompany ? `${r.fullName} — ${r.teamOrCompany}` : r.fullName,
    team: r.teamOrCompany
  }));

  const siteLocation = new Map<string, string>();
  const siteLocs = await prisma.stockLocation.findMany({
    where: { tenantId, kind: 'SITE' },
    select: { id: true, siteId: true }
  });
  for (const l of siteLocs) if (l.siteId) siteLocation.set(l.siteId, l.id);

  return { items, warehouseId, depotId, takers, siteLocation };
}

/** Bascule un chantier au stock (date métier) et crée son lieu, via le vrai service. */
export async function enableSiteStock(env: Env, book: StockBook, siteId: string, enabledAt: Date): Promise<string> {
  const site = await env.prisma.constructionSite.findFirst({ where: { id: siteId, tenantId: env.tenantId } });
  if (!site) throw new Error('Chantier introuvable pour la bascule au stock');
  if (!site.stockEnabledAt) {
    await env.run(
      tx =>
        env.svc.rapprochement.enableStockOnSiteTx(tx, env.tenantId, siteId, { enabledAt, enabledByUserId: env.admin }),
      enabledAt
    );
  }
  const loc = await env.prisma.stockLocation.findFirst({ where: { tenantId: env.tenantId, siteId } });
  if (!loc) throw new Error('Lieu de stockage du chantier introuvable');
  await env.prisma.stockLocation.update({ where: { id: loc.id }, data: { createdAt: enabledAt } });
  book.siteLocation.set(siteId, loc.id);
  return loc.id;
}

// ===========================================================================
// Gestes
// ===========================================================================

export async function balanceOf(env: Env, locationId: string, itemId: string): Promise<number> {
  const row = await env.prisma.stockBalance.findFirst({
    where: { tenantId: env.tenantId, locationId, itemId },
    select: { quantity: true }
  });
  return row ? Number(row.quantity) : 0;
}

async function retime(
  env: Env,
  ids: { slips?: string[]; movements?: string[]; subjects?: string[] },
  when: Date
): Promise<void> {
  const { prisma, tenantId } = env;
  if (ids.slips?.length)
    await prisma.stockSlip.updateMany({ where: { tenantId, id: { in: ids.slips } }, data: { createdAt: when } });
  if (ids.movements?.length) {
    await prisma.stockMovement.updateMany({
      where: { tenantId, id: { in: ids.movements } },
      data: { createdAt: when }
    });
    await prisma.costAllocation.updateMany({
      where: { tenantId, sourceType: 'STOCK_ISSUE', sourceId: { in: ids.movements } },
      data: { validatedAt: when }
    });
  }
  const subjects = [...(ids.slips ?? []), ...(ids.movements ?? []), ...(ids.subjects ?? [])];
  if (subjects.length)
    await prisma.stockAlert.updateMany({ where: { tenantId, subjectId: { in: subjects } }, data: { raisedAt: when } });
}

export interface ReceiptLine {
  ref: string;
  quantity: number;
  /** Ligne de la facture : le prix d'entrée en vient (valorisation `INVOICE_LINE`). */
  invoiceLineId?: string | null;
  unitCost?: number | null;
}

export async function receive(
  env: Env,
  book: StockBook,
  p: { locationId: string; invoiceId: string; date: Date; lines: ReceiptLine[]; by: string }
): Promise<{ slipId: string; movementIds: string[] } | null> {
  if (p.date > env.ctx.end) return null;
  const when = hours(p.date, 9 + Math.floor(env.rng() * 6), Math.floor(env.rng() * 60));
  try {
    const result: any = await env.run(
      tx =>
        env.svc.stockMov.recordStockReceiptTx(
          tx,
          env.tenantId,
          {
            locationId: p.locationId,
            supplierInvoiceId: p.invoiceId,
            receiptDate: p.date,
            createdByUserId: p.by,
            lines: p.lines.map(l => ({
              itemId: book.items.get(l.ref)!.id,
              quantity: l.quantity,
              supplierInvoiceLineId: l.invoiceLineId ?? null,
              unitCost: l.unitCost ?? null
            }))
          },
          { now: when }
        ),
      when
    );
    const slipId = result.slip.id as string;
    const movementIds = (result.movements as Array<{ id: string }>).map(m => m.id);
    await retime(env, { slips: [slipId], movements: movementIds }, when);
    return { slipId, movementIds };
  } catch (error) {
    env.ctx.log(`stock : réception ignorée (${(error as Error).message})`);
    return null;
  }
}

export interface IssueLine {
  ref: string;
  quantity: number;
}

export async function issue(
  env: Env,
  book: StockBook,
  p: {
    locationId: string;
    siteId: string;
    date: Date;
    lines: IssueLine[];
    takerId?: string | null;
    requestedBy?: string | null;
    by: string;
  }
): Promise<{ slipId: string; movementIds: string[]; total: number } | null> {
  if (p.date > env.ctx.end) return null;
  // Jamais plus que le solde : le service refuserait, on borne avant (le stock ne devient jamais négatif).
  const lines: IssueLine[] = [];
  for (const l of p.lines) {
    const item = book.items.get(l.ref);
    if (!item) continue;
    const available = await balanceOf(env, p.locationId, item.id);
    const quantity = Math.min(l.quantity, Math.floor(available * 10_000) / 10_000);
    if (quantity > 0) lines.push({ ref: l.ref, quantity });
  }
  if (lines.length === 0) return null;
  const when = hours(p.date, 7 + Math.floor(env.rng() * 4), Math.floor(env.rng() * 60));
  try {
    const result: any = await env.run(
      tx =>
        env.svc.stockMov.recordStockIssueTx(
          tx,
          env.tenantId,
          {
            locationId: p.locationId,
            siteId: p.siteId,
            issueDate: p.date,
            takerId: p.takerId ?? null,
            requestedBy: p.requestedBy ?? null,
            createdByUserId: p.by,
            lines: lines.map(l => {
              const item = book.items.get(l.ref)!;
              return { itemId: item.id, quantity: l.quantity, costCategoryId: env.cat(item.category) };
            })
          },
          { now: when }
        ),
      when
    );
    const slipId = result.slip.id as string;
    const movementIds = (result.movements as Array<{ id: string }>).map(m => m.id);
    const total = (result.movements as Array<{ totalValue: number }>).reduce(
      (s, m) => s + Number(m.totalValue ?? 0),
      0
    );
    await retime(env, { slips: [slipId], movements: movementIds }, when);
    return { slipId, movementIds, total };
  } catch (error) {
    env.ctx.log(`stock : sortie ignorée (${(error as Error).message})`);
    return null;
  }
}

export async function transfer(
  env: Env,
  book: StockBook,
  p: {
    from: string;
    to: string;
    ref: string;
    quantity: number;
    date: Date;
    reasonCode: 'SITE_SUPPLY' | 'RETURN_TO_WAREHOUSE' | 'SITE_EVACUATION' | 'REBALANCING' | 'OTHER';
    reason?: string | null;
    takerId?: string | null;
    by: string;
  }
): Promise<{ movementIds: string[] } | null> {
  if (p.date > env.ctx.end) return null;
  const item = book.items.get(p.ref);
  if (!item) return null;
  const available = await balanceOf(env, p.from, item.id);
  const quantity = Math.min(p.quantity, Math.floor(available * 10_000) / 10_000);
  if (quantity <= 0) return null;
  const when = hours(p.date, 8 + Math.floor(env.rng() * 5), Math.floor(env.rng() * 60));
  try {
    const result: any = await env.run(
      tx =>
        env.svc.stockTransfer.recordStockTransferTx(
          tx,
          env.tenantId,
          {
            fromLocationId: p.from,
            toLocationId: p.to,
            itemId: item.id,
            quantity,
            transferDate: p.date,
            reasonCode: p.reasonCode,
            reason: p.reason ?? null,
            takerId: p.takerId ?? null,
            createdByUserId: p.by
          },
          { now: when }
        ),
      when
    );
    const movementIds = (result.movements as Array<{ id: string }>).map(m => m.id);
    await retime(env, { movements: movementIds }, when);
    return { movementIds };
  } catch (error) {
    env.ctx.log(`stock : transfert ignoré (${(error as Error).message})`);
    return null;
  }
}

export async function scrap(
  env: Env,
  book: StockBook,
  p: {
    locationId: string;
    ref: string;
    quantity: number;
    date: Date;
    reasonCode: 'BREAKAGE' | 'DETERIORATION' | 'OTHER';
    reason?: string;
    by: string;
  }
): Promise<string | null> {
  if (p.date > env.ctx.end) return null;
  const item = book.items.get(p.ref);
  if (!item) return null;
  const available = await balanceOf(env, p.locationId, item.id);
  const quantity = Math.min(p.quantity, Math.floor(available * 10_000) / 10_000);
  if (quantity <= 0) return null;
  const when = hours(p.date, 15, Math.floor(env.rng() * 50));
  try {
    const view: any = await env.run(
      tx =>
        env.svc.stockMov.recordStockScrapTx(
          tx,
          env.tenantId,
          {
            locationId: p.locationId,
            itemId: item.id,
            quantity,
            scrapDate: p.date,
            reasonCode: p.reasonCode,
            reason: p.reason ?? null,
            createdByUserId: p.by
          },
          { now: when }
        ),
      when
    );
    await retime(env, { movements: [view.id] }, when);
    return view.id as string;
  } catch (error) {
    env.ctx.log(`stock : rebut ignoré (${(error as Error).message})`);
    return null;
  }
}

export async function supplierReturn(
  env: Env,
  book: StockBook,
  p: {
    locationId: string;
    invoiceId: string;
    ref: string;
    quantity: number;
    date: Date;
    reasonCode: 'NON_CONFORMING' | 'DAMAGED_ON_DELIVERY' | 'EXCESS_DELIVERY' | 'OTHER';
    reason?: string;
    by: string;
  }
): Promise<string | null> {
  if (p.date > env.ctx.end) return null;
  const item = book.items.get(p.ref);
  if (!item) return null;
  const available = await balanceOf(env, p.locationId, item.id);
  const quantity = Math.min(p.quantity, Math.floor(available * 10_000) / 10_000);
  if (quantity <= 0) return null;
  const when = hours(p.date, 11, Math.floor(env.rng() * 50));
  try {
    const view: any = await env.run(
      tx =>
        env.svc.stockMov.recordStockSupplierReturnTx(
          tx,
          env.tenantId,
          {
            locationId: p.locationId,
            supplierInvoiceId: p.invoiceId,
            itemId: item.id,
            quantity,
            returnDate: p.date,
            reasonCode: p.reasonCode,
            reason: p.reason ?? null,
            createdByUserId: p.by
          },
          { now: when }
        ),
      when
    );
    await retime(env, { movements: [view.id] }, when);
    return view.id as string;
  } catch (error) {
    env.ctx.log(`stock : retour fournisseur ignoré (${(error as Error).message})`);
    return null;
  }
}

// ===========================================================================
// Inventaires
// ===========================================================================

export interface CountPlan {
  locationId: string;
  date: Date;
  kind?: 'REGULAR' | 'OPENING' | 'CLOSING';
  counters: string[];
  validator: string;
  /** Quantités comptées par article (les autres articles en stock restent « non comptés » : écartés). */
  lines: Array<{ ref: string; counted: number }>;
  final: 'VALIDATED' | 'COUNTED' | 'DRAFT' | 'CANCELLED';
  cancelReason?: string;
  /** Motifs d'écart, article par article ; sinon choisis selon le sens de l'écart. */
  reasons?: Record<string, { code: string; text?: string }>;
  source?: 'WEB' | 'WHATSAPP';
}

const SHORT_REASONS = ['BREAKAGE', 'DETERIORATION', 'COUNTING_ERROR', 'UNRECORDED_ISSUE'] as const;
const OVER_REASONS = ['UNRECORDED_RECEIPT', 'ENTRY_ERROR', 'UNIT_CONFUSION', 'COUNTING_ERROR'] as const;

export async function runCount(
  env: Env,
  book: StockBook,
  p: CountPlan
): Promise<{ countId: string; slipId: string | null } | null> {
  if (p.date > env.ctx.end) return null;
  const { prisma, tenantId } = env;
  const clock = hours(p.date, 8);
  const svc = env.svc.stockCount;
  const kind = p.kind ?? 'REGULAR';
  const counters = p.counters.length > 0 ? p.counters : [env.admin];
  let countId = '';
  try {
    // L'inventaire d'ouverture n'est permis que dans les 30 jours de la bascule : on la rapproche le temps de l'ouverture.
    let restoreEnabledAt: (() => Promise<void>) | null = null;
    if (kind === 'OPENING') {
      const loc = await prisma.stockLocation.findFirstOrThrow({
        where: { id: p.locationId },
        select: { siteId: true }
      });
      if (loc.siteId) {
        const site = await prisma.constructionSite.findFirstOrThrow({
          where: { id: loc.siteId },
          select: { stockEnabledAt: true }
        });
        const original = site.stockEnabledAt;
        await prisma.constructionSite.update({ where: { id: loc.siteId }, data: { stockEnabledAt: new Date() } });
        restoreEnabledAt = async () => {
          await prisma.constructionSite.update({ where: { id: loc.siteId! }, data: { stockEnabledAt: original } });
        };
      }
    }
    try {
      const created = await env.run(
        tx =>
          svc.createStockCountTx(tx, tenantId, {
            locationId: p.locationId,
            countedAt: p.date,
            createdByUserId: counters[0],
            kind
          }),
        clock
      );
      countId = (created as { id: string }).id;
    } finally {
      if (restoreEnabledAt) await restoreEnabledAt();
    }
    if (p.source === 'WHATSAPP')
      await prisma.stockCount.update({ where: { id: countId }, data: { source: 'WHATSAPP' } });

    let i = 0;
    for (const line of p.lines) {
      const item = book.items.get(line.ref);
      if (!item) continue;
      await env.run(
        tx =>
          svc.setStockCountLineTx(tx, tenantId, countId, {
            itemId: item.id,
            countedQuantity: line.counted,
            countedByUserId: counters[i % counters.length]
          }),
        clock
      );
      i += 1;
    }
    let slipId: string | null = null;
    if (p.final === 'CANCELLED') {
      await env.run(
        tx =>
          svc.cancelStockCountTx(tx, tenantId, countId, {
            reason: p.cancelReason ?? 'Inventaire interrompu avant la fin du comptage',
            cancelledByUserId: counters[0]
          }),
        hours(p.date, 13)
      );
      await prisma.stockCount.update({
        where: { id: countId },
        data: { cancelledAt: hours(p.date, 13), createdAt: hours(p.date, 8) }
      });
      await prisma.stockCountLine.updateMany({
        where: { countId },
        data: { expectedCapturedAt: hours(p.date, 8), countedAtServer: hours(p.date, 9), countedBlind: true }
      });
      await prisma.stockAlert.updateMany({
        where: { tenantId, subjectId: countId },
        data: { raisedAt: hours(p.date, 13) }
      });
      return { countId, slipId: null };
    }
    if (p.final !== 'DRAFT') {
      await env.run(tx => svc.closeStockCountTx(tx, tenantId, countId, counters[0]), hours(p.date, 12));
      if (p.source === 'WHATSAPP') {
        const loc = await prisma.stockLocation.findFirstOrThrow({
          where: { id: p.locationId },
          select: { siteId: true }
        });
        const { raiseFieldCountClosedAlertTx } = await import('../../../src/lib/stock-whatsapp/engine/field-alert');
        await env.run(
          tx =>
            raiseFieldCountClosedAlertTx(tx, {
              tenantId,
              countId,
              siteId: loc.siteId,
              locationId: p.locationId,
              capturesCount: p.lines.length,
              uncountedLinesCount: 0
            }),
          hours(p.date, 12)
        );
      }
      const lines =
        p.final === 'VALIDATED'
          ? await prisma.stockCountLine.findMany({
              where: { countId },
              include: { item: { select: { reference: true } } }
            })
          : [];
      const justifier = p.validator;
      for (const l of lines) {
        if (l.countedQuantity === null || l.setAsideAt) continue;
        const variance = Number(l.countedQuantity) - Number(l.expectedQuantity);
        if (Math.abs(variance) < 0.00005) continue;
        if (kind === 'OPENING' && variance > 0) continue;
        const forced = p.reasons?.[l.item.reference];
        const pool = variance < 0 ? SHORT_REASONS : OVER_REASONS;
        const code = (forced?.code ?? pool[Math.floor(env.rng() * pool.length) % pool.length]) as any;
        const text =
          forced?.text ??
          (code === 'BREAKAGE'
            ? 'Casse constatée au déchargement et à la manutention'
            : code === 'DETERIORATION'
              ? 'Matériau détérioré par la pluie, stockage à ciel ouvert'
              : code === 'UNRECORDED_ISSUE'
                ? 'Sortie du chef de chantier non saisie à temps'
                : code === 'UNRECORDED_RECEIPT'
                  ? 'Livraison reçue sans bon de réception saisi'
                  : null);
        await env.run(
          tx =>
            svc.justifyStockCountLineTx(tx, tenantId, countId, l.itemId, {
              reasonCode: code,
              reason: text,
              justifiedByUserId: justifier
            }),
          hours(p.date, 14)
        );
      }
      if (kind === 'REGULAR' && p.final === 'VALIDATED') {
        await env.run(
          tx =>
            svc.setAsideUncountedStockCountLinesTx(tx, tenantId, countId, {
              reason: 'Article non compté ce jour : repris au prochain inventaire',
              setAsideByUserId: p.validator
            }),
          hours(p.date, 14, 20)
        );
      }
      if (p.final === 'VALIDATED') {
        const self = counters.includes(p.validator);
        const out = await env.run(
          tx =>
            svc.validateStockCountTx(tx, tenantId, countId, p.validator, {
              selfValidationReason: self
                ? "Seule personne habilitée à valider le stock de l'agence : comptage validé après contrôle des écarts"
                : null
            }),
          hours(p.date, 16)
        );
        slipId = (out as { slip: { id: string } }).slip.id;
      }
    }
    await retimeCount(env, countId, p.date, p.final);
    return { countId, slipId };
  } catch (error) {
    env.ctx.log(`stock : inventaire ignoré (${(error as Error).message})`);
    return null;
  }
}

async function retimeCount(
  env: Env,
  countId: string,
  date: Date,
  final: 'VALIDATED' | 'COUNTED' | 'DRAFT' | 'CANCELLED'
): Promise<void> {
  const { prisma, tenantId } = env;
  const t0 = hours(date, 8);
  const t1 = hours(date, 12);
  const t2 = hours(date, 14, 20);
  const t3 = hours(date, 16);
  const count = await prisma.stockCount.findFirstOrThrow({ where: { id: countId, tenantId } });
  await prisma.stockCount.update({
    where: { id: countId },
    data: {
      createdAt: t0,
      closedAt: count.closedAt ? t1 : null,
      validatedAt: count.validatedAt ? t3 : null
    }
  });
  await prisma.stockCountLine.updateMany({
    where: { countId },
    data: { expectedCapturedAt: t0, countedAtServer: addDays(t0, 0) }
  });
  await prisma.stockCountLine.updateMany({ where: { countId, justifiedAt: { not: null } }, data: { justifiedAt: t2 } });
  await prisma.stockCountLine.updateMany({ where: { countId, setAsideAt: { not: null } }, data: { setAsideAt: t2 } });
  if (final === 'DRAFT') await prisma.stockCountLine.updateMany({ where: { countId }, data: { countedBlind: true } });
  const slip = await prisma.stockSlip.findFirst({ where: { tenantId, stockCountId: countId }, select: { id: true } });
  const movements = await prisma.stockMovement.findMany({
    where: { tenantId, stockCountId: countId },
    select: { id: true }
  });
  await retime(env, { slips: slip ? [slip.id] : [], movements: movements.map(m => m.id), subjects: [countId] }, t3);
}

export function describeValue(n: number): string {
  return formatXof(n);
}

export type { Tx };

/**
 * Quantités « comptées » d'un lieu, déduites du solde du jour.
 *  - `clean`  : quasi tout juste, un ou deux petits écarts ;
 *  - `forced` : un écart marqué sur le fer et le ciment (casse, humidité, manquant non expliqué).
 */
export async function countLinesFromBalances(
  env: Env,
  locationId: string,
  policy: 'clean' | 'forced',
  limit = 99
): Promise<{
  lines: Array<{ ref: string; counted: number }>;
  reasons: Record<string, { code: string; text?: string }>;
}> {
  const rows = await env.prisma.stockBalance.findMany({
    where: { tenantId: env.tenantId, locationId, quantity: { gt: 0 } },
    include: { item: { select: { reference: true } } },
    orderBy: { value: 'desc' }
  });
  const reasons: Record<string, { code: string; text?: string }> = {};
  const lines = rows.slice(0, limit).map((b, i) => {
    const ref = b.item.reference;
    const q = Number(b.quantity);
    let counted = q;
    if (policy === 'forced') {
      if (ref === 'FER-12' || ref === 'FER-10') {
        counted = Math.max(0, q - Math.max(6, Math.round(q * 0.09)));
        reasons[ref] = {
          code: 'UNEXPLAINED_DISAPPEARANCE',
          text: 'Barres manquantes constatées, recherche en cours auprès des équipes'
        };
      } else if (ref === 'CIM-425') {
        counted = Math.max(0, q - Math.max(8, Math.round(q * 0.05)));
        reasons[ref] = {
          code: 'DETERIORATION',
          text: 'Sacs durcis par l’humidité, stockage non couvert pendant la saison des pluies'
        };
      } else if (i % 4 === 1) counted = q + Math.max(1, Math.round(q * 0.02));
    } else if (i % 6 === 2) {
      counted = Math.max(0, q - Math.max(1, Math.round(q * 0.02)));
    }
    return { ref, counted };
  });
  return { lines, reasons };
}
