import { describe, it, expect } from 'vitest';
import { blocageSuppression } from '../../pages/properties/property-delete-error';

/** BUG-2026-09-30-084 : le refus 409 d'une suppression se lit à l'écran. */
describe('blocageSuppression', () => {
  it('renvoie le message du 409 listant les blocages', () => {
    const erreur = {
      response: { status: 409, data: { message: 'Ce bien ne peut pas être supprimé : bail actif (BAIL-1).' } }
    };
    expect(blocageSuppression(erreur)).toContain('BAIL-1');
  });

  it('ignore les autres erreurs (500, réseau)', () => {
    expect(blocageSuppression({ response: { status: 500, data: { message: 'x' } } })).toBeNull();
    expect(blocageSuppression(new Error('réseau'))).toBeNull();
  });
});
