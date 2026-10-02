/**
 * Garde de dérive : l'interface web garde une copie de `FRAGILE_LEGAL_STATUSES`
 * (avertissement affiché avant l'envoi). Elle doit rester identique à la liste
 * du serveur, qui fait foi pour le plafond de fiabilité (spec 024).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { FRAGILE_LEGAL_STATUSES } from '../../src/lib/patrimoine/assets';

const WEB_FILE = join(__dirname, '../../../../apps/web/src/components/patrimoine/actifs/asset-classes.ts');

function webFragileStatuses(): string[] {
  const source = readFileSync(WEB_FILE, 'utf8');
  const match = /export const FRAGILE_LEGAL_STATUSES[^=]*=\s*\[([^\]]*)\]/.exec(source);
  if (!match) {
    throw new Error(
      `FRAGILE_LEGAL_STATUSES introuvable dans ${WEB_FILE} : adapter ce test si la déclaration a changé de forme.`
    );
  }
  return [...match[1].matchAll(/'([A-Z_]+)'/g)].map(entry => entry[1]);
}

describe('FRAGILE_LEGAL_STATUSES : copie web alignée sur le serveur', () => {
  it('liste identique (même statuts, même ordre)', () => {
    expect({
      web: webFragileStatuses(),
      hint: 'Aligner apps/web/src/components/patrimoine/actifs/asset-classes.ts sur packages/api/src/lib/patrimoine/assets/asset-classes.ts'
    }).toEqual({
      web: [...FRAGILE_LEGAL_STATUSES],
      hint: 'Aligner apps/web/src/components/patrimoine/actifs/asset-classes.ts sur packages/api/src/lib/patrimoine/assets/asset-classes.ts'
    });
  });

  it('la liste extraite n’est pas vide (l’extraction fonctionne)', () => {
    expect(webFragileStatuses().length).toBeGreaterThan(0);
  });
});
