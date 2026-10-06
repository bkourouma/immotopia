/**
 * Compléments CRM de l'agence « 3 ans » : fiches contact enrichies, étiquettes,
 * notes, recherches enregistrées, relances et rendez-vous, zones recherchées.
 *
 * Chaque bloc est idempotent : il saute dès que le tenant porte déjà ses lignes.
 */
import type { Prisma } from '@prisma/client';
import { between, pick } from './types';
import {
  CONTACT_NOTES,
  DEAL_NOTES,
  FEMALE_FIRST_NAMES,
  FOLLOW_UPS,
  PROFESSIONS,
  PROPERTY_NOTES,
  SAVED_SEARCHES,
  TAG_DEFS,
  addDays,
  roundTo
} from './agence-commercial-data';
import type { CommercialEnv } from './agence-commercial-data';

const NATIONALITIES = ['Ivoirienne', 'Ivoirienne', 'Ivoirienne', 'Ivoirienne', 'Burkinabè', 'Française', 'Malienne'];
const CHANNELS = ['WHATSAPP', 'WHATSAPP', 'CALL', 'EMAIL', 'SMS'] as const;
const CONSENT_SOURCES = ['Formulaire en agence', 'Site web', 'Échange WhatsApp', 'Salon de l’immobilier'];

/** Complète les fiches contact (profil socio-professionnel, consentements, projet). */
export async function seedContactProfiles(env: CommercialEnv): Promise<void> {
  const { prisma, tenantId, rng, ctx, log } = env;
  const contacts = await prisma.crmContact.findMany({
    where: { tenantId, profession: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      contactType: true,
      status: true,
      createdAt: true,
      maturityLevel: true,
      legalName: true,
      locationZone: true
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  if (contacts.length === 0) {
    log('commercial : fiches contact déjà complétées.');
    return;
  }

  let n = 0;
  for (const c of contacts) {
    n += 1;
    const isCompany = c.contactType === 'COMPANY';
    const prospect = c.status === 'LEAD';
    const archived = c.status === 'ARCHIVED';
    const spec = pick(rng, PROFESSIONS);
    const income = roundTo(between(rng, spec.incomeMin, spec.incomeMax), 25_000);
    const female = FEMALE_FIRST_NAMES.has(c.firstName);
    const consentEmail = !archived && rng() < 0.72;
    const consentMarketing = consentEmail && rng() < 0.85;
    const consentWhatsapp = !archived && rng() < 0.78;
    const consentSource = pick(rng, CONSENT_SOURCES);
    const data: Prisma.CrmContactUpdateInput = {
      priorityLevel: prospect && c.maturityLevel === 'HOT' ? 'HIGH' : archived ? 'LOW' : 'NORMAL',
      preferredContactChannel: pick(rng, CHANNELS),
      consentEmail,
      consentMarketing,
      consentWhatsapp,
      consentDate: consentEmail || consentWhatsapp ? addDays(c.createdAt, between(rng, 0, 3)) : null,
      consentSource: consentEmail || consentWhatsapp ? consentSource : null,
      responsivenessRate: between(rng, 35, 98)
    };

    if (isCompany) {
      Object.assign(data, {
        profession: 'Gérant',
        sectorOfActivity: pick(rng, ['Commerce', 'Services', 'Import-export', 'BTP', 'Industrie légère']),
        employer: c.legalName,
        legalForm: pick(rng, ['SARL', 'SA', 'SAS'] as const),
        rccm: `CI-ABJ-${between(rng, 2008, 2023)}-B-${between(rng, 1000, 29999)}`,
        taxId: `${between(rng, 1000000, 2999999)}${pick(rng, ['A', 'B', 'C', 'D'])}`,
        jobStability: 'OTHER',
        borrowingCapacity: prospect ? pick(rng, ['YES', 'UNKNOWN'] as const) : 'YES'
      });
    } else {
      Object.assign(data, {
        civility: female ? pick(rng, ['MRS', 'MS'] as const) : 'MR',
        nationality: pick(rng, NATIONALITIES),
        dateOfBirth: new Date(Date.UTC(between(rng, 1958, 1999), between(rng, 0, 11), between(rng, 1, 28))),
        identityDocumentType: pick(rng, ['CNI', 'CNI', 'CNI', 'PASSPORT'] as const),
        identityDocumentNumber: `CI${between(rng, 10, 99)}${String(between(rng, 0, 9999999)).padStart(7, '0')}`,
        identityDocumentExpiry: addDays(ctx.end, between(rng, 120, 2400)),
        profession: spec.profession,
        sectorOfActivity: spec.sector,
        employer: pick(rng, spec.employers),
        incomeMin: Math.round(income * 0.9),
        incomeMax: Math.round(income * 1.1),
        jobStability: spec.stability,
        borrowingCapacity: income >= 900_000 ? 'YES' : income >= 450_000 ? pick(rng, ['YES', 'UNKNOWN'] as const) : 'NO'
      });
    }
    if (isCompany) data.profession = 'Gérant';

    if (prospect) {
      const rental = rng() < 0.55;
      data.projectIntentJson = {
        transaction: rental ? 'LOCATION' : 'ACHAT',
        propertyTypes: rental
          ? [pick(rng, ['APPARTEMENT', 'STUDIO', 'MAISON_VILLA'])]
          : [pick(rng, ['APPARTEMENT', 'MAISON_VILLA', 'TERRAIN', 'IMMEUBLE'])],
        budgetMax: rental ? roundTo(income * 0.4, 25_000) : roundTo(income * between(rng, 60, 140), 1_000_000),
        rooms: between(rng, 2, 5),
        zones: [c.locationZone ?? 'Cocody Riviera'],
        timeline: pick(rng, ['Immédiat', 'Sous 3 mois', 'Sous 6 mois', 'Dans l’année'])
      };
      const r = rng();
      if (r < 0.28) data.nextActionAt = addDays(ctx.end, between(rng, 1, 18));
      else if (r < 0.4) data.nextActionAt = addDays(ctx.end, -between(rng, 1, 9));
    }
    if (rng() < 0.3) data.internalNotes = pick(rng, CONTACT_NOTES);

    await prisma.crmContact.update({ where: { id: c.id }, data });
  }
  log(`commercial : ${n} fiches contact complétées.`);
}

/** Étiquettes du CRM et leur pose sur les contacts. */
export async function seedTags(env: CommercialEnv): Promise<void> {
  const { prisma, tenantId, rng, log } = env;
  if ((await prisma.crmTag.count({ where: { tenantId } })) > 0) {
    log('commercial : étiquettes déjà présentes.');
    return;
  }
  const tags = new Map<string, string>();
  for (const def of TAG_DEFS) {
    const created = await prisma.crmTag.create({
      data: { tenantId, name: def.name, color: def.color },
      select: { id: true }
    });
    tags.set(def.name, created.id);
  }

  const contacts = await prisma.crmContact.findMany({
    where: { tenantId },
    select: {
      id: true,
      createdAt: true,
      status: true,
      maturityLevel: true,
      score: true,
      profession: true,
      leadSource: true,
      roles: { select: { role: true, active: true } }
    }
  });

  const rows: { contactId: string; tagId: string; createdAt: Date }[] = [];
  for (const c of contacts) {
    const wanted = new Set<string>();
    const isOwner = c.roles.some(r => r.role === 'PROPRIETAIRE');
    if (isOwner && rng() < 0.6) wanted.add('Bailleur multi-biens');
    if ((c.score ?? 0) >= 85) wanted.add('VIP');
    if (c.status === 'LEAD' && c.maturityLevel === 'HOT') wanted.add('À relancer');
    if (c.leadSource === 'REFERRAL') wanted.add('Recommandé par un client');
    if (c.profession === 'Fonctionnaire') wanted.add('Fonctionnaire');
    if (c.profession === 'Commerçant') wanted.add('Commerçant');
    if (
      c.profession &&
      ['Cadre bancaire', 'Ingénieur télécoms', 'Cadre logistique', 'Comptable'].includes(c.profession)
    )
      wanted.add('Cadre d’entreprise');
    if (c.status === 'LEAD') {
      const r = rng();
      if (r < 0.25) wanted.add('Primo-accédant');
      else if (r < 0.4) wanted.add('Investisseur');
      else if (r < 0.5) wanted.add('Financement validé');
    }
    if (c.status !== 'ARCHIVED' && rng() < 0.08) wanted.add('Diaspora');
    if (c.status !== 'ARCHIVED' && rng() < 0.05) wanted.add('Expatrié');
    if (wanted.size === 0 && rng() < 0.5) wanted.add(pick(rng, TAG_DEFS).name);
    for (const name of wanted) {
      const tagId = tags.get(name);
      if (tagId) rows.push({ contactId: c.id, tagId, createdAt: addDays(c.createdAt, between(rng, 1, 40)) });
    }
  }
  await prisma.crmContactTag.createMany({ data: rows, skipDuplicates: true });
  log(`commercial : ${tags.size} étiquettes, ${rows.length} poses sur les contacts.`);
}

/** Notes internes sur les contacts, les affaires et les biens. */
export async function seedNotes(env: CommercialEnv): Promise<void> {
  const { prisma, tenantId, rng, ctx, staff, log } = env;
  if ((await prisma.crmNote.count({ where: { tenantId } })) > 0) {
    log('commercial : notes CRM déjà présentes.');
    return;
  }
  const [contacts, deals, properties] = await Promise.all([
    prisma.crmContact.findMany({ where: { tenantId }, select: { id: true, createdAt: true } }),
    prisma.crmDeal.findMany({ where: { tenantId }, select: { id: true, createdAt: true } }),
    prisma.property.findMany({ where: { tenantId }, select: { id: true, createdAt: true } })
  ]);
  const data: Prisma.CrmNoteUncheckedCreateInput[] = [];
  const stamp = (from: Date): Date => {
    const t = addDays(from, between(rng, 1, 120));
    return t > ctx.end ? addDays(ctx.end, -between(rng, 0, 20)) : t;
  };
  for (const c of contacts) {
    if (rng() > 0.45) continue;
    const count = between(rng, 1, 3);
    for (let i = 0; i < count; i++) {
      data.push({
        tenantId,
        entityType: 'CONTACT',
        entityId: c.id,
        crmContactId: c.id,
        content: pick(rng, CONTACT_NOTES),
        createdByUserId: pick(rng, staff),
        createdAt: stamp(c.createdAt)
      });
    }
  }
  for (const d of deals) {
    if (rng() > 0.6) continue;
    data.push({
      tenantId,
      entityType: 'DEAL',
      entityId: d.id,
      crmDealId: d.id,
      content: pick(rng, DEAL_NOTES),
      createdByUserId: pick(rng, staff),
      createdAt: stamp(d.createdAt)
    });
  }
  for (const p of properties) {
    if (rng() > 0.22) continue;
    data.push({
      tenantId,
      entityType: 'PROPERTY',
      entityId: p.id,
      content: pick(rng, PROPERTY_NOTES),
      createdByUserId: pick(rng, staff),
      createdAt: stamp(p.createdAt)
    });
  }
  await prisma.crmNote.createMany({ data });
  log(`commercial : ${data.length} notes CRM (aucun écran ne les affiche encore, seule la table est alimentée).`);
}

/** Recherches de contacts enregistrées (CRM, ciblage des newsletters). */
export async function seedSavedSearches(env: CommercialEnv): Promise<void> {
  const { prisma, tenantId, rng, ctx, staff, log } = env;
  if ((await prisma.savedContactSearch.count({ where: { tenantId } })) > 0) {
    log('commercial : recherches enregistrées déjà présentes.');
    return;
  }
  const tags = await prisma.crmTag.findMany({ where: { tenantId }, select: { id: true, name: true } });
  const tagId = (name: string): string | undefined => tags.find(t => t.name === name)?.id;

  const defs = [...SAVED_SEARCHES];
  const vip = [tagId('Investisseur'), tagId('VIP')].filter((x): x is string => Boolean(x));
  if (vip.length > 0) {
    defs.push({
      name: 'Investisseurs et clients VIP',
      description: 'Cible des offres de vente d’immeubles et de terrains.',
      scope: 'TEAM',
      filters: { tagIds: vip, hasAnyTag: true },
      uses: 16
    });
  }
  let i = 0;
  for (const def of defs) {
    const filters = JSON.parse(JSON.stringify(def.filters), (_k, v) => {
      if (v === '__DAYS_30__') return addDays(ctx.end, -30).toISOString();
      if (v === '__DAYS_90__') return addDays(ctx.end, -90).toISOString();
      return v;
    }) as Prisma.InputJsonValue;
    const created = addDays(ctx.end, -between(rng, 40, 700));
    await prisma.savedContactSearch.create({
      data: {
        tenantId,
        name: def.name,
        description: def.description,
        filters,
        scope: def.scope,
        createdById: staff[i % staff.length],
        useCount: def.uses,
        lastUsedAt: addDays(ctx.end, -between(rng, 0, 35)),
        createdAt: created
      }
    });
    i += 1;
  }
  log(`commercial : ${defs.length} recherches enregistrées.`);
}

/** Relances, tâches et rendez-vous du calendrier CRM (échéances passées et à venir). */
export async function seedFollowUps(env: CommercialEnv): Promise<void> {
  const { prisma, tenantId, rng, ctx, staff, log } = env;
  if ((await prisma.crmActivity.count({ where: { tenantId, activityType: 'TASK' } })) > 0) {
    log('commercial : relances déjà présentes.');
    return;
  }
  const deals = await prisma.crmDeal.findMany({
    where: { tenantId, stage: { in: ['NEW', 'QUALIFIED', 'VISIT', 'NEGOTIATION'] } },
    select: { id: true, contactId: true, createdAt: true, type: true }
  });
  const prospects = await prisma.crmContact.findMany({
    where: { tenantId, status: 'LEAD', deals: { none: {} } },
    select: { id: true, createdAt: true },
    take: 24
  });
  const targets: { contactId: string; dealId: string | null; createdAt: Date }[] = [
    ...deals.map(d => ({ contactId: d.contactId, dealId: d.id, createdAt: d.createdAt })),
    ...prospects.map(p => ({ contactId: p.id, dealId: null, createdAt: p.createdAt }))
  ];

  let created = 0;
  for (let i = 0; i < targets.length && created < 34; i++) {
    const t = targets[i];
    const fu = FOLLOW_UPS[i % FOLLOW_UPS.length];
    const overdue = i % 5 === 0;
    const next = overdue ? addDays(ctx.end, -between(rng, 1, 9)) : addDays(ctx.end, between(rng, 0, 28));
    next.setHours(between(rng, 8, 17), pick(rng, [0, 15, 30, 45]), 0, 0);
    const occurred = addDays(next, -between(rng, 3, 10));
    await prisma.crmActivity.create({
      data: {
        tenantId,
        contactId: t.contactId,
        dealId: t.dealId,
        activityType: fu.type === 'Rendez-vous agence' || fu.type === 'Rendez-vous notaire' ? 'MEETING' : 'TASK',
        direction: 'INTERNAL',
        subject: fu.subject,
        content: fu.content,
        occurredAt: occurred > ctx.end ? ctx.end : occurred,
        createdByUserId: pick(rng, staff),
        nextActionAt: next,
        nextActionType: fu.type,
        createdAt: occurred > ctx.end ? ctx.end : occurred
      }
    });
    await prisma.crmContact.update({ where: { id: t.contactId }, data: { nextActionAt: next } });
    created += 1;
  }
  log(`commercial : ${created} relances et rendez-vous au calendrier.`);
}

/** Zones recherchées des prospects, quand le référentiel des communes est chargé. */
export async function seedTargetZones(env: CommercialEnv): Promise<void> {
  const { prisma, tenantId, rng, log } = env;
  const communes = await prisma.commune.findMany({
    where: {
      OR: [
        'Cocody',
        'Marcory',
        'Plateau',
        'Yopougon',
        'Bingerville',
        'Treichville',
        'Koumassi',
        'Abobo',
        'Port-Bouët'
      ].map(name => ({ name: { contains: name, mode: 'insensitive' as const } }))
    },
    select: { id: true }
  });
  if (communes.length === 0) {
    log('commercial : référentiel des communes vide, zones recherchées non renseignées.');
    return;
  }
  const already = await prisma.crmContactTargetZone.count({ where: { contact: { tenantId } } });
  if (already > 0) return;
  const leads = await prisma.crmContact.findMany({ where: { tenantId, status: 'LEAD' }, select: { id: true } });
  const rows: { contactId: string; communeId: string }[] = [];
  for (const l of leads) {
    const k = between(rng, 1, Math.min(3, communes.length));
    const picked = new Set<string>();
    for (let j = 0; j < k; j++) picked.add(pick(rng, communes).id);
    for (const communeId of picked) rows.push({ contactId: l.id, communeId });
  }
  await prisma.crmContactTargetZone.createMany({ data: rows, skipDuplicates: true });
  log(`commercial : ${rows.length} zones recherchées.`);
}
