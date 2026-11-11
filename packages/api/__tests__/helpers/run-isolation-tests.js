/**
 * Lance la suite E1 (isolation multi-tenant, lot E) sur une base DEDIEE.
 *
 * `npm run test:isolation` (package.json) appelle ce script plutot que
 * d'enchainer les commandes en JSON, pour rester lisible et portable
 * (Windows/PowerShell inclus — aucune syntaxe `VAR=valeur commande` qui ne
 * marche pas sous cmd/PowerShell).
 *
 * `DATABASE_URL_TEST` est LA variable documentee (env.example) pour ce lot.
 * `__tests__/setup.ts`, deja commit et partage par toute la suite, lit de son
 * cote `TEST_DATABASE_URL` (nom different, convention preexistante) pour
 * definir `DATABASE_URL` avant chaque fichier de test. On ne touche pas ce
 * fichier partage : on lui fournit `TEST_DATABASE_URL` avec la MEME valeur
 * que `DATABASE_URL_TEST`, pour que les deux conventions pointent sur la
 * meme base. Le script lance aussi `__tests__/integration/external-access.db.test.ts` (lot B3).
 *
 * Si `DATABASE_URL_TEST` est absente, ce script ne fait rien (code 0) :
 * `__tests__/integration/isolation.test.ts` s'auto-ignore alors via
 * `describe.skip`, et `npm test` (qui decouvre ce fichier normalement, sans
 * ce script) reste vert.
 */
const { execFileSync, execSync } = require('child_process');

// Meme mecanisme que src/config/env.ts : charge packages/api/.env si present,
// sans ecraser une variable deja fournie par l'environnement appelant.
require('dotenv').config();

const testDatabaseUrl = process.env.DATABASE_URL_TEST;

if (!testDatabaseUrl) {
  console.log(
    'DATABASE_URL_TEST absente : suite isolation (E1) ignoree. ' +
      'Voir env.example et __tests__/integration/isolation.test.ts.'
  );
  process.exit(0);
}

const env = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
  TEST_DATABASE_URL: testDatabaseUrl
};

console.log('Application des migrations sur la base de test isolation...');
execSync('npx prisma migrate deploy', { stdio: 'inherit', env });

// Chaque fichier dispose de son propre processus Node : la heap de ts-jest et
// de l'application est liberee avant le suivant. L'ordre reste strictement
// sequentiel, notamment pour les compteurs globaux et le declencheur d'audit.
const groups = [
  {
    name: 'isolation et lectures sur base reelle',
    files: [
      'isolation.test.ts',
      'isolation-syndic-lot.test.ts',
      'external-access.db.test.ts',
      'patrimoine.property-asset.integration.test.ts',
      'signup-guard.integration.test.ts',
      'personal-space.integration.test.ts',
      'patrimoine.personal-permission.integration.test.ts',
      'signature.db.test.ts',
      'accounting-exports-sql.test.ts',
      'syndic-accounting-reads-sql.test.ts',
      'like-escape-sql.test.ts',
      'syndic-ui-pagination-sql.test.ts'
    ]
  },
  {
    name: 'concurrence du stock',
    files: ['stock-concurrence.test.ts', 'stock-cloture-concurrence.test.ts', 'stock-alertes-concurrence.test.ts']
  },
  {
    name: 'inventaire WhatsApp',
    files: ['stock-whatsapp-inventaire.test.ts', 'stock-whatsapp-quota-concurrence.test.ts']
  },
  { name: 'integrite du journal d’audit', files: ['audit-integrity.test.ts'] }
];

const jestBin = require.resolve('jest/bin/jest');
for (const group of groups) {
  console.log(`Execution des suites : ${group.name}...`);
  for (const [index, file] of group.files.entries()) {
    const testPath = `__tests__/integration/${file}`;
    console.log(`[${index + 1}/${group.files.length}] ${testPath}`);
    // execFileSync propage immediatement le code de sortie non nul : aucun
    // fichier suivant ne demarre apres un echec.
    execFileSync(process.execPath, [jestBin, '--runInBand', '--forceExit', testPath], { stdio: 'inherit', env });
  }
}
