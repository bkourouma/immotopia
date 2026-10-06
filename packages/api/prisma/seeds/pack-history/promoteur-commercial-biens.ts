/**
 * Biens du programme : lots des chantiers présentés comme un programme en
 * commercialisation (types variés, prix de vente, statuts), appartements témoins,
 * boxes de parking, sociétés de projet (clients propriétaires) et mandats.
 *
 * Les lots restent rattachés à leur chantier par la référence (`COC-B7`) ; seule
 * la bascule au patrimoine (`capitalizeSiteLotTx`) lie `site_lots.property_id`.
 */
import { between } from './types';
import { addDays } from './agence-commercial-data';
import { writeDemoPdf } from './seed-files';
import { PROGRAMS, lotSpec, floorLabel, roundTo } from './promoteur-commercial-data';
import type { LotSpec, PEnv, ProgCode } from './promoteur-commercial-data';

export interface SiteInfo {
  id: string;
  code: ProgCode;
  name: string;
  status: string;
  startDate: Date | null;
  plannedEndDate: Date | null;
  closedAt: Date | null;
  /** Avancement physique constaté (date, %), croissant. */
  progress: Array<{ date: Date; pct: number }>;
}

export type LotState =
  | 'SOLD'
  | 'SOLD_AFTER_CANCEL'
  | 'UNDER_OFFER'
  | 'RESERVED'
  | 'CANCELLED_AVAILABLE'
  | 'OPEN_OFFERS'
  | 'LOST_OFFERS'
  | 'AVAILABLE'
  | 'DRAFT';

export interface LotUnit {
  prog: ProgCode;
  /** Référence interne du bien (`COC-B7`). */
  ref: string;
  /** `Lot B7` ; null pour un bien sans lot de chantier (parking, témoin). */
  lotName: string | null;
  surface: number;
  floor: number;
  block: string;
  spec: LotSpec;
  price: number;
  state: LotState;
  /** Date de mise en commercialisation. */
  launchedAt: Date;
  propertyId?: string;
  /** Renseigné par les blocs de vente : date de l'acte, pour les statuts et les documents. */
  deedDate?: Date | null;
  buyerName?: string;
}

const CODE_BY_NAME: Array<[RegExp, ProgCode]> = [
  [/cocotiers/i, 'COC'],
  [/orchid/i, 'ORC'],
  [/angr/i, 'ANG'],
  [/vallons/i, 'VAL']
];

export async function loadSites(env: PEnv): Promise<SiteInfo[]> {
  const { prisma, tenantId } = env;
  const rows = await prisma.constructionSite.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      plannedEndDate: true,
      closedAt: true,
      progressEntries: { select: { entryDate: true, percent: true }, orderBy: { entryDate: 'asc' } }
    }
  });
  const out: SiteInfo[] = [];
  for (const r of rows) {
    const code = CODE_BY_NAME.find(([re]) => re.test(r.name))?.[1];
    if (!code) continue;
    out.push({
      id: r.id,
      code,
      name: r.name,
      status: r.status,
      startDate: r.startDate,
      plannedEndDate: r.plannedEndDate,
      closedAt: r.closedAt,
      progress: r.progressEntries.map(p => ({ date: p.entryDate, pct: Number(p.percent) }))
    });
  }
  return out;
}

/** Première date où l'avancement atteint `pct` ; estimation linéaire sur le planning sinon. */
export function progressDate(site: SiteInfo, pct: number): Date | null {
  if (pct <= 0) return site.startDate;
  const hit = site.progress.find(p => p.pct >= pct);
  if (hit) return hit.date;
  if (site.startDate && site.plannedEndDate) {
    const span = site.plannedEndDate.getTime() - site.startDate.getTime();
    return new Date(site.startDate.getTime() + (span * pct) / 100);
  }
  return null;
}

const STATE_COUNTS: Record<ProgCode, Array<[LotState, number]>> = {
  COC: [
    ['SOLD', 22],
    ['SOLD_AFTER_CANCEL', 2],
    ['UNDER_OFFER', 1],
    ['RESERVED', 1],
    ['OPEN_OFFERS', 1]
  ],
  ORC: [
    ['SOLD', 9],
    ['SOLD_AFTER_CANCEL', 1],
    ['UNDER_OFFER', 1],
    ['RESERVED', 1]
  ],
  ANG: [
    ['SOLD', 14],
    ['SOLD_AFTER_CANCEL', 2],
    ['UNDER_OFFER', 10],
    ['RESERVED', 4],
    ['CANCELLED_AVAILABLE', 1],
    ['OPEN_OFFERS', 6],
    ['LOST_OFFERS', 2]
  ],
  VAL: [
    ['UNDER_OFFER', 2],
    ['RESERVED', 3],
    ['OPEN_OFFERS', 5],
    ['DRAFT', 3]
  ]
};

function shuffle<T>(rng: () => number, items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Lots non conservés des chantiers, avec leur typologie, leur prix et leur état de commercialisation. */
export async function planLots(env: PEnv, sites: SiteInfo[]): Promise<LotUnit[]> {
  const { prisma, tenantId, rng, ctx } = env;
  const units: LotUnit[] = [];
  for (const site of sites) {
    const lots = await prisma.siteLot.findMany({
      where: { tenantId, siteId: site.id, propertyId: null },
      orderBy: { name: 'asc' },
      select: { name: true, surfaceArea: true }
    });
    if (lots.length === 0) continue;
    const program = PROGRAMS[site.code];
    const start = site.startDate ?? ctx.end;
    const launch =
      site.code === 'VAL'
        ? addDays(ctx.end, -112)
        : new Date(Math.min(addDays(start, 32).getTime(), addDays(ctx.end, -20).getTime()));

    // États : tirage des lots, le reste est disponible.
    const states: LotState[] = [];
    for (const [state, n] of STATE_COUNTS[site.code]) for (let i = 0; i < n; i++) states.push(state);
    const ordered = shuffle(
      rng,
      lots.map((_, i) => i)
    );
    const stateByIndex = new Map<number, LotState>();
    ordered.forEach((lotIndex, k) => stateByIndex.set(lotIndex, k < states.length ? states[k] : 'AVAILABLE'));

    // Boutiques : trois petits lots du rez-de-chaussée au plus.
    let shops = 0;
    lots.forEach((lot, i) => {
      const surface = Number(lot.surfaceArea ?? 70);
      const idx = Number(lot.name.replace(/\D/g, '')) || i + 1;
      const block = lot.name.replace(/^Lot\s+/, '').replace(/\d+$/, '') || 'A';
      const floor = Math.floor((idx - 1) / 3);
      const commercial = floor === 0 && surface <= 74 && shops < 3 && stateByIndex.get(i) !== 'DRAFT';
      if (commercial) shops += 1;
      const spec = lotSpec(site.code, surface, commercial, floor);
      const noise = 1 + (rng() - 0.5) * 0.05;
      const raw = program.pricePerM2 * surface * spec.premium * noise;
      const price = roundTo(raw, raw >= 60_000_000 ? 1_000_000 : 500_000);
      units.push({
        prog: site.code,
        ref: `${site.code}-${lot.name.replace(/^Lot\s+/, '')}`,
        lotName: lot.name,
        surface,
        floor,
        block,
        spec,
        price,
        state: stateByIndex.get(i) ?? 'AVAILABLE',
        launchedAt: addDays(launch, between(rng, 0, 12))
      });
    });

    // Boxes de parking : toujours à vendre, jamais encore réservés.
    const boxes = site.code === 'ANG' ? 6 : site.code === 'VAL' ? 3 : site.code === 'ORC' ? 2 : 0;
    for (let n = 1; n <= boxes; n++) {
      units.push({
        prog: site.code,
        ref: `${site.code}-P${n}`,
        lotName: null,
        surface: 12.5,
        floor: -1,
        block: 'P',
        spec: { type: 'APPARTEMENT', label: 'Box de parking', rooms: 0, bedrooms: 0, bathrooms: 0, premium: 1 },
        price: roundTo(3_500_000 + n * 250_000 + (site.code === 'VAL' ? 800_000 : 0), 250_000),
        state: 'AVAILABLE',
        launchedAt: addDays(launch, 20 + n)
      });
    }
  }
  return units;
}

// ───────────────────────────────────────────────────────── textes

function typeLabel(u: LotUnit): string {
  if (u.ref.includes('-P')) return 'Box de parking';
  return u.spec.label;
}

function describe(u: LotUnit, delivered: Date | null, now: Date): { title: string; description: string } {
  const program = PROGRAMS[u.prog];
  const label = typeLabel(u);
  const lot = u.lotName ? ` (${u.lotName.toLowerCase()})` : '';
  const title = u.ref.includes('-P')
    ? `Box de parking n°${u.ref.split('-P')[1]} — ${program.brand}`
    : `${label} — ${program.brand}${lot}`;
  const state =
    delivered && delivered <= now ? `Livré en ${delivered.getFullYear()}` : 'Vente en l’état futur d’achèvement (VEFA)';
  let body: string;
  if (u.ref.includes('-P')) {
    body = `Place de stationnement fermée au sous-sol de ${program.brand}, ${program.highlights}. Accès sécurisé par télécommande, éclairage par détecteur de présence, prise pour véhicule électrique en option.`;
  } else if (u.spec.type === 'BOUTIQUE_COMMERCIAL') {
    body = `Local commercial de ${u.surface} m² en rez-de-chaussée de ${program.brand}, ${program.highlights}. Vitrine sur voie passante, attente d’évacuation pour sanitaires, tableau électrique indépendant. Idéal pour une pharmacie, une supérette de proximité ou un cabinet de services.`;
  } else {
    body =
      `${label} de ${u.surface} m² (${u.spec.rooms} pièces, ${u.spec.bedrooms} chambre${u.spec.bedrooms > 1 ? 's' : ''}) au ${floorLabel(Math.max(u.floor, 0))} du bâtiment ${u.block} de ${program.brand}, ${program.highlights}. ` +
      `Cuisine équipée en option, carrelage grand format, menuiseries aluminium, climatisation en attente, réservation d’eau chaude. Titre foncier individuel après la signature de l’acte.`;
  }
  return { title, description: `${body} ${state}. Paiement possible par appels de fonds à l’avancement du chantier.` };
}

// ───────────────────────────────────────────────────────── sociétés de projet

export interface SpvInfo {
  clientId: string;
  userId: string;
  name: string;
}

/** Une société de projet par programme, cliente propriétaire de ses lots (vendeur des mandats de vente). */
export async function seedSpvClients(env: PEnv, codes: ProgCode[]): Promise<Map<ProgCode, SpvInfo>> {
  const { prisma, tenantId, tag, ctx, log } = env;
  const out = new Map<ProgCode, SpvInfo>();
  let created = 0;
  for (const code of codes) {
    const program = PROGRAMS[code];
    const email = `${program.spvSlug}.${tag}@packs.immotopia.test`;
    let user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, fullName: program.spvName, isActive: true, createdAt: addDays(ctx.start, 20) },
        select: { id: true }
      });
    }
    let client = await prisma.tenantClient.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
      select: { id: true }
    });
    if (!client) {
      client = await prisma.tenantClient.create({
        data: {
          userId: user.id,
          tenantId,
          clientType: 'OWNER',
          details: { source: 'pack-history', nature: 'Société de projet', programme: program.brand },
          ownerTaxStatus: 'COMPANY',
          createdAt: addDays(ctx.start, 20)
        },
        select: { id: true }
      });
      created += 1;
    }
    out.set(code, { clientId: client.id, userId: user.id, name: program.spvName });
  }
  if (created > 0) log(`promoteur-commercial : ${created} société(s) de projet clientes propriétaires.`);
  return out;
}

// ───────────────────────────────────────────────────────── écriture des biens

export async function seedProgramProperties(
  env: PEnv,
  sites: SiteInfo[],
  units: LotUnit[],
  spv: Map<ProgCode, SpvInfo>
): Promise<void> {
  const { prisma, tenantId, rng, ctx, staff, log } = env;
  const siteByCode = new Map(sites.map(s => [s.code, s]));
  let created = 0;

  for (const u of units) {
    const existing = await prisma.property.findFirst({
      where: { tenantId, internalReference: u.ref },
      select: { id: true }
    });
    if (existing) {
      u.propertyId = existing.id;
      continue;
    }
    const program = PROGRAMS[u.prog];
    const site = siteByCode.get(u.prog);
    const delivered = site?.closedAt ?? null;
    const { title, description } = describe(u, delivered, ctx.end);
    const draft = u.state === 'DRAFT';
    const published =
      u.state === 'AVAILABLE' ||
      u.state === 'OPEN_OFFERS' ||
      u.state === 'LOST_OFFERS' ||
      u.state === 'CANCELLED_AVAILABLE';
    const createdAt = u.launchedAt;
    const row = await prisma.property.create({
      data: {
        internalReference: u.ref,
        propertyType: u.ref.includes('-P') ? 'PARKING_BOX' : u.spec.type,
        ownershipType: 'CLIENT',
        ownerUserId: spv.get(u.prog)?.userId ?? null,
        tenantId,
        title,
        description,
        address: `${program.brand}, ${program.place}`,
        locationZone: program.zone,
        latitude: Number((program.lat + (rng() - 0.5) * 0.006).toFixed(6)),
        longitude: Number((program.lng + (rng() - 0.5) * 0.006).toFixed(6)),
        transactionModes: ['SALE'],
        price: u.price,
        currency: 'XOF',
        surfaceArea: u.surface,
        surfaceUseful: Math.round(u.surface * 0.92 * 10) / 10,
        rooms: u.spec.rooms || null,
        bedrooms: u.spec.bedrooms || null,
        bathrooms: u.spec.bathrooms || null,
        status: draft ? 'DRAFT' : 'AVAILABLE',
        isPublished: published,
        publishedAt: published ? addDays(createdAt, between(rng, 1, 4)) : null,
        availability: delivered && delivered <= ctx.end ? 'AVAILABLE' : 'SOON_AVAILABLE',
        qualityScore: between(rng, 68, 96),
        createdAt
      },
      select: { id: true }
    });
    u.propertyId = row.id;
    created += 1;
    if (!draft) {
      await prisma.propertyStatusHistory.create({
        data: {
          propertyId: row.id,
          tenantId,
          previousStatus: 'DRAFT',
          newStatus: 'AVAILABLE',
          changedByUserId: staff[between(rng, 0, staff.length - 1)],
          notes: 'Lot mis en commercialisation avec la grille de prix du programme',
          createdAt: addDays(createdAt, 1)
        }
      });
    }
  }

  // Appartements témoins : vendables, visités chaque semaine.
  for (const [code, label, surface, type, rooms] of [
    ['ANG', 'Appartement témoin F3', 82, 'APPARTEMENT', 3],
    ['VAL', 'Villa témoin F4', 118, 'MAISON_VILLA', 5]
  ] as const) {
    const program = PROGRAMS[code];
    const ref = `${code}-TEMOIN`;
    if (!spv.has(code) && !siteByCode.has(code)) continue;
    if (await prisma.property.findFirst({ where: { tenantId, internalReference: ref }, select: { id: true } }))
      continue;
    const createdAt = addDays(ctx.end, -(code === 'ANG' ? 540 : 100));
    await prisma.property.create({
      data: {
        internalReference: ref,
        propertyType: type,
        ownershipType: 'CLIENT',
        ownerUserId: spv.get(code)?.userId ?? null,
        tenantId,
        title: `${label} — ${program.brand}`,
        description: `${label} meublé et décoré par notre architecte d’intérieur, ouvert à la visite du lundi au samedi sur rendez-vous au bureau de vente de ${program.brand}, ${program.highlights}. Les finitions présentées (carrelage, cuisine, menuiseries) sont celles des lots livrés ; ce lot témoin est cédé en dernier, avec ses meubles.`,
        address: `Bureau de vente, ${program.brand}, ${program.place}`,
        locationZone: program.zone,
        latitude: program.lat,
        longitude: program.lng,
        transactionModes: ['SALE'],
        price: roundTo(program.pricePerM2 * surface * 1.04, 500_000),
        currency: 'XOF',
        surfaceArea: surface,
        surfaceUseful: Math.round(surface * 0.92),
        rooms,
        bedrooms: rooms - 1,
        bathrooms: 2,
        furnishingStatus: 'FURNISHED',
        status: 'AVAILABLE',
        isPublished: true,
        publishedAt: addDays(createdAt, 2),
        availability: 'AVAILABLE',
        qualityScore: between(rng, 85, 98),
        createdAt
      }
    });
    created += 1;
  }

  // Mandats de commercialisation confiés par la société de projet : un par lot à la vente (boxes et lots témoins compris).
  let mandates = 0;
  const temoins = await prisma.property.findMany({
    where: { tenantId, internalReference: { endsWith: '-TEMOIN' } },
    select: { id: true, internalReference: true, createdAt: true }
  });
  const targets: LotUnit[] = [
    ...units,
    ...temoins.map(t => ({
      prog: t.internalReference.split('-')[0] as ProgCode,
      ref: t.internalReference,
      lotName: null,
      surface: 0,
      floor: 0,
      block: 'T',
      spec: { type: 'APPARTEMENT' as const, label: 'Lot témoin', rooms: 0, bedrooms: 0, bathrooms: 0, premium: 1 },
      price: 0,
      state: 'AVAILABLE' as LotState,
      launchedAt: t.createdAt,
      propertyId: t.id
    }))
  ];
  for (const u of targets) {
    if (!u.propertyId || u.state === 'DRAFT') continue;
    const owner = spv.get(u.prog);
    if (!owner) continue;
    const has = await prisma.propertyMandate.count({ where: { propertyId: u.propertyId, tenantId } });
    if (has > 0) continue;
    const start = addDays(u.launchedAt, -between(rng, 2, 9));
    const sold = u.state === 'SOLD' || u.state === 'SOLD_AFTER_CANCEL';
    await prisma.propertyMandate.create({
      data: {
        propertyId: u.propertyId,
        tenantId,
        ownerUserId: owner.userId,
        startDate: start,
        endDate: addDays(start, 730),
        scope: { vente: true, gestionLocative: false, commercialisation: true, programme: PROGRAMS[u.prog].brand },
        notes: `Mandat de commercialisation du lot confié par ${owner.name} à l’équipe de vente du promoteur.`,
        isActive: !sold,
        // La clôture à la date de l'acte est posée par le bloc des ventes (date de l'acte connue alors).
        createdAt: start
      }
    });
    mandates += 1;
  }
  log(`promoteur-commercial : ${created} biens de programme créés, ${mandates} mandats de commercialisation.`);
}

/** Notice de présentation du programme (PDF) rattachée au bien « témoin » : brochure commerciale réelle. */
export async function seedProgramBrochures(env: PEnv): Promise<void> {
  const { prisma, tenantId, ctx, log } = env;
  const temoins = await prisma.property.findMany({
    where: { tenantId, internalReference: { endsWith: '-TEMOIN' }, documents: { none: {} } },
    select: { id: true, internalReference: true, title: true }
  });
  for (const p of temoins) {
    const code = p.internalReference.split('-')[0] as ProgCode;
    const program = PROGRAMS[code];
    if (!program) continue;
    const file = await writeDemoPdf(
      ['properties', p.id, 'documents'],
      `brochure-${code.toLowerCase()}`,
      `Brochure commerciale — ${program.brand}`,
      [
        `# ${program.brand} — ${program.place}`,
        `Programme immobilier neuf, ${program.highlights}.`,
        '',
        '# Typologies et prix',
        `Appartements du F2 au F4, duplex et boutiques. Prix moyen : ${new Intl.NumberFormat('fr-FR').format(program.pricePerM2)} F CFA le m².`,
        '',
        '# Modalités de paiement',
        'Acompte de 10 % à la réservation, puis appels de fonds à l’avancement du chantier, solde de 10 % à la remise des clés.',
        '',
        '# Garanties',
        'Garantie financière d’achèvement, garantie de parfait achèvement d’un an, garantie biennale sur les équipements.'
      ]
    );
    await prisma.propertyDocument.create({
      data: {
        propertyId: p.id,
        tenantId,
        documentType: 'OTHER',
        filePath: file.filePath,
        fileUrl: file.fileUrl,
        fileName: `Brochure commerciale — ${program.brand}.pdf`,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        isRequired: false,
        isValid: true,
        createdAt: addDays(ctx.end, -90)
      }
    });
  }
  if (temoins.length > 0) log(`promoteur-commercial : ${temoins.length} brochure(s) de programme.`);
}
