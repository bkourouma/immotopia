/**
 * Seed des droits du stock et du rôle Magasinier — lot 040 (spec 040, B1,
 * data-model §3.2).
 *
 * Crée les dix permissions déclarées par `src/middleware/stock-rbac-middleware.ts`
 * (source de vérité pour les noms : ce seed les recopie), crée le rôle
 * `TENANT_STOREKEEPER` et attribue :
 *
 *  - TENANT_ADMIN : les dix ;
 *  - TENANT_MANAGER : STOCK_VIEW, STOCK_VALUES_VIEW ;
 *  - TENANT_ACCOUNTANT : lecture, valeurs, réception, sortie, transfert,
 *    comptage et carnet des preneurs (décision B1-R2 bis : le comptable compte,
 *    il ne valide pas) ;
 *  - TENANT_STOREKEEPER : lecture, réception, sortie, transfert, comptage et
 *    carnet des preneurs, sans aucune valeur ni aucun droit `FINANCE_*` ;
 *  - TENANT_AGENT : aucun.
 *
 * La migration de données `20261008090200_controle_stock_permissions` fait la
 * même chose pour une base qui applique les migrations, et reporte en plus les
 * droits `FINANCE_*` existants sur leurs équivalents `STOCK_*`.
 *
 * PLATFORM_SUPER_ADMIN reçoit tous les droits par la boucle générique de
 * `rbac-seed.ts`, à condition que ce seed soit appelé avant elle.
 */
import { PrismaClient, RoleScope } from '@prisma/client';

const prisma = new PrismaClient();

// Les dix noms sont ceux de `src/middleware/stock-rbac-middleware.ts` : ne pas
// les modifier ici sans les modifier d'abord là-bas.
const stockPermissions = [
  {
    key: 'STOCK_VIEW',
    description: 'Consulter le stock : articles, lieux, soldes en quantite, mouvements, inventaires, preneurs, bons'
  },
  { key: 'STOCK_VALUES_VIEW', description: 'Voir les valeurs du stock, les indicateurs et les filtres par personne' },
  { key: 'STOCK_RECEIVE', description: 'Enregistrer une reception de stock' },
  { key: 'STOCK_ISSUE', description: 'Enregistrer une sortie de stock vers un chantier' },
  { key: 'STOCK_TRANSFER', description: 'Transferer du stock entre deux lieux' },
  { key: 'STOCK_COUNT', description: 'Ouvrir, compter, clore et justifier un inventaire' },
  { key: 'STOCK_TAKERS_MANAGE', description: 'Gerer le carnet des preneurs' },
  { key: 'STOCK_COUNT_VALIDATE', description: 'Valider ou abandonner un inventaire, ecarter une ligne de comptage' },
  { key: 'STOCK_DISPOSE', description: 'Enregistrer un rebut ou un retour fournisseur, retirer une piece jointe' },
  { key: 'STOCK_ALERTS_VIEW', description: 'Consulter et traiter les alertes de stock' }
];

const STOCK_ALL_KEYS = stockPermissions.map(p => p.key);

/** Les gestes du terrain, communs au Magasinier et au Comptable. */
const STOCK_FIELD_KEYS = [
  'STOCK_VIEW',
  'STOCK_RECEIVE',
  'STOCK_ISSUE',
  'STOCK_TRANSFER',
  'STOCK_COUNT',
  'STOCK_TAKERS_MANAGE'
];

const STOREKEEPER_ROLE = {
  key: 'TENANT_STOREKEEPER',
  name: 'Tenant Storekeeper',
  description: 'Magasinier : recoit, sort, transfere et compte le stock, sans acces aux valeurs ni a la comptabilite',
  scope: RoleScope.TENANT
};

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

async function seedStockPermissions() {
  console.log('📦 Seeding Stock permissions...\n');

  console.log('Step 1: Creating stock permissions...');
  for (const perm of stockPermissions) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: perm
    });
  }
  console.log(`  ✓ Created ${stockPermissions.length} stock permissions\n`);

  console.log('Step 2: Creating TENANT_STOREKEEPER role...');
  await prisma.role.upsert({
    where: { key: STOREKEEPER_ROLE.key },
    update: {},
    create: STOREKEEPER_ROLE
  });
  console.log('  ✓ Created TENANT_STOREKEEPER role\n');

  console.log('Step 3: Assigning stock permissions to roles...');
  await assignPermissionsToRole('TENANT_ADMIN', STOCK_ALL_KEYS);
  await assignPermissionsToRole('TENANT_MANAGER', ['STOCK_VIEW', 'STOCK_VALUES_VIEW']);
  await assignPermissionsToRole('TENANT_ACCOUNTANT', [...STOCK_FIELD_KEYS, 'STOCK_VALUES_VIEW']);
  await assignPermissionsToRole('TENANT_STOREKEEPER', STOCK_FIELD_KEYS);
  // TENANT_AGENT : aucun droit du stock.

  console.log('\n✅ Stock permissions seeding completed!\n');
}

// Execute if run directly
if (require.main === module) {
  seedStockPermissions()
    .catch(e => {
      console.error('❌ Error seeding stock permissions:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedStockPermissions, stockPermissions, STOCK_ALL_KEYS, STOCK_FIELD_KEYS };
