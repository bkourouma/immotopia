import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Cohérence des variables `{{nom}}` entre une clé française et sa traduction :
 * une traduction qui oublie ou renomme une variable affiche « {{lot}} » tel
 * quel (ou rien) à l'écran. Comparaison par ensemble de noms ; un format
 * i18next (`{{nom, format}}`) compte pour son seul nom.
 */

const LOCALES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'locales');
const LANGUAGES = ['en', 'ar'] as const;

/**
 * Divergences volontaires, au format `<langue>/<fichier>::<clé>`. Clés françaises à
 * suffixe de pluriel (`{{s}}`, `{{value}}`) : la traduction n'en a pas besoin
 * (pluriel propre à la langue cible), la variable est donc omise à dessein.
 */
const ALLOWED_DIVERGENCES = new Set<string>([
  'en/common.json::{{published}} publié{{value}}',
  'en/common.json::Affaires par étape · {{count}} perdue{{value}}',
  'ar/common.json::{{nombre}} ticket{{s}} en cours de traitement',
  'ar/finance.json::{{length}} propriétaire{{value}}',
  'ar/finance.json::{{nombre}} chantier{{s}}',
  'ar/finance.json::{{nombreBloqueurs}} raison{{value}} empêche{{value2}} de clôturer ce chantier.'
]);

const variablesOf = (text: string): string[] => {
  const names = new Set<string>();
  for (const match of text.matchAll(/\{\{\s*([^},\s]+)[^}]*\}\}/g)) names.add(match[1]);
  return [...names].sort();
};

describe('catalogues de traduction : variables {{…}} identiques à la clé', () => {
  for (const language of LANGUAGES) {
    const dir = path.join(LOCALES_DIR, language);
    const files = fs.readdirSync(dir).filter(name => name.endsWith('.json') && !name.endsWith('.orphans.json'));

    for (const file of files) {
      it(`${language}/${file}`, () => {
        const catalog = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Record<string, unknown>;
        const mismatches: string[] = [];
        for (const [key, value] of Object.entries(catalog)) {
          if (typeof value !== 'string' || value.trim() === '') continue;
          if (ALLOWED_DIVERGENCES.has(`${language}/${file}::${key}`)) continue;
          const expected = variablesOf(key);
          const actual = variablesOf(value);
          if (expected.join(',') !== actual.join(',')) {
            mismatches.push(
              `${language}/${file} — clé « ${key} » : attendu {${expected.join(', ')}}, trouvé {${actual.join(', ')}} dans « ${value} »`
            );
          }
        }
        expect(mismatches).toEqual([]);
      });
    }
  }
});
