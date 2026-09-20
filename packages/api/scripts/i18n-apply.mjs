/**
 * Fusionne un lot de traductions dans `src/i18n/locales/<langue>.json`.
 *
 *   node scripts/i18n-apply.mjs <fichier-lot.json>
 *
 * Le lot a la forme `{ "<langue>": { "<texte francais>": "<traduction>" } }`.
 * Une cle absente du catalogue est refusee plutot qu'ajoutee : une cle inventee
 * ne serait jamais lue, et rien ne l'aurait signale.
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

for (const [language, entries] of Object.entries(batch)) {
  const target = path.join(LOCALES, `${language}.json`);
  const catalog = JSON.parse(fs.readFileSync(target, 'utf8'));
  for (const [source, translation] of Object.entries(entries)) {
    if (!(source in catalog)) {
      unknown.push(`${language} — ${JSON.stringify(source)}`);
      continue;
    }
    catalog[source] = translation;
    applied += 1;
  }
  fs.writeFileSync(target, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
}

console.log(`${applied} traduction(s) appliquee(s).`);

if (unknown.length) {
  console.error(`\n${unknown.length} cle(s) inconnue(s), ignoree(s) :`);
  for (const entry of unknown) console.error(`  ${entry}`);
  process.exitCode = 1;
}

for (const file of fs.readdirSync(LOCALES)) {
  const catalog = JSON.parse(fs.readFileSync(path.join(LOCALES, file), 'utf8'));
  const values = Object.values(catalog);
  const done = values.filter(Boolean).length;
  console.log(`  ${file.replace('.json', '')} : ${done}/${values.length}`);
}
