/**
 * Recense les textes du serveur qui atteignent un humain, et alimente
 * `src/i18n/locales/<langue>.json`.
 *
 * Contrairement au codemod du frontend, ce script **ne modifie aucun fichier
 * source** : cote serveur, les messages restent ecrits en francais a l'endroit
 * ou ils sont leves, et la traduction a lieu au dernier moment
 * (`middleware/error-middleware.ts`). Il n'y a donc rien a envelopper — juste a
 * recenser.
 *
 * Ce qui est recense :
 *   - le message des erreurs typees (`new NotFoundError('...')`) et leur
 *     message par defaut ;
 *   - les textes passes a `t(...)` dans les gabarits d'e-mail.
 *
 *   node scripts/i18n-extract.mjs
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const LOCALES = path.join(SRC, 'i18n', 'locales');
const TARGET_LANGUAGES = ['en', 'ar'];

const ERROR_CLASSES = new Set([
  'AppError',
  'BadRequestError',
  'UnauthorizedError',
  'ForbiddenError',
  'NotFoundError',
  'ConflictError',
  'ValidationError'
]);

/**
 * Fabriques de `lib/errors` : `throw notFound('Bail introuvable.')`. Elles
 * portent l'ecrasante majorite des messages du serveur — 450 appels, la ou les
 * classes typees n'en comptent que 48.
 */
const ERROR_FACTORIES = new Set([
  'badRequest',
  'forbidden',
  'unauthorized',
  'notFound',
  'conflict',
  'unprocessableEntity',
  'tenantIsolationError'
]);

const SKIP_DIRS = new Set(['node_modules', 'i18n', '__tests__', 'dist']);

function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collectFiles(full, out);
    } else if (/\.ts$/.test(entry.name) && !/\.d\.ts$|\.(test|spec)\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const keys = new Set();

function record(text) {
  const value = text.trim();
  // Un message vide, ou purement technique, n'a rien a faire dans un catalogue.
  if (value.length < 2) return;
  if (!/[A-Za-z]/.test(value)) return;
  keys.add(value);
}

for (const file of collectFiles(SRC)) {
  const source = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const visit = node => {
    // `throw new NotFoundError('Bail introuvable.')`
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ERROR_CLASSES.has(node.expression.text)
    ) {
      const [first] = node.arguments ?? [];
      if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
        record(first.text);
      }
    }

    // Message par defaut d'une classe d'erreur : `constructor(message = '...')`
    if (
      ts.isParameter(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'message' &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      record(node.initializer.text);
    }

    // `throw notFound('Bail introuvable.')`
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ERROR_FACTORIES.has(node.expression.text)) {
      const [first] = node.arguments;
      if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
        record(first.text);
      }
    }

    // `t('...')` — gabarits d'e-mail et messages deja internationalises.
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
      const [first] = node.arguments;
      if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
        record(first.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sf, visit);
}

fs.mkdirSync(LOCALES, { recursive: true });

for (const language of TARGET_LANGUAGES) {
  const target = path.join(LOCALES, `${language}.json`);
  const existing = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : {};
  const merged = {};
  for (const key of [...keys].sort((a, b) => a.localeCompare(b, 'fr'))) {
    merged[key] = existing[key] ?? '';
  }
  fs.writeFileSync(target, JSON.stringify(merged, null, 2) + '\n', 'utf8');
}

const translated = Object.values(
  JSON.parse(fs.readFileSync(path.join(LOCALES, 'en.json'), 'utf8'))
).filter(Boolean).length;

console.log(`${keys.size} cle(s) recensee(s), ${translated} deja traduite(s) en anglais.`);
