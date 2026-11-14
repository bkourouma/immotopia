#!/usr/bin/env node
/**
 * Controle de couverture de l'aide interne (`npm run help:check`).
 *
 * Lit le contenu de `src/help/content/<module>/{routes,fr,en,ar}.ts` (transpile
 * avec TypeScript puis importe : ces fichiers n'ont que des imports de types) et
 * verifie :
 *   A. chaque `helpId` litteral du code existe dans le fr.ts de son module ;
 *   B. chaque identifiant fr existe en en et en ar (et inversement) ;
 *   C. chaque `helpId` des routes existe en fr ; chaque motif commence par `/` ;
 *   D. identifiants uniques, bien formes, premier segment = dossier du module ;
 *   E. routes de l'application (src/App.tsx) sans fiche de page (avertissement).
 *
 * Usage :
 *   node scripts/help-coverage.mjs [--strict] [--quiet] [--root=<dossier>]
 *
 * Code de sortie 1 sur toute erreur A-D ; E ne bloque qu'avec --strict.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/* ---------------------------------------------------------------- options */

let ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let STRICT = false;
let QUIET = false;
for (const arg of process.argv.slice(2)) {
  if (arg === '--strict') STRICT = true;
  else if (arg === '--quiet') QUIET = true;
  else if (arg.startsWith('--root=')) ROOT = path.resolve(arg.slice('--root='.length));
  else {
    console.error(`Option inconnue : ${arg}`);
    process.exit(2);
  }
}
const SRC = path.join(ROOT, 'src');
const CONTENT = path.join(SRC, 'help', 'content');
const LANGS = ['fr', 'en', 'ar'];

/** Meme regex que `HELP_ID_PATTERN` de src/help/types.ts. */
const HELP_ID_PATTERN = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;

/**
 * Routes sans fiche d'aide voulue (ecrans publics sans coquille). Un `*` final
 * veut dire « tout ce qui commence par ». A editer ici.
 */
const IGNORED_ROUTES = [
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/auth/*',
  '/newsletter/*',
  '/rapport-proprietaire',
  '/payer*',
  '/payer-charges*',
  '/acces-partage',
  '/signer/:token',
  '/ag-direct',
  '/atelier/*'
];

/* ---------------------------------------------------------------- sortie */

let errorCount = 0;
let warningCount = 0;
const rel = file => path.relative(ROOT, file).split(path.sep).join('/');

function section(title) {
  if (!QUIET) console.log(`\n${title}`);
}
function ok(message) {
  if (!QUIET) console.log(`  OK            ${message}`);
}
function error(message) {
  errorCount += 1;
  console.log(`  ERREUR        ${message}`);
}
function warn(message) {
  warningCount += 1;
  if (!QUIET || STRICT) console.log(`  AVERTISSEMENT ${message}`);
}
function info(message) {
  if (!QUIET) console.log(`                ${message}`);
}

/* ---------------------------------------------------------------- lecture */

async function loadTsModule(file) {
  const source = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: file
  });
  const url = `data:text/javascript;base64,${Buffer.from(outputText, 'utf8').toString('base64')}`;
  return import(url);
}

function listModules() {
  const indexFile = path.join(CONTENT, 'index.ts');
  if (fs.existsSync(indexFile)) {
    const match = /HELP_MODULES[^=]*=\s*\[([\s\S]*?)\]/.exec(fs.readFileSync(indexFile, 'utf8'));
    if (match) {
      const names = [...match[1].matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]);
      if (names.length) return names;
    }
  }
  if (!fs.existsSync(CONTENT)) return [];
  return fs
    .readdirSync(CONTENT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
}

/** Charge routes + fr/en/ar d'un module ; les problemes de lecture sont des erreurs. */
async function loadModule(name) {
  const result = { name, routes: [], entries: { fr: [], en: [], ar: [] } };
  const routesFile = path.join(CONTENT, name, 'routes.ts');
  if (!fs.existsSync(routesFile)) {
    error(`${name} : fichier absent : ${rel(routesFile)}`);
  } else {
    try {
      const mod = await loadTsModule(routesFile);
      if (Array.isArray(mod.routes)) result.routes = mod.routes;
      else error(`${rel(routesFile)} : l'export \`routes\` doit etre un tableau`);
    } catch (e) {
      error(`${rel(routesFile)} : lecture impossible (${e.message})`);
    }
  }
  for (const lang of LANGS) {
    const file = path.join(CONTENT, name, `${lang}.ts`);
    if (!fs.existsSync(file)) {
      error(`${name} : fichier absent : ${rel(file)}`);
      continue;
    }
    try {
      const mod = await loadTsModule(file);
      if (Array.isArray(mod.default)) result.entries[lang] = mod.default;
      else error(`${rel(file)} : l'export par defaut doit etre un tableau`);
    } catch (e) {
      error(`${rel(file)} : lecture impossible (${e.message})`);
    }
  }
  return result;
}

function idsOf(entries) {
  return entries.map(entry => (entry && typeof entry.id === 'string' ? entry.id : null));
}

/* ---------------------------------------------------------------- fichiers source */

function collectSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      // `help/` porte les composants et le contrat (props `helpId`, exemples) :
      // ce ne sont pas des ecrans documentes.
      if (path.relative(SRC, full).split(path.sep).join('/') === 'help') continue;
      collectSourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const HELP_ID_LITERALS = [
  /\bhelpId\s*=\s*"([^"\n]+)"/g,
  /\bhelpId\s*=\s*\{\s*(?:'([^'\n]+)'|"([^"\n]+)"|`([^`$\n]+)`)\s*\}/g,
  /\bhelpId\s*:\s*(?:'([^'\n]+)'|"([^"\n]+)"|`([^`$\n]+)`)/g
];

function findHelpIdUsages(file) {
  const text = fs.readFileSync(file, 'utf8');
  const usages = [];
  for (const regex of HELP_ID_LITERALS) {
    for (const match of text.matchAll(regex)) {
      const id = match.slice(1).find(value => value !== undefined);
      const lineStart = text.lastIndexOf('\n', match.index) + 1;
      const prefix = text.slice(lineStart, match.index).trim();
      if (prefix.startsWith('//') || prefix.startsWith('*') || prefix.startsWith('/*')) continue;
      const line = text.slice(0, match.index).split('\n').length;
      usages.push({ id, line });
    }
  }
  return usages;
}

/* ---------------------------------------------------------------- routes de l'application */

const normalizePattern = pattern => {
  const stripped = pattern.replace(/\/\*$/, '').replace(/\/+$/, '') || '/';
  return stripped.replace(/:[A-Za-z0-9_]+/g, ':p');
};

function isIgnoredRoute(route) {
  return IGNORED_ROUTES.some(rule => {
    if (rule.endsWith('*'))
      return route.startsWith(rule.slice(0, -1)) || route === rule.slice(0, -1).replace(/\/$/, '');
    return route === rule;
  });
}

function jsxName(node) {
  const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return tag.getText();
}

function readRouteTree(file) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const routes = new Set();
  const join = (parent, child) => {
    if (child.startsWith('/')) return child;
    return `${parent === '/' ? '' : parent}/${child}`.replace(/\/+$/, '') || '/';
  };

  function visit(node, parent) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (jsxName(node) === 'Route') {
        const attrs = (ts.isJsxElement(node) ? node.openingElement : node).attributes.properties;
        let pathValue = null;
        let isIndex = false;
        let element = null;
        for (const attr of attrs) {
          if (!ts.isJsxAttribute(attr)) continue;
          const name = attr.name.getText();
          if (name === 'path' && attr.initializer) {
            if (ts.isStringLiteral(attr.initializer)) pathValue = attr.initializer.text;
            else if (
              ts.isJsxExpression(attr.initializer) &&
              attr.initializer.expression &&
              ts.isStringLiteralLike(attr.initializer.expression)
            ) {
              pathValue = attr.initializer.expression.text;
            }
          } else if (name === 'index') isIndex = true;
          else if (name === 'element' && attr.initializer && ts.isJsxExpression(attr.initializer)) {
            element = attr.initializer.expression ?? null;
          }
        }
        const full = pathValue !== null ? join(parent, pathValue) : parent;
        const children = ts.isJsxElement(node) ? node.children : [];
        const hasRouteChildren = children.some(
          child => (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) && jsxName(child) === 'Route'
        );
        const redirect =
          element &&
          (ts.isJsxElement(element) || ts.isJsxSelfClosingElement(element)) &&
          ['Navigate', 'TenantRedirect'].includes(jsxName(element));
        // Une route de mise en page (qui a des enfants) n'est pas un ecran : son
        // `index` enfant porte le meme chemin.
        const counts = (pathValue !== null || isIndex) && !hasRouteChildren && !redirect && pathValue !== '*';
        if (counts) routes.add(full);
        for (const child of children) visit(child, full);
        return;
      }
    }
    ts.forEachChild(node, child => visit(child, parent));
  }
  visit(source, '/');
  return [...routes];
}

function groupKey(route) {
  const parts = route.split('/').filter(Boolean);
  if (parts[0] === 'tenant' && parts.length >= 3) return `/tenant/:tenantId/${parts[2]}`;
  return `/${parts[0] ?? ''}`;
}

/* ---------------------------------------------------------------- principal */

const modules = listModules();
const loaded = [];
for (const name of modules) loaded.push(await loadModule(name));
const byName = new Map(loaded.map(mod => [mod.name, mod]));
const frIdsByModule = new Map(loaded.map(mod => [mod.name, new Set(idsOf(mod.entries.fr).filter(Boolean))]));
const totalFr = loaded.reduce((sum, mod) => sum + mod.entries.fr.length, 0);
const totalRoutes = loaded.reduce((sum, mod) => sum + mod.routes.length, 0);

if (!QUIET) {
  console.log(`Aide interne : ${modules.length} modules, ${totalFr} fiches fr, ${totalRoutes} routes.`);
}

// --- A. helpId du code
section('A. Identifiants utilises dans le code');
{
  const before = errorCount;
  let usageCount = 0;
  const files = fs.existsSync(SRC) ? collectSourceFiles(SRC) : [];
  for (const file of files) {
    for (const { id, line } of findHelpIdUsages(file)) {
      usageCount += 1;
      const where = `${rel(file)}:${line}`;
      const moduleName = id.split('.')[0];
      if (!byName.has(moduleName)) {
        error(`${where} : helpId « ${id} » : module « ${moduleName} » inconnu`);
      } else if (!frIdsByModule.get(moduleName).has(id)) {
        error(`${where} : helpId « ${id} » absent de content/${moduleName}/fr.ts`);
      }
    }
  }
  if (errorCount === before) ok(`${usageCount} helpId litteraux, tous documentes`);
}

// --- B. coherence des langues
section('B. Coherence fr / en / ar');
{
  const before = errorCount;
  for (const mod of loaded) {
    const fr = new Set(idsOf(mod.entries.fr).filter(Boolean));
    for (const lang of ['en', 'ar']) {
      const other = new Set(idsOf(mod.entries[lang]).filter(Boolean));
      const missing = [...fr].filter(id => !other.has(id));
      const extra = [...other].filter(id => !fr.has(id));
      if (missing.length) error(`${mod.name} : ${missing.length} id absents de ${lang}.ts : ${missing.join(', ')}`);
      if (extra.length) error(`${mod.name} : ${extra.length} id de ${lang}.ts absents de fr.ts : ${extra.join(', ')}`);
    }
  }
  if (errorCount === before) ok('memes identifiants dans les trois langues');
}

// --- C. routes
section('C. Routes declarees');
{
  const before = errorCount;
  for (const mod of loaded) {
    const fr = frIdsByModule.get(mod.name);
    for (const route of mod.routes) {
      const label = `${mod.name}/routes.ts`;
      if (!route || typeof route.pattern !== 'string' || typeof route.helpId !== 'string') {
        error(`${label} : route mal formee (pattern et helpId attendus)`);
        continue;
      }
      if (!route.pattern.startsWith('/')) error(`${label} : le motif « ${route.pattern} » doit commencer par /`);
      if (!fr.has(route.helpId))
        error(`${label} : « ${route.pattern} » pointe vers « ${route.helpId} » absent de fr.ts`);
    }
  }
  if (errorCount === before) ok(`${totalRoutes} routes valides`);
}

// --- D. identifiants
section('D. Identifiants : unicite et forme');
{
  const before = errorCount;
  const seenAll = new Map();
  for (const mod of loaded) {
    for (const lang of LANGS) {
      const seen = new Set();
      mod.entries[lang].forEach((entry, index) => {
        const where = `${mod.name}/${lang}.ts #${index + 1}`;
        if (!entry || typeof entry.id !== 'string') {
          error(`${where} : entree sans identifiant`);
          return;
        }
        const id = entry.id;
        if (!HELP_ID_PATTERN.test(id)) error(`${where} : identifiant mal forme « ${id} »`);
        if (id.split('.')[0] !== mod.name) error(`${where} : « ${id} » ne commence pas par « ${mod.name} »`);
        if (seen.has(id)) error(`${where} : identifiant en double « ${id} »`);
        seen.add(id);
        if (lang === 'fr') {
          if (seenAll.has(id) && seenAll.get(id) !== mod.name) {
            error(`${where} : « ${id} » deja defini dans le module ${seenAll.get(id)}`);
          }
          seenAll.set(id, mod.name);
        }
      });
    }
  }
  if (errorCount === before) ok(`${totalFr} identifiants uniques et bien formes`);
}

// --- E. couverture des routes
section("E. Routes de l'application sans fiche");
{
  const appFile = path.join(SRC, 'App.tsx');
  if (!fs.existsSync(appFile)) {
    info('src/App.tsx absent : controle ignore.');
  } else {
    const all = readRouteTree(appFile);
    const relevant = all.filter(route => !isIgnoredRoute(route));
    const covered = new Set(
      loaded
        .flatMap(mod => mod.routes)
        .filter(r => r && typeof r.pattern === 'string')
        .map(r => normalizePattern(r.pattern))
    );
    const missing = relevant.filter(route => !covered.has(normalizePattern(route))).sort();
    const done = relevant.length - missing.length;
    info(
      `${all.length} routes trouvees, ${all.length - relevant.length} ignorees (IGNORED_ROUTES), ${relevant.length} a couvrir.`
    );
    if (missing.length === 0) ok(`${done}/${relevant.length} routes couvertes`);
    else {
      warn(`${done}/${relevant.length} routes couvertes, ${missing.length} sans fiche de page`);
      if (!QUIET || STRICT) {
        const groups = new Map();
        for (const route of missing) {
          const key = groupKey(route);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(route);
        }
        for (const [key, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
          console.log(`    ${key}  (${list.length})`);
          for (const route of list) console.log(`      ${route}`);
        }
      }
    }
    if (STRICT && missing.length) errorCount += 1;
  }
}

/* ---------------------------------------------------------------- resume */

console.log(
  `\nResume : ${errorCount} erreur(s), ${warningCount} avertissement(s)` +
    `${STRICT ? ' (mode --strict : les routes non couvertes sont bloquantes)' : ''}.`
);
process.exit(errorCount > 0 ? 1 : 0);
