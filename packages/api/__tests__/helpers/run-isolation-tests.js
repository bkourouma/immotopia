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
const { execSync } = require('child_process');

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

console.log(
  'Execution des suites sur base reelle : isolation (E1), acces tiers de confiance (B3), patrimoine multi-actifs et espace particulier...'
);
// --runInBand : isolation.test.ts compare des compteurs GLOBAUX avant/apres ; une suite parallele qui ecrit dans la meme base les fausserait.
execSync(
  'npx jest --runInBand __tests__/integration/isolation.test.ts __tests__/integration/external-access.db.test.ts __tests__/integration/patrimoine.property-asset.integration.test.ts __tests__/integration/signup-guard.integration.test.ts __tests__/integration/personal-space.integration.test.ts __tests__/integration/patrimoine.personal-permission.integration.test.ts',
  { stdio: 'inherit', env }
);

// Journal d'audit (phase 5) : scellement, verification, purge. Lance APRES et
// SEPAREMENT : certains cas desactivent un declencheur de `audit_logs` le temps
// d'une alteration simulee, ce qui ne doit jamais croiser une autre suite.
console.log("Execution de la suite integrite du journal d'audit...");
execSync('npx jest --runInBand __tests__/integration/audit-integrity.test.ts', { stdio: 'inherit', env });
