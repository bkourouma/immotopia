/**
 * SYNDIC — contacts CRM variés : après 3 ans, le carnet d'un syndic ne contient pas que des
 * « clients actifs » à score 0. Diversifie les fiches existantes (sources, scores, priorités,
 * archivage des anciens occupants, étiquettes) puis ajoute prospects, fournisseurs et gardiens.
 *
 * Idempotent par bloc : fiches existantes repérées par `score = 0` + source d'origine ; fiches
 * ajoutées repérées par la marque `[seed:syndic-fixes:crm]` ; étiquettes créées par nom (celles
 * qu'un autre générateur a déjà posées sur l'agence sont réutilisées, jamais dupliquées).
 */
import { createHash, randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { FIRST_NAMES_F, FIRST_NAMES_M, LAST_NAMES, PROFESSIONS } from './syndic-data';
import { addDays, between, ivorianPhone, num, pickOne, shuffle, slug, type SyndicEnv } from './syndic-extras-common';

const MARK = '[seed:syndic-fixes:crm]';
const ORIGIN_SOURCE = 'Syndic de copropriété';

type LeadSourceValue =
  'WEBSITE' | 'SOCIAL_MEDIA' | 'REFERRAL' | 'CAMPAIGN' | 'AGENCY' | 'WALK_IN' | 'PHONE_CALL' | 'OTHER';

/** Source affichée → énumération `LeadSource`. */
const SOURCES: Record<string, LeadSourceValue> = {
  'Syndic de copropriété': 'OTHER',
  Recommandation: 'REFERRAL',
  'Assemblée générale': 'OTHER',
  'Site web': 'WEBSITE',
  'Passage en agence': 'WALK_IN',
  'Appel entrant': 'PHONE_CALL',
  'Agence partenaire': 'AGENCY',
  'Réseaux sociaux': 'SOCIAL_MEDIA',
  'Campagne d’information': 'CAMPAIGN',
  'Propriétaire du lot': 'REFERRAL',
  'Annonce en ligne': 'WEBSITE',
  'Mutation du lot': 'OTHER',
  'Annuaire des prestataires': 'OTHER',
  'Appel d’offres': 'OTHER',
  'Embauche directe': 'OTHER'
};

const OWNER_SOURCES = [
  ORIGIN_SOURCE,
  ORIGIN_SOURCE,
  ORIGIN_SOURCE,
  ORIGIN_SOURCE,
  'Recommandation',
  'Recommandation',
  'Assemblée générale',
  'Assemblée générale',
  'Site web',
  'Passage en agence',
  'Appel entrant',
  'Agence partenaire'
];
const TENANT_SOURCES = [
  ORIGIN_SOURCE,
  ORIGIN_SOURCE,
  'Propriétaire du lot',
  'Propriétaire du lot',
  'Propriétaire du lot',
  'Annonce en ligne',
  'Recommandation',
  'Passage en agence'
];
const FORMER_SOURCES = [ORIGIN_SOURCE, 'Mutation du lot', 'Recommandation'];
const PROSPECT_SOURCES = [
  'Site web',
  'Site web',
  'Recommandation',
  'Recommandation',
  'Réseaux sociaux',
  'Réseaux sociaux',
  'Passage en agence',
  'Appel entrant',
  'Campagne d’information',
  'Agence partenaire'
];

interface TagDef {
  name: string;
  color: string;
}
const TAGS: TagDef[] = [
  { name: 'Copropriétaire', color: '#1677ff' },
  { name: 'Ancien copropriétaire', color: '#8c8c8c' },
  { name: 'Locataire de lot', color: '#13c2c2' },
  { name: 'Ancien locataire', color: '#bfbfbf' },
  { name: 'Propriétaire bailleur', color: '#722ed1' },
  { name: 'Indivisaire', color: '#eb2f96' },
  { name: 'Conseil syndical', color: '#fa8c16' },
  { name: 'Débiteur', color: '#f5222d' },
  { name: 'Bon payeur', color: '#52c41a' },
  { name: 'Diaspora', color: '#2f54eb' },
  { name: 'Fournisseur', color: '#a0d911' },
  { name: 'Gardien', color: '#faad14' },
  { name: 'Prospect copropriété', color: '#fa541c' },
  { name: 'À relancer', color: '#ff7a45' }
];

const hashInt = (text: string): number => createHash('md5').update(text).digest().readUInt32BE(0);
const byHash = <T>(items: T[], key: (t: T) => string, salt: string): T[] =>
  [...items].sort((a, b) => hashInt(`${salt}:${key(a)}`) - hashInt(`${salt}:${key(b)}`));

const maturityOf = (score: number): 'COLD' | 'WARM' | 'HOT' => (score >= 75 ? 'HOT' : score >= 50 ? 'WARM' : 'COLD');

async function ensureTags(env: SyndicEnv): Promise<Map<string, string>> {
  const { prisma, tenantId } = env;
  const ids = new Map<string, string>();
  for (const def of TAGS) {
    const found = await prisma.crmTag.findFirst({ where: { tenantId, name: def.name }, select: { id: true } });
    const id =
      found?.id ??
      (await prisma.crmTag.create({ data: { tenantId, name: def.name, color: def.color }, select: { id: true } })).id;
    ids.set(def.name, id);
  }
  return ids;
}

// ───────────────────────────────────────────────────── fiches existantes

async function diversifyExisting(env: SyndicEnv): Promise<number> {
  const { prisma, tenantId, rng, end } = env;
  // Les fiches du générateur d'origine portaient la date du seed (« nouveau client aujourd'hui ») :
  // elles datent de l'arrivée du copropriétaire, pour que l'activité récente soit celle d'une vraie agence.
  const redated = await prisma.$executeRaw`
    UPDATE crm_contacts c
    SET created_at = r.started_at + interval '9 hours'
    FROM (SELECT contact_id, MIN(started_at) AS started_at FROM crm_contact_roles WHERE tenant_id = ${tenantId} GROUP BY contact_id) r
    WHERE r.contact_id = c.id AND c.tenant_id = ${tenantId}
      AND c.internal_notes LIKE '[seed:pack-history:syndic%'
      AND c.created_at > r.started_at + interval '1 day'`;
  if (redated > 0) env.log(`syndic-fixes CRM : ${redated} fiche(s) redatée(s) à l’arrivée du copropriétaire`);
  const contacts = await prisma.crmContact.findMany({
    where: {
      tenantId,
      source: ORIGIN_SOURCE,
      score: 0,
      internalNotes: { startsWith: '[seed:pack-history:syndic' }
    },
    select: { id: true, createdAt: true, roles: { select: { role: true, active: true } } },
    orderBy: { id: 'asc' }
  });
  if (contacts.length === 0) return 0;
  const balances = await prisma.ownerAccount.groupBy({
    by: ['contactId'],
    where: { syndicate: { tenantId } },
    _sum: { balance: true }
  });
  const balanceOf = new Map(balances.map(b => [b.contactId, num(b._sum.balance)]));
  const zones = ['Cocody Riviera', 'Plateau', 'Marcory Zone 4', 'Yopougon', 'Bingerville', 'Cocody Angré'];
  let done = 0;
  for (const c of contacts) {
    const activeOwner = c.roles.some(r => r.role === 'COOWNER' && r.active);
    const activeTenant = c.roles.some(r => r.role === 'TENANT' && r.active);
    const hasActive = activeOwner || activeTenant;
    const group = activeOwner ? 'owner' : activeTenant ? 'tenant' : 'former';
    const source = pickOne(
      rng,
      group === 'owner' ? OWNER_SOURCES : group === 'tenant' ? TENANT_SOURCES : FORMER_SOURCES
    );
    const balance = balanceOf.get(c.id) ?? 0;
    // les bons payeurs ont un score élevé, les débiteurs un score bas : le chiffre raconte quelque chose
    const score =
      group === 'former'
        ? between(rng, 8, 38)
        : balance > 100_000
          ? between(rng, 22, 52)
          : group === 'owner'
            ? between(rng, 58, 97)
            : between(rng, 35, 82);
    const lastInteractionAt = hasActive
      ? addDays(end, -between(rng, 1, balance > 100_000 ? 40 : 260))
      : addDays(end, -between(rng, 120, 800));
    const data: Prisma.CrmContactUpdateInput = {
      source,
      leadSource: SOURCES[source] ?? 'OTHER',
      score,
      maturityLevel: maturityOf(score),
      status: hasActive ? 'ACTIVE_CLIENT' : 'ARCHIVED',
      priorityLevel: balance > 250_000 ? 'HIGH' : score >= 85 ? 'HIGH' : score < 30 ? 'LOW' : 'NORMAL',
      lastInteractionAt,
      assignedTo: env.staff.length > 0 ? { connect: { id: env.staff[hashInt(c.id) % env.staff.length] } } : undefined,
      balance: group === 'owner' ? balance : undefined,
      totalDue: group === 'owner' ? Math.max(0, balance) : undefined,
      paymentIncidentsCount:
        group === 'owner' ? (balance > 250_000 ? between(rng, 3, 8) : balance > 0 ? between(rng, 1, 3) : 0) : undefined,
      responsivenessRate: hasActive ? Math.round((55 + rng() * 45) * 100) / 100 : undefined,
      locationZone: pickOne(rng, zones)
    };
    if (hasActive && balance > 100_000) data.nextActionAt = addDays(end, between(rng, 1, 10));
    else if (hasActive && rng() < 0.15) data.nextActionAt = addDays(end, between(rng, 5, 45));
    await prisma.crmContact.update({ where: { id: c.id }, data });
    done++;
  }
  return done;
}

// ───────────────────────────────────────────────────────── étiquettes

async function tagExisting(env: SyndicEnv, tags: Map<string, string>): Promise<number> {
  const { prisma, tenantId } = env;
  const linkCount = async (name: string) =>
    prisma.crmContactTag.count({ where: { tagId: tags.get(name)!, contact: { tenantId } } });
  const rows: Array<{ contactId: string; tagName: string }> = [];
  const attach = async (name: string, ids: string[]) => {
    if (ids.length === 0 || (await linkCount(name)) > 0) return;
    for (const contactId of ids) rows.push({ contactId, tagName: name });
  };

  const roles = await prisma.crmContactRole.findMany({
    where: { tenantId, role: { in: ['COOWNER', 'TENANT'] } },
    select: { contactId: true, role: true, active: true }
  });
  const activeOwners = new Set(roles.filter(r => r.role === 'COOWNER' && r.active).map(r => r.contactId));
  const activeTenants = new Set(roles.filter(r => r.role === 'TENANT' && r.active).map(r => r.contactId));
  const allOwners = new Set(roles.filter(r => r.role === 'COOWNER').map(r => r.contactId));
  const allTenants = new Set(roles.filter(r => r.role === 'TENANT').map(r => r.contactId));
  await attach('Copropriétaire', [...activeOwners]);
  await attach(
    'Ancien copropriétaire',
    [...allOwners].filter(id => !activeOwners.has(id))
  );
  await attach('Locataire de lot', [...activeTenants]);
  await attach(
    'Ancien locataire',
    [...allTenants].filter(id => !activeTenants.has(id) && !activeOwners.has(id))
  );

  const profiles = await prisma.lotOwnerProfile.findMany({
    where: { lot: { syndicate: { tenantId } }, isActive: true, ownedUntil: null },
    select: { contactId: true, lotId: true, lot: { select: { syndicateId: true, lotType: true } } }
  });
  const perLot = new Map<string, string[]>();
  for (const p of profiles) perLot.set(p.lotId, [...(perLot.get(p.lotId) ?? []), p.contactId]);
  await attach('Indivisaire', [...new Set([...perLot.values()].filter(g => g.length > 1).flat())]);
  const rented = await prisma.lotTenantProfile.findMany({
    where: { lot: { syndicate: { tenantId } }, isCurrent: true },
    select: { lotId: true }
  });
  const rentedLots = new Set(rented.map(r => r.lotId));
  await attach('Propriétaire bailleur', [
    ...new Set(profiles.filter(p => rentedLots.has(p.lotId)).map(p => p.contactId))
  ]);

  const balances = await prisma.ownerAccount.groupBy({
    by: ['contactId'],
    where: { syndicate: { tenantId } },
    _sum: { balance: true }
  });
  const balanceOf = new Map(balances.map(b => [b.contactId, num(b._sum.balance)]));
  const owners = [...activeOwners];
  await attach(
    'Débiteur',
    owners.filter(id => (balanceOf.get(id) ?? 0) > 100_000)
  );
  await attach(
    'Bon payeur',
    owners.filter(id => (balanceOf.get(id) ?? 0) <= 0)
  );
  await attach('Diaspora', byHash(owners, id => id, 'diaspora').slice(0, Math.max(3, Math.round(owners.length * 0.1))));

  // conseil syndical : cinq copropriétaires à jour par copropriété, choix stable (empreinte)
  const council: string[] = [];
  for (const s of env.syndicates) {
    const eligible = [
      ...new Set(
        profiles.filter(p => p.lot.syndicateId === s.id && p.lot.lotType === 'APARTMENT').map(p => p.contactId)
      )
    ].filter(id => (balanceOf.get(id) ?? 0) <= 0);
    council.push(...byHash(eligible, id => id, `conseil:${s.id}`).slice(0, 5));
  }
  await attach('Conseil syndical', council);

  if (rows.length === 0) return 0;
  const res = await prisma.crmContactTag.createMany({
    data: rows.map(r => ({ contactId: r.contactId, tagId: tags.get(r.tagName)! })),
    skipDuplicates: true
  });
  return res.count;
}

// ──────────────────────────────────────────────────── fiches ajoutées

const PROSPECT_NOTES = [
  'Cherche un appartement en copropriété sécurisée avec gardiennage et ascenseur.',
  'Souhaite connaître le niveau des charges et le fonds de travaux avant de se décider.',
  'Investisseur : veut un lot à louer, rendement net visé supérieur à 7 %.',
  'Visite de la résidence prévue avec le président du conseil syndical.',
  'Candidat à l’achat d’un lot en rez-de-chaussée commercial.',
  'Diaspora : décisions à distance, privilégier WhatsApp et les visites vidéo.',
  'A demandé le règlement de copropriété et les trois derniers procès-verbaux d’assemblée.',
  'Hésite entre deux résidences du portefeuille ; relance prévue après sa visite.'
];

async function addNewContacts(env: SyndicEnv, tags: Map<string, string>): Promise<number> {
  const { prisma, tenantId, rng, end, start } = env;
  const exists = await prisma.crmContact.count({ where: { tenantId, internalNotes: { startsWith: MARK } } });
  if (exists > 0) return 0;
  const taken = new Set(
    (await prisma.crmContact.findMany({ where: { tenantId }, select: { email: true } })).map(c => c.email)
  );
  const uniqueEmail = (base: string, domain: string): string => {
    let email = `${base}@${domain}`;
    for (let n = 2; taken.has(email); n++) email = `${base}${n}@${domain}`;
    taken.add(email);
    return email;
  };
  const history = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  const contacts: Prisma.CrmContactCreateManyInput[] = [];
  const tagRows: Array<{ contactId: string; tag: string }> = [];
  const zones = ['Cocody Riviera', 'Plateau', 'Marcory Zone 4', 'Yopougon', 'Bingerville', 'Cocody Angré'];
  const person = (kind: string) => {
    const female = rng() < 0.45;
    const first = pickOne(rng, female ? FIRST_NAMES_F : FIRST_NAMES_M);
    const last = pickOne(rng, LAST_NAMES);
    return { female, first, last, base: `${slug(first)}.${slug(last)}${kind}` };
  };

  // 1. prospects et candidats copropriétaires (LEAD), dont 3 perdus (ARCHIVED)
  const prospectCount = 18;
  for (let i = 0; i < prospectCount; i++) {
    const p = person('');
    const lost = i >= prospectCount - 3;
    const recent = i < 5;
    const createdAt = recent ? addDays(end, -between(rng, 1, 24)) : addDays(end, -between(rng, 30, history));
    const score = lost ? between(rng, 5, 25) : between(rng, 25, 92);
    const source = pickOne(rng, PROSPECT_SOURCES);
    const budgetMax = between(rng, 18, 120) * 1_000_000;
    const id = randomUUID();
    contacts.push({
      id,
      tenantId,
      contactType: 'PERSON',
      civility: p.female ? 'MRS' : 'MR',
      firstName: p.first,
      lastName: p.last,
      email: uniqueEmail(p.base, 'prospects.test'),
      phonePrimary: ivorianPhone(rng),
      city: 'Abidjan',
      country: "Côte d'Ivoire",
      nationality: 'Ivoirienne',
      profession: pickOne(rng, PROFESSIONS),
      preferredLanguage: 'fr',
      preferredContactChannel: pickOne(rng, ['WHATSAPP', 'CALL', 'EMAIL'] as const),
      source,
      leadSource: SOURCES[source],
      score,
      maturityLevel: maturityOf(score),
      status: lost ? 'ARCHIVED' : 'LEAD',
      priorityLevel: score >= 80 ? 'HIGH' : 'NORMAL',
      assignedToUserId: pickOne(rng, env.staff),
      lastInteractionAt: lost ? addDays(createdAt, between(rng, 10, 60)) : addDays(end, -between(rng, 1, 30)),
      nextActionAt: !lost && rng() < 0.55 ? addDays(end, between(rng, 1, 20)) : null,
      projectIntentJson: {
        transaction: 'ACHAT',
        propertyTypes: [pickOne(rng, ['APPARTEMENT', 'APPARTEMENT', 'LOCAL_COMMERCIAL'])],
        budgetMax,
        rooms: between(rng, 2, 4),
        zones: [pickOne(rng, zones)],
        timeline: pickOne(rng, ['Immédiat', 'Sous 3 mois', 'Sous 6 mois', 'Dans l’année'])
      } as Prisma.InputJsonValue,
      internalNotes: `${MARK} ${pickOne(rng, PROSPECT_NOTES)}`,
      createdAt
    });
    tagRows.push({ contactId: id, tag: 'Prospect copropriété' });
    if (!lost && rng() < 0.35) tagRows.push({ contactId: id, tag: 'À relancer' });
    if (rng() < 0.2) tagRows.push({ contactId: id, tag: 'Diaspora' });
  }

  // 2. fournisseurs et prestataires : une fiche par prestataire de la copropriété
  const providers = await prisma.serviceProvider.findMany({
    where: { tenantId },
    select: { name: true, specialty: true, email: true, phone: true },
    orderBy: { name: 'asc' }
  });
  const rep = (name: string) => {
    const female = hashInt(name) % 3 === 0;
    return {
      first: (female ? FIRST_NAMES_F : FIRST_NAMES_M)[
        hashInt(`f${name}`) % (female ? FIRST_NAMES_F : FIRST_NAMES_M).length
      ],
      last: LAST_NAMES[hashInt(`l${name}`) % LAST_NAMES.length],
      female
    };
  };
  for (const prov of providers) {
    const r = rep(prov.name);
    const score = between(rng, 35, 90);
    const source = pickOne(rng, ['Annuaire des prestataires', 'Appel d’offres', 'Recommandation']);
    const id = randomUUID();
    contacts.push({
      id,
      tenantId,
      contactType: 'COMPANY',
      civility: r.female ? 'MRS' : 'MR',
      firstName: r.first,
      lastName: r.last,
      legalName: prov.name,
      representativeName: `${r.first} ${r.last}`,
      representativeRole: 'Gérant',
      email: uniqueEmail(
        prov.email ? prov.email.split('@')[0] : `contact.${slug(prov.name)}`,
        prov.email?.split('@')[1] ?? 'prestataires.test'
      ),
      phonePrimary: prov.phone ?? ivorianPhone(rng),
      city: 'Abidjan',
      country: "Côte d'Ivoire",
      sectorOfActivity: prov.specialty ?? undefined,
      profession: prov.specialty ?? undefined,
      preferredLanguage: 'fr',
      preferredContactChannel: pickOne(rng, ['CALL', 'EMAIL', 'WHATSAPP'] as const),
      source,
      leadSource: SOURCES[source],
      score,
      maturityLevel: maturityOf(score),
      status: 'ACTIVE_CLIENT',
      priorityLevel: 'NORMAL',
      assignedToUserId: pickOne(rng, env.staff),
      lastInteractionAt: addDays(end, -between(rng, 2, 150)),
      internalNotes: `${MARK} Prestataire référencé par le syndic${prov.specialty ? ` — ${prov.specialty.toLowerCase()}` : ''}.`,
      createdAt: addDays(start, between(rng, 5, 400))
    });
    tagRows.push({ contactId: id, tag: 'Fournisseur' });
  }

  // 3. gardiens : un gardien en poste par copropriété, et l'ancien de la plus grande
  for (const [i, s] of env.syndicates.entries()) {
    const roster = [{ current: true }, ...(i === env.syndicates.length - 1 ? [{ current: false }] : [])];
    for (const g of roster) {
      const p = person('.g');
      const id = randomUUID();
      const since = g.current ? addDays(end, -between(rng, 200, 900)) : addDays(start, between(rng, 10, 90));
      contacts.push({
        id,
        tenantId,
        contactType: 'PERSON',
        civility: 'MR',
        firstName: p.first,
        lastName: p.last,
        email: uniqueEmail(p.base, 'gardiens.test'),
        phonePrimary: ivorianPhone(rng),
        city: 'Abidjan',
        country: "Côte d'Ivoire",
        nationality: pickOne(rng, ['Ivoirienne', 'Burkinabè', 'Malienne']),
        profession: 'Gardien d’immeuble',
        preferredLanguage: 'fr',
        preferredContactChannel: 'CALL',
        source: 'Embauche directe',
        leadSource: 'OTHER',
        score: between(rng, 40, 80),
        maturityLevel: 'WARM',
        status: g.current ? 'ACTIVE_CLIENT' : 'ARCHIVED',
        priorityLevel: 'NORMAL',
        assignedToUserId: pickOne(rng, env.staff),
        lastInteractionAt: g.current ? addDays(end, -between(rng, 1, 20)) : addDays(end, -between(rng, 300, 700)),
        internalNotes: `${MARK} ${g.current ? 'Gardien en poste' : 'Ancien gardien (remplacé après changement de prestataire)'} — ${s.name}.`,
        createdAt: since
      });
      tagRows.push({ contactId: id, tag: 'Gardien' });
    }
  }

  await prisma.$transaction(async tx => {
    await tx.crmContact.createMany({ data: contacts });
    await tx.crmContactTag.createMany({
      data: tagRows.map(r => ({ contactId: r.contactId, tagId: tags.get(r.tag)! })),
      skipDuplicates: true
    });
  });
  void shuffle;
  return contacts.length;
}

export async function seedSyndicCrm(env: SyndicEnv): Promise<void> {
  const tags = await ensureTags(env);
  const diversified = await diversifyExisting(env);
  const tagged = await tagExisting(env, tags);
  const added = await addNewContacts(env, tags);
  if (diversified + added + tagged > 0)
    env.log(
      `syndic-fixes CRM : ${diversified} fiche(s) diversifiée(s), ${added} fiche(s) ajoutée(s), ${tagged} étiquette(s) posée(s)`
    );
}
