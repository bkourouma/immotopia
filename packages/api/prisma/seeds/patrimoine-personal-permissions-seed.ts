import { PrismaClient } from '@prisma/client';
import {
  grantPersonalPermissionsToExistingSpaces,
  PERSONAL_PERMISSIONS,
  PERSONAL_SPACE_OWNER_ROLE_KEY
} from '../../src/lib/patrimoine/personal-permissions';

const prisma = new PrismaClient();

/**
 * Permissions PATRIMOINE_PERSONAL_VIEW / PATRIMOINE_PERSONAL_EDIT (donnees
 * personnelles du patrimoine d'un particulier). Idempotent :
 *  1. cree les deux permissions et le role TENANT PERSONAL_SPACE_OWNER ;
 *  2. RATTRAPAGE : ajoute ce role aux administrateurs (TENANT_ADMIN) de chaque
 *     espace PARTICULIER deja en base. Aucune agence n'est touchee, et aucun
 *     role d'agence (TENANT_ADMIN...) ne recoit ces permissions.
 * A lancer une fois apres le deploiement : `npm run db:seed:patrimoine-personal-permissions`.
 * Les espaces crees ensuite recoivent le role a la creation.
 */
async function seedPatrimoinePersonalPermissions(): Promise<void> {
  console.log('Seeding permissions personnelles du patrimoine...');
  const result = await grantPersonalPermissionsToExistingSpaces(prisma as never);
  console.log(
    `  ${PERSONAL_PERMISSIONS.length} permissions, role ${PERSONAL_SPACE_OWNER_ROLE_KEY} ; ` +
      `${result.admins} administrateur(s) sur ${result.spaces} espace(s) PARTICULIER`
  );
}

if (require.main === module) {
  seedPatrimoinePersonalPermissions()
    .catch(error => {
      console.error('Erreur seed permissions personnelles du patrimoine :', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedPatrimoinePersonalPermissions };
