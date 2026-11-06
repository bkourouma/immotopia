import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  grantPersonalPermissionsToExistingSpaces,
  PERSONAL_PERMISSIONS,
  PERSONAL_SPACE_OWNER_ROLE_KEY
} from '../../src/lib/patrimoine/personal-permissions';

const prisma = new PrismaClient();

/**
 * Permissions PATRIMOINE_PERSONAL_VIEW / PATRIMOINE_PERSONAL_EDIT.
 * Idempotent :
 *  1. cree les deux permissions et le role TENANT PERSONAL_SPACE_OWNER, et
 *     attache ces deux permissions a PERSONAL_SPACE_OWNER, TENANT_ADMIN et
 *     PLATFORM_SUPER_ADMIN (les autres collaborateurs d'agence n'y ont pas acces) ;
 *  2. RATTRAPAGE : ajoute le role PERSONAL_SPACE_OWNER aux administrateurs
 *     (TENANT_ADMIN) de chaque espace PARTICULIER deja en base.
 */
async function seedPatrimoinePersonalPermissions(): Promise<void> {
  console.log('Seeding permissions personnelles du patrimoine...');
  const result = await grantPersonalPermissionsToExistingSpaces(prisma as never);
  console.log(
    `  ${PERSONAL_PERMISSIONS.length} permissions (${PERSONAL_SPACE_OWNER_ROLE_KEY} + TENANT_ADMIN) ; ` +
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
