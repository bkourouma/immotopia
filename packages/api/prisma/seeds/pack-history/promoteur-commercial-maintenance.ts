/**
 * Maintenance du promoteur : prestataires de garantie et tickets de parfait
 * achèvement / service après-vente déclarés par les acquéreurs des résidences
 * livrées (et par les locataires des lots conservés), avec historique de statuts,
 * commentaires, devis, factures et photos réels.
 *
 * L'écran « prestataires » lit `MaintenanceVendor` (route /maintenance/admin/vendors),
 * pas `ServiceProvider` (copropriété).
 */
import type { MaintenanceTicketCategory } from '@prisma/client';
import { between, pick } from './types';
import { addDays, roundTo } from './agence-commercial-data';
import { writeDemoPdf } from './seed-files';
import { writeScenePhoto } from './agence-locatif-files';
import type { Scene } from './agence-locatif-files';
import { dateFr, fcfa, slug } from './agence-locatif-base';
import { TICKET_COMMENTS_TENANT, VENDORS_PROMOTEUR, WARRANTY_TICKETS } from './promoteur-commercial-data';
import type { PEnv, WarrantyTicket } from './promoteur-commercial-data';
import type { LotUnit } from './promoteur-commercial-biens';

export interface VendorRef {
  id: string;
  name: string;
  specialties: string[];
  active: boolean;
}

/**
 * L'écran des prestataires lit `ServiceProvider` (source de vérité) et ne fusionne
 * `MaintenanceVendor` que par identifiant identique : tout prestataire du tenant
 * sans fiche `ServiceProvider` est invisible. Répare les lignes existantes.
 */
export async function ensureVendorProviders(env: PEnv): Promise<void> {
  const { prisma, tenantId, log } = env;
  const vendors = await prisma.maintenanceVendor.findMany({ where: { tenant_id: tenantId } });
  const providers = await prisma.serviceProvider.findMany({ where: { tenantId }, select: { id: true, name: true } });
  const ids = new Set(providers.map(p => p.id));
  const names = new Set(providers.map(p => p.name.toLowerCase()));
  let n = 0;
  for (const v of vendors) {
    if (ids.has(v.id) || names.has(v.name.toLowerCase())) continue;
    await prisma.serviceProvider.create({
      data: {
        id: v.id,
        tenantId,
        name: v.name,
        phone: v.phone,
        email: v.email,
        specialty: v.specialties.length > 0 ? v.specialties.join(', ') : null,
        createdAt: v.created_at
      }
    });
    n += 1;
  }
  if (n > 0) log(`promoteur-commercial : ${n} prestataires rendus visibles (fiche prestataire créée).`);
}

export async function seedVendors(env: PEnv): Promise<VendorRef[]> {
  const { prisma, tenantId, ctx, log } = env;
  const existing = await prisma.maintenanceVendor.findMany({ where: { tenant_id: tenantId } });
  const byName = new Map(existing.map(v => [v.name, v]));
  const out: VendorRef[] = [];
  let created = 0;
  for (const [i, v] of VENDORS_PROMOTEUR.entries()) {
    let row = byName.get(v.name);
    if (!row) {
      row = await prisma.maintenanceVendor.create({
        data: {
          tenant_id: tenantId,
          name: v.name,
          phone: v.phone,
          email: v.email,
          address: v.address,
          specialties: v.specialties,
          is_active: i !== VENDORS_PROMOTEUR.length - 1,
          created_at: addDays(ctx.end, -(700 - i * 60))
        }
      });
      created += 1;
    }
    out.push({ id: row.id, name: row.name, specialties: row.specialties, active: row.is_active });
  }
  await ensureVendorProviders(env);
  if (created > 0) log(`promoteur-commercial : ${created} prestataires de maintenance.`);
  return out;
}

const SCENE_BY_CATEGORY: Record<string, Scene[]> = {
  PLUMBING: ['CUISINE', 'EXTERIEUR'],
  ELECTRICITY: ['SALON', 'BUREAU'],
  AC: ['CHAMBRE', 'SALON'],
  OTHER: ['EXTERIEUR', 'SALON']
};

const COST_BY_CATEGORY: Record<string, [number, number]> = {
  PLUMBING: [25_000, 120_000],
  ELECTRICITY: [20_000, 90_000],
  AC: [35_000, 150_000],
  OTHER: [60_000, 450_000]
};

export interface TicketInput {
  propertyId: string;
  propertyTitle: string;
  propertyType: string;
  leaseId?: string | null;
  leaseNumber?: string | null;
  contactId: string;
  declared: Date;
  tpl: WarrantyTicket;
  vendors: VendorRef[];
  /** Impose le statut final (sinon déduit de l'ancienneté). */
  forceStatus?: 'DECLARED' | 'IN_PROGRESS' | 'ASSIGNED' | 'RESOLVED' | 'CANCELED';
  source: string;
}

type S = 'DECLARED' | 'IN_PROGRESS' | 'ASSIGNED' | 'RESOLVED' | 'CANCELED';

/** Écrit un ticket avec son historique, ses commentaires et ses pièces jointes. */
export async function writeTicket(env: PEnv, t: TicketInput): Promise<string> {
  const { prisma, tenantId, rng, ctx, staff } = env;
  const end = ctx.end;
  const declared = t.declared;
  const ageDays = Math.floor((end.getTime() - declared.getTime()) / 86_400_000);
  let status: S;
  if (t.forceStatus) status = t.forceStatus;
  else if (ageDays > 25) status = rng() < 0.9 ? 'RESOLVED' : 'CANCELED';
  else {
    const options: S[] = ['DECLARED', 'IN_PROGRESS', 'ASSIGNED'];
    if (ageDays >= 5) options.push('RESOLVED');
    status = pick(rng, options);
  }
  const matching = t.vendors.filter(v => v.active && v.specialties.includes(t.tpl.specialty));
  const withVendor = status === 'ASSIGNED' || (status === 'RESOLVED' && rng() < 0.8);
  const vendor = withVendor
    ? matching.length > 0
      ? pick(rng, matching)
      : pick(
          rng,
          t.vendors.filter(v => v.active)
        )
    : null;
  const manager = pick(rng, staff);
  const inProgressAt = status !== 'DECLARED' ? new Date(declared.getTime() + 26 * 3_600_000) : null;
  const assignedAt = vendor ? new Date(declared.getTime() + 2 * 86_400_000) : null;
  const resolveDelay = Math.max(2, Math.min(Math.max(ageDays - 1, 2), between(rng, 3, 16)));
  const resolvedAt = status === 'RESOLVED' ? new Date(declared.getTime() + resolveDelay * 86_400_000) : null;
  const canceledAt = status === 'CANCELED' ? new Date(declared.getTime() + between(rng, 1, 3) * 86_400_000) : null;
  const lastChange = resolvedAt ?? canceledAt ?? assignedAt ?? inProgressAt ?? declared;

  const ticket = await prisma.maintenanceTicket.create({
    data: {
      tenant_id: tenantId,
      property_id: t.propertyId,
      lease_id: t.leaseId ?? null,
      tenant_contact_id: t.contactId,
      created_by_contact_id: t.contactId,
      title: t.tpl.title,
      category: t.tpl.category as MaintenanceTicketCategory,
      priority: t.tpl.priority,
      description: t.tpl.description,
      location_details: t.tpl.location,
      status,
      assigned_vendor_id: vendor?.id ?? null,
      assigned_to_user_id: status === 'DECLARED' ? null : manager,
      resolution_notes: status === 'RESOLVED' ? t.tpl.resolution : null,
      declared_at: declared,
      in_progress_at: inProgressAt,
      assigned_at: assignedAt,
      resolved_at: resolvedAt,
      canceled_at: canceledAt,
      created_at: declared,
      updated_at: lastChange
    },
    select: { id: true }
  });

  const steps: { from: S | null; to: S; at: Date; note: string }[] = [
    { from: null, to: 'DECLARED', at: declared, note: t.source }
  ];
  if (inProgressAt)
    steps.push({
      from: 'DECLARED',
      to: 'IN_PROGRESS',
      at: inProgressAt,
      note: 'Pris en charge par le service après-vente du promoteur.'
    });
  if (assignedAt)
    steps.push({ from: 'IN_PROGRESS', to: 'ASSIGNED', at: assignedAt, note: `Entreprise mandatée : ${vendor?.name}.` });
  if (resolvedAt)
    steps.push({
      from: assignedAt ? 'ASSIGNED' : 'IN_PROGRESS',
      to: 'RESOLVED',
      at: resolvedAt,
      note: t.tpl.resolution
    });
  if (canceledAt)
    steps.push({ from: 'IN_PROGRESS', to: 'CANCELED', at: canceledAt, note: 'Annulé à la demande du déclarant.' });
  for (const s of steps) {
    await prisma.maintenanceTicketStatusHistory.create({
      data: {
        tenant_id: tenantId,
        ticket_id: ticket.id,
        from_status: s.from,
        to_status: s.to,
        note: s.note,
        changed_by_user_id: s.from === null ? null : manager,
        changed_at: s.at
      }
    });
  }

  const comments: { author: 'TENANT' | 'MANAGER'; text: string; at: Date }[] = [
    { author: 'TENANT', text: t.tpl.description, at: declared }
  ];
  if (inProgressAt) comments.push({ author: 'MANAGER', text: t.tpl.managerReply, at: inProgressAt });
  if (assignedAt && vendor) {
    comments.push({
      author: 'MANAGER',
      text: `${vendor.name} passera chez vous sous 72 heures ; merci de laisser l’accès libre ou de prévenir le gardien.`,
      at: assignedAt
    });
  }
  if (resolvedAt) {
    comments.push({ author: 'MANAGER', text: `Intervention terminée : ${t.tpl.resolution}`, at: resolvedAt });
    if (rng() < 0.65) {
      comments.push({
        author: 'TENANT',
        text: pick(rng, TICKET_COMMENTS_TENANT),
        at: new Date(resolvedAt.getTime() + 4 * 3_600_000)
      });
    }
  }
  if (canceledAt)
    comments.push({
      author: 'TENANT',
      text: 'Le désordre a été réglé lors d’un passage du syndic, je retire ma demande.',
      at: canceledAt
    });
  for (const c of comments) {
    await prisma.maintenanceTicketComment.create({
      data: {
        tenant_id: tenantId,
        ticket_id: ticket.id,
        author_type: c.author,
        content: c.text,
        author_user_id: c.author === 'MANAGER' ? manager : null,
        author_contact_id: c.author === 'TENANT' ? t.contactId : null,
        created_at: c.at
      }
    });
  }

  // Pièces jointes réelles : photos du désordre, devis, facture, photo après intervention.
  const segments = ['maintenance', tenantId, ticket.id];
  const scenes = SCENE_BY_CATEGORY[t.tpl.category] ?? SCENE_BY_CATEGORY.OTHER;
  const add = async (
    stored: { fileUrl: string; fileName: string; fileSize: number; mimeType: string },
    at: Date,
    byContact: boolean
  ): Promise<void> => {
    await prisma.maintenanceTicketAttachment.create({
      data: {
        tenant_id: tenantId,
        ticket_id: ticket.id,
        file_url: stored.fileUrl,
        file_name: stored.fileName,
        mime_type: stored.mimeType,
        file_size: stored.fileSize,
        uploaded_by_user_id: byContact ? null : manager,
        uploaded_by_contact_id: byContact ? t.contactId : null,
        created_at: at
      }
    });
  };
  const photos = 1 + (rng() < 0.45 ? 1 : 0);
  for (let n = 0; n < photos; n++) {
    const stored = await writeScenePhoto(
      segments,
      `desordre-${n + 1}-${slug(t.tpl.title).slice(0, 30)}.png`,
      t.propertyType,
      `${ticket.id}:declaration`,
      scenes[n % scenes.length],
      n
    );
    await add(stored, new Date(declared.getTime() + 120_000 * (n + 1)), true);
  }
  if (vendor && assignedAt && status !== 'CANCELED') {
    const [lo, hi] = COST_BY_CATEGORY[t.tpl.category] ?? COST_BY_CATEGORY.OTHER;
    const amount = roundTo(between(rng, lo, hi), 2_500);
    const quoteAt = new Date(assignedAt.getTime() + 3_600_000);
    const quote = await writeDemoPdf(segments, 'devis.pdf', `Devis — ${vendor.name}`, [
      `Objet : ${t.tpl.title}`,
      `Bien : ${t.propertyTitle}${t.leaseNumber ? ` (bail ${t.leaseNumber})` : ''}`,
      `Date : ${dateFr(quoteAt)}`,
      '',
      '# Détail',
      `Main-d’œuvre et déplacement : ${fcfa(Math.round(amount * 0.45))}`,
      `Fournitures : ${fcfa(Math.round(amount * 0.55))}`,
      `Total TTC : ${fcfa(amount)}`,
      '',
      'Désordre relevant de la garantie : prise en charge par le promoteur. Intervention sous 72 heures après accord.'
    ]);
    await add(quote, quoteAt, false);
    if (resolvedAt) {
      const invoice = await writeDemoPdf(segments, 'facture.pdf', `Facture — ${vendor.name}`, [
        `Objet : ${t.tpl.title}`,
        `Bien : ${t.propertyTitle}`,
        `Date : ${dateFr(resolvedAt)}`,
        '',
        `Montant total : ${fcfa(amount)}`,
        `Travaux réalisés : ${t.tpl.resolution}`,
        'Règlement : à 30 jours par virement, facturé au promoteur au titre de la garantie.'
      ]);
      await add(invoice, new Date(resolvedAt.getTime() + 1_800_000), false);
      if (rng() < 0.6) {
        const after = await writeScenePhoto(
          segments,
          `apres-intervention-${slug(t.tpl.title).slice(0, 24)}.png`,
          t.propertyType,
          `${ticket.id}:apres`,
          scenes[0],
          7
        );
        await add(after, new Date(resolvedAt.getTime() + 900_000), false);
      }
    }
  }
  return ticket.id;
}

/**
 * Tickets de garantie de parfait achèvement et de service après-vente sur les
 * résidences livrées : déclarés par les acquéreurs des lots vendus après la
 * remise des clés.
 */
export async function seedWarrantyMaintenance(env: PEnv, _units: LotUnit[]): Promise<void> {
  const { prisma, tenantId, rng, ctx, log } = env;
  const vendors = await seedVendors(env);
  if ((await prisma.maintenanceTicket.count({ where: { tenant_id: tenantId } })) > 0) {
    log('promoteur-commercial : tickets déjà présents, bloc sauté.');
    return;
  }
  const delivered = await prisma.constructionSite.findMany({
    where: { tenantId, closedAt: { not: null } },
    select: { id: true, name: true, closedAt: true }
  });
  const agreements = await prisma.saleAgreement.findMany({
    where: { tenantId, status: 'COMPLETED' },
    select: {
      deedDate: true,
      property: { select: { id: true, title: true, propertyType: true, internalReference: true } },
      offer: { select: { buyerContactId: true } }
    },
    orderBy: { deedDate: 'asc' }
  });
  const prefixOf = (name: string): string | null =>
    /cocotiers/i.test(name)
      ? 'COC'
      : /orchid/i.test(name)
        ? 'ORC'
        : /angr/i.test(name)
          ? 'ANG'
          : /vallons/i.test(name)
            ? 'VAL'
            : null;
  const keysByPrefix = new Map(delivered.map(d => [prefixOf(d.name), d.closedAt as Date]));

  let created = 0;
  let recent = 0;
  const pool = [...WARRANTY_TICKETS];
  for (const a of agreements) {
    const prefix = a.property.internalReference.split('-')[0];
    const deliveredAt = keysByPrefix.get(prefix);
    if (!deliveredAt || !a.deedDate) continue;
    if (rng() > 0.62) continue;
    const count = rng() < 0.22 ? 2 : 1;
    const from = addDays(new Date(Math.max(deliveredAt.getTime(), a.deedDate.getTime())), 12);
    for (let k = 0; k < count; k++) {
      const span = Math.floor((ctx.end.getTime() - from.getTime()) / 86_400_000) - 2;
      if (span < 4) continue;
      // La garantie de parfait achèvement concentre les déclarations dans les premiers mois.
      const offset = Math.floor(Math.pow(rng(), 1.7) * span);
      const declared = addDays(from, offset);
      declared.setHours(between(rng, 8, 18), pick(rng, [0, 12, 27, 41]), 0, 0);
      const tpl = pool[Math.floor(rng() * pool.length)];
      if (ctx.end.getTime() - declared.getTime() < 30 * 86_400_000) recent += 1;
      await writeTicket(env, {
        propertyId: a.property.id,
        propertyTitle: a.property.title,
        propertyType: a.property.propertyType,
        contactId: a.offer.buyerContactId,
        declared,
        tpl,
        vendors,
        source: 'Signalé par l’acquéreur au service après-vente (garantie de parfait achèvement).'
      });
      created += 1;
    }
  }
  // Le tableau « ce mois-ci » doit vivre : quatre déclarations récentes, une par statut ouvert.
  if (recent < 4) {
    const candidates = agreements.filter(a => keysByPrefix.has(a.property.internalReference.split('-')[0]));
    const statuses: Array<'DECLARED' | 'IN_PROGRESS' | 'ASSIGNED' | 'RESOLVED'> = [
      'DECLARED',
      'IN_PROGRESS',
      'ASSIGNED',
      'RESOLVED'
    ];
    for (let i = 0; i < 4 - recent && candidates.length > 0; i++) {
      const a = candidates[Math.floor(rng() * candidates.length)];
      const declared = addDays(ctx.end, -between(rng, 2, 20));
      declared.setHours(between(rng, 8, 18), 10, 0, 0);
      await writeTicket(env, {
        propertyId: a.property.id,
        propertyTitle: a.property.title,
        propertyType: a.property.propertyType,
        contactId: a.offer.buyerContactId,
        declared,
        tpl: pool[Math.floor(rng() * pool.length)],
        vendors,
        forceStatus: statuses[i % statuses.length],
        source: 'Signalé par l’acquéreur au service après-vente (garantie de parfait achèvement).'
      });
      created += 1;
    }
  }
  log(`promoteur-commercial : ${created} tickets de garantie et de service après-vente.`);
}
