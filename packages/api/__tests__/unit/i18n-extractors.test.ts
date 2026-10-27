import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Garde-fou des extracteurs i18n (`apps/web/scripts/i18n-migrate.mjs` et
 * `packages/api/scripts/i18n-extract.mjs`), exécutés pour de vrai sur de
 * petits paquets jetables (`--root=`).
 *
 * Ce qui est verrouillé : un passage normal ne supprime JAMAIS une traduction
 * non vide, les clés dynamiques (constantes de libellés, marqueur
 * `@i18n-keys`) sont recensées, un second passage ne change rien (point
 * fixe) et aucun `*.orphans.json` n'apparaît sans `--prune`.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const WEB_SCRIPT = path.join(REPO_ROOT, 'apps', 'web', 'scripts', 'i18n-migrate.mjs');
const API_SCRIPT = path.join(REPO_ROOT, 'packages', 'api', 'scripts', 'i18n-extract.mjs');

jest.setTimeout(60_000);

const tmpRoots: string[] = [];

afterAll(() => {
  for (const dir of tmpRoots) fs.rmSync(dir, { recursive: true, force: true });
});

type Files = Record<string, string | Record<string, string>>;

/** Écrit un paquet jetable ; un objet est écrit en JSON, une chaîne telle quelle. */
function makePackage(files: Files): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'immotopia-i18n-'));
  tmpRoots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n', 'utf8');
  }
  return root;
}

function run(script: string, root: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [script, `--root=${root}`, ...args], { encoding: 'utf8' });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

function readJson(root: string, relative: string): Record<string, string> {
  return JSON.parse(fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8')) as Record<string, string>;
}

function readRaw(root: string, relative: string): string {
  return fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
}

function listOrphans(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.orphans.json')) found.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return found.sort();
}

/* ------------------------------------------------------------------ frontend */

const WEB_SOURCES: Files = {
  'src/utils/labels.ts': [
    "import { t } from '../i18n/t';",
    '',
    'const CAPACITY_LABELS: Record<string, string> = { LOTS: "lots", ACTIFS: "actifs" };',
    'const INDICATIF = "Estimation indicative.";',
    '',
    'export const capacity = (key: string) => t(CAPACITY_LABELS[key] ?? key.toLowerCase());',
    'export const indicatif = () => t(INDICATIF);',
    'export const save = () => t("Enregistrer");',
    'export const local = () => {',
    '  const body = { kind: "valeur locale" };',
    '  return t(body.kind);',
    '};',
    ''
  ].join('\n'),
  'src/utils/champs.ts': [
    '// @i18n-keys libelle aide',
    'export const CHAMPS = [',
    '  { id: "acquisitionDate", type: "date", libelle: "Date d’acquisition", aide: "Format jj/mm/aaaa" }',
    '];',
    '',
    '/** @i18n-keys */',
    'export const STATUTS = ["Brouillon", "Publié"];',
    ''
  ].join('\n')
};

function webPackage(extra: Files = {}): string {
  return makePackage({
    ...WEB_SOURCES,
    'src/i18n/locales/en/common.json': {
      Enregistrer: 'Save',
      lots: 'lots (EN)',
      'Date d’acquisition': 'Acquisition date',
      'Ancien texte retouché': 'Old retouched text'
    },
    'src/i18n/locales/ar/common.json': {
      Enregistrer: 'حفظ',
      lots: 'قطع',
      'Date d’acquisition': 'تاريخ الاقتناء',
      'Ancien texte retouché': 'نص قديم'
    },
    ...extra
  });
}

describe('i18n-migrate.mjs (web)', () => {
  it('ne perd aucune traduction non vide et recense les clés dynamiques', () => {
    const root = webPackage();
    const { status } = run(WEB_SCRIPT, root);
    expect(status).toBe(0);

    const en = readJson(root, 'src/i18n/locales/en/common.json');
    // Traductions existantes : toutes gardées, y compris la non référencée.
    expect(en['Enregistrer']).toBe('Save');
    expect(en['lots']).toBe('lots (EN)');
    expect(en['Date d’acquisition']).toBe('Acquisition date');
    expect(en['Ancien texte retouché']).toBe('Old retouched text');
    // Clés dynamiques nouvelles : ajoutées, à traduire.
    expect(en).toHaveProperty('actifs', '');
    expect(en).toHaveProperty(['Estimation indicative.'], '');
    expect(en).toHaveProperty('Format jj/mm/aaaa', '');
    expect(en).toHaveProperty('Brouillon', '');
    expect(en).toHaveProperty('Publié', '');
    // Une variable locale n'est pas développée ; une valeur hors filtre non plus.
    expect(en).not.toHaveProperty(['valeur locale']);
    expect(en).not.toHaveProperty('date');
    expect(listOrphans(root)).toEqual([]);

    const ar = readJson(root, 'src/i18n/locales/ar/common.json');
    expect(ar['Ancien texte retouché']).toBe('نص قديم');
  });

  it('est un point fixe : un second passage ne change aucun fichier', () => {
    const root = webPackage();
    run(WEB_SCRIPT, root);
    const before = readRaw(root, 'src/i18n/locales/en/common.json');
    const sourceBefore = readRaw(root, 'src/utils/labels.ts');

    const second = run(WEB_SCRIPT, root);
    expect(second.status).toBe(0);
    expect(readRaw(root, 'src/i18n/locales/en/common.json')).toBe(before);
    expect(readRaw(root, 'src/utils/labels.ts')).toBe(sourceBefore);
    expect(listOrphans(root)).toEqual([]);
  });

  it("--dry n'écrit rien", () => {
    const root = webPackage();
    const before = readRaw(root, 'src/i18n/locales/en/common.json');
    expect(run(WEB_SCRIPT, root, '--dry').status).toBe(0);
    expect(readRaw(root, 'src/i18n/locales/en/common.json')).toBe(before);
  });

  it('--check échoue tant que des clés manquent, réussit une fois les catalogues à jour', () => {
    const root = webPackage();
    const before = readRaw(root, 'src/i18n/locales/en/common.json');

    const failing = run(WEB_SCRIPT, root, '--check');
    expect(failing.status).toBe(1);
    expect(failing.out).toContain('i18n:extract');
    expect(readRaw(root, 'src/i18n/locales/en/common.json')).toBe(before);

    run(WEB_SCRIPT, root);
    // Les nouvelles clés sont vides : --check ne juge que la synchronisation.
    expect(run(WEB_SCRIPT, root, '--check').status).toBe(0);
  });

  it("--check échoue si un fichier d'orphelins est présent", () => {
    const root = webPackage();
    run(WEB_SCRIPT, root);
    fs.writeFileSync(path.join(root, 'src/i18n/locales/en/common.orphans.json'), '{}\n', 'utf8');
    expect(run(WEB_SCRIPT, root, '--check').status).toBe(1);
  });

  it('--prune déplace les non référencées en les fusionnant avec les orphelins existants', () => {
    const root = webPackage({
      'src/i18n/locales/en/common.orphans.json': { 'Déjà orpheline': 'Already orphaned' }
    });
    run(WEB_SCRIPT, root);

    const pruned = run(WEB_SCRIPT, root, '--prune');
    expect(pruned.status).toBe(0);
    expect(readJson(root, 'src/i18n/locales/en/common.json')).not.toHaveProperty('Ancien texte retouché');
    expect(readJson(root, 'src/i18n/locales/en/common.orphans.json')).toEqual({
      'Ancien texte retouché': 'Old retouched text',
      'Déjà orpheline': 'Already orphaned'
    });

    // Un passage suivant, avec ou sans --prune, ne supprime ni n'écrase l'orphelin.
    run(WEB_SCRIPT, root);
    run(WEB_SCRIPT, root, '--prune');
    expect(readJson(root, 'src/i18n/locales/en/common.orphans.json')).toEqual({
      'Ancien texte retouché': 'Old retouched text',
      'Déjà orpheline': 'Already orphaned'
    });
  });

  it('refuse --prune avec --only ou --check, et toute option inconnue', () => {
    const root = webPackage();
    const before = readRaw(root, 'src/i18n/locales/en/common.json');
    expect(run(WEB_SCRIPT, root, '--prune', '--only=utils').status).toBe(2);
    expect(run(WEB_SCRIPT, root, '--prune', '--check').status).toBe(2);
    // Une faute de frappe (`--chek`) ne doit pas lancer un passage qui écrit.
    expect(run(WEB_SCRIPT, root, '--chek').status).toBe(2);
    expect(readRaw(root, 'src/i18n/locales/en/common.json')).toBe(before);
    expect(listOrphans(root)).toEqual([]);
  });

  it("conserve les fins de ligne CRLF d'un catalogue existant", () => {
    const root = webPackage();
    const file = path.join(root, 'src/i18n/locales/en/common.json');
    const crlf = fs.readFileSync(file, 'utf8').replace(/\n/g, '\r\n');
    fs.writeFileSync(file, crlf, 'utf8');

    run(WEB_SCRIPT, root);
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw).toContain('\r\n');
    expect(raw.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('ne réécrit pas un catalogue dont le contenu est déjà à jour (même en CRLF)', () => {
    const root = webPackage();
    run(WEB_SCRIPT, root);
    const file = path.join(root, 'src/i18n/locales/en/common.json');
    const crlf = fs.readFileSync(file, 'utf8').replace(/\n/g, '\r\n');
    fs.writeFileSync(file, crlf, 'utf8');
    const mtime = fs.statSync(file).mtimeMs;

    run(WEB_SCRIPT, root);
    expect(fs.readFileSync(file, 'utf8')).toBe(crlf);
    expect(fs.statSync(file).mtimeMs).toBe(mtime);
  });

  it('--only ne retire aucune traduction des modules hors périmètre', () => {
    const root = webPackage();
    run(WEB_SCRIPT, root, '--only=utils/champs');
    const en = readJson(root, 'src/i18n/locales/en/common.json');
    expect(en['Enregistrer']).toBe('Save');
    expect(en['Ancien texte retouché']).toBe('Old retouched text');
    expect(listOrphans(root)).toEqual([]);
  });
});

/* ----------------------------------------------------------------------- API */

const API_SOURCES: Files = {
  'src/services/bail-service.ts': [
    "import { notFound } from '../lib/errors';",
    "import { t } from '../i18n';",
    '',
    "const NOT_FOUND = 'Bail introuvable.';",
    "const MESSAGES = { A: 'Message A', B: 'Message B' };",
    '',
    '// @i18n-keys',
    "const RELAYED = ['Relayé un', 'Relayé deux'];",
    '',
    'export function find(): never {',
    '  throw notFound(NOT_FOUND);',
    '}',
    'export const message = (key: "A" | "B") => t(MESSAGES[key]);',
    'export const relayed = () => RELAYED;',
    "export const direct = () => { throw notFound('Bien introuvable.'); };",
    ''
  ].join('\n')
};

function apiPackage(extra: Files = {}): string {
  return makePackage({
    ...API_SOURCES,
    'src/i18n/locales/en.json': {
      'Bail introuvable.': 'Lease not found.',
      'Bien introuvable.': 'Property not found.',
      'Ancien message': 'Old message'
    },
    'src/i18n/locales/ar.json': {
      'Bail introuvable.': 'عقد الإيجار غير موجود.',
      'Bien introuvable.': 'العقار غير موجود.',
      'Ancien message': 'رسالة قديمة'
    },
    ...extra
  });
}

describe('i18n-extract.mjs (API)', () => {
  it('ne perd aucune traduction non vide et recense les clés dynamiques', () => {
    const root = apiPackage();
    const { status } = run(API_SCRIPT, root);
    expect(status).toBe(0);

    const en = readJson(root, 'src/i18n/locales/en.json');
    expect(en['Bail introuvable.']).toBe('Lease not found.');
    expect(en['Bien introuvable.']).toBe('Property not found.');
    expect(en['Ancien message']).toBe('Old message');
    expect(en).toHaveProperty('Message A', '');
    expect(en).toHaveProperty('Message B', '');
    expect(en).toHaveProperty('Relayé un', '');
    expect(en).toHaveProperty('Relayé deux', '');
    expect(listOrphans(root)).toEqual([]);
    expect(readJson(root, 'src/i18n/locales/ar.json')['Ancien message']).toBe('رسالة قديمة');
  });

  it('est un point fixe : un second passage ne change aucun fichier', () => {
    const root = apiPackage();
    run(API_SCRIPT, root);
    const before = readRaw(root, 'src/i18n/locales/en.json');
    expect(run(API_SCRIPT, root).status).toBe(0);
    expect(readRaw(root, 'src/i18n/locales/en.json')).toBe(before);
    expect(listOrphans(root)).toEqual([]);
  });

  it('--check échoue tant que des clés manquent, réussit ensuite', () => {
    const root = apiPackage();
    const failing = run(API_SCRIPT, root, '--check');
    expect(failing.status).toBe(1);
    expect(failing.out).toContain('i18n:extract');
    run(API_SCRIPT, root);
    expect(run(API_SCRIPT, root, '--check').status).toBe(0);
  });

  it("--dry n'écrit rien", () => {
    const root = apiPackage();
    const before = readRaw(root, 'src/i18n/locales/en.json');
    expect(run(API_SCRIPT, root, '--dry').status).toBe(0);
    expect(readRaw(root, 'src/i18n/locales/en.json')).toBe(before);
  });

  it('--prune déplace les non référencées sans jamais écraser les orphelins', () => {
    const root = apiPackage({ 'src/i18n/locales/en.orphans.json': { 'Déjà orpheline': 'Already orphaned' } });
    run(API_SCRIPT, root);
    run(API_SCRIPT, root, '--prune');
    expect(readJson(root, 'src/i18n/locales/en.json')).not.toHaveProperty('Ancien message');
    expect(readJson(root, 'src/i18n/locales/en.orphans.json')).toEqual({
      'Ancien message': 'Old message',
      'Déjà orpheline': 'Already orphaned'
    });
    run(API_SCRIPT, root);
    expect(readJson(root, 'src/i18n/locales/en.orphans.json')).toHaveProperty('Déjà orpheline');
  });

  it('refuse --prune avec --check, et toute option inconnue', () => {
    expect(run(API_SCRIPT, apiPackage(), '--prune', '--check').status).toBe(2);
    expect(run(API_SCRIPT, apiPackage(), '--chek').status).toBe(2);
  });
});
