/**
 * Plan d'historique SYNDIC : construit, EN MÉMOIRE et sans base de données,
 * toutes les lignes d'une copropriété (lots, copropriétaires, budgets, appels,
 * paiements, relances, pénalités, assemblées, fonds, comptabilité, incidents…).
 *
 * `syndic.ts` n'a plus qu'à écrire ce plan. Séparer les deux permet de tester
 * la cohérence (tantièmes = 1 000, comptes équilibrés, soldes de fonds jamais
 * négatifs, compte 450 = compte copropriétaire) sans Postgres.
 *
 * Inspiré de `syndic-demo-seed.ts` / `seed-demo-syndic.ts`, mais :
 *  - aucun identifiant ni date en dur : tout dérive de `tenantId`, `start`, `end` ;
 *  - hasard seedé (`rng`) ;
 *  - aucun fichier écrit (pas de PDF, pas de pièce jointe) ;
 *  - aucun envoi : les relances sont des traces historiques, rien ne part.
 */
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { parsePeriodBounds } from '../../../src/lib/syndics/period';
import { addDays, between, pick, type HistoryProfile } from './types';
import {
  COMMON_ASSETS,
  COMPANY_OWNERS,
  FIRST_NAMES_F,
  FIRST_NAMES_M,
  FIXED_LINES,
  INCIDENT_POOL,
  LAST_NAMES,
  PROFESSIONS,
  SUPPLIERS,
  type CoproDef,
  type LotKind,
  type SupplierDef
} from './syndic-data';

// ───────────────────────────────────────────────────────────── types publics

export interface ProviderRow {
  id: string;
  tenantId: string;
  name: string;
  specialty: string;
  email: string;
  phone: string;
}

export interface CoproPlan {
  name: string;
  syndicate: Prisma.SyndicateUncheckedCreateInput;
  contacts: Prisma.CrmContactCreateManyInput[];
  roles: Prisma.CrmContactRoleCreateManyInput[];
  lots: Prisma.SyndicateLotCreateManyInput[];
  ownerProfiles: Prisma.LotOwnerProfileCreateManyInput[];
  ownerAccounts: Prisma.OwnerAccountCreateManyInput[];
  ownerTransactions: Prisma.OwnerAccountTransactionCreateManyInput[];
  funds: Prisma.SyndicateFundCreateManyInput[];
  fundMovements: Prisma.SyndicateFundMovementCreateManyInput[];
  meetings: Prisma.GeneralMeetingCreateManyInput[];
  agendaItems: Prisma.GMAgendaItemCreateManyInput[];
  resolutions: Prisma.GMResolutionCreateManyInput[];
  votes: Prisma.GMVoteCreateManyInput[];
  proxies: Prisma.GMProxyCreateManyInput[];
  budgets: Prisma.SyndicateBudgetCreateManyInput[];
  budgetLines: Prisma.BudgetLineItemCreateManyInput[];
  budgetAllocations: Prisma.BudgetAllocationCreateManyInput[];
  batches: Prisma.ChargeCallBatchCreateManyInput[];
  calls: Prisma.ChargeCallCreateManyInput[];
  payments: Prisma.ChargePaymentCreateManyInput[];
  allocations: Prisma.ChargePaymentAllocationCreateManyInput[];
  reminders: Prisma.PaymentReminderCreateManyInput[];
  penalties: Prisma.LatePaymentPenaltyCreateManyInput[];
  schedules: Prisma.PaymentScheduleCreateManyInput[];
  instalments: Prisma.PaymentScheduleInstalmentCreateManyInput[];
  reminderConfigs: Prisma.ReminderConfigCreateManyInput[];
  paymentMethods: Prisma.SyndicPaymentMethodCreateManyInput[];
  accounts: Prisma.ChartOfAccountCreateManyInput[];
  /** Comptes parents d'abord (parentAccountId), à insérer en deux temps. */
  accountParentCount: number;
  journals: Prisma.AccountingJournalCreateManyInput[];
  entries: Prisma.JournalEntryCreateManyInput[];
  entryLines: Prisma.JournalEntryLineCreateManyInput[];
  contracts: Prisma.MaintenanceContractCreateManyInput[];
  assets: Prisma.CommonAreaAssetCreateManyInput[];
  invoices: Prisma.SyndicProviderInvoiceCreateManyInput[];
  invoicePayments: Prisma.SyndicProviderPaymentCreateManyInput[];
  incidents: Prisma.SyndicateIncidentCreateManyInput[];
  stats: Record<string, number>;
}

export interface PlanInput {
  def: CoproDef;
  index: number;
  tenantId: string;
  adminUserId: string;
  profile: HistoryProfile;
  start: Date;
  end: Date;
  rng: () => number;
  /** Registre partagé des prestataires du tenant (nom → ligne). */
  providers: Map<string, ProviderRow>;
}

// ───────────────────────────────────────────────────────────────── utilitaires

const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const local = (y: number, m: number, d: number, h = 9, mi = 0) => new Date(y, m, d, h, mi, 0, 0);
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
const ymd = (d: Date) => `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`[syndic-history] ${message}`);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate(), d.getHours(), d.getMinutes(), 0, 0);
}

function shuffle<T>(rng: () => number, items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Behavior = 'punctual' | 'late' | 'partial' | 'chronic';
type Method = 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH' | 'CHECK';
type JournalCode = 'AC' | 'BQ' | 'CA' | 'CH' | 'MM' | 'OD';

const METHOD_TREASURY: Record<Method, { journal: JournalCode; account: string; label: string }> = {
  BANK_TRANSFER: { journal: 'BQ', account: '512', label: 'Virement' },
  CHECK: { journal: 'BQ', account: '512', label: 'Chèque' },
  MOBILE_MONEY: { journal: 'MM', account: '5171', label: 'Mobile Money' },
  CASH: { journal: 'CA', account: '531', label: 'Espèces' }
};

/** Travaux votés en AGE (profil 3 ans), par rang de copropriété. */
const WORKS = [
  {
    title: 'Réfection de l’étanchéité de la terrasse',
    amount: 4_200_000,
    contractor: 'BTP Ivoire Rénovation',
    specialty: 'Gros œuvre et étanchéité'
  },
  {
    title: 'Remplacement de la motorisation de l’ascenseur',
    amount: 14_500_000,
    contractor: 'Ascenseurs Afrique de l’Ouest (AAO)',
    specialty: 'Ascenseurs'
  },
  {
    title: 'Ravalement et peinture des façades',
    amount: 38_000_000,
    contractor: 'Façades & Peinture CI',
    specialty: 'Peinture et ravalement'
  }
];

const MEETING_PLACES = [
  'Salle polyvalente de la résidence',
  'Hall d’entrée de l’immeuble',
  'Salle de conférence de l’hôtel Ivoire (Cocody)'
];

// ─────────────────────────────────────────────────────────────── le plan

export function buildCoproPlan(input: PlanInput): CoproPlan {
  const { def, index, tenantId, adminUserId, profile, start, end, rng, providers } = input;
  const mgmtStart = addDays(start, 0);
  const syndicateId = randomUUID();

  const plan: CoproPlan = {
    name: def.name,
    syndicate: {} as Prisma.SyndicateUncheckedCreateInput,
    contacts: [],
    roles: [],
    lots: [],
    ownerProfiles: [],
    ownerAccounts: [],
    ownerTransactions: [],
    funds: [],
    fundMovements: [],
    meetings: [],
    agendaItems: [],
    resolutions: [],
    votes: [],
    proxies: [],
    budgets: [],
    budgetLines: [],
    budgetAllocations: [],
    batches: [],
    calls: [],
    payments: [],
    allocations: [],
    reminders: [],
    penalties: [],
    schedules: [],
    instalments: [],
    reminderConfigs: [],
    paymentMethods: [],
    accounts: [],
    accountParentCount: 0,
    journals: [],
    entries: [],
    entryLines: [],
    contracts: [],
    assets: [],
    invoices: [],
    invoicePayments: [],
    incidents: [],
    stats: {}
  };

  // ═════════════════════════════════════════════════════ lots & copropriétaires
  type LotDef = {
    id: string;
    num: string;
    kind: LotKind;
    shares: number;
    ownerKey: string;
    ownedSince: Date;
  };
  type OwnerDef = {
    key: string;
    contactId: string;
    name: string;
    email: string;
    channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
    method: Method;
    behavior: Behavior;
    lotIds: string[];
  };

  const rawLots: { num: string; kind: LotKind; weight: number }[] = [];
  const perFloor = Math.max(2, Math.ceil(def.mix.apartments / def.floors));
  for (let i = 0; i < def.mix.apartments; i++) {
    const floor = Math.floor(i / perFloor);
    rawLots.push({ num: `${floor}${pad((i % perFloor) + 1)}`, kind: 'APARTMENT', weight: between(rng, 90, 140) });
  }
  for (let i = 0; i < def.mix.commercial; i++)
    rawLots.push({ num: `C${pad(i + 1)}`, kind: 'COMMERCIAL', weight: between(rng, 180, 260) });
  for (let i = 0; i < def.mix.offices; i++)
    rawLots.push({ num: `B${pad(i + 1)}`, kind: 'OFFICE', weight: between(rng, 150, 220) });
  for (let i = 0; i < def.mix.parkings; i++)
    rawLots.push({ num: `P${pad(i + 1)}`, kind: 'PARKING', weight: between(rng, 18, 30) });
  for (let i = 0; i < def.mix.cellars; i++)
    rawLots.push({ num: `S${pad(i + 1)}`, kind: 'CELLAR', weight: between(rng, 8, 14) });

  const totalWeight = sum(rawLots.map(l => l.weight));
  const shares = rawLots.map(l => Math.floor((l.weight * 1000) / totalWeight));
  shares[0] += 1000 - sum(shares); // reste d'arrondi sur le premier lot
  assert(sum(shares) === 1000, `tantièmes ≠ 1000 pour ${def.name}`);

  // Copropriétaires : un par lot « principal » ; parkings et caves vont à un
  // propriétaire d'appartement (c'est ce qui se passe dans la vie réelle).
  const mainLots = rawLots.filter(l => l.kind !== 'PARKING' && l.kind !== 'CELLAR');
  const owners: OwnerDef[] = [];
  const ownerOfLot = new Map<string, string>();
  const usedNames = new Set<string>();
  let companyIdx = 0;
  mainLots.forEach((l, i) => {
    const key = `o${i + 1}`;
    let company: (typeof COMPANY_OWNERS)[number] | null = null;
    if ((l.kind === 'COMMERCIAL' || l.kind === 'OFFICE') && companyIdx < COMPANY_OWNERS.length) {
      company = COMPANY_OWNERS[(companyIdx++ + index) % COMPANY_OWNERS.length];
    }
    const female = rng() < 0.42;
    let first = pick(rng, female ? FIRST_NAMES_F : FIRST_NAMES_M);
    let last = pick(rng, LAST_NAMES);
    while (usedNames.has(`${first} ${last}`)) {
      first = pick(rng, female ? FIRST_NAMES_F : FIRST_NAMES_M);
      last = pick(rng, LAST_NAMES);
    }
    usedNames.add(`${first} ${last}`);
    const channelRoll = rng();
    const methodRoll = rng();
    owners.push({
      key,
      contactId: randomUUID(),
      name: company ? company.legalName : `${first} ${last}`,
      email: `${slug(first)}.${slug(last)}.c${index + 1}-${pad(i + 1)}@copropriete.test`,
      channel: channelRoll < 0.5 ? 'EMAIL' : channelRoll < 0.8 ? 'WHATSAPP' : 'SMS',
      method:
        methodRoll < 0.35 ? 'MOBILE_MONEY' : methodRoll < 0.7 ? 'BANK_TRANSFER' : methodRoll < 0.85 ? 'CASH' : 'CHECK',
      behavior: 'punctual',
      lotIds: []
    });
    // ligne contact
    plan.contacts.push({
      id: owners[i].contactId,
      tenantId,
      contactType: company ? 'COMPANY' : 'PERSON',
      civility: company ? null : female ? 'MRS' : 'MR',
      firstName: company ? company.rep.replace(/^(Mme|M\.|Dr)\s+/, '').split(' ')[0] : first,
      lastName: company ? company.rep.split(' ').slice(-1)[0] : last,
      legalName: company?.legalName ?? null,
      legalForm: null,
      representativeName: company?.rep ?? null,
      representativeRole: company ? 'Gérant' : null,
      email: owners[i].email,
      phonePrimary: `+225 0${pick(rng, [1, 5, 7])} ${pad(between(rng, 0, 99))} ${pad(between(rng, 0, 99))} ${pad(between(rng, 0, 99))} ${pad(between(rng, 0, 99))}`,
      whatsappNumber: null,
      city: 'Abidjan',
      country: "Côte d'Ivoire",
      nationality: company ? null : 'Ivoirienne',
      profession: company ? null : pick(rng, PROFESSIONS),
      preferredLanguage: 'fr',
      preferredContactChannel: owners[i].channel,
      status: 'ACTIVE_CLIENT',
      source: 'Syndic de copropriété',
      internalNotes: '[seed:pack-history:syndic]'
    } as Prisma.CrmContactCreateManyInput);
  });
  // whatsapp : le numéro principal sert aussi de numéro WhatsApp
  plan.contacts.forEach((c, i) => {
    if (owners[i].channel === 'WHATSAPP') c.whatsappNumber = c.phonePrimary ?? null;
  });
  const apartmentOwners = owners.filter((_, i) => mainLots[i].kind === 'APARTMENT');
  const ownerKeyByMainLot = new Map(mainLots.map((l, i) => [l.num, owners[i].key]));
  let annexIdx = 0;
  const shuffledAptOwners = shuffle(rng, apartmentOwners);

  const lotDefs: LotDef[] = rawLots.map((l, i) => {
    let ownerKey = ownerKeyByMainLot.get(l.num);
    if (!ownerKey) ownerKey = shuffledAptOwners[annexIdx++ % shuffledAptOwners.length].key;
    const ownedSince = addDays(mgmtStart, -between(rng, 200, 2500));
    return { id: randomUUID(), num: l.num, kind: l.kind, shares: shares[i], ownerKey, ownedSince };
  });
  const ownerByKey = new Map(owners.map(o => [o.key, o]));
  for (const l of lotDefs) {
    ownerByKey.get(l.ownerKey)!.lotIds.push(l.id);
    ownerOfLot.set(l.id, l.ownerKey);
  }
  const lotById = new Map(lotDefs.map(l => [l.id, l]));

  // Comportement de paiement : au moins un chronique et un partiel par copropriété.
  const order = shuffle(rng, owners);
  const nChronic = Math.max(1, Math.round(owners.length * 0.08));
  const nPartial = Math.max(1, Math.round(owners.length * 0.08));
  const nLate = Math.max(2, Math.round(owners.length * 0.25));
  order.forEach((o, i) => {
    o.behavior =
      i < nChronic
        ? 'chronic'
        : i < nChronic + nPartial
          ? 'partial'
          : i < nChronic + nPartial + nLate
            ? 'late'
            : 'punctual';
  });

  const president = owners[0];
  plan.syndicate = {
    id: syndicateId,
    tenantId,
    name: def.name,
    registrationNo: def.registrationNo,
    fiscalYear: end.getFullYear(),
    syndicManagerId: president.contactId,
    address: def.address,
    cadastralReference: def.cadastralReference,
    totalLots: rawLots.length,
    totalBuildings: 1,
    status: 'ACTIVE',
    createdAt: mgmtStart
  };

  for (const o of owners) {
    plan.roles.push({
      tenantId,
      contactId: o.contactId,
      role: 'COOWNER',
      active: true,
      startedAt: mgmtStart,
      metadata: { source: 'pack-history:syndic' }
    });
  }
  lotDefs.forEach((l, i) => {
    const o = ownerByKey.get(l.ownerKey)!;
    plan.lots.push({
      id: l.id,
      syndicateId,
      ownerContactId: o.contactId,
      coownerId: o.contactId,
      lotNumber: l.num,
      lotType: l.kind,
      generalShares: l.shares,
      specialShares: l.kind === 'PARKING' ? l.shares : null,
      ownerSince: l.ownedSince,
      createdAt: mgmtStart
    });
    plan.ownerProfiles.push({
      lotId: l.id,
      contactId: o.contactId,
      ownershipPercentage: Math.round(l.shares * 10) / 100,
      ownedSince: l.ownedSince,
      portalAccessEnabled: i % 3 === 0,
      isActive: true
    });
    plan.ownerAccounts.push({
      id: randomUUID(),
      syndicateId,
      lotId: l.id,
      contactId: o.contactId,
      balance: 0,
      currency: 'XOF',
      createdAt: mgmtStart
    });
  });

  // ═══════════════════════════════════════════════════════════ trimestres
  type Quarter = { year: number; q: number; issue: Date; due: Date; period: string };
  const quarters: Quarter[] = [];
  {
    let y = mgmtStart.getFullYear();
    let q = Math.ceil(mgmtStart.getMonth() / 3); // premier trimestre commençant à/après le début de gestion
    if (q > 3) {
      q = 0;
      y += 1;
    }
    for (;;) {
      const month = q * 3;
      const issue = local(y, month, q === 0 ? 5 : 2, 9);
      if (issue > addDays(end, -14)) break; // un appel émis il y a moins de 15 jours est trop frais pour un historique
      quarters.push({
        year: y,
        q: q + 1,
        issue,
        due: local(y, month, 15, 23, 59),
        period: `${y}-T${q + 1}`
      });
      q += 1;
      if (q > 3) {
        q = 0;
        y += 1;
      }
    }
  }
  assert(quarters.length >= 1, 'aucun trimestre à appeler');

  // ═══════════════════════════════════════════════════════════════ budgets
  const years = [...new Set(quarters.map(q => q.year))];
  const hasElevator = def.elevator;
  const activeSuppliers = SUPPLIERS.filter(s => !s.needsElevator || hasElevator);
  const weightSum = sum(activeSuppliers.map(s => s.weight)) + sum(FIXED_LINES.map(l => l.weight)) + def.worksFundShare;

  type LineSpec = {
    key: string;
    category: string;
    description: string;
    account: string;
    weight: number;
    supplier?: SupplierDef;
    works?: boolean;
  };
  const lineSpecs: LineSpec[] = [
    ...activeSuppliers.map(s => ({
      key: s.key,
      category: s.key === 'eau' || s.key === 'electricite' ? 'Fluides' : s.contract ? 'Contrats' : 'Entretien',
      description: s.nature,
      account: s.account,
      weight: s.weight,
      supplier: s
    })),
    ...FIXED_LINES.map(l => ({
      key: slug(l.description),
      category: l.category,
      description: l.description,
      account: l.account,
      weight: l.weight
    })),
    {
      key: 'fonds-travaux',
      category: 'Fonds de travaux',
      description: 'Dotation annuelle au fonds de travaux',
      account: '105',
      weight: def.worksFundShare,
      works: true
    }
  ];

  const growth = 1.06;
  const budgetByYear = new Map<
    number,
    {
      id: string;
      total: number;
      lines: Map<string, { id: string; forecast: number; spec: LineSpec }>;
      lotAnnual: Map<string, number>;
    }
  >();
  years.forEach((y, k) => {
    const target = def.baseAnnualBudget * Math.pow(growth, k);
    const lines = new Map<string, { id: string; forecast: number; spec: LineSpec }>();
    for (const spec of lineSpecs) {
      lines.set(spec.key, {
        id: randomUUID(),
        forecast: roundTo((target * spec.weight) / weightSum, 10_000),
        spec
      });
    }
    const total = sum([...lines.values()].map(l => l.forecast));
    const lotAnnual = new Map<string, number>();
    for (const l of lotDefs) lotAnnual.set(l.id, roundTo((total * l.shares) / 1000, 100));
    budgetByYear.set(y, { id: randomUUID(), total, lines, lotAnnual });
  });

  // fonds
  const fundRoulementId = randomUUID();
  const fundTravauxId = randomUUID();
  const worksShareByYear = new Map<number, number>();
  for (const [y, b] of budgetByYear) worksShareByYear.set(y, b.lines.get('fonds-travaux')!.forecast / b.total);

  // ═══════════════════════════════════════════════════════════ comptabilité (plan)
  const accountId = new Map<string, string>();
  const addAccount = (
    num: string,
    name: string,
    cls: number,
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE',
    parent?: string
  ) => {
    const id = randomUUID();
    accountId.set(num, id);
    plan.accounts.push({
      id,
      syndicateId,
      tenantId,
      scope: 'SYNDICATE',
      accountNumber: num,
      accountName: name,
      accountClass: cls,
      accountType: type,
      isAuxiliary: Boolean(parent),
      parentAccountId: parent ? (accountId.get(parent) ?? null) : null,
      createdAt: mgmtStart
    });
  };
  addAccount('103', 'Avances — fonds de roulement', 1, 'LIABILITY');
  addAccount('105', 'Fonds de travaux', 1, 'LIABILITY');
  addAccount('401', 'Fournisseurs', 4, 'LIABILITY');
  addAccount('450', 'Copropriétaires', 4, 'ASSET');
  addAccount('512', `Banque — ${def.bank}`, 5, 'ASSET');
  addAccount('5171', 'Monnaie électronique (Orange Money, MTN MoMo, Wave)', 5, 'ASSET');
  addAccount('531', 'Caisse', 5, 'ASSET');
  const expenseNames: Record<string, string> = {
    '6011': 'Eau des parties communes',
    '6012': 'Électricité des parties communes',
    '6141': 'Contrat de gardiennage',
    '6142': 'Contrat de nettoyage',
    '6143': 'Contrat d’entretien de l’ascenseur',
    '6144': 'Maintenance groupe électrogène',
    '6145': 'Entretien des espaces verts',
    '615': 'Entretien et petites réparations',
    '616': 'Primes d’assurance',
    '621': 'Honoraires du syndic',
    '671': 'Travaux décidés par l’assemblée générale'
  };
  const usedExpense = new Set(activeSuppliers.map(s => s.account));
  usedExpense.add('671');
  usedExpense.add('621');
  for (const num of [...usedExpense].sort()) addAccount(num, expenseNames[num] ?? num, 6, 'EXPENSE');
  addAccount('701', 'Provisions sur opérations courantes', 7, 'INCOME');
  addAccount('702', 'Provisions sur travaux décidés', 7, 'INCOME');
  addAccount('716', 'Pénalités et intérêts de retard', 7, 'INCOME');
  plan.accountParentCount = plan.accounts.length;
  for (const l of lotDefs) {
    addAccount(`450${l.num}`, `Copropriétaire lot ${l.num} — ${ownerByKey.get(l.ownerKey)!.name}`, 4, 'ASSET', '450');
  }

  const journalId = new Map<string, string>();
  const journalDefs: { code: JournalCode; type: 'GENERAL' | 'BANK' | 'CASH' | 'CHARGES'; label: string }[] = [
    { code: 'AC', type: 'GENERAL', label: 'Achats — factures fournisseurs' },
    { code: 'BQ', type: 'BANK', label: `Banque — ${def.bank}` },
    { code: 'CA', type: 'CASH', label: 'Caisse (espèces)' },
    { code: 'CH', type: 'CHARGES', label: 'Appels de fonds' },
    { code: 'MM', type: 'BANK', label: 'Monnaie électronique' },
    { code: 'OD', type: 'GENERAL', label: 'Opérations diverses' }
  ];
  for (let y = mgmtStart.getFullYear(); y <= end.getFullYear(); y++) {
    for (const j of journalDefs) {
      const id = randomUUID();
      journalId.set(`${y}:${j.code}`, id);
      plan.journals.push({
        id,
        syndicateId,
        tenantId,
        scope: 'SYNDICATE',
        journalType: j.type,
        label: j.label,
        code: j.code,
        fiscalYear: y,
        createdAt: local(y, 0, 1, 7)
      });
    }
  }

  type EntryDraft = {
    row: Prisma.JournalEntryCreateManyInput & { id: string };
    journal: JournalCode;
    year: number;
    order: number;
  };
  const entryDrafts: EntryDraft[] = [];
  const accBalance = new Map<string, number>();
  let entryOrder = 0;
  const addEntry = (o: {
    date: Date;
    journal: JournalCode;
    description: string;
    sourceType: 'CHARGE_PAYMENT' | 'MANUAL' | 'PENALTY' | 'SUPPLIER_INVOICE' | 'SUPPLIER_PAYMENT';
    sourceId?: string;
    lines: { acc: string; debit?: number; credit?: number; label: string; lotId?: string }[];
  }): string => {
    const year = o.date.getFullYear();
    const jid = journalId.get(`${year}:${o.journal}`);
    assert(jid, `journal ${o.journal} ${year} absent`);
    const debit = sum(o.lines.map(l => l.debit ?? 0));
    const credit = sum(o.lines.map(l => l.credit ?? 0));
    assert(debit === credit && debit > 0, `écriture déséquilibrée « ${o.description} » (${debit}/${credit})`);
    const id = randomUUID();
    entryDrafts.push({
      row: {
        id,
        journalId: jid,
        tenantId,
        entryDate: o.date,
        reference: '',
        description: o.description,
        sourceType: o.sourceType,
        sourceId: o.sourceId ?? null,
        isLocked: year < end.getFullYear(),
        createdAt: o.date
      },
      journal: o.journal,
      year,
      order: entryOrder++
    });
    o.lines.forEach((l, i) => {
      const acc = accountId.get(l.acc);
      assert(acc, `compte ${l.acc} absent du plan`);
      plan.entryLines.push({
        entryId: id,
        accountId: acc,
        lotId: l.lotId ?? null,
        debit: l.debit ?? 0,
        credit: l.credit ?? 0,
        label: l.label,
        createdAt: new Date(o.date.getTime() + i)
      });
      accBalance.set(l.acc, (accBalance.get(l.acc) ?? 0) + (l.debit ?? 0) - (l.credit ?? 0));
    });
    return id;
  };

  // ═══════════════════════════════════════════════════════ assemblées générales
  type AgDef = {
    id: string;
    date: Date;
    type: 'ORDINARY' | 'EXTRAORDINARY';
    held: boolean;
    year: number;
    budgetResolutionId?: string;
    worksIdx?: number;
  };
  const ags: AgDef[] = [];
  const nOrdinary = profile === '6m' ? 1 : 3;
  for (let k = 0; k < nOrdinary; k++) {
    const date = addMonths(local(start.getFullYear(), start.getMonth(), start.getDate() + def.agDayOffset, 10), 12 * k);
    if (date <= addDays(end, -5))
      ags.push({ id: randomUUID(), date, type: 'ORDINARY', held: true, year: date.getFullYear() });
  }
  if (profile === '3y') {
    const date = addMonths(
      local(start.getFullYear(), start.getMonth(), start.getDate() + def.agDayOffset + 20, 10),
      20
    );
    if (date <= addDays(end, -5))
      ags.push({
        id: randomUUID(),
        date,
        type: 'EXTRAORDINARY',
        held: true,
        year: date.getFullYear(),
        worksIdx: index
      });
  }
  ags.sort((a, b) => a.date.getTime() - b.date.getTime());
  const plannedAg: AgDef = {
    id: randomUUID(),
    date: local(end.getFullYear(), end.getMonth(), end.getDate() + 21, 10),
    type: 'ORDINARY',
    held: false,
    year: addDays(end, 21).getFullYear()
  };

  const works = WORKS[index % WORKS.length];
  const ageDef = ags.find(a => a.type === 'EXTRAORDINARY');
  // Les travaux ne sont pas votés pour une copropriété sans ascenseur : on garde l'étanchéité.
  const worksSpec = ageDef ? (!hasElevator && works.contractor.includes('Ascenseurs') ? WORKS[0] : works) : null;
  const worksCallRatio = 0.7; // 70 % par appel exceptionnel, 30 % par le fonds de travaux

  const lotVotes = (
    resolutionId: string,
    present: Set<string>,
    approvalProb: number
  ): { votesFor: number; votesAgainst: number; votesAbstain: number; sharesFor: number; sharesAgainst: number } => {
    let votesFor = 0,
      votesAgainst = 0,
      votesAbstain = 0,
      sharesFor = 0,
      sharesAgainst = 0;
    for (const lotId of present) {
      const r = rng();
      const lot = lotById.get(lotId)!;
      const vote = r < approvalProb ? 'FOR' : r < approvalProb + (1 - approvalProb) * 0.65 ? 'AGAINST' : 'ABSTAIN';
      if (vote === 'FOR') {
        votesFor++;
        sharesFor += lot.shares;
      } else if (vote === 'AGAINST') {
        votesAgainst++;
        sharesAgainst += lot.shares;
      } else votesAbstain++;
      plan.votes.push({ resolutionId, lotId, vote, createdAt: new Date() });
    }
    return { votesFor, votesAgainst, votesAbstain, sharesFor, sharesAgainst };
  };

  const budgetResolutionIds: { date: Date; id: string; year: number }[] = [];
  const meetingPlace = MEETING_PLACES[index % MEETING_PLACES.length];

  for (const ag of ags) {
    const meetingId = ag.id;
    // présents : tirage par lot, puis on complète jusqu'au quorum (> 50 % des tantièmes)
    const present = new Set<string>();
    const ordered = shuffle(rng, lotDefs);
    for (const l of ordered) if (rng() < 0.72) present.add(l.id);
    for (const l of ordered) {
      if (sum([...present].map(id => lotById.get(id)!.shares)) >= 520) break;
      present.add(l.id);
    }
    // une ou deux procurations : propriétaire absent représenté par un présent
    const absentOwners = owners.filter(o => o.lotIds.every(id => !present.has(id)));
    const presentOwners = owners.filter(o => o.lotIds.some(id => present.has(id)));
    let proxyCount = 0;
    for (const grantor of absentOwners.slice(0, 2)) {
      const rep = pick(rng, presentOwners);
      plan.proxies.push({ meetingId, grantorContactId: grantor.contactId, representativeContactId: rep.contactId });
      proxyCount++;
    }
    const presentShares = sum([...present].map(id => lotById.get(id)!.shares));
    const ordinary = ag.type === 'ORDINARY';

    type ResSpec = { title: string; description: string; rule: 'simple' | 'absolue'; prob: number; isBudget?: boolean };
    const budget = budgetByYear.get(ag.year) ?? budgetByYear.get(years[years.length - 1])!;
    const specs: ResSpec[] = ordinary
      ? [
          {
            title: `Approbation des comptes de l’exercice ${ag.year - 1}`,
            description: 'Examen des dépenses de l’exercice écoulé, rapport du syndic et du conseil syndical.',
            rule: 'simple',
            prob: 0.9
          },
          {
            title: `Vote du budget prévisionnel ${ag.year}`,
            description: `Budget de fonctionnement de ${budget.total.toLocaleString('fr-FR')} F CFA pour l’exercice ${ag.year}.`,
            rule: 'simple',
            prob: 0.82,
            isBudget: true
          },
          {
            title: 'Quitus au syndic',
            description: 'Quitus de gestion donné au syndic pour l’exercice écoulé.',
            rule: 'simple',
            prob: 0.85
          },
          {
            title: 'Renouvellement du contrat de gardiennage',
            description: 'Renouvellement pour douze mois, ou mise en concurrence sur trois devis.',
            rule: 'simple',
            prob: ag.date.getFullYear() === start.getFullYear() ? 0.78 : 0.45
          },
          {
            title: 'Élection du conseil syndical',
            description: 'Désignation du président et de deux assesseurs pour un an.',
            rule: 'simple',
            prob: 0.92
          }
        ]
      : [
          {
            title: `Approbation des travaux : ${worksSpec!.title}`,
            description: `Devis retenu de ${worksSpec!.amount.toLocaleString('fr-FR')} F CFA, entreprise ${worksSpec!.contractor}.`,
            rule: 'absolue',
            prob: 0.88
          },
          {
            title: 'Financement : appel exceptionnel et prélèvement sur le fonds de travaux',
            description: `${Math.round(worksCallRatio * 100)} % par appel de fonds exceptionnel aux tantièmes, le solde sur le fonds de travaux.`,
            rule: 'absolue',
            prob: 0.8
          }
        ];

    plan.meetings.push({
      id: meetingId,
      syndicateId,
      type: ag.type,
      scheduledAt: ag.date,
      startTime: ag.date,
      endTime: new Date(ag.date.getTime() + 150 * 60_000),
      location: meetingPlace,
      quorum: Math.round(presentShares * 10) / 100,
      status: 'COMPLETED',
      createdAt: addDays(ag.date, -30)
    });
    const agenda = [...specs.map(s => s.title), ...(ordinary ? ['Questions diverses'] : [])];
    agenda.forEach((title, i) => {
      plan.agendaItems.push({
        meetingId,
        orderIndex: i + 1,
        title,
        discussions:
          i === 0
            ? [
                `Quorum constaté : ${Math.round(presentShares) / 10} % des tantièmes (${present.size} lots présents ou représentés, ${proxyCount} procuration(s)).`
              ]
            : [`Le syndic présente le point, débat puis passage au vote.`]
      });
    });
    for (const s of specs) {
      const resId = randomUUID();
      const t = lotVotes(resId, present, s.prob);
      let result: 'APPROVED' | 'REJECTED' | 'DEFERRED';
      if (s.rule === 'simple')
        result = t.sharesFor > t.sharesAgainst ? 'APPROVED' : t.sharesFor === t.sharesAgainst ? 'DEFERRED' : 'REJECTED';
      else result = t.sharesFor > 500 ? 'APPROVED' : t.sharesFor > 333 ? 'DEFERRED' : 'REJECTED';
      plan.resolutions.push({
        id: resId,
        meetingId,
        title: s.title,
        description: s.description,
        majorityRule: s.rule === 'simple' ? 'Majorité simple (art. 24)' : 'Majorité absolue (art. 25)',
        result,
        votesFor: t.votesFor,
        votesAgainst: t.votesAgainst,
        votesAbstain: t.votesAbstain,
        sharesFor: t.sharesFor,
        createdAt: ag.date
      });
      if (s.isBudget) {
        ag.budgetResolutionId = resId;
        budgetResolutionIds.push({ date: ag.date, id: resId, year: ag.year });
      }
    }
  }
  // la convocation de la prochaine assemblée
  plan.meetings.push({
    id: plannedAg.id,
    syndicateId,
    type: 'ORDINARY',
    scheduledAt: plannedAg.date,
    location: meetingPlace,
    status: 'PLANNED',
    createdAt: addDays(end, -3)
  });
  [
    'Approbation des comptes de l’exercice écoulé',
    `Vote du budget prévisionnel ${plannedAg.year}`,
    'Renouvellement du conseil syndical',
    'Questions diverses'
  ].forEach((title, i) => plan.agendaItems.push({ meetingId: plannedAg.id, orderIndex: i + 1, title }));

  // ═══════════════════════════════════════════════════════ budgets (écriture)
  const budgetResolutionFor = (year: number): string | null => {
    const same = budgetResolutionIds.find(r => r.year === year);
    if (same) return same.id;
    const before = budgetResolutionIds.filter(r => r.year < year).pop();
    return before?.id ?? budgetResolutionIds[0]?.id ?? null;
  };
  for (const y of years) {
    const b = budgetByYear.get(y)!;
    const last = y === years[years.length - 1];
    const resId = budgetResolutionFor(y);
    const approvedAt = budgetResolutionIds.find(r => r.id === resId)?.date ?? null;
    plan.budgets.push({
      id: b.id,
      syndicateId,
      fiscalYear: y,
      label: `Budget de fonctionnement ${y}`,
      status: last ? 'APPROVED' : 'CLOSED',
      approvedAt,
      approvedByResolutionId: resId,
      totalAmount: b.total,
      currency: 'XOF',
      createdAt: addDays(approvedAt ?? mgmtStart, -20)
    });
    for (const l of b.lotAnnual) {
      const lotId = l[0];
      plan.budgetAllocations.push({
        budgetId: b.id,
        lotId,
        totalAllocated: l[1],
        breakdown: { tantiemes: lotById.get(lotId)!.shares, base: b.total, cle: 'GENERAL_SHARES' }
      });
    }
  }

  // ═══════════════════════════════════════════════════════ appels de charges
  type CallDraft = {
    id: string;
    lotId: string;
    batchId: string;
    period: string;
    amount: number;
    issue: Date;
    due: Date;
    kind: 'REGULAR' | 'EXCEPTIONAL';
    year: number;
  };
  const calls: CallDraft[] = [];
  const batchInfo = new Map<string, { calls: CallDraft[] }>();
  const makeBatch = (opts: {
    label: string;
    period: string;
    issue: Date;
    due: Date;
    kind: 'REGULAR' | 'EXCEPTIONAL';
    year: number;
    budgetId: string | null;
    amounts: Map<string, number>;
  }) => {
    const batchId = randomUUID();
    const draft: CallDraft[] = lotDefs.map(l => ({
      id: randomUUID(),
      lotId: l.id,
      batchId,
      period: opts.period,
      amount: opts.amounts.get(l.id) ?? 0,
      issue: opts.issue,
      due: opts.due,
      kind: opts.kind,
      year: opts.year
    }));
    calls.push(...draft);
    batchInfo.set(batchId, { calls: draft });
    plan.batches.push({
      id: batchId,
      syndicateId,
      label: opts.label,
      period: opts.period,
      dueDate: opts.due,
      batchType: opts.kind,
      budgetId: opts.budgetId,
      totalAmount: sum(draft.map(c => c.amount)),
      currency: 'XOF',
      status: 'SENT',
      createdAt: opts.issue
    });
    return batchId;
  };

  const ordinal = ['1er', '2e', '3e', '4e'];
  for (const qr of quarters) {
    const b = budgetByYear.get(qr.year)!;
    const amounts = new Map<string, number>();
    for (const l of lotDefs) {
      const annual = b.lotAnnual.get(l.id)!;
      const base = roundTo(annual / 4, 100);
      amounts.set(l.id, qr.q < 4 ? base : annual - 3 * base);
    }
    makeBatch({
      label: `Appel de fonds du ${ordinal[qr.q - 1]} trimestre ${qr.year}`,
      period: qr.period,
      issue: qr.issue,
      due: qr.due,
      kind: 'REGULAR',
      year: qr.year,
      budgetId: b.id,
      amounts
    });
  }
  let worksBatchId: string | null = null;
  if (ageDef && worksSpec) {
    const issue = local(ageDef.date.getFullYear(), ageDef.date.getMonth(), ageDef.date.getDate() + 14, 9);
    if (issue <= end) {
      const called = roundTo(worksSpec.amount * worksCallRatio, 1000);
      const amounts = new Map<string, number>();
      for (const l of lotDefs) amounts.set(l.id, roundTo((called * l.shares) / 1000, 100));
      const due = addDays(issue, 30);
      worksBatchId = makeBatch({
        label: `Appel exceptionnel travaux — ${worksSpec.title}`,
        period: `${issue.getFullYear()}-T${Math.floor(issue.getMonth() / 3) + 1}-TRAVAUX`,
        issue,
        due: new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59),
        kind: 'EXCEPTIONAL',
        year: issue.getFullYear(),
        budgetId: null,
        amounts
      });
    }
  }

  // ═══════════════════════════════════════════════════════ paiements
  type PayDraft = {
    id: string;
    callId: string;
    lotId: string;
    date: Date;
    amount: number;
    method: Method;
    ref: string;
  };
  const payments: PayDraft[] = [];
  const paymentsByCall = new Map<string, PayDraft[]>();
  const callById = new Map(calls.map(c => [c.id, c]));
  const makeRef = (method: Method, date: Date): string => {
    const digits = (n: number) => Array.from({ length: n }, () => String(between(rng, 0, 9))).join('');
    switch (method) {
      case 'BANK_TRANSFER':
        return `VIR ${ymd(date)} ${digits(6)}`;
      case 'CHECK':
        return `CHQ ${digits(7)}`;
      case 'MOBILE_MONEY':
        return `OM${ymd(date)}.${digits(4)}.${'ABCDEFGHJK'[between(rng, 0, 9)]}${digits(5)}`;
      default:
        return `REC-${ymd(date)}-${digits(3)}`;
    }
  };
  const pushPayment = (call: CallDraft, owner: OwnerDef, date: Date, amount: number, method?: Method) => {
    if (date > end || amount <= 0) return;
    const m = method ?? owner.method;
    const p: PayDraft = {
      id: randomUUID(),
      callId: call.id,
      lotId: call.lotId,
      date,
      amount,
      method: m,
      ref: makeRef(m, date)
    };
    payments.push(p);
    const arr = paymentsByCall.get(call.id) ?? [];
    arr.push(p);
    paymentsByCall.set(call.id, arr);
  };
  const paidUntil = (callId: string, at: Date) =>
    sum((paymentsByCall.get(callId) ?? []).filter(p => p.date <= at).map(p => p.amount));
  const floorDate = (d: Date, call: CallDraft) =>
    d < addDays(call.issue, 1) ? addDays(call.issue, 1 + between(rng, 0, 3)) : d;

  const chronicFirst = owners.find(o => o.behavior === 'chronic');
  let scheduledCallId: string | null = null;
  for (const call of calls) {
    const owner = ownerByKey.get(ownerOfLot.get(call.lotId)!)!;
    const lot = lotById.get(call.lotId)!;
    void lot;
    switch (owner.behavior) {
      case 'punctual': {
        const lateTail = rng() < 0.06;
        const d = lateTail ? addDays(call.due, between(rng, 5, 20)) : addDays(call.due, -between(rng, 0, 12));
        pushPayment(call, owner, floorDate(d, call), call.amount);
        break;
      }
      case 'late':
        pushPayment(call, owner, floorDate(addDays(call.due, between(rng, 6, 45)), call), call.amount);
        break;
      case 'partial': {
        const first = roundTo(call.amount * (0.4 + rng() * 0.3), 100);
        pushPayment(call, owner, floorDate(addDays(call.due, between(rng, 0, 20)), call), first);
        if (rng() < 0.4) pushPayment(call, owner, addDays(call.due, between(rng, 40, 90)), call.amount - first);
        break;
      }
      case 'chronic': {
        const r = rng();
        if (r < 0.22) pushPayment(call, owner, floorDate(addDays(call.due, between(rng, 40, 120)), call), call.amount);
        else if (r < 0.37)
          pushPayment(
            call,
            owner,
            floorDate(addDays(call.due, between(rng, 10, 60)), call),
            roundTo(call.amount * 0.4, 100)
          );
        // sinon : rien versé
        break;
      }
    }
    // échéancier : premier appel ancien et totalement impayé du premier mauvais payeur
    if (
      !scheduledCallId &&
      chronicFirst &&
      owner.key === chronicFirst.key &&
      call.kind === 'REGULAR' &&
      !paymentsByCall.get(call.id)?.length &&
      call.due.getTime() < end.getTime() - 130 * 86_400_000
    ) {
      scheduledCallId = call.id;
    }
  }
  if (scheduledCallId) {
    const call = callById.get(scheduledCallId)!;
    const owner = ownerByKey.get(ownerOfLot.get(call.lotId)!)!;
    const agreedAt = addDays(call.due, 60);
    const scheduleId = randomUUID();
    const part = roundTo(call.amount / 3, 100);
    const inst = [part, part, call.amount - 2 * part].map((amount, i) => ({
      amount,
      due: addDays(agreedAt, 30 * (i + 1))
    }));
    const instRows: Prisma.PaymentScheduleInstalmentCreateManyInput[] = [];
    let late = 0;
    let paidCount = 0;
    inst.forEach((it, i) => {
      const payDate = addDays(it.due, between(rng, 0, 10));
      const pays = payDate <= end && (i === 0 || rng() < 0.75);
      if (pays) {
        pushPayment(call, owner, payDate, it.amount, 'BANK_TRANSFER');
        paidCount++;
      }
      const status: 'PAID' | 'LATE' | 'PENDING' = pays ? 'PAID' : it.due < end ? 'LATE' : 'PENDING';
      if (status === 'LATE') late++;
      instRows.push({
        scheduleId,
        dueDate: it.due,
        amount: it.amount,
        paidAt: pays ? payDate : null,
        paidAmount: pays ? it.amount : null,
        status,
        createdAt: agreedAt
      });
    });
    plan.schedules.push({
      id: scheduleId,
      chargeCallId: call.id,
      lotId: call.lotId,
      agreedAt,
      totalAmount: call.amount,
      status: paidCount === 3 ? 'COMPLETED' : late >= 2 ? 'DEFAULTED' : 'ACTIVE',
      createdAt: agreedAt
    });
    plan.instalments.push(...instRows);
  }

  // statuts des appels + écritures de payement
  const ownerEvents = new Map<
    string,
    {
      date: Date;
      type: 'CHARGE_CALL' | 'PAYMENT' | 'PENALTY' | 'WAIVER';
      debit?: number;
      credit?: number;
      label: string;
      reference?: string;
      sourceId?: string;
      seq: number;
    }[]
  >();
  let seq = 0;
  const pushEvent = (
    lotId: string,
    e: {
      date: Date;
      type: 'CHARGE_CALL' | 'PAYMENT' | 'PENALTY' | 'WAIVER';
      debit?: number;
      credit?: number;
      label: string;
      reference?: string;
      sourceId?: string;
    }
  ) => {
    const a = ownerEvents.get(lotId) ?? [];
    a.push({ ...e, seq: seq++ });
    ownerEvents.set(lotId, a);
  };
  const callStatus = new Map<string, 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE'>();

  // une écriture d'appel par lot : plus lisible, et la 450xx suit le compte copropriétaire
  for (const [batchId, info] of batchInfo) {
    const first = info.calls[0];
    const credit = first.kind === 'REGULAR' ? '701' : '702';
    const batch = plan.batches.find(b => b.id === batchId)!;
    addEntry({
      date: first.issue,
      journal: 'CH',
      description: `${batch.label}`,
      sourceType: 'MANUAL',
      sourceId: batchId,
      lines: [
        ...info.calls.map(c => ({
          acc: `450${lotById.get(c.lotId)!.num}`,
          debit: c.amount,
          label: `${first.period} — lot ${lotById.get(c.lotId)!.num}`,
          lotId: c.lotId
        })),
        { acc: credit, credit: sum(info.calls.map(c => c.amount)), label: `${batch.label}` }
      ]
    });
  }

  const levels = [
    { level: 1, offset: 15 },
    { level: 2, offset: 30 },
    { level: 3, offset: 50 }
  ];
  for (const call of calls) {
    const lot = lotById.get(call.lotId)!;
    const owner = ownerByKey.get(ownerOfLot.get(call.lotId)!)!;
    const pays = (paymentsByCall.get(call.id) ?? []).sort((a, b) => a.date.getTime() - b.date.getTime());
    const paid = sum(pays.map(p => p.amount));
    const st = paid >= call.amount ? 'PAID' : paid > 0 ? 'PARTIAL' : call.due < end ? 'OVERDUE' : 'PENDING';
    callStatus.set(call.id, st);
    const bounds = parsePeriodBounds(call.period.replace(/-TRAVAUX$/, ''));
    plan.calls.push({
      id: call.id,
      syndicateId,
      lotId: call.lotId,
      batchId: call.batchId,
      period: call.period.replace(/-TRAVAUX$/, ''),
      periodStart: bounds?.start ?? null,
      periodEnd: bounds?.end ?? null,
      amount: call.amount,
      currency: 'XOF',
      dueDate: call.due,
      status: st,
      fundId: call.kind === 'EXCEPTIONAL' ? fundTravauxId : null,
      noticeSentAt: new Date(call.issue.getTime() + 3_600_000),
      createdAt: call.issue
    });
    pushEvent(lot.id, {
      date: call.issue,
      type: 'CHARGE_CALL',
      debit: call.amount,
      label: call.kind === 'REGULAR' ? `Appel de fonds ${call.period}` : 'Appel exceptionnel travaux',
      reference: `CH-${call.period}-${lot.num}`
    });

    for (const p of pays) {
      plan.payments.push({
        id: p.id,
        lotId: p.lotId,
        chargeCallId: call.id,
        amount: p.amount,
        unallocatedAmount: 0,
        paidAt: p.date,
        method: p.method,
        reference: p.ref,
        createdById: adminUserId,
        createdAt: p.date
      });
      plan.allocations.push({
        paymentId: p.id,
        chargeCallId: call.id,
        amount: p.amount,
        source: 'PAYMENT',
        createdAt: p.date
      });
      pushEvent(lot.id, {
        date: p.date,
        type: 'PAYMENT',
        credit: p.amount,
        label: `Règlement ${call.period} (${METHOD_TREASURY[p.method].label})`,
        reference: p.ref,
        sourceId: p.id
      });
      const t = METHOD_TREASURY[p.method];
      addEntry({
        date: p.date,
        journal: t.journal,
        description: `Règlement ${call.period} — lot ${lot.num} (${owner.name}) — ${t.label} ${p.ref}`,
        sourceType: 'CHARGE_PAYMENT',
        sourceId: p.id,
        lines: [
          { acc: t.account, debit: p.amount, label: `${t.label} ${p.ref}` },
          { acc: `450${lot.num}`, credit: p.amount, label: `Règlement ${call.period} — lot ${lot.num}`, lotId: lot.id }
        ]
      });
    }

    // relances : J+15 / J+30 / J+50 tant que l'appel n'est pas soldé
    const sent: { level: number; at: Date }[] = [];
    for (const lv of levels) {
      const at = new Date(call.due.getFullYear(), call.due.getMonth(), call.due.getDate() + lv.offset, 8, 30);
      if (at > end) break;
      if (call.amount - paidUntil(call.id, at) <= 0) break;
      const channel =
        lv.level === 1 ? (owner.channel === 'EMAIL' ? 'EMAIL' : 'SMS') : lv.level === 2 ? 'WHATSAPP' : 'EMAIL';
      const failed = rng() < 0.07;
      plan.reminders.push({
        chargeCallId: call.id,
        lotId: lot.id,
        reminderLevel: lv.level,
        sentAt: at,
        channel,
        status: failed ? 'FAILED' : rng() < 0.7 ? 'DELIVERED' : 'SENT',
        responseAction:
          lv.level === 1 && paidUntil(call.id, addDays(at, 12)) > paidUntil(call.id, at)
            ? 'Règlement reçu après la relance'
            : lv.level === 3
              ? 'Mise en demeure restée sans effet'
              : null,
        createdAt: at
      });
      sent.push({ level: lv.level, at });
    }

    // pénalité à la mise en demeure (1,5 %/mois, même formule que l'API)
    const l3 = sent.find(s => s.level === 3);
    if (l3) {
      const outstanding = call.amount - paidUntil(call.id, l3.at);
      if (outstanding > 0) {
        const pid = randomUUID();
        const rate = 1.5;
        const daysLate = 50;
        const amount = Math.round((outstanding * rate * daysLate) / 3000);
        const waiveAt = addDays(l3.at, 21);
        const waived = rng() < 0.3 && waiveAt <= end;
        const entryId = addEntry({
          date: l3.at,
          journal: 'OD',
          description: `Pénalité de retard ${call.period} — lot ${lot.num} (${owner.name})`,
          sourceType: 'PENALTY',
          sourceId: pid,
          lines: [
            { acc: `450${lot.num}`, debit: amount, label: `Pénalité ${call.period} — lot ${lot.num}`, lotId: lot.id },
            { acc: '716', credit: amount, label: `Pénalité de retard ${call.period}` }
          ]
        });
        plan.penalties.push({
          id: pid,
          chargeCallId: call.id,
          lotId: lot.id,
          daysLate,
          penaltyRate: rate,
          penaltyAmount: amount,
          currency: 'XOF',
          appliedAt: l3.at,
          waived,
          waivedAt: waived ? waiveAt : null,
          waivedReason: waived ? 'Remise gracieuse accordée par le conseil syndical' : null,
          journalEntryId: entryId,
          createdAt: l3.at
        });
        pushEvent(lot.id, {
          date: l3.at,
          type: 'PENALTY',
          debit: amount,
          label: `Pénalité de retard ${call.period}`,
          sourceId: pid
        });
        if (waived) {
          addEntry({
            date: waiveAt,
            journal: 'OD',
            description: `Remise de pénalité ${call.period} — lot ${lot.num}`,
            sourceType: 'PENALTY',
            sourceId: pid,
            lines: [
              { acc: '716', debit: amount, label: `Remise de pénalité ${call.period}` },
              { acc: `450${lot.num}`, credit: amount, label: `Remise de pénalité — lot ${lot.num}`, lotId: lot.id }
            ]
          });
          pushEvent(lot.id, {
            date: waiveAt,
            type: 'WAIVER',
            credit: amount,
            label: 'Remise de pénalité',
            sourceId: pid
          });
        }
      }
    }
  }

  // lots entièrement soldés : le lot est clos
  for (const [batchId, info] of batchInfo) {
    const allPaid = info.calls.every(c => callStatus.get(c.id) === 'PAID');
    if (allPaid) plan.batches.find(b => b.id === batchId)!.status = 'CLOSED';
  }

  // compte copropriétaire : solde cumulé écrit sur chaque ligne
  const ownerAccountByLot = new Map(plan.ownerAccounts.map(a => [a.lotId, a.id as string]));
  const ownerBalance = new Map<string, number>();
  for (const [lotId, events] of ownerEvents) {
    events.sort((a, b) => a.date.getTime() - b.date.getTime() || a.seq - b.seq);
    let bal = 0;
    for (const e of events) {
      bal += (e.debit ?? 0) - (e.credit ?? 0);
      plan.ownerTransactions.push({
        accountId: ownerAccountByLot.get(lotId)!,
        transactionDate: e.date,
        type: e.type,
        debit: e.debit ?? null,
        credit: e.credit ?? null,
        balanceAfter: bal,
        label: e.label,
        reference: e.reference ?? null,
        sourceId: e.sourceId ?? null,
        createdAt: e.date
      });
    }
    ownerBalance.set(lotId, bal);
  }
  for (const a of plan.ownerAccounts) a.balance = ownerBalance.get(a.lotId) ?? 0;

  // ═══════════════════════════════════════════════ prestataires, contrats, factures
  const providerFor = (name: string, specialty: string): ProviderRow => {
    let row = providers.get(name);
    if (!row) {
      row = {
        id: randomUUID(),
        tenantId,
        name,
        specialty,
        email: `contact@${slug(name).slice(0, 24).replace(/\.+$/, '')}.test`,
        phone: `+225 27 ${pad(between(rng, 20, 99))} ${pad(between(rng, 0, 99))} ${pad(between(rng, 0, 99))} ${pad(between(rng, 0, 99))}`
      };
      providers.set(name, row);
    }
    return row;
  };
  const nameAt = (s: SupplierDef, at: Date, switchDate: Date | null): string => {
    const k = switchDate && at >= switchDate && s.names.length > 1 ? 1 : 0;
    return s.names[(index + k) % s.names.length];
  };
  // changement de gardien décidé à la 2e AG (profil 3 ans)
  const ordinaries = ags.filter(a => a.type === 'ORDINARY');
  const switchDate = profile === '3y' && ordinaries[1] ? addDays(ordinaries[1].date, 30) : null;

  const contractIds = new Map<string, string>();
  for (const s of activeSuppliers.filter(x => x.contract)) {
    const first = nameAt(s, mgmtStart, switchDate);
    const second = switchDate && s.key === 'gardiennage' ? nameAt(s, switchDate, switchDate) : null;
    const b = budgetByYear.get(years[years.length - 1])!;
    const annual = b.lines.get(s.key)!.forecast;
    const mk = (name: string, from: Date, to: Date | null, status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED') => {
      const id = randomUUID();
      const prov = providerFor(name, s.specialty);
      plan.contracts.push({
        id,
        syndicateId,
        providerId: prov.id,
        nature: s.nature,
        startDate: from,
        endDate: to,
        annualAmount: annual,
        currency: 'XOF',
        renewalAlertDays: 30,
        status,
        createdAt: from
      });
      return id;
    };
    if (second) {
      mk(first, mgmtStart, switchDate, 'TERMINATED');
      contractIds.set(`${s.key}|${second}`, mk(second, switchDate!, addMonths(switchDate!, 12 * 2), 'ACTIVE'));
      contractIds.set(`${s.key}|${first}`, plan.contracts[plan.contracts.length - 2].id as string);
    } else {
      // renouvellement tacite : le contrat en cours finit à la prochaine échéance (l'assurance dans 20 jours)
      const endDate =
        s.key === 'assurance' ? addDays(end, 20) : addMonths(local(end.getFullYear(), mgmtStart.getMonth(), 1), 12);
      contractIds.set(`${s.key}|${first}`, mk(first, mgmtStart, endDate, 'ACTIVE'));
    }
  }

  // factures : une par période de facturation écoulée
  const invoiceTotals = new Map<string, number>(); // `${year}|${lineKey}` → HT
  const usedNumbers = new Set<string>();
  const addInvoice = (o: {
    provider: ProviderRow;
    contractId: string | null;
    label: string;
    date: Date;
    amount: number;
    account: string;
    lineKey: string | null;
    fundId?: string | null;
    paymentSplits?: { date: Date; amount: number }[];
    forcePaid?: boolean;
  }) => {
    const id = randomUUID();
    const initials = slug(o.provider.name).replace(/\./g, '').slice(0, 3).toUpperCase();
    let number = `${initials}-${o.date.getFullYear()}${pad(o.date.getMonth() + 1)}-${pad(between(rng, 1, 999), 3)}`;
    while (usedNumbers.has(`${o.provider.id}|${number}`)) number += 'B';
    usedNumbers.add(`${o.provider.id}|${number}`);
    const due = addDays(o.date, 30);
    const jeId = addEntry({
      date: o.date,
      journal: 'AC',
      description: `Facture ${number} — ${o.provider.name} — ${o.label}`,
      sourceType: 'SUPPLIER_INVOICE',
      sourceId: id,
      lines: [
        { acc: o.account, debit: o.amount, label: o.label },
        { acc: '401', credit: o.amount, label: `${o.provider.name} — ${number}` }
      ]
    });
    // règlements
    const splits =
      o.paymentSplits ??
      (rng() < 0.9
        ? [{ date: addDays(o.date, between(rng, 10, 35)), amount: o.amount }]
        : rng() < 0.5
          ? [{ date: addDays(o.date, between(rng, 15, 40)), amount: Math.round(o.amount / 2) }]
          : []);
    let paid = 0;
    for (const sp of splits) {
      if (sp.date > end) continue;
      const pid = randomUUID();
      const method: Method = pick(rng, ['BANK_TRANSFER', 'CHECK', 'BANK_TRANSFER']);
      const pe = addEntry({
        date: sp.date,
        journal: 'BQ',
        description: `Règlement facture ${number} — ${o.provider.name}`,
        sourceType: 'SUPPLIER_PAYMENT',
        sourceId: pid,
        lines: [
          { acc: '401', debit: sp.amount, label: `${o.provider.name} — ${number}` },
          { acc: '512', credit: sp.amount, label: `${METHOD_TREASURY[method].label} ${o.provider.name}` }
        ]
      });
      plan.invoicePayments.push({
        id: pid,
        tenantId,
        invoiceId: id,
        fundId: o.fundId ?? null,
        amount: sp.amount,
        paidAt: sp.date,
        method,
        reference: makeRef(method, sp.date),
        journalEntryId: pe,
        createdById: adminUserId,
        createdAt: sp.date
      });
      paid += sp.amount;
    }
    plan.invoices.push({
      id,
      tenantId,
      syndicateId,
      providerId: o.provider.id,
      contractId: o.contractId,
      fundId: o.fundId ?? null,
      number,
      label: o.label,
      invoiceDate: o.date,
      dueDate: due,
      amountHT: o.amount,
      vatAmount: 0,
      amountTTC: o.amount,
      amountPaid: paid,
      currency: 'XOF',
      status: paid >= o.amount ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'RECORDED',
      journalEntryId: jeId,
      createdById: adminUserId,
      createdAt: o.date
    });
    if (o.lineKey) {
      const k = `${o.date.getFullYear()}|${o.lineKey}`;
      invoiceTotals.set(k, (invoiceTotals.get(k) ?? 0) + o.amount);
    }
  };

  for (const s of activeSuppliers) {
    const step = s.everyMonths;
    // blocs alignés sur le calendrier, de la date de début jusqu'à la fin
    let blockStart = local(mgmtStart.getFullYear(), mgmtStart.getMonth() - (mgmtStart.getMonth() % step), 1);
    if (blockStart < mgmtStart) blockStart = addMonths(blockStart, step);
    for (; ; blockStart = addMonths(blockStart, step)) {
      const invoiceDate = local(blockStart.getFullYear(), blockStart.getMonth() + step - 1, 28, 10);
      if (invoiceDate > addDays(end, -2)) break;
      const b = budgetByYear.get(invoiceDate.getFullYear());
      if (!b) continue;
      const forecast = b.lines.get(s.key)!.forecast;
      const amount = roundTo((forecast / (12 / step)) * (0.93 + rng() * 0.17), 500);
      const name = nameAt(s, invoiceDate, switchDate);
      const prov = providerFor(name, s.specialty);
      const label =
        step === 1
          ? `${s.nature} — ${pad(blockStart.getMonth() + 1)}/${blockStart.getFullYear()}`
          : `${s.nature} — T${Math.floor(blockStart.getMonth() / 3) + 1} ${blockStart.getFullYear()}`;
      addInvoice({
        provider: prov,
        contractId: s.contract ? (contractIds.get(`${s.key}|${name}`) ?? null) : null,
        label,
        date: invoiceDate,
        amount,
        account: s.account,
        lineKey: s.key
      });
    }
  }

  // travaux votés en AGE : facture payée en deux fois sur le fonds de travaux
  let worksInvoiceTotal = 0;
  if (ageDef && worksSpec && worksBatchId) {
    const date = addDays(ageDef.date, 45);
    if (date <= end) {
      const prov = providerFor(worksSpec.contractor, worksSpec.specialty);
      const first = roundTo(worksSpec.amount * 0.4, 1000);
      addInvoice({
        provider: prov,
        contractId: null,
        label: worksSpec.title,
        date,
        amount: worksSpec.amount,
        account: '671',
        lineKey: null,
        fundId: fundTravauxId,
        paymentSplits: [
          { date: addDays(date, 8), amount: first },
          { date: addDays(date, 75), amount: worksSpec.amount - first }
        ]
      });
      worksInvoiceTotal = worksSpec.amount;
    }
  }
  void worksInvoiceTotal;

  // lignes de budget (avec le réalisé issu des factures)
  for (const y of years) {
    const b = budgetByYear.get(y)!;
    const qIssued = quarters.filter(q => q.year === y).length;
    for (const [key, line] of b.lines) {
      const spec = line.spec;
      let actual: number;
      if (spec.supplier) actual = invoiceTotals.get(`${y}|${key}`) ?? 0;
      else actual = Math.round((line.forecast * qIssued) / 4);
      plan.budgetLines.push({
        id: line.id,
        budgetId: b.id,
        category: spec.category,
        description: spec.description,
        amountForecast: line.forecast,
        amountActual: actual,
        distributionKey: 'GENERAL_SHARES',
        accountId: accountId.get(spec.account) ?? null,
        fundId: spec.works ? fundTravauxId : null,
        createdAt: addDays(mgmtStart, 0)
      });
    }
  }

  // ═══════════════════════════════════════════════════════ fonds (journal)
  type FundEvt = {
    fundId: string;
    date: Date;
    dir: 'CREDIT' | 'DEBIT';
    amount: number;
    label: string;
    source: 'CHARGE_PAYMENT' | 'PROVIDER_PAYMENT';
    sourceId: string;
  };
  const fundEvents: FundEvt[] = [];
  for (const p of payments) {
    const call = callById.get(p.callId)!;
    const lot = lotById.get(p.lotId)!;
    let credit: number;
    if (call.kind === 'EXCEPTIONAL') credit = p.amount;
    else credit = Math.round(p.amount * (worksShareByYear.get(call.year) ?? 0));
    if (credit > 0)
      fundEvents.push({
        fundId: fundTravauxId,
        date: p.date,
        dir: 'CREDIT',
        amount: credit,
        label:
          call.kind === 'EXCEPTIONAL'
            ? `Appel travaux ${call.period} — lot ${lot.num}`
            : `Dotation travaux ${call.period} — lot ${lot.num}`,
        source: 'CHARGE_PAYMENT',
        sourceId: p.id
      });
  }
  for (const pay of plan.invoicePayments) {
    if (pay.fundId !== fundTravauxId) continue;
    fundEvents.push({
      fundId: fundTravauxId,
      date: pay.paidAt as Date,
      dir: 'DEBIT',
      amount: Number(pay.amount),
      label: `Travaux : règlement facture ${plan.invoices.find(i => i.id === pay.invoiceId)?.number ?? ''}`,
      source: 'PROVIDER_PAYMENT',
      sourceId: pay.id as string
    });
  }
  fundEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
  // solde repris : assez pour que le fonds ne passe jamais sous zéro
  const firstBudget = budgetByYear.get(years[0])!;
  let running = 0;
  let minRunning = 0;
  for (const e of fundEvents) {
    running += e.dir === 'CREDIT' ? e.amount : -e.amount;
    minRunning = Math.min(minRunning, running);
  }
  const openingTravaux = roundTo(
    Math.max(firstBudget.lines.get('fonds-travaux')!.forecast * 0.6, -minRunning + firstBudget.total * 0.05),
    10_000
  );
  const openingRoulement = roundTo(firstBudget.total / 8, 10_000);
  const pushMovement = (
    fundId: string,
    date: Date,
    dir: 'CREDIT' | 'DEBIT',
    amount: number,
    balanceAfter: number,
    label: string,
    source: string,
    sourceId: string | null
  ) =>
    plan.fundMovements.push({
      tenantId,
      fundId,
      direction: dir,
      amount,
      balanceAfter,
      label,
      sourceType: source as Prisma.SyndicateFundMovementCreateManyInput['sourceType'],
      sourceId,
      createdById: adminUserId,
      createdAt: date
    });
  pushMovement(
    fundRoulementId,
    mgmtStart,
    'CREDIT',
    openingRoulement,
    openingRoulement,
    'Solde repris à la prise de gestion',
    'OPENING',
    null
  );
  pushMovement(
    fundTravauxId,
    mgmtStart,
    'CREDIT',
    openingTravaux,
    openingTravaux,
    'Solde repris à la prise de gestion',
    'OPENING',
    null
  );
  let balTravaux = openingTravaux;
  for (const e of fundEvents) {
    balTravaux += e.dir === 'CREDIT' ? e.amount : -e.amount;
    assert(balTravaux >= 0, 'fonds de travaux négatif');
    pushMovement(e.fundId, e.date, e.dir, e.amount, balTravaux, e.label, e.source, e.sourceId);
  }
  plan.funds.push(
    {
      id: fundRoulementId,
      syndicateId,
      name: 'Fonds de roulement',
      balance: openingRoulement,
      currency: 'XOF',
      createdAt: mgmtStart
    },
    {
      id: fundTravauxId,
      syndicateId,
      name: 'Fonds de travaux',
      balance: balTravaux,
      currency: 'XOF',
      createdAt: mgmtStart
    }
  );

  // ═══════════════════════════════════════════════════════ patrimoine & incidents
  const assetIds = new Map<string, string>();
  for (const a of COMMON_ASSETS.filter(x => !x.needsElevator || hasElevator)) {
    const id = randomUUID();
    assetIds.set(a.name, id);
    plan.assets.push({
      id,
      syndicateId,
      name: a.name,
      category: a.category,
      lastMaintenanceDate: addDays(end, -between(rng, 20, 160)),
      nextMaintenanceDate: addDays(end, between(rng, 15, 150)),
      notes: null,
      createdAt: mgmtStart
    });
  }
  const assetFor: Record<string, string | null> = {
    ascenseur: 'Ascenseur',
    electrogene: 'Groupe électrogène',
    gardiennage: 'Portail automatique',
    plomberie: 'Surpresseur et bâche à eau'
  };
  const pool = INCIDENT_POOL.filter(i => hasElevator || i.supplier !== 'ascenseur');
  const incidentCount = Math.max(3, Math.round((rawLots.length / 6) * (profile === '6m' ? 1.2 : 3.5)));
  const span = Math.max(30, Math.round((end.getTime() - mgmtStart.getTime()) / 86_400_000) - 15);
  for (let i = 0; i < incidentCount; i++) {
    const tpl = pick(rng, pool);
    const reportedAt = addDays(mgmtStart, between(rng, 10, span));
    const ageDays = (end.getTime() - reportedAt.getTime()) / 86_400_000;
    let status: 'REPORTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
    if (ageDays > 75) status = rng() < 0.65 ? 'RESOLVED' : 'CLOSED';
    else if (ageDays > 20) status = pick(rng, ['IN_PROGRESS', 'RESOLVED', 'ASSIGNED'] as const);
    else status = pick(rng, ['REPORTED', 'ASSIGNED'] as const);
    const supplier = SUPPLIERS.find(s => s.key === tpl.supplier)!;
    const done = status === 'RESOLVED' || status === 'CLOSED';
    const resolvedAt = done ? addDays(reportedAt, between(rng, 2, 25)) : null;
    const owner = pick(rng, owners);
    const mainLot =
      tpl.type === 'LEAK' && rng() < 0.6
        ? pick(
            rng,
            lotDefs.filter(l => l.kind === 'APARTMENT')
          )
        : null;
    const prov =
      status === 'REPORTED' ? null : providerFor(nameAt(supplier, reportedAt, switchDate), supplier.specialty);
    const assetName = assetFor[tpl.supplier];
    plan.incidents.push({
      syndicateId,
      reportedByContactId: owner.contactId,
      lotId: mainLot?.id ?? null,
      assetId: assetName ? (assetIds.get(assetName) ?? null) : null,
      incidentType: tpl.type,
      description: tpl.description,
      urgency: tpl.urgency,
      status,
      reportedAt,
      resolvedAt: resolvedAt && resolvedAt <= end ? resolvedAt : null,
      providerId: prov?.id ?? null,
      createdAt: reportedAt
    });
  }

  // ═══════════════════════════════════════════════════════ configuration d'encaissement
  plan.paymentMethods.push(
    {
      syndicateId,
      type: 'BANK_TRANSFER',
      provider: def.bank,
      accountRef: `CI0${pad(between(rng, 10, 99))} ${between(rng, 1000, 9999)} ${between(rng, 1000, 9999)}`,
      label: `Virement — ${def.bank}`,
      isDefault: true,
      isActive: true,
      createdAt: mgmtStart
    },
    {
      syndicateId,
      type: 'MOBILE_MONEY',
      provider: 'Orange Money',
      accountRef: null,
      label: 'Orange Money',
      isDefault: false,
      isActive: true,
      createdAt: mgmtStart
    },
    {
      syndicateId,
      type: 'MOBILE_MONEY',
      provider: 'Wave',
      accountRef: null,
      label: 'Wave',
      isDefault: false,
      isActive: true,
      createdAt: mgmtStart
    },
    {
      syndicateId,
      type: 'CHECK',
      provider: def.bank,
      accountRef: null,
      label: `Chèque à l'ordre du « Syndicat des copropriétaires ${def.name} »`,
      isDefault: false,
      isActive: true,
      createdAt: mgmtStart
    },
    {
      syndicateId,
      type: 'CASH',
      provider: null,
      accountRef: null,
      label: 'Espèces au bureau du syndic (reçu remis)',
      isDefault: false,
      isActive: true,
      createdAt: mgmtStart
    }
  );
  plan.reminderConfigs.push(
    {
      syndicateId,
      level: 1,
      delayDays: 15,
      channels: ['EMAIL', 'SMS'],
      templateSubject: 'Rappel — appel de fonds {{period}} non réglé',
      templateBody:
        'Bonjour {{ownerName}}, sauf erreur de notre part, l’appel de fonds {{period}} du lot {{lotNumber}} ({{amount}}) reste impayé. Merci de procéder au règlement par virement, Orange Money ou Wave.',
      autoSend: true,
      penaltyRateMonthly: null
    },
    {
      syndicateId,
      level: 2,
      delayDays: 30,
      channels: ['WHATSAPP', 'EMAIL'],
      templateSubject: 'Deuxième relance — appel de fonds {{period}}',
      templateBody:
        'Bonjour {{ownerName}}, malgré notre premier rappel, le solde de {{outstanding}} du lot {{lotNumber}} reste dû. Contactez le syndic si vous souhaitez un échéancier.',
      autoSend: true,
      penaltyRateMonthly: null
    },
    {
      syndicateId,
      level: 3,
      delayDays: 50,
      channels: ['EMAIL'],
      templateSubject: 'Mise en demeure — lot {{lotNumber}}',
      templateBody:
        'Madame, Monsieur, nous vous mettons en demeure de régler sous huit jours la somme de {{outstanding}}. À défaut, une pénalité de 1,5 % par mois sera appliquée conformément au règlement de copropriété.',
      autoSend: false,
      penaltyRateMonthly: 1.5
    }
  );

  // ═══════════════════════════════════════════════════════ références comptables & contrôles
  entryDrafts.sort(
    (a, b) =>
      new Date(a.row.entryDate as Date).getTime() - new Date(b.row.entryDate as Date).getTime() || a.order - b.order
  );
  const refSeq = new Map<string, number>();
  for (const e of entryDrafts) {
    const k = `${e.year}:${e.journal}`;
    const n = (refSeq.get(k) ?? 0) + 1;
    refSeq.set(k, n);
    e.row.reference = `${e.journal}-${e.year}-${pad(n, 4)}`;
    plan.entries.push(e.row);
  }
  for (const l of lotDefs) {
    const acc = accBalance.get(`450${l.num}`) ?? 0;
    const owner = ownerBalance.get(l.id) ?? 0;
    assert(acc === owner, `lot ${l.num} : compte 450 (${acc}) ≠ compte copropriétaire (${owner})`);
  }
  const td = sum(plan.entryLines.map(x => Number(x.debit ?? 0)));
  const tc = sum(plan.entryLines.map(x => Number(x.credit ?? 0)));
  assert(td === tc, 'balance générale déséquilibrée');

  plan.stats = {
    lots: plan.lots.length,
    contacts: plan.contacts.length,
    trimestres: quarters.length,
    appels: plan.calls.length,
    paiements: plan.payments.length,
    relances: plan.reminders.length,
    penalites: plan.penalties.length,
    echeanciers: plan.schedules.length,
    assemblees: plan.meetings.length,
    resolutions: plan.resolutions.length,
    votes: plan.votes.length,
    budgets: plan.budgets.length,
    factures: plan.invoices.length,
    incidents: plan.incidents.length,
    ecritures: plan.entries.length
  };
  return plan;
}
