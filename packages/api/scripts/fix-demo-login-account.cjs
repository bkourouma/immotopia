/**
 * One-shot: unlock the demo login panel accounts.
 * Marks them verified/active and aligns the password with apps/web/src/dev/dev-accounts.ts
 * when it does not already match. Prints emails only — never hashes or secrets.
 */

// Garde de production : AVANT tout require de @prisma/client ou connexion base.
// Lit uniquement process.env (jamais de fichier .env).
function refuseIfUnsafe() {
  if (process.env.NODE_ENV === 'production') {
    return 'NODE_ENV=production';
  }
  const url = process.env.DATABASE_URL;
  if (!url) return 'DATABASE_URL absente';
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'DATABASE_URL illisible';
  }
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)) {
    return 'DATABASE_URL ne pointe pas sur la machine locale';
  }
  return null;
}

const refusal = refuseIfUnsafe();
if (refusal) {
  process.stderr.write(
    `Refus : fix-demo-login-account.cjs est un script de démonstration (mots de passe connus) ` +
      `réservé au poste local (${refusal}).
`
  );
  process.exit(1);
}

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = 'admin@immobillier.com';

const ACCOUNTS = [
  // Mot de passe du super-admin : variable SUPER_ADMIN_PASSWORD (jamais dans le dépôt).
  { email: SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD || '' },
  { email: 'devaccrocs@gmail.com', password: 'DevMick@2003' },
  { email: 'mickael.andjui.21@gmail.com', password: 'DevMick@2003' },
  { email: 'scolarflow@gmail.com', password: 'DevMick@2003' }
];

async function main() {
  for (const account of ACCOUNTS) {
    if (!account.password) {
      console.error(`skip ${account.email} : SUPER_ADMIN_PASSWORD absente, compte non traité`);
      process.exitCode = 1;
      continue;
    }
    const user = await prisma.user.findUnique({
      where: { email: account.email },
      select: { id: true, emailVerified: true, isActive: true, passwordHash: true }
    });
    if (!user) {
      console.log(`missing ${account.email}`);
      continue;
    }

    const passwordMatches = user.passwordHash
      ? await bcrypt.compare(account.password, user.passwordHash)
      : false;

    const data = {
      emailVerified: true,
      isActive: true,
      ...(passwordMatches ? {} : { passwordHash: await bcrypt.hash(account.password, 10) })
    };

    await prisma.user.update({ where: { id: user.id }, data });
    console.log(
      `ok ${account.email} verified=${user.emailVerified}->true active=${user.isActive}->true password=${
        passwordMatches ? 'unchanged' : 'aligned'
      }`
    );
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
