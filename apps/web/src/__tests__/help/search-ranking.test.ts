import { describe, it, expect } from 'vitest';
import { searchHelp } from '../../help/registry';

/** Registre réel : les fiches de page passent avant les simples mentions dans un texte. */
describe('searchHelp (classement)', () => {
  it('« bail » : « Liste des baux » figure parmi les premiers résultats', async () => {
    const results = await searchHelp('bail', 'fr');
    const rank = results.findIndex(r => r.entry.id === 'locatif.baux.liste');
    expect(rank).toBeGreaterThanOrEqual(0);
    expect(rank).toBeLessThan(5);
  });
});
