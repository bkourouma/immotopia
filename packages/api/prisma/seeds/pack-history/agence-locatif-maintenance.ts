/**
 * Maintenance : carnet d'entretien des biens (journal) et pièces jointes des
 * tickets (photos du problème, devis et factures des prestataires, photos après
 * intervention). Les fichiers sont réels et déposés au chemin privé du module
 * (`uploads/maintenance/<agence>/<ticket>/`), servis par la route authentifiée.
 */
import { Prisma } from '@prisma/client';
import type { MaintenanceLogCategory } from '@prisma/client';
import { between } from './types';
import { writeDemoPdf } from './seed-files';
import { writeScenePhoto } from './agence-locatif-files';
import type { Scene } from './agence-locatif-files';
import { dateFr, fcfa, noonUtc, pickOne, plusDays, plusMonths, roundTo, slug } from './agence-locatif-base';
import type { LocatifBase } from './agence-locatif-base';

interface LogTemplate {
  category: MaintenanceLogCategory;
  description: string;
  cost: [number, number];
  periodMonths: number | null;
  warrantyMonths: number | null;
  specialties: string[];
  types?: string[];
}

const TEMPLATES: LogTemplate[] = [
  {
    category: 'AIR_CONDITIONING',
    description:
      'Entretien annuel des climatiseurs : nettoyage des filtres, contrôle du niveau de gaz et des condensats.',
    cost: [35_000, 95_000],
    periodMonths: 12,
    warrantyMonths: null,
    specialties: ['ac', 'refrigeration']
  },
  {
    category: 'PLUMBING',
    description: 'Révision de la plomberie : détartrage du chauffe-eau, remplacement des flexibles et des joints.',
    cost: [25_000, 110_000],
    periodMonths: 24,
    warrantyMonths: 6,
    specialties: ['plumbing', 'water_heater']
  },
  {
    category: 'ELECTRICAL',
    description: 'Contrôle du tableau électrique, resserrage des connexions et test des disjoncteurs différentiels.',
    cost: [20_000, 80_000],
    periodMonths: 24,
    warrantyMonths: null,
    specialties: ['electricity']
  },
  {
    category: 'GENERATOR',
    description: 'Entretien du groupe électrogène : vidange, changement des filtres et test de bascule automatique.',
    cost: [60_000, 180_000],
    periodMonths: 6,
    warrantyMonths: null,
    specialties: ['generator', 'electricity'],
    types: ['MAISON_VILLA', 'IMMEUBLE', 'ENTREPOT_INDUSTRIEL', 'BUREAU', 'BOUTIQUE_COMMERCIAL', 'DUPLEX_TRIPLEX']
  },
  {
    category: 'ROOF_WATERPROOFING',
    description:
      'Réfection de l’étanchéité de la toiture-terrasse après infiltrations constatées en saison des pluies.',
    cost: [450_000, 2_400_000],
    periodMonths: null,
    warrantyMonths: 60,
    specialties: ['other', 'masonry'],
    types: ['MAISON_VILLA', 'IMMEUBLE', 'ENTREPOT_INDUSTRIEL', 'DUPLEX_TRIPLEX', 'BUREAU']
  },
  {
    category: 'PAINTING',
    description: 'Peinture complète des murs et plafonds avant la remise en location.',
    cost: [220_000, 850_000],
    periodMonths: null,
    warrantyMonths: 12,
    specialties: ['painting', 'other']
  },
  {
    category: 'OTHER',
    description: 'Désinsectisation et dératisation des locaux, traitement préventif des parties communes.',
    cost: [30_000, 120_000],
    periodMonths: 12,
    warrantyMonths: null,
    specialties: ['other']
  },
  {
    category: 'OTHER',
    description: 'Remplacement des serrures et reproduction d’un jeu de clés pour le nouveau locataire.',
    cost: [25_000, 90_000],
    periodMonths: null,
    warrantyMonths: 12,
    specialties: ['locksmith', 'other']
  }
];

export async function seedMaintenanceLog(base: LocatifBase): Promise<void> {
  const { prisma, tenantId, rng, start, end, log } = base.ctx;
  if ((await prisma.maintenanceLogEntry.count({ where: { tenantId } })) > 0) {
    log('carnet d’entretien : déjà présent, bloc sauté.');
    return;
  }
  const vendors = await prisma.maintenanceVendor.findMany({
    where: { tenant_id: tenantId },
    select: { id: true, specialties: true, is_active: true }
  });
  const properties = new Map<string, { type: string }>();
  for (const l of base.leases) properties.set(l.propertyId, { type: l.propertyType });

  const rows: Prisma.MaintenanceLogEntryCreateManyInput[] = [];
  const horizonDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) - 3;
  let propertyIndex = 0;
  for (const [propertyId, info] of properties) {
    propertyIndex += 1;
    const eligible = TEMPLATES.filter(t => !t.types || t.types.includes(info.type));
    const count = between(rng, 2, 5);
    const picked = new Set<number>();
    for (let n = 0; n < count; n++) {
      let ti = Math.floor(rng() * eligible.length);
      let guard = 0;
      while (picked.has(ti) && guard++ < 10) ti = (ti + 1) % eligible.length;
      picked.add(ti);
      const t = eligible[ti];
      // Les entretiens périodiques se répètent ; les travaux ponctuels n'ont lieu qu'une fois.
      const occurrences = t.periodMonths ? Math.min(3, Math.max(1, Math.floor(36 / t.periodMonths))) : 1;
      const first = noonUtc(plusDays(start, between(rng, 20, Math.max(60, horizonDays - (t.periodMonths ?? 0) * 3))));
      for (let o = 0; o < occurrences; o++) {
        const performedAt = t.periodMonths ? plusMonths(first, o * t.periodMonths) : first;
        if (performedAt.getTime() > end.getTime() - 86_400_000) continue;
        const vendor = vendors.filter(v => v.is_active && v.specialties.some(s => t.specialties.includes(s)));
        const chosen = vendor.length > 0 ? pickOne(rng, vendor) : null;
        const nextDue = t.periodMonths ? plusMonths(performedAt, t.periodMonths) : null;
        rows.push({
          tenantId,
          propertyId,
          category: t.category,
          performedAt,
          vendorId: chosen?.id ?? null,
          cost: new Prisma.Decimal(roundTo(between(rng, t.cost[0], t.cost[1]), 5000)),
          currency: 'XOF',
          description: t.description,
          nextDueDate: nextDue,
          warrantyEndDate: t.warrantyMonths ? plusMonths(performedAt, t.warrantyMonths) : null,
          createdByUserId: pickOne(rng, base.signers).id,
          createdAt: performedAt,
          updatedAt: performedAt
        });
      }
    }
    // Un entretien très récent par tranche de biens : le carnet vit aussi sur les 30 derniers jours.
    if (propertyIndex % 4 === 0) {
      const t = TEMPLATES[propertyIndex % 3];
      const performedAt = noonUtc(plusDays(end, -between(rng, 2, 26)));
      rows.push({
        tenantId,
        propertyId,
        category: t.category,
        performedAt,
        vendorId: pickOne(rng, vendors)?.id ?? null,
        cost: new Prisma.Decimal(roundTo(between(rng, t.cost[0], t.cost[1]), 5000)),
        currency: 'XOF',
        description: t.description,
        nextDueDate: t.periodMonths ? plusMonths(performedAt, t.periodMonths) : null,
        warrantyEndDate: t.warrantyMonths ? plusMonths(performedAt, t.warrantyMonths) : null,
        createdByUserId: pickOne(rng, base.signers).id,
        createdAt: performedAt,
        updatedAt: performedAt
      });
    }
  }
  await prisma.maintenanceLogEntry.createMany({ data: rows });
  log(`carnet d’entretien : ${rows.length} interventions sur ${properties.size} biens.`);
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
  OTHER: [30_000, 250_000]
};

export async function seedTicketAttachments(base: LocatifBase): Promise<void> {
  const { prisma, tenantId, rng, log } = base.ctx;
  if ((await prisma.maintenanceTicketAttachment.count({ where: { tenant_id: tenantId } })) > 0) {
    log('pièces jointes des tickets : déjà présentes, bloc sauté.');
    return;
  }
  const tickets = await prisma.maintenanceTicket.findMany({
    where: { tenant_id: tenantId },
    orderBy: { declared_at: 'asc' },
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      declared_at: true,
      assigned_at: true,
      resolved_at: true,
      resolution_notes: true,
      created_by_contact_id: true,
      tenant_contact_id: true,
      lease_id: true,
      property: { select: { title: true, propertyType: true } },
      assignedVendor: { select: { name: true } }
    }
  });

  let files = 0;
  for (const ticket of tickets) {
    const type = ticket.property?.propertyType ?? 'APPARTEMENT';
    const scenes = SCENE_BY_CATEGORY[ticket.category] ?? SCENE_BY_CATEGORY.OTHER;
    const segments = ['maintenance', tenantId, ticket.id];
    const contactId = ticket.created_by_contact_id ?? ticket.tenant_contact_id;
    const lease = ticket.lease_id ? base.leaseById.get(ticket.lease_id) : undefined;

    const add = async (
      stored: { fileUrl: string; fileName: string; fileSize: number; mimeType: string },
      at: Date,
      byContact: boolean
    ) => {
      await prisma.maintenanceTicketAttachment.create({
        data: {
          tenant_id: tenantId,
          ticket_id: ticket.id,
          file_url: stored.fileUrl,
          file_name: stored.fileName,
          mime_type: stored.mimeType,
          file_size: stored.fileSize,
          uploaded_by_user_id: byContact && contactId ? null : pickOne(rng, base.signers).id,
          uploaded_by_contact_id: byContact ? contactId : null,
          created_at: at
        }
      });
      files += 1;
    };

    // Photos du problème, jointes à la déclaration (par le locataire quand il est connu).
    const photoCount = 1 + (rng() < 0.45 ? 1 : 0);
    for (let n = 0; n < photoCount; n++) {
      const stored = await writeScenePhoto(
        segments,
        `probleme-${n + 1}-${slug(ticket.title).slice(0, 30)}.png`,
        type,
        `${ticket.id}:declaration`,
        scenes[n % scenes.length],
        n
      );
      await add(stored, new Date(ticket.declared_at.getTime() + 120_000 * (n + 1)), Boolean(contactId));
    }

    const hasVendor = ticket.assignedVendor && ticket.assigned_at;
    if (hasVendor && ticket.status !== 'CANCELED') {
      const [lo, hi] = COST_BY_CATEGORY[ticket.category] ?? COST_BY_CATEGORY.OTHER;
      const amount = roundTo(between(rng, lo, hi), 2500);
      const quoteAt = new Date((ticket.assigned_at as Date).getTime() + 3_600_000);
      const quote = await writeDemoPdf(segments, 'devis.pdf', `Devis — ${ticket.assignedVendor?.name}`, [
        `Objet : ${ticket.title}`,
        `Bien : ${ticket.property?.title ?? ''}${lease ? ` (bail ${lease.number})` : ''}`,
        `Date : ${dateFr(quoteAt)}`,
        '',
        '# Détail',
        `Main-d’oeuvre et déplacement : ${fcfa(Math.round(amount * 0.4))}`,
        `Fournitures : ${fcfa(Math.round(amount * 0.6))}`,
        `Total TTC : ${fcfa(amount)}`,
        '',
        'Devis valable 30 jours. Intervention sous 72 heures après acceptation.'
      ]);
      await add(quote, quoteAt, false);

      if (ticket.status === 'RESOLVED' && ticket.resolved_at) {
        const invoice = await writeDemoPdf(segments, 'facture.pdf', `Facture — ${ticket.assignedVendor?.name}`, [
          `Objet : ${ticket.title}`,
          `Bien : ${ticket.property?.title ?? ''}`,
          `Date : ${dateFr(ticket.resolved_at)}`,
          '',
          `Montant total : ${fcfa(amount)}`,
          ticket.resolution_notes
            ? `Travaux réalisés : ${ticket.resolution_notes}`
            : 'Travaux réalisés conformément au devis.',
          'Règlement : à 15 jours par virement ou Mobile Money.'
        ]);
        await add(invoice, new Date(ticket.resolved_at.getTime() + 1_800_000), false);
        if (rng() < 0.6) {
          const after = await writeScenePhoto(
            segments,
            `apres-intervention-${slug(ticket.title).slice(0, 24)}.png`,
            type,
            `${ticket.id}:apres`,
            scenes[0],
            7
          );
          await add(after, new Date(ticket.resolved_at.getTime() + 900_000), false);
        }
      }
    }
  }
  log(`pièces jointes des tickets : ${files} fichiers pour ${tickets.length} tickets.`);
}
