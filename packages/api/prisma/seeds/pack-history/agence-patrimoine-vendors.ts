/**
 * Prestataires de maintenance.
 *
 * Cause de l'écran « Prestataires » vide : la route lit `service_providers`
 * (`listVendors`, source de vérité) et ne rend `maintenance_vendors` que comme
 * « miroir » de même identifiant. Le générateur de base n'avait écrit que les
 * miroirs : la table `maintenance_vendors` portait 8 lignes, la route répondait 0.
 * Ce bloc écrit le prestataire (`ServiceProvider`) manquant de chaque miroir, à
 * l'identifiant du miroir (ce que fait `createVendor`), puis rattache aux
 * prestataires les tickets qui n'en avaient pas (mandatement, étape ASSIGNED de
 * l'historique) selon leur catégorie.
 */
import { MaintenanceTicketCategory } from '@prisma/client';
import { pick } from './types';
import type { HistoryContext } from './types';
import { addDaysTo } from './agence-patrimoine-state';
import { DEMO_NOTE } from './agence-patrimoine-documents';

/** Spécialités du miroir qui conviennent à une catégorie de ticket. */
const SPECIALTIES_BY_CATEGORY: Record<MaintenanceTicketCategory, readonly string[]> = {
  PLUMBING: ['plumbing', 'water_heater'],
  ELECTRICITY: ['electricity', 'generator'],
  AC: ['ac', 'refrigeration'],
  OTHER: ['other', 'painting', 'masonry', 'locksmith']
} as Record<MaintenanceTicketCategory, readonly string[]>;

export async function seedVendorProviders(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, rng, log } = ctx;

  // 1. Un prestataire (source de vérité) pour chaque miroir qui n'en a pas.
  const mirrors = await prisma.maintenanceVendor.findMany({
    where: { tenant_id: tenantId },
    orderBy: { created_at: 'asc' }
  });
  const providers = await prisma.serviceProvider.findMany({ where: { tenantId }, select: { id: true } });
  const known = new Set(providers.map(p => p.id));
  const usedNames = new Set(
    (await prisma.serviceProvider.findMany({ where: { tenantId }, select: { name: true } })).map(p =>
      p.name.trim().toLowerCase()
    )
  );
  let created = 0;
  for (const m of mirrors) {
    if (known.has(m.id)) continue;
    // Le nom d'un prestataire est unique dans l'agence : un homonyme (déjà prestataire du syndic) fait renommer le miroir.
    let name = m.name;
    if (usedNames.has(name.trim().toLowerCase())) {
      name = `${m.name} — maintenance`;
      await prisma.maintenanceVendor.update({ where: { id: m.id }, data: { name } });
    }
    usedNames.add(name.trim().toLowerCase());
    await prisma.serviceProvider.create({
      data: {
        id: m.id,
        tenantId,
        name,
        specialty: m.specialties.length > 0 ? m.specialties.join(', ') : null,
        email: m.email,
        phone: m.phone,
        createdAt: m.created_at
      }
    });
    created += 1;
  }

  // 2. Tickets sans prestataire : ceux qui ont été traités ont forcément été confiés à quelqu'un.
  const vendors = mirrors.filter(m => m.is_active);
  const tickets = await prisma.maintenanceTicket.findMany({
    where: {
      tenant_id: tenantId,
      assigned_vendor_id: null,
      status: { in: ['RESOLVED', 'IN_PROGRESS'] },
      // Les incidents des locataires de démonstration gardent leur état d'origine.
      statusHistory: { none: { note: DEMO_NOTE } }
    },
    orderBy: { declared_at: 'asc' },
    select: {
      id: true,
      category: true,
      status: true,
      declared_at: true,
      in_progress_at: true,
      assigned_to_user_id: true
    }
  });
  let assigned = 0;
  // Le plus récent des tickets « en cours » reste en attente de prestataire (état réaliste).
  const lastInProgress = [...tickets].reverse().find(t => t.status === 'IN_PROGRESS');
  for (const t of tickets) {
    if (t.id === lastInProgress?.id) continue;
    const wanted = SPECIALTIES_BY_CATEGORY[t.category] ?? [];
    const matching = vendors.filter(v => v.specialties.some(s => wanted.includes(s)));
    const vendor = pick(rng, matching.length > 0 ? matching : vendors);
    const assignedAt = addDaysTo(t.in_progress_at ?? t.declared_at, 1);
    await prisma.$transaction(async tx => {
      await tx.maintenanceTicket.update({
        where: { id: t.id },
        data: {
          assigned_vendor_id: vendor.id,
          assigned_at: assignedAt,
          ...(t.status === 'IN_PROGRESS' ? { status: 'ASSIGNED' as const } : {})
        }
      });
      await tx.maintenanceTicketStatusHistory.create({
        data: {
          tenant_id: tenantId,
          ticket_id: t.id,
          from_status: 'IN_PROGRESS',
          to_status: 'ASSIGNED',
          note: `Prestataire mandaté : ${vendor.name}.`,
          changed_by_user_id: t.assigned_to_user_id ?? ctx.adminUserId,
          changed_at: assignedAt
        }
      });
    });
    assigned += 1;
  }
  log(
    `prestataires : ${created} prestataire(s) écrit(s) (${mirrors.length} miroirs), ${assigned} ticket(s) rattaché(s) à un prestataire.`
  );
}
