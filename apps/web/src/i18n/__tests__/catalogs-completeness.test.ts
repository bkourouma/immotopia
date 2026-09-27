import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Garde-fou de `npm run i18n:extract` : le principe du module (voir
 * `docs/architecture/i18n.md`) est qu'une cle sans traduction retombe sur son
 * texte francais — jamais vide, jamais orpheline en silence. Ce test ne
 * verifie pas la QUALITE d'une traduction (hors de portee d'un test), juste
 * qu'aucune cle n'a ete oubliee et qu'aucun `*.orphans.json` produit par une
 * extraction n'est reste commis par erreur.
 */

const LOCALES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'locales');
const LANGUAGES = ['en', 'ar'] as const;

describe('catalogues de traduction (en/ar)', () => {
  for (const language of LANGUAGES) {
    const dir = path.join(LOCALES_DIR, language);
    const entries = fs.readdirSync(dir);
    const orphanFiles = entries.filter(name => name.endsWith('.orphans.json'));
    const catalogFiles = entries.filter(name => name.endsWith('.json') && !name.endsWith('.orphans.json'));

    it(`${language} : aucun fichier d'orphelins commis`, () => {
      expect(orphanFiles).toEqual([]);
    });

    it(`${language} : au moins un catalogue present`, () => {
      expect(catalogFiles.length).toBeGreaterThan(0);
    });

    for (const file of catalogFiles) {
      it(`${language}/${file} : toutes les cles ont une traduction`, () => {
        const catalog = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Record<string, unknown>;
        const untranslated = Object.entries(catalog)
          .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
          .map(([key]) => key);

        expect(untranslated).toEqual([]);
      });
    }
  }
});
