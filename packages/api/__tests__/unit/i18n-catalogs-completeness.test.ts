import fs from 'node:fs';
import path from 'node:path';

/**
 * Garde-fou de `npm run i18n:extract` : une cle sans traduction retombe sur
 * son texte francais (voir `src/i18n/index.ts`), jamais vide, jamais
 * orpheline en silence. Ne verifie pas la qualite d'une traduction, juste
 * qu'aucune cle n'a ete oubliee et qu'aucun `*.orphans.json` produit par une
 * extraction n'est reste commis par erreur.
 */

const LOCALES_DIR = path.resolve(__dirname, '..', '..', 'src', 'i18n', 'locales');
const LANGUAGES = ['en', 'ar'] as const;

describe('catalogues de traduction (en/ar)', () => {
  it("aucun fichier d'orphelins commis", () => {
    const orphanFiles = fs.readdirSync(LOCALES_DIR).filter(name => name.endsWith('.orphans.json'));
    expect(orphanFiles).toEqual([]);
  });

  for (const language of LANGUAGES) {
    it(`${language}.json : toutes les cles ont une traduction`, () => {
      const file = path.join(LOCALES_DIR, `${language}.json`);
      const catalog = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
      const untranslated = Object.entries(catalog)
        .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
        .map(([key]) => key);

      expect(untranslated).toEqual([]);
    });
  }
});
