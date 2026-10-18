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
 *   - le message des erreurs typees (`new NotFoundError('...')`, y compris
 *     `GatewayError` pour le client PaySecureHub), des fabriques de
 *     `lib/errors` et leur message par defaut ;
 *   - les textes passes a `t('...')`, gabarits d'e-mail compris ;
 *   - quand l'argument n'est pas un litteral (`throw notFound(MESSAGE)`,
 *     `t(CAPACITY_LABELS[k] ?? ...)`), les chaines des constantes de niveau
 *     module du MEME fichier, resolues statiquement
 *     (scripts/i18n/catalog.mjs, `resolveStrings`) ;
 *   - les chaines d'un noeud precede d'un commentaire `// @i18n-keys [noms...]`
 *     : pour ce que la resolution ne voit pas (libelles declares dans un autre
 *     fichier, objets de donnees relus par `t(champ.libelle)`).
 *
 * Fusion NON DESTRUCTIVE : une traduction non vide n'est jamais supprimee par
 * un passage normal. Une cle non recensee mais traduite est GARDEE (cle
 * dynamique non declaree, texte retouche, code supprime) ; seule `--prune` la
 * deplace vers `<langue>.orphans.json`, par union avec l'existant : ce fichier
 * n'est jamais supprime ni ecrase.
 *
 *   node scripts/i18n-extract.mjs                  recense et met a jour les catalogues
 *   node scripts/i18n-extract.mjs --dry            calcule sans rien ecrire
 *   node scripts/i18n-extract.mjs --check          comme --dry, exit 1 s'il y a a ecrire
 *   node scripts/i18n-extract.mjs --prune          deplace les non referencees vers *.orphans.json
 *   node scripts/i18n-extract.mjs --unreferenced   liste les traductions non referencees gardees
 *   node scripts/i18n-extract.mjs --root=<dossier> racine du paquet (essai sur une copie)
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyPlan,
  findOrphanFiles,
  markedKeys,
  parseOptions,
  planCatalog,
  resolveStrings,
  truncateKey,
  validateOptions
} from '../../../scripts/i18n/catalog.mjs';

const options = parseOptions(
  process.argv.slice(2),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
);
const optionError = validateOptions(options);
if (optionError) {
  console.error(optionError);
  process.exit(2);
}

const ROOT = options.root;
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
  'ValidationError',
  // `lib/payment-gateway/types.ts` : erreurs du client PaySecureHub, levees
  // avec un message francais comme les autres classes typees.
  'GatewayError'
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

/**
 * Fabriques dont le message n'est PAS le premier argument, ou aides locales
 * qui le relaient : nom -> position du message. Lot 040 : `stockError(statut,
 * code, message, data)` porte tous les refus du stock ; `wrongStatus` et
 * `targetNotAllowed` le relaient. Sans elles, ces messages n'etaient jamais
 * recenses et sortaient en francais dans toutes les langues.
 */
const MESSAGE_ARGUMENT_FACTORIES = new Map([
  ['stockError', 2],
  ['wrongStatus', 0],
  ['targetNotAllowed', 0]
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

/** Argument-message : litteral, ou constante resolvable du meme fichier. */
function recordArgument(sf, argument) {
  if (!argument) return;
  for (const text of resolveStrings(ts, sf, argument)) record(text);
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
      recordArgument(sf, (node.arguments ?? [])[0]);
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
      recordArgument(sf, node.arguments[0]);
    }

    // `throw stockError(409, ErrorCode.X, 'Message.')`
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      MESSAGE_ARGUMENT_FACTORIES.has(node.expression.text)
    ) {
      recordArgument(sf, node.arguments[MESSAGE_ARGUMENT_FACTORIES.get(node.expression.text)]);
    }

    // `t('...')` — gabarits d'e-mail et messages deja internationalises.
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
      recordArgument(sf, node.arguments[0]);
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sf, visit);

  for (const text of markedKeys(ts, sf)) record(text);
}

const referenced = new Set([...keys].sort((a, b) => a.localeCompare(b, 'fr')));

const plans = TARGET_LANGUAGES.map(language =>
  planCatalog({
    file: path.join(LOCALES, `${language}.json`),
    orphanFile: path.join(LOCALES, `${language}.orphans.json`),
    referenced,
    prune: options.prune,
    keepEmpty: false
  })
);
if (options.write) for (const plan of plans) applyPlan(plan);

const translated = [...referenced].filter(key => plans[0].merged[key]).length;
const added = new Set(plans.flatMap(plan => plan.added));
const unreferenced = new Map(); // cle -> langues
plans.forEach((plan, index) => {
  for (const key of plan.kept) {
    unreferenced.set(key, [...(unreferenced.get(key) ?? []), TARGET_LANGUAGES[index]]);
  }
});
const moved = plans.reduce((sum, plan) => sum + Object.keys(plan.moved).length, 0);

console.log(
  `${options.dry || options.check ? '[analyse] ' : ''}` +
    `${keys.size} cle(s) recensee(s), ${translated} deja traduite(s) en anglais.`
);
console.log(
  `Catalogues : +${added.size} cle(s) a traduire; ${unreferenced.size} traduction(s) non referencee(s) conservee(s) ` +
    `(inconnue(s) du code : cle dynamique non declaree, texte retouche ou code supprime)` +
    `${options.prune ? `; ${moved} entree(s) deplacee(s) vers *.orphans.json` : ''}.`
);
if (options.unreferenced) {
  for (const [key, languages] of [...unreferenced].sort((a, b) => a[0].localeCompare(b[0], 'fr'))) {
    console.log(`  ${truncateKey(key)} (${languages.join(', ')})`);
  }
}

if (options.check) {
  const problems = [];
  if (added.size) {
    const list = [...added];
    problems.push(
      `${added.size} cle(s) recensee(s) absente(s) d'un catalogue :\n` +
        list
          .slice(0, 15)
          .map(item => `    ${truncateKey(item, 100)}`)
          .join('\n') +
        (list.length > 15 ? `\n    ... (+${list.length - 15})` : '')
    );
  }
  const changed = plans.flatMap(plan => [
    ...(plan.status !== 'same' ? [plan.file] : []),
    ...(plan.orphanStatus !== 'same' ? [plan.orphanFile] : [])
  ]);
  if (changed.length) {
    problems.push(
      `${changed.length} catalogue(s) dont le contenu changerait :\n` +
        changed.map(file => `    ${path.relative(ROOT, file)}`).join('\n')
    );
  }
  const orphanFiles = findOrphanFiles(LOCALES);
  if (orphanFiles.length) {
    problems.push(
      `${orphanFiles.length} fichier(s) *.orphans.json present(s) :\n` +
        orphanFiles.map(file => `    ${path.relative(ROOT, file)}`).join('\n')
    );
  }
  if (problems.length) {
    console.error(`\nCatalogues a regenerer :\n  ${problems.join('\n  ')}`);
    console.error('\nRemede : lancer `npm run i18n:extract -w @immotopia/api`, puis committer le resultat.');
    process.exit(1);
  }
  console.log('Catalogues à jour.');
}
