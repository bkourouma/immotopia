/**
 * Création du PREMIER compte SUPER_ADMIN d'une plateforme vierge (production).
 *
 * Lancé par infra/scripts/bootstrap.sh dans l'image « migrate » :
 *   printf '%s' "$MOT_DE_PASSE" | ts-node -T prisma/seeds/create-platform-super-admin.ts \
 *     --email admin@exemple.com --name "Nom" --password-stdin
 *
 * Remplace create-super-admin.ts (mot de passe par défaut codé en dur) :
 *  - crée SEULEMENT : un e-mail déjà présent est refusé, rien n'est modifié
 *    (ni promotion silencieuse, ni changement de mot de passe) ;
 *  - le mot de passe vient de l'entrée standard, jamais d'un argument ni d'une
 *    variable d'environnement, et n'est jamais affiché ni journalisé ;
 *  - le rôle PLATFORM_SUPER_ADMIN doit exister (seed RBAC) : sinon rien n'est créé ;
 *  - un SUPER_ADMIN déjà présent bloque la création sans --allow-additional.
 *
 * Codes de sortie : 0 succès, 2 refus (usage ou état incompatible), 1 erreur.
 */
import { readFileSync } from 'fs';
import { GlobalRole, PrismaClient } from '@prisma/client';
import { hashPassword } from '../../src/utils/password-utils';
import {
  BootstrapInputError,
  normalizeAdminEmail,
  normalizeAdminName,
  readPasswordFromStdinContent,
  validateBootstrapPassword
} from '../../src/utils/bootstrap-admin-input';

const PLATFORM_ROLE_KEY = 'PLATFORM_SUPER_ADMIN';
const LOCK_KEY = 'immotopia:bootstrap-platform-super-admin';

class RefusalError extends Error {}
class PreconditionError extends Error {}

interface CliOptions {
  email: string;
  name: string | undefined;
  passwordStdin: boolean;
  dryRun: boolean;
  allowAdditional: boolean;
}

const USAGE =
  'Usage : create-platform-super-admin.ts --email <e-mail> [--name <nom>] ' +
  '(--password-stdin | --dry-run) [--allow-additional]';

function parseArgs(argv: string[]): CliOptions {
  let email: string | undefined;
  let name: string | undefined;
  let passwordStdin = false;
  let dryRun = false;
  let allowAdditional = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--email':
      case '--name': {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) {
          throw new RefusalError(`L'option ${arg} attend une valeur. ${USAGE}`);
        }
        i += 1;
        if (arg === '--email') email = value;
        else name = value;
        break;
      }
      case '--password-stdin':
        passwordStdin = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--allow-additional':
        allowAdditional = true;
        break;
      default:
        // Aucune option --password : un argument inconnu est refusé sans être répété
        // (il pourrait être un mot de passe passé par erreur).
        throw new RefusalError(`Argument inconnu ou non autorisé. ${USAGE}`);
    }
  }

  if (email === undefined) throw new RefusalError(`L'option --email est obligatoire. ${USAGE}`);
  if (!dryRun && !passwordStdin) {
    throw new RefusalError(`L'option --password-stdin est obligatoire hors --dry-run. ${USAGE}`);
  }
  return { email, name, passwordStdin, dryRun, allowAdditional };
}

function readPasswordFromStdin(): string {
  if (process.stdin.isTTY) {
    throw new RefusalError(
      "--password-stdin exige un mot de passe fourni par un tube (l'entrée standard est un terminal)."
    );
  }
  let raw: string;
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    throw new RefusalError("Impossible de lire l'entrée standard.");
  }
  const password = readPasswordFromStdinContent(raw);
  validateBootstrapPassword(password);
  return password;
}

async function run(prisma: PrismaClient, opts: CliOptions): Promise<void> {
  const email = normalizeAdminEmail(opts.email);
  const fullName = normalizeAdminName(opts.name);

  if (opts.dryRun) {
    const [existingUser, superAdmins, role] = await Promise.all([
      prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true }
      }),
      prisma.user.count({ where: { globalRole: GlobalRole.SUPER_ADMIN } }),
      prisma.role.findUnique({ where: { key: PLATFORM_ROLE_KEY }, select: { id: true } })
    ]);
    console.log(`[dry-run] e-mail : ${email}`);
    console.log(`[dry-run] compte existant avec cet e-mail : ${existingUser ? 'OUI' : 'non'}`);
    console.log(`[dry-run] SUPER_ADMIN déjà présents : ${superAdmins}`);
    console.log(`[dry-run] rôle ${PLATFORM_ROLE_KEY} : ${role ? 'présent' : 'ABSENT (seed RBAC requis)'}`);
    if (existingUser) {
      console.log('[dry-run] la création serait REFUSÉE : ce compte existe déjà (code 2).');
    } else if (!role) {
      console.log("[dry-run] la création ÉCHOUERAIT : lancer d'abord le seed RBAC (code 1).");
    } else if (superAdmins > 0 && !opts.allowAdditional) {
      console.log('[dry-run] la création serait REFUSÉE : un SUPER_ADMIN existe (--allow-additional requis).');
    } else {
      console.log(`[dry-run] serait créé : SUPER_ADMIN « ${fullName} » <${email}> + rôle ${PLATFORM_ROLE_KEY}.`);
    }
    console.log("[dry-run] rien n'a été écrit.");
    return;
  }

  const password = readPasswordFromStdin();
  // Le hachage (bcrypt, lent) se fait hors transaction pour ne pas la faire expirer.
  const passwordHash = await hashPassword(password);

  const userId = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${LOCK_KEY}, 0))`;

    const role = await tx.role.findUnique({ where: { key: PLATFORM_ROLE_KEY }, select: { id: true } });
    if (!role) {
      throw new PreconditionError(
        `Le rôle ${PLATFORM_ROLE_KEY} est absent : lancer d'abord le seed RBAC (infra/scripts/bootstrap.sh). Rien n'a été créé.`
      );
    }

    const existingUser = await tx.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true }
    });
    if (existingUser) {
      throw new RefusalError(
        `Un compte existe déjà avec l'adresse ${email} : aucune modification (ni rôle, ni mot de passe).`
      );
    }

    const superAdmins = await tx.user.count({ where: { globalRole: GlobalRole.SUPER_ADMIN } });
    if (superAdmins > 0 && !opts.allowAdditional) {
      throw new RefusalError(
        `Un SUPER_ADMIN existe déjà (${superAdmins}). Pour en ajouter un autre, relancer avec --allow-additional.`
      );
    }

    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        globalRole: GlobalRole.SUPER_ADMIN,
        emailVerified: true,
        isActive: true
      },
      select: { id: true }
    });

    // tenantId NULL : l'unicité (userId, roleId, tenantId) ne protège pas, d'où le findFirst.
    const existingLink = await tx.userRole.findFirst({
      where: { userId: user.id, roleId: role.id, tenantId: null },
      select: { id: true }
    });
    if (!existingLink) {
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id, tenantId: null } });
    }
    return user.id;
  });

  console.log(`Compte SUPER_ADMIN créé : ${email} (id ${userId}), rôle ${PLATFORM_ROLE_KEY} attribué.`);
}

async function main(): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : USAGE);
    return 2;
  }

  const prisma = new PrismaClient();
  try {
    await run(prisma, opts);
    return 0;
  } catch (e) {
    // Aucun message n'embarque le mot de passe ; les erreurs inattendues (Prisma) sont
    // réduites à leur type et leur message, jamais à un objet susceptible de porter des données.
    if (e instanceof RefusalError || e instanceof BootstrapInputError) {
      console.error(`Refus : ${e.message}`);
      return 2;
    }
    if (e instanceof PreconditionError) {
      console.error(`Erreur : ${e.message}`);
      return 1;
    }
    console.error(
      `Erreur inattendue : ${e instanceof Error ? e.name : 'inconnue'}. Rien n'a été créé si la transaction n'a pas abouti.`
    );
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(code => {
  process.exitCode = code;
});
