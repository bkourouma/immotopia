/**
 * Finance de chantier : retenues de garantie, caisse de chantier (pièces et
 * sessions), alertes de dépassement de budget, lots basculés au patrimoine et
 * associations de co-promotion.
 *
 * Les pièces passent par les services (numéros, écritures, imputations) ; les
 * dates, posées « maintenant » par les services, sont recalées sur la date
 * métier. Idempotent par bloc.
 */
import { addDays, between, pick } from './types';
import type { Env } from './promoteur-extras-shared';
import { round1k } from './promoteur-extras-shared';

// ===========================================================================
// Aides
// ===========================================================================

type SiteRow = {
  id: string;
  name: string;
  status: string;
  closedAt: Date | null;
  startDate: Date | null;
  plannedEndDate: Date | null;
  budgetThresholdPercent: number | null;
  finalCost: unknown;
  closedByUserId: string | null;
};

async function loadSites(env: Env): Promise<Array<SiteRow & { code: string }>> {
  const rows = await env.prisma.constructionSite.findMany({
    where: { tenantId: env.tenantId },
    orderBy: { createdAt: 'asc' }
  });
  const codeOf = (name: string): string =>
    name.includes('Cocotiers')
      ? 'COC'
      : name.includes('Angré')
        ? 'ANG'
        : name.includes('Vallons')
          ? 'VAL'
          : name.includes('Orchid')
            ? 'ORC'
            : name.includes('Lagon')
              ? 'LAG'
              : 'XXX';
  return rows.map(r => ({ ...(r as unknown as SiteRow), code: codeOf(r.name) }));
}

const hoursAt = (d: Date, h: number, m = 0): Date => {
  const out = new Date(d.getTime());
  out.setHours(h, m, 0, 0);
  return out;
};

// ===========================================================================
// Retenues de garantie
// ===========================================================================

export async function seedRetentions(env: Env): Promise<void> {
  const { prisma, tenantId, admin } = env;
  if ((await prisma.retentionGuarantee.count({ where: { tenantId } })) > 0) return;
  const sites = await loadSites(env);
  const byCode = new Map(sites.map(s => [s.code, s]));

  const retainStatements = async (opts: {
    code: string;
    suffix: 'GO' | 'MO';
    take: number;
    rate: number;
    planned: (statementDate: Date, index: number) => Date;
    release?: (statementDate: Date, planned: Date, index: number) => Date | null;
  }): Promise<void> => {
    const site = byCode.get(opts.code);
    if (!site) return;
    const contract = await prisma.contractorContract.findFirst({
      where: { tenantId, reference: `MT-${opts.code}-${opts.suffix}` }
    });
    if (!contract) return;
    const statements = await prisma.progressStatement.findMany({
      where: { tenantId, contractId: contract.id, status: 'VALIDATED' },
      orderBy: { statementDate: 'asc' }
    });
    const chosen = statements.slice(-opts.take);
    let index = 0;
    for (const st of chosen) {
      const planned = opts.planned(st.statementDate, index);
      const rec: any = await env.run(tx =>
        env.svc.retentions.createRetentionTx(tx, tenantId, {
          sourceType: 'PROGRESS_STATEMENT',
          sourceId: st.id,
          ratePercent: opts.rate,
          plannedReleaseDate: planned,
          createdByUserId: admin
        })
      );
      await prisma.retentionGuarantee.update({
        where: { id: rec.id },
        data: { createdAt: hoursAt(addDays(st.statementDate, 1), 9) }
      });
      const releaseAt = opts.release?.(st.statementDate, planned, index) ?? null;
      if (releaseAt && releaseAt <= env.ctx.end) {
        await env.run(tx => env.svc.retentions.releaseRetentionTx(tx, tenantId, rec.id, admin), releaseAt);
        const row = await prisma.retentionGuarantee.findFirstOrThrow({ where: { id: rec.id } });
        await prisma.retentionGuarantee.update({
          where: { id: rec.id },
          data: { releasedAt: releaseAt, updatedAt: releaseAt }
        });
        if (row.releasedJournalEntryId) {
          await prisma.journalEntry.update({
            where: { id: row.releasedJournalEntryId },
            data: { entryDate: releaseAt }
          });
        }
        await prisma.thirdPartyMovement.updateMany({
          where: { tenantId, sourceType: 'RETENTION_RELEASED' as never, sourceId: rec.id },
          data: { movementDate: releaseAt }
        });
      }
      index += 1;
    }
  };

  const coc = byCode.get('COC');
  if (coc?.closedAt) {
    const closed = coc.closedAt;
    await retainStatements({
      code: 'COC',
      suffix: 'GO',
      take: 10,
      rate: 5,
      planned: () => addDays(closed, 365),
      release: (_d, planned) => addDays(planned, 12)
    });
    await retainStatements({
      code: 'COC',
      suffix: 'MO',
      take: 6,
      rate: 3,
      planned: () => addDays(closed, 180),
      release: (_d, planned) => addDays(planned, 4)
    });
  }
  const orc = byCode.get('ORC');
  if (orc?.closedAt) {
    const closed = orc.closedAt;
    await retainStatements({ code: 'ORC', suffix: 'GO', take: 8, rate: 5, planned: () => addDays(closed, 365) });
    await retainStatements({
      code: 'ORC',
      suffix: 'MO',
      take: 5,
      rate: 3,
      planned: () => addDays(closed, 180),
      release: (_d, planned) => addDays(planned, 9)
    });
  }
  const ang = byCode.get('ANG');
  if (ang) {
    const end = ang.plannedEndDate ?? addDays(env.ctx.end, 200);
    await retainStatements({
      code: 'ANG',
      suffix: 'GO',
      take: 14,
      rate: 5,
      planned: (_d, i) => (i < 7 ? addDays(env.ctx.end, -(30 + (i % 4) * 10)) : end),
      release: (_d, planned, i) => (i < 2 ? addDays(planned, 6) : null)
    });
    await retainStatements({ code: 'ANG', suffix: 'MO', take: 6, rate: 3, planned: () => addDays(end, 30) });
  }
  const lag = byCode.get('LAG');
  if (lag) {
    await retainStatements({ code: 'LAG', suffix: 'GO', take: 12, rate: 5, planned: () => addDays(env.ctx.end, 150) });
    // Factures laissées impayées à l'arrêt du chantier : une retenue de 10 % en garantie de reprise des malfaçons.
    const unpaid = await prisma.supplierInvoice.findMany({
      where: { tenantId, siteId: lag.id, status: 'VALIDATED', paymentAllocations: { none: {} } as never },
      orderBy: { invoiceDate: 'desc' },
      take: 4
    });
    for (const inv of unpaid) {
      try {
        const rec: any = await env.run(tx =>
          env.svc.retentions.createRetentionTx(tx, tenantId, {
            sourceType: 'SUPPLIER_INVOICE',
            sourceId: inv.id,
            ratePercent: 10,
            plannedReleaseDate: addDays(env.ctx.end, 120),
            createdByUserId: admin
          })
        );
        await prisma.retentionGuarantee.update({
          where: { id: rec.id },
          data: { createdAt: hoursAt(addDays(inv.invoiceDate, 1), 9) }
        });
      } catch (error) {
        env.ctx.log(`retenues : facture ignorée (${(error as Error).message})`);
      }
    }
  }
  env.ctx.log(`retenues de garantie : ${await prisma.retentionGuarantee.count({ where: { tenantId } })} posées`);
}

// ===========================================================================
// Caisse de chantier
// ===========================================================================

interface VoucherSpec {
  site: SiteRow & { code: string };
  date: Date;
  beneficiary: string;
  reason: string;
  amount: number;
  category: 'Divers' | "Main-d'œuvre" | 'Matériaux';
}

const SMALL_EXPENSES: Array<{
  beneficiary: string;
  reason: string;
  min: number;
  max: number;
  category: VoucherSpec['category'];
}> = [
  {
    beneficiary: 'Établissements Sylla Location',
    reason: 'Location de bétonnière et de vibreur (journée)',
    min: 45_000,
    max: 120_000,
    category: 'Divers'
  },
  {
    beneficiary: 'Transports Yéo & Frères',
    reason: 'Transport de matériaux — camion benne',
    min: 60_000,
    max: 180_000,
    category: 'Divers'
  },
  {
    beneficiary: 'Koffi Narcisse (chef d’équipe)',
    reason: 'Paie des manœuvres journaliers de la quinzaine',
    min: 150_000,
    max: 420_000,
    category: "Main-d'œuvre"
  },
  {
    beneficiary: 'SODECI',
    reason: 'Eau et branchement provisoire de chantier',
    min: 25_000,
    max: 60_000,
    category: 'Divers'
  },
  {
    beneficiary: 'CIE — Compagnie Ivoirienne d’Électricité',
    reason: 'Consommation électrique du chantier',
    min: 35_000,
    max: 95_000,
    category: 'Divers'
  },
  {
    beneficiary: 'Sécurité Plus Gardiennage',
    reason: 'Gardiennage du chantier (mois)',
    min: 90_000,
    max: 140_000,
    category: 'Divers'
  },
  {
    beneficiary: 'Quincaillerie Générale d’Abobo',
    reason: 'Petit outillage, visserie et équipements de protection',
    min: 35_000,
    max: 130_000,
    category: 'Matériaux'
  },
  {
    beneficiary: 'Dépôt de ciment de Yopougon',
    reason: 'Ciment acheté en dépannage, livraison urgente au chantier',
    min: 160_000,
    max: 380_000,
    category: 'Matériaux'
  }
];

function billetage(amount: number): Record<string, number> {
  const denominations = [10000, 5000, 2000, 1000, 500, 250, 200, 100, 50, 25, 10, 5];
  const out: Record<string, number> = {};
  let rest = Math.round(amount);
  for (const d of denominations) {
    const n = Math.floor(rest / d);
    if (n > 0) {
      out[String(d)] = n;
      rest -= n * d;
    }
  }
  return out;
}

export async function seedCash(env: Env): Promise<void> {
  const { prisma, tenantId, rng } = env;
  if ((await prisma.cashVoucher.count({ where: { tenantId } })) > 0) return;
  const sites = await loadSites(env);
  const cashier = env.staff.find(s => s !== env.admin) ?? env.admin;
  const canSeparate = cashier !== env.admin;

  // Programme des pièces : quelques dépenses de chantier par mois et par chantier actif.
  const specs: VoucherSpec[] = [];
  for (const site of sites) {
    if (site.code === 'VAL') continue;
    const start = site.startDate ?? env.ctx.start;
    const stop = site.closedAt ?? (site.status === 'SUSPENDED' ? addDays(env.ctx.end, -150) : env.ctx.end);
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= stop) {
      const n = between(rng, 2, 5);
      for (let i = 0; i < n; i++) {
        const tpl = pick(rng, SMALL_EXPENSES);
        const date = new Date(cursor.getFullYear(), cursor.getMonth(), between(rng, 2, 27), 10);
        if (date > stop || date > env.ctx.end || date < start) continue;
        // Le ciment en dépannage reste rare : un mois sur quatre.
        if (tpl.category === 'Matériaux' && tpl.beneficiary.startsWith('Dépôt') && cursor.getMonth() % 4 !== 1)
          continue;
        specs.push({
          site,
          date,
          beneficiary: tpl.beneficiary,
          reason: tpl.reason,
          amount: round1k(tpl.min + rng() * (tpl.max - tpl.min)),
          category: tpl.category
        });
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }
  specs.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Le suivi de budget lève ses propres alertes : coupé le temps de la saisie (les alertes sont posées à la main ensuite).
  const thresholds = new Map(sites.map(s => [s.id, s.budgetThresholdPercent]));
  await prisma.constructionSite.updateMany({ where: { tenantId }, data: { budgetThresholdPercent: null } });
  try {
    const bySite = new Map<string, VoucherSpec[]>();
    for (const s of specs) bySite.set(s.site.id, [...(bySite.get(s.site.id) ?? []), s]);
    // Pièces dans l'ordre des dates (numérotation continue), chantiers clos rouverts le temps de leurs écritures.
    const reopened = new Map<string, SiteRow>();
    for (const site of sites) if (site.closedAt) reopened.set(site.id, site);
    for (const site of reopened.values()) {
      await prisma.constructionSite.update({
        where: { id: site.id },
        data: { closedAt: null, status: 'IN_PROGRESS', finalCost: null }
      });
    }
    const created: Array<{ id: string; date: Date }> = [];
    try {
      for (const s of specs) {
        const rec: any = await env.run(tx =>
          env.svc.cash.createCashVoucherTx(tx, tenantId, {
            siteId: s.site.id,
            costCategoryId: env.cat(s.category),
            beneficiary: s.beneficiary,
            reason: s.reason,
            amount: s.amount,
            voucherDate: s.date,
            createdByUserId: cashier
          })
        );
        await env.run(tx => env.svc.cash.validateCashVoucherTx(tx, tenantId, rec.id, cashier), s.date);
        const validatedAt = hoursAt(s.date, 16, 40);
        await prisma.cashVoucher.update({
          where: { id: rec.id },
          data: { validatedAt, createdAt: hoursAt(s.date, 15, 55) }
        });
        await prisma.costAllocation.updateMany({
          where: { tenantId, sourceType: 'CASH_VOUCHER', sourceId: rec.id },
          data: { validatedAt }
        });
        await prisma.stockAlert.updateMany({ where: { tenantId, subjectId: rec.id }, data: { raisedAt: validatedAt } });
        created.push({ id: rec.id, date: s.date });
      }
    } finally {
      for (const site of reopened.values()) {
        const cost = await env.svc.siteCost.sumSiteActualCost(prisma, tenantId, site.id);
        await prisma.constructionSite.update({
          where: { id: site.id },
          data: { closedAt: site.closedAt, status: 'CLOSED', finalCost: cost, closedByUserId: site.closedByUserId }
        });
      }
    }
  } finally {
    for (const [id, value] of thresholds) {
      await prisma.constructionSite.update({ where: { id }, data: { budgetThresholdPercent: value } });
    }
  }
  env.ctx.log(`caisse de chantier : ${await prisma.cashVoucher.count({ where: { tenantId } })} pièces`);

  await seedCashSessions(env, cashier, canSeparate);
}

async function seedCashSessions(env: Env, cashier: string, canSeparate: boolean): Promise<void> {
  const { prisma, tenantId, rng } = env;
  if ((await prisma.cashSession.count({ where: { tenantId } })) > 0) return;
  const { computeExpected, validateSession } = await import('../../../src/lib/cash-sessions/service');
  const { ensureDefaultTreasuryAccountTx } = await import('../../../src/lib/treasury/accounts');
  const cash = await ensureDefaultTreasuryAccountTx(prisma as never, tenantId, 'CASH');
  const vouchers = await prisma.cashVoucher.findMany({
    where: { tenantId, validatedAt: { not: null } },
    orderBy: { validatedAt: 'asc' },
    select: { amount: true, validatedAt: true }
  });
  if (vouchers.length === 0) return;
  const months = new Map<string, number>();
  for (const v of vouchers) {
    const d = v.validatedAt as Date;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.set(key, (months.get(key) ?? 0) + Number(v.amount));
  }
  const keys = [...months.keys()].sort();
  const seqByYear = new Map<number, number>();
  const currentKey = `${env.ctx.end.getFullYear()}-${String(env.ctx.end.getMonth() + 1).padStart(2, '0')}`;
  const lastFull = keys.filter(k => k < currentKey).slice(-1)[0];
  for (const key of keys) {
    const [y, m] = key.split('-').map(Number);
    const monthTotal = months.get(key) ?? 0;
    const openedAt = new Date(y, m - 1, 1, 7, 30);
    const closedAt = new Date(y, m, 0, 18, 0);
    const isCurrent = key === currentKey;
    const float = Math.ceil((monthTotal * 1.25) / 50_000) * 50_000;
    const sequence = (seqByYear.get(y) ?? 0) + 1;
    seqByYear.set(y, sequence);
    const base = {
      tenantId,
      year: y,
      sequence,
      cashierUserId: cashier,
      treasuryAccountId: cash.treasuryAccountId,
      openedAt,
      openingFloat: float,
      openingNote: 'Alimentation de caisse du mois pour les dépenses courantes de chantier',
      createdAt: openedAt
    };
    if (isCurrent) {
      await prisma.cashSession.create({ data: { ...base, status: 'OPEN' } });
      continue;
    }
    const expected = await computeExpected(tenantId, cashier, cash.treasuryAccountId, true, float, openedAt, closedAt);
    const roll = rng();
    const difference = roll < 0.22 ? (roll < 0.11 ? -1 : 1) * between(rng, 1, 10) * 500 : 0;
    const counted = expected.amount + difference;
    const row = await prisma.cashSession.create({
      data: {
        ...base,
        status: 'CLOSED',
        closedAt,
        expectedBreakdown: expected as never,
        expectedAmount: expected.amount,
        countedAmount: counted,
        denominations: billetage(counted) as never,
        difference,
        differenceReason:
          difference === 0
            ? null
            : difference < 0
              ? 'Monnaie rendue par un fournisseur non enregistrée, régularisée au mois suivant'
              : 'Excédent constaté au comptage : remboursement d’avance reçu sans pièce de caisse'
      }
    });
    if (key === lastFull) continue; // la dernière clôture attend encore sa validation
    const validatedAt = new Date(y, m, 2, 10, 15);
    if (canSeparate) {
      await validateSession(tenantId, env.admin, row.id, {
        comment: 'Comptage vérifié et rapproché des pièces de caisse'
      });
      await prisma.cashSession.update({ where: { id: row.id }, data: { validatedAt } });
    } else {
      await prisma.cashSession.update({
        where: { id: row.id },
        data: {
          status: 'VALIDATED',
          validatedAt,
          validatedByUserId: env.admin,
          validationComment: 'Comptage vérifié et rapproché des pièces de caisse'
        }
      });
    }
  }
  env.ctx.log(`caisse de chantier : ${await prisma.cashSession.count({ where: { tenantId } })} sessions`);
}

// ===========================================================================
// Alertes de dépassement de budget
// ===========================================================================

export async function seedBudgetAlerts(env: Env): Promise<void> {
  const { prisma, tenantId, admin } = env;
  if ((await prisma.siteBudgetAlert.count({ where: { tenantId } })) > 0) return;
  const sites = await loadSites(env);
  for (const site of sites) {
    const budget = await prisma.siteBudget.findFirst({ where: { tenantId, siteId: site.id, status: 'VALIDATED' } });
    if (!budget) continue;
    const revised =
      (await env.svc.budgetAlerts.getRevisedBudgetTotals(prisma, [budget.id])).get(budget.id)?.revisedTotal ?? 0;
    const engaged =
      (await env.svc.budgetAlerts.getSiteEngagementTotals(prisma, tenantId, [site.id])).get(site.id)?.engagedAmount ??
      0;
    if (revised <= 0) continue;
    let threshold = site.budgetThresholdPercent ?? 90;
    const pct = (engaged / revised) * 100;
    const closedOrStopped = site.closedAt ?? (site.status === 'SUSPENDED' ? addDays(env.ctx.end, -150) : null);

    const insert = async (raisedAt: Date, engagedAmount: number, ackDays: number | null): Promise<void> => {
      await prisma.siteBudgetAlert.create({
        data: {
          tenantId,
          siteId: site.id,
          budgetId: budget.id,
          thresholdPercent: threshold,
          engagedAmount: Math.round(engagedAmount),
          budgetAmount: Math.round(revised),
          raisedAt,
          acknowledgedAt: ackDays === null ? null : addDays(raisedAt, ackDays),
          acknowledgedByUserId: ackDays === null ? null : admin
        }
      });
    };

    if (site.code === 'COC' && site.closedAt) {
      // Seuil franchi à l'approche de la livraison, acquitté après revue du reste à dépenser.
      await insert(addDays(site.closedAt, -150), revised * 0.915, 3);
    } else if (site.code === 'ORC' && site.closedAt) {
      await insert(addDays(site.closedAt, -110), revised * ((threshold + 1.2) / 100), 2);
    } else if (site.code === 'ANG') {
      // Le dirigeant a abaissé le seuil à mi-parcours pour être prévenu plus tôt.
      if (pct < threshold) threshold = Math.max(60, Math.floor(pct) - 1);
      await prisma.constructionSite.update({ where: { id: site.id }, data: { budgetThresholdPercent: threshold } });
      await insert(addDays(env.ctx.end, -52), revised * ((threshold + 0.6) / 100), 3);
      await insert(addDays(env.ctx.end, -9), engaged, null);
    } else if (site.code === 'LAG' && closedOrStopped) {
      if (pct < threshold) threshold = Math.max(40, Math.floor(pct) - 2);
      await prisma.constructionSite.update({ where: { id: site.id }, data: { budgetThresholdPercent: threshold } });
      await insert(addDays(closedOrStopped, -140), revised * ((threshold + 0.8) / 100), 5);
      await insert(addDays(closedOrStopped, -12), engaged, null);
    }
  }
  env.ctx.log(`alertes de budget : ${await prisma.siteBudgetAlert.count({ where: { tenantId } })}`);
}

// ===========================================================================
// Lots basculés au patrimoine
// ===========================================================================

export async function seedCapitalization(env: Env): Promise<void> {
  const { prisma, tenantId } = env;
  const sites = await loadSites(env);
  for (const site of sites) {
    if (!site.closedAt) continue;
    const already = await prisma.siteLot.count({ where: { tenantId, siteId: site.id, propertyId: { not: null } } });
    if (already > 0) continue;
    const brand = site.name.split(' — ')[0];
    const place = site.name.split(' — ')[1] ?? '';
    const lots = await prisma.siteLot.findMany({
      where: { tenantId, siteId: site.id },
      orderBy: { name: 'asc' },
      take: site.code === 'COC' ? 6 : 4
    });
    for (const lot of lots) {
      try {
        await env.run(tx =>
          env.svc.closing.capitalizeSiteLotTx(tx, tenantId, lot.id, {
            propertyType: 'APPARTEMENT',
            ownershipType: 'TENANT',
            internalReference: `${site.code}-${lot.name.replace('Lot ', '')}`,
            title: `Appartement ${lot.name.replace('Lot ', '')} — ${brand}`,
            description: `Lot conservé par le promoteur à la livraison de ${brand}, mis en location.`,
            address: `${brand}, ${place}`,
            acquisitionDate: site.closedAt as Date
          })
        );
      } catch (error) {
        env.ctx.log(`patrimoine : lot ${lot.name} ignoré (${(error as Error).message})`);
      }
    }
  }
}

// ===========================================================================
// Associations (co-promotion, indivisions)
// ===========================================================================

export async function seedPartnerships(env: Env): Promise<void> {
  const { prisma, tenantId } = env;
  if ((await prisma.partnership.count({ where: { tenantId } })) > 0) return;
  const {
    createPartnershipTx,
    addPartnershipShareTx,
    attachPropertyToPartnershipTx,
    distributeInstallmentToPartnersTx
  } = env.svc.partnerships;
  const make = async (
    label: string,
    shares: Array<[string, number]>,
    propertyRefs: string[],
    createdAt: Date,
    active = true
  ): Promise<string> => {
    const rec: any = await env.run(tx => createPartnershipTx(tx, tenantId, { label }));
    for (const [name, pct] of shares) {
      await env.run(tx =>
        addPartnershipShareTx(tx, tenantId, { partnershipId: rec.id, partnerName: name, sharePercent: pct })
      );
    }
    for (const ref of propertyRefs) {
      const p = await prisma.property.findFirst({ where: { tenantId, internalReference: ref }, select: { id: true } });
      if (p) await env.run(tx => attachPropertyToPartnershipTx(tx, tenantId, p.id, rec.id));
    }
    await prisma.partnership.update({ where: { id: rec.id }, data: { createdAt, isActive: active } });
    await prisma.partnershipShare.updateMany({ where: { partnershipId: rec.id }, data: { createdAt } });
    return rec.id as string;
  };

  const sites = await loadSites(env);
  const coc = sites.find(s => s.code === 'COC');
  const orc = sites.find(s => s.code === 'ORC');
  const refs = async (code: string): Promise<string[]> => {
    const props = await prisma.property.findMany({
      where: { tenantId, internalReference: { startsWith: `${code}-` } },
      select: { internalReference: true }
    });
    return props.map(p => p.internalReference);
  };
  if (coc?.closedAt) {
    await make(
      'Co-promotion Résidence Les Cocotiers',
      [
        ['Groupe Atlantique Habitat SA', 30],
        ['Konan Yao Arsène', 15],
        ['Diabaté Fatoumata', 10]
      ],
      await refs('COC'),
      addDays(coc.closedAt, 20)
    );
  }
  if (orc?.closedAt) {
    await make(
      'Indivision Famille Gnamien — Les Orchidées',
      [
        ['Gnamien Kouassi Ernest', 20],
        ['Gnamien Aya Prisca', 20],
        ['Gnamien Félix', 10]
      ],
      await refs('ORC'),
      addDays(orc.closedAt, 30)
    );
  }
  await make(
    'Association Les Tamaris (dissoute)',
    [
      ['Bakayoko Mamadou', 50],
      ['Sanogo Mariam', 50]
    ],
    [],
    addDays(env.ctx.start, 40),
    false
  );

  // Opérateur intégré : biens loués de l'agence détenus en indivision — leurs loyers sont ventilés entre associés.
  if (env.isIntegrated) {
    const leased = await prisma.rentalLease.findMany({
      where: { tenant_id: tenantId, status: 'ACTIVE' },
      select: { property_id: true },
      distinct: ['property_id'],
      take: 4
    });
    const propertyIds = leased.map(l => l.property_id as string);
    if (propertyIds.length >= 2) {
      const partnership: any = await env.run(tx =>
        createPartnershipTx(tx, tenantId, { label: 'Indivision Famille Kouamé — Riviera' })
      );
      for (const [name, pct] of [
        ['Kouamé Marc', 40],
        ['Bakayoko Salimata', 35],
        ['Tano Léon', 10]
      ] as Array<[string, number]>) {
        await env.run(tx =>
          addPartnershipShareTx(tx, tenantId, { partnershipId: partnership.id, partnerName: name, sharePercent: pct })
        );
      }
      for (const propertyId of propertyIds)
        await env.run(tx => attachPropertyToPartnershipTx(tx, tenantId, propertyId, partnership.id));
      await prisma.partnership.update({
        where: { id: partnership.id },
        data: { createdAt: addDays(env.ctx.start, 20) }
      });
      const installments = await prisma.rentalInstallment.findMany({
        where: { tenant_id: tenantId, lease: { property_id: { in: propertyIds } }, due_date: { lte: env.ctx.end } },
        include: { lease: { select: { property_id: true } } },
        orderBy: { due_date: 'asc' }
      });
      for (const inst of installments) {
        await env.run(tx =>
          distributeInstallmentToPartnersTx(tx, tenantId, {
            rentalInstallmentId: inst.id,
            propertyId: inst.lease.property_id as string,
            periodYear: inst.period_year,
            periodMonth: inst.period_month,
            amount: Number(inst.amount_rent)
          })
        );
      }
      await prisma.$executeRaw`UPDATE "partnership_distributions" SET "created_at" = make_timestamp("period_year", "period_month", 5, 9, 0, 0) WHERE "partnership_id" = ${partnership.id}::uuid`;
    }
  }
  env.ctx.log(
    `associations : ${await prisma.partnership.count({ where: { tenantId } })} ; ventilations : ${await prisma.partnershipDistribution.count({ where: { tenantId } })}`
  );
}
