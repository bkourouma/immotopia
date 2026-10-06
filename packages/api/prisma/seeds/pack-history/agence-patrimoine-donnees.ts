/**
 * Corrections de données de l'agence relevées par la recette « aucun écran vide » :
 *
 *  - biens VENDUS invisibles : la liste des biens (`listProperties`) n'affiche un bien
 *    CLIENT que si l'agence en détient un mandat `isActive`. Le générateur clôturait le
 *    mandat (`isActive: false`) à la vente : les 4 biens vendus comptés par le tableau de
 *    bord disparaissaient de la liste. Le mandat de vente reste actif (honoré) avec sa
 *    date de fin à la signature de l'acte : le bien vendu reste visible, et le portail
 *    propriétaire l'exclut toujours (mandat échu).
 *  - TABLEAU DE BORD CRM : il date les gains et les conversions par `updatedAt` (affaires
 *    WON, contacts ACTIVE_CLIENT), qui valait la date du seed pour toutes les lignes. Chaque
 *    `updatedAt` est ramené à l'histoire de la ligne : date de clôture d'une affaire, dernière
 *    activité d'une affaire ouverte, signature de la première affaire gagnée d'un contact (ou
 *    conversion quelques jours après sa création), dernière interaction d'un prospect.
 */
import type { HistoryContext } from './types';

export async function fixSoldVisibility(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  const sold = await prisma.property.findMany({
    where: {
      tenantId,
      status: 'SOLD',
      ownershipType: 'CLIENT',
      mandates: { none: { tenantId, isActive: true } }
    },
    select: { id: true, ownerUserId: true, createdAt: true, updatedAt: true }
  });
  let fixed = 0;
  for (const p of sold) {
    const last = await prisma.propertyMandate.findFirst({
      where: { propertyId: p.id, tenantId },
      orderBy: [{ endDate: 'desc' }, { createdAt: 'desc' }]
    });
    if (last) {
      await prisma.propertyMandate.update({
        where: { id: last.id },
        data: {
          isActive: true,
          revokedAt: null,
          revokedByUserId: null,
          notes: 'Bien vendu : mandat honoré, clos à la signature de l’acte de vente.'
        }
      });
      fixed += 1;
    } else if (p.ownerUserId) {
      await prisma.propertyMandate.create({
        data: {
          propertyId: p.id,
          tenantId,
          ownerUserId: p.ownerUserId,
          startDate: p.createdAt,
          endDate: p.updatedAt,
          notes: 'Bien vendu : mandat honoré, clos à la signature de l’acte de vente.',
          isActive: true,
          createdAt: p.createdAt
        }
      });
      fixed += 1;
    }
  }
  log(`biens vendus : ${fixed} mandat(s) de vente rendus visibles sur ${sold.length} bien(s) vendu(s) masqué(s).`);
}

export async function spreadCrmDates(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  const deals = await prisma.$executeRaw`
    UPDATE crm_deals d
    SET updated_at = COALESCE(
      d.closed_at,
      GREATEST(d.created_at, COALESCE((SELECT max(a.created_at) FROM crm_activities a WHERE a.deal_id = d.id), d.created_at))
    )
    WHERE d.tenant_id = ${tenantId}
      AND d.updated_at IS DISTINCT FROM COALESCE(
        d.closed_at,
        GREATEST(d.created_at, COALESCE((SELECT max(a.created_at) FROM crm_activities a WHERE a.deal_id = d.id), d.created_at))
      )`;
  const contacts = await prisma.$executeRaw`
    UPDATE crm_contacts c
    SET updated_at = x.target
    FROM (
      SELECT c2.id,
        CASE
          WHEN c2.status = 'ACTIVE_CLIENT' THEN COALESCE(
            (SELECT min(w.closed_at) FROM crm_deals w WHERE w.contact_id = c2.id AND w.stage = 'WON'),
            LEAST(now(), c2.created_at + ((abs(hashtext(c2.id)) % 18 + 3) * interval '1 day'))
          )
          ELSE GREATEST(
            c2.created_at,
            COALESCE(c2.last_interaction_at, c2.created_at),
            COALESCE((SELECT max(a.created_at) FROM crm_activities a WHERE a.contact_id = c2.id), c2.created_at)
          )
        END AS target
      FROM crm_contacts c2
      WHERE c2.tenant_id = ${tenantId}
    ) x
    WHERE c.id = x.id AND c.updated_at IS DISTINCT FROM x.target`;
  log(`tableau de bord CRM : updatedAt ramené à l'histoire de ${deals} affaire(s) et ${contacts} contact(s).`);
}
