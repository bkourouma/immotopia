/**
 * Compléments SYNDIC — vie de l'immeuble : bâtiment (fiche bien, pack Syndic seul), contrats de
 * maintenance et leurs liens budgétaires, parties communes, incidents ouverts,
 * tickets de maintenance liés, factures d'intervention et imputations de coûts,
 * occupants (locataires), anciens propriétaires, profils du portail, assemblées
 * à venir ou annulées avec leurs pouvoirs.
 *
 * Chaque bloc est idempotent : un état déjà atteint dispense de le refaire.
 */
import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { FIRST_NAMES_F, FIRST_NAMES_M, LAST_NAMES, PROFESSIONS } from './syndic-data';
import {
  CoproLedger,
  TX_OPTIONS,
  addDays,
  between,
  ivorianPhone,
  local,
  num,
  paymentRef,
  pickOne,
  pickStaff,
  roundTo,
  isSyndicPack,
  shuffle,
  slug,
  type SyndicEnv
} from './syndic-extras-common';

// ───────────────────────────────────────────────────────────── bâtiment

const ZONES: Array<{ match: RegExp; zone: string; lat: number; lng: number }> = [
  { match: /cocody|riviera|palmeraie/i, zone: 'Cocody', lat: 5.3599, lng: -3.9786 },
  { match: /marcory/i, zone: 'Marcory', lat: 5.3015, lng: -3.9884 },
  { match: /plateau/i, zone: 'Plateau', lat: 5.3196, lng: -4.0225 },
  { match: /yopougon/i, zone: 'Yopougon', lat: 5.3361, lng: -4.0877 },
  { match: /bingerville/i, zone: 'Bingerville', lat: 5.3553, lng: -3.8869 }
];

export async function seedBuildings(env: SyndicEnv): Promise<void> {
  // Un syndic seul gère ses immeubles comme des biens ; l'Opérateur intégré a déjà tout son patrimoine.
  if (!(await isSyndicPack(env))) return;
  const { prisma, tenantId } = env;
  let index = 0;
  for (const s of env.syndicates) {
    index++;
    if (s.propertyId) continue;
    const lots = await prisma.syndicateLot.findMany({
      where: { syndicateId: s.id },
      select: { lotNumber: true, lotType: true }
    });
    const floors = Math.max(
      1,
      ...lots.filter(l => l.lotType === 'APARTMENT').map(l => Number(/^\d/.test(l.lotNumber) ? l.lotNumber[0] : 0) + 1)
    );
    const zone = ZONES.find(z => z.match.test(s.address)) ?? ZONES[0];
    const reference = `COPRO-${String(index).padStart(4, '0')}`;
    const clash = await prisma.property.findFirst({
      where: { tenantId, internalReference: reference },
      select: { id: true }
    });
    const ref = clash ? `COPRO-${s.id.slice(0, 6).toUpperCase()}` : reference;
    const elevator = (await prisma.commonAreaAsset.count({ where: { syndicateId: s.id, name: 'Ascenseur' } })) > 0;
    const property = await prisma.property.create({
      data: {
        internalReference: ref,
        propertyType: 'IMMEUBLE',
        ownershipType: 'TENANT',
        tenantId,
        title: s.name,
        description: `Immeuble en copropriété de ${lots.length} lots (${floors} niveaux${elevator ? ', ascenseur' : ''}), géré en syndic par l’agence. Parties communes entretenues par des contrats annuels (gardiennage, nettoyage, groupe électrogène).`,
        address: s.address,
        locationZone: zone.zone,
        latitude: zone.lat + ((index * 0.0013) % 0.01),
        longitude: zone.lng - ((index * 0.0011) % 0.01),
        transactionModes: [],
        currency: 'XOF',
        status: 'AVAILABLE',
        availability: 'UNAVAILABLE',
        isPublished: false,
        qualityScore: between(env.rng, 70, 92),
        typeSpecificData: {
          floors_count: floors,
          units_count: lots.filter(l => !['PARKING', 'CELLAR'].includes(l.lotType)).length,
          parking_spaces: lots.filter(l => l.lotType === 'PARKING').length,
          elevator,
          copropriete: true
        } as Prisma.InputJsonValue,
        createdAt: s.createdAt
      },
      select: { id: true }
    });
    await prisma.syndicate.update({ where: { id: s.id }, data: { propertyId: property.id } });
    s.propertyId = property.id;
  }
}

// ───────────────────────────────────────────────────── prestataires et contrats

const EXTRA_PROVIDERS = {
  hygiene: { name: 'Hygiène Services Abidjan', specialty: 'Désinsectisation et dératisation' },
  portail: { name: 'Access Pro CI', specialty: 'Portails, interphones et contrôle d’accès' },
  incendie: { name: 'Sécurité Incendie Plus', specialty: 'Sécurité incendie et extincteurs' },
  alarme: { name: 'Vigilance Télésurveillance CI', specialty: 'Télésurveillance et alarmes' },
  electricite: { name: 'Électricité Générale Koffi & Fils', specialty: 'Électricité générale' },
  macon: { name: 'Maçonnerie Générale Bamba', specialty: 'Maçonnerie et petits travaux' }
} as const;

async function ensureProvider(env: SyndicEnv, key: keyof typeof EXTRA_PROVIDERS): Promise<string> {
  const def = EXTRA_PROVIDERS[key];
  const found = await env.prisma.serviceProvider.findFirst({
    where: { tenantId: env.tenantId, name: def.name },
    select: { id: true }
  });
  if (found) return found.id;
  const created = await env.prisma.serviceProvider.create({
    data: {
      tenantId: env.tenantId,
      name: def.name,
      specialty: def.specialty,
      email: `contact@${slug(def.name).slice(0, 22).replace(/\.+$/, '')}.test`,
      phone: `+225 27 ${between(env.rng, 20, 99)} ${between(env.rng, 10, 99)} ${between(env.rng, 10, 99)} ${between(env.rng, 10, 99)}`
    },
    select: { id: true }
  });
  return created.id;
}

async function providerByPattern(
  env: SyndicEnv,
  pattern: RegExp,
  fallbackKey: keyof typeof EXTRA_PROVIDERS
): Promise<string> {
  const all = await env.prisma.serviceProvider.findMany({
    where: { tenantId: env.tenantId },
    select: { id: true, name: true, specialty: true }
  });
  const found = all.find(p => pattern.test(`${p.name} ${p.specialty ?? ''}`));
  return found?.id ?? (await ensureProvider(env, fallbackKey));
}

export async function seedContracts(env: SyndicEnv): Promise<void> {
  const { prisma, end } = env;
  const providers = {
    hygiene: await ensureProvider(env, 'hygiene'),
    portail: await ensureProvider(env, 'portail'),
    incendie: await ensureProvider(env, 'incendie'),
    alarme: await ensureProvider(env, 'alarme')
  };
  const ascenseurProvider = await providerByPattern(env, /ascens/i, 'portail');
  for (const s of env.syndicates) {
    const budget = await prisma.syndicateBudget.findFirst({
      where: { syndicateId: s.id, status: 'APPROVED' },
      orderBy: { fiscalYear: 'desc' },
      select: { totalAmount: true, lines: { select: { id: true, description: true } } }
    });
    const total = num(budget?.totalAmount) || 7_200_000;
    const elevator = (await prisma.commonAreaAsset.count({ where: { syndicateId: s.id, name: 'Ascenseur' } })) > 0;
    const defs = [
      {
        nature: 'Désinsectisation et dératisation',
        provider: providers.hygiene,
        start: -335,
        end: 12,
        alert: 30,
        status: 'ACTIVE',
        share: 0.012
      },
      {
        nature: 'Maintenance du portail automatique et de l’interphone',
        provider: providers.portail,
        start: -325,
        end: 40,
        alert: 60,
        status: 'ACTIVE',
        share: 0.016
      },
      {
        nature: 'Vérification annuelle des extincteurs',
        provider: providers.incendie,
        start: -380,
        end: -15,
        alert: 30,
        status: 'EXPIRED',
        share: 0.008
      },
      {
        nature: 'Télésurveillance et alarme des locaux techniques',
        provider: providers.alarme,
        start: -700,
        end: -210,
        alert: 30,
        status: 'TERMINATED',
        share: 0.014
      },
      ...(elevator
        ? [
            {
              nature: 'Dépannage de l’ascenseur 24 h/24',
              provider: ascenseurProvider,
              start: -300,
              end: 25,
              alert: 45,
              status: 'ACTIVE',
              share: 0.02
            }
          ]
        : [])
    ] as const;
    let created = 0;
    for (const d of defs) {
      const exists = await prisma.maintenanceContract.findFirst({
        where: { syndicateId: s.id, nature: d.nature },
        select: { id: true }
      });
      if (exists) continue;
      await prisma.maintenanceContract.create({
        data: {
          syndicateId: s.id,
          providerId: d.provider,
          nature: d.nature,
          startDate: addDays(end, d.start),
          endDate: addDays(end, d.end),
          annualAmount: roundTo(total * d.share, 10_000),
          currency: 'XOF',
          renewalAlertDays: d.alert,
          status: d.status as 'ACTIVE' | 'EXPIRED' | 'TERMINATED',
          createdAt: addDays(end, d.start)
        }
      });
      created++;
    }
    // liens contrat ↔ poste de budget
    const contracts = await prisma.maintenanceContract.findMany({
      where: { syndicateId: s.id },
      select: { id: true, nature: true }
    });
    const linked = new Set(
      (
        await prisma.syndicateContractLink.findMany({
          where: { syndicateId: s.id },
          select: { maintenanceContractId: true }
        })
      ).map(l => l.maintenanceContractId)
    );
    const lineIdFor = (nature: string) =>
      budget?.lines.find(l => l.description === nature)?.id ??
      budget?.lines.find(
        l => /entretien et petites/i.test(l.description) && /extincteurs|portail|désinsect/i.test(nature)
      )?.id ??
      null;
    const rows = contracts
      .filter(c => !linked.has(c.id))
      .map(c => ({
        syndicateId: s.id,
        maintenanceContractId: c.id,
        scope: `Parties communes — ${c.nature}`,
        budgetLineItemId: lineIdFor(c.nature)
      }));
    if (rows.length > 0) await prisma.syndicateContractLink.createMany({ data: rows });
    if (created > 0 || rows.length > 0)
      env.log(`syndic-extras contrats « ${s.name} » : ${created} contrat(s), ${rows.length} lien(s) budgétaire(s)`);
  }
}

// ───────────────────────────────────────────────────────────── parties communes

export async function seedAssets(env: SyndicEnv): Promise<void> {
  const { prisma, end } = env;
  const defs = [
    {
      name: 'Interphone et visiophone',
      category: 'Accès',
      last: -210,
      next: 35,
      notes: 'Contrôle semestriel des platines et des combinés.'
    },
    {
      name: 'Extincteurs et dispositifs incendie',
      category: 'Sécurité',
      last: -380,
      next: -12,
      notes: 'Vérification annuelle échue : contrôle à planifier avec le prestataire.'
    },
    {
      name: 'Local à poubelles et vide-ordures',
      category: 'Hygiène',
      last: -45,
      next: 45,
      notes: 'Nettoyage et désinfection mensuels.'
    },
    {
      name: 'Toiture-terrasse et étanchéité',
      category: 'Gros œuvre',
      last: -420,
      next: 60,
      notes: 'Visite après chaque saison des pluies.'
    },
    {
      name: 'Éclairage extérieur et parkings',
      category: 'Énergie',
      last: -70,
      next: 20,
      notes: 'Remplacement des lampes par des LED en cours.'
    },
    {
      name: 'Réseau d’eau et colonnes montantes',
      category: 'Plomberie',
      last: -150,
      next: 90,
      notes: 'Purge et contrôle de pression deux fois par an.'
    },
    {
      name: 'Clôture et mur d’enceinte',
      category: 'Gros œuvre',
      last: -300,
      next: 120,
      notes: 'Reprise des fissures et peinture prévues au budget.'
    }
  ];
  for (const s of env.syndicates) {
    const present = new Set(
      (await prisma.commonAreaAsset.findMany({ where: { syndicateId: s.id }, select: { name: true } })).map(a => a.name)
    );
    const rows = defs
      .filter(d => !present.has(d.name))
      .map(d => ({
        syndicateId: s.id,
        name: d.name,
        category: d.category,
        lastMaintenanceDate: addDays(end, d.last + between(env.rng, -10, 10)),
        nextMaintenanceDate: addDays(end, d.next + (d.next < 0 ? 0 : between(env.rng, -5, 8))),
        notes: d.notes,
        createdAt: s.createdAt
      }));
    if (rows.length > 0) await prisma.commonAreaAsset.createMany({ data: rows });
    // les équipements de base reçoivent une note d'entretien
    await prisma.commonAreaAsset.updateMany({
      where: { syndicateId: s.id, notes: null },
      data: {
        notes:
          'Entretien courant assuré par le prestataire sous contrat ; carnet d’entretien tenu à jour par le syndic.'
      }
    });
  }
}

// ───────────────────────────────────────────────────────────── incidents

interface IncidentTpl {
  type: 'BREAKDOWN' | 'LEAK' | 'VANDALISM' | 'SAFETY' | 'OTHER';
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  key:
    | 'plomberie'
    | 'electrogene'
    | 'gardiennage'
    | 'ascenseur'
    | 'electricite'
    | 'incendie'
    | 'nettoyage'
    | 'espaces_verts'
    | 'general';
  asset?: string;
  lot?: boolean;
  description: string;
}

const INCIDENTS: IncidentTpl[] = [
  {
    type: 'LEAK',
    urgency: 'CRITICAL',
    key: 'plomberie',
    description:
      'Rupture de la colonne d’eau principale : plusieurs étages sont sans eau depuis ce matin et la fuite inonde le sous-sol.'
  },
  {
    type: 'LEAK',
    urgency: 'HIGH',
    key: 'plomberie',
    lot: true,
    description:
      'Infiltration d’eau dans la cage d’escalier après les dernières pluies : la peinture cloque et le plafond goutte au palier.'
  },
  {
    type: 'BREAKDOWN',
    urgency: 'CRITICAL',
    key: 'ascenseur',
    asset: 'Ascenseur',
    description: 'Ascenseur à l’arrêt depuis deux jours : une personne âgée du dernier étage ne peut plus descendre.'
  },
  {
    type: 'BREAKDOWN',
    urgency: 'HIGH',
    key: 'electrogene',
    asset: 'Groupe électrogène',
    description:
      'Le groupe électrogène démarre mais ne reprend pas la charge : l’immeuble reste dans le noir lors des coupures de la CIE.'
  },
  {
    type: 'BREAKDOWN',
    urgency: 'MEDIUM',
    key: 'electricite',
    description: 'Éclairage du parking défaillant sur la moitié des places depuis une semaine.'
  },
  {
    type: 'SAFETY',
    urgency: 'HIGH',
    key: 'gardiennage',
    asset: 'Portail automatique',
    description:
      'Le portail coulissant reste ouvert en fin de journée : le moteur chauffe et la télécommande ne répond plus.'
  },
  {
    type: 'VANDALISM',
    urgency: 'MEDIUM',
    key: 'gardiennage',
    description: 'Tentative d’effraction sur la porte du local compteurs : serrure forcée et câbles coupés.'
  },
  {
    type: 'VANDALISM',
    urgency: 'LOW',
    key: 'nettoyage',
    description: 'Graffitis sur le mur d’enceinte côté rue et sur la porte du hall.'
  },
  {
    type: 'SAFETY',
    urgency: 'HIGH',
    key: 'incendie',
    description:
      'Extincteurs périmés au 1er et au 2e étage ; le désenfumage de la cage d’escalier n’a pas été testé cette année.'
  },
  {
    type: 'OTHER',
    urgency: 'LOW',
    key: 'espaces_verts',
    description: 'Les palmiers de la cour menacent de tomber sur le parking après le dernier orage : élagage demandé.'
  },
  {
    type: 'OTHER',
    urgency: 'MEDIUM',
    key: 'nettoyage',
    description: 'Invasion de cafards signalée dans le local à poubelles et dans les gaines techniques.'
  },
  {
    type: 'LEAK',
    urgency: 'MEDIUM',
    key: 'plomberie',
    asset: 'Surpresseur et bâche à eau',
    description: 'Fuite sur le surpresseur : pression d’eau instable et bruit anormal dans la bâche.'
  },
  {
    type: 'BREAKDOWN',
    urgency: 'MEDIUM',
    key: 'electricite',
    description: 'Interphone hors service : les visiteurs ne peuvent plus joindre les occupants.'
  },
  {
    type: 'OTHER',
    urgency: 'LOW',
    key: 'general',
    description: 'Boîtes aux lettres détériorées au rez-de-chaussée : serrures à remplacer.'
  },
  {
    type: 'SAFETY',
    urgency: 'MEDIUM',
    key: 'general',
    description: 'Fissure apparente sur le muret de la terrasse commune, à faire expertiser.'
  },
  {
    type: 'LEAK',
    urgency: 'HIGH',
    key: 'plomberie',
    lot: true,
    description:
      'Dégât des eaux chez un copropriétaire du dessous : fuite sur l’évacuation de la salle de bain de l’étage supérieur.'
  }
];

const KEY_PATTERN: Record<IncidentTpl['key'], { re: RegExp; fallback: keyof typeof EXTRA_PROVIDERS }> = {
  plomberie: { re: /plomb/i, fallback: 'macon' },
  electrogene: { re: /électrog|énergie services|groupe/i, fallback: 'electricite' },
  gardiennage: { re: /garde|sûret|protection|sécurité ivoire/i, fallback: 'portail' },
  ascenseur: { re: /ascens/i, fallback: 'portail' },
  electricite: { re: /électricité générale/i, fallback: 'electricite' },
  incendie: { re: /incendie/i, fallback: 'incendie' },
  nettoyage: { re: /propreté|net services|nettoy/i, fallback: 'hygiene' },
  espaces_verts: { re: /vert|jardin/i, fallback: 'macon' },
  general: { re: /maçonnerie/i, fallback: 'macon' }
};

const EXPENSE_ACCOUNT: Record<IncidentTpl['key'], string> = {
  plomberie: '615',
  electrogene: '6144',
  gardiennage: '6141',
  ascenseur: '6143',
  electricite: '615',
  incendie: '615',
  nettoyage: '6142',
  espaces_verts: '6145',
  general: '615'
};

const COST_RANGE: Record<IncidentTpl['urgency'], [number, number]> = {
  LOW: [25_000, 90_000],
  MEDIUM: [90_000, 300_000],
  HIGH: [200_000, 750_000],
  CRITICAL: [450_000, 1_800_000]
};

export async function seedIncidents(env: SyndicEnv): Promise<void> {
  const { prisma, end, rng } = env;
  for (const s of env.syndicates) {
    const open = await prisma.syndicateIncident.count({
      where: { syndicateId: s.id, status: { in: ['REPORTED', 'ASSIGNED', 'IN_PROGRESS'] } }
    });
    if (open >= 3) continue;
    const lots = await prisma.syndicateLot.findMany({
      where: { syndicateId: s.id },
      select: { id: true, lotType: true, ownerContactId: true }
    });
    const owners = lots.map(l => l.ownerContactId).filter((c): c is string => Boolean(c));
    if (owners.length === 0) continue;
    const apartments = lots.filter(l => l.lotType === 'APARTMENT');
    const assets = new Map(
      (await prisma.commonAreaAsset.findMany({ where: { syndicateId: s.id }, select: { id: true, name: true } })).map(
        a => [a.name, a.id]
      )
    );
    const elevator = assets.has('Ascenseur');
    const count = lots.length >= 40 ? 9 : lots.length >= 20 ? 6 : 4;
    const pool = shuffle(
      rng,
      INCIDENTS.filter(i => elevator || i.key !== 'ascenseur')
    );
    // 1 critique en cours, puis des signalements récents, des dossiers en cours, quelques clôtures récentes
    const critical = pool.find(i => i.urgency === 'CRITICAL')!;
    const rest = pool.filter(i => i !== critical);
    const plan: Array<{
      tpl: IncidentTpl;
      age: number;
      status: 'REPORTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
    }> = [
      { tpl: critical, age: between(rng, 2, 5), status: 'IN_PROGRESS' as const },
      { tpl: rest[0], age: between(rng, 0, 3), status: 'REPORTED' as const },
      { tpl: rest[1], age: between(rng, 1, 4), status: 'REPORTED' as const },
      { tpl: rest[2], age: between(rng, 5, 10), status: 'ASSIGNED' as const },
      { tpl: rest[3], age: between(rng, 11, 24), status: 'IN_PROGRESS' as const },
      { tpl: rest[4], age: between(rng, 7, 13), status: 'ASSIGNED' as const },
      { tpl: rest[5], age: between(rng, 32, 55), status: 'RESOLVED' as const },
      { tpl: rest[6], age: between(rng, 45, 80), status: 'CLOSED' as const },
      { tpl: rest[7], age: between(rng, 26, 40), status: 'RESOLVED' as const }
    ].slice(0, count);
    const rows: Prisma.SyndicateIncidentCreateManyInput[] = [];
    for (const p of plan) {
      const reportedAt = addDays(local(end.getFullYear(), end.getMonth(), end.getDate(), between(rng, 7, 17)), -p.age);
      const done = p.status === 'RESOLVED' || p.status === 'CLOSED';
      const providerId =
        p.status === 'REPORTED'
          ? null
          : await providerByPattern(env, KEY_PATTERN[p.tpl.key].re, KEY_PATTERN[p.tpl.key].fallback);
      const lot = p.tpl.lot && apartments.length > 0 ? pickOne(rng, apartments) : null;
      const resolvedAt = done ? addDays(reportedAt, between(rng, 3, Math.max(4, Math.min(20, p.age - 1)))) : null;
      rows.push({
        syndicateId: s.id,
        reportedByContactId: pickOne(rng, owners),
        lotId: lot?.id ?? null,
        assetId: p.tpl.asset ? (assets.get(p.tpl.asset) ?? null) : null,
        incidentType: p.tpl.type,
        description: p.tpl.description,
        urgency: p.tpl.urgency,
        status: p.status,
        reportedAt,
        resolvedAt: resolvedAt && resolvedAt <= end ? resolvedAt : null,
        providerId,
        createdAt: reportedAt
      });
    }
    await prisma.syndicateIncident.createMany({ data: rows });
    env.log(
      `syndic-extras incidents « ${s.name} » : ${rows.length} incident(s) récents (dont ${rows.filter(r => ['REPORTED', 'ASSIGNED', 'IN_PROGRESS'].includes(r.status as string)).length} ouverts)`
    );
  }
}

// ───────────────────────────────────────── tickets de maintenance liés aux incidents

function ticketCategory(description: string, type: string): 'PLUMBING' | 'ELECTRICITY' | 'AC' | 'OTHER' {
  const d = description.toLowerCase();
  if (type === 'LEAK' || /eau|fuite|plomb|infiltration|surpresseur/.test(d)) return 'PLUMBING';
  if (/climatis/.test(d)) return 'AC';
  if (/électri|éclairage|groupe|courant|coupure|interphone|ascenseur|portail/.test(d)) return 'ELECTRICITY';
  return 'OTHER';
}

export async function seedMaintenanceTickets(env: SyndicEnv): Promise<void> {
  const { prisma, tenantId, rng, end } = env;
  const vendorIds = new Map<string, string>();
  const vendorFor = async (providerId: string): Promise<string> => {
    const known = vendorIds.get(providerId);
    if (known) return known;
    const p = await prisma.serviceProvider.findUniqueOrThrow({
      where: { id: providerId },
      select: { name: true, specialty: true, phone: true, email: true }
    });
    const found = await prisma.maintenanceVendor.findFirst({
      where: { tenant_id: tenantId, name: p.name },
      select: { id: true }
    });
    const id =
      found?.id ??
      (
        await prisma.maintenanceVendor.create({
          data: {
            tenant_id: tenantId,
            name: p.name,
            phone: p.phone,
            email: p.email,
            address: 'Abidjan, Côte d’Ivoire',
            specialties: p.specialty ? [p.specialty] : [],
            is_active: true
          },
          select: { id: true }
        })
      ).id;
    vendorIds.set(providerId, id);
    return id;
  };

  for (const s of env.syndicates) {
    if (!s.propertyId) continue;
    const incidents = await prisma.syndicateIncident.findMany({
      where: { syndicateId: s.id, maintenanceWorkOrderId: null },
      orderBy: { reportedAt: 'asc' }
    });
    // choix stable (empreinte de l'identifiant) : un incident clos sans ticket le reste au 2e passage
    const chosen = incidents.filter(
      i => ['REPORTED', 'ASSIGNED', 'IN_PROGRESS'].includes(i.status) || parseInt(i.id.slice(0, 2), 16) % 10 < 4
    );
    let made = 0;
    for (const inc of chosen) {
      const status =
        inc.status === 'REPORTED'
          ? 'DECLARED'
          : inc.status === 'ASSIGNED'
            ? 'ASSIGNED'
            : inc.status === 'IN_PROGRESS'
              ? 'IN_PROGRESS'
              : 'RESOLVED';
      const vendorId = inc.providerId ? await vendorFor(inc.providerId) : null;
      const assignedAt = status === 'DECLARED' ? null : addDays(inc.reportedAt, 1);
      const inProgressAt =
        status === 'IN_PROGRESS' || status === 'RESOLVED' ? addDays(inc.reportedAt, between(rng, 1, 3)) : null;
      const resolvedAt = status === 'RESOLVED' ? (inc.resolvedAt ?? addDays(inc.reportedAt, 6)) : null;
      const lot = inc.lotId
        ? await prisma.syndicateLot.findUnique({ where: { id: inc.lotId }, select: { lotNumber: true } })
        : null;
      const title = inc.description.split(/[:.]/)[0].slice(0, 90);
      const ticket = await prisma.maintenanceTicket.create({
        data: {
          tenant_id: tenantId,
          property_id: s.propertyId,
          created_by_user_id: pickStaff(env),
          created_by_contact_id: inc.reportedByContactId,
          title,
          category: ticketCategory(inc.description, inc.incidentType),
          priority: inc.urgency === 'CRITICAL' ? 'URGENT' : inc.urgency,
          description: inc.description,
          location_details: lot ? `Lot ${lot.lotNumber} — ${s.name}` : `Parties communes — ${s.name}`,
          status,
          assigned_vendor_id: status === 'DECLARED' ? null : vendorId,
          assigned_to_user_id: status === 'DECLARED' ? null : pickStaff(env),
          resolution_notes:
            status === 'RESOLVED'
              ? 'Intervention réalisée, contrôle effectué par le syndic et clôture du signalement.'
              : null,
          declared_at: inc.reportedAt,
          assigned_at: assignedAt,
          in_progress_at: inProgressAt,
          resolved_at: resolvedAt && resolvedAt <= end ? resolvedAt : null,
          created_at: inc.reportedAt
        },
        select: { id: true }
      });
      const steps: Array<{ from: string | null; to: string; at: Date; note: string }> = [
        { from: null, to: 'DECLARED', at: inc.reportedAt, note: 'Signalement enregistré par le syndic.' }
      ];
      if (assignedAt && status !== 'DECLARED')
        steps.push({ from: 'DECLARED', to: 'ASSIGNED', at: assignedAt, note: 'Prestataire désigné.' });
      if (inProgressAt)
        steps.push({ from: 'ASSIGNED', to: 'IN_PROGRESS', at: inProgressAt, note: 'Intervention commencée.' });
      if (resolvedAt && resolvedAt <= end)
        steps.push({ from: 'IN_PROGRESS', to: 'RESOLVED', at: resolvedAt, note: 'Travaux terminés.' });
      await prisma.maintenanceTicketStatusHistory.createMany({
        data: steps.map(st => ({
          tenant_id: tenantId,
          ticket_id: ticket.id,
          from_status: st.from as never,
          to_status: st.to as never,
          note: st.note,
          changed_by_user_id: pickStaff(env),
          changed_at: st.at
        }))
      });
      await prisma.maintenanceTicketComment.createMany({
        data: [
          {
            tenant_id: tenantId,
            ticket_id: ticket.id,
            author_type: 'SYSTEM',
            content: 'Ticket créé à partir d’un incident de la copropriété.',
            created_at: inc.reportedAt
          },
          ...(status !== 'DECLARED'
            ? [
                {
                  tenant_id: tenantId,
                  ticket_id: ticket.id,
                  author_type: 'MANAGER' as const,
                  author_user_id: pickStaff(env),
                  content:
                    'Le prestataire a été prévenu ; passage prévu dans les 48 heures. Le conseil syndical est informé.',
                  created_at: addDays(inc.reportedAt, 1)
                }
              ]
            : []),
          ...(status === 'RESOLVED'
            ? [
                {
                  tenant_id: tenantId,
                  ticket_id: ticket.id,
                  author_type: 'MANAGER' as const,
                  author_user_id: pickStaff(env),
                  content: 'Intervention terminée et vérifiée sur place. Facture reçue, en cours de règlement.',
                  created_at: resolvedAt ?? addDays(inc.reportedAt, 6)
                }
              ]
            : [])
        ]
      });
      await prisma.syndicateMaintenanceLink.create({
        data: {
          syndicateId: s.id,
          maintenanceRequestId: ticket.id,
          lotId: inc.lotId,
          isCommonArea: !inc.lotId,
          costImputation: inc.lotId ? 'MIXED' : 'SYNDICATE',
          imputationDetail: inc.lotId
            ? 'Part privative à la charge du copropriétaire, parties communes au syndicat.'
            : 'Charge du syndicat : partie commune.',
          createdAt: inc.reportedAt
        }
      });
      await prisma.syndicateIncident.update({ where: { id: inc.id }, data: { maintenanceWorkOrderId: ticket.id } });
      made++;
    }
    if (made > 0) env.log(`syndic-extras tickets « ${s.name} » : ${made} ticket(s) de maintenance liés`);
  }
}

// ─────────────────────────────────────── factures d'intervention et imputations

export async function seedIncidentCosts(env: SyndicEnv): Promise<void> {
  const { prisma, tenantId, rng, end } = env;
  for (const s of env.syndicates) {
    const done = await prisma.syndicateIncident.findMany({
      where: { syndicateId: s.id, status: { in: ['RESOLVED', 'CLOSED'] } },
      include: { imputations: { select: { id: true } }, provider: { select: { id: true, name: true } } },
      orderBy: { reportedAt: 'asc' }
    });
    if (done.length === 0) continue;
    const have = done.filter(i => i.imputations.length > 0).length;
    const target = Math.ceil(done.length * 0.5);
    if (have >= target) continue;
    const todo = shuffle(
      rng,
      done.filter(i => i.imputations.length === 0)
    ).slice(0, target - have);
    const led = await CoproLedger.load(env, s.id);
    const sizeFactor = Math.sqrt(Math.max(1, (await prisma.syndicateLot.count({ where: { syndicateId: s.id } })) / 12));
    const lots = await prisma.syndicateLot.findMany({ where: { syndicateId: s.id }, select: { id: true } });
    const contracts = await prisma.maintenanceContract.findMany({
      where: { syndicateId: s.id, status: 'ACTIVE' },
      select: { id: true, nature: true }
    });
    await prisma.$transaction(async tx => {
      let n = 0;
      for (const inc of todo) {
        n++;
        const [lo, hi] = COST_RANGE[inc.urgency];
        const cost = roundTo((lo + rng() * (hi - lo)) * sizeFactor, 5_000);
        const roll = rng();
        const at = inc.resolvedAt ?? addDays(inc.reportedAt, 6);
        let kind: 'SYNDICATE_BUDGET' | 'INSURANCE' | 'LOT_OWNER' | 'THIRD_PARTY' =
          roll < 0.55 ? 'SYNDICATE_BUDGET' : roll < 0.7 ? 'INSURANCE' : roll < 0.85 ? 'LOT_OWNER' : 'THIRD_PARTY';
        // une facture ne peut pas être datée dans le futur : le coût part alors chez un tiers
        if (kind === 'SYNDICATE_BUDGET' && (!inc.provider || addDays(at, 2) > addDays(end, -1))) kind = 'THIRD_PARTY';
        if (kind === 'SYNDICATE_BUDGET' && inc.provider) {
          const tpl = INCIDENTS.find(t => t.description === inc.description);
          const accountNumber = led.hasAccount(EXPENSE_ACCOUNT[tpl?.key ?? 'general'])
            ? EXPENSE_ACCOUNT[tpl?.key ?? 'general']
            : '615';
          const invoiceDate = addDays(at, 2);
          const invoiceId = randomUUID();
          const initials = slug(inc.provider.name).replace(/\./g, '').slice(0, 3).toUpperCase();
          const number = `${initials}-${invoiceDate.getFullYear()}${String(invoiceDate.getMonth() + 1).padStart(2, '0')}-I${String(n).padStart(2, '0')}${between(rng, 10, 99)}`;
          const label = `Intervention : ${inc.description.split(/[:.]/)[0].slice(0, 80)}`;
          const entryId = await led.entry(tx, {
            date: invoiceDate,
            journal: 'AC',
            description: `Facture ${number} — ${inc.provider.name} — ${label}`,
            sourceType: 'SUPPLIER_INVOICE',
            sourceId: invoiceId,
            lines: [
              { acc: accountNumber, debit: cost, label },
              { acc: '401', credit: cost, label: `${inc.provider.name} — ${number}` }
            ]
          });
          const payDate = addDays(invoiceDate, between(rng, 12, 35));
          const paid = payDate <= end && rng() < 0.85;
          let payId: string | null = null;
          if (paid) {
            payId = randomUUID();
            const payEntry = await led.entry(tx, {
              date: payDate,
              journal: 'BQ',
              description: `Règlement facture ${number} — ${inc.provider.name}`,
              sourceType: 'SUPPLIER_PAYMENT',
              sourceId: payId,
              lines: [
                { acc: '401', debit: cost, label: `${inc.provider.name} — ${number}` },
                { acc: '512', credit: cost, label: `Virement ${inc.provider.name}` }
              ]
            });
            await tx.syndicProviderInvoice.create({
              data: {
                id: invoiceId,
                tenantId,
                syndicateId: s.id,
                providerId: inc.provider.id,
                incidentId: inc.id,
                number,
                label,
                invoiceDate,
                dueDate: addDays(invoiceDate, 30),
                amountHT: cost,
                vatAmount: 0,
                amountTTC: cost,
                amountPaid: cost,
                currency: 'XOF',
                expenseAccountId: led.account(accountNumber),
                status: 'PAID',
                journalEntryId: entryId,
                createdById: env.adminId,
                createdAt: invoiceDate
              }
            });
            await tx.syndicProviderPayment.create({
              data: {
                id: payId,
                tenantId,
                invoiceId,
                amount: cost,
                paidAt: payDate,
                method: 'BANK_TRANSFER',
                reference: paymentRef(rng, 'BANK_TRANSFER', payDate),
                journalEntryId: payEntry,
                createdById: env.adminId,
                createdAt: payDate
              }
            });
          } else {
            await tx.syndicProviderInvoice.create({
              data: {
                id: invoiceId,
                tenantId,
                syndicateId: s.id,
                providerId: inc.provider.id,
                incidentId: inc.id,
                number,
                label,
                invoiceDate,
                dueDate: addDays(invoiceDate, 30),
                amountHT: cost,
                vatAmount: 0,
                amountTTC: cost,
                amountPaid: 0,
                currency: 'XOF',
                expenseAccountId: led.account(accountNumber),
                status: 'RECORDED',
                journalEntryId: entryId,
                createdById: env.adminId,
                createdAt: invoiceDate
              }
            });
          }
          const line = await tx.budgetLineItem.findFirst({
            where: {
              budget: { syndicateId: s.id, fiscalYear: invoiceDate.getFullYear() },
              accountId: led.account(accountNumber)
            },
            select: { id: true, amountActual: true }
          });
          if (line)
            await tx.budgetLineItem.update({
              where: { id: line.id },
              data: { amountActual: num(line.amountActual) + cost }
            });
          await tx.incidentCostImputation.create({
            data: {
              incidentId: inc.id,
              imputationType: 'SYNDICATE_BUDGET',
              amount: cost,
              currency: 'XOF',
              budgetLineId: line?.id ?? null,
              contractId: contracts.find(c => /entretien|maintenance|dépannage/i.test(c.nature))?.id ?? null,
              journalEntryId: entryId,
              notes: `Facture ${number} imputée sur le budget de fonctionnement.`,
              createdAt: invoiceDate
            }
          });
        } else if (kind === 'INSURANCE') {
          await tx.incidentCostImputation.create({
            data: {
              incidentId: inc.id,
              imputationType: 'INSURANCE',
              amount: roundTo(cost * 0.6, 5_000),
              currency: 'XOF',
              notes: `Sinistre déclaré à l’assureur de l’immeuble (dossier SIN-${at.getFullYear()}-${String(between(rng, 10, 99)).padStart(3, '0')}), indemnité après déduction de la franchise.`,
              createdAt: addDays(at, 10)
            }
          });
        } else if (kind === 'LOT_OWNER') {
          await tx.incidentCostImputation.create({
            data: {
              incidentId: inc.id,
              imputationType: 'LOT_OWNER',
              amount: roundTo(cost * 0.4, 5_000),
              currency: 'XOF',
              lotId: inc.lotId ?? pickOne(rng, lots).id,
              notes: 'Refacturé au copropriétaire : dommage causé par une installation privative.',
              createdAt: addDays(at, 7)
            }
          });
        } else {
          await tx.incidentCostImputation.create({
            data: {
              incidentId: inc.id,
              imputationType: 'THIRD_PARTY',
              amount: roundTo(cost * 0.8, 5_000),
              currency: 'XOF',
              notes: 'Pris en charge par le tiers responsable (entreprise de construction, au titre de la garantie).',
              createdAt: addDays(at, 12)
            }
          });
        }
      }
      await led.finalize(tx);
    }, TX_OPTIONS);
    env.log(
      `syndic-extras coûts « ${s.name} » : ${todo.length} incident(s) imputé(s), factures d’intervention comprises`
    );
  }
}

// ───────────────────────────────────────────────────────────── occupants

function personContact(
  env: SyndicEnv,
  tag: string,
  kind: 'tenant' | 'owner',
  createdAt: Date
): Prisma.CrmContactCreateManyInput {
  const { rng, tenantId } = env;
  const female = rng() < 0.45;
  const first = pickOne(rng, female ? FIRST_NAMES_F : FIRST_NAMES_M);
  const last = pickOne(rng, LAST_NAMES);
  return {
    id: randomUUID(),
    tenantId,
    contactType: 'PERSON',
    civility: female ? 'MRS' : 'MR',
    firstName: first,
    lastName: last,
    email: `${slug(first)}.${slug(last)}.${tag}@${kind === 'tenant' ? 'locataires' : 'copropriete'}.test`,
    phonePrimary: ivorianPhone(rng),
    city: 'Abidjan',
    country: "Côte d'Ivoire",
    nationality: 'Ivoirienne',
    profession: pickOne(rng, PROFESSIONS),
    preferredLanguage: 'fr',
    preferredContactChannel: pickOne(rng, ['EMAIL', 'SMS', 'WHATSAPP'] as const),
    status: 'ACTIVE_CLIENT',
    source: 'Syndic de copropriété',
    internalNotes: '[seed:pack-history:syndic-extras]',
    createdAt
  } as Prisma.CrmContactCreateManyInput;
}

export async function seedOccupantsAndOwners(env: SyndicEnv): Promise<void> {
  const { prisma, tenantId, rng, end } = env;
  let seq = 0;
  for (const s of env.syndicates) {
    const lots = await prisma.syndicateLot.findMany({
      where: { syndicateId: s.id },
      select: { id: true, lotNumber: true, lotType: true, ownerContactId: true, ownerSince: true }
    });
    // ---- locataires des lots
    const hasTenants = await prisma.lotTenantProfile.count({ where: { lot: { syndicateId: s.id } } });
    if (hasTenants === 0) {
      const rentable = lots.filter(l => ['APARTMENT', 'COMMERCIAL', 'OFFICE'].includes(l.lotType));
      const rented = shuffle(rng, rentable).slice(0, Math.max(3, Math.round(rentable.length * 0.4)));
      const contacts: Prisma.CrmContactCreateManyInput[] = [];
      const roles: Prisma.CrmContactRoleCreateManyInput[] = [];
      const profiles: Prisma.LotTenantProfileCreateManyInput[] = [];
      const assignments: Prisma.LotTenantAssignmentCreateManyInput[] = [];
      for (const lot of rented) {
        const since = addDays(end, -between(rng, 40, 900));
        const hadPrevious = rng() < 0.3;
        if (hadPrevious) {
          const prevSince = addDays(since, -between(rng, 300, 1100));
          const prev = personContact(env, `l${++seq}`, 'tenant', prevSince);
          contacts.push(prev);
          roles.push({
            tenantId,
            contactId: prev.id as string,
            role: 'TENANT',
            active: false,
            startedAt: prevSince,
            endedAt: addDays(since, -1),
            metadata: { source: 'pack-history:syndic-extras' }
          });
          profiles.push({
            lotId: lot.id,
            contactId: prev.id as string,
            tenantSince: prevSince,
            tenantUntil: addDays(since, -1),
            chargesBilledToTenant: rng() < 0.3,
            isCurrent: false,
            createdAt: prevSince
          });
          assignments.push({
            lotId: lot.id,
            tenantId: prev.id as string,
            startDate: prevSince,
            endDate: addDays(since, -1),
            isActive: false,
            notes: 'Bail terminé : départ du locataire, état des lieux de sortie signé.',
            createdAt: prevSince
          });
        }
        const cur = personContact(env, `l${++seq}`, 'tenant', since);
        contacts.push(cur);
        roles.push({
          tenantId,
          contactId: cur.id as string,
          role: 'TENANT',
          active: true,
          startedAt: since,
          metadata: { source: 'pack-history:syndic-extras' }
        });
        profiles.push({
          lotId: lot.id,
          contactId: cur.id as string,
          tenantSince: since,
          chargesBilledToTenant: rng() < 0.35,
          isCurrent: true,
          createdAt: since
        });
        assignments.push({
          lotId: lot.id,
          tenantId: cur.id as string,
          startDate: since,
          isActive: true,
          notes:
            lot.lotType === 'APARTMENT'
              ? 'Occupant à titre de résidence principale.'
              : 'Local loué pour une activité professionnelle.',
          createdAt: since
        });
      }
      await prisma.$transaction(async tx => {
        await tx.crmContact.createMany({ data: contacts });
        await tx.crmContactRole.createMany({ data: roles });
        await tx.lotTenantProfile.createMany({ data: profiles });
        await tx.lotTenantAssignment.createMany({ data: assignments });
      }, TX_OPTIONS);
      env.log(
        `syndic-extras occupants « ${s.name} » : ${rented.length} lots loués (${profiles.length} profils, historique compris)`
      );
    }

    // ---- anciens propriétaires
    const formerOwners = await prisma.lotOwnerProfile.count({ where: { lot: { syndicateId: s.id }, isActive: false } });
    if (formerOwners === 0) {
      const profiles = await prisma.lotOwnerProfile.findMany({
        where: { lot: { syndicateId: s.id }, isActive: true },
        select: {
          id: true,
          lotId: true,
          ownershipPercentage: true,
          ownedSince: true,
          lot: { select: { lotType: true } }
        }
      });
      const sold = shuffle(
        rng,
        profiles.filter(p => p.lot.lotType === 'APARTMENT')
      ).slice(0, Math.max(2, Math.round(profiles.length * 0.09)));
      const contacts: Prisma.CrmContactCreateManyInput[] = [];
      const roles: Prisma.CrmContactRoleCreateManyInput[] = [];
      const rows: Prisma.LotOwnerProfileCreateManyInput[] = [];
      for (const p of sold) {
        const until = p.ownedSince;
        const since = addDays(until, -between(rng, 1000, 3300));
        const prev = personContact(env, `a${++seq}`, 'owner', since);
        contacts.push(prev);
        roles.push({
          tenantId,
          contactId: prev.id as string,
          role: 'COOWNER',
          active: false,
          startedAt: since,
          endedAt: until,
          metadata: { source: 'pack-history:syndic-extras' }
        });
        rows.push({
          lotId: p.lotId,
          contactId: prev.id as string,
          ownershipPercentage: p.ownershipPercentage,
          ownedSince: since,
          ownedUntil: until,
          portalAccessEnabled: false,
          isActive: false,
          createdAt: since
        });
      }
      await prisma.crmContact.createMany({ data: contacts });
      await prisma.crmContactRole.createMany({ data: roles });
      await prisma.lotOwnerProfile.createMany({ data: rows });
      env.log(`syndic-extras propriétaires « ${s.name} » : ${rows.length} ancien(s) propriétaire(s) (mutations)`);
    }

    // ---- profils du portail : préférences de notification et jeton d'accès
    const prefsMissing = await prisma.lotOwnerProfile.findMany({
      where: { lot: { syndicateId: s.id }, isActive: true, notificationPrefs: { equals: Prisma.DbNull } },
      select: {
        id: true,
        portalAccessEnabled: true,
        portalAccessToken: true,
        contact: { select: { preferredContactChannel: true } }
      }
    });
    let patched = 0;
    for (const p of prefsMissing) {
      const channel = p.contact.preferredContactChannel ?? 'EMAIL';
      const data: Prisma.LotOwnerProfileUpdateInput = {
        notificationPrefs: {
          email: channel === 'EMAIL' || rng() < 0.6,
          sms: channel === 'SMS',
          whatsapp: channel === 'WHATSAPP',
          chargeCalls: true,
          meetings: true,
          incidents: rng() < 0.7
        } as Prisma.InputJsonValue
      };
      if (p.portalAccessEnabled && !p.portalAccessToken)
        data.portalAccessToken = createHash('sha256').update(`portal:${p.id}`).digest('hex').slice(0, 32);
      await prisma.lotOwnerProfile.update({ where: { id: p.id }, data });
      patched++;
    }
    if (patched > 0) env.log(`syndic-extras portail « ${s.name} » : ${patched} profil(s) complété(s)`);
  }
}

// ───────────────────────────────────────────────────────────── assemblées

export async function seedMeetingExtras(env: SyndicEnv): Promise<void> {
  const { prisma, end, rng } = env;
  for (const s of env.syndicates) {
    const lots = await prisma.syndicateLot.findMany({
      where: { syndicateId: s.id },
      select: { id: true, ownerContactId: true }
    });
    const owners = [...new Set(lots.map(l => l.ownerContactId).filter((c): c is string => Boolean(c)))];
    const meetings = await prisma.generalMeeting.findMany({
      where: { syndicateId: s.id },
      select: { id: true, status: true, type: true, scheduledAt: true }
    });
    const elevator = (await prisma.commonAreaAsset.count({ where: { syndicateId: s.id, name: 'Ascenseur' } })) > 0;
    const place =
      (await prisma.generalMeeting.findFirst({ where: { syndicateId: s.id }, select: { location: true } }))?.location ??
      'Salle polyvalente de la résidence';

    // AG extraordinaire convoquée (travaux de ravalement ou d'ascenseur) : projet de résolutions
    if (lots.length >= 25 && meetings.filter(m => m.status === 'PLANNED').length < 2) {
      const at = local(end.getFullYear(), end.getMonth(), end.getDate() + between(rng, 38, 52), 15);
      const id = randomUUID();
      const subject = elevator
        ? 'Remplacement des câbles de traction et de la motorisation de l’ascenseur'
        : 'Réfection de la peinture des parties communes';
      await prisma.generalMeeting.create({
        data: {
          id,
          syndicateId: s.id,
          type: 'EXTRAORDINARY',
          scheduledAt: at,
          location: place,
          status: 'PLANNED',
          createdAt: addDays(end, -5)
        }
      });
      await prisma.gMAgendaItem.createMany({
        data: [
          {
            meetingId: id,
            orderIndex: 1,
            title: `Présentation des devis — ${subject}`,
            discussions: ['Trois devis comparés par le conseil syndical.']
          },
          { meetingId: id, orderIndex: 2, title: 'Vote des travaux et du plan de financement' },
          { meetingId: id, orderIndex: 3, title: 'Questions diverses' }
        ]
      });
      await prisma.gMResolution.createMany({
        data: [
          {
            meetingId: id,
            title: `Approbation des travaux : ${subject}`,
            description: 'Devis de l’entreprise la mieux-disante, soumis à la majorité absolue.',
            majorityRule: 'Majorité absolue (art. 25)'
          },
          {
            meetingId: id,
            title: 'Financement par appel exceptionnel et prélèvement sur le fonds de travaux',
            description: '70 % par appel de fonds exceptionnel aux tantièmes, le solde sur le fonds de travaux.',
            majorityRule: 'Majorité absolue (art. 25)'
          }
        ]
      });
    }

    // AGE annulée faute de quorum (seconde convocation faite depuis)
    if (lots.length >= 25 && !meetings.some(m => m.status === 'CANCELLED')) {
      const at = local(end.getFullYear(), end.getMonth(), end.getDate() - between(rng, 120, 150), 10);
      const id = randomUUID();
      await prisma.generalMeeting.create({
        data: {
          id,
          syndicateId: s.id,
          type: 'EXTRAORDINARY',
          scheduledAt: at,
          location: place,
          quorum: 31.4,
          status: 'CANCELLED',
          createdAt: addDays(at, -30)
        }
      });
      await prisma.gMAgendaItem.createMany({
        data: [
          {
            meetingId: id,
            orderIndex: 1,
            title: 'Autorisation de ravalement des façades',
            discussions: [
              'Quorum non atteint (31,4 % des tantièmes présents ou représentés) : l’assemblée n’a pu délibérer.'
            ]
          },
          {
            meetingId: id,
            orderIndex: 2,
            title: 'Mise en concurrence du contrat de gardiennage',
            discussions: ['Point reporté à la prochaine assemblée sur seconde convocation.']
          }
        ]
      });
    }

    // pouvoirs reçus pour la prochaine assemblée ordinaire
    const nextOrdinary = meetings
      .filter(m => m.status === 'PLANNED' && m.type === 'ORDINARY')
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0];
    if (nextOrdinary && owners.length >= 6) {
      const has = await prisma.gMProxy.count({ where: { meetingId: nextOrdinary.id } });
      if (has === 0) {
        const mixed = shuffle(rng, owners);
        const rows = Array.from({ length: Math.min(4, Math.floor(owners.length / 3)) }, (_, i) => ({
          meetingId: nextOrdinary.id,
          grantorContactId: mixed[i * 2],
          representativeContactId: mixed[i * 2 + 1],
          createdAt: addDays(end, -between(rng, 0, 2))
        }));
        await prisma.gMProxy.createMany({ data: rows });
      }
    }
  }
}

// ───────────────────────────────────────────────── copropriété en difficulté

/** La copropriété qui a le plus fort taux d'impayés passe « en litige » (si aucune ne l'est déjà). */
export async function flagTroubledSyndicate(env: SyndicEnv): Promise<void> {
  const { prisma, end } = env;
  const current = await prisma.syndicate.count({ where: { tenantId: env.tenantId, status: { not: 'ACTIVE' } } });
  if (current > 0 || env.syndicates.length < 2) return;
  let worst: { id: string; name: string; ratio: number } | null = null;
  for (const s of env.syndicates) {
    const rows = await prisma.$queryRaw<Array<{ called: number; paid: number }>>`
      SELECT COALESCE(SUM(c.amount), 0)::float AS called,
             COALESCE(SUM((SELECT COALESCE(SUM(a.amount), 0) FROM charge_payment_allocations a WHERE a.charge_call_id = c.id)), 0)::float AS paid
      FROM charge_calls c WHERE c.syndicate_id = ${s.id}::uuid AND c.due_date < ${end}`;
    const called = rows[0]?.called ?? 0;
    const ratio = called > 0 ? 1 - (rows[0]?.paid ?? 0) / called : 0;
    if (!worst || ratio > worst.ratio) worst = { id: s.id, name: s.name, ratio };
  }
  if (!worst) return;
  await prisma.syndicate.update({ where: { id: worst.id }, data: { status: 'IN_DISPUTE' } });
  env.log(
    `syndic-extras : « ${worst.name} » passe en litige (taux d’impayés ${Math.round(worst.ratio * 1000) / 10} %)`
  );
}
