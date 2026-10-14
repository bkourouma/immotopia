/**
 * Outil de mise au point : rejoue les générateurs d'historique d'un pack sur
 * des agences DÉJÀ créées (aucune création d'agence, aucun provisionnement).
 *
 *   DOTENV_CONFIG_PATH=<env> npx ts-node -T prisma/seeds/pack-history/run-extras.ts \
 *     --pack AGENCE [--only seedAgenceCommercial,seedEquipe] [--profile 3y]
 *
 * Retrouve l'agence « Test — Pack … · 3 ans » (ou « 6 mois ») par son nom, puis
 * appelle les générateurs. Sert à itérer vite sur une copie de la base ; le
 * seed complet reste `seed-pack-test-tenants.ts`. Refuse la production.
 */
import './disable-outbound';
import { PrismaClient } from '@prisma/client';
import { env } from '../../../src/config/env';
import { PACK_TEST_TENANTS } from '../pack-test-tenants';
import { buildContext } from './types';
import { historySeedersForPack } from './index';

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') throw new Error('Refusé : production.');
  const args = process.argv.slice(2);
  const arg = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const pack = arg('pack');
  const profile = (arg('profile') ?? '3y') as '3y' | '6m';
  const only = arg('only')?.split(',');
  if (!pack)
    throw new Error('--pack requis (AGENCE, SYNDIC, PROMOTEUR, INTEGRE, PATRIMOINE_ESSENTIEL, PATRIMOINE_PRO)');
  const entry = PACK_TEST_TENANTS.find(t => t.pack === pack && t.profile === profile);
  if (!entry) throw new Error(`Aucune agence de test ${pack} / ${profile}.`);

  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findFirst({ where: { name: entry.tenantName }, select: { id: true } });
    if (!tenant) throw new Error(`Agence « ${entry.tenantName} » absente de la base.`);
    const admin = await prisma.user.findFirst({ where: { email: entry.adminEmail }, select: { id: true } });
    if (!admin) throw new Error(`Administrateur ${entry.adminEmail} absent.`);
    const ctx = buildContext(
      {
        prisma,
        tenantId: tenant.id,
        adminUserId: admin.id,
        profile,
        log: m => console.log(`  [${entry.tenantName}] ${m}`)
      },
      entry.tenantName
    );
    for (const seeder of historySeedersForPack(pack)) {
      if (only && !only.includes(seeder.name)) continue;
      // eslint-disable-next-line no-await-in-loop -- séquentiel voulu.
      await seeder(ctx);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  () => process.exit(0),
  error => {
    console.error(error);
    process.exit(1);
  }
);
