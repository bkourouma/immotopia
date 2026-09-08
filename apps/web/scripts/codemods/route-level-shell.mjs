#!/usr/bin/env node
/**
 * Codemod — la coquille remonte au niveau route (REFONTE_UI_UX.md §4.1).
 *
 * Deux transformations, indépendantes, sélectionnées par argument :
 *
 *   --pages   retire `DashboardLayout` des pages qui le rendent elles-mêmes.
 *             81 pages l'importaient et l'instanciaient à l'intérieur de leur
 *             propre `return`, ce qui remontait la coquille entière à chaque
 *             navigation. L'enveloppe devient un fragment ; c'est `<AppShell>`
 *             qui la fournit désormais, une fois pour toutes.
 *
 *   --routes  regroupe les routes d'`App.tsx` sous des routes parentes portant
 *             `<AppShell/>`. Les blocs sont classés par garde :
 *               - authentifié simple
 *               - authentifié + agence (`/tenant/:tenantId/*` -> requireTenant)
 *               - authentifié + SUPER_ADMIN
 *             Le regroupement est ce qui rend `requireTenant` activable en un
 *             seul endroit, au lieu de 63 routes à annoter une par une.
 *
 * Options : --dry (n'écrit rien), --verbose
 *
 * Usage : node scripts/codemods/route-level-shell.mjs --pages [--dry]
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(WEB_ROOT, 'src');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const VERBOSE = argv.includes('--verbose');
const MODE = argv.includes('--routes') ? 'routes' : 'pages';

const rel = p => p.split(sep).join('/').replace(WEB_ROOT.split(sep).join('/') + '/', '');

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(p, acc);
    } else if (/\.tsx$/.test(entry.name)) acc.push(p);
  }
  return acc;
}

// ---------------------------------------------------------------------------
// --pages
// ---------------------------------------------------------------------------

function transformPage(file) {
  const original = readFileSync(file, 'utf8');
  if (!/DashboardLayout/.test(original)) return null;

  const r = rel(file);
  // Le composant lui-même n'est pas une page ; la coquille le cite dans sa
  // documentation ; les tests le mockent volontairement.
  if (/dashboard-layout\.tsx$/.test(r)) return null;
  if (r.startsWith('src/components/shell/')) return null;
  if (r.includes('__tests__')) return null;

  let src = original;

  // 1. l'import disparaît
  src = src.replace(/^import \{ DashboardLayout \} from ['"][^'"]*dashboard-layout['"];\r?\n/m, '');

  // 2. l'enveloppe devient un fragment. On ne supprime pas les balises : une
  //    page dont le `return` a plusieurs enfants deviendrait invalide.
  const opens = (src.match(/<DashboardLayout>/g) || []).length;
  const closes = (src.match(/<\/DashboardLayout>/g) || []).length;
  if (opens !== closes) {
    return { file, error: `balises desequilibrees : ${opens} ouvrantes, ${closes} fermantes` };
  }
  src = src.replace(/<DashboardLayout>/g, '<>').replace(/<\/DashboardLayout>/g, '</>');

  if (/DashboardLayout/.test(src)) {
    return { file, error: 'une occurrence de DashboardLayout subsiste' };
  }
  if (src === original) return null;

  if (!DRY) writeFileSync(file, src);
  return { file, wrappers: opens };
}

// ---------------------------------------------------------------------------
// --routes
// ---------------------------------------------------------------------------

/**
 * Bloc de route protégée, dans la forme unique qu'emploie `App.tsx` :
 *
 *   <Route
 *     path="X"
 *     element={
 *       <ProtectedRoute[ props]>
 *         <Page />
 *       </ProtectedRoute>
 *     }
 *   />
 */
const ROUTE_BLOCK =
  /[ \t]*<Route\r?\n[ \t]*path="([^"]+)"\r?\n[ \t]*element=\{\r?\n[ \t]*<ProtectedRoute([^>]*)>\r?\n([\s\S]*?)\r?\n[ \t]*<\/ProtectedRoute>\r?\n[ \t]*\}\r?\n[ \t]*\/>\r?\n/g;

function transformRoutes() {
  const file = join(SRC, 'App.tsx');
  const original = readFileSync(file, 'utf8');

  const groups = { simple: [], tenant: [], admin: [] };
  let matched = 0;

  const stripped = original.replace(ROUTE_BLOCK, (_all, path, props, body) => {
    matched++;
    const element = body.trim();
    const bucket = props.includes('SUPER_ADMIN')
      ? 'admin'
      : path.startsWith('/tenant/:tenantId')
        ? 'tenant'
        : 'simple';
    groups[bucket].push({ path, element });
    return '';
  });

  if (matched === 0) return { error: 'aucun bloc de route protegee reconnu' };

  const routeLine = r => `                    <Route path="${r.path}" element={${r.element}} />`;

  const block = (comment, guard, routes) =>
    routes.length === 0
      ? ''
      : `                  {/* ${comment} */}\n` +
        `                  <Route\n` +
        `                    element={\n` +
        `                      <ProtectedRoute${guard}>\n` +
        `                        <AppShell />\n` +
        `                      </ProtectedRoute>\n` +
        `                    }\n` +
        `                  >\n` +
        routes.map(routeLine).join('\n') +
        `\n                  </Route>\n`;

  const inserted =
    block(
      'Coquille — routes authentifiees. <AppShell> est monte UNE fois et persiste\n                      d un ecran a l autre : c est ce que <Outlet/> apporte, la ou les 81 pages\n                      remontaient DashboardLayout a chaque navigation (§4.1).',
      '',
      groups.simple
    ) +
    block(
      "Coquille — routes d'agence. requireTenant est active ICI, en un seul point,\n                      au lieu de " +
        groups.tenant.length +
        " routes a annoter une par une. La prop existait mais\n                      n etait passee nulle part : les routes /tenant/:tenantId/* ne verifiaient\n                      pas que l agence de l URL etait celle de l utilisateur (§4.1).",
      ' requireTenant',
      groups.tenant
    ) +
    block('Coquille — administration de la plateforme.', ' requiredRole="SUPER_ADMIN"', groups.admin);

  // Insertion à l'emplacement du premier bloc consommé, repéré par le marqueur
  // laissé par `App.tsx` juste avant la première route protégée.
  const anchor = '                  <Route path="/newsletter/subscribe" element={<SubscribePage />} />\n';
  if (!stripped.includes(anchor)) return { error: 'ancre d insertion introuvable' };

  let out = stripped.replace(anchor, anchor + inserted);
  out = out.replace(
    "import { NotFound } from './components/primitives/NotFound';",
    "import { NotFound } from './components/primitives/NotFound';\nimport { AppShell } from './components/shell/AppShell';"
  );
  // Les lignes vides laissées par le retrait des blocs.
  out = out.replace(/\n{3,}/g, '\n\n');

  if (!DRY) writeFileSync(file, out);
  return {
    matched,
    simple: groups.simple.length,
    tenant: groups.tenant.length,
    admin: groups.admin.length
  };
}

// ---------------------------------------------------------------------------

if (MODE === 'pages') {
  const results = [];
  const errors = [];
  for (const f of walk(SRC)) {
    const r = transformPage(f);
    if (!r) continue;
    if (r.error) errors.push(r);
    else results.push(r);
  }
  if (VERBOSE) results.forEach(r => console.log(`  ${rel(r.file)} — ${r.wrappers} enveloppe(s)`));
  errors.forEach(e => console.log(`  ECHEC ${rel(e.file)} — ${e.error}`));
  console.log(
    `\n[pages] ${results.length} fichier(s) transforme(s), ${errors.length} echec(s)` +
      (DRY ? ' (--dry)' : '')
  );
  process.exit(errors.length > 0 ? 1 : 0);
} else {
  const r = transformRoutes();
  if (r.error) {
    console.log(`  ECHEC — ${r.error}`);
    process.exit(1);
  }
  console.log(
    `\n[routes] ${r.matched} routes regroupees : ${r.simple} authentifiees, ` +
      `${r.tenant} d agence (requireTenant), ${r.admin} plateforme` +
      (DRY ? ' (--dry)' : '')
  );
}
