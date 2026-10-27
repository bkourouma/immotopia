/**
 * Bibliotheque partagee des extracteurs i18n (apps/web et packages/api).
 *
 * Aucune dependance : le module `typescript` est passe en parametre (`ts`) par
 * le script appelant, qui le resout depuis son propre paquet.
 *
 * Trois responsabilites :
 *   1. options de ligne de commande communes (--dry, --check, --prune, ...) ;
 *   2. fusion NON DESTRUCTIVE d'un catalogue : une traduction non vide n'est
 *      jamais supprimee par un passage normal, seul --prune la deplace vers
 *      un fichier `*.orphans.json` (union avec l'existant, jamais d'ecrasement) ;
 *   3. recensement des cles dynamiques : resolution statique des constantes
 *      d'un meme fichier (`resolveStrings`) et marqueur `@i18n-keys`
 *      (`markedKeys`).
 */
import fs from 'node:fs';
import path from 'node:path';

/* ------------------------------------------------------------------- options */

/**
 * @param {string[]} argv
 * @param {string} scriptRoot racine par defaut (parent du dossier du script)
 */
export function parseOptions(argv, scriptRoot) {
  const options = {
    dry: false,
    check: false,
    prune: false,
    unreferenced: false,
    only: '',
    root: scriptRoot,
    unknown: []
  };
  for (const arg of argv) {
    if (arg === '--dry') options.dry = true;
    else if (arg === '--check') options.check = true;
    else if (arg === '--prune') options.prune = true;
    else if (arg === '--unreferenced') options.unreferenced = true;
    else if (arg.startsWith('--only=')) options.only = arg.slice('--only='.length);
    else if (arg.startsWith('--root=')) options.root = arg.slice('--root='.length);
    else options.unknown.push(arg);
  }
  options.root = path.resolve(options.root);
  // Rien n'est ecrit en --dry ni en --check.
  options.write = !options.dry && !options.check;
  return options;
}

/** Message d'erreur (exit 2) si la combinaison d'options est refusee, sinon null. */
export function validateOptions(options) {
  if (options.unknown.length) {
    return `Option(s) inconnue(s) : ${options.unknown.join(' ')}. Options : --dry --check --prune --unreferenced --only=<chemin> --root=<dossier>.`;
  }
  if (options.prune && options.only) {
    return "--prune est refuse avec --only= : le recensement serait partiel, des traductions encore utilisees seraient deplacees a tort.";
  }
  if (options.prune && options.check) {
    return '--prune est refuse avec --check : --check ne modifie rien.';
  }
  return null;
}

/* ------------------------------------------------------------ fichiers (EOL) */

export function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    throw new Error(`JSON invalide dans ${file} : ${error.message}`);
  }
}

export function serialize(object) {
  return JSON.stringify(object, null, 2) + '\n';
}

/** 'new' (fichier absent), 'changed' ou 'same' (identique modulo fins de ligne). */
export function compareFile(file, content) {
  if (!fs.existsSync(file)) return 'new';
  const raw = fs.readFileSync(file, 'utf8');
  return raw.replace(/\r\n/g, '\n') === content ? 'same' : 'changed';
}

/** Ecrit `content` (LF) en conservant les fins de ligne d'un fichier existant. */
export function writeKeepingEol(file, content) {
  let eol = '\n';
  if (fs.existsSync(file)) {
    if (fs.readFileSync(file, 'utf8').includes('\r\n')) eol = '\r\n';
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, eol === '\n' ? content : content.replace(/\n/g, eol), 'utf8');
}

/* -------------------------------------------------------------------- fusion */

const byFrench = (a, b) => a.localeCompare(b, 'fr');

function sortedObject(entries) {
  const out = {};
  for (const [key, value] of [...entries].sort((a, b) => byFrench(a[0], b[0]))) out[key] = value;
  return out;
}

/**
 * Fusion non destructive.
 *  - cle recensee : gardee (ajoutee avec '' si absente) ;
 *  - non recensee, valeur non vide : GARDEE (ou deplacee si `prune`) ;
 *  - non recensee, valeur vide : retiree, sauf `keepEmpty` (recensement partiel).
 */
export function mergeCatalog(existing, referenced, { prune = false, keepEmpty = false } = {}) {
  const entries = [];
  const added = [];
  const kept = [];
  const moved = {};
  let droppedEmpty = 0;
  const has = (key) => Object.prototype.hasOwnProperty.call(existing, key);

  for (const key of referenced) {
    if (has(key)) entries.push([key, existing[key]]);
    else {
      entries.push([key, '']);
      added.push(key);
    }
  }
  for (const [key, value] of Object.entries(existing)) {
    if (referenced.has(key)) continue;
    if (value) {
      if (prune) moved[key] = value;
      else {
        entries.push([key, value]);
        kept.push(key);
      }
    } else if (keepEmpty) {
      entries.push([key, value]);
    } else {
      droppedEmpty += 1;
    }
  }
  return { merged: sortedObject(entries), added, kept, moved, droppedEmpty };
}

/**
 * Calcule (sans ecrire) le sort d'un catalogue et de son fichier d'orphelins.
 * `orphanFile` n'est touche qu'avec `prune` et seulement s'il y a des entrees
 * deplacees ; il est alors fusionne par union (la valeur du catalogue gagne).
 */
export function planCatalog({ file, orphanFile, referenced, prune, keepEmpty }) {
  const merge = mergeCatalog(readJson(file), referenced, { prune, keepEmpty });
  const content = serialize(merge.merged);
  const plan = {
    file,
    content,
    status: compareFile(file, content),
    added: merge.added,
    kept: merge.kept,
    moved: merge.moved,
    droppedEmpty: merge.droppedEmpty,
    merged: merge.merged,
    orphanFile,
    orphanContent: null,
    orphanStatus: 'same'
  };
  if (prune && Object.keys(merge.moved).length) {
    const union = sortedObject(Object.entries({ ...readJson(orphanFile), ...merge.moved }));
    plan.orphanContent = serialize(union);
    plan.orphanStatus = compareFile(orphanFile, plan.orphanContent);
  }
  return plan;
}

export function applyPlan(plan) {
  if (plan.status !== 'same') writeKeepingEol(plan.file, plan.content);
  if (plan.orphanContent !== null && plan.orphanStatus !== 'same') {
    writeKeepingEol(plan.orphanFile, plan.orphanContent);
  }
}

/** Tous les `*.orphans.json` d'un dossier (non recursif). */
export function findOrphanFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.orphans.json'))
    .map((name) => path.join(dir, name));
}

export function truncateKey(key, max = 80) {
  const flat = key.replace(/\s+/g, ' ');
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

/* -------------------------------------------------------------- cles (filtre) */

/**
 * Filtre minimal des chaines resolues ou marquees : au moins 2 caracteres et
 * une lettre. Pas l'heuristique `looksTranslatable` : ces chaines alimentent
 * `t()`, un mot en minuscules y est une cle legitime.
 */
export function isAcceptableKey(text) {
  const value = text.trim();
  if (value.length < 2) return false;
  return /[A-Za-zÀ-ɏ]/.test(value);
}

/* ----------------------------------------------------------- AST (utilitaires) */

function transparent(ts, node) {
  const K = ts.SyntaxKind;
  while (
    node &&
    (node.kind === K.ParenthesizedExpression ||
      node.kind === K.AsExpression ||
      (K.SatisfiesExpression !== undefined && node.kind === K.SatisfiesExpression) ||
      node.kind === K.NonNullExpression ||
      node.kind === K.TypeAssertionExpression)
  ) {
    node = node.expression;
  }
  return node;
}

function isStringLiteralLike(ts, node) {
  return !!node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));
}

function isContainer(ts, node) {
  return !!node && (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node));
}

function isFallback(ts, node) {
  return (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  );
}

/* --------------------------------------------- (a) resolution des constantes */

const MAX_DEPTH = 8;
const declarationCache = new WeakMap();

/** nom -> [{ decl, moduleLevel }] pour les `const nom = init` du fichier. */
function constDeclarations(ts, sf) {
  let table = declarationCache.get(sf);
  if (table) return table;
  table = new Map();
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      node.parent &&
      ts.isVariableDeclarationList(node.parent) &&
      node.parent.flags & ts.NodeFlags.Const
    ) {
      const statement = node.parent.parent;
      const moduleLevel = !!statement && statement.parent === sf;
      const list = table.get(node.name.text) ?? [];
      list.push({ decl: node, moduleLevel });
      table.set(node.name.text, list);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  declarationCache.set(sf, table);
  return table;
}

/**
 * Litteraux chaine que `expr` peut valoir, statiquement (voir l'en-tete pour
 * les formes suivies). Renvoie [] pour tout ce qui n'est pas resolvable.
 */
export function resolveStrings(ts, sf, expr) {
  const table = constDeclarations(ts, sf);
  const out = new Set();
  const seen = new Set();

  const value = (node, depth) => {
    node = transparent(ts, node);
    if (!node) return;
    if (isContainer(ts, node)) expand(node, depth + 1);
    else resolve(node, depth + 1);
  };

  const expand = (literal, depth) => {
    if (depth > MAX_DEPTH) return;
    if (ts.isArrayLiteralExpression(literal)) {
      for (const element of literal.elements) {
        if (ts.isSpreadElement(element)) value(element.expression, depth);
        else if (!ts.isOmittedExpression(element)) value(element, depth);
      }
      return;
    }
    for (const property of literal.properties) {
      if (ts.isPropertyAssignment(property)) value(property.initializer, depth);
      else if (ts.isShorthandPropertyAssignment(property)) resolve(property.name, depth + 1);
      else if (ts.isSpreadAssignment(property)) value(property.expression, depth);
    }
  };

  const resolve = (node, depth) => {
    node = transparent(ts, node);
    if (!node || depth > MAX_DEPTH) return;
    if (isStringLiteralLike(ts, node)) {
      out.add(node.text);
    } else if (ts.isConditionalExpression(node)) {
      resolve(node.whenTrue, depth + 1);
      resolve(node.whenFalse, depth + 1);
    } else if (isFallback(ts, node)) {
      resolve(node.left, depth + 1);
      resolve(node.right, depth + 1);
    } else if (ts.isIdentifier(node)) {
      for (const { decl, moduleLevel } of table.get(node.text) ?? []) {
        if (seen.has(decl)) continue;
        seen.add(decl);
        const init = transparent(ts, decl.initializer);
        if (isContainer(ts, init)) {
          if (moduleLevel) expand(init, depth + 1);
        } else {
          resolve(init, depth + 1);
        }
      }
    } else if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const base = transparent(ts, node.expression);
      if (base && ts.isIdentifier(base)) {
        for (const { decl, moduleLevel } of table.get(base.text) ?? []) {
          if (!moduleLevel || seen.has(decl)) continue;
          const init = transparent(ts, decl.initializer);
          if (isContainer(ts, init)) {
            seen.add(decl);
            expand(init, depth + 1);
          }
        }
      }
    }
    // Appel de fonction, gabarit avec substitution, autre operateur : rien.
  };

  resolve(expr, 0);
  return [...out];
}

/* ------------------------------------------------ (b) marqueur @i18n-keys */

function propertyNameText(ts, name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) {
    return name.text;
  }
  return null;
}

/** Chaines en position de valeur de `expr` (tableaux, ternaires, ??/||, objets). */
function valueStrings(ts, expr, add, withObjects) {
  const node = transparent(ts, expr);
  if (!node) return;
  if (isStringLiteralLike(ts, node)) add(node.text);
  else if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) valueStrings(ts, element.expression, add, withObjects);
      else valueStrings(ts, element, add, withObjects);
    }
  } else if (ts.isObjectLiteralExpression(node)) {
    if (!withObjects) return;
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) valueStrings(ts, property.initializer, add, withObjects);
      else if (ts.isSpreadAssignment(property)) valueStrings(ts, property.expression, add, withObjects);
    }
  } else if (ts.isConditionalExpression(node)) {
    valueStrings(ts, node.whenTrue, add, withObjects);
    valueStrings(ts, node.whenFalse, add, withObjects);
  } else if (isFallback(ts, node)) {
    valueStrings(ts, node.left, add, withObjects);
    valueStrings(ts, node.right, add, withObjects);
  }
}

function collectMarked(ts, root, names, add) {
  if (names.length === 0) {
    // Le noeud lui-meme peut etre une expression (element de tableau...).
    valueStrings(ts, root, add, true);
    const visit = (node) => {
      if (ts.isReturnStatement(node)) valueStrings(ts, node.expression, add, true);
      else if (ts.isVariableDeclaration(node)) valueStrings(ts, node.initializer, add, true);
      else if (ts.isPropertyAssignment(node)) valueStrings(ts, node.initializer, add, true);
      else if (ts.isPropertyDeclaration(node)) valueStrings(ts, node.initializer, add, true);
      else if (ts.isExportAssignment(node)) valueStrings(ts, node.expression, add, true);
      else if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) valueStrings(ts, node.body, add, true);
      ts.forEachChild(node, visit);
    };
    visit(root);
    return;
  }
  const wanted = new Set(names);
  const visit = (node) => {
    if (ts.isPropertyAssignment(node)) {
      const name = propertyNameText(ts, node.name);
      if (name !== null && wanted.has(name)) valueStrings(ts, node.initializer, add, false);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
}

/**
 * Chaines declarees comme cles par un commentaire `@i18n-keys` place juste
 * avant un noeud (instruction, declaration, propriete d'objet). Un commentaire
 * ne s'applique qu'au noeud le plus externe qui le porte.
 *   // @i18n-keys                  toutes les chaines en position de valeur
 *   // @i18n-keys libelle aide     seules les proprietes nommees
 */
export function markedKeys(ts, sf) {
  const text = sf.text;
  const used = new Set();
  const out = new Set();
  const add = (value) => out.add(value);
  const visit = (node) => {
    if (node.kind !== ts.SyntaxKind.SourceFile) {
      for (const range of ts.getLeadingCommentRanges(text, node.pos) ?? []) {
        if (used.has(range.pos)) continue;
        const match = /@i18n-keys([^\r\n*]*)/.exec(text.slice(range.pos, range.end));
        if (!match) continue;
        used.add(range.pos);
        const names = match[1].split(/[\s,]+/).filter(Boolean);
        collectMarked(ts, node, names, add);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...out];
}
