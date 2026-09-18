/**
 * One-shot: unlock the demo login panel accounts.
 * Marks them verified/active and aligns the password with apps/web/src/dev/dev-accounts.ts
 * when it does not already match. Prints emails only — never hashes or secrets.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const ACCOUNTS = [
  { email: 'admin@immobillier.com', password: 'Admin@123456' },
  { email: 'devaccrocs@gmail.com', password: 'DevMick@2003' },
  { email: 'mickael.andjui.21@gmail.com', password: 'DevMick@2003' },
  { email: 'scolarflow@gmail.com', password: 'DevMick@2003' }
];

async function main() {
  for (const account of ACCOUNTS) {
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
