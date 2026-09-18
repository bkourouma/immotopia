/**
 * Mesureur — instantané de référence du lot 0 (module financier opérationnel).
 *
 * Ce script ne construit rien : il mesure. Il produit un instantané comparable
 * de l'état du dépôt, pour qu'à chaque point d'intégration entre agents on
 * puisse répondre en une commande à la question « est-ce qu'on a régressé ? ».
 *
 * Il mesure :
 *   - le nombre d'erreurs TypeScript de packages/api et de apps/web, séparément,
 *     et la ventilation des erreurs API par fichier (le compte global peut ne
 *     pas bouger alors qu'un fichier aujourd'hui propre s'est sali) ;
 *   - le nombre de suites et de tests backend (Jest), et le compte des ignorés ;
 *   - le nombre de fichiers et de tests frontend (Vitest) ;
 *   - la date et le SHA du commit courant.
 *
 * Usage :
 *   npx ts-node packages/api/scripts/finance-baseline.ts
 *   npx ts-node packages/api/scripts/finance-baseline.ts --json
 *   npx ts-node packages/api/scripts/finance-baseline.ts --write [--bench-...]
 *
 * --json    N'écrit que le JSON de l'instantané sur la sortie standard (pas de
 *           tableau lisible). Utile pour un point d'intégration scripté.
 * --write   En plus de l'affichage, régénère docs/finance/REFERENCE-LOT-0.md à
 *           partir de l'instantané mesuré. Sans cette option, aucun fichier du
 *           dépôt n'est modifié.
 *
 * Le banc de charge à 500 tiers (packages/api/scripts/finance-bench-balance.ts)
 * est un script séparé : il touche une base de données, ce que ce mesureur ne
 * fait jamais. Ses résultats peuvent être injectés dans le document régénéré
 * via les options --bench-status, --bench-n, --bench-m, --bench-memory-ms,
 * --bench-sql-ms et --bench-note (voir la section « Banc de charge » du
 * document produit).
 *
 * Robustesse : chaque mesure est isolée. Si une commande échoue (tsc en
 * erreur, Jest ou Vitest indisponible, dépôt Git absent…), le script consigne
 * l'échec pour cette mesure précise et poursuit les autres plutôt que de
 * s'arrêter.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Racine du dépôt : packages/api/scripts -> packages/api -> packages -> racine.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const API_DIR = path.join(REPO_ROOT, 'packages', 'api');
const WEB_DIR = path.join(REPO_ROOT, 'apps', 'web');
const REFERENCE_DOC = path.join(REPO_ROOT, 'docs', 'finance', 'REFERENCE-LOT-0.md');

const MAX_BUFFER = 1024 * 1024 * 128;

// ---------------------------------------------------------------------------
// Exécution de commandes, jamais fatale
// ---------------------------------------------------------------------------

interface ShellResult {
  ok: boolean;
  output: string;
  errorMessage?: string;
}

/**
 * Exécute une commande shell et renvoie toujours un résultat, même en cas
 * d'échec (code de sortie non nul). C'est le cas normal de `tsc --noEmit`
 * quand il y a des erreurs de type : la sortie utile est là, seul le code de
 * sortie est non nul.
 */
function runShell(command: string, cwd: string): ShellResult {
  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { ok: true, output };
  } catch (error: any) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : (error?.stdout?.toString('utf8') ?? '');
    const stderr = typeof error?.stderr === 'string' ? error.stderr : (error?.stderr?.toString('utf8') ?? '');
    return { ok: false, output: `${stdout}\n${stderr}`.trim(), errorMessage: error?.message ?? String(error) };
  }
}

// ---------------------------------------------------------------------------
// Erreurs TypeScript
// ---------------------------------------------------------------------------

interface TypeErrorsMeasurement {
  ok: boolean;
  totalErrors: number;
  byFile: { file: string; count: number }[];
  note?: string;
}

function normalizeFilePath(file: string): string {
  const posix = file.trim().replace(/\\/g, '/');
  const idx = posix.toLowerCase().indexOf('/packages/');
  const idx2 = posix.toLowerCase().indexOf('/apps/');
  if (path.isAbsolute(posix) && (idx !== -1 || idx2 !== -1)) {
    const cut = idx !== -1 ? idx : idx2;
    return posix.slice(cut + 1);
  }
  return posix;
}

/** Compte les erreurs `tsc --noEmit` et les ventile par fichier. */
function measureTypeErrors(tsconfigAbsPath: string): TypeErrorsMeasurement {
  if (!fs.existsSync(tsconfigAbsPath)) {
    return { ok: false, totalErrors: 0, byFile: [], note: `tsconfig introuvable : ${tsconfigAbsPath}` };
  }

  const command = `npx tsc --noEmit -p "${tsconfigAbsPath}"`;
  const result = runShell(command, REPO_ROOT);

  // tsc renvoie un code de sortie non nul dès qu'il y a des erreurs : ce n'est
  // pas un échec de la mesure, seulement l'absence de sortie qui l'est.
  if (!result.output && !result.ok) {
    return {
      ok: false,
      totalErrors: 0,
      byFile: [],
      note: `commande tsc en échec sans sortie exploitable : ${result.errorMessage ?? 'raison inconnue'}`
    };
  }

  const errorLineRegex = /^(.+?\.tsx?)\(\d+,\d+\): error TS\d+:/gm;
  const counts = new Map<string, number>();
  let total = 0;
  let match: RegExpExecArray | null;
  while ((match = errorLineRegex.exec(result.output)) !== null) {
    total += 1;
    const file = normalizeFilePath(match[1]);
    counts.set(file, (counts.get(file) ?? 0) + 1);
  }

  const byFile = Array.from(counts.entries())
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));

  return { ok: true, totalErrors: total, byFile };
}

// ---------------------------------------------------------------------------
// Tests backend (Jest) et frontend (Vitest)
// ---------------------------------------------------------------------------

interface TestsMeasurement {
  ok: boolean;
  filesOrSuitesTotal?: number;
  filesOrSuitesPassed?: number;
  filesOrSuitesFailed?: number;
  filesOrSuitesSkipped?: number;
  testsTotal?: number;
  testsPassed?: number;
  testsFailed?: number;
  testsSkipped?: number;
  note?: string;
}

function readJsonReport(outFile: string): any | undefined {
  if (!fs.existsSync(outFile)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(outFile, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Suites et tests backend, via le rapporteur JSON natif de Jest. */
function measureBackendTests(): TestsMeasurement {
  const outFile = path.join(os.tmpdir(), `finance-baseline-jest-${process.pid}-${Date.now()}.json`);
  try {
    const command = `npx jest --json --outputFile="${outFile}"`;
    // Jest sort avec un code non nul dès qu'un test échoue : sans intérêt ici,
    // seul le fichier de résultats compte.
    runShell(command, API_DIR);

    const data = readJsonReport(outFile);
    if (!data) {
      return { ok: false, note: "Jest n'a produit aucun rapport JSON exploitable (voir la sortie de `npm test`)." };
    }

    return {
      ok: true,
      filesOrSuitesTotal: data.numTotalTestSuites,
      filesOrSuitesPassed: data.numPassedTestSuites,
      filesOrSuitesFailed: data.numFailedTestSuites,
      filesOrSuitesSkipped: data.numPendingTestSuites,
      testsTotal: data.numTotalTests,
      testsPassed: data.numPassedTests,
      testsFailed: data.numFailedTests,
      testsSkipped: (data.numPendingTests ?? 0) + (data.numTodoTests ?? 0)
    };
  } catch (error: any) {
    return { ok: false, note: `Mesure des tests backend impossible : ${error?.message ?? error}` };
  } finally {
    try {
      fs.unlinkSync(outFile);
    } catch {
      // Rien à nettoyer : le fichier n'a jamais existé.
    }
  }
}

/** Fichiers et tests frontend, via le rapporteur JSON natif de Vitest. */
function measureFrontendTests(): TestsMeasurement {
  const outFile = path.join(os.tmpdir(), `finance-baseline-vitest-${process.pid}-${Date.now()}.json`);
  try {
    const command = `npx vitest run --reporter=json --outputFile="${outFile}"`;
    runShell(command, WEB_DIR);

    const data = readJsonReport(outFile);
    if (!data) {
      return {
        ok: false,
        note: "Vitest n'a produit aucun rapport JSON exploitable (voir la sortie de `npm run test:web`)."
      };
    }

    // Le rapporteur JSON de Vitest partage son schéma avec celui de Jest, mais
    // `numTotalTestSuites` y compte les blocs `describe`, pas les fichiers.
    // Le nombre de fichiers est la taille de `testResults`.
    const testResults: any[] = Array.isArray(data.testResults) ? data.testResults : [];
    const filesTotal = testResults.length;
    const filesFailed = testResults.filter(r => r.status && r.status !== 'passed').length;

    return {
      ok: true,
      filesOrSuitesTotal: filesTotal,
      filesOrSuitesPassed: filesTotal - filesFailed,
      filesOrSuitesFailed: filesFailed,
      filesOrSuitesSkipped: 0,
      testsTotal: data.numTotalTests,
      testsPassed: data.numPassedTests,
      testsFailed: data.numFailedTests,
      testsSkipped: (data.numPendingTests ?? 0) + (data.numTodoTests ?? 0)
    };
  } catch (error: any) {
    return { ok: false, note: `Mesure des tests frontend impossible : ${error?.message ?? error}` };
  } finally {
    try {
      fs.unlinkSync(outFile);
    } catch {
      // Rien à nettoyer : le fichier n'a jamais existé.
    }
  }
}

// ---------------------------------------------------------------------------
// Métadonnées Git
// ---------------------------------------------------------------------------

interface GitInfo {
  ok: boolean;
  sha?: string;
  shortSha?: string;
  branch?: string;
  commitDate?: string;
  note?: string;
}

function getGitInfo(): GitInfo {
  try {
    const sha = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const shortSha = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const commitDate = execSync('git show -s --format=%cI HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    return { ok: true, sha, shortSha, branch, commitDate };
  } catch (error: any) {
    return { ok: false, note: `Dépôt Git introuvable ou inaccessible : ${error?.message ?? error}` };
  }
}

// ---------------------------------------------------------------------------
// Instantané complet
// ---------------------------------------------------------------------------

interface Snapshot {
  measuredAt: string;
  git: GitInfo;
  typeErrors: {
    api: TypeErrorsMeasurement;
    web: TypeErrorsMeasurement;
  };
  tests: {
    backend: TestsMeasurement;
    frontend: TestsMeasurement;
  };
}

function buildSnapshot(): Snapshot {
  return {
    measuredAt: new Date().toISOString(),
    git: getGitInfo(),
    typeErrors: {
      api: measureTypeErrors(path.join(API_DIR, 'tsconfig.json')),
      web: measureTypeErrors(path.join(WEB_DIR, 'tsconfig.json'))
    },
    tests: {
      backend: measureBackendTests(),
      frontend: measureFrontendTests()
    }
  };
}

// ---------------------------------------------------------------------------
// Affichage lisible
// ---------------------------------------------------------------------------

function pad(value: string | number, width: number): string {
  return String(value).padEnd(width, ' ');
}

function printTable(snapshot: Snapshot): void {
  console.log('');
  console.log('=== Référence lot 0 — module financier opérationnel ===');
  console.log('');
  console.log(`Mesuré le : ${snapshot.measuredAt}`);
  if (snapshot.git.ok) {
    console.log(`Commit    : ${snapshot.git.shortSha} (${snapshot.git.branch}) du ${snapshot.git.commitDate}`);
  } else {
    console.log(`Commit    : indisponible — ${snapshot.git.note}`);
  }

  console.log('');
  console.log('--- Erreurs TypeScript ---');
  console.log('');
  if (snapshot.typeErrors.api.ok) {
    console.log(`API  (packages/api) : ${snapshot.typeErrors.api.totalErrors} erreur(s)`);
    for (const entry of snapshot.typeErrors.api.byFile) {
      console.log(`   ${pad(entry.count, 5)} ${entry.file}`);
    }
  } else {
    console.log(`API  (packages/api) : mesure impossible — ${snapshot.typeErrors.api.note}`);
  }
  console.log('');
  if (snapshot.typeErrors.web.ok) {
    console.log(`Web  (apps/web)     : ${snapshot.typeErrors.web.totalErrors} erreur(s)`);
    for (const entry of snapshot.typeErrors.web.byFile) {
      console.log(`   ${pad(entry.count, 5)} ${entry.file}`);
    }
  } else {
    console.log(`Web  (apps/web)     : mesure impossible — ${snapshot.typeErrors.web.note}`);
  }

  console.log('');
  console.log('--- Tests backend (Jest) ---');
  console.log('');
  const backend = snapshot.tests.backend;
  if (backend.ok) {
    console.log(
      `Suites : ${backend.filesOrSuitesTotal} au total, ${backend.filesOrSuitesPassed} passées, ` +
        `${backend.filesOrSuitesFailed} en échec, ${backend.filesOrSuitesSkipped} ignorées`
    );
    console.log(
      `Tests  : ${backend.testsTotal} au total, ${backend.testsPassed} passés, ` +
        `${backend.testsFailed} en échec, ${backend.testsSkipped} ignorés`
    );
  } else {
    console.log(`mesure impossible — ${backend.note}`);
  }

  console.log('');
  console.log('--- Tests frontend (Vitest) ---');
  console.log('');
  const frontend = snapshot.tests.frontend;
  if (frontend.ok) {
    console.log(`Fichiers : ${frontend.filesOrSuitesTotal} au total, ${frontend.filesOrSuitesPassed} sans échec`);
    console.log(
      `Tests    : ${frontend.testsTotal} au total, ${frontend.testsPassed} passés, ` +
        `${frontend.testsFailed} en échec, ${frontend.testsSkipped} ignorés`
    );
  } else {
    console.log(`mesure impossible — ${frontend.note}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Régénération de docs/finance/REFERENCE-LOT-0.md
// ---------------------------------------------------------------------------

interface BenchOptions {
  status: 'mesure' | 'non-mesure';
  n?: string;
  m?: string;
  memoryMs?: string;
  sqlMs?: string;
  note?: string;
}

function renderTypeErrorsSection(label: string, measurement: TypeErrorsMeasurement): string {
  if (!measurement.ok) {
    return `**${label}** : mesure impossible — ${measurement.note}\n`;
  }
  const lines = [`**${label}** : ${measurement.totalErrors} erreur(s) TypeScript.`];
  if (measurement.byFile.length > 0) {
    lines.push('');
    lines.push('| Fichier | Erreurs |');
    lines.push('| --- | --- |');
    for (const entry of measurement.byFile) {
      lines.push(`| \`${entry.file}\` | ${entry.count} |`);
    }
  }
  return lines.join('\n') + '\n';
}

function renderTestsSection(label: string, unit: string, measurement: TestsMeasurement): string {
  if (!measurement.ok) {
    return `**${label}** : mesure impossible — ${measurement.note}\n`;
  }
  return (
    `**${label}**\n\n` +
    `| ${unit} | Tests |\n` +
    `| --- | --- |\n` +
    `| ${measurement.filesOrSuitesTotal} au total, ${measurement.filesOrSuitesPassed} sans échec, ${measurement.filesOrSuitesSkipped ?? 0} ignoré(s) ` +
    `| ${measurement.testsTotal} au total, ${measurement.testsPassed} passés, ${measurement.testsFailed} en échec, ${measurement.testsSkipped} ignoré(s) |\n`
  );
}

function renderBenchSection(bench: BenchOptions): string {
  if (bench.status !== 'mesure') {
    return (
      'Mesure **non prise** au moment de la rédaction de cette référence : ' +
      (bench.note ?? '`DATABASE_URL` absent ou base de données injoignable') +
      '.\n\n' +
      "Pour la prendre dès qu'une base est disponible :\n\n" +
      '```bash\n' +
      'npx ts-node packages/api/scripts/finance-bench-balance.ts --tiers=500 --mouvements=24\n' +
      '```\n'
    );
  }
  return (
    `Mesure prise avec ${bench.n ?? '500'} tiers et ${bench.m ?? '24'} mouvements par tiers ` +
    '(tables locatives existantes `RentalInstallment` / `RentalPayment` / `RentalPaymentAllocation`, en ' +
    'attendant les tables du module financier) :\n\n' +
    '| Stratégie | Durée |\n' +
    '| --- | --- |\n' +
    `| Agrégation en mémoire (comme \`getTrialBalanceBySyndicate\`) | ${bench.memoryMs ?? '?'} ms |\n` +
    `| Agrégation SQL (\`groupBy\` / requête agrégée) | ${bench.sqlMs ?? '?'} ms |\n\n` +
    (bench.note ? `Note : ${bench.note}\n` : '')
  );
}

function renderDoc(snapshot: Snapshot, bench: BenchOptions): string {
  const commit = snapshot.git.ok
    ? `${snapshot.git.shortSha} (\`${snapshot.git.branch}\`, ${snapshot.git.commitDate})`
    : `indisponible (${snapshot.git.note})`;

  return `# Référence lot 0 — module financier opérationnel

Ce document est régénéré par \`packages/api/scripts/finance-baseline.ts --write\`. Ne pas
l'éditer à la main : toute correction doit passer par le script, sous peine d'être
écrasée à la prochaine mesure.

## Reproduire cette mesure

\`\`\`bash
npx ts-node packages/api/scripts/finance-baseline.ts
\`\`\`

Ajouter \`--json\` pour une sortie machine seule, \`--write\` pour régénérer ce fichier.

## Règle de lecture

**Le décompte d'erreurs TypeScript ne doit jamais augmenter, et aucun fichier
aujourd'hui à zéro erreur ne doit en gagner.** Un total inchangé ne suffit pas :
comparer la ventilation par fichier ci-dessous à chaque point d'intégration.
Un fichier qui apparaît dans la liste API alors qu'il n'y était pas, ou dont le
compte augmente, est une régression — même si le total global n'a pas bougé.

La même règle de non-régression s'applique aux suites et tests : une suite ou
un test qui passait doit continuer de passer. Un compte de tests qui augmente
n'est pas un problème en soi (de nouveaux tests de caractérisation peuvent
apparaître entre deux mesures, écrits par d'autres agents du même lot) ; un
compte qui diminue, ou un test qui échoue, l'est.

## Instantané

Mesuré le ${snapshot.measuredAt}. Commit ${commit}.

### Erreurs TypeScript

${renderTypeErrorsSection('packages/api', snapshot.typeErrors.api)}
${renderTypeErrorsSection('apps/web', snapshot.typeErrors.web)}

### Tests

${renderTestsSection('Backend (Jest)', 'Suites', snapshot.tests.backend)}
${renderTestsSection('Frontend (Vitest)', 'Fichiers', snapshot.tests.frontend)}

## Banc de charge — balance à 500 tiers (critère de sortie du lot 1, plan §5.5)

${renderBenchSection(bench)}
`;
}

function parseBenchOptions(args: string[]): BenchOptions {
  const get = (flag: string): string | undefined => {
    const prefix = `--${flag}=`;
    const found = args.find(a => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
  };
  const status = get('bench-status') === 'mesure' ? 'mesure' : 'non-mesure';
  return {
    status,
    n: get('bench-n'),
    m: get('bench-m'),
    memoryMs: get('bench-memory-ms'),
    sqlMs: get('bench-sql-ms'),
    note: get('bench-note')
  };
}

function writeReferenceDoc(snapshot: Snapshot, bench: BenchOptions): void {
  const dir = path.dirname(REFERENCE_DOC);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(REFERENCE_DOC, renderDoc(snapshot, bench), 'utf8');
  console.log(`Document régénéré : ${path.relative(REPO_ROOT, REFERENCE_DOC)}`);
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json');
  const write = args.includes('--write');

  const snapshot = buildSnapshot();

  if (jsonOnly) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    printTable(snapshot);
  }

  if (write) {
    writeReferenceDoc(snapshot, parseBenchOptions(args));
  }
}

main();
