import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

/**
 * Vocabulaire des écrans du stock (lot 040, ecrans §11.1 et §11.3, spec §4).
 *
 * Un écart, une alerte, un rebut constatent un fait : aucun libellé ne prête
 * une intention à quelqu'un. Ce test statique parcourt les LITTÉRAUX DE CHAÎNE
 * des écrans et composants du stock, de leurs types, des libellés de droits et
 * d'audit, ainsi que les catalogues `finance.json` et les traductions des
 * textes du stock rangés dans `common.json`. Les commentaires ne sont pas lus :
 * ils doivent pouvoir citer les mots que la règle écarte.
 *
 * Lot 041 : les écrans WhatsApp et Comptages terrain, les composants de
 * `components/finance/stock/whatsapp/`, leurs types et leur service suivent la
 * même règle.
 */

const SRC = resolve(__dirname, '..', '..');

const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  { label: 'vol', pattern: /(^|[^\p{L}\p{N}_])vols?(?![\p{L}\p{N}_])/iu },
  { label: 'voleur', pattern: /(^|[^\p{L}\p{N}_])voleu(r|rs|se|ses)(?![\p{L}\p{N}_])/iu },
  { label: 'fraude', pattern: /(^|[^\p{L}\p{N}_])fraud/iu },
  { label: 'détournement', pattern: /(^|[^\p{L}\p{N}_])d[ée]tourn/iu },
  { label: 'theft', pattern: /(^|[^\p{L}\p{N}_])theft(?![\p{L}\p{N}_])/iu },
  { label: 'stolen', pattern: /(^|[^\p{L}\p{N}_])stolen(?![\p{L}\p{N}_])/iu },
  { label: 'steal', pattern: /(^|[^\p{L}\p{N}_])steal/iu },
  { label: 'embezzle', pattern: /(^|[^\p{L}\p{N}_])embezzl/iu },
  { label: 'سرق', pattern: /سرق/u },
  { label: 'احتيال', pattern: /احتيال/u },
  { label: 'اختلاس', pattern: /اختلاس/u }
];

function forbiddenIn(text: string): string[] {
  return FORBIDDEN.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Fichiers du stock côté écran (ecrans §11.1). */
function stockFiles(): string[] {
  const pages = readdirSync(join(SRC, 'pages', 'finance'))
    .filter(name => /^Stock.*\.tsx$/.test(name))
    .map(name => join(SRC, 'pages', 'finance', name));
  const components = walk(join(SRC, 'components', 'finance', 'stock')).filter(file => /\.tsx?$/.test(file));
  const types = readdirSync(join(SRC, 'types'))
    .filter(name => /^finance-stock-.*\.ts$/.test(name))
    .map(name => join(SRC, 'types', name));
  const constants = ['permissions-labels.ts', 'audit-labels.ts'].map(name => join(SRC, 'constants', name));
  // Lot 041 : le service de l'inventaire par WhatsApp (messages d'erreur relayés).
  const services = [join(SRC, 'services', 'finance-stock-whatsapp-service.ts')];
  return [...pages, ...components, ...types, ...constants, ...services];
}

function stringLiterals(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      out.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      out.push(node.head.text, ...node.templateSpans.map(span => span.literal.text));
    } else if (ts.isJsxText(node)) {
      out.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

function catalog(language: string, name: string): Record<string, string> {
  return JSON.parse(readFileSync(join(SRC, 'i18n', 'locales', language, `${name}.json`), 'utf8'));
}

describe('vocabulaire du stock (ecrans §11)', () => {
  it('le motif à frontière de mot ne confond pas un mot voisin', () => {
    expect(forbiddenIn('Volume livré, envol, volet, survol')).toEqual([]);
    expect(forbiddenIn('casse, perte, vol')).toEqual(['vol']);
    expect(forbiddenIn('Recorded theft')).toEqual(['theft']);
    expect(forbiddenIn('سرقة')).toEqual(['سرق']);
  });

  it('couvre bien les écrans du stock', () => {
    const files = stockFiles().map(file => relative(SRC, file).replace(/\\/g, '/'));
    expect(files).toEqual(
      expect.arrayContaining([
        'pages/finance/StockInventaire.tsx',
        'pages/finance/StockMagasin.tsx',
        'components/finance/stock/magasin/GesteRecevoir.tsx',
        // Lot 041
        'pages/finance/StockWhatsapp.tsx',
        'pages/finance/StockComptagesTerrain.tsx',
        'components/finance/stock/whatsapp/FieldCaptureDrawer.tsx',
        'components/finance/stock/whatsapp/WhatsappSimulator.tsx',
        'components/finance/stock/whatsapp/whatsapp-labels.ts',
        'types/finance-stock-whatsapp-types.ts',
        'services/finance-stock-whatsapp-service.ts'
      ])
    );
  });

  it('aucun mot interdit dans les littéraux des écrans du stock', () => {
    const offenders: string[] = [];
    for (const file of stockFiles()) {
      for (const text of stringLiterals(file)) {
        const words = forbiddenIn(text);
        if (words.length > 0) {
          offenders.push(`${relative(SRC, file)} : ${words.join(', ')} — « ${text.trim().slice(0, 120)} »`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  for (const language of ['en', 'ar'] as const) {
    it(`aucun mot interdit dans ${language}/finance.json`, () => {
      const offenders = Object.entries(catalog(language, 'finance'))
        .filter(([key, value]) => forbiddenIn(key).length > 0 || forbiddenIn(value).length > 0)
        .map(([key, value]) => `${key} → ${value}`);
      expect(offenders).toEqual([]);
    });

    it(`aucun mot interdit dans les textes du stock de ${language}/common.json`, () => {
      // `common.json` est partagé : on n'y lit que les textes que les écrans du
      // stock affichent (la nature de sinistre « Vol » de l'assurance n'en est pas).
      const stockTexts = new Set(stockFiles().flatMap(stringLiterals));
      const offenders = Object.entries(catalog(language, 'common'))
        .filter(([key]) => stockTexts.has(key))
        .filter(([key, value]) => forbiddenIn(key).length > 0 || forbiddenIn(value).length > 0)
        .map(([key, value]) => `${key} → ${value}`);
      expect(offenders).toEqual([]);
    });
  }
});
