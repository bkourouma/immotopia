/**
 * CRM du promoteur « 3 ans » : fiches contact (acquéreurs, investisseurs de la
 * diaspora, prospects chauds et froids, notaires, banquiers, partenaires,
 * archivés), étiquettes, notes, recherches enregistrées, relances du calendrier,
 * affaires de prospects (six étapes) et visites.
 *
 * Les acquéreurs d'une vente sont créés par `promoteur-commercial-ventes.ts` avec
 * la même fabrique (`createContact`) : un seul endroit pour les fiches.
 * `updatedAt` est posé explicitement : le tableau de bord CRM lit la date de
 * dernière modification pour « convertis » et « gagnés ce mois-ci ».
 */
import type { Prisma } from '@prisma/client';
import { between, pick } from './types';
import { ZONES, ivorianPhone, randomPerson, slugify, COMPANY_NAMES } from './agence-data';
import { FEMALE_FIRST_NAMES, PROFESSIONS, addDays, roundTo } from './agence-commercial-data';
import {
  CONTACT_NOTES_PROMOTEUR,
  DEAL_NOTES_PROMOTEUR,
  DIASPORA_CITIES,
  FOLLOW_UPS_PROMOTEUR,
  LOST_REASONS_PROMOTEUR,
  PRO_CONTACTS,
  PROGRAMS,
  PROPERTY_NOTES_PROMOTEUR,
  SAVED_SEARCHES_PROMOTEUR,
  SOURCES,
  TAG_DEFS_PROMOTEUR,
  buyTraces
} from './promoteur-commercial-data';
import type { PEnv, ProContact, ProgCode } from './promoteur-commercial-data';
import type { LotUnit } from './promoteur-commercial-biens';

export type ContactKind = 'BUYER' | 'PROSPECT' | 'COLD' | 'PRO' | 'ARCHIVED' | 'RENTER';

export interface ContactRef {
  id: string;
  first: string;
  last: string;
  email: string;
  phone: string;
  createdAt: Date;
  kind: ContactKind;
  status: 'LEAD' | 'ACTIVE_CLIENT' | 'ARCHIVED';
  diaspora: boolean;
  profession: string | null;
  proKind?: ProContact['kind'];
  maturity: 'COLD' | 'WARM' | 'HOT';
  score: number;
  leadSource: string;
  interest?: ProgCode;
  leadAssigned: string;
  /** Programme de l'acquéreur, pour l'étiquette. */
  boughtIn?: ProgCode[];
  referral: boolean;
}

export interface ContactOpts {
  kind: ContactKind;
  createdAt: Date;
  status?: 'LEAD' | 'ACTIVE_CLIENT' | 'ARCHIVED';
  /** Date de conversion en client : devient `updatedAt` de la fiche. */
  convertedAt?: Date | null;
  lastInteractionAt?: Date | null;
  diaspora?: boolean;
  company?: boolean;
  maturity?: 'COLD' | 'WARM' | 'HOT';
  budget?: number;
  interest?: ProgCode;
  pro?: ProContact;
  assigned?: string;
  person?: { first: string; last: string };
  role?: 'ACQUEREUR' | 'LOCATAIRE' | null;
  nextActionAt?: Date | null;
}

const CHANNELS = ['WHATSAPP', 'WHATSAPP', 'CALL', 'EMAIL', 'SMS'] as const;
const CONSENT_SOURCES = [
  'Formulaire du bureau de vente',
  'Site du programme',
  'Échange WhatsApp',
  'Salon de l’immobilier'
];
const NATIONALITIES = [
  'Ivoirienne',
  'Ivoirienne',
  'Ivoirienne',
  'Ivoirienne',
  'Burkinabè',
  'Française',
  'Malienne',
  'Libanaise'
];
const DIASPORA_EMPLOYERS = [
  'Société Générale (Paris)',
  'Orange Business Services',
  'Hôpital Lariboisière',
  'Cabinet Deloitte',
  'Air France',
  'Banque Nationale de Belgique',
  'Hydro-Québec'
];

let counter = 12_000;

export function resetContactCounter(base = 12_000): void {
  counter = base;
}

export async function createContact(env: PEnv, o: ContactOpts): Promise<ContactRef> {
  const { prisma, tenantId, rng, staff, tag, ctx } = env;
  counter += 1;
  const drawn = o.person || o.pro ? null : randomPerson(rng);
  const person: { first: string; last: string } =
    o.person ?? (o.pro ? { first: o.pro.first, last: o.pro.last } : { first: drawn!.firstName, last: drawn!.lastName });
  const diaspora = o.diaspora ?? false;
  const dia = diaspora ? pick(rng, DIASPORA_CITIES) : null;
  const company = o.company ?? false;
  const spec = pick(rng, PROFESSIONS);
  const female = FEMALE_FIRST_NAMES.has(person.first);
  const phone = o.pro
    ? o.pro.phone
    : dia
      ? `${dia.prefix} ${between(rng, 10, 99)} ${between(rng, 10, 99)} ${between(rng, 10, 99)} ${between(rng, 10, 99)}`
      : ivorianPhone(rng);
  const email = `${slugify(person.first)}.${slugify(person.last)}.${counter}.${tag}@example.ci`;
  const src = o.pro ? { label: 'Réseau professionnel du promoteur', enum: 'REFERRAL' as const } : pick(rng, SOURCES);
  const status = o.status ?? (o.kind === 'ARCHIVED' ? 'ARCHIVED' : o.kind === 'BUYER' ? 'ACTIVE_CLIENT' : 'LEAD');
  const maturity =
    o.maturity ??
    (o.kind === 'BUYER'
      ? 'HOT'
      : o.kind === 'COLD' || o.kind === 'ARCHIVED'
        ? 'COLD'
        : pick(rng, ['WARM', 'HOT', 'WARM'] as const));
  const score = o.pro
    ? between(rng, 45, 80)
    : o.kind === 'BUYER'
      ? between(rng, 78, 98)
      : maturity === 'HOT'
        ? between(rng, 65, 95)
        : maturity === 'WARM'
          ? between(rng, 40, 70)
          : between(rng, 8, 42);
  const assigned = o.assigned ?? pick(rng, staff);
  const income = roundTo(between(rng, spec.incomeMin, spec.incomeMax) * (diaspora ? 2.4 : 1), 25_000);
  const consentEmail = o.kind !== 'ARCHIVED' && rng() < 0.74;
  const consentWhatsapp = o.kind !== 'ARCHIVED' && rng() < 0.8;
  const lastInteraction = o.lastInteractionAt ?? o.createdAt;
  const updatedAt = status === 'ACTIVE_CLIENT' && o.convertedAt ? o.convertedAt : lastInteraction;
  const zone = diaspora ? dia!.city : pick(rng, ZONES).name;
  const budget = o.budget ?? roundTo(income * between(rng, 60, 140), 1_000_000);

  const data: Prisma.CrmContactUncheckedCreateInput = {
    tenantId,
    contactType: company ? 'COMPANY' : 'PERSON',
    civility: company ? null : female ? pick(rng, ['MRS', 'MS'] as const) : 'MR',
    firstName: person.first,
    lastName: person.last,
    legalName: company ? `${pick(rng, ['SARL', 'SA', 'SAS'])} ${pick(rng, COMPANY_NAMES)}` : null,
    representativeName: company ? `${person.first} ${person.last}` : null,
    representativeRole: company ? 'Gérant' : null,
    email,
    phonePrimary: phone,
    whatsappNumber: phone,
    address: o.pro
      ? o.pro.employer
      : dia
        ? `${between(rng, 3, 120)} rue de la République, ${dia.city}`
        : `${between(rng, 1, 90)} ${pick(rng, ['Rue', 'Avenue', 'Boulevard'])} ${person.last}, ${zone}`,
    city: dia ? dia.city : 'Abidjan',
    country: dia ? dia.country : "Côte d'Ivoire",
    locationZone: zone,
    preferredLanguage: 'fr',
    preferredContactChannel: pick(rng, CHANNELS),
    source: src.label,
    leadSource: src.enum,
    maturityLevel: maturity,
    score,
    responsivenessRate: between(rng, 35, 98),
    lastInteractionAt: lastInteraction,
    nextActionAt: o.nextActionAt ?? null,
    status,
    assignedToUserId: assigned,
    priorityLevel: maturity === 'HOT' && status === 'LEAD' ? 'HIGH' : o.kind === 'ARCHIVED' ? 'LOW' : 'NORMAL',
    consentEmail,
    consentMarketing: consentEmail && rng() < 0.85,
    consentWhatsapp,
    consentDate: consentEmail || consentWhatsapp ? addDays(o.createdAt, between(rng, 0, 3)) : null,
    consentSource: consentEmail || consentWhatsapp ? pick(rng, CONSENT_SOURCES) : null,
    profession: o.pro ? o.pro.profession : company ? 'Gérant' : spec.profession,
    sectorOfActivity: o.pro
      ? o.pro.kind === 'BANKER'
        ? 'Banque et finance'
        : o.pro.kind === 'NOTARY'
          ? 'Juridique'
          : 'Immobilier et construction'
      : spec.sector,
    employer: o.pro ? o.pro.employer : diaspora ? pick(rng, DIASPORA_EMPLOYERS) : pick(rng, spec.employers),
    jobStability: o.pro ? 'FREELANCE' : spec.stability,
    createdAt: o.createdAt,
    updatedAt
  };
  if (!o.pro && !company) {
    Object.assign(data, {
      nationality: pick(rng, NATIONALITIES),
      dateOfBirth: new Date(Date.UTC(between(rng, 1960, 1998), between(rng, 0, 11), between(rng, 1, 28))),
      identityDocumentType: pick(rng, ['CNI', 'CNI', 'PASSPORT'] as const),
      identityDocumentNumber: `CI${between(rng, 10, 99)}${String(between(rng, 0, 9999999)).padStart(7, '0')}`,
      identityDocumentExpiry: addDays(ctx.end, between(rng, 120, 2400)),
      incomeMin: Math.round(income * 0.9),
      incomeMax: Math.round(income * 1.1),
      borrowingCapacity: income >= 900_000 ? 'YES' : income >= 450_000 ? pick(rng, ['YES', 'UNKNOWN'] as const) : 'NO'
    });
  }
  if (o.kind === 'PROSPECT' || o.kind === 'COLD' || o.kind === 'BUYER') {
    const interest = o.interest ?? pick(rng, ['COC', 'ORC', 'ANG', 'VAL'] as const);
    data.projectIntentJson = {
      transaction: 'ACHAT',
      propertyTypes: [pick(rng, ['APPARTEMENT', 'APPARTEMENT', 'MAISON_VILLA', 'DUPLEX_TRIPLEX'])],
      budgetMax: budget,
      rooms: between(rng, 2, 5),
      zones: [PROGRAMS[interest].zone],
      timeline: pick(rng, ['Immédiat', 'Sous 3 mois', 'Sous 6 mois', 'Dans l’année']),
      programme: PROGRAMS[interest].brand
    };
  }
  if (rng() < 0.3) data.internalNotes = pick(rng, CONTACT_NOTES_PROMOTEUR);

  const row = await prisma.crmContact.create({ data, select: { id: true } });
  const role =
    o.role === undefined ? (o.kind === 'BUYER' ? 'ACQUEREUR' : o.kind === 'RENTER' ? 'LOCATAIRE' : null) : o.role;
  if (role) {
    await prisma.crmContactRole.create({
      data: {
        tenantId,
        contactId: row.id,
        role,
        active: o.kind !== 'ARCHIVED',
        startedAt: o.createdAt,
        createdAt: o.createdAt
      }
    });
  }
  return {
    id: row.id,
    first: person.first,
    last: person.last,
    email,
    phone,
    createdAt: o.createdAt,
    kind: o.kind,
    status,
    diaspora,
    profession: data.profession as string | null,
    proKind: o.pro?.kind,
    maturity,
    score,
    leadSource: src.enum,
    interest: o.interest,
    leadAssigned: assigned,
    referral: src.enum === 'REFERRAL'
  };
}

/** Après les activités : dernière interaction et, sans conversion, `updatedAt` aligné dessus (jamais « maintenant »). */
export async function finalizeContact(
  env: PEnv,
  contactId: string,
  lastInteractionAt: Date,
  opts: { updatedAt?: Date; nextActionAt?: Date | null } = {}
): Promise<void> {
  await env.prisma.crmContact.update({
    where: { id: contactId },
    data: {
      lastInteractionAt,
      ...(opts.nextActionAt !== undefined ? { nextActionAt: opts.nextActionAt } : {}),
      updatedAt: opts.updatedAt ?? lastInteractionAt
    }
  });
}

function randomTime(env: PEnv, day: Date, from = 9, to = 17): Date {
  const d = new Date(day.getTime());
  d.setHours(between(env.rng, from, to), pick(env.rng, [0, 15, 30, 45]), 0, 0);
  return d;
}

/** Activités d'une affaire : fil de relation daté entre `from` et `to`, jamais au-delà de maintenant. */
export async function addDealActivities(
  env: PEnv,
  p: {
    contactId: string;
    dealId: string;
    lot: LotUnit;
    from: Date;
    to: Date;
    count: number;
    open: boolean;
    userId: string;
    outcome?: string;
  }
): Promise<Date> {
  const { prisma, tenantId, ctx, rng } = env;
  const pool = buyTraces(PROGRAMS[p.lot.prog].brand, p.lot.lotName ? p.lot.lotName.replace(/^Lot\s+/, '') : p.lot.ref);
  const n = Math.max(1, Math.min(pool.length, p.count));
  const end = p.to > ctx.end ? addDays(ctx.end, -1) : p.to;
  const span = Math.max(1, Math.floor((end.getTime() - p.from.getTime()) / 86_400_000));
  let last = p.from;
  for (let i = 0; i < n; i++) {
    const day = addDays(p.from, Math.floor((span * (i + 0.5)) / n));
    last = randomTime(env, day > end ? end : day);
    if (last > ctx.end) last = addDays(ctx.end, -1);
    await prisma.crmActivity.create({
      data: {
        tenantId,
        contactId: p.contactId,
        dealId: p.dealId,
        activityType: pool[i].type,
        direction: i % 2 === 0 ? 'IN' : 'OUT',
        subject: pool[i].subject,
        content: pool[i].content,
        outcome: i === n - 1 ? (p.open ? 'En attente de retour du client' : (p.outcome ?? 'Clôturé')) : null,
        occurredAt: last,
        createdByUserId: p.userId,
        createdAt: last
      }
    });
  }
  void rng;
  return last;
}

export interface VisitInput {
  propertyId: string;
  contactId: string;
  dealId: string | null;
  at: Date;
  status: 'SCHEDULED' | 'CONFIRMED' | 'DONE' | 'NO_SHOW' | 'CANCELED';
  userId: string;
  location: string;
  appointment?: boolean;
  goal?: 'CONTACT_TAKING' | 'EVALUATION' | 'NEGOTIATION' | 'FOLLOW_UP' | 'CONTRACT_SIGNING';
  notes?: string;
}

export async function createVisit(env: PEnv, v: VisitInput): Promise<void> {
  const { prisma, tenantId, rng, ctx } = env;
  const createdAt = new Date(Math.min(addDays(v.at, -between(rng, 1, 6)).getTime(), ctx.end.getTime()));
  await prisma.propertyVisit.create({
    data: {
      propertyId: v.propertyId,
      tenantId,
      contactId: v.contactId,
      dealId: v.dealId,
      visitType: v.appointment ? 'APPOINTMENT' : 'VISIT',
      goal: v.goal ?? pick(rng, ['CONTACT_TAKING', 'EVALUATION', 'NEGOTIATION', 'FOLLOW_UP'] as const),
      scheduledAt: v.at,
      duration: v.appointment ? 90 : pick(rng, [30, 45, 60]),
      location: v.location,
      status: v.status,
      assignedToUserId: v.userId,
      notes:
        v.notes ??
        (v.status === 'DONE'
          ? 'Visite effectuée, le client a apprécié les prestations ; retour écrit à recueillir.'
          : v.status === 'NO_SHOW'
            ? 'Le visiteur ne s’est pas présenté, rappel prévu.'
            : v.status === 'CANCELED'
              ? 'Annulée par le visiteur, à reprogrammer.'
              : 'Rendez-vous confirmé par téléphone.'),
      createdAt,
      updatedAt: v.status === 'DONE' || v.status === 'NO_SHOW' ? v.at : createdAt
    }
  });
}

// ───────────────────────────────────────────────────────── contacts hors ventes

/** Notaires, banquiers et partenaires du réseau du promoteur. */
export async function seedProfessionalContacts(env: PEnv): Promise<ContactRef[]> {
  const out: ContactRef[] = [];
  const { ctx, rng } = env;
  for (const pro of PRO_CONTACTS) {
    const createdAt = addDays(ctx.start, between(rng, 10, 420));
    out.push(
      await createContact(env, {
        kind: 'PRO',
        createdAt,
        status: 'ACTIVE_CLIENT',
        convertedAt: addDays(createdAt, between(rng, 5, 30)),
        pro,
        maturity: 'WARM',
        lastInteractionAt: addDays(ctx.end, -between(rng, 2, 120))
      })
    );
  }
  return out;
}

/** Prospects froids et contacts archivés : sans affaire, répartis sur l'historique. */
export async function seedColdAndArchived(env: PEnv): Promise<ContactRef[]> {
  const { ctx, rng } = env;
  const out: ContactRef[] = [];
  for (let i = 0; i < 14; i++) {
    const createdAt = addDays(ctx.start, between(rng, 40, 1000));
    const last = addDays(createdAt, between(rng, 0, 30));
    out.push(
      await createContact(env, {
        kind: 'COLD',
        createdAt,
        diaspora: rng() < 0.3,
        lastInteractionAt: last > addDays(ctx.end, -2) ? addDays(ctx.end, -40) : last
      })
    );
  }
  for (let i = 0; i < 9; i++) {
    const createdAt = addDays(ctx.start, between(rng, 20, 700));
    out.push(
      await createContact(env, {
        kind: 'ARCHIVED',
        createdAt,
        lastInteractionAt: addDays(createdAt, between(rng, 5, 90)),
        diaspora: rng() < 0.2
      })
    );
  }
  return out;
}

// ───────────────────────────────────────────────────────── affaires des prospects

const OPEN_STAGES = ['NEW', 'QUALIFIED', 'VISIT', 'NEGOTIATION'] as const;

/**
 * Prospects chauds et tièdes avec une affaire ouverte (étapes NEW à NEGOTIATION)
 * liée à des lots encore à vendre, plus quelques affaires perdues sans offre.
 */
export async function seedProspectDeals(env: PEnv, units: LotUnit[]): Promise<ContactRef[]> {
  const { prisma, tenantId, ctx, rng } = env;
  const out: ContactRef[] = [];
  const sellable = units.filter(
    u =>
      u.propertyId &&
      ['AVAILABLE', 'OPEN_OFFERS', 'LOST_OFFERS', 'CANCELLED_AVAILABLE'].includes(u.state) &&
      !u.ref.includes('-P')
  );
  if (sellable.length === 0) return out;

  const makeDeal = async (
    contact: ContactRef,
    stage: 'NEW' | 'QUALIFIED' | 'VISIT' | 'NEGOTIATION' | 'LOST',
    createdAt: Date,
    lots: LotUnit[],
    closedAt: Date | null
  ): Promise<void> => {
    const main = lots[0];
    const value = main.price;
    const traceTo = closedAt ?? addDays(ctx.end, -1);
    const user = contact.leadAssigned;
    const deal = await prisma.crmDeal.create({
      data: {
        tenantId,
        contactId: contact.id,
        type: 'ACHAT',
        stage,
        budgetMin: Math.round(value * 0.85),
        budgetMax: Math.round(value * 1.1),
        locationZone: PROGRAMS[main.prog].zone,
        expectedValue: value,
        probability: { NEW: 0.15, QUALIFIED: 0.35, VISIT: 0.55, NEGOTIATION: 0.75, LOST: 0 }[stage],
        assignedToUserId: user,
        closedReason: stage === 'LOST' ? pick(rng, LOST_REASONS_PROMOTEUR) : null,
        closedAt: stage === 'LOST' ? closedAt : null,
        createdAt,
        updatedAt: stage === 'LOST' ? (closedAt ?? createdAt) : traceTo
      },
      select: { id: true }
    });
    for (const [i, lot] of lots.entries()) {
      await prisma.crmDealProperty.create({
        data: {
          tenantId,
          dealId: deal.id,
          propertyId: lot.propertyId as string,
          matchScore: between(rng, 58, 96),
          status:
            stage === 'LOST'
              ? 'REJECTED'
              : stage === 'NEW'
                ? 'SHORTLISTED'
                : stage === 'QUALIFIED'
                  ? 'PROPOSED'
                  : i === 0
                    ? 'VISITED'
                    : 'PROPOSED',
          createdAt
        }
      });
    }
    const traceCount =
      stage === 'NEW' ? 1 : stage === 'QUALIFIED' ? 2 : stage === 'VISIT' ? 3 : stage === 'NEGOTIATION' ? 5 : 3;
    const last = await addDealActivities(env, {
      contactId: contact.id,
      dealId: deal.id,
      lot: main,
      from: createdAt,
      to: traceTo,
      count: traceCount,
      open: stage !== 'LOST',
      userId: user,
      outcome: 'Affaire perdue'
    });
    // Visite sur plan : faite pour VISIT et NEGOTIATION, programmée à venir pour une partie des VISIT.
    const site = `Bureau de vente — ${PROGRAMS[main.prog].brand}`;
    if (stage === 'VISIT' || stage === 'NEGOTIATION') {
      await createVisit(env, {
        propertyId: main.propertyId as string,
        contactId: contact.id,
        dealId: deal.id,
        at: randomTime(env, addDays(ctx.end, -between(rng, 3, 25))),
        status: 'DONE',
        userId: user,
        location: site
      });
      if (stage === 'VISIT') {
        await createVisit(env, {
          propertyId: main.propertyId as string,
          contactId: contact.id,
          dealId: deal.id,
          at: randomTime(env, addDays(ctx.end, between(rng, 1, 14))),
          status: rng() < 0.5 ? 'CONFIRMED' : 'SCHEDULED',
          userId: user,
          location: site,
          goal: 'NEGOTIATION'
        });
      }
    } else if (stage === 'LOST' && rng() < 0.5) {
      await createVisit(env, {
        propertyId: main.propertyId as string,
        contactId: contact.id,
        dealId: deal.id,
        at: randomTime(env, addDays(createdAt, between(rng, 3, 9))),
        status: rng() < 0.7 ? 'DONE' : 'NO_SHOW',
        userId: user,
        location: site
      });
    }
    await finalizeContact(env, contact.id, last, {
      updatedAt: stage === 'LOST' ? (closedAt ?? last) : last
    });
  };

  // 22 affaires ouvertes, récentes, étapes alternées.
  for (let i = 0; i < 22; i++) {
    const stage = OPEN_STAGES[i % OPEN_STAGES.length];
    // Les affaires NEW sont toutes de la semaine : le tableau de bord CRM compte les nouveaux prospects sur 7 jours.
    const createdAt = addDays(ctx.end, stage === 'NEW' ? -between(rng, 0, 5) : -between(rng, 6, 75));
    const lot = pick(rng, sellable);
    const second = rng() < 0.4 ? pick(rng, sellable) : null;
    const lots = second && second !== lot && second.prog === lot.prog ? [lot, second] : [lot];
    const contact = await createContact(env, {
      kind: 'PROSPECT',
      createdAt: addDays(createdAt, stage === 'NEW' ? -between(rng, 0, 1) : -between(rng, 1, 6)),
      diaspora: i % 4 === 1,
      interest: lot.prog,
      budget: roundTo((lot.price * between(rng, 90, 115)) / 100, 1_000_000),
      maturity: stage === 'NEGOTIATION' || stage === 'VISIT' ? 'HOT' : stage === 'NEW' ? 'COLD' : 'WARM'
    });
    await makeDeal(contact, stage, createdAt, lots, null);
    out.push(contact);
  }
  // Affaires perdues sans offre : réparties sur 30 mois.
  for (let i = 0; i < 12; i++) {
    const lot = pick(rng, sellable);
    const createdAt = addDays(ctx.start, between(rng, 90, 900));
    const closedAt = addDays(createdAt, between(rng, 12, 60));
    const contact = await createContact(env, {
      kind: 'PROSPECT',
      createdAt: addDays(createdAt, -between(rng, 1, 5)),
      diaspora: i % 5 === 0,
      interest: lot.prog,
      maturity: 'COLD',
      lastInteractionAt: closedAt
    });
    await makeDeal(contact, 'LOST', createdAt, [lot], closedAt);
    out.push(contact);
  }
  return out;
}

// ───────────────────────────────────────────────────────── étiquettes, notes, recherches, relances

export async function seedCrmTags(env: PEnv, contacts: ContactRef[]): Promise<void> {
  const { prisma, tenantId, rng, log } = env;
  const names = new Set(TAG_DEFS_PROMOTEUR.map(t => t.name));
  const existing = await prisma.crmTag.findMany({
    where: { tenantId, name: { in: [...names] } },
    select: { id: true, name: true }
  });
  if (existing.length > 0) {
    log('promoteur-commercial : étiquettes déjà présentes.');
    return;
  }
  const tags = new Map<string, string>();
  for (const def of TAG_DEFS_PROMOTEUR) {
    const t = await prisma.crmTag.create({
      data: { tenantId, name: def.name, color: def.color },
      select: { id: true }
    });
    tags.set(def.name, t.id);
  }
  const brandTag: Record<ProgCode, string> = {
    COC: 'Acquéreur Les Cocotiers',
    ORC: 'Acquéreur Les Orchidées',
    ANG: 'Acquéreur Les Jardins d’Angré',
    VAL: 'Réservataire Domaine des Vallons'
  };
  const rows: { contactId: string; tagId: string; createdAt: Date }[] = [];
  for (const c of contacts) {
    const wanted = new Set<string>();
    if (c.kind === 'PRO') {
      wanted.add(c.proKind === 'NOTARY' ? 'Notaire' : c.proKind === 'BANKER' ? 'Banquier' : 'Partenaire');
      if (c.profession?.includes('Courti') || c.profession?.includes('investissement'))
        wanted.add('Apporteur d’affaires');
    } else {
      if (c.diaspora) wanted.add('Diaspora');
      if (c.score >= 90) wanted.add('VIP');
      if (c.referral) wanted.add('Apporteur d’affaires');
      for (const p of c.boughtIn ?? []) wanted.add(brandTag[p]);
      if (c.kind === 'BUYER' && (c.boughtIn?.length ?? 0) > 1) wanted.add('Investisseur');
      if (c.status === 'LEAD' && c.maturity === 'HOT') wanted.add('À relancer');
      if (c.status === 'LEAD') {
        const r = rng();
        if (r < 0.28) wanted.add('Primo-accédant');
        else if (r < 0.46) wanted.add('Investisseur');
        else if (r < 0.58) wanted.add('Financement validé');
      }
      if (c.kind === 'BUYER' && rng() < 0.35) wanted.add('Financement validé');
      if (c.interest === 'VAL' && c.status === 'LEAD' && rng() < 0.5) wanted.add(brandTag.VAL);
    }
    for (const name of wanted) {
      const tagId = tags.get(name);
      if (tagId) rows.push({ contactId: c.id, tagId, createdAt: addDays(c.createdAt, between(rng, 1, 40)) });
    }
  }
  await prisma.crmContactTag.createMany({ data: rows, skipDuplicates: true });
  log(`promoteur-commercial : ${tags.size} étiquettes, ${rows.length} poses.`);
}

export async function seedCrmNotes(env: PEnv, contacts: ContactRef[], units: LotUnit[]): Promise<void> {
  const { prisma, tenantId, rng, ctx, staff, log } = env;
  const deals = await prisma.crmDeal.findMany({
    where: { tenantId, contactId: { in: contacts.map(c => c.id) } },
    select: { id: true, createdAt: true }
  });
  if ((await prisma.crmNote.count({ where: { tenantId, crmContactId: { in: contacts.map(c => c.id) } } })) > 0) return;
  const stamp = (from: Date): Date => {
    const t = addDays(from, between(rng, 1, 90));
    return t > ctx.end ? addDays(ctx.end, -between(rng, 0, 20)) : t;
  };
  const data: Prisma.CrmNoteUncheckedCreateInput[] = [];
  for (const c of contacts) {
    if (rng() > 0.5) continue;
    for (let i = 0; i < between(rng, 1, 3); i++) {
      data.push({
        tenantId,
        entityType: 'CONTACT',
        entityId: c.id,
        crmContactId: c.id,
        content: pick(rng, CONTACT_NOTES_PROMOTEUR),
        createdByUserId: pick(rng, staff),
        createdAt: stamp(c.createdAt)
      });
    }
  }
  for (const d of deals) {
    if (rng() > 0.55) continue;
    data.push({
      tenantId,
      entityType: 'DEAL',
      entityId: d.id,
      crmDealId: d.id,
      content: pick(rng, DEAL_NOTES_PROMOTEUR),
      createdByUserId: pick(rng, staff),
      createdAt: stamp(d.createdAt)
    });
  }
  for (const u of units) {
    if (!u.propertyId || rng() > 0.2) continue;
    data.push({
      tenantId,
      entityType: 'PROPERTY',
      entityId: u.propertyId,
      content: pick(rng, PROPERTY_NOTES_PROMOTEUR),
      createdByUserId: pick(rng, staff),
      createdAt: stamp(u.launchedAt)
    });
  }
  await prisma.crmNote.createMany({ data });
  log(`promoteur-commercial : ${data.length} notes CRM.`);
}

export async function seedCrmSavedSearches(env: PEnv): Promise<void> {
  const { prisma, tenantId, rng, ctx, staff, log } = env;
  const names = SAVED_SEARCHES_PROMOTEUR.map(s => s.name);
  if ((await prisma.savedContactSearch.count({ where: { tenantId, name: { in: names } } })) > 0) return;
  const tags = await prisma.crmTag.findMany({ where: { tenantId }, select: { id: true, name: true } });
  const diaspora = tags.find(t => t.name === 'Diaspora')?.id;
  let i = 0;
  for (const def of SAVED_SEARCHES_PROMOTEUR) {
    const filters = JSON.parse(JSON.stringify(def.filters), (_k, v) => {
      if (v === '__DAYS_30__') return addDays(ctx.end, -30).toISOString();
      if (v === '__DAYS_90__') return addDays(ctx.end, -90).toISOString();
      if (v === '__TAG_DIASPORA__') return diaspora ?? 'diaspora';
      return v;
    }) as Prisma.InputJsonValue;
    await prisma.savedContactSearch.create({
      data: {
        tenantId,
        name: def.name,
        description: def.description,
        filters,
        scope: def.scope,
        createdById: staff[i % staff.length],
        useCount: def.uses,
        lastUsedAt: addDays(ctx.end, -between(rng, 0, 30)),
        createdAt: addDays(ctx.end, -between(rng, 60, 800))
      }
    });
    i += 1;
  }
  log(`promoteur-commercial : ${SAVED_SEARCHES_PROMOTEUR.length} recherches enregistrées.`);
}

/** Relances, tâches et rendez-vous du calendrier CRM : échéances passées (en retard) et à venir. */
export async function seedCrmFollowUps(env: PEnv): Promise<void> {
  const { prisma, tenantId, rng, ctx, staff, log } = env;
  if ((await prisma.crmActivity.count({ where: { tenantId, activityType: 'TASK', nextActionAt: { not: null } } })) > 0)
    return;
  const deals = await prisma.crmDeal.findMany({
    where: { tenantId, stage: { in: ['NEW', 'QUALIFIED', 'VISIT', 'NEGOTIATION'] } },
    select: { id: true, contactId: true, createdAt: true }
  });
  const signed = await prisma.saleAgreement.findMany({
    where: { tenantId, status: { in: ['DRAFT', 'SIGNED'] } },
    select: { offer: { select: { buyerContactId: true, dealId: true } }, expectedDeedDate: true }
  });
  const targets: { contactId: string; dealId: string | null; createdAt: Date; kindIdx?: number; at?: Date }[] = [
    ...deals.map(d => ({ contactId: d.contactId, dealId: d.id, createdAt: d.createdAt })),
    ...signed.map(s => ({
      contactId: s.offer.buyerContactId,
      dealId: s.offer.dealId,
      createdAt: addDays(ctx.end, -20),
      // Les compromis en cours : rendez-vous chez le notaire ou notification d'appel de fonds.
      kindIdx: s.expectedDeedDate ? 5 : 4,
      at: s.expectedDeedDate ?? undefined
    }))
  ];
  let created = 0;
  for (let i = 0; i < targets.length && created < 52; i++) {
    const t = targets[i];
    const fu = FOLLOW_UPS_PROMOTEUR[t.kindIdx ?? i % FOLLOW_UPS_PROMOTEUR.length];
    const overdue = i % 6 === 0;
    const next =
      t.at && t.at > ctx.end
        ? new Date(t.at.getTime())
        : overdue
          ? addDays(ctx.end, -between(rng, 1, 12))
          : addDays(ctx.end, between(rng, 0, 30));
    next.setHours(between(rng, 8, 17), pick(rng, [0, 15, 30, 45]), 0, 0);
    const occurred = addDays(next, -between(rng, 3, 12));
    const when = occurred > ctx.end ? addDays(ctx.end, -1) : occurred;
    await prisma.crmActivity.create({
      data: {
        tenantId,
        contactId: t.contactId,
        dealId: t.dealId,
        activityType: fu.kind === 'MEETING' ? 'MEETING' : 'TASK',
        direction: 'INTERNAL',
        subject: fu.subject,
        content: fu.content,
        occurredAt: when,
        createdByUserId: pick(rng, staff),
        nextActionAt: next,
        nextActionType: fu.type,
        createdAt: when
      }
    });
    created += 1;
  }
  log(`promoteur-commercial : ${created} relances et rendez-vous au calendrier.`);
}

/** Zones recherchées : communes ciblées par les prospects, quand le référentiel est chargé. */
export async function seedCrmTargetZones(env: PEnv, contacts: ContactRef[]): Promise<void> {
  const { prisma, rng, log } = env;
  const communes = await prisma.commune.findMany({
    where: {
      OR: ['Cocody', 'Marcory', 'Bingerville', 'Grand-Bassam', 'Yopougon', 'Plateau'].map(name => ({
        name: { contains: name, mode: 'insensitive' as const }
      }))
    },
    select: { id: true }
  });
  if (communes.length === 0) return;
  const rows: { contactId: string; communeId: string }[] = [];
  for (const c of contacts.filter(x => x.status === 'LEAD' && x.kind !== 'PRO')) {
    const picked = new Set<string>();
    for (let j = 0; j < between(rng, 1, Math.min(3, communes.length)); j++) picked.add(pick(rng, communes).id);
    for (const communeId of picked) rows.push({ contactId: c.id, communeId });
  }
  await prisma.crmContactTargetZone.createMany({ data: rows, skipDuplicates: true });
  log(`promoteur-commercial : ${rows.length} zones recherchées.`);
}
