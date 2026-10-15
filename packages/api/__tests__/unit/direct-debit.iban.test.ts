import {
  computeIbanCheckDigits,
  expectedRibKey,
  formatIbanGroups,
  isIbanChecksumValid,
  isRibKeyConsistent,
  maskIban,
  normalizeIban,
  parseIbanInput
} from '../../src/lib/direct-debit/iban';

// IBAN ivoirien publié comme exemple (RIB : CI008 01113 011342912005 89).
const IBAN = 'CI93CI0080111301134291200589';
const RIB = 'CI0080111301134291200589';

describe('direct-debit / iban', () => {
  describe('normalizeIban', () => {
    it('passe en majuscules et retire espaces et tirets', () => {
      expect(normalizeIban(' ci93 ci00-8011 1301 1342 9120 0589 ')).toBe(IBAN);
    });
  });

  describe('clé ISO 13616', () => {
    it("valide l'IBAN d'exemple et refuse une clé altérée", () => {
      expect(isIbanChecksumValid(IBAN)).toBe(true);
      expect(isIbanChecksumValid('CI94CI0080111301134291200589')).toBe(false);
      expect(isIbanChecksumValid('CI93CI0080111301134291200588')).toBe(false);
    });

    it('calcule les chiffres de contrôle depuis le RIB', () => {
      expect(computeIbanCheckDigits(RIB)).toBe('93');
    });
  });

  describe('parseIbanInput', () => {
    it('accepte un IBAN avec ou sans espaces, en minuscules', () => {
      for (const input of [
        IBAN,
        'CI93 CI00 8011 1301 1342 9120 0589',
        IBAN.toLowerCase(),
        'CI93-CI00-8011-1301-1342-9120-0589'
      ]) {
        const result = parseIbanInput(input);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.iban).toBe(IBAN);
          expect(result.fromRib).toBe(false);
        }
      }
    });

    it('extrait le code banque (caractères 5 à 9) et les 4 derniers caractères', () => {
      const result = parseIbanInput(IBAN);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bankCode).toBe('CI008');
        expect(result.last4).toBe('0589');
      }
    });

    it('convertit un RIB de 24 caractères en IBAN CI', () => {
      const result = parseIbanInput(RIB);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.iban).toBe(IBAN);
        expect(result.fromRib).toBe(true);
      }
    });

    it('refuse un IBAN à la clé fausse', () => {
      const result = parseIbanInput('CI94CI0080111301134291200589');
      expect(result).toEqual({ ok: false, error: expect.stringContaining('clé de contrôle') });
    });

    it('refuse une mauvaise longueur', () => {
      expect(parseIbanInput('CI93CI008011130113429120058').ok).toBe(false);
      expect(parseIbanInput('CI93CI00801113011342912005890').ok).toBe(false);
      expect(parseIbanInput('CI93')).toMatchObject({ ok: false });
    });

    it('refuse un autre pays', () => {
      const result = parseIbanInput('FR7630006000011234567890189');
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Côte d') });
    });

    it('refuse une saisie vide ou des caractères interdits', () => {
      expect(parseIbanInput('   ')).toMatchObject({ ok: false });
      expect(parseIbanInput('CI93*CI0080111301134291200589')).toMatchObject({ ok: false });
    });

    it('refuse un IBAN CI dont les chiffres de contrôle ne sont pas des chiffres', () => {
      expect(parseIbanInput('CIAACI0080111301134291200589')).toMatchObject({ ok: false });
    });
  });

  describe('clé RIB (avertissement seulement)', () => {
    it('reconnaît la clé du RIB publié (compte UEMOA de 12 caractères)', () => {
      expect(expectedRibKey(RIB)).toBe('89');
      expect(isRibKeyConsistent(RIB)).toBe(true);
      const result = parseIbanInput(IBAN);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.warnings).toEqual([]);
    });

    it("n'avertit pas quand la clé suit le calcul habituel", () => {
      const body = 'CI00801113011342912005';
      const rib = body + expectedRibKey(body + '00');
      expect(isRibKeyConsistent(rib)).toBe(true);
      const result = parseIbanInput(rib);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.warnings).toEqual([]);
    });

    it('avertit mais accepte quand la clé RIB est incohérente', () => {
      const body = 'CI00801113011342912005';
      const wrong = String((Number(expectedRibKey(body + '00')) % 97) + 1).padStart(2, '0');
      const result = parseIbanInput(body + wrong);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('clé RIB');
      }
    });
  });

  describe('masque', () => {
    it("n'expose que les 4 derniers caractères", () => {
      const masked = maskIban('0589');
      expect(masked).toBe('CI•• •••• •••• •••• •••• 0589');
      expect(masked).not.toContain('93');
      expect(masked).not.toContain('CI00');
    });

    it('formate un IBAN en groupes de 4 pour le PDF', () => {
      expect(formatIbanGroups(IBAN)).toBe('CI93 CI00 8011 1301 1342 9120 0589');
    });
  });
});
