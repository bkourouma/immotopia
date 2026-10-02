#!/usr/bin/env node
/**
 * Mesure du chunk d'entrée (REFONTE_UI_UX.md §8.1).
 *
 * Ce script existe parce que la mesure à la main s'est révélée peu fiable : le
 * build produit six fichiers nommés `index-<hash>.js`, et rien dans leur nom ne
 * dit lequel le navigateur charge en premier. Seul `index.html` le dit. Une
 * mesure prise sur le mauvais fichier se compare mal à la précédente, et la
 * dérive passe inaperçue — c'est exactement ce qui est arrivé entre le Lot 1 et
 * le Lot 2, pour 798 o.
 *
 * Ce qui est mesuré ici est le **chemin critique** : le module d'entrée plus
 * tout ce que le document précharge (`modulepreload`), car le navigateur les
 * demande avant le premier rendu. Le budget du §8.1 porte sur cet ensemble, pas
 * sur le seul fichier d'entrée.
 *
 * Usage :
 *   node scripts/measure-entry.mjs [--json] [--budget 226304]
 */

import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = join(WEB_ROOT, 'build');

/**
 * Plafond du §8.1. Dépassement = sortie en échec.
 * Relevé de 225 280 à 226 304 o (+1 Kio) le 2026-09-29 : la marge n'était plus que de 58 o
 * et l'entrée de menu « Assistant IA » (super-admin) suffisait à la dépasser.
 * Relevé de 226 304 à 227 328 o (+1 Kio) le 2026-10-02, sur décision explicite de l'utilisateur :
 * les entrées de menu et routes du pack patrimoine (vagues B et C) dépassaient le plafond de 135 o.
 */
const DEFAULT_BUDGET = 227_328;

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const budgetArg = args.indexOf('--budget');
const budget = budgetArg >= 0 ? Number(args[budgetArg + 1]) : DEFAULT_BUDGET;

const indexHtml = join(BUILD_DIR, 'index.html');
if (!existsSync(indexHtml)) {
  console.error(`Aucun build trouvé : ${indexHtml} est absent. Lancez d'abord \`npm run build\`.`);
  process.exit(2);
}

const html = readFileSync(indexHtml, 'utf8');

/** Le module d'entrée, tel que le document le déclare. */
const entryMatch = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
if (!entryMatch) {
  console.error("index.html ne déclare aucun script de type module : structure de build inattendue.");
  process.exit(2);
}

/** Tout ce que le document demande avant le premier rendu. */
const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map(m => m[1]);
const stylesheets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1]);

function measure(urlPath) {
  const file = join(BUILD_DIR, urlPath.replace(/^\//, ''));
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  return { path: urlPath, raw: bytes.length, gzip: gzipSync(bytes).length };
}

const entry = measure(entryMatch[1]);
const preloaded = preloads.map(measure).filter(Boolean);
const styles = stylesheets.map(measure).filter(Boolean);

const criticalJs = [entry, ...preloaded];
const totalJsGzip = criticalJs.reduce((sum, f) => sum + f.gzip, 0);
const totalCssGzip = styles.reduce((sum, f) => sum + f.gzip, 0);

if (asJson) {
  console.log(JSON.stringify({ entry, preloaded, styles, totalJsGzip, totalCssGzip, budget }, null, 2));
} else {
  console.log('Chemin critique — ce que le navigateur demande avant le premier rendu\n');
  console.log(`  entrée      ${entry.path}`);
  console.log(`              ${entry.raw.toLocaleString('fr-FR')} o brut · ${entry.gzip.toLocaleString('fr-FR')} o gzip`);
  for (const f of preloaded) {
    console.log(`  préchargé   ${f.path} · ${f.gzip.toLocaleString('fr-FR')} o gzip`);
  }
  for (const f of styles) {
    console.log(`  style       ${f.path} · ${f.gzip.toLocaleString('fr-FR')} o gzip`);
  }
  console.log('');
  console.log(`  JS critique ${totalJsGzip.toLocaleString('fr-FR')} o gzip (${criticalJs.length} fichier(s))`);
  console.log(`  CSS         ${totalCssGzip.toLocaleString('fr-FR')} o gzip`);
  console.log('');
  const marge = budget - totalJsGzip;
  console.log(`  budget §8.1 ${budget.toLocaleString('fr-FR')} o — ${marge >= 0 ? `marge ${marge.toLocaleString('fr-FR')} o` : `DÉPASSÉ de ${(-marge).toLocaleString('fr-FR')} o`}`);
}

process.exit(totalJsGzip > budget ? 1 : 0);
