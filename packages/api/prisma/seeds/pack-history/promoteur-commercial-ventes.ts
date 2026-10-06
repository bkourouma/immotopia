/**
 * Ventes de lots du promoteur « 3 ans » : mandats de vente internes, offres
 * d'achat, compromis de vente en l'état futur d'achèvement (réservation avec
 * échéancier par jalons d'avancement du chantier, conditions suspensives),
 * actes signés, commissions de l'équipe commerciale et leurs règlements, avec
 * les acquéreurs, leurs affaires, leurs visites et leurs activités.
 *
 * Principes (voir `agence-commercial-ventes.ts`, dont ce fichier reprend la
 * méthode) :
 *  - les histoires de vente sont planifiées d'abord (dates, montants, statuts),
 *    puis écrites dans l'ordre chronologique : la numérotation annuelle
 *    (MV-, OA-, CV-, HT-, RC-) suit les dates ;
 *  - les règlements de commission passent par le vrai service
 *    (`createCommissionPayment`) : écritures comptables équilibrées, statut de la
 *    commission recalculé ;
 *  - les jalons de paiement suivent l'avancement réel du chantier concerné
 *    (`site_progress_entries`) ;
 *  - aucun envoi sortant.
 */
import type { PropertyStatus } from '@prisma/client';
import { between, pick } from './types';
import { FIRST_NAMES as FIRST, LAST_NAMES as LAST } from './agence-data';
import { addDays, roundTo } from './agence-commercial-data';
import { NOTARIES } from './agence-commercial-data';
import { notarialDeed } from './patrimoine-extras-docs';
import { putPropertyDoc } from './patrimoine-extras-state';
import type { PatState } from './patrimoine-extras-state';
import { progressDate } from './promoteur-commercial-biens';
import type { LotUnit, SiteInfo, SpvInfo } from './promoteur-commercial-biens';
import { addDealActivities, createContact, createVisit, finalizeContact } from './promoteur-commercial-crm';
import type { ContactRef } from './promoteur-commercial-crm';
import {
  CONDITION_LABELS_PROMOTEUR,
  LOST_REASONS_PROMOTEUR,
  MANDATE_NOTES_PROMOTEUR,
  MILESTONES,
  OFFER_CONDITIONS_PROMOTEUR,
  PROGRAMS,
  REJECT_REASONS_PROMOTEUR,
  WITHDRAW_REASONS_PROMOTEUR
} from './promoteur-commercial-data';
import type { PEnv, ProgCode } from './promoteur-commercial-data';

type OfferStatus = 'SUBMITTED' | 'COUNTERED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

interface BuyerPlan {
  key: string;
  first: string;
  last: string;
  company: boolean;
  diaspora: boolean;
  created: Date;
  contact?: ContactRef;
  boughtIn: ProgCode[];
  /** Acquéreur qui a signé un acte (devient client de l'agence). */
  deedSigned: boolean;
  /** Date de conversion en client. */
  convertedAt: Date | null;
  /** Lots dont l'acte est signé : propriété de l'acquéreur, suivis en garantie. */
  soldLots: Array<{ propertyId: string; deed: Date; prog: ProgCode }>;
}

interface ConditionPlan {
  label: string;
  due: Date | null;
  status: 'PENDING' | 'MET' | 'FAILED' | 'WAIVED';
  resolvedAt: Date | null;
}

interface MilestonePlan {
  label: string;
  due: Date | null;
  amount: number;
  paidAt: Date | null;
}

interface PaymentPlan {
  at: Date;
  fraction: number;
  settle?: boolean;
  voidThenRepost?: boolean;
}

interface AgreementPlan {
  created: Date;
  price: number;
  deposit: number;
  holder: 'NOTARY' | 'SELLER';
  notary: string;
  signedAt: Date | null;
  expectedDeed: Date | null;
  deedDate: Date | null;
  status: 'DRAFT' | 'SIGNED' | 'COMPLETED' | 'CANCELLED';
  cancelledAt: Date | null;
  cancelReason: string | null;
  conditions: ConditionPlan[];
  milestones: MilestonePlan[];
  payments: PaymentPlan[];
}

interface OfferPlan {
  key: string;
  buyer: BuyerPlan;
  amount: number;
  financing: 'CASH' | 'LOAN' | 'MIXED';
  conditions: string;
  created: Date;
  validUntil: Date | null;
  status: OfferStatus;
  counterAmount: number | null;
  decidedAt: Date | null;
  reason: string | null;
  agreement: AgreementPlan | null;
}

interface MandatePlan {
  key: string;
  unit: LotUnit;
  type: 'SIMPLE' | 'EXCLUSIVE';
  asking: number;
  minimum: number;
  rate: number;
  agentUserId: string;
  agentShare: number;
  start: Date;
  end: Date | null;
  status: 'ACTIVE' | 'REVOKED' | 'COMPLETED';
  revokedAt: Date | null;
  revokeReason: string | null;
  notes: string;
  offers: OfferPlan[];
}

const priceStep = (price: number): number => (price >= 100_000_000 ? 1_000_000 : 500_000);

function at(d: Date, hour = 10): Date {
  const x = new Date(d.getTime());
  x.setHours(hour, 0, 0, 0);
  return x;
}

/** Enchaînement croissant (au moins un jour d'écart) plafonné à « hier ». */
function chain(end: Date, dates: Date[]): Date[] {
  const cap = addDays(end, -1).getTime();
  const out: Date[] = [];
  for (let i = 0; i < dates.length; i++) {
    let t = dates[i].getTime();
    if (i > 0) t = Math.max(t, out[i - 1].getTime() + 86_400_000);
    out.push(new Date(Math.min(t, cap)));
  }
  return out;
}

interface PlanEnv {
  env: PEnv;
  siteByCode: Map<ProgCode, SiteInfo>;
  /** Réservoir de candidats acquéreurs qui font des offres sans acheter. */
  bidders: BuyerPlan[];
  investors: BuyerPlan[];
  buyerCounter: number;
  usedBidderOn: Map<string, Set<string>>;
  /** Actes signés ces derniers jours : le tableau « ce mois-ci » doit vivre. */
  recentDeeds: number;
}

function newBuyer(pe: PlanEnv, created: Date, opts: { diaspora?: boolean; company?: boolean } = {}): BuyerPlan {
  const { rng } = pe.env;
  pe.buyerCounter += 1;
  const person = {
    first: pick(rng, FIRST),
    last: pick(rng, LAST)
  };
  return {
    key: `b${pe.buyerCounter}`,
    first: person.first,
    last: person.last,
    company: opts.company ?? rng() < 0.1,
    diaspora: opts.diaspora ?? rng() < 0.2,
    created,
    boughtIn: [],
    deedSigned: false,
    convertedAt: null,
    soldLots: []
  };
}

function planSales(
  env: PEnv,
  siteByCode: Map<ProgCode, SiteInfo>,
  units: LotUnit[]
): { plans: MandatePlan[]; pe: PlanEnv } {
  const { rng, ctx, staff } = env;
  const pe: PlanEnv = {
    env,
    siteByCode,
    bidders: [],
    investors: [],
    buyerCounter: 0,
    usedBidderOn: new Map(),
    recentDeeds: 0
  };
  const plans: MandatePlan[] = [];

  // Investisseurs qui achètent plusieurs lots (diaspora ou chefs d'entreprise).
  for (let i = 0; i < 4; i++)
    pe.investors.push(newBuyer(pe, addDays(ctx.start, 60 + i * 120), { diaspora: i % 2 === 0, company: i === 3 }));
  // Candidats qui font des offres sans acheter : 26 personnes réparties sur l'historique.
  for (let i = 0; i < 26; i++) pe.bidders.push(newBuyer(pe, addDays(ctx.start, between(rng, 90, 880))));

  const rankByState = new Map<string, number>();
  const totalByKey = new Map<string, number>();
  for (const u of units) {
    const k = `${u.prog}:${u.state}`;
    totalByKey.set(k, (totalByKey.get(k) ?? 0) + 1);
  }

  let n = 0;
  for (const u of units) {
    if (!u.propertyId || u.state === 'DRAFT' || u.ref.includes('-P')) continue;
    const key = `${u.prog}:${u.state}`;
    const rank = rankByState.get(key) ?? 0;
    rankByState.set(key, rank + 1);
    const share = (rank + rng() * 0.8) / (totalByKey.get(key) ?? 1);
    const plan = planMandate(pe, u, share, n++);
    if (plan) plans.push(plan);
  }
  void staff;
  return { plans, pe };
}

function pickBidder(pe: PlanEnv, lotRef: string, created: Date): BuyerPlan {
  const { rng } = pe.env;
  for (let i = 0; i < 12; i++) {
    const b = pick(rng, pe.bidders);
    const used = pe.usedBidderOn.get(b.key) ?? new Set<string>();
    if (used.has(lotRef)) continue;
    used.add(lotRef);
    pe.usedBidderOn.set(b.key, used);
    if (b.created.getTime() > created.getTime() - 5 * 86_400_000) b.created = addDays(created, -between(rng, 10, 40));
    return b;
  }
  const b = newBuyer(pe, addDays(created, -between(rng, 12, 40)));
  pe.bidders.push(b);
  return b;
}

function planMandate(pe: PlanEnv, u: LotUnit, share: number, n: number): MandatePlan | null {
  const { env } = pe;
  const { rng, ctx, staff } = env;
  const T = ctx.end;
  const site = pe.siteByCode.get(u.prog);
  const key = `m${n}`;
  const asking = u.price;
  const agentUserId = pick(rng, staff);
  const floorDate = addDays(u.launchedAt, 22);
  const plan: MandatePlan = {
    key,
    unit: u,
    type: rng() < 0.55 ? 'EXCLUSIVE' : 'SIMPLE',
    asking,
    minimum: roundTo(asking * 0.93, priceStep(asking)),
    rate: pick(rng, [2, 2.5, 3, 3.5]),
    agentUserId,
    agentShare: pick(rng, [35, 40, 40, 45, 50]),
    start: addDays(u.launchedAt, between(rng, 3, 10)),
    end: null,
    status: 'ACTIVE',
    revokedAt: null,
    revokeReason: null,
    notes: pick(rng, MANDATE_NOTES_PROMOTEUR),
    offers: []
  };
  plan.end = addDays(plan.start, 548);

  let offerN = 0;
  const makeOffer = (
    created: Date,
    status: OfferStatus,
    buyer: BuyerPlan,
    o: Partial<OfferPlan> & { factor?: number } = {}
  ): OfferPlan => {
    offerN += 1;
    const factor = o.factor ?? between(rng, 93, 100) / 100;
    return {
      key: `${key}o${offerN}`,
      buyer,
      amount: roundTo(asking * factor, priceStep(asking)),
      financing: pick(rng, ['LOAN', 'LOAN', 'MIXED', 'CASH'] as const),
      conditions: pick(rng, OFFER_CONDITIONS_PROMOTEUR),
      created,
      validUntil: addDays(created, 21),
      status,
      counterAmount: null,
      decidedAt: null,
      reason: null,
      agreement: null,
      ...o
    };
  };

  const buyAgreement = (
    offer: OfferPlan,
    dates: { created: Date; signed: Date | null; expectedDeed: Date | null; deed: Date | null },
    status: AgreementPlan['status'],
    extra: Partial<AgreementPlan> = {}
  ): AgreementPlan => {
    const price = offer.counterAmount ?? offer.amount;
    const loan = offer.financing !== 'CASH';
    const conditions: ConditionPlan[] = [];
    if (loan)
      conditions.push({
        label: CONDITION_LABELS_PROMOTEUR[0],
        due: addDays(dates.created, 45),
        status: 'PENDING',
        resolvedAt: null
      });
    conditions.push({
      label: CONDITION_LABELS_PROMOTEUR[1],
      due: addDays(dates.created, 30),
      status: 'PENDING',
      resolvedAt: null
    });
    conditions.push({
      label: CONDITION_LABELS_PROMOTEUR[2],
      due: addDays(dates.created, 20),
      status: 'PENDING',
      resolvedAt: null
    });
    if (rng() < 0.4)
      conditions.push({
        label: CONDITION_LABELS_PROMOTEUR[3],
        due: addDays(dates.created, 10),
        status: 'PENDING',
        resolvedAt: null
      });
    const deposit = roundTo(price * MILESTONES[0].share, 1_000);
    return {
      created: dates.created,
      price,
      deposit,
      holder: pick(rng, ['NOTARY', 'NOTARY', 'SELLER'] as const),
      notary: pick(rng, NOTARIES),
      signedAt: dates.signed,
      expectedDeed: dates.expectedDeed,
      deedDate: dates.deed,
      status,
      cancelledAt: null,
      cancelReason: null,
      conditions,
      milestones: buildMilestones(site, price, dates.signed, status, T, rng),
      payments: [],
      ...extra
    };
  };

  const resolve = (a: AgreementPlan, mode: 'ALL_MET' | 'MIXED' | 'LOAN_FAILED'): void => {
    a.conditions.forEach((c, i) => {
      const resolved = a.signedAt ? addDays(a.signedAt, 5 + i * 6) : null;
      if (mode === 'ALL_MET') {
        c.status = i === a.conditions.length - 1 && rng() < 0.25 ? 'WAIVED' : 'MET';
        c.resolvedAt = resolved;
      } else if (mode === 'LOAN_FAILED') {
        if (c.label === CONDITION_LABELS_PROMOTEUR[0]) {
          c.status = 'FAILED';
          c.resolvedAt = a.cancelledAt;
        } else {
          c.status = 'MET';
          c.resolvedAt = resolved;
        }
      } else if (i < 2) {
        c.status = 'MET';
        c.resolvedAt = resolved;
      }
    });
  };

  /** Décale une série de dates pour que la première tombe après `floorDate`. */
  const shifted = (dates: Date[]): Date[] => {
    const delta = dates[0] < floorDate ? floorDate.getTime() - dates[0].getTime() : 0;
    return chain(
      T,
      dates.map(d => new Date(d.getTime() + delta))
    );
  };

  /** Fenêtre de signature des ventes conclues, selon le programme. */
  const windowFor = (): [Date, Date] => {
    const lo = addDays(u.launchedAt, 40);
    if (u.prog === 'ANG' || !site?.closedAt) return [lo, addDays(T, -58)];
    return [lo, new Date(Math.min(addDays(site.closedAt, 75).getTime(), addDays(T, -60).getTime()))];
  };

  const soldDates = (): { offer: Date; accepted: Date; agrCreated: Date; signed: Date; deed: Date } => {
    const [lo, hi] = windowFor();
    const hiT = Math.max(hi.getTime(), lo.getTime() + 20 * 86_400_000);
    const signed = at(new Date(lo.getTime() + (hiT - lo.getTime()) * Math.min(1, share)));
    const agrCreated = addDays(signed, -between(rng, 3, 7));
    const accepted = addDays(agrCreated, -between(rng, 2, 5));
    const offer = addDays(accepted, -between(rng, 3, 9));
    const deed = new Date(Math.min(addDays(signed, between(rng, 22, 42)).getTime(), addDays(T, -2).getTime()));
    return { offer, accepted, agrCreated, signed, deed };
  };

  const completed = (
    d: { offer: Date; accepted: Date; agrCreated: Date; signed: Date; deed: Date },
    buyer: BuyerPlan,
    mandateStatusTo = true
  ): OfferPlan => {
    const main = makeOffer(d.offer, 'ACCEPTED', buyer, {
      decidedAt: d.accepted,
      counterAmount: rng() < 0.35 ? roundTo(asking * 0.97, priceStep(asking)) : null
    });
    const agr = buyAgreement(
      main,
      { created: d.agrCreated, signed: d.signed, expectedDeed: d.deed, deed: d.deed },
      'COMPLETED'
    );
    resolve(agr, 'ALL_MET');
    main.agreement = agr;
    buyer.deedSigned = true;
    buyer.convertedAt = d.deed;
    if (!buyer.boughtIn.includes(u.prog)) buyer.boughtIn.push(u.prog);
    buyer.soldLots.push({ propertyId: u.propertyId as string, deed: d.deed, prog: u.prog });
    if (mandateStatusTo) {
      plan.status = 'COMPLETED';
      plan.end = d.deed;
    }
    agr.payments = commissionPayments(d.deed, T, rng);
    return main;
  };

  const winnerBuyer = (created: Date): BuyerPlan => {
    // Un acquéreur sur sept est un investisseur qui prend plusieurs lots.
    if (rng() < 0.14) {
      const inv = pe.investors.find(i => i.boughtIn.length < 3 && i.created < created);
      if (inv) return inv;
    }
    return newBuyer(pe, addDays(created, -between(rng, 20, 60)));
  };

  switch (u.state) {
    case 'SOLD': {
      const recent = u.prog === 'ANG' && share > 0.8 && pe.recentDeeds < 2;
      const d = soldDates();
      if (recent) {
        const deed = at(addDays(T, -(pe.recentDeeds === 0 ? 2 : 5)));
        d.deed = deed;
        d.signed = addDays(deed, -between(rng, 26, 34));
        d.agrCreated = addDays(d.signed, -between(rng, 3, 6));
        d.accepted = addDays(d.agrCreated, -between(rng, 2, 4));
        d.offer = addDays(d.accepted, -between(rng, 3, 9));
        pe.recentDeeds += 1;
      }
      const dates = shifted([d.offer, d.accepted, d.agrCreated, d.signed, d.deed]);
      const dd = { offer: dates[0], accepted: dates[1], agrCreated: dates[2], signed: dates[3], deed: dates[4] };
      const buyer = winnerBuyer(dd.offer);
      const early: OfferPlan[] = [];
      if (rng() < 0.45) {
        const c = addDays(dd.offer, -between(rng, 12, 30));
        early.push(
          makeOffer(c, 'REJECTED', pickBidder(pe, u.ref, c), {
            factor: 0.84,
            decidedAt: addDays(c, 3),
            reason: pick(rng, REJECT_REASONS_PROMOTEUR)
          })
        );
      }
      if (rng() < 0.25) {
        const c = addDays(dd.offer, -between(rng, 6, 14));
        early.push(
          makeOffer(c, 'WITHDRAWN', pickBidder(pe, u.ref, c), {
            factor: 0.9,
            decidedAt: addDays(c, 6),
            reason: pick(rng, WITHDRAW_REASONS_PROMOTEUR)
          })
        );
      }
      const main = completed(dd, buyer);
      if (recent && main.agreement) {
        // Premier règlement de la commission ce mois-ci.
        main.agreement.payments = [
          { at: new Date(Math.min(addDays(dd.deed, 1).getTime(), addDays(T, -1).getTime())), fraction: 0.5 }
        ];
      }
      plan.offers.push(...early, main);
      u.deedDate = dd.deed;
      break;
    }
    case 'SOLD_AFTER_CANCEL': {
      const d = soldDates();
      const cancelled = addDays(d.offer, -between(rng, 3, 8));
      const signed1 = addDays(cancelled, -between(rng, 38, 55));
      const agr1 = addDays(signed1, -between(rng, 3, 6));
      const acc1 = addDays(agr1, -between(rng, 2, 4));
      const off1 = addDays(acc1, -between(rng, 3, 8));
      const dates = shifted([
        off1,
        acc1,
        agr1,
        signed1,
        cancelled,
        d.offer,
        d.accepted,
        d.agrCreated,
        d.signed,
        d.deed
      ]);
      const first = makeOffer(dates[0], 'ACCEPTED', pickBidder(pe, u.ref, dates[0]), {
        decidedAt: dates[1],
        financing: 'LOAN'
      });
      const a1 = buyAgreement(
        first,
        { created: dates[2], signed: dates[3], expectedDeed: addDays(dates[3], 50), deed: null },
        'CANCELLED',
        {
          cancelledAt: dates[4],
          cancelReason:
            'Condition suspensive d’obtention du prêt non réalisée : la banque de l’acquéreur a refusé le financement.'
        }
      );
      resolve(a1, 'LOAN_FAILED');
      a1.milestones.forEach((m, i) => {
        if (i > 0) {
          m.due = null;
          m.paidAt = null;
        }
      });
      first.agreement = a1;
      const buyer = winnerBuyer(dates[5]);
      const second = completed(
        { offer: dates[5], accepted: dates[6], agrCreated: dates[7], signed: dates[8], deed: dates[9] },
        buyer
      );
      plan.offers.push(first, second);
      u.deedDate = dates[9];
      break;
    }
    case 'UNDER_OFFER': {
      const signed = at(addDays(T, -between(rng, 4, u.prog === 'VAL' ? 28 : 40)));
      const agrCreated = addDays(signed, -between(rng, 3, 6));
      const accepted = addDays(agrCreated, -between(rng, 2, 4));
      const offer = addDays(accepted, -between(rng, 4, 9));
      const [o, ac, ag, sg] = shifted([offer, accepted, agrCreated, signed]);
      const buyer = winnerBuyer(o);
      const main = makeOffer(o, 'ACCEPTED', buyer, { decidedAt: ac, financing: pick(rng, ['LOAN', 'MIXED'] as const) });
      const expected = addDays(T, u.prog === 'VAL' ? between(rng, 60, 120) : between(rng, 8, 40));
      const agr = buyAgreement(main, { created: ag, signed: sg, expectedDeed: expected, deed: null }, 'SIGNED');
      resolve(agr, 'MIXED');
      agr.conditions.forEach(c => {
        if (c.status === 'PENDING') c.due = addDays(T, between(rng, 4, 25));
      });
      main.agreement = agr;
      buyer.convertedAt = null;
      plan.offers.push(main);
      break;
    }
    case 'RESERVED': {
      const accepted = at(addDays(T, -between(rng, 2, 13)));
      const offer = addDays(accepted, -between(rng, 3, 8));
      const agrCreated = new Date(Math.min(addDays(accepted, between(rng, 1, 3)).getTime(), addDays(T, -1).getTime()));
      const [o, ac, ag] = shifted([offer, accepted, agrCreated]);
      const buyer = winnerBuyer(o);
      const main = makeOffer(o, 'ACCEPTED', buyer, {
        decidedAt: ac,
        counterAmount: rng() < 0.5 ? roundTo(asking * 0.97, priceStep(asking)) : null
      });
      main.agreement = buyAgreement(main, { created: ag, signed: null, expectedDeed: null, deed: null }, 'DRAFT');
      plan.offers.push(main);
      break;
    }
    case 'OPEN_OFFERS': {
      const c1 = at(addDays(T, -between(rng, 14, 30)));
      const c2 = at(addDays(T, -between(rng, 2, 12)));
      const [a, b] = shifted([c1, c2]);
      if (rng() < 0.5) {
        const c0 = addDays(a, -between(rng, 20, 60));
        plan.offers.push(
          makeOffer(c0, 'REJECTED', pickBidder(pe, u.ref, c0), {
            factor: 0.83,
            decidedAt: addDays(c0, 3),
            reason: pick(rng, REJECT_REASONS_PROMOTEUR)
          })
        );
      }
      plan.offers.push(
        makeOffer(a, 'COUNTERED', pickBidder(pe, u.ref, a), {
          factor: 0.88,
          decidedAt: addDays(a, 3),
          counterAmount: roundTo(asking * 0.96, priceStep(asking)),
          reason: 'La direction commerciale propose un prix intermédiaire, sans aller sous le plancher.',
          validUntil: addDays(T, between(rng, 3, 10))
        }),
        makeOffer(b, 'SUBMITTED', pickBidder(pe, u.ref, b), {
          factor: 0.92,
          validUntil: addDays(T, between(rng, 4, 14))
        })
      );
      break;
    }
    case 'LOST_OFFERS': {
      const c1 = at(addDays(T, -between(rng, 90, 220)));
      const c2 = at(addDays(T, -between(rng, 30, 80)));
      const [a, b] = shifted([c1, c2]);
      plan.offers.push(
        makeOffer(a, 'REJECTED', pickBidder(pe, u.ref, a), {
          factor: 0.8,
          decidedAt: addDays(a, 4),
          reason: pick(rng, REJECT_REASONS_PROMOTEUR)
        }),
        makeOffer(b, 'WITHDRAWN', pickBidder(pe, u.ref, b), {
          factor: 0.87,
          decidedAt: addDays(b, 8),
          reason: pick(rng, WITHDRAW_REASONS_PROMOTEUR)
        })
      );
      if (n % 2 === 0) {
        plan.end = addDays(T, -between(rng, 10, 40));
        plan.notes = 'Mandat échu sans renouvellement : à proroger ou à clore avec la direction commerciale.';
      } else {
        plan.status = 'REVOKED';
        plan.revokedAt = addDays(T, -between(rng, 40, 100));
        plan.revokeReason = 'Lot retiré de la vente pour être regroupé avec le lot voisin à la demande d’un acquéreur.';
      }
      break;
    }
    case 'CANCELLED_AVAILABLE': {
      const signed1 = at(addDays(T, -between(rng, 120, 190)));
      const [off1, acc1, agr1, sg1, cancelled, off2] = shifted([
        addDays(signed1, -14),
        addDays(signed1, -9),
        addDays(signed1, -5),
        signed1,
        addDays(signed1, 46),
        addDays(T, -between(rng, 3, 12))
      ]);
      const first = makeOffer(off1, 'ACCEPTED', pickBidder(pe, u.ref, off1), { decidedAt: acc1, financing: 'LOAN' });
      const a1 = buyAgreement(
        first,
        { created: agr1, signed: sg1, expectedDeed: addDays(sg1, 55), deed: null },
        'CANCELLED',
        {
          cancelledAt: cancelled,
          cancelReason:
            'Condition suspensive d’obtention du prêt non réalisée : financement refusé par la banque de l’acquéreur.'
        }
      );
      resolve(a1, 'LOAN_FAILED');
      a1.milestones.forEach((m, i) => {
        if (i > 0) {
          m.due = null;
          m.paidAt = null;
        }
      });
      first.agreement = a1;
      plan.offers.push(
        first,
        makeOffer(off2, 'SUBMITTED', pickBidder(pe, u.ref, off2), {
          factor: 0.95,
          financing: 'CASH',
          validUntil: addDays(T, 9)
        })
      );
      break;
    }
    case 'AVAILABLE': {
      // Un lot disponible sur deux porte un mandat de commercialisation actif, sans offre.
      if (rng() < 0.45) return null;
      plan.end = u.prog === 'VAL' ? addDays(plan.start, 365) : plan.end;
      break;
    }
    default:
      return null;
  }

  // Le mandat commence avant sa première offre.
  const firstOffer = plan.offers.reduce<Date | null>((min, o) => (!min || o.created < min ? o.created : min), null);
  if (firstOffer && plan.start > addDays(firstOffer, -3)) plan.start = addDays(firstOffer, -between(rng, 4, 12));
  if (plan.status === 'ACTIVE' && u.state !== 'LOST_OFFERS' && plan.end && plan.end < T && rng() < 0.75) {
    // Mandat prorogé par avenant : il reste actif.
    plan.end = addDays(T, between(rng, 40, 300));
    plan.notes = 'Mandat prorogé d’un an avec la direction commerciale, prix et honoraires inchangés.';
  }
  return plan;
}

// ───────────────────────────────────────────────────────── jalons et règlements

function buildMilestones(
  site: SiteInfo | undefined,
  price: number,
  signed: Date | null,
  status: AgreementPlan['status'],
  T: Date,
  rng: () => number
): MilestonePlan[] {
  const out: MilestonePlan[] = [];
  let allocated = 0;
  MILESTONES.forEach((def, k) => {
    const last = k === MILESTONES.length - 1;
    const amount = last ? price - allocated : roundTo(price * def.share, 1_000);
    allocated += amount;
    let due: Date | null = null;
    if (k === 0) due = signed;
    else if (signed && site) {
      const reached = progressDate(site, def.threshold);
      due = reached ? new Date(Math.max(reached.getTime(), addDays(signed, 7).getTime())) : null;
    }
    if (status === 'DRAFT') due = k === 0 ? null : null;
    let paidAt: Date | null = null;
    if (status === 'CANCELLED') {
      if (k === 0 && signed) paidAt = signed;
      if (k > 0) due = null;
    } else if (status !== 'DRAFT' && due && due.getTime() <= T.getTime() - 3 * 86_400_000) {
      const overdue = rng() < 0.07 && due.getTime() > T.getTime() - 70 * 86_400_000 && k > 0;
      if (!overdue)
        paidAt = new Date(
          Math.min(addDays(due, k === 0 ? 0 : between(rng, 1, 15)).getTime(), addDays(T, -1).getTime())
        );
    }
    out.push({ label: def.label, due, amount, paidAt });
  });
  return out;
}

function commissionPayments(deed: Date, T: Date, rng: () => number): PaymentPlan[] {
  const ageDays = Math.floor((T.getTime() - deed.getTime()) / 86_400_000);
  const roll = rng();
  if (ageDays > 45) {
    if (roll < 0.1) return [{ at: addDays(deed, between(rng, 5, 15)), fraction: 0.6 }];
    if (roll < 0.18)
      return [
        { at: addDays(deed, 3), fraction: 0.4, voidThenRepost: true },
        { at: addDays(deed, between(rng, 20, 34)), fraction: 0.6, settle: true }
      ];
    if (roll < 0.5) return [{ at: addDays(deed, between(rng, 2, 12)), fraction: 1, settle: true }];
    return [
      { at: addDays(deed, between(rng, 2, 8)), fraction: 0.5 },
      { at: addDays(deed, between(rng, 20, Math.min(40, ageDays - 1))), fraction: 0.5, settle: true }
    ];
  }
  if (roll < 0.45) return [];
  return [{ at: addDays(deed, Math.min(between(rng, 1, 5), Math.max(ageDays - 1, 0))), fraction: 0.5 }];
}

// ───────────────────────────────────────────────────────── écriture

type TreasuryRow = { id: string; kind: string; label: string };

function chooseTreasury(
  accounts: TreasuryRow[],
  amount: number,
  rng: () => number
): { id: string; method: 'CASH' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHECK' } | null {
  if (accounts.length === 0) return null;
  const bank = accounts.filter(a => a.kind === 'BANK');
  if (bank.length > 0 && (amount > 2_000_000 || rng() < 0.35)) {
    return { id: bank[0].id, method: rng() < 0.75 ? 'BANK_TRANSFER' : 'CHECK' };
  }
  const cash = accounts.find(a => a.kind === 'CASH');
  if (cash) return { id: cash.id, method: 'CASH' };
  if (bank.length > 0) return { id: bank[0].id, method: 'BANK_TRANSFER' };
  const mm = accounts.find(a => a.kind === 'MOBILE_MONEY');
  return mm ? { id: mm.id, method: 'MOBILE_MONEY' } : null;
}

function referenceFor(method: string, when: Date, suffix: string): string {
  const stamp = when.toISOString().slice(2, 10).replace(/-/g, '');
  const prefix =
    method === 'BANK_TRANSFER' ? 'VIR' : method === 'CHECK' ? 'CHQ' : method === 'MOBILE_MONEY' ? 'MM' : 'ESP';
  return `${prefix}-${stamp}-${suffix}`;
}

function dealStage(o: OfferPlan): 'NEW' | 'QUALIFIED' | 'VISIT' | 'NEGOTIATION' | 'WON' | 'LOST' {
  if (o.status === 'ACCEPTED') {
    const s = o.agreement?.status;
    if (s === 'COMPLETED') return 'WON';
    if (s === 'CANCELLED') return 'LOST';
    return 'NEGOTIATION';
  }
  if (o.status === 'SUBMITTED' || o.status === 'COUNTERED') return 'NEGOTIATION';
  return 'LOST';
}

function dealClosedAt(o: OfferPlan): Date | null {
  if (o.agreement?.status === 'COMPLETED') return o.agreement.deedDate;
  if (o.agreement?.status === 'CANCELLED') return o.agreement.cancelledAt;
  if (o.status === 'REJECTED' || o.status === 'WITHDRAWN') return o.decidedAt;
  return null;
}

function dealClosedReason(o: OfferPlan, stage: string): string | null {
  if (stage === 'WON') return 'Vente conclue : acte signé';
  if (stage !== 'LOST') return null;
  if (o.agreement?.status === 'CANCELLED') return LOST_REASONS_PROMOTEUR[0];
  if (o.status === 'REJECTED') return 'Offre refusée par la direction commerciale';
  return LOST_REASONS_PROMOTEUR[1];
}

export interface SalesResult {
  contacts: ContactRef[];
  buyers: BuyerPlan[];
  completed: number;
}

export async function seedPromoteurVentes(
  env: PEnv,
  sites: SiteInfo[],
  units: LotUnit[],
  spv: Map<ProgCode, SpvInfo>
): Promise<SalesResult> {
  const { prisma, tenantId, rng, ctx, adminUserId, log } = env;
  const T = ctx.end;
  const siteByCode = new Map(sites.map(s => [s.code, s]));
  const { plans, pe } = planSales(env, siteByCode, units);
  if (plans.length === 0) return { contacts: [], buyers: [], completed: 0 };

  const { computeCommissionAmounts, createCommissionPayment, voidCommissionPayment } =
    await import('../../../src/lib/sales/commissions');
  const { getAgencyFinanceSettings } = await import('../../../src/lib/settings/finance-settings');
  const { nextSequenceTx, mandateNumber } = await import('../../../src/lib/sales/numbering');
  const year = (d: Date): number => d.getUTCFullYear();

  // 1. Acquéreurs : une fiche CRM chacun, convertie en client à la signature de l'acte.
  const allBuyers = new Map<string, BuyerPlan>();
  for (const plan of plans) for (const o of plan.offers) allBuyers.set(o.buyer.key, o.buyer);
  const contacts: ContactRef[] = [];
  const firstOfferDate = (b: BuyerPlan): Date => {
    let min: Date | null = null;
    for (const plan of plans)
      for (const o of plan.offers) if (o.buyer === b && (!min || o.created < min)) min = o.created;
    return min ?? b.created;
  };
  for (const b of [...allBuyers.values()].sort((x, y) => firstOfferDate(x).getTime() - firstOfferDate(y).getTime())) {
    const first = firstOfferDate(b);
    const created = b.created < addDays(first, -3) ? b.created : addDays(first, -between(rng, 12, 40));
    b.created = new Date(Math.max(created.getTime(), ctx.start.getTime() + 86_400_000));
    const contact = await createContact(env, {
      kind: b.deedSigned ? 'BUYER' : 'PROSPECT',
      createdAt: b.created,
      status: b.deedSigned ? 'ACTIVE_CLIENT' : 'LEAD',
      convertedAt: b.convertedAt,
      person: { first: b.first, last: b.last },
      company: b.company,
      diaspora: b.diaspora,
      maturity: b.deedSigned ? 'HOT' : pick(rng, ['WARM', 'HOT'] as const)
    });
    contact.boughtIn = b.boughtIn;
    b.contact = contact;
    contacts.push(contact);
  }

  // 2. Mandats de vente, dans l'ordre chronologique.
  const mandateRows = new Map<string, Awaited<ReturnType<typeof prisma.saleMandate.create>>>();
  for (const plan of [...plans].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const owner = spv.get(plan.unit.prog);
    if (!owner) continue;
    const y = year(plan.start);
    const sequence = await nextSequenceTx(prisma.saleMandate, tenantId, y);
    const row = await prisma.saleMandate.create({
      data: {
        tenantId,
        year: y,
        sequence,
        propertyId: plan.unit.propertyId as string,
        sellerClientId: owner.clientId,
        mandateType: plan.type,
        askingPrice: plan.asking,
        minimumPrice: plan.minimum,
        commissionMode: 'PERCENT',
        commissionRate: plan.rate,
        commissionPayer: 'SELLER',
        agentUserId: plan.agentUserId,
        agentSharePercent: plan.agentShare,
        startDate: plan.start,
        endDate: plan.end,
        status: plan.status,
        revokedAt: plan.revokedAt,
        revokedByUserId: plan.revokedAt ? adminUserId : null,
        revokeReason: plan.revokeReason,
        notes: plan.notes,
        createdAt: plan.start
      }
    });
    mandateRows.set(plan.key, row);
  }
  log(
    `promoteur-commercial : ${mandateRows.size} mandats de vente (premier : ${mandateNumber(year(plans[0].start), 1)}).`
  );

  // 3. Affaires d'achat, visites et activités, offre par offre.
  const offers = plans.flatMap(p => p.offers.map(o => ({ plan: p, offer: o })));
  const dealIds = new Map<string, string>();
  const lastTouch = new Map<string, Date>();
  for (const { plan, offer } of offers.sort((a, b) => a.offer.created.getTime() - b.offer.created.getTime())) {
    const contact = offer.buyer.contact as ContactRef;
    const stage = dealStage(offer);
    const dealCreated = new Date(
      Math.max(addDays(offer.created, -between(rng, 12, 35)).getTime(), offer.buyer.created.getTime() + 86_400_000)
    );
    const closedAt = dealClosedAt(offer);
    const value = offer.agreement?.price ?? offer.amount;
    const updatedAt = stage === 'WON' || stage === 'LOST' ? (closedAt ?? dealCreated) : addDays(T, -1);
    const deal = await prisma.crmDeal.create({
      data: {
        tenantId,
        contactId: contact.id,
        type: 'ACHAT',
        stage,
        budgetMin: Math.round(offer.amount * 0.85),
        budgetMax: Math.round(offer.amount * 1.1),
        locationZone: PROGRAMS[plan.unit.prog].zone,
        expectedValue: value,
        probability: { NEW: 0.2, QUALIFIED: 0.4, VISIT: 0.6, NEGOTIATION: 0.8, WON: 1, LOST: 0 }[stage],
        assignedToUserId: plan.agentUserId,
        closedAt: stage === 'WON' || stage === 'LOST' ? closedAt : null,
        closedReason: dealClosedReason(offer, stage),
        createdAt: dealCreated,
        updatedAt
      },
      select: { id: true }
    });
    dealIds.set(offer.key, deal.id);
    await prisma.crmDealProperty.create({
      data: {
        tenantId,
        dealId: deal.id,
        propertyId: plan.unit.propertyId as string,
        matchScore: between(rng, 70, 98),
        status:
          offer.status === 'ACCEPTED' && stage !== 'LOST' ? 'SELECTED' : stage === 'LOST' ? 'REJECTED' : 'VISITED',
        createdAt: dealCreated
      }
    });
    const touched = await addDealActivities(env, {
      contactId: contact.id,
      dealId: deal.id,
      lot: plan.unit,
      from: dealCreated,
      to: closedAt ?? addDays(T, -1),
      count: stage === 'WON' ? 5 : between(rng, 3, 5),
      open: stage !== 'WON' && stage !== 'LOST',
      userId: plan.agentUserId,
      outcome: stage === 'WON' ? 'Vente conclue' : 'Affaire clôturée'
    });
    lastTouch.set(
      contact.id,
      new Date(Math.max((lastTouch.get(contact.id) ?? new Date(0)).getTime(), touched.getTime()))
    );

    // Visites du lot avant l'offre (une ou deux), faites.
    const visits = stage === 'WON' && rng() < 0.6 ? 2 : 1;
    for (let v = 0; v < visits; v++) {
      const day = addDays(offer.created, -between(rng, 3 + v * 6, 12 + v * 8));
      await createVisit(env, {
        propertyId: plan.unit.propertyId as string,
        contactId: contact.id,
        dealId: deal.id,
        at: new Date(Math.min(day.getTime(), addDays(T, -1).getTime())),
        status: 'DONE',
        userId: plan.agentUserId,
        location: `Bureau de vente — ${PROGRAMS[plan.unit.prog].brand}`,
        goal: v === 0 ? 'EVALUATION' : 'NEGOTIATION'
      });
    }
  }

  // 4. Offres, dans l'ordre chronologique.
  const offerIds = new Map<string, string>();
  for (const { plan, offer } of [...offers].sort((a, b) => a.offer.created.getTime() - b.offer.created.getTime())) {
    const mandate = mandateRows.get(plan.key);
    if (!mandate) continue;
    const y = year(offer.created);
    const sequence = await nextSequenceTx(prisma.saleOffer, tenantId, y);
    const row = await prisma.saleOffer.create({
      data: {
        tenantId,
        year: y,
        sequence,
        mandateId: mandate.id,
        buyerContactId: (offer.buyer.contact as ContactRef).id,
        dealId: dealIds.get(offer.key) ?? null,
        amount: offer.amount,
        financing: offer.financing,
        conditions: offer.conditions,
        validUntil: offer.validUntil,
        status: offer.status,
        counterAmount: offer.counterAmount,
        decidedAt: offer.decidedAt,
        decidedByUserId: offer.decidedAt ? adminUserId : null,
        decisionReason: offer.reason,
        createdAt: offer.created
      }
    });
    offerIds.set(offer.key, row.id);
  }

  // 5. Compromis, conditions suspensives et échéanciers par jalons.
  const agreementRows = new Map<
    string,
    { id: string; plan: AgreementPlan; mandateKey: string; propertyId: string; unit: LotUnit; buyer: BuyerPlan }
  >();
  const agreements = offers
    .filter(x => x.offer.agreement && mandateRows.has(x.plan.key))
    .sort(
      (a, b) =>
        (a.offer.agreement as AgreementPlan).created.getTime() - (b.offer.agreement as AgreementPlan).created.getTime()
    );
  for (const { plan, offer } of agreements) {
    const a = offer.agreement as AgreementPlan;
    const y = year(a.created);
    const sequence = await nextSequenceTx(prisma.saleAgreement, tenantId, y);
    const row = await prisma.saleAgreement.create({
      data: {
        tenantId,
        year: y,
        sequence,
        offerId: offerIds.get(offer.key) as string,
        mandateId: (mandateRows.get(plan.key) as { id: string }).id,
        propertyId: plan.unit.propertyId as string,
        price: a.price,
        depositAmount: a.deposit,
        depositHolder: a.holder,
        notaryName: a.notary,
        signedAt: a.signedAt,
        expectedDeedDate: a.expectedDeed,
        deedDate: a.deedDate,
        status: a.status,
        cancelledAt: a.cancelledAt,
        cancelReason: a.cancelReason,
        cancelledByUserId: a.cancelledAt ? adminUserId : null,
        createdAt: a.created
      }
    });
    for (const c of a.conditions) {
      await prisma.saleAgreementCondition.create({
        data: {
          tenantId,
          agreementId: row.id,
          label: c.label,
          dueDate: c.due,
          status: c.status,
          resolvedAt: c.resolvedAt,
          createdAt: a.created
        }
      });
    }
    let order = 0;
    for (const m of a.milestones) {
      await prisma.salePaymentMilestone.create({
        data: {
          tenantId,
          agreementId: row.id,
          label: m.label,
          dueDate: m.due,
          amount: m.amount,
          paidAt: m.paidAt,
          sortOrder: order,
          createdAt: a.created
        }
      });
      order += 1;
    }
    agreementRows.set(offer.key, {
      id: row.id,
      plan: a,
      mandateKey: plan.key,
      propertyId: plan.unit.propertyId as string,
      unit: plan.unit,
      buyer: offer.buyer
    });
  }

  // 6. Commissions des ventes conclues, dans l'ordre des actes, et leurs règlements.
  const settings = await getAgencyFinanceSettings(tenantId);
  const treasury = await prisma.treasuryAccount.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, kind: true, label: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
  });
  const done = [...agreementRows.values()]
    .filter(v => v.plan.status === 'COMPLETED')
    .sort((a, b) => (a.plan.deedDate as Date).getTime() - (b.plan.deedDate as Date).getTime());
  let commissions = 0;
  let paymentsCount = 0;
  for (const v of done) {
    const mandate = mandateRows.get(v.mandateKey);
    if (!mandate) continue;
    const deed = v.plan.deedDate as Date;
    const y = year(deed);
    const sequence = await nextSequenceTx(prisma.saleCommission, tenantId, y);
    const amounts = computeCommissionAmounts(mandate, v.plan.price, settings.vatRegistered, settings.vatRate);
    const commission = await prisma.saleCommission.create({
      data: {
        tenantId,
        year: y,
        sequence,
        agreementId: v.id,
        mandateId: mandate.id,
        payer: mandate.commissionPayer,
        baseAmount: v.plan.price,
        ...amounts,
        agentUserId: mandate.agentUserId,
        agentSharePercent: mandate.agentSharePercent,
        issuedAt: deed,
        createdAt: deed
      }
    });
    commissions += 1;
    let paidSoFar = 0;
    for (const pay of v.plan.payments) {
      if (pay.at > T) continue;
      const account = chooseTreasury(treasury, amounts.amountInclTax * pay.fraction, rng);
      if (!account) continue;
      let amount = Math.round(amounts.amountInclTax * pay.fraction);
      if (pay.settle) amount = amounts.amountInclTax - paidSoFar;
      if (amount <= 0) continue;
      try {
        const post = async (reference: string): Promise<{ id: string }> =>
          createCommissionPayment(tenantId, adminUserId, commission.id, {
            amount,
            paidAt: pay.at,
            paymentMethod: account.method,
            treasuryAccountId: account.id,
            reference
          });
        if (pay.voidThenRepost) {
          const wrong = await post(referenceFor(account.method, pay.at, 'ERR'));
          await prisma.saleCommissionPayment.update({ where: { id: wrong.id }, data: { createdAt: pay.at } });
          await voidCommissionPayment(tenantId, adminUserId, wrong.id, {
            reason: 'Règlement saisi en double : écriture annulée et ressaisie correctement.'
          });
          paymentsCount += 1;
        }
        const payment = await post(referenceFor(account.method, pay.at, 'OK'));
        await prisma.saleCommissionPayment.update({ where: { id: payment.id }, data: { createdAt: pay.at } });
        paidSoFar += amount;
        paymentsCount += 1;
      } catch (error) {
        log(
          `promoteur-commercial : règlement de commission ignoré — ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
  log(`promoteur-commercial : ${commissions} commissions de vente, ${paymentsCount} règlements comptabilisés.`);

  // 7. Statuts des lots, historique, clôture des mandats de commercialisation.
  await applyStatuses(env, plans);

  // 8. Rendez-vous chez le notaire (passés à la signature de l'acte, à venir pour les compromis signés).
  let appointments = 0;
  for (const [offerKey, v] of agreementRows) {
    const buyer = v.buyer.contact as ContactRef;
    const plan = plans.find(p => p.key === v.mandateKey) as MandatePlan;
    const place = `${v.plan.notary}`;
    if (v.plan.status === 'COMPLETED' && v.plan.deedDate) {
      await createVisit(env, {
        propertyId: v.propertyId,
        contactId: buyer.id,
        dealId: dealIds.get(offerKey) ?? null,
        at: at(v.plan.deedDate, 10),
        status: 'DONE',
        userId: plan.agentUserId,
        location: place,
        appointment: true,
        goal: 'CONTRACT_SIGNING',
        notes: 'Signature de l’acte de vente chez le notaire, remise de l’attestation de propriété.'
      });
      appointments += 1;
    } else if (v.plan.status === 'SIGNED' && v.plan.expectedDeed) {
      await createVisit(env, {
        propertyId: v.propertyId,
        contactId: buyer.id,
        dealId: dealIds.get(offerKey) ?? null,
        at: at(v.plan.expectedDeed, 9),
        status: v.plan.expectedDeed > T ? 'CONFIRMED' : 'SCHEDULED',
        userId: plan.agentUserId,
        location: place,
        appointment: true,
        goal: 'CONTRACT_SIGNING',
        notes: 'Rendez-vous de signature de l’acte, pièces de l’acquéreur à remettre à l’étude.'
      });
      appointments += 1;
    }
  }

  // 9. Dernière interaction des acquéreurs, clients de l'agence, actes notariés.
  for (const c of contacts) {
    const b = [...allBuyers.values()].find(x => x.contact === c) as BuyerPlan;
    const touch = lastTouch.get(c.id) ?? c.createdAt;
    await finalizeContact(env, c.id, touch, {
      updatedAt: b.deedSigned && b.convertedAt ? new Date(Math.max(b.convertedAt.getTime(), touch.getTime())) : touch
    });
  }
  await seedBuyerClients(env, [...allBuyers.values()], siteByCode);
  await seedDeedDocuments(
    env,
    done.map(d => ({ unit: d.unit, buyer: d.buyer, plan: d.plan }))
  );

  log(
    `promoteur-commercial : ${offers.length} offres, ${agreements.length} compromis dont ${done.length} actes signés, ${dealIds.size} affaires d'achat, ${appointments} rendez-vous notaire.`
  );
  void pe;
  return { contacts, buyers: [...allBuyers.values()], completed: done.length };
}

// ───────────────────────────────────────────────────────── suites de l'écriture

async function applyStatuses(env: PEnv, plans: MandatePlan[]): Promise<void> {
  const { prisma, tenantId, adminUserId, log } = env;
  type Ev = { at: Date; status: PropertyStatus; note: string };
  const byProperty = new Map<string, Ev[]>();
  const push = (id: string, e: Ev): void => {
    byProperty.set(id, [...(byProperty.get(id) ?? []), e]);
  };
  for (const plan of plans) {
    const id = plan.unit.propertyId as string;
    for (const o of plan.offers) {
      const a = o.agreement;
      if (o.status !== 'ACCEPTED' || !a) continue;
      push(id, { at: o.decidedAt ?? a.created, status: 'RESERVED', note: 'Offre d’achat acceptée, lot réservé' });
      if (a.signedAt)
        push(id, { at: a.signedAt, status: 'UNDER_OFFER', note: 'Contrat de réservation signé, acompte encaissé' });
      if (a.status === 'COMPLETED' && a.deedDate)
        push(id, { at: a.deedDate, status: 'SOLD', note: 'Acte de vente signé chez le notaire' });
      if (a.status === 'CANCELLED' && a.cancelledAt)
        push(id, { at: a.cancelledAt, status: 'AVAILABLE', note: 'Compromis annulé, lot remis en vente' });
    }
  }
  let changed = 0;
  for (const [propertyId, events] of byProperty) {
    events.sort((x, y) => x.at.getTime() - y.at.getTime());
    let previous: PropertyStatus = 'AVAILABLE';
    for (const e of events) {
      await prisma.propertyStatusHistory.create({
        data: {
          propertyId,
          tenantId,
          previousStatus: previous,
          newStatus: e.status,
          changedByUserId: adminUserId,
          notes: e.note,
          createdAt: e.at
        }
      });
      previous = e.status;
    }
    await prisma.property.update({
      where: { id: propertyId },
      data: {
        status: previous,
        availability: previous === 'AVAILABLE' ? 'AVAILABLE' : 'UNAVAILABLE',
        isPublished: previous === 'AVAILABLE',
        updatedAt: events[events.length - 1].at
      }
    });
    changed += 1;
  }
  // Mandats de commercialisation clos à la date de l'acte.
  for (const plan of plans) {
    if (plan.status !== 'COMPLETED' && plan.unit.deedDate == null) continue;
    const deed = plan.unit.deedDate;
    if (!deed) continue;
    await prisma.propertyMandate.updateMany({
      where: { propertyId: plan.unit.propertyId as string, tenantId },
      data: {
        endDate: deed,
        isActive: false,
        revokedAt: deed,
        revokedByUserId: adminUserId,
        notes: 'Lot vendu : le mandat de commercialisation est clos à la signature de l’acte de vente.'
      }
    });
  }
  log(`promoteur-commercial : ${changed} lots changent de statut (réservé, sous contrat, vendu).`);
}

/** Les acquéreurs d'un acte signé deviennent clients de l'agence (type acquéreur). */
async function seedBuyerClients(env: PEnv, buyers: BuyerPlan[], siteByCode: Map<ProgCode, SiteInfo>): Promise<void> {
  const { prisma, tenantId, adminUserId, log } = env;
  let created = 0;
  let mandates = 0;
  for (const b of buyers) {
    if (!b.deedSigned || !b.contact) continue;
    let user = await prisma.user.findUnique({ where: { email: b.contact.email }, select: { id: true } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: b.contact.email,
          fullName: `${b.first} ${b.last}`,
          isActive: true,
          createdAt: b.convertedAt ?? b.created
        },
        select: { id: true }
      });
    }
    const has = await prisma.tenantClient.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
      select: { id: true }
    });
    if (!has) {
      await prisma.tenantClient.create({
        data: {
          userId: user.id,
          tenantId,
          clientType: 'BUYER',
          details: { source: 'pack-history', programmes: b.boughtIn.map(p => PROGRAMS[p].brand) },
          createdAt: b.convertedAt ?? b.created
        }
      });
      created += 1;
    }
    // Le lot est désormais à l'acquéreur ; le promoteur le suit au titre de la garantie.
    for (const lot of b.soldLots) {
      await prisma.property.update({
        where: { id: lot.propertyId },
        data: { ownerUserId: user.id, updatedAt: lot.deed }
      });
      const delivered = siteByCode.get(lot.prog)?.closedAt ?? null;
      const start = delivered && delivered > lot.deed ? delivered : lot.deed;
      if ((await prisma.propertyMandate.count({ where: { propertyId: lot.propertyId, tenantId, isActive: true } })) > 0)
        continue;
      await prisma.propertyMandate.create({
        data: {
          propertyId: lot.propertyId,
          tenantId,
          ownerUserId: user.id,
          startDate: start,
          endDate: addDays(start, 730),
          scope: { vente: false, gestionLocative: false, garantie: true, suiviApresVente: true },
          notes:
            'Suivi après-vente du lot : garantie de parfait achèvement d’un an et garantie biennale des équipements.',
          isActive: true,
          createdAt: start
        }
      });
      mandates += 1;
    }
  }
  void adminUserId;
  log(`promoteur-commercial : ${created} acquéreurs enregistrés comme clients, ${mandates} suivis de garantie.`);
}

/** Acte de vente notarié du lot (PDF réel) dans les documents du bien. */
async function seedDeedDocuments(
  env: PEnv,
  sold: Array<{ unit: LotUnit; buyer: BuyerPlan; plan: AgreementPlan }>
): Promise<void> {
  const { ctx, log } = env;
  const state = { ctx } as unknown as PatState;
  let n = 0;
  for (const s of sold) {
    if (!s.unit.propertyId || !s.plan.deedDate) continue;
    const facts = {
      title: `${s.unit.spec.label} — ${PROGRAMS[s.unit.prog].brand}`,
      ref: s.unit.ref,
      type: s.unit.spec.type,
      address: `${PROGRAMS[s.unit.prog].brand}, ${PROGRAMS[s.unit.prog].place}`,
      zone: PROGRAMS[s.unit.prog].zone,
      surface: s.unit.surface
    };
    const content = notarialDeed(
      facts,
      `${s.buyer.first} ${s.buyer.last}`,
      s.plan.price,
      s.plan.deedDate,
      s.plan.notary
    );
    const res = await putPropertyDoc(
      state,
      { id: s.unit.propertyId },
      {
        type: 'NOTARIAL_DEED',
        fileName: `Acte de vente ${s.unit.ref}.pdf`,
        createdAt: s.plan.deedDate,
        content
      }
    );
    if (res.created) n += 1;
  }
  log(`promoteur-commercial : ${n} actes de vente notariés écrits.`);
}
