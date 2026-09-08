#!/usr/bin/env node
/**
 * Vérificateur de contraste des design tokens (REFONTE_UI_UX.md §7.3).
 *
 * Lit `src/styles/tokens.css`, résout les chaînes `var(--x)` jusqu'à la
 * primitive, puis calcule le ratio WCAG 2.1 de chaque couple déclaré ci-dessous.
 *
 * Échoue (code 1) si un couple descend sous :
 *   - 4,5:1  pour du texte,
 *   - 3,0:1  pour un composant ou une icône porteuse de sens.
 *
 * Usage : npm run a11y:contrast  [--json]
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS_FILE = join(HERE, '..', 'src', 'styles', 'tokens.css');

/** Seuils WCAG 2.1 AA. */
const THRESHOLD = { text: 4.5, 'non-text': 3.0 };

/**
 * Les couples que le système déclare. `kind: 'info'` = mesuré et affiché mais
 * non contraignant : le token n'est jamais seul porteur d'information (§3.2).
 */
const PAIRS = [
  // Marque et sémantique, sur le fond applicatif
  ['--color-primary', '--surface-page', 'text'],
  ['--color-primary-hover', '--surface-page', 'text'],
  ['--color-primary-active', '--surface-page', 'text'],
  ['--color-info', '--surface-page', 'text'],
  ['--color-success', '--surface-page', 'non-text'],
  ['--color-success-text', '--surface-page', 'text'],
  ['--color-warning', '--surface-page', 'non-text'],
  ['--color-warning-text', '--surface-page', 'text'],
  ['--color-error', '--surface-page', 'text'],
  ['--color-error-text', '--surface-page', 'text'],

  // Les mêmes sur une carte : c'est là que vivent liens et boutons `type="link"`
  ['--color-primary', '--surface-card', 'text'],
  ['--color-error', '--surface-card', 'text'],
  ['--color-success-text', '--surface-card', 'text'],
  ['--color-warning-text', '--surface-card', 'text'],

  // Texte sur fond applicatif
  ['--text-primary', '--surface-page', 'text'],
  ['--text-secondary', '--surface-page', 'text'],
  ['--text-tertiary', '--surface-page', 'text'],
  ['--text-disabled', '--surface-page', 'info'],

  // Texte sur carte
  ['--text-primary', '--surface-card', 'text'],
  ['--text-secondary', '--surface-card', 'text'],
  ['--text-tertiary', '--surface-card', 'text'],

  // Texte sur zone creusée (en-tête de tableau, blocs d'aide)
  ['--text-primary', '--surface-sunken', 'text'],
  ['--text-secondary', '--surface-sunken', 'text'],

  // Sidebar
  ['--text-on-inverse', '--surface-inverse', 'text'],
  ['--text-on-inverse-muted', '--surface-inverse', 'text'],

  // Statuts : couple fond/texte de <StatusTag>
  ['--color-primary', '--color-primary-bg', 'text'],
  ['--color-success-text', '--color-success-bg', 'text'],
  ['--color-warning-text', '--color-warning-bg', 'text'],
  ['--color-error-text', '--color-error-bg', 'text'],

  // Bordures de champ. Mesurées et publiées, mais NON bloquantes : le §3.2 fige
  // ces valeurs (slate-300 / slate-400) sans leur attribuer de ratio cible, et
  // le Lot 0 n'a pas mandat de les changer. Elles sortent toutes deux sous le
  // seuil non-texte de WCAG 1.4.11 (bordure de contrôle) — défaut réel, à
  // arbitrer à l'audit RGAA du Lot 5 (§7).
  ['--border-default', '--surface-card', 'info'],
  ['--border-strong', '--surface-card', 'info'],
];

/** Seuil indicatif appliqué aux couples `info`, pour les signaler sans échouer. */
const INFO_REFERENCE = THRESHOLD['non-text'];

// ---------------------------------------------------------------------------

/** Extrait les déclarations `--x: valeur;` du bloc `:root` de base. */
function parseTokens(css) {
  const tokens = new Map();
  // On s'arrête au premier `}` de premier niveau : les blocs @media et
  // [data-theme] qui suivent redéfinissent des valeurs par palier, pas la base.
  const rootStart = css.indexOf(':root {');
  if (rootStart === -1) throw new Error('Bloc :root introuvable dans tokens.css');
  const rootEnd = css.indexOf('\n}', rootStart);
  const body = css.slice(rootStart, rootEnd);

  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*([^;]+);/);
    if (m) tokens.set(m[1], m[2].trim());
  }
  return tokens;
}

/** Résout `var(--a)` en cascade jusqu'à une couleur littérale. */
function resolve(tokens, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`Cycle de var() sur ${name}`);
  seen.add(name);

  const raw = tokens.get(name);
  if (raw === undefined) throw new Error(`Token inconnu : ${name}`);

  const ref = raw.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  return ref ? resolve(tokens, ref[1], seen) : raw;
}

/** #rgb / #rrggbb -> [r, g, b] sur 0-255. */
function toRgb(hex) {
  const h = hex.trim().replace('#', '');
  if (h.length === 3) return [...h].map((c) => parseInt(c + c, 16));
  if (h.length === 6) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  throw new Error(`Couleur non hexadécimale : ${hex}`);
}

/** Luminance relative WCAG 2.1. */
function luminance(hex) {
  const [r, g, b] = toRgb(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG 2.1, toujours >= 1. */
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// ---------------------------------------------------------------------------

const asJson = process.argv.includes('--json');
const tokens = parseTokens(readFileSync(TOKENS_FILE, 'utf8'));

const results = PAIRS.map(([fg, bg, kind]) => {
  const fgHex = resolve(tokens, fg);
  const bgHex = resolve(tokens, bg);
  const ratio = contrast(fgHex, bgHex);
  const min = THRESHOLD[kind] ?? null;
  return {
    foreground: fg,
    foregroundValue: fgHex,
    background: bg,
    backgroundValue: bgHex,
    kind,
    ratio: Math.round(ratio * 100) / 100,
    min,
    pass: min === null ? true : ratio >= min,
  };
});

const failures = results.filter((r) => !r.pass);

if (asJson) {
  console.log(JSON.stringify({ results, failures: failures.length }, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`Contraste des design tokens — ${TOKENS_FILE.replace(/.*[\\/]apps/, 'apps')}\n`);
  console.log(
    `${pad('couple', 52)} ${pad('type', 9)} ${pad('ratio', 8)} ${pad('min', 6)} verdict`
  );
  console.log('-'.repeat(92));
  for (const r of results) {
    const couple = `${r.foreground} (${r.foregroundValue}) / ${r.background}`;
    const verdict = r.kind === 'info' ? 'info' : r.pass ? 'OK' : 'ECHEC';
    console.log(
      `${pad(couple, 52)} ${pad(r.kind, 9)} ${pad(r.ratio.toFixed(2) + ':1', 8)} ${pad(
        r.min ? r.min.toFixed(1) : '-',
        6
      )} ${verdict}`
    );
  }
  console.log('-'.repeat(92));
  console.log(
    `${results.length} couples verifies — ${failures.length} echec(s), ` +
      `seuils AA : texte ${THRESHOLD.text}:1, non-texte ${THRESHOLD['non-text']}:1.`
  );

  const lowInfo = results.filter((r) => r.kind === 'info' && r.ratio < INFO_REFERENCE);
  if (lowInfo.length > 0) {
    console.log(
      `\nA surveiller (non bloquant) : ${lowInfo.length} couple(s) sous ${INFO_REFERENCE}:1 —\n` +
        lowInfo
          .map((r) => `  ${r.foreground} sur ${r.background} : ${r.ratio.toFixed(2)}:1`)
          .join('\n')
    );
  }
}

if (failures.length > 0) {
  console.error(`\nEchec : ${failures.map((f) => `${f.foreground} sur ${f.background}`).join(', ')}`);
  process.exit(1);
}
