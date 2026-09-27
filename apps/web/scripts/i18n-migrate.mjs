/**
 * Reprise i18n des ecrans deja ecrits.
 *
 * Enveloppe les textes francais des composants dans `t('...')` et alimente les
 * catalogues `src/i18n/locales/<langue>/<module>.json`.
 *
 * Le script travaille sur l'AST TypeScript mais **n'imprime jamais l'arbre** :
 * il collecte des remplacements par decalage et les applique sur le texte
 * source. Un `printer.printFile()` aurait reformate les 328 fichiers de fond en
 * comble et noye la reprise dans un diff illisible.
 *
 *   node scripts/i18n-migrate.mjs --dry                  analyse sans rien ecrire
 *   node scripts/i18n-migrate.mjs                        applique + catalogues
 *   node scripts/i18n-migrate.mjs --only=pages/finance   restreint le perimetre
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const LOCALES = path.join(SRC, 'i18n', 'locales');
const TARGET_LANGUAGES = ['en', 'ar'];

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const ONLY = (argv.find(a => a.startsWith('--only=')) || '').slice('--only='.length);

/* ------------------------------------------------------------------ fichiers */

// `dev/` est hors produit : atelier de verification visuelle et comptes de
// demonstration, dont les libelles sont des noms propres et des personas
// techniques que traduire n'aurait aucun sens.
const SKIP_DIRS = new Set(['node_modules', 'i18n', '__tests__', 'assets', 'dev']);

function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Catalogue d'accueil d'une chaine, deduit du chemin de son fichier. */
const MODULE_BY_SEGMENT = {
  properties: 'properties',
  rental: 'rental',
  finance: 'finance',
  crm: 'crm',
  syndics: 'syndic',
  patrimoine: 'patrimoine',
  maintenance: 'maintenance',
  communication: 'communication',
  newsletter: 'newsletter',
  tenant: 'portal',
  TenantPortal: 'portal',
  OwnerPortal: 'portal',
  settings: 'settings',
  admin: 'admin',
  auth: 'auth',
  documents: 'documents',
  shell: 'common',
  home: 'common',
  primitives: 'common',
  ui: 'common'
};

function moduleOf(file) {
  const rel = path.relative(SRC, file).split(path.sep);
  for (const segment of rel) {
    if (MODULE_BY_SEGMENT[segment]) return MODULE_BY_SEGMENT[segment];
  }
  const base = path.basename(file, path.extname(file));
  if (/^(Login|Register|VerifyEmail|ForgotPassword|ResetPassword|AuthCallback|AcceptInvite)/.test(base)) return 'auth';
  return 'common';
}

/* ---------------------------------------------------------------- heuristique */

/** Attributs JSX dont la valeur est du texte lu par un humain. */
const TEXT_ATTRIBUTES = new Set([
  'title', 'label', 'placeholder', 'description', 'message', 'tooltip', 'alt', 'aria-label',
  'aria-description', 'okText', 'cancelText', 'subTitle', 'header', 'emptyText', 'addonBefore',
  'addonAfter', 'help', 'suffix', 'prefixText', 'confirmText', 'buttonText', 'submitText',
  'checkedChildren', 'unCheckedChildren', 'notFoundContent', 'searchPlaceholder', 'okTitle',
  'tip', 'headerTitle', 'summary', 'caption', 'legend', 'unit', 'suffixLabel', 'actionLabel'
]);

/** Attributs JSX dont la valeur est technique, quelle qu'elle soit. */
const CODE_ATTRIBUTES = new Set([
  'className', 'style', 'key', 'id', 'name', 'type', 'htmlType', 'dataIndex', 'href', 'to', 'path',
  'src', 'format', 'valueFormat', 'color', 'size', 'variant', 'shape', 'status', 'align', 'justify',
  'direction', 'placement', 'trigger', 'mode', 'rowKey', 'span', 'flex', 'gap', 'width', 'height',
  'target', 'rel', 'accept', 'action', 'method', 'autoComplete', 'inputMode', 'pattern', 'role',
  'data-testid', 'testId', 'theme', 'layout', 'labelAlign', 'position', 'orientation', 'icon',
  'fill', 'stroke', 'dataKey', 'xAxisId', 'yAxisId', 'stackId', 'nameKey', 'valueKey', 'as',
  'component', 'locale', 'lang', 'dir', 'picker', 'valuePropName', 'namePath', 'preserve', 'crossOrigin',
  // Geometrie SVG. `d` surtout : le trace d'une icone (`M12 5.38c1.62 0 ...`)
  // passe l'heuristique — majuscules, espaces, chiffres — et se retrouvait
  // dans les catalogues a traduire.
  'd', 'viewBox', 'points', 'transform', 'clipPath', 'fillRule', 'clipRule', 'strokeWidth',
  'strokeLinecap', 'strokeLinejoin', 'offset', 'gradientUnits', 'patternUnits', 'preserveAspectRatio'
]);

/** Proprietes d'objet portant du texte affiche. */
const TEXT_PROPERTIES = new Set([
  'label', 'title', 'message', 'description', 'placeholder', 'tooltip', 'okText', 'cancelText',
  'subTitle', 'header', 'help', 'text', 'content', 'emptyText', 'caption', 'summary', 'hint',
  'errorMessage', 'successMessage', 'warningMessage', 'confirmText', 'buttonText', 'legend',
  'headerTitle', 'subtitle', 'heading', 'reason', 'note', 'unit'
]);

/** Appels dont les arguments textuels ne sont jamais du contenu. */
const CODE_CALLEES = [
  'navigate', 'require', 'clsx', 'cn', 'classNames', 'twMerge', 'getItem', 'setItem', 'removeItem',
  'querySelector', 'querySelectorAll', 'getElementById', 'createElement', 'setAttribute',
  'getAttribute', 'addEventListener', 'removeEventListener', 'parseInt', 'parseFloat', 'Number',
  'startsWith', 'endsWith', 'includes', 'split', 'match', 'test', 'setProperty', 'format',
  'useTranslation', 't', 'translate', 'localeCompare', 'get', 'post', 'put', 'patch', 'delete',
  // `sumItemsByLabelPrefix` (owner-statement-helpers.ts) compare son argument
  // au libelle brut, toujours en francais, qu'un relevé genere cote serveur :
  // ce n'est pas du texte affiche, et le traduire casserait le `.startsWith()`.
  'sumItemsByLabelPrefix'
];

/**
 * Noms propres et jetons techniques : ils s'ecrivent pareil dans les trois
 * langues, et les enrober dans `t()` n'ajouterait qu'un aller-retour inutile
 * dans les catalogues.
 */
const NEVER_TRANSLATED = new Set([
  'ImmoTopia',
  'WhatsApp',
  'Google',
  'Twilio',
  'Excel',
  'Wave',
  'User-Agent',
  'Orange Money',
  'Moov Money',
  'MTN Mobile Money'
]);

function looksTranslatable(text, strict) {
  const value = text.trim();
  if (NEVER_TRANSLATED.has(value)) return false;
  // Jeton opaque : un identifiant d'exemple (HXxxx...), pas une phrase.
  if (/^[A-Z]{2}x{8,}$/.test(value)) return false;
  if (value.length < 2) return false;
  if (!/[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]/.test(value)) return false;
  if (/^https?:|^mailto:|^tel:/.test(value)) return false;
  if (/^[/#.$]/.test(value)) return false;
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return false;
  if (/^[A-Z0-9_]{2,}$/.test(value)) return false; // ENUM_VALUE
  if (/^\d+(px|rem|em|%|vh|vw|s|ms)?$/.test(value)) return false;
  if (/\bvar\(--/.test(value)) return false; // valeur CSS
  if (/^[\d\s.,]+$/.test(value)) return false;
  // Motif de date dayjs : 'DD/MM/YYYY', 'YYYY-MM-DD HH:mm'
  if (/^[DMYHhmsAaZzWwQ\d\s:/,.\-[\]()]+$/.test(value) && /[DMY]{2}/.test(value)) return false;

  const hasAccent = /[\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]/.test(value);
  const hasSpace = /\s/.test(value);

  if (strict) {
    if (hasAccent) return true;
    if (hasSpace && /^[A-Z\u00C0-\u00DD]/.test(value)) return true;
    return false;
  }

  if (hasAccent) return true;
  // Mot isole : un libelle de bouton en est souvent un. La regle accepte
  // l'apostrophe et le trait d'union — sans eux, « S'inscrire » et
  // « Aujourd'hui » restaient en francais dans les deux autres langues.
  if (!hasSpace) return /^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+$/.test(value);
  // Phrase ASCII entierement en minuscules : valeur CSS composee, identifiant.
  if (/^[a-z0-9\-\s]+$/.test(value)) return false;
  return true;
}

/* -------------------------------------------------------------------- contexte */

function ancestors(node) {
  const chain = [];
  let current = node.parent;
  while (current) {
    chain.push(current);
    current = current.parent;
  }
  return chain;
}

function enclosingAttributeName(node) {
  let current = node;
  while (current && current.parent) {
    const parent = current.parent;
    if (ts.isJsxAttribute(parent) && parent.initializer === current) return parent.name.getText();
    if (ts.isJsxExpression(parent) && parent.parent && ts.isJsxAttribute(parent.parent)) {
      return parent.parent.name.getText();
    }
    if (ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isStatement(parent)) break;
    current = parent;
  }
  return null;
}

/** Vrai si le noeud vit dans un objet de style en ligne (`style={{...}}`). */
function insideStyleObject(node) {
  for (const parent of ancestors(node)) {
    if (ts.isJsxAttribute(parent)) {
      const name = parent.name.getText();
      return name === 'style' || name === 'css' || name === 'sx';
    }
    if (ts.isPropertyAssignment(parent)) {
      const name = parent.name.getText().replace(/['"]/g, '');
      if (['style', 'css', 'sx', 'bodyStyle', 'headStyle', 'labelStyle', 'contentStyle'].includes(name)) return true;
    }
    if (ts.isVariableDeclaration(parent)) {
      return ts.isIdentifier(parent.name) && /[Ss]tyles?$/.test(parent.name.text);
    }
  }
  return false;
}

function calleeName(call) {
  const expression = call.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return '';
}

function childOf(parent, node) {
  let current = node;
  while (current.parent && current.parent !== parent) current = current.parent;
  return current;
}

/**
 * Vrai si `node` n'est enveloppe par AUCUNE fonction, methode ni classe : sa
 * valeur est donc calculee UNE SEULE FOIS, au chargement du module, et jamais
 * rejouee. `<LocalizedScreens>` (App.tsx) remonte l'arbre React a chaque
 * changement de langue, mais un remontage ne re-execute pas un module deja
 * importe : un `t('...')` pose ici resterait fige dans la langue active au
 * tout premier chargement du module, pour toute la session. Un appel `t()`
 * dans le corps d'une fonction, lui, est rejoue a chaque invocation — au
 * rendu, dans un `useMemo` recalcule par le remontage, etc. — et reste donc
 * sans danger.
 */
function isFrozenAtModuleScope(node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isGetAccessor(current) ||
      ts.isSetAccessor(current) ||
      ts.isConstructorDeclaration(current) ||
      ts.isClassDeclaration(current) ||
      ts.isClassExpression(current)
    ) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

/**
 * Renvoie 'yes' (position ou le texte est certainement affiche), 'maybe'
 * (position neutre — l'heuristique stricte tranche) ou 'no'.
 */
function positionVerdict(node) {
  if (isFrozenAtModuleScope(node)) return 'no';

  const chain = ancestors(node);

  for (const parent of chain) {
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isImportTypeNode(parent)) return 'no';
    if (ts.isLiteralTypeNode(parent) || ts.isTypeReferenceNode(parent) || ts.isTypeAliasDeclaration(parent)) return 'no';
    if (ts.isInterfaceDeclaration(parent) || ts.isEnumDeclaration(parent)) return 'no';
    if (ts.isCaseClause(parent) && parent.expression === childOf(parent, node)) return 'no';
  }

  const parent = node.parent;
  if (!parent) return 'no';

  // Cle d'objet, et non valeur.
  if (ts.isPropertyAssignment(parent) && parent.name === node) return 'no';
  if (ts.isComputedPropertyName(parent)) return 'no';
  if (ts.isPropertySignature(parent) || ts.isMethodSignature(parent)) return 'no';

  // Comparaison : status === 'ACTIVE'
  if (ts.isBinaryExpression(parent)) {
    const kind = parent.operatorToken.kind;
    if (
      kind === ts.SyntaxKind.EqualsEqualsToken ||
      kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      kind === ts.SyntaxKind.ExclamationEqualsToken ||
      kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
    ) {
      return 'no';
    }
  }

  if (insideStyleObject(node)) return 'no';

  // Argument d'un appel technique — on ne regarde que l'appel le plus proche.
  for (const ancestor of chain) {
    if (ts.isCallExpression(ancestor)) {
      // `console.error('Erreur de chargement', err)` s'adresse au developpeur,
      // pas a l'utilisateur : la console d'un navigateur n'est pas traduite.
      if (
        ts.isPropertyAccessExpression(ancestor.expression) &&
        ancestor.expression.expression.getText() === 'console'
      ) {
        return 'no';
      }
      if (CODE_CALLEES.includes(calleeName(ancestor))) return 'no';
      break;
    }
    if (ts.isJsxElement(ancestor) || ts.isJsxSelfClosingElement(ancestor)) break;
  }

  // Un litteral dans un `{...}` pose en ENFANT de JSX est du texte affiche :
  // c'est la forme d'un ternaire de libelle,
  // `{isSubmitting ? t('Envoi...') : "S'inscrire"}`. Sans cette regle, la
  // seconde branche restait en francais, l'heuristique stricte refusant un mot
  // isole sans accent.
  for (const ancestor of chain) {
    if (ts.isJsxExpression(ancestor)) {
      const parent = ancestor.parent;
      if (parent && ts.isJsxElement(parent)) {
        // `<style>{...}</style>` et `<script>{...}</script>` : du CSS ou du JS,
        // jamais un texte lu par un humain.
        const tagName = parent.openingElement.tagName.getText();
        if (tagName === 'style' || tagName === 'script') return 'no';
        return 'yes';
      }
      if (parent && ts.isJsxFragment(parent)) return 'yes';
      break;
    }
    if (ts.isJsxAttribute(ancestor) || ts.isJsxElement(ancestor) || ts.isJsxSelfClosingElement(ancestor)) break;
  }

  const attribute = enclosingAttributeName(node);
  if (attribute) {
    if (CODE_ATTRIBUTES.has(attribute)) return 'no';
    if (TEXT_ATTRIBUTES.has(attribute)) return 'yes';
    return 'maybe';
  }

  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    const name = parent.name.getText().replace(/['"]/g, '');
    if (CODE_ATTRIBUTES.has(name)) return 'no';
    if (TEXT_PROPERTIES.has(name)) return 'yes';
    return 'maybe';
  }

  // message.success('...'), notification.error({...}), Modal.confirm(...)
  if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)) {
    const receiver = parent.expression.expression.getText();
    if (/^(message|notification|modal|Modal|feedback)$/.test(receiver)) return 'yes';
  }

  return 'maybe';
}

/* ------------------------------------------------------------------- rendu `t` */

function quote(text) {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

function interpolationName(expression, used) {
  let base = 'value';
  if (ts.isIdentifier(expression)) base = expression.text;
  else if (ts.isPropertyAccessExpression(expression)) base = expression.name.text;
  base = base.replace(/[^A-Za-z0-9_]/g, '') || 'value';
  if (/^\d/.test(base)) base = `v${base}`;
  let name = base;
  let index = 2;
  while (used.has(name)) name = `${base}${index++}`;
  used.add(name);
  return name;
}

/* ------------------------------------------------------------------ traitement */

const report = { files: 0, changed: 0, errors: [] };
const catalogs = new Map(); // module -> Set(cle)

function record(moduleName, key) {
  if (!catalogs.has(moduleName)) catalogs.set(moduleName, new Set());
  catalogs.get(moduleName).add(key);
}

function processFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const moduleName = moduleOf(file);
  const edits = [];

  // `t` est-il deja un nom pris dans ce fichier ? (parametre de callback, etc.)
  let tIsTaken = false;
  const scanBindings = node => {
    if (
      (ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isBindingElement(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === 't'
    ) {
      tIsTaken = true;
    }
    ts.forEachChild(node, scanBindings);
  };
  scanBindings(sf);
  const fn = tIsTaken ? 'translate' : 't';

  const visit = node => {
    // Appel `t('...')` deja en place : on le recense sans y toucher. C'est ce
    // qui rend le script rejouable — sans cela, une seconde execution ne
    // trouverait plus rien a convertir et viderait les catalogues.
    if (ts.isCallExpression(node) && ['t', 'translate'].includes(calleeName(node))) {
      const [first] = node.arguments;
      if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
        record(moduleName, first.text);
      }
      node.arguments.slice(1).forEach(visit);
      return;
    }

    if (ts.isJsxText(node)) {
      const raw = source.slice(node.pos, node.end);
      const [, lead, body, trail] = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (body && !/&[a-zA-Z#0-9]+;/.test(body) && looksTranslatable(body, false)) {
        const key = body.replace(/\s*\n\s*/g, ' ').trim();
        if (!key.includes('{{')) {
          const before = lead && !lead.includes('\n') ? ' ' : '';
          const after = trail && !trail.includes('\n') ? ' ' : '';
          edits.push({ start: node.pos, end: node.end, text: `${before}{${fn}(${quote(key)})}${after}` });
          record(moduleName, key);
        }
      }
      return;
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const verdict = positionVerdict(node);
      if (verdict !== 'no' && looksTranslatable(node.text, verdict === 'maybe')) {
        const key = node.text.trim();
        if (!key.includes('{{')) {
          // `title="Navigation"` devient `title={t('Navigation')}` : la valeur
          // d'un attribut JSX n'accepte une expression qu'entre accolades.
          const inAttribute = ts.isJsxAttribute(node.parent) && node.parent.initializer === node;
          const call = `${fn}(${quote(key)})`;
          edits.push({
            start: node.getStart(sf),
            end: node.getEnd(),
            text: inAttribute ? `{${call}}` : call
          });
          record(moduleName, key);
        }
      }
      return;
    }

    if (ts.isTemplateExpression(node)) {
      const verdict = positionVerdict(node);
      if (verdict !== 'no') {
        const literalText = node.head.text + ' ' + node.templateSpans.map(span => span.literal.text).join(' ');
        if (looksTranslatable(literalText, verdict === 'maybe') && !literalText.includes('{{')) {
          const used = new Set();
          let key = node.head.text;
          const values = [];
          for (const span of node.templateSpans) {
            const name = interpolationName(span.expression, used);
            key += `{{${name}}}` + span.literal.text;
            values.push(`${name}: ${source.slice(span.expression.getStart(sf), span.expression.getEnd())}`);
          }
          const trimmedKey = key.trim();
          if (trimmedKey) {
            edits.push({
              start: node.getStart(sf),
              end: node.getEnd(),
              text: `${fn}(${quote(trimmedKey)}, { ${values.join(', ')} })`
            });
            record(moduleName, trimmedKey);
            return;
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sf, visit);

  if (edits.length === 0) return false;

  let output = source;
  edits.sort((a, b) => b.start - a.start);
  for (const edit of edits) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }

  if (!/from '[^']*i18n\/t'/.test(output)) {
    const relative = path.relative(path.dirname(file), path.join(SRC, 'i18n', 't')).split(path.sep).join('/');
    const specifier = relative.startsWith('.') ? relative : `./${relative}`;
    const statement = tIsTaken
      ? `import { t as translate } from '${specifier}';`
      : `import { t } from '${specifier}';`;

    const imports = sf.statements.filter(ts.isImportDeclaration);
    if (imports.length > 0) {
      const insertAt = imports[imports.length - 1].getEnd();
      output = output.slice(0, insertAt) + `\n${statement}` + output.slice(insertAt);
    } else {
      output = `${statement}\n` + output;
    }
  }

  if (!DRY) fs.writeFileSync(file, output, 'utf8');
  return true;
}

/* ------------------------------------------------------------------ catalogues */

function writeCatalogs() {
  for (const language of TARGET_LANGUAGES) {
    const dir = path.join(LOCALES, language);
    if (!DRY) fs.mkdirSync(dir, { recursive: true });
    for (const [moduleName, keys] of catalogs) {
      const target = path.join(dir, `${moduleName}.json`);
      const existing = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : {};
      const merged = {};
      for (const key of [...keys].sort((a, b) => a.localeCompare(b, 'fr'))) {
        // Une valeur vide vaut « a traduire » : `returnEmptyString: false`
        // renvoie alors la cle, c'est-a-dire le texte francais.
        merged[key] = existing[key] ?? '';
      }
      const orphans = Object.entries(existing).filter(([key, value]) => !(key in merged) && value);
      if (!DRY) {
        fs.writeFileSync(target, JSON.stringify(merged, null, 2) + '\n', 'utf8');
        const orphanFile = path.join(dir, `${moduleName}.orphans.json`);
        if (orphans.length) {
          fs.writeFileSync(orphanFile, JSON.stringify(Object.fromEntries(orphans), null, 2) + '\n', 'utf8');
        } else if (fs.existsSync(orphanFile)) {
          fs.rmSync(orphanFile);
        }
      }
    }
  }
}

/* ------------------------------------------------------------------------ main */

let files = collectFiles(SRC);
if (ONLY) files = files.filter(file => path.relative(SRC, file).split(path.sep).join('/').startsWith(ONLY));

for (const file of files) {
  report.files += 1;
  try {
    if (processFile(file)) report.changed += 1;
  } catch (error) {
    report.errors.push({ file: path.relative(ROOT, file), error: String(error) });
  }
}

writeCatalogs();

const totalKeys = [...catalogs.values()].reduce((sum, set) => sum + set.size, 0);
console.log(
  `${DRY ? '[analyse] ' : ''}${report.changed}/${report.files} fichiers touches, ` +
    `${totalKeys} cles distinctes dans ${catalogs.size} catalogues.`
);
for (const [moduleName, keys] of [...catalogs].sort((a, b) => b[1].size - a[1].size)) {
  console.log(`  ${moduleName.padEnd(14)} ${keys.size}`);
}
if (report.errors.length) {
  console.log(`\n${report.errors.length} fichier(s) en erreur :`);
  for (const entry of report.errors) console.log(`  ${entry.file} — ${entry.error}`);
}
