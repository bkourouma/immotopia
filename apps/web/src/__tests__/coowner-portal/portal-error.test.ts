import { describe, it, expect } from 'vitest';
import { blobErrorMessage, isNotFound, isTooManyRequests } from '../../pages/CoOwnerPortal/portal-error';

/**
 * Erreurs du portail copropriétaire téléchargées en blob (lot S5, audit
 * sécurité) : le corps JSON du serveur (429 du quota de PDF, 403 du portail)
 * arrive comme un `Blob` sous `responseType: 'blob'`, jamais comme un objet
 * déjà analysé.
 */
describe('isTooManyRequests', () => {
  it('reconnaît un 429', () => {
    expect(isTooManyRequests({ response: { status: 429 } })).toBe(true);
    expect(isTooManyRequests({ response: { status: 403 } })).toBe(false);
    expect(isTooManyRequests(null)).toBe(false);
  });
});

describe('blobErrorMessage', () => {
  it('relit le blob JSON pour en tirer le message du serveur', async () => {
    const body = new Blob([
      JSON.stringify({ success: false, message: 'Trop de requêtes. Veuillez réessayer dans quelques minutes.' })
    ]);
    const message = await blobErrorMessage({ response: { data: body } }, 'repli');
    expect(message).toBe('Trop de requêtes. Veuillez réessayer dans quelques minutes.');
  });

  it('retombe sur le message de repli si le blob n’est pas du JSON valide', async () => {
    const body = new Blob(['<html>Erreur</html>']);
    const message = await blobErrorMessage({ response: { data: body } }, 'repli');
    expect(message).toBe('repli');
  });

  it('lit directement le message quand le corps est déjà un objet (hors blob)', async () => {
    const message = await blobErrorMessage({ response: { data: { message: 'Accès refusé.' } } }, 'repli');
    expect(message).toBe('Accès refusé.');
  });

  it('retombe sur le repli sans réponse', async () => {
    expect(await blobErrorMessage(null, 'repli')).toBe('repli');
  });
});

describe('isNotFound (non régression)', () => {
  it('couvre toujours 404 et 400', () => {
    expect(isNotFound({ response: { status: 404 } })).toBe(true);
    expect(isNotFound({ response: { status: 400 } })).toBe(true);
    expect(isNotFound({ response: { status: 429 } })).toBe(false);
  });
});
