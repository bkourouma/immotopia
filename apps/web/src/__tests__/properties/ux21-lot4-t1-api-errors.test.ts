import { describe, it, expect } from 'vitest';
import { apiErrorText } from '../../components/properties/property-api-errors';

describe('apiErrorText — messages métier (lot 4 UX)', () => {
  it('traduit une coupure réseau en phrase actionnable', () => {
    const erreur = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
    expect(apiErrorText(erreur, 'repli')).toMatch(/Connexion impossible/);
  });

  it('ne montre jamais un code technique comme message principal', () => {
    const erreur = { response: { status: 400, data: { message: 'VALIDATION_ERROR' } } };
    expect(apiErrorText(erreur, 'repli')).toBe('repli');
  });

  it('remplace « Request failed with status code 500 » par une phrase lisible', () => {
    const erreur = { response: { status: 500, data: { message: 'Request failed with status code 500' } } };
    expect(apiErrorText(erreur, 'repli')).toMatch(/serveur a rencontré un problème/);
  });

  it('annonce un fichier trop volumineux sur un 413', () => {
    expect(apiErrorText({ response: { status: 413, data: {} } }, 'repli')).toMatch(/trop volumineux/);
  });

  it('garde un message serveur lisible, y compris dans l’ancien champ `error`', () => {
    expect(apiErrorText({ response: { status: 400, data: { error: 'Le titre est requis.' } } }, 'repli')).toBe(
      'Le titre est requis.'
    );
  });
});
