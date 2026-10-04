/**
 * Dépendances du module de l'inventaire par WhatsApp (lot 041, spec W5-R1,
 * W5 critère 7, W-D1).
 *
 * Le bot n'écrit dans le stock QUE par `createStockCountTx`,
 * `setStockCountLineTx` et `closeStockCountTx` (plan 040 §11), par le pont
 * `lot040-bridge.ts`. Aucun mouvement, aucun transfert, aucune validation,
 * aucun ajustement, aucun abandon ni mise à l'écart d'inventaire depuis
 * WhatsApp : ce test lit les sources et refuse toute dépendance qui le
 * permettrait.
 */
import fs from 'fs';
import path from 'path';

const MODULE_ROOT = path.join(__dirname, '../../src/lib/stock-whatsapp');
const JOB_FILE = path.join(__dirname, '../../src/jobs/stock-whatsapp-job.ts');

function listSources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSources(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** Spécificateurs des `import … from '…'`, `import('…')` et `require('…')`. */
function importsOf(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

const FILES = [...listSources(MODULE_ROOT), JOB_FILE];

/** Modules d'écriture du stock que le lot 041 ne doit jamais atteindre. */
const FORBIDDEN_MODULES = [
  /stock-mouvements/,
  /stock-transferts/,
  /stock-bons/,
  /stock-receptions?/,
  /stock-sorties?/,
  /stock-rebuts?/,
  /stock-ajustements?/,
  /stock-validation/,
  /stock-inventaire-validation/,
  /accounting/
];

/** Fonctions d'inventaire du lot 040 hors des trois permises. */
const FORBIDDEN_CALLS = [
  /\bvalidateStockCountTx\b/,
  /\bcancelStockCountTx\b/,
  /\bsetAside\w*Tx\b/,
  /\bjustifyStockCountLine\w*\b/,
  /\bremoveStockCountLineTx\b/,
  /\brecordStockMovement\w*\b/,
  /\bcreateStockMovement\w*\b/,
  /\bpostDocumentEntryTx\b/
];

describe('W5-R1 — le module WhatsApp n’écrit dans le stock que par les trois fonctions du lot 040', () => {
  it('le module compte bien ses fichiers (garde-fou du test lui-même)', () => {
    expect(FILES.length).toBeGreaterThan(15);
    expect(FILES.some(file => file.endsWith(path.join('engine', 'count-writer.ts')))).toBe(true);
  });

  it.each(FILES.map(file => [path.relative(MODULE_ROOT, file), file]))(
    '%s n’importe aucun module de mouvement, de transfert ni de validation',
    (_name, file) => {
      const imports = importsOf(fs.readFileSync(file, 'utf8'));
      for (const specifier of imports) {
        for (const forbidden of FORBIDDEN_MODULES) expect(specifier).not.toMatch(forbidden);
      }
    }
  );

  it.each(FILES.map(file => [path.relative(MODULE_ROOT, file), file]))(
    '%s n’appelle aucune fonction d’inventaire hors des trois permises',
    (_name, file) => {
      const source = fs.readFileSync(file, 'utf8');
      for (const forbidden of FORBIDDEN_CALLS) expect(source).not.toMatch(forbidden);
    }
  );

  it('seul le pont `lot040-bridge.ts` importe `stock-inventaire` (lot 040)', () => {
    const importers = FILES.filter(file =>
      importsOf(fs.readFileSync(file, 'utf8')).some(s => /stock-inventaire$/.test(s))
    );
    expect(importers.map(file => path.basename(file))).toEqual(['lot040-bridge.ts']);
  });

  it('les écritures d’inventaire du moteur passent toutes par `count-writer.ts`', () => {
    const callers = FILES.filter(file => {
      const source = fs.readFileSync(file, 'utf8');
      return /\b(createStockCountTx|setStockCountLineTx|closeStockCountTx)\s*\(/.test(source);
    }).map(file => path.basename(file));
    expect(callers.sort()).toEqual(['count-writer.ts', 'lot040-bridge.ts']);
  });

  it('aucun fichier du module ne crée d’article de stock (W9-R3)', () => {
    for (const file of FILES) {
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(/stockItem\.(create|createMany|upsert|update|updateMany)\b/);
    }
  });

  it('aucun fichier du module ne lit `process.env` ni n’inclut un utilisateur complet', () => {
    for (const file of FILES) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/process\.env/);
      expect(source).not.toMatch(/include:\s*\{\s*user:\s*true/);
    }
  });
});
