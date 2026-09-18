/**
 * Banc de charge des trois fonctions de restitution du module financier.
 *
 * Distinct de `finance-bench-balance.ts`, qui comparait deux STRATEGIES
 * d'agregation sur les tables locatives, avant que les tables financieres
 * n'existent. Celui-ci mesure le code reellement livre — `getClientsBalance`,
 * `getClientsAgingBalance`, `getAccountStatement` — a l'echelle que le critere
 * de sortie du lot 1 fixe : 500 tiers, moins de trois secondes.
 *
 * Sans danger par construction :
 *
 *   - il refuse de tourner si `NODE_ENV` vaut `production` ;
 *   - il cree son propre tenant jetable, au nom reconnaissable, et n'ecrit
 *     jamais dans un tenant existant ;
 *   - il le supprime a la fin, y compris si une mesure echoue.
 *
 * Usage :
 *   npx ts-node --project packages/api/tsconfig.json \
 *     packages/api/scripts/finance-bench-reports.ts [--tiers=500] [--mouvements=24]
 */

import { randomUUID } from 'crypto';
import { prisma } from '../src/utils/database';
import { getAccountStatement, getClientsAgingBalance, getClientsBalance } from '../src/lib/finance/reports';

function option(nom: string, defaut: number): number {
  const brut = process.argv.slice(2).find(a => a.startsWith(`--${nom}=`));
  const valeur = brut ? Number(brut.split('=')[1]) : NaN;
  return Number.isFinite(valeur) && valeur > 0 ? Math.floor(valeur) : defaut;
}

async function chrono<T>(f: () => Promise<T>): Promise<[T, number]> {
  const debut = process.hrtime.bigint();
  const resultat = await f();
  return [resultat, Number(process.hrtime.bigint() - debut) / 1e6];
}

/** Mediane plutot que moyenne : une premiere execution a froid fausserait tout. */
function mediane(valeurs: number[]): number {
  const t = [...valeurs].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refus de tourner : NODE_ENV=production.');
    process.exit(1);
  }

  const nbTiers = option('tiers', 500);
  const nbMouvements = option('mouvements', 24);
  const tenantId = `bench-finance-${randomUUID()}`;

  console.log(`Banc de charge : ${nbTiers} tiers, ${nbMouvements} mouvements chacun.`);
  console.log(`Tenant jetable : ${tenantId}\n`);

  try {
    // Par le client Prisma et non en SQL brut : `tenants` porte des colonnes
    // obligatoires sans valeur par defaut cote base (`type` notamment), que
    // seule la couche Prisma sait remplir.
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: 'Banc de charge finance',
        slug: `bench-${Date.now()}`,
        type: 'AGENCY' as any
      }
    });

    // Insertion en masse par SQL : l'ecriture n'est pas ce qu'on mesure, et
    // passer par le grand livre ligne a ligne prendrait des minutes.
    await prisma.$executeRawUnsafe(
      `INSERT INTO third_party_accounts (id, tenant_id, kind, label, balance, currency, is_active, created_at, updated_at)
       SELECT gen_random_uuid(), $1, 'TENANT', 'Tiers ' || g, 0, 'XOF', true, NOW(), NOW()
         FROM generate_series(1, $2) g`,
      tenantId,
      nbTiers
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO third_party_movements
         (id, account_id, tenant_id, movement_date, type, debit, credit, balance_after, label, source_type, source_id, created_at)
       SELECT gen_random_uuid(), a.id, $1,
              NOW() - (m || ' months')::interval,
              CASE WHEN m % 2 = 0 THEN 'INSTALLMENT'::"ThirdPartyMovementType" ELSE 'PAYMENT'::"ThirdPartyMovementType" END,
              CASE WHEN m % 2 = 0 THEN 450000 ELSE NULL END,
              CASE WHEN m % 2 = 0 THEN NULL ELSE 450000 END,
              0, 'Mouvement ' || m, 'RENTAL_INSTALLMENT', gen_random_uuid()::text, NOW()
         FROM third_party_accounts a CROSS JOIN generate_series(1, $2) m
        WHERE a.tenant_id = $1`,
      tenantId,
      nbMouvements
    );

    const [{ comptes, mouvements }] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT (SELECT COUNT(*)::int FROM third_party_accounts  WHERE tenant_id = $1) AS comptes,
              (SELECT COUNT(*)::int FROM third_party_movements WHERE tenant_id = $1) AS mouvements`,
      tenantId
    );
    console.log(`Jeu de donnees : ${comptes} comptes, ${mouvements} mouvements.\n`);

    const mesures: Record<string, number[]> = { balance: [], agee: [], releve: [] };
    let unCompte = '';

    for (let i = 0; i < 3; i++) {
      const [balance, msBalance] = await chrono(() => getClientsBalance(tenantId));
      mesures.balance.push(msBalance);
      unCompte = unCompte || balance.lines[0]?.accountId || '';

      mesures.agee.push((await chrono(() => getClientsAgingBalance(tenantId)))[1]);
      if (unCompte) {
        mesures.releve.push((await chrono(() => getAccountStatement(tenantId, unCompte)))[1]);
      }
    }

    const SEUIL = 3000;
    console.log('Fonction              Mediane    Mesures                Verdict');
    console.log('-------------------------------------------------------------------');
    for (const [nom, libelle] of [
      ['balance', 'Balance clients'],
      ['agee', 'Balance agee'],
      ['releve', 'Releve de compte']
    ] as const) {
      const v = mesures[nom];
      if (!v.length) continue;
      const med = mediane(v);
      const verdict = med < SEUIL ? `OK (marge x${Math.round(SEUIL / Math.max(med, 0.1))})` : 'DEPASSE LE SEUIL';
      console.log(
        `${libelle.padEnd(21)} ${(med.toFixed(1) + ' ms').padEnd(10)} ` +
          `${v
            .map(x => x.toFixed(0))
            .join(' / ')
            .padEnd(22)} ${verdict}`
      );
    }
    console.log(`\nSeuil du critere de sortie du lot 1 : ${SEUIL} ms pour ${nbTiers} tiers.`);
  } finally {
    // Les mouvements et les comptes partent par cascade avec le tenant.
    await prisma.$executeRawUnsafe(`DELETE FROM tenants WHERE id = $1`, tenantId);
    console.log('\nTenant jetable supprime.');
    await prisma.$disconnect();
  }
}

main().catch(async error => {
  console.error('Banc interrompu :', error);
  await prisma.$disconnect();
  process.exit(1);
});
