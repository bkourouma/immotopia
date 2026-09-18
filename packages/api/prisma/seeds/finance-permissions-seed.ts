/**
 * Seed des droits du module financier operationnel — lot 1.
 *
 * Cree les six permissions declarees par `finance-rbac-middleware.ts` (source
 * de verite pour les noms : ce seed ne les invente pas, il les recopie) et les
 * attribue aux roles existants de `rbac-seed.ts`.
 *
 * Repartition (decision D7 — plusieurs saisisseurs, un validateur) :
 *
 *  - TENANT_ACCOUNTANT est le role des saisisseurs : il lit les comptes et les
 *    comptes rendus, et cree les pieces (au lot 1, la seule piece est la
 *    campagne de facturation). Il ne valide pas.
 *  - TENANT_ADMIN a toujours eu la visibilite complete du tenant ; il recoit
 *    les six droits, y compris la validation et le parametrage. Au lot 1 ceci
 *    ne change rien a l'usage (aucune piece a valider n'existe encore, aucun
 *    chantier a gerer), mais installe des maintenant le role du validateur
 *    cible, pour que le lot 2 n'ait qu'a brancher une route, jamais un role.
 *  - TENANT_MANAGER voit les comptes et les comptes rendus (comme il voit deja
 *    BILLING_VIEW sans les droits d'edition correspondants), mais ne cree ni
 *    ne valide de piece.
 *  - TENANT_AGENT ne recoit aucun droit financier : son perimetre est les
 *    biens et le CRM.
 *
 * PLATFORM_SUPER_ADMIN recoit tous les droits via la boucle generique de
 * `rbac-seed.ts`, a condition que ce seed soit appele avant elle (voir l'appel
 * dans ce fichier).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Les six noms sont ceux de `src/middleware/finance-rbac-middleware.ts` :
// ne pas les modifier ici sans les modifier d'abord la-bas.
const financePermissions = [
  { key: 'FINANCE_ACCOUNTS_READ', description: 'Lire les comptes de tiers et leurs releves' },
  { key: 'FINANCE_REPORTS_READ', description: 'Lire les balances et les comptes rendus de campagne' },
  { key: 'FINANCE_DOCUMENTS_CREATE', description: 'Creer une piece financiere (campagne de facturation)' },
  { key: 'FINANCE_DOCUMENTS_VALIDATE', description: 'Valider une piece financiere' },
  { key: 'FINANCE_SITES_MANAGE', description: 'Gerer les chantiers (lot 2)' },
  {
    key: 'FINANCE_SETTINGS_MANAGE',
    description: 'Parametrer le module financier : plan de comptes, postes de depense (lot 2)'
  }
];

const READ_KEYS = ['FINANCE_ACCOUNTS_READ', 'FINANCE_REPORTS_READ'];
const ALL_KEYS = financePermissions.map(p => p.key);

async function assignPermissionsToRole(roleKey: string, permissionKeys: string[]) {
  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!role) {
    console.warn(`  ⚠️  Role ${roleKey} not found, skipping...`);
    return;
  }

  const permissions = await prisma.permission.findMany({
    where: { key: { in: permissionKeys } }
  });

  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: permission.id
        }
      },
      update: {},
      create: {
        roleId: role.id,
        permissionId: permission.id
      }
    });
  }
  console.log(`  ✓ Assigned [${permissionKeys.join(', ')}] to ${roleKey}`);
}

async function seedFinancePermissions() {
  console.log('💶 Seeding Finance permissions...\n');

  console.log('Step 1: Creating finance permissions...');
  for (const perm of financePermissions) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: perm
    });
  }
  console.log(`  ✓ Created ${financePermissions.length} finance permissions\n`);

  console.log('Step 2: Assigning finance permissions to roles...');

  // TENANT_ADMIN : les six droits — validateur cible et parametrage.
  await assignPermissionsToRole('TENANT_ADMIN', ALL_KEYS);

  // TENANT_MANAGER : lecture seule, meme logique que BILLING_VIEW.
  await assignPermissionsToRole('TENANT_MANAGER', READ_KEYS);

  // TENANT_ACCOUNTANT : lecture et creation de pieces — les saisisseurs.
  await assignPermissionsToRole('TENANT_ACCOUNTANT', [...READ_KEYS, 'FINANCE_DOCUMENTS_CREATE']);

  // TENANT_AGENT : aucun droit financier.

  console.log('\n✅ Finance permissions seeding completed!\n');
}

// Execute if run directly
if (require.main === module) {
  seedFinancePermissions()
    .catch(e => {
      console.error('❌ Error seeding finance permissions:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedFinancePermissions, financePermissions, READ_KEYS, ALL_KEYS };
