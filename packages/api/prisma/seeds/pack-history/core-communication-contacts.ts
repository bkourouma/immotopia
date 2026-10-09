/**
 * Carnet CRM des agences Patrimoine (Essentiel et Pro) : le menu CRM › Contacts
 * reste vide parce que le générateur Patrimoine n'écrit que des `tenant_clients`.
 *
 * On crée : un contact par locataire (même e-mail que le client, rôle LOCATAIRE),
 * les propriétaires et associés des structures détenantes (liés à
 * `holding_entities.contactId`), les prestataires déjà payés (dépenses des
 * biens), les assureurs, banquiers, notaires et conseils, quelques prospects.
 * Étiquettes, rôles, sources et canaux variés. Aucun consentement WhatsApp sur
 * les prestataires ; rien n'est envoyé.
 *
 * IDEMPOTENT : saute si le tenant a déjà des contacts CRM.
 */
import type { Prisma } from '@prisma/client';
import { between, pick } from './types';
import type { HistoryContext } from './types';
import { ivorianPhone, slugify } from './agence-data';
import { TAG_DEFS, addDays } from './agence-commercial-data';

const TAGS: readonly { name: string; color: string }[] = [
  { name: 'Locataire', color: '#0369a1' },
  { name: 'Bon payeur', color: '#059669' },
  { name: 'À relancer', color: '#dc2626' },
  { name: 'Propriétaire', color: '#15803d' },
  { name: 'Associé de SCI', color: '#7c3aed' },
  { name: 'Prestataire', color: '#a16207' },
  { name: 'Assurance', color: '#1d4ed8' },
  { name: 'Banque', color: '#0f766e' },
  { name: 'Notaire', color: '#9333ea' },
  { name: 'Conseil', color: '#475569' },
  { name: 'Prospect investisseur', color: '#b45309' },
  { name: 'Diaspora', color: '#c2410c' },
  { name: 'Entreprise', color: '#334155' }
];

// Les noms d'étiquettes communs au catalogue de l'Agence gardent la même couleur.
const TAG_COLOR = new Map(TAG_DEFS.map(t => [t.name, t.color]));

interface Draft {
  firstName: string;
  lastName: string;
  email: string;
  company?: { legalName: string; form: 'SARL' | 'SA' | 'SAS' | 'EI' | 'OTHER' };
  civility?: 'MR' | 'MRS' | 'MS';
  phone?: string;
  whatsapp?: boolean;
  profession?: string;
  sector?: string;
  employer?: string;
  address?: string;
  zone?: string;
  source: string;
  leadSource?: 'WEBSITE' | 'REFERRAL' | 'AGENCY' | 'PHONE_CALL' | 'WALK_IN' | 'SOCIAL_MEDIA';
  status: 'LEAD' | 'ACTIVE_CLIENT' | 'ARCHIVED';
  role?: 'PROPRIETAIRE' | 'LOCATAIRE';
  roleFrom?: Date;
  tags: string[];
  note?: string;
  createdAt: Date;
  channel?: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'SMS';
  hot?: boolean;
  rccm?: string;
  taxId?: string;
  holdingId?: string;
  leaseOverdue?: boolean;
}

const NOTARIES: readonly { first: string; last: string; civ: 'MR' | 'MRS'; study: string; zone: string }[] = [
  { first: 'Aya', last: 'Kouamé', civ: 'MRS', study: 'Étude de Maître Kouamé Aya', zone: 'Plateau' },
  { first: 'Lassina', last: 'Ouattara', civ: 'MR', study: 'Étude de Maître Ouattara Lassina', zone: 'Marcory' },
  { first: 'Fanta', last: 'Coulibaly', civ: 'MRS', study: 'Étude de Maître Coulibaly Fanta', zone: 'Cocody Danga' }
];

const ADVISERS: readonly {
  first: string;
  last: string;
  civ: 'MR' | 'MRS';
  profession: string;
  employer: string;
  tag: string;
}[] = [
  {
    first: 'Désiré',
    last: 'Tanoh',
    civ: 'MR',
    profession: 'Expert-comptable',
    employer: 'Cabinet Tanoh et Associés',
    tag: 'Conseil'
  },
  {
    first: 'Mireille',
    last: 'Adou',
    civ: 'MRS',
    profession: 'Avocate fiscaliste',
    employer: 'Cabinet Adou Juris',
    tag: 'Conseil'
  },
  {
    first: 'Bakary',
    last: 'Sylla',
    civ: 'MR',
    profession: 'Géomètre-expert',
    employer: 'Sylla Topographie',
    tag: 'Conseil'
  }
];

const BANK_PEOPLE = [
  ['Prisca', 'Gnamien', 'MRS'],
  ['Hervé', 'Zadi', 'MR'],
  ['Estelle', 'Brou', 'MRS'],
  ['Dramane', 'Konaté', 'MR'],
  ['Carine', 'Aka', 'MRS'],
  ['Landry', 'Dosso', 'MR'],
  ['Salimata', 'Bakayoko', 'MRS']
] as const;

const INSURANCE_PEOPLE = [
  ['Kader', 'Soro', 'MR'],
  ['Nadège', 'Tapé', 'MRS'],
  ['Rodrigue', 'Yéo', 'MR'],
  ['Sandrine', 'Kacou', 'MRS']
] as const;

const CRAFT_SECTOR: Record<string, string> = {
  Jardins: 'Entretien des espaces verts',
  Groupes: 'Groupes électrogènes et maintenance',
  Peinture: 'Peinture et revêtements',
  'Élec-Habitat': 'Électricité du bâtiment',
  Hygiène: 'Hygiène, dératisation et nettoyage',
  Froid: 'Climatisation et froid',
  Plomberie: 'Plomberie et sanitaire',
  Sécurité: 'Gardiennage et sécurité',
  Bâtiment: 'Bâtiment et rénovation',
  Syndic: 'Gestion de copropriété'
};

const PROSPECTS = [
  {
    first: 'Cédric',
    last: 'Amani',
    hot: true,
    note: 'Cadre en poste à Paris, souhaite confier la gestion de deux appartements à Cocody et acheter un immeuble de rapport.',
    diaspora: true
  },
  {
    first: 'Hortense',
    last: 'Gbané',
    hot: false,
    note: 'Retraitée de la fonction publique, veut sécuriser un complément de revenus avec un petit immeuble locatif.',
    diaspora: false
  },
  {
    first: 'Moussa',
    last: 'Fofana',
    hot: true,
    note: 'Commerçant à Adjamé, cherche à placer ses bénéfices dans la pierre et à structurer sa détention en SCI.',
    diaspora: false
  }
] as const;

const FIRST_NAMES_F = new Set(['Aya', 'Fatoumata', 'Mariam', 'Adjoua', 'Aminata', 'Estelle']);

function slugEmail(first: string, last: string, domain: string): string {
  return `${slugify(first)}.${slugify(last)}@${domain}`;
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export async function seedPatrimoineContacts(ctx: HistoryContext, pack: string): Promise<void> {
  const { prisma, tenantId, rng, end, start, log } = ctx;
  if ((await prisma.crmContact.count({ where: { tenantId } })) > 0) {
    log('core-communication contacts : déjà présents.');
    return;
  }
  const pro = pack === 'PATRIMOINE_PRO';
  const members = await prisma.membership.findMany({
    where: { tenantId, status: 'ACTIVE' },
    select: { userId: true }
  });
  const staff = Array.from(new Set([ctx.adminUserId, ...members.map(m => m.userId)]));

  const drafts: Draft[] = [];

  // ───────────────────────────────────────────────────────────── locataires
  const renters = await prisma.tenantClient.findMany({
    where: { tenantId, clientType: 'RENTER' },
    select: {
      id: true,
      createdAt: true,
      user: { select: { email: true, fullName: true } }
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  const leases = await prisma.rentalLease.findMany({
    where: { tenant_id: tenantId },
    select: { primary_renter_client_id: true, start_date: true },
    orderBy: { start_date: 'asc' }
  });
  const firstLease = new Map<string, Date>();
  for (const l of leases)
    if (!firstLease.has(l.primary_renter_client_id)) firstLease.set(l.primary_renter_client_id, l.start_date);
  const overdue = await prisma.rentalInstallment.findMany({
    where: { tenant_id: tenantId, status: { in: ['OVERDUE', 'PARTIAL'] } },
    select: { lease: { select: { primary_renter_client_id: true } } }
  });
  const lateClients = new Set(overdue.map(o => o.lease.primary_renter_client_id));
  for (const r of renters) {
    const fullName = r.user.fullName ?? 'Locataire';
    const isCompany = /^(Pharmacie|Société|Cabinet|SARL|SA |Boutique|Restaurant)/i.test(fullName);
    const lateStory = lateClients.has(r.id);
    const since = firstLease.get(r.id) ?? r.createdAt;
    const person = isCompany
      ? {
          first: pick(rng, ['Koffi', 'Mariam', 'Yacouba', 'Adjoua', 'Serge', 'Aminata']),
          last: pick(rng, ['Kouadio', 'Diabaté', 'Bamba', 'Konaté', 'Ouédraogo'])
        }
      : splitName(fullName);
    drafts.push({
      firstName: person.first,
      lastName: person.last,
      email: r.user.email,
      company: isCompany ? { legalName: fullName, form: fullName.startsWith('Société') ? 'SARL' : 'EI' } : undefined,
      civility: FIRST_NAMES_F.has(person.first) ? pick(rng, ['MRS', 'MS'] as const) : 'MR',
      phone: ivorianPhone(rng),
      whatsapp: rng() < 0.8,
      profession: isCompany
        ? 'Gérant'
        : pick(rng, [
            'Cadre bancaire',
            'Enseignant',
            'Ingénieur',
            'Commerçant',
            'Comptable',
            'Infirmier',
            'Consultant'
          ]),
      source: lateStory
        ? 'Gestion locative'
        : pick(rng, ['Gestion locative', 'Recommandation d’un locataire', 'Annonce en ligne']),
      leadSource: 'AGENCY',
      status: 'ACTIVE_CLIENT',
      role: 'LOCATAIRE',
      roleFrom: since,
      tags: [
        'Locataire',
        ...(lateStory ? ['À relancer'] : rng() < 0.6 ? ['Bon payeur'] : []),
        ...(isCompany ? ['Entreprise'] : [])
      ],
      note: lateStory ? 'A régularisé son retard après relance ; suivre l’échéance du mois prochain.' : undefined,
      createdAt: r.createdAt,
      channel: pick(rng, ['WHATSAPP', 'WHATSAPP', 'CALL', 'EMAIL'] as const),
      leaseOverdue: lateStory
    });
  }

  // ───────────────────────────────────────── propriétaires et associés (SCI…)
  const holdings = await prisma.holdingEntity.findMany({
    where: { tenantId },
    select: { id: true, name: true, rccm: true, taxId: true, contactId: true, createdAt: true, legalForm: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  const associateNames = [
    ['Adjoua', 'Kouassi'],
    ['Serge', 'Kouassi'],
    ['Nathalie', 'Koffi-Kouassi'],
    ['Patrick', 'Kouassi'],
    ['Awa', 'Diomandé']
  ] as const;
  let ai = 0;
  for (const h of holdings) {
    if (h.contactId) continue;
    const physical = /personne physique/i.test(h.name);
    const legalName = h.name.replace(/\s*\(personne physique\)\s*/i, '').trim();
    if (physical) {
      // Titulaire en nom propre : la fiche porte son identité (le nom de la structure peut être technique).
      const named = /^M\.\s+(\w+)\s+(.+)$/.exec(legalName);
      const person = named ? { first: named[1], last: named[2] } : { first: 'Célestin', last: 'Kouassi' };
      drafts.push({
        firstName: person.first,
        lastName: person.last,
        email: slugEmail(person.first, person.last, 'kouassi-famille.test'),
        civility: FIRST_NAMES_F.has(person.first) ? 'MRS' : 'MR',
        phone: ivorianPhone(rng),
        whatsapp: true,
        profession: 'Chef d’entreprise',
        sector: 'Commerce et distribution',
        source: 'Création du dossier patrimonial',
        leadSource: 'REFERRAL',
        status: 'ACTIVE_CLIENT',
        role: 'PROPRIETAIRE',
        roleFrom: h.createdAt,
        tags: ['Propriétaire'],
        note: 'Détient une partie du parc en nom propre ; reçoit le rapport patrimonial chaque mois.',
        createdAt: h.createdAt,
        channel: 'WHATSAPP',
        holdingId: h.id
      });
    } else {
      const person = {
        first: associateNames[ai % associateNames.length][0],
        last: associateNames[ai % associateNames.length][1]
      };
      ai += 1;
      drafts.push({
        firstName: person.first,
        lastName: person.last,
        email: `contact@${slugify(legalName)}.test`,
        company: { legalName, form: /SARL/i.test(legalName) ? 'SARL' : 'OTHER' },
        civility: 'MR',
        phone: ivorianPhone(rng),
        whatsapp: false,
        profession: 'Gérant',
        source: 'Création de la structure détenante',
        leadSource: 'REFERRAL',
        status: 'ACTIVE_CLIENT',
        role: 'PROPRIETAIRE',
        roleFrom: h.createdAt,
        tags: ['Propriétaire', 'Entreprise'],
        note: `Structure détenant une partie du parc (${legalName}). Représentée par son gérant.`,
        createdAt: h.createdAt,
        channel: 'EMAIL',
        rccm: h.rccm ?? undefined,
        taxId: h.taxId ?? undefined,
        holdingId: h.id
      });
    }
  }
  // Associés des SCI (personnes physiques).
  const associates = pro ? 4 : 2;
  for (let i = 0; i < associates; i++) {
    const [first, last] = associateNames[(ai + i) % associateNames.length];
    drafts.push({
      firstName: first,
      lastName: last,
      email: slugEmail(first, last, i % 2 === 0 ? 'mail-ci.test' : 'courrier-ci.test'),
      civility: FIRST_NAMES_F.has(first) ? 'MRS' : 'MR',
      phone: ivorianPhone(rng),
      whatsapp: true,
      profession: pick(rng, ['Médecin', 'Cadre supérieur', 'Pharmacien', 'Enseignant-chercheur']),
      source: 'Associé d’une structure détenante',
      leadSource: 'REFERRAL',
      status: 'ACTIVE_CLIENT',
      role: 'PROPRIETAIRE',
      roleFrom: addDays(start, between(rng, 15, 300)),
      tags: ['Propriétaire', 'Associé de SCI', ...(i === 1 ? ['Diaspora'] : [])],
      note: 'Associé minoritaire : reçoit le compte rendu annuel de la structure.',
      createdAt: addDays(start, between(rng, 10, 250)),
      channel: pick(rng, ['WHATSAPP', 'EMAIL'] as const)
    });
  }

  // ───────────────────────────────────────────────────────────── prestataires
  const suppliers = await prisma.propertyExpense.groupBy({
    by: ['supplierName'],
    where: { tenantId, supplierName: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { supplierName: 'desc' } }
  });
  const insurers = await prisma.insurancePolicy.findMany({
    where: { tenantId },
    distinct: ['insurer'],
    select: { insurer: true },
    orderBy: { insurer: 'asc' }
  });
  const lenders = await prisma.propertyLoan.findMany({
    where: { tenantId },
    distinct: ['lender'],
    select: { lender: true },
    orderBy: { lender: 'asc' }
  });
  const insurerSet = new Set(insurers.map(i => i.insurer));
  const SKIP = /Direction générale des impôts|CIE|SODECI/i;
  let nSup = 0;
  for (const s of suppliers) {
    const name = s.supplierName as string;
    if (insurerSet.has(name) || SKIP.test(name) || nSup >= (pro ? 12 : 9)) continue;
    nSup += 1;
    const key = Object.keys(CRAFT_SECTOR).find(k => name.startsWith(k)) ?? '';
    const contact = splitName(
      [
        'Ibrahim Touré',
        'Daniel Kobenan',
        'Alain Oulaï',
        'Moussa Sidibé',
        'Franck Assi',
        'Joël Tchimou',
        'Boris Anoh',
        'Cheick Doumbia',
        'Raoul Gbagbo',
        'Hamed Cissé',
        'Eugène Yapi',
        'Léon Zoko'
      ][(nSup - 1) % 12]
    );
    drafts.push({
      firstName: contact.first,
      lastName: contact.last,
      email: `contact@${slugify(name)}.test`,
      company: { legalName: name, form: pick(rng, ['SARL', 'SARL', 'SAS', 'EI'] as const) },
      civility: 'MR',
      phone: ivorianPhone(rng),
      whatsapp: false,
      profession: 'Gérant',
      sector: CRAFT_SECTOR[key] ?? 'Entretien et travaux',
      source: 'Prestataire référencé',
      leadSource: pick(rng, ['REFERRAL', 'PHONE_CALL', 'WALK_IN'] as const),
      status: 'ACTIVE_CLIENT',
      tags: ['Prestataire', 'Entreprise'],
      note: `Intervient sur le parc depuis plusieurs années (${s._count._all} interventions ou factures enregistrées).`,
      createdAt: addDays(start, between(rng, 30, 700)),
      channel: 'CALL'
    });
  }

  // ───────────────────────────────────────────────── assureurs, banques
  insurers.forEach((ins, i) => {
    const [first, last, civ] = INSURANCE_PEOPLE[i % INSURANCE_PEOPLE.length];
    drafts.push({
      firstName: first,
      lastName: last,
      email: slugEmail(first, last, `${slugify(ins.insurer)}.test`),
      civility: civ,
      phone: ivorianPhone(rng),
      whatsapp: true,
      profession: 'Chargé de clientèle entreprises',
      sector: 'Assurance',
      employer: ins.insurer,
      source: 'Courtage et contrats d’assurance',
      leadSource: 'PHONE_CALL',
      status: 'ACTIVE_CLIENT',
      tags: ['Assurance'],
      note: `Interlocuteur pour les polices multirisques et les déclarations de sinistre chez ${ins.insurer}.`,
      createdAt: addDays(start, between(rng, 20, 500)),
      channel: 'EMAIL'
    });
  });
  lenders
    .filter(l => !/Prêt familial/i.test(l.lender))
    .forEach((l, i) => {
      const [first, last, civ] = BANK_PEOPLE[i % BANK_PEOPLE.length];
      drafts.push({
        firstName: first,
        lastName: last,
        email: slugEmail(first, last, `${slugify(l.lender)}.test`),
        civility: civ,
        phone: ivorianPhone(rng),
        whatsapp: true,
        profession: 'Chargé d’affaires patrimoine',
        sector: 'Banque et finance',
        employer: l.lender,
        source: 'Financement de biens',
        leadSource: 'REFERRAL',
        status: 'ACTIVE_CLIENT',
        tags: ['Banque'],
        note: `Suit les prêts immobiliers du dossier chez ${l.lender} ; contact pour les renégociations de taux.`,
        createdAt: addDays(start, between(rng, 20, 600)),
        channel: 'CALL'
      });
    });

  // ───────────────────────────────────────────────────── notaires et conseils
  NOTARIES.forEach((n, i) => {
    drafts.push({
      firstName: n.first,
      lastName: n.last,
      email: slugEmail(n.first, n.last, 'notaires-ci.test'),
      civility: n.civ,
      phone: ivorianPhone(rng),
      whatsapp: false,
      profession: 'Notaire',
      sector: 'Services juridiques',
      employer: n.study,
      zone: n.zone,
      source: 'Réseau professionnel',
      leadSource: 'REFERRAL',
      status: 'ACTIVE_CLIENT',
      tags: ['Notaire'],
      note:
        i === 0
          ? 'Rédige les actes de vente et de donation du dossier ; étude très réactive sur les titres fonciers.'
          : 'Intervient ponctuellement pour les successions et les constitutions de SCI.',
      createdAt: addDays(start, between(rng, 20, 400)),
      channel: 'EMAIL'
    });
  });
  ADVISERS.slice(0, pro ? 3 : 2).forEach(a => {
    drafts.push({
      firstName: a.first,
      lastName: a.last,
      email: slugEmail(a.first, a.last, 'conseil-ci.test'),
      civility: a.civ,
      phone: ivorianPhone(rng),
      whatsapp: true,
      profession: a.profession,
      sector: 'Conseil',
      employer: a.employer,
      source: 'Réseau professionnel',
      leadSource: 'REFERRAL',
      status: 'ACTIVE_CLIENT',
      tags: [a.tag],
      note: `${a.profession} partenaire : consulté pour la fiscalité, les titres et la structuration du patrimoine.`,
      createdAt: addDays(start, between(rng, 30, 450)),
      channel: 'EMAIL'
    });
  });

  // ───────────────────────────────────────────────── prospects et archivé
  PROSPECTS.slice(0, pro ? 3 : 2).forEach((p, i) => {
    drafts.push({
      firstName: p.first,
      lastName: p.last,
      email: slugEmail(p.first, p.last, 'prospect-patrimoine.test'),
      civility: 'MR',
      phone: ivorianPhone(rng),
      whatsapp: true,
      profession: pick(rng, ['Cadre supérieur', 'Commerçant', 'Fonctionnaire retraité']),
      source: i === 0 ? 'Site web' : 'Recommandation d’un client',
      leadSource: i === 0 ? 'WEBSITE' : 'REFERRAL',
      status: 'LEAD',
      tags: ['Prospect investisseur', ...(p.diaspora ? ['Diaspora'] : [])],
      note: p.note,
      createdAt: addDays(end, -between(rng, 8, 90)),
      channel: 'WHATSAPP',
      hot: p.hot
    });
  });
  drafts.push({
    firstName: 'Aboubacar',
    lastName: 'Sanogo',
    email: slugEmail('Aboubacar', 'Sanogo', 'mail-ci.test'),
    civility: 'MR',
    phone: ivorianPhone(rng),
    whatsapp: false,
    profession: 'Ingénieur',
    source: 'Gestion locative',
    leadSource: 'AGENCY',
    status: 'ARCHIVED',
    role: 'LOCATAIRE',
    roleFrom: addDays(start, 20),
    tags: ['Locataire'],
    note: 'Ancien locataire : bail terminé, dépôt de garantie restitué. Dossier conservé pour référence.',
    createdAt: addDays(start, 20),
    channel: 'CALL'
  });

  // ───────────────────────────────────────────────────────────── écriture
  const tagIds = new Map<string, string>();
  for (const def of TAGS) {
    const row = await prisma.crmTag.upsert({
      where: { tenantId_name: { tenantId, name: def.name } },
      update: {},
      create: { tenantId, name: def.name, color: TAG_COLOR.get(def.name) ?? def.color },
      select: { id: true }
    });
    tagIds.set(def.name, row.id);
  }

  let created = 0;
  let linked = 0;
  const seen = new Set<string>();
  for (const d of drafts) {
    const email = d.email.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const isCompany = Boolean(d.company);
    const archived = d.status === 'ARCHIVED';
    const income = between(rng, 450, 2200) * 1000;
    const data: Prisma.CrmContactUncheckedCreateInput = {
      tenantId,
      contactType: isCompany ? 'COMPANY' : 'PERSON',
      civility: d.civility,
      firstName: d.firstName,
      lastName: d.lastName,
      legalName: d.company?.legalName ?? null,
      legalForm: d.company?.form ?? null,
      rccm: d.rccm ?? (isCompany ? `CI-ABJ-${between(rng, 2009, 2022)}-B-${between(rng, 1000, 29999)}` : null),
      taxId: d.taxId ?? (isCompany ? `${between(rng, 1000000, 2999999)}${pick(rng, ['A', 'B', 'C'])}` : null),
      representativeName: isCompany ? `${d.firstName} ${d.lastName}` : null,
      representativeRole: isCompany ? 'Gérant' : null,
      email,
      phonePrimary: d.phone ?? null,
      whatsappNumber: d.whatsapp ? (d.phone ?? null) : null,
      address: d.zone ? `${d.zone}, Abidjan` : null,
      city: 'Abidjan',
      country: "Côte d'Ivoire",
      locationZone: d.zone ?? pick(rng, ['Cocody Riviera', 'Cocody Angré', 'Marcory Zone 4', 'Plateau', 'Bingerville']),
      preferredLanguage: 'fr',
      preferredContactChannel: d.channel ?? null,
      profession: d.profession ?? null,
      sectorOfActivity: d.sector ?? null,
      employer: d.employer ?? null,
      incomeMin: d.status === 'LEAD' || d.role === 'LOCATAIRE' ? Math.round(income * 0.9) : null,
      incomeMax: d.status === 'LEAD' || d.role === 'LOCATAIRE' ? Math.round(income * 1.1) : null,
      source: d.source,
      leadSource: d.leadSource ?? null,
      maturityLevel: d.status === 'LEAD' ? (d.hot ? 'HOT' : 'WARM') : 'COLD',
      score: d.hot ? between(rng, 70, 92) : between(rng, 15, 65),
      responsivenessRate: between(rng, 40, 98),
      status: d.status,
      assignedToUserId: pick(rng, staff),
      priorityLevel: d.hot ? 'HIGH' : archived ? 'LOW' : 'NORMAL',
      paymentIncidentsCount: d.leaseOverdue ? 1 : 0,
      consentEmail: !archived,
      consentMarketing: !archived && rng() < 0.8,
      consentWhatsapp: Boolean(d.whatsapp) && !archived,
      consentDate: addDays(d.createdAt, between(rng, 0, 3)),
      consentSource: 'Formulaire en agence',
      internalNotes: d.note ?? null,
      lastInteractionAt: archived
        ? addDays(d.createdAt, between(rng, 200, 600))
        : addDays(end, -between(rng, 1, d.status === 'LEAD' ? 25 : 120)),
      nextActionAt: d.status === 'LEAD' ? addDays(end, between(rng, 1, 14)) : null,
      projectIntentJson:
        d.status === 'LEAD'
          ? {
              transaction: 'ACHAT',
              propertyTypes: [pick(rng, ['IMMEUBLE', 'APPARTEMENT', 'MAISON_VILLA'])],
              budgetMax: between(rng, 60, 400) * 1_000_000,
              zones: ['Cocody Angré', 'Bingerville', 'Marcory Zone 4'].slice(0, between(rng, 1, 3)),
              timeline: pick(rng, ['Sous 3 mois', 'Sous 6 mois', 'Dans l’année'])
            }
          : undefined,
      createdAt: d.createdAt
    };
    const row = await prisma.crmContact.create({ data, select: { id: true } });
    created += 1;
    if (d.role) {
      await prisma.crmContactRole.create({
        data: {
          tenantId,
          contactId: row.id,
          role: d.role,
          active: !archived,
          startedAt: d.roleFrom ?? d.createdAt,
          endedAt: archived ? addDays(d.createdAt, between(rng, 200, 600)) : null
        }
      });
    }
    const tagRows = d.tags
      .map(name => tagIds.get(name))
      .filter((x): x is string => Boolean(x))
      .map(tagId => ({ contactId: row.id, tagId, createdAt: addDays(d.createdAt, between(rng, 0, 20)) }));
    if (tagRows.length > 0) await prisma.crmContactTag.createMany({ data: tagRows, skipDuplicates: true });
    if (d.holdingId) {
      await prisma.holdingEntity.updateMany({
        where: { id: d.holdingId, tenantId, contactId: null },
        data: { contactId: row.id }
      });
      linked += 1;
    }
  }
  log(
    `core-communication contacts : ${created} contacts CRM, ${tagIds.size} étiquettes, ${linked} structures reliées à leur fiche.`
  );
}
