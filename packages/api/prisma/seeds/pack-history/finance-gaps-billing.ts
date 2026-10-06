/**
 * Trous de finance, partie 4 : facturation, balances clients, commissions.
 *
 *  - campagnes de facturation mensuelle (« Facturation du mois ») des agences en
 *    gestion directe (Patrimoine) : une campagne par mois, rejouée depuis les
 *    échéances réellement émises (même compte rendu que celui des campagnes de
 *    l'Agence) ;
 *  - balance clients et balance âgée des agences sans bail (Syndic, Promoteur) :
 *    comptes de tiers de clients (copropriétaires facturés hors budget, acquéreurs
 *    appelés en fonds), facturés et réglés au fil de 36 mois, écritures 411 posées
 *    et rattachées au compte auxiliaire. Les impayés s'étalent sur toutes les
 *    tranches d'ancienneté ;
 *  - commissions des agents (Patrimoine) : parts de partage des collaborateurs,
 *    gestionnaire de chaque bail et honoraires figés mis en cohérence.
 *
 * Idempotent par bloc.
 */
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';

import { between, pick } from './types';
import type { HistoryContext } from './types';
import { DAY, at, loadTreasury, pieceId, roundTo } from './finance-transverse-ops';

const MOIS_SANS_ACCENT = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre'
];

// ───────────────────────────────────────────────────────── campagnes mensuelles

export async function seedBillingRunsDirect(ctx: HistoryContext, staff: string[]): Promise<void> {
  const { prisma, tenantId, rng, end, log } = ctx;
  if ((await prisma.rentBillingRun.count({ where: { tenantId } })) > 0) return;
  const installments = await prisma.rentalInstallment.findMany({
    where: { tenant_id: tenantId, status: { not: 'CANCELED' } },
    select: {
      id: true,
      lease_id: true,
      period_year: true,
      period_month: true,
      amount_rent: true,
      amount_service: true,
      amount_other_fees: true
    }
  });
  if (installments.length === 0) return;
  const leases = await prisma.rentalLease.findMany({
    where: { tenant_id: tenantId },
    select: {
      id: true,
      start_date: true,
      end_date: true,
      billing_frequency: true,
      status: true,
      property: { select: { title: true } },
      primaryRenter: { select: { user: { select: { fullName: true, email: true } } } }
    }
  });
  const labelOf = new Map(
    leases.map(l => [
      l.id,
      `${l.primaryRenter.user.fullName || l.primaryRenter.user.email} — ${l.property?.title ?? 'Bien'}`
    ])
  );
  const byPeriod = new Map<string, typeof installments>();
  for (const i of installments) {
    const key = `${i.period_year}-${i.period_month}`;
    byPeriod.set(key, [...(byPeriod.get(key) ?? []), i]);
  }
  const first = installments.reduce(
    (min, i) => Math.min(min, i.period_year * 12 + i.period_month - 1),
    Number.MAX_SAFE_INTEGER
  );
  const last = end.getUTCFullYear() * 12 + end.getUTCMonth();
  let created = 0;
  for (let idx = first; idx <= last; idx++) {
    const year = Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    const list = byPeriod.get(`${year}-${month}`) ?? [];
    if (list.length === 0) continue;
    const billedLeases = new Set(list.map(i => i.lease_id));
    const billed = list.map(i => ({
      leaseId: i.lease_id,
      leaseLabel: labelOf.get(i.lease_id) ?? `Bail ${i.lease_id.slice(0, 8)}`,
      installmentId: i.id,
      amount: Number(i.amount_rent) + Number(i.amount_service) + Number(i.amount_other_fees)
    }));
    const excluded: Array<{ leaseId: string; leaseLabel: string; reason: string }> = [];
    for (const lease of leases) {
      if (billedLeases.has(lease.id)) continue;
      const startIdx = lease.start_date.getUTCFullYear() * 12 + lease.start_date.getUTCMonth();
      const endIdx = lease.end_date ? lease.end_date.getUTCFullYear() * 12 + lease.end_date.getUTCMonth() : null;
      let reason: string | null = null;
      if (idx < startIdx) reason = 'PERIOD_BEFORE_LEASE_START';
      else if (endIdx !== null && idx > endIdx) reason = 'PERIOD_AFTER_LEASE_END';
      else if (lease.billing_frequency !== 'MONTHLY') reason = 'PERIOD_OFF_BILLING_CYCLE';
      else if (lease.status !== 'ACTIVE') reason = 'LEASE_NOT_ACTIVE';
      if (reason) excluded.push({ leaseId: lease.id, leaseLabel: labelOf.get(lease.id) ?? '', reason });
    }
    const name = MOIS_SANS_ACCENT[month - 1];
    const connector = ['avril', 'aout', 'octobre'].includes(name) ? `d'${name}` : `de ${name}`;
    const startedAt = new Date(Date.UTC(year, month - 1, 1, 7, between(rng, 5, 50), between(rng, 0, 59)));
    await prisma.rentBillingRun.create({
      data: {
        tenantId,
        periodYear: year,
        periodMonth: month,
        label: `Loyer ${connector} ${year}`,
        status: 'DONE',
        startedAt,
        finishedAt: new Date(startedAt.getTime() + between(rng, 8, 55) * 1000),
        createdByUserId: pick(rng, staff),
        summary: { billed, excluded, advancesApplied: [] } as unknown as Prisma.InputJsonValue
      }
    });
    created += 1;
  }
  log(`facturation : ${created} campagne(s) mensuelle(s)`);
}

// ───────────────────────────────────────────────────────── balance clients

const FIRST_NAMES = [
  'Koffi',
  'Aya',
  'Yao',
  'Mariam',
  'Seydou',
  'Adjoua',
  'Moussa',
  'Fatou',
  'Brice',
  'Estelle',
  'Lassina',
  'Nadège'
];
const LAST_NAMES = [
  'Kouassi',
  'Traoré',
  'Konan',
  'Coulibaly',
  'Bamba',
  'Diomandé',
  'Yapi',
  'Ouattara',
  'Gnagne',
  'Séka',
  'Tanoh',
  'Dembélé'
];

const SYNDIC_ITEMS = [
  { label: 'État daté pour la vente du lot', amount: 75_000 },
  { label: 'Frais de recouvrement de charges impayées', amount: 85_000 },
  { label: 'Copie certifiée du procès-verbal d’assemblée générale', amount: 15_000 },
  { label: 'Fourniture de badges d’accès et de télécommandes de portail', amount: 60_000 },
  { label: 'Frais de mutation de lot et mise à jour du fichier des copropriétaires', amount: 150_000 },
  { label: 'Attestation de situation de compte et certificat de non-gage', amount: 25_000 },
  { label: 'Mise sous pli et envoi recommandé des convocations', amount: 40_000 }
];
const BUYER_CALLS = [
  { label: 'Appel de fonds n°1 — réservation du logement', pct: 10 },
  { label: 'Appel de fonds n°2 — fondations achevées', pct: 15 },
  { label: 'Appel de fonds n°3 — dalle du rez-de-chaussée', pct: 15 },
  { label: 'Appel de fonds n°4 — élévation des murs', pct: 20 },
  { label: 'Appel de fonds n°5 — gros œuvre achevé et toiture', pct: 20 },
  { label: 'Appel de fonds n°6 — second œuvre et finitions', pct: 15 },
  { label: 'Appel de fonds n°7 — livraison et remise des clés', pct: 5 }
];

/** Âges (en jours) des dernières créances laissées impayées : une dans chaque tranche d'ancienneté, au moins. */
const UNPAID_AGES = [9, 24, 38, 52, 67, 83, 101, 148, 187, 14, 45, 75];

export async function seedClientBalances(
  ctx: HistoryContext,
  staff: string[],
  flavor: 'SYNDIC' | 'PROMOTEUR'
): Promise<void> {
  const { prisma, tenantId, rng, log } = ctx;
  if ((await prisma.thirdPartyAccount.count({ where: { tenantId, kind: 'TENANT' } })) > 0) return;
  const treasury = await loadTreasury(ctx);
  const bank = treasury.find(a => a.accountNumber === '5211') ?? treasury.find(a => a.kind === 'BANK');
  const orange = treasury.find(a => a.kind === 'MOBILE_MONEY' && a.mmOperator === 'ORANGE');
  if (!bank) return;
  const [{ prisma: appPrisma }, ledger, accounting, accounts] = await Promise.all([
    import('../../../src/utils/database'),
    import('../../../src/lib/finance/ledger'),
    import('../../../src/lib/finance/accounting'),
    import('../../../src/lib/treasury/accounts')
  ]);
  const clientType = flavor === 'SYNDIC' ? 'CO_OWNER' : 'BUYER';
  const count = flavor === 'SYNDIC' ? 10 : 8;
  const revenue =
    flavor === 'SYNDIC'
      ? { number: '7062', name: 'Prestations annexes aux copropriétaires' }
      : { number: '7011', name: 'Ventes de logements — appels de fonds acquéreurs' };

  // 1. Clients (utilisateurs et fiches client).
  const clients: Array<{ id: string; userId: string; name: string }> = [];
  for (let i = 0; i < count; i++) {
    const first = FIRST_NAMES[(i * 5 + 1) % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length];
    const name = `${first} ${last}`;
    const userId = randomUUID();
    const clientId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `${flavor === 'SYNDIC' ? 'copro' : 'acquereur'}${i + 1}.${tenantId.slice(0, 8)}@packs.immotopia.test`,
        fullName: name,
        isActive: true
      }
    });
    await prisma.tenantClient.create({
      data: { id: clientId, userId, tenantId, clientType, details: { source: 'pack-history' } }
    });
    clients.push({ id: clientId, userId, name });
  }

  // 2. Créances et règlements, client par client, dans l'ordre chronologique.
  const startMs = ctx.start.getTime() + 20 * DAY;
  const endMs = ctx.end.getTime();
  let billedTotal = 0;
  let movements = 0;
  for (const [ci, client] of clients.entries()) {
    type Ev = { date: Date; label: string; amount: number };
    const events: Ev[] = [];
    if (flavor === 'SYNDIC') {
      const n = between(rng, 5, 8);
      for (let k = 0; k < n; k++) {
        const item = SYNDIC_ITEMS[(ci + k * 3) % SYNDIC_ITEMS.length];
        const date = new Date(startMs + rng() * (endMs - startMs - 160 * DAY));
        events.push({ date, label: `${item.label}`, amount: roundTo(item.amount * (0.9 + rng() * 0.3), 500) });
      }
    } else {
      // Acquéreur : prix du logement, appels de fonds échelonnés selon l'avancement de son contrat.
      const price = roundTo(38_000_000 + ((ci * 9_700_000) % 82_000_000) + rng() * 4_000_000, 500_000);
      const begin = startMs + ((ci * 83 * DAY) % (500 * DAY));
      const calls = Math.min(BUYER_CALLS.length, 3 + (ci % 5));
      for (let k = 0; k < calls; k++) {
        const date = new Date(begin + k * (95 + between(rng, 0, 40)) * DAY);
        if (date.getTime() > endMs - 3 * DAY) break;
        events.push({ date, label: BUYER_CALLS[k].label, amount: roundTo((price * BUYER_CALLS[k].pct) / 100, 1000) });
      }
    }
    events.sort((a, b) => a.date.getTime() - b.date.getTime());
    // La dernière créance reste impayée, avec une ancienneté qui varie d'un client à l'autre.
    if (events.length > 0) {
      const target = new Date(endMs - UNPAID_AGES[ci % UNPAID_AGES.length] * DAY);
      const lastEv = events[events.length - 1];
      if (lastEv.date.getTime() < target.getTime() || flavor === 'SYNDIC') lastEv.date = target;
      events.sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    const writes: Array<{ date: Date; kind: 'BILL' | 'PAY'; amount: number; label: string; key: string }> = [];
    events.forEach((ev, k) => {
      const key = `${client.id}:${k}`;
      writes.push({ date: ev.date, kind: 'BILL', amount: ev.amount, label: ev.label, key });
      const isLast = k === events.length - 1;
      const ageDays = (endMs - ev.date.getTime()) / DAY;
      const paid = !isLast && (ageDays > 100 ? true : rng() < 0.75);
      if (paid) {
        const delay = between(rng, 5, 45);
        const payDate = new Date(Math.min(ev.date.getTime() + delay * DAY, endMs - DAY));
        // Un règlement sur six est partiel, l'autre moitié suit plus tard.
        if (rng() < 0.17 && !isLast) {
          const part = roundTo(ev.amount * 0.5, 500);
          writes.push({
            date: payDate,
            kind: 'PAY',
            amount: part,
            label: `Règlement partiel — ${ev.label}`,
            key: `${key}:a`
          });
          writes.push({
            date: new Date(Math.min(payDate.getTime() + 30 * DAY, endMs - DAY)),
            kind: 'PAY',
            amount: ev.amount - part,
            label: `Solde du règlement — ${ev.label}`,
            key: `${key}:b`
          });
        } else {
          writes.push({ date: payDate, kind: 'PAY', amount: ev.amount, label: `Règlement — ${ev.label}`, key });
        }
      } else if (isLast && ci % 3 === 0 && ageDays > 30) {
        // Acompte versé sur la dernière créance : elle reste partiellement due.
        const part = roundTo(ev.amount * 0.4, 500);
        writes.push({
          date: new Date(Math.min(ev.date.getTime() + 12 * DAY, endMs - DAY)),
          kind: 'PAY',
          amount: part,
          label: `Acompte — ${ev.label}`,
          key: `${key}:acompte`
        });
      }
    });
    writes.sort((a, b) => a.date.getTime() - b.date.getTime());

    await appPrisma.$transaction(
      async tx => {
        const account = await ledger.getOrCreateTenantAccountTx(tx, tenantId, client.id);
        if (!account) return;
        const clientsChart = await accounts.ensureChartAccountTx(tx, tenantId, '411', 'Clients', 'ASSET');
        const revenueChart = await accounts.ensureChartAccountTx(tx, tenantId, revenue.number, revenue.name, 'INCOME');
        for (const w of writes) {
          const sourceId = pieceId(tenantId, w.kind === 'BILL' ? 'CLIENT_BILLING' : 'CLIENT_RECEIPT', w.key);
          await ledger.appendThirdPartyMovementTx(tx, {
            accountId: account.id,
            tenantId,
            type: w.kind === 'BILL' ? 'INSTALLMENT' : 'PAYMENT',
            ...(w.kind === 'BILL' ? { billed: w.amount } : { settled: w.amount }),
            label: w.label,
            sourceType: w.kind === 'BILL' ? 'CLIENT_BILLING' : 'CLIENT_PAYMENT',
            sourceId,
            movementDate: w.date
          } as never);
          movements += 1;
          if (w.kind === 'BILL') billedTotal += w.amount;
          const via = w.kind === 'PAY' && orange && flavor === 'SYNDIC' && rng() < 0.15 ? orange : bank;
          const journalId = await accounting.ensureOperationalJournalTx(
            tx,
            tenantId,
            w.date.getUTCFullYear(),
            w.kind === 'BILL' ? 'GENERAL' : 'BANK'
          );
          await accounting.postDocumentEntryTx(tx, {
            tenantId,
            journalId,
            entryDate: w.date,
            reference: `${w.kind === 'BILL' ? 'FC' : 'RC'}-${w.date.getUTCFullYear()}${String(w.date.getUTCMonth() + 1).padStart(2, '0')}-${String(ci + 1).padStart(2, '0')}${w.key.endsWith(':a') ? 'A' : w.key.endsWith(':b') ? 'B' : ''}`,
            description: `${w.label} — ${client.name}`,
            documentType: (w.kind === 'BILL' ? 'CLIENT_BILLING' : 'CLIENT_RECEIPT') as never,
            documentId: sourceId,
            lines:
              w.kind === 'BILL'
                ? [
                    { accountId: clientsChart, debit: w.amount, label: w.label, thirdPartyAccountId: account.id },
                    { accountId: revenueChart, credit: w.amount, label: w.label }
                  ]
                : [
                    { accountId: via.chartOfAccountId, debit: w.amount, label: w.label },
                    { accountId: clientsChart, credit: w.amount, label: w.label, thirdPartyAccountId: account.id }
                  ]
          });
        }
      },
      { timeout: 120_000 }
    );
  }
  void staff;
  void at;
  log(
    `balance clients : ${clients.length} client(s), ${movements} mouvement(s), ${Math.round(billedTotal)} F CFA facturés`
  );
}

// ───────────────────────────────────────────────────────── commissions des agents

const SHARES = [40, 35, 45, 30, 50, 38];

export async function seedAgentCommissionShares(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  const fees = await prisma.managementFee.findMany({
    where: { tenantId, agentUserId: null },
    select: { id: true, leaseId: true, feeAmount: true }
  });
  if (fees.length === 0) return;
  if ((await prisma.agentCommissionRate.count({ where: { tenantId } })) > 0) return;

  const members = await prisma.membership.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
      user: { userRoles: { some: { tenantId, role: { key: { in: ['TENANT_AGENT', 'TENANT_MANAGER'] } } } } }
    },
    select: { userId: true },
    orderBy: { createdAt: 'asc' }
  });
  const agents = members.map(m => m.userId);
  if (agents.length === 0) return;

  const shareOf = new Map<string, number>();
  for (const [i, userId] of agents.entries()) {
    const sharePercent = SHARES[i % SHARES.length];
    shareOf.set(userId, sharePercent);
    await prisma.agentCommissionRate.create({
      data: { tenantId, userId, sharePercent, createdAt: ctx.start }
    });
  }

  // Gestionnaire de chaque bail (termes propres au bail : seul l'agent est renseigné).
  const leaseIds = Array.from(new Set(fees.map(f => f.leaseId)));
  const existing = await prisma.leaseManagementTerms.findMany({
    where: { tenantId, leaseId: { in: leaseIds } },
    select: { leaseId: true, agentUserId: true }
  });
  const agentOfLease = new Map<string, string>();
  for (const e of existing) if (e.agentUserId) agentOfLease.set(e.leaseId, e.agentUserId);
  const known = new Set(existing.map(e => e.leaseId));
  for (const [i, leaseId] of leaseIds.entries()) {
    if (agentOfLease.has(leaseId)) continue;
    const agent = agents[i % agents.length];
    agentOfLease.set(leaseId, agent);
    if (known.has(leaseId)) {
      await prisma.leaseManagementTerms.update({
        where: { leaseId },
        data: { agentUserId: agent, updatedByUserId: ctx.adminUserId }
      });
    } else {
      await prisma.leaseManagementTerms.create({
        data: { tenantId, leaseId, agentUserId: agent, updatedByUserId: ctx.adminUserId }
      });
    }
  }

  let updated = 0;
  for (const fee of fees) {
    const agent = agentOfLease.get(fee.leaseId);
    const percent = agent ? shareOf.get(agent) : undefined;
    if (!agent || percent === undefined) continue;
    await prisma.managementFee.update({
      where: { id: fee.id },
      data: {
        agentUserId: agent,
        agentSharePercent: percent,
        agentShareAmount: Math.round((Number(fee.feeAmount) * percent) / 100)
      }
    });
    updated += 1;
  }
  log(`commissions : ${agents.length} part(s) de collaborateur, ${updated} honoraire(s) attribués à un gestionnaire`);
}
