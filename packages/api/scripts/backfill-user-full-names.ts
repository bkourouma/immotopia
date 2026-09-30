/**
 * Rattrapage (BUG-2026-09-30-039 / 062) : les comptes créés depuis l'e-mail d'un
 * contact CRM (propriétaire d'un bien, client d'un bail) n'avaient pas de nom
 * (`users.full_name` nul), d'où « null (e-mail) » dans les listes et l'e-mail à
 * la place du nom sur les fiches.
 *
 * Idempotent : ne touche QUE les comptes dont `fullName` est nul ou vide ET qui
 * sont liés à une agence (client d'agence ou propriétaire d'un bien), et
 * seulement quand un contact CRM portant le même e-mail a un nom exploitable
 * (raison sociale pour une entreprise, sinon « prénom nom »). Un compte déjà
 * nommé n'est jamais modifié ; un second passage ne change rien.
 *
 * Lancement (par le Pilote, jamais automatiquement) :
 *   npx ts-node scripts/backfill-user-full-names.ts            # simulation
 *   npx ts-node scripts/backfill-user-full-names.ts --apply    # écriture
 *   (--allow-production pour lever le refus sous NODE_ENV=production)
 *
 * Le contact CRM n'est lu que dans les agences liées au compte (ses profils
 * client et l'agence des biens qu'il possède) : jamais le contact d'une autre agence.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--allow-production')) {
  console.error('Refus de tourner : NODE_ENV=production (ajouter --allow-production en connaissance de cause).');
  process.exit(1);
}

function nomContact(contact: {
  contactType: string | null;
  legalName: string | null;
  firstName: string;
  lastName: string;
}): string | null {
  const personne = `${contact.firstName} ${contact.lastName}`.trim();
  const legal = contact.legalName?.trim() || '';
  return (contact.contactType === 'COMPANY' ? legal || personne : personne || legal) || null;
}

async function main() {
  const apply = process.argv.includes('--apply');

  const users = await prisma.user.findMany({
    where: {
      OR: [{ fullName: null }, { fullName: '' }],
      AND: [{ OR: [{ clientProfiles: { some: {} } }, { propertiesOwned: { some: {} } }] }]
    },
    select: {
      id: true,
      email: true,
      clientProfiles: { select: { tenantId: true } },
      propertiesOwned: { where: { tenantId: { not: null } }, select: { tenantId: true } }
    }
  });

  let updated = 0;
  for (const user of users) {
    const tenantIds = [
      ...new Set(
        [
          ...user.clientProfiles.map(profil => profil.tenantId),
          ...user.propertiesOwned.map(bien => bien.tenantId)
        ].filter((id): id is string => Boolean(id))
      )
    ];
    if (tenantIds.length === 0) continue;
    const contacts = await prisma.crmContact.findMany({
      where: { tenantId: { in: tenantIds }, email: { equals: user.email, mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
      select: { contactType: true, legalName: true, firstName: true, lastName: true }
    });
    const nom = contacts.map(nomContact).find(Boolean);
    if (!nom) continue;
    console.log(`${apply ? 'MAJ' : 'À METTRE À JOUR'} ${user.email} -> ${nom}`);
    if (apply) {
      // Re-vérifie le prédicat dans l'UPDATE : rien n'écrase un nom posé entre-temps.
      const result = await prisma.user.updateMany({
        where: { id: user.id, OR: [{ fullName: null }, { fullName: '' }] },
        data: { fullName: nom }
      });
      updated += result.count;
    } else {
      updated += 1;
    }
  }

  console.log(
    `${apply ? 'Comptes mis à jour' : 'Comptes concernés (simulation)'} : ${updated} / ${users.length} sans nom`
  );
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
