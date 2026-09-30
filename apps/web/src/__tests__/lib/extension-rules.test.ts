import { describe, it, expect } from 'vitest';
import { EXTENSION_REQUIRED_PACKS, isExtensionAllowed } from '../../utils/extension-rules';
import { quotaExceededDenialText } from '../../utils/subscription-denial-notice';

describe('isExtensionAllowed', () => {
  it('sans règle, l’extension est vendable', () => {
    expect(isExtensionAllowed(undefined, ['AGENCE'])).toBe(true);
    expect(isExtensionAllowed([], [])).toBe(true);
  });

  it('exige l’un des packs requis', () => {
    expect(isExtensionAllowed(EXTENSION_REQUIRED_PACKS.EXT_BIENS_10, ['PATRIMOINE_PRO'])).toBe(false);
    expect(isExtensionAllowed(EXTENSION_REQUIRED_PACKS.EXT_BIENS_10, ['PATRIMOINE_ESSENTIEL'])).toBe(true);
    expect(isExtensionAllowed(EXTENSION_REQUIRED_PACKS.EXT_COPRO, ['PROMOTEUR'])).toBe(false);
    expect(isExtensionAllowed(EXTENSION_REQUIRED_PACKS.EXT_CHANTIER, ['PROMOTEUR'])).toBe(true);
  });
});

describe('quotaExceededDenialText — extension ou non', () => {
  const base = { capacityKey: 'BIENS_DETENUS', used: 60, limit: 60, requested: 1 };

  it('propose une extension par défaut', () => {
    expect(quotaExceededDenialText(base).description).toContain('Demandez une extension de capacité');
    expect(quotaExceededDenialText({ ...base, extensible: true }).description).toContain('Demandez une extension');
  });

  it('propose facturation, changement de pack ou contact quand extensible vaut faux', () => {
    const { description } = quotaExceededDenialText({ ...base, extensible: false });
    expect(description).not.toContain('Demandez une extension');
    expect(description).toContain('facturation du dépassement');
    expect(description).toContain('changez de pack');
  });
});
