#!/usr/bin/env node
/**
 * Codemod — `message` statique d'Ant Design vers `App.useApp()`.
 *
 * Depuis AntD 5, `message.*` importé directement du paquet ne consomme pas le
 * contexte du `ConfigProvider` : une fois les tokens du §3.2 posés, ces toasts
 * s'afficheraient au thème par défaut (§5.7). La correction est mécanique :
 *
 *   - `import { message } from 'antd'`  ->  `import { App } from 'antd'`
 *   - au sommet de chaque composant qui l'utilise :
 *     `const { message } = App.useApp();`
 *
 * Deux modes :
 *   --src    (défaut) transforme les fichiers applicatifs de src/
 *   --tests  ajoute `App.useApp()` aux mocks `vi.mock('antd', …)` des tests,
 *            en preservant l'identite des espions `message` deja mockes
 *
 * Options : --dry (n'ecrit rien), --verbose
 *
 * Le Lot 4 reprendra ce script pour la meme operation sur les fichiers
 * migres depuis `components/ui/`.
 *
 * Usage : node scripts/codemods/message-to-use-app.mjs [--src|--tests] [--dry]
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(WEB_ROOT, 'src');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const VERBOSE = argv.includes('--verbose');
const MODE = argv.includes('--tests') ? 'tests' : 'src';

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(p, acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(p);
    }
  }
  return acc;
}

const rel = (p) => p.split(sep).join('/').replace(WEB_ROOT.split(sep).join('/') + '/', '');

/** Index du `}` fermant, `open` etant l'index du `{` ouvrant. */
function matchBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    // On ignore le contenu des chaines, gabarits, regex simples et commentaires.
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i + 2) + 1;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** `message.xxx(` present, hors acces a une propriete `.message` ou `?.message`. */
const USES_MESSAGE = /(^|[^\w.$?])message\s*\.\s*(success|error|warning|info|loading|open|destroy)\s*\(/;

// ---------------------------------------------------------------------------
// Mode --src
// ---------------------------------------------------------------------------

/** Reecrit l'import antd : retire `message`, ajoute `App` si demande. */
function rewriteImport(src, addApp = true) {
  // [^}] et non [\s\S] : une classe permissive laisserait la capture franchir
  // l'accolade fermante d'un import precedent et engloutir tout le bloc
  // d'imports jusqu'a celui d'antd.
  const re = /import\s+\{([^}]*)\}\s*from\s*(['"])antd\2;?/;
  const m = src.match(re);
  if (!m) return { src, changed: false, reason: "pas d'import antd" };

  const names = m[1]
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

  if (!names.includes('message')) return { src, changed: false, reason: 'message non importe' };

  const kept = names.filter((n) => n !== 'message');
  if (addApp && !kept.includes('App')) kept.unshift('App');

  return {
    src: src.replace(re, `import { ${kept.join(', ')} } from 'antd';`),
    changed: true,
  };
}

/**
 * Declarations de composant/hook au niveau du module. On ne descend pas dans
 * les corps : un composant imbrique herite du `message` du composant parent
 * par fermeture, ce qui suffit.
 */
const DECL_PATTERNS = [
  /^export default function\s+([A-Z]\w*)\s*[(<]/gm,
  /^export function\s+([A-Z]\w*|use[A-Z]\w*)\s*[(<]/gm,
  /^function\s+([A-Z]\w*|use[A-Z]\w*)\s*[(<]/gm,
  /^export const\s+([A-Z]\w*|use[A-Z]\w*)\s*[:=]/gm,
  /^const\s+([A-Z]\w*|use[A-Z]\w*)\s*[:=]/gm,
];

/** Debut du corps `{` d'une declaration commencant a `from`, ou -1. */
function findBodyBrace(src, from) {
  const arrow = src.indexOf('=>', from);
  const brace = src.indexOf('{', from);
  const semi = src.indexOf(';', from);
  const nextDecl = src.indexOf('\nexport ', from + 1);

  // `function X(...) { ... }` : la premiere accolade apres la liste d'arguments
  if (/^(export default |export )?function\s/.test(src.slice(from, from + 24))) {
    const close = src.indexOf(')', from);
    if (close === -1) return -1;
    const b = src.indexOf('{', close);
    return b === -1 ? -1 : b;
  }

  // Forme flechee : le corps commence juste apres `=>`
  if (arrow !== -1 && (brace === -1 || arrow < brace || arrow < semi)) {
    const after = src.slice(arrow + 2).match(/^\s*/)[0].length;
    const first = src[arrow + 2 + after];
    if (first !== '{') return -1; // corps concis `=> (` : traite a la main
    return arrow + 2 + after;
  }

  if (brace !== -1 && (nextDecl === -1 || brace < nextDecl)) return brace;
  return -1;
}

/**
 * Debuts de toutes les declarations de premier niveau (colonne 0). Sert a
 * borner la portee d'un composant sans compter les accolades : le JSX de ce
 * depot est en francais et truffe d'apostrophes non echappees, sur lesquelles
 * un compteur d'accolades naif se desynchronise.
 */
const TOP_LEVEL_DECL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s/gm;

function topLevelBoundaries(src) {
  TOP_LEVEL_DECL.lastIndex = 0;
  const starts = [];
  let m;
  while ((m = TOP_LEVEL_DECL.exec(src))) starts.push(m.index);
  starts.push(src.length);
  return starts;
}

function transformSourceFile(file) {
  const original = readFileSync(file, 'utf8');
  const imported = rewriteImport(original);
  if (!imported.changed) return null;

  let src = imported.src;
  const targets = [];
  const boundaries = topLevelBoundaries(src);

  for (const pattern of DECL_PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(src))) {
      const bodyOpen = findBodyBrace(src, m.index);
      if (bodyOpen === -1) continue;
      // Portee = jusqu'a la declaration de premier niveau suivante.
      const bodyClose = boundaries.find((b) => b > m.index) ?? src.length;
      const body = src.slice(bodyOpen, bodyClose);
      if (!USES_MESSAGE.test(body)) continue;
      if (targets.some((t) => t.open === bodyOpen)) continue;
      targets.push({ name: m[1], open: bodyOpen, close: bodyClose });
    }
  }

  if (targets.length === 0) {
    // `message` importe mais jamais appele : import mort. On le retire sans
    // introduire App.useApp(), qui n'aurait aucun appelant.
    if (!USES_MESSAGE.test(original)) {
      const cleaned = rewriteImport(original, false);
      if (!DRY) writeFileSync(file, cleaned.src);
      return { file, unusedImport: true };
    }
    return { file, error: 'aucun composant englobant trouve pour message.*' };
  }

  // Insertion de la fin vers le debut, pour que les index restent valides.
  targets.sort((a, b) => b.open - a.open);
  for (const t of targets) {
    src = src.slice(0, t.open + 1) + `\n  const { message } = App.useApp();\n` + src.slice(t.open + 1);
  }

  if (!DRY) writeFileSync(file, src);
  return { file, components: targets.map((t) => t.name).reverse() };
}

// ---------------------------------------------------------------------------
// Mode --tests
// ---------------------------------------------------------------------------

/**
 * Les mocks `vi.mock('antd', …)` sont ecrits a la main et n'exportent pas
 * `App`. On enveloppe l'objet retourne pour y ajouter `App.useApp()`, en
 * reutilisant le `message` deja mocke : les espions sur lesquels les tests
 * s'appuient gardent leur identite.
 */
function transformTestFile(file) {
  const src = readFileSync(file, 'utf8');
  const mockAt = src.search(/vi\.mock\(\s*['"]antd['"]/);
  if (mockAt === -1) return null;
  if (/App:\s*\{/.test(src)) return { file, skipped: 'App deja mocke' };

  const factoryOpen = src.indexOf('{', src.indexOf('=>', mockAt));
  const factoryClose = matchBrace(src, factoryOpen);
  const returnAt = src.indexOf('\n  return {', factoryOpen);
  if (returnAt === -1 || returnAt > factoryClose) {
    return { file, error: 'bloc `return {` du mock antd introuvable' };
  }

  const objOpen = src.indexOf('{', returnAt);
  const objClose = matchBrace(src, objOpen);
  const objBody = src.slice(objOpen, objClose + 1);

  const replacement =
    `\n  const antdMock: Record<string, unknown> = ${objBody};\n` +
    `  const appApi = {\n` +
    `    message: antdMock.message ?? { success() {}, error() {}, warning() {}, info() {}, loading() {} },\n` +
    `    modal: { confirm() {}, info() {}, warning() {}, error() {}, success() {} },\n` +
    `    notification: { open() {}, success() {}, error() {}, warning() {}, info() {} },\n` +
    `  };\n` +
    `  return { ...antdMock, App: { useApp: () => appApi } };`;

  // On remplace de `\n  return {` jusqu'au `}` de l'objet.
  let out = src.slice(0, returnAt) + replacement + src.slice(objClose + 1);
  // Le `;` eventuel qui suivait l'objet est desormais en trop.
  out = out.replace(
    /return \{ \.\.\.antdMock, App: \{ useApp: \(\) => appApi \} \};;/,
    'return { ...antdMock, App: { useApp: () => appApi } };'
  );

  if (!DRY) writeFileSync(file, out);
  return { file, patched: true };
}

// ---------------------------------------------------------------------------

const files = walk(SRC);
const results = [];
const errors = [];

for (const f of files) {
  const isTest = /__tests__|\.test\.tsx?$|\.spec\.tsx?$/.test(f);
  if (MODE === 'tests' !== isTest) continue;

  const r = MODE === 'tests' ? transformTestFile(f) : transformSourceFile(f);
  if (!r) continue;
  if (r.error) errors.push(r);
  else results.push(r);
}

for (const r of results) {
  if (VERBOSE || MODE === 'tests') {
    const detail = r.components
      ? ` — ${r.components.join(', ')}`
      : r.unusedImport
        ? ' — import mort retire'
        : r.skipped
          ? ` — ${r.skipped}`
          : '';
    console.log(`  ${rel(r.file)}${detail}`);
  }
}
for (const e of errors) console.log(`  ECHEC ${rel(e.file)} — ${e.error}`);

console.log(
  `\n[${MODE}] ${results.length} fichier(s) transforme(s), ${errors.length} echec(s)` +
    (DRY ? ' (--dry : rien ecrit)' : '')
);
process.exit(errors.length > 0 ? 1 : 0);
