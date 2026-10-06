/**
 * Trous de finance, partie 2 : sessions de caisse des agences sans chantier.
 *
 * Le Promoteur et l'Opérateur intégré ont déjà leurs sessions (caisse de
 * chantier). Pour Agence, Syndic et Patrimoine, l'écran « Caisse » restait
 * vide. On reconstitue 36 mois d'usage : un caissier principal ouvre sa caisse
 * chaque mois avec un fond de caisse, la clôture au dernier jour avec un
 * comptage (billetage), les écarts passent en comptabilité à la validation par un
 * AUTRE membre (vrai service `validateSession`), un second caissier tient une
 * petite caisse de menues dépenses par trimestre, la dernière clôture attend sa
 * validation et une session est ouverte aujourd'hui.
 *
 * Le montant attendu se déduit, comme dans l'application, des encaissements
 * en espèces (`computeExpected`). Les pièces de caisse (bons de dépense) sont
 * rattachées à un chantier : le module n'existe que pour les agences à chantiers,
 * qui les ont déjà.
 *
 * Idempotent : saute le bloc dès que l'agence a une session.
 */
import { between, pick } from './types';
import type { HistoryContext } from './types';
import { DAY } from './finance-transverse-ops';

const DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 250, 200, 100, 50, 25, 10, 5];

function billetage(amount: number): Record<string, number> {
  const out: Record<string, number> = {};
  let rest = Math.round(amount);
  for (const d of DENOMINATIONS) {
    const n = Math.floor(rest / d);
    if (n > 0) {
      out[String(d)] = n;
      rest -= n * d;
    }
  }
  return out;
}

const SHORTAGE = [
  'Monnaie rendue à un locataire en trop, régularisée au prochain encaissement',
  'Petite dépense de fournitures réglée en espèces sans reçu',
  'Erreur de rendu de monnaie constatée au comptage',
  'Pièce de monnaie manquante, recomptage fait avec la comptable'
];
const SURPLUS = [
  'Excédent constaté au comptage : appoint laissé par un locataire',
  'Excédent constaté au comptage : arrondi non rendu sur un encaissement',
  'Excédent au comptage : avance de loyer reçue sans quittance immédiate'
];

interface Planned {
  cashier: string;
  openedAt: Date;
  closedAt: Date | null;
  float: number;
  note: string;
  status: 'OPEN' | 'CLOSED' | 'VALIDATED';
}

function lastDay(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

export async function seedCashSessionsGeneral(ctx: HistoryContext, staff: string[]): Promise<void> {
  const { prisma, tenantId, log, rng } = ctx;
  if ((await prisma.cashSession.count({ where: { tenantId } })) > 0) return;

  // Caissier principal : celui qui a saisi le plus d'encaissements en espèces, sinon un membre de l'équipe.
  const byUser = await prisma.rentalPayment.groupBy({
    by: ['created_by_user_id'],
    where: { tenant_id: tenantId, method: 'CASH', status: 'SUCCESS' },
    _count: { _all: true },
    orderBy: { _count: { created_by_user_id: 'desc' } },
    take: 1
  });
  const cashierId = byUser[0]?.created_by_user_id ?? staff.find(s => s !== ctx.adminUserId) ?? ctx.adminUserId;
  const others = staff.filter(s => s !== cashierId);
  const validatorId = others.includes(ctx.adminUserId) ? ctx.adminUserId : (others[0] ?? null);
  const secondCashier = others.find(s => s !== validatorId) ?? null;

  const { computeExpected, validateSession } = await import('../../../src/lib/cash-sessions/service');
  const { ensureDefaultTreasuryAccountTx } = await import('../../../src/lib/treasury/accounts');
  const cash = await ensureDefaultTreasuryAccountTx(prisma as never, tenantId, 'CASH');

  const nowMs = ctx.end.getTime();
  const planned: Planned[] = [];
  const startY = ctx.start.getUTCFullYear();
  const startM = ctx.start.getUTCMonth();
  const currentKey = ctx.end.getUTCFullYear() * 12 + ctx.end.getUTCMonth();
  const stepFloat = (v: number) => Math.round(v / 25_000) * 25_000;

  for (let i = 0; i <= ctx.months; i++) {
    const y = startY + Math.floor((startM + i) / 12);
    const m0 = (startM + i) % 12;
    const key = y * 12 + m0;
    const openedAt = new Date(Date.UTC(y, m0, 1, 7, 30));
    if (openedAt.getTime() >= nowMs) continue;
    const float = stepFloat(100_000 + rng() * 250_000 + i * 2_000);
    if (key < currentKey) {
      planned.push({
        cashier: cashierId,
        openedAt,
        closedAt: new Date(Date.UTC(y, m0, lastDay(y, m0), 18, 0)),
        float,
        note: 'Fond de caisse du mois pour les encaissements en espèces et les menues dépenses',
        status: 'VALIDATED'
      });
    } else {
      // Mois en cours : la session du début de mois est close hier soir, une nouvelle est ouverte ce matin.
      const today = ctx.end.getUTCDate();
      if (today > 2) {
        planned.push({
          cashier: cashierId,
          openedAt,
          closedAt: new Date(Date.UTC(y, m0, today - 1, 18, 0)),
          float,
          note: 'Fond de caisse du mois pour les encaissements en espèces et les menues dépenses',
          status: 'CLOSED'
        });
        const openToday = new Date(Date.UTC(y, m0, today, 7, 30));
        planned.push({
          cashier: cashierId,
          openedAt: openToday.getTime() < nowMs ? openToday : new Date(nowMs - 3_600_000),
          closedAt: null,
          float: stepFloat(100_000 + rng() * 150_000),
          note: 'Ouverture de la caisse du jour',
          status: 'OPEN'
        });
      } else {
        planned.push({
          cashier: cashierId,
          openedAt,
          closedAt: null,
          float,
          note: 'Ouverture de la caisse du mois',
          status: 'OPEN'
        });
      }
    }
    // Petite caisse de menues dépenses tenue par un second membre, une fois par trimestre.
    if (secondCashier && i % 3 === 1 && key < currentKey) {
      planned.push({
        cashier: secondCashier,
        openedAt: new Date(Date.UTC(y, m0, 2, 8, 15)),
        closedAt: new Date(Date.UTC(y, m0, 2 + 24, 17, 30)),
        float: stepFloat(50_000 + rng() * 50_000),
        note: 'Petite caisse des menues dépenses de l’agence',
        status: 'VALIDATED'
      });
    }
  }
  // Les deux dernières clôtures attendent encore leur validation.
  const closed = planned.filter(p => p.status !== 'OPEN');
  for (const p of closed.slice(-2)) if (p.status === 'VALIDATED') p.status = 'CLOSED';
  planned.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());

  const seqByYear = new Map<number, number>();
  let created = 0;
  for (const p of planned) {
    const year = p.openedAt.getUTCFullYear();
    const sequence = (seqByYear.get(year) ?? 0) + 1;
    seqByYear.set(year, sequence);
    const base = {
      tenantId,
      year,
      sequence,
      cashierUserId: p.cashier,
      treasuryAccountId: cash.treasuryAccountId,
      openedAt: p.openedAt,
      openingFloat: p.float,
      openingNote: p.note,
      createdAt: p.openedAt
    };
    if (p.status === 'OPEN' || !p.closedAt) {
      await prisma.cashSession.create({ data: { ...base, status: 'OPEN' } });
      created += 1;
      continue;
    }
    const expected = await computeExpected(
      tenantId,
      p.cashier,
      cash.treasuryAccountId,
      true,
      p.float,
      p.openedAt,
      p.closedAt
    );
    const roll = rng();
    // Environ un comptage sur quatre présente un petit écart (manquant ou excédent), jamais le même montant.
    const difference = roll < 0.26 ? (roll < 0.14 ? -1 : 1) * between(rng, 1, 12) * 500 : 0;
    const counted = Math.max(0, expected.amount + difference);
    const diff = counted - expected.amount;
    const row = await prisma.cashSession.create({
      data: {
        ...base,
        status: 'CLOSED',
        closedAt: p.closedAt,
        expectedBreakdown: expected as never,
        expectedAmount: expected.amount,
        countedAmount: counted,
        denominations: billetage(counted) as never,
        difference: diff,
        differenceReason: diff === 0 ? null : diff < 0 ? pick(rng, SHORTAGE) : pick(rng, SURPLUS)
      }
    });
    created += 1;
    if (p.status === 'CLOSED') continue;
    const validatedAt = new Date(p.closedAt.getTime() + DAY + 2 * 3_600_000);
    if (validatorId && validatorId !== p.cashier) {
      await validateSession(tenantId, validatorId, row.id, {
        comment: 'Comptage vérifié et rapproché des quittances de loyer'
      });
      await prisma.cashSession.update({ where: { id: row.id }, data: { validatedAt } });
    } else {
      await prisma.cashSession.update({
        where: { id: row.id },
        data: {
          status: 'VALIDATED',
          validatedAt,
          validatedByUserId: ctx.adminUserId,
          validationComment: 'Comptage vérifié et rapproché des quittances de loyer'
        }
      });
    }
  }
  log(`caisse : ${created} session(s) sur ${ctx.months} mois`);
}
