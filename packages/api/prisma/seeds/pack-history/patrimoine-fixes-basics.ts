/**
 * PATRIMOINE (correctifs, 2e vague) : hypothèses de rendement en fractions et
 * prestataires de maintenance.
 *
 * Deux défauts du jeu de données relevés par la recette :
 *  - `property_yield_assumptions` contenait des pourcentages (5, 3, 4, 8) alors que
 *    `lib/patrimoine/yield.ts` et le schéma API attendent des fractions (0,05…) ;
 *  - l'écran des prestataires lit `service_providers` (source de vérité de la route),
 *    `maintenance_vendors` n'en étant que le miroir : les prestataires du seed n'existaient
 *    que dans le miroir, l'écran affichait donc zéro ligne.
 */
import type { PatState } from './patrimoine-extras-state';
import { slug } from './patrimoine-extras-files';

// ------------------------------------------------------------------ hypothèses de rendement

/**
 * Divise par 100 toute hypothèse déjà écrite en pourcentage (valeur > 1). Idempotent : une
 * fraction correcte (≤ 1) n'est jamais retouchée, un second passage ne change rien.
 */
export async function fixYieldAssumptions(s: PatState): Promise<void> {
  const { prisma, tenantId, log } = s.ctx;
  let fixed = 0;
  fixed +=
    await prisma.$executeRaw`UPDATE property_yield_assumptions SET value_growth_rate = value_growth_rate / 100 WHERE tenant_id = ${tenantId} AND value_growth_rate > 1`;
  fixed +=
    await prisma.$executeRaw`UPDATE property_yield_assumptions SET rent_growth_rate = rent_growth_rate / 100 WHERE tenant_id = ${tenantId} AND rent_growth_rate > 1`;
  fixed +=
    await prisma.$executeRaw`UPDATE property_yield_assumptions SET expense_growth_rate = expense_growth_rate / 100 WHERE tenant_id = ${tenantId} AND expense_growth_rate > 1`;
  fixed +=
    await prisma.$executeRaw`UPDATE property_yield_assumptions SET vacancy_rate = vacancy_rate / 100 WHERE tenant_id = ${tenantId} AND vacancy_rate > 1`;
  if (fixed > 0) log(`patrimoine-correctifs : ${fixed} hypothèse(s) de rendement ramenée(s) en fraction.`);
}

// ------------------------------------------------------------------ prestataires de maintenance

const SPECIALTIES: Record<string, string[]> = {
  'Plomberie Moderne d’Abobo': ['Plomberie', 'Sanitaire'],
  'Élec-Habitat Cocody': ['Électricité', 'Domotique'],
  'Froid Service CI': ['Climatisation', 'Froid'],
  'Groupes Électrogènes Ivoire': ['Électricité', 'Groupes électrogènes'],
  'Jardins du Golfe': ['Espaces verts', 'Entretien'],
  'Peinture Pro Abidjan': ['Peinture', 'Revêtements'],
  'Technibat CI': ['Menuiserie', 'Serrurerie', 'Maçonnerie'],
  'Étanchéité Ivoire': ['Étanchéité', 'Toiture'],
  'Bâtiment Plus Cocody': ['Gros œuvre', 'Rénovation'],
  'Hygiène Plus CI': ['Désinsectisation', 'Nettoyage'],
  'Cabinet de géomètres Kouamé': ['Topographie', 'Bornage']
};

/** Prestataire adapté à un ticket, d'après sa catégorie et son intitulé. */
function vendorNameFor(category: string, title: string): string {
  const t = title.toLowerCase();
  if (/infiltration|étanch|toiture|fuite.*toit/.test(t)) return 'Étanchéité Ivoire';
  if (/serrure|porte|portail|fenêtre|volet/.test(t)) return 'Technibat CI';
  if (/peinture|fissure/.test(t)) return 'Peinture Pro Abidjan';
  if (/groupe|onduleur/.test(t)) return 'Groupes Électrogènes Ivoire';
  if (/jardin|pelouse|haie/.test(t)) return 'Jardins du Golfe';
  if (/cafard|rat|termite|insecte/.test(t)) return 'Hygiène Plus CI';
  switch (category) {
    case 'PLUMBING':
      return 'Plomberie Moderne d’Abobo';
    case 'ELECTRICITY':
      return 'Élec-Habitat Cocody';
    case 'AC':
      return 'Froid Service CI';
    default:
      return 'Technibat CI';
  }
}

/**
 * Crée dans `service_providers` (source de vérité de la route
 * `/maintenance/admin/vendors`) chaque prestataire déjà présent dans le miroir
 * `maintenance_vendors`, avec le MÊME identifiant (la route fusionne les deux par id),
 * renseigne leurs spécialités et coordonnées, puis rattache aux prestataires pertinents
 * les tickets pris en charge.
 */
export async function fixVendors(s: PatState): Promise<void> {
  const { prisma, tenantId, end, log } = s.ctx;
  const mirrors = await prisma.maintenanceVendor.findMany({ where: { tenant_id: tenantId }, orderBy: { name: 'asc' } });
  if (mirrors.length === 0) return;

  const known = new Set(
    (await prisma.serviceProvider.findMany({ where: { tenantId }, select: { id: true } })).map(p => p.id)
  );
  let created = 0;
  for (const m of mirrors) {
    const specialties = SPECIALTIES[m.name];
    const needsSpecialties = specialties && (m.specialties.length === 0 || m.specialties.includes('general'));
    const email = m.email || `contact@${slug(m.name).toLowerCase()}.ci`;
    const address = !m.address || m.address === 'Abidjan' ? 'Abidjan, Côte d’Ivoire' : m.address;
    if (needsSpecialties || email !== m.email || address !== m.address) {
      await prisma.maintenanceVendor.update({
        where: { id: m.id },
        data: { ...(needsSpecialties ? { specialties } : {}), email, address }
      });
    }
    if (known.has(m.id)) continue;
    await prisma.serviceProvider.create({
      data: {
        id: m.id,
        tenantId,
        name: m.name,
        phone: m.phone,
        email,
        specialty: (needsSpecialties ? specialties : m.specialties).join(', ') || null,
        createdAt: m.created_at
      }
    });
    created += 1;
  }

  // Tickets pris en charge (assignés, en cours, résolus) : un prestataire adapté, toujours renseigné.
  const byName = new Map(mirrors.map(m => [m.name, m.id]));
  const tickets = await prisma.maintenanceTicket.findMany({
    where: { tenant_id: tenantId, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED'] } },
    select: { id: true, category: true, title: true, assigned_vendor_id: true, assigned_at: true, created_at: true }
  });
  let assigned = 0;
  for (const t of tickets) {
    const wanted = byName.get(vendorNameFor(t.category, t.title));
    if (!wanted) continue;
    if (t.assigned_vendor_id === wanted && t.assigned_at) continue;
    await prisma.maintenanceTicket.update({
      where: { id: t.id },
      data: {
        assigned_vendor_id: wanted,
        assigned_at: t.assigned_at ?? new Date(Math.min(end.getTime(), t.created_at.getTime() + 86_400_000))
      }
    });
    assigned += 1;
  }
  if (created > 0 || assigned > 0) {
    log(`patrimoine-correctifs : ${created} prestataire(s) visible(s) à l'écran, ${assigned} ticket(s) rattaché(s).`);
  }
}
