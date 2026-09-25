/**
 * Catalogue des offres par packs — seed IDEMPOTENT.
 *
 *   npm run db:seed:catalog                 # aligne le catalogue sur la grille du site
 *   npm run db:seed:catalog -- --missing-only   # cree seulement les offres absentes
 *
 * Source unique : DEFAULT_CATALOG (src/lib/subscription/catalog.ts), recopie
 * de la grille du site (ImmoTopiaWebsite2Version2/site/src/lib/pricing.ts).
 * Sans option, chaque offre est remise a la grille (prix, capacites,
 * regles) : une modification faite par le super-admin (D12) est alors
 * ecrasee — d'ou `--missing-only`. Aucun abonnement n'est touche : leurs prix
 * sont figes dans SubscriptionItem.
 *
 * Ne supprime rien et n'efface aucune donnee : sans rapport avec
 * `npm run db:seed` (destructif).
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { DEFAULT_CATALOG } from '../../src/lib/subscription/catalog';

const prisma = new PrismaClient();

async function main() {
  const missingOnly = process.argv.includes('--missing-only');
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const def of DEFAULT_CATALOG) {
    const data = {
      kind: def.kind,
      name: def.name,
      description: def.description,
      monthlyPrice: def.monthlyPrice,
      setupPrice: def.setupPrice,
      modules: def.modules,
      exclusiveGroup: def.exclusiveGroup,
      rules: def.rules ? (def.rules as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      isSellable: def.isSellable,
      sortOrder: def.sortOrder
    };

    const existing = await prisma.catalogItem.findUnique({ where: { code: def.code }, select: { id: true } });
    if (existing && missingOnly) {
      skipped += 1;
      continue;
    }

    const item = existing
      ? await prisma.catalogItem.update({ where: { code: def.code }, data })
      : await prisma.catalogItem.create({ data: { code: def.code, ...data } });
    if (existing) updated += 1;
    else created += 1;

    const keys = Object.keys(def.capacities) as Array<keyof typeof def.capacities>;
    for (const capacityKey of keys) {
      const amount = def.capacities[capacityKey]!;
      await prisma.catalogCapacity.upsert({
        where: { catalogItemId_capacityKey: { catalogItemId: item.id, capacityKey } },
        update: { amount },
        create: { catalogItemId: item.id, capacityKey, amount }
      });
    }
    await prisma.catalogCapacity.deleteMany({
      where: { catalogItemId: item.id, capacityKey: { notIn: keys } }
    });
  }

  const rows = await prisma.catalogItem.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { capacities: { select: { capacityKey: true, amount: true } } }
  });
  console.log(`Catalogue : ${created} créée(s), ${updated} réalignée(s), ${skipped} laissée(s) telle(s) quelle(s).`);
  for (const row of rows) {
    const caps = row.capacities.map(c => `${c.capacityKey}=${c.amount}`).join(', ');
    console.log(
      `  ${row.code.padEnd(16)} ${row.kind.padEnd(9)} ${String(row.monthlyPrice).padStart(9)} /mois  ` +
        `mise en route ${String(row.setupPrice).padStart(8)}  ${caps}`
    );
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
