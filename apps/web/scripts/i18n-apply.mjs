/**
 * Fusionne un lot de traductions dans les catalogues.
 *
 *   node scripts/i18n-apply.mjs <fichier-lot.json>
 *
 * Le lot a la forme `{ "<langue>": { "<module>": { "<texte francais>": "<traduction>" } } }`.
 *
 * Le script **refuse** une cle qui n'existe pas dans le catalogue vise plutot
 * que de l'ajouter : une cle inventee ne serait jamais lue a l'ecran, et rien
 * ne l'aurait signale. C'est la seule protection contre une faute de frappe
 * dans un texte source de 90 caracteres.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = path.join(ROOT, 'src', 'i18n', 'locales');

const [batchPath] = process.argv.slice(2);
if (!batchPath) {
  console.error('Usage : node scripts/i18n-apply.mjs <fichier-lot.json>');
  process.exit(1);
}

const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
const unknown = [];
let applied = 0;

for (const [language, modules] of Object.entries(batch)) {
  for (const [moduleName, entries] of Object.entries(modules)) {
    const target = path.join(LOCALES, language, `${moduleName}.json`);
    if (!fs.existsSync(target)) {
      console.error(`Catalogue absent : ${language}/${moduleName}.json`);
      process.exitCode = 1;
      continue;
    }
    const catalog = JSON.parse(fs.readFileSync(target, 'utf8'));
    for (const [source, translation] of Object.entries(entries)) {
      if (!(source in catalog)) {
        unknown.push(`${language}/${moduleName} — ${JSON.stringify(source)}`);
        continue;
      }
      catalog[source] = translation;
      applied += 1;
    }
    fs.writeFileSync(target, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  }
}

console.log(`${applied} traduction(s) appliquee(s).`);

if (unknown.length) {
  console.error(`\n${unknown.length} cle(s) inconnue(s), ignoree(s) :`);
  for (const entry of unknown) console.error(`  ${entry}`);
  process.exitCode = 1;
}

// Etat d'avancement, catalogue par catalogue.
for (const language of fs.readdirSync(LOCALES)) {
  const dir = path.join(LOCALES, language);
  if (!fs.statSync(dir).isDirectory()) continue;
  let total = 0;
  let done = 0;
  for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json') && !name.includes('orphans'))) {
    const catalog = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const value of Object.values(catalog)) {
      total += 1;
      if (value) done += 1;
    }
  }
  console.log(`  ${language} : ${done}/${total} (${Math.round((done / total) * 100)} %)`);
}
