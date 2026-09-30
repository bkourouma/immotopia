import { describe, it, expect } from 'vitest';
import { contactDisplayName, contactDisplayNameWithEmail } from '../../utils/contact-display';

/** BUG-2026-09-30-045 : une entreprise s'affichait sous le nom de son représentant. */
describe('contactDisplayName', () => {
  it('affiche la raison sociale d’une entreprise, pas son représentant', () => {
    expect(
      contactDisplayName({
        contactType: 'COMPANY',
        legalName: 'Boutique Ivoire SARL',
        firstName: 'Mamadou',
        lastName: 'Bamba'
      })
    ).toBe('Boutique Ivoire SARL');
  });

  it('affiche « prénom nom » pour une personne', () => {
    expect(contactDisplayName({ contactType: 'PERSON', firstName: 'Awa', lastName: 'Konan' })).toBe('Awa Konan');
    expect(contactDisplayName({ firstName: 'Awa', lastName: 'Konan' })).toBe('Awa Konan');
  });

  it('retombe sur le représentant, puis l’e-mail, si l’entreprise n’a pas de raison sociale', () => {
    expect(
      contactDisplayName({ contactType: 'COMPANY', legalName: ' ', firstName: 'Mamadou', lastName: 'Bamba' })
    ).toBe('Mamadou Bamba');
    expect(contactDisplayName({ contactType: 'COMPANY', firstName: '', lastName: '', email: 'a@b.ci' })).toBe('a@b.ci');
  });

  it('ne rend jamais une chaîne vide ni « null »', () => {
    expect(contactDisplayName({ firstName: null, lastName: null })).toBe('Contact sans nom');
    expect(contactDisplayName(null)).toBe('Contact sans nom');
  });

  it('ajoute l’e-mail entre parenthèses dans les sélecteurs', () => {
    expect(
      contactDisplayNameWithEmail({
        contactType: 'COMPANY',
        legalName: 'Boutique Ivoire SARL',
        firstName: 'Mamadou',
        lastName: 'Bamba',
        email: 'boutique@example.ci'
      })
    ).toBe('Boutique Ivoire SARL (boutique@example.ci)');
  });
});
