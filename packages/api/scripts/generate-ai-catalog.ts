/**
 * Génère `src/lib/ai/gateway/catalog.generated.json`, l'index des routes d'agence
 * que la passerelle IA peut consulter (plan V2, étape 3).
 *
 *   npm run ai:catalog        (dans packages/api)
 *
 * À relancer chaque fois qu'une route d'agence est ajoutée, déplacée, retirée ou
 * change de garde : `__tests__/unit/ai.catalog.test.ts` échoue tant que le
 * fichier commité diffère de ce que produit la pile Express réelle.
 *
 * Aucune base ni aucun réseau : l'app est construite, jamais démarrée. Les
 * variables ci-dessous ne servent qu'à passer la validation de `config/env.ts`
 * (mêmes valeurs que `__tests__/setup.ts`, pour une sortie identique au test).
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-token-secret-for-testing-only';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';

import { buildCatalog, serializeCatalog } from '../src/lib/ai/gateway/catalog-builder';
import { collectRoutes, installMountPathRecorder } from '../src/lib/ai/gateway/route-walker';

installMountPathRecorder();

const OUTPUT = join(__dirname, '..', 'src', 'lib', 'ai', 'gateway', 'catalog.generated.json');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../src/app').default;
const { entries, excludedDestructive } = buildCatalog(collectRoutes(app));
writeFileSync(OUTPUT, serializeCatalog(entries), 'utf8');
// lint-staged passe Prettier sur tout `**/*.json` à chaque commit : on écrit donc déjà le format
// de Prettier, pour que le fichier commité ne change pas de forme (le test compare le CONTENU).
try {
  execFileSync(process.execPath, [require.resolve('prettier/bin/prettier.cjs'), '--write', OUTPUT], {
    stdio: 'ignore'
  });
} catch {
  /* Prettier absent : le contenu est identique, seule la mise en forme diffère */
}

const byMethod = entries.reduce<Record<string, number>>((acc, entry) => {
  acc[entry.method] = (acc[entry.method] ?? 0) + 1;
  return acc;
}, {});
// eslint-disable-next-line no-console
console.log(
  `Catalogue IA : ${entries.length} routes (${JSON.stringify(byMethod)}), ` +
    `${excludedDestructive.length} destructrices exclues -> ${OUTPUT}`
);
process.exit(0);
