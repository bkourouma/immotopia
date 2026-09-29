/**
 * Le mode de règlement fournisseur porte le compte de trésorerie sous la forme
 * `MODE@<uuid>` dans une colonne libre. Un mode malformé (saisie libre avec
 * « @ ») ne doit ni s'enregistrer ni rendre la liste des règlements illisible.
 */
import { packPaymentMethod, unpackPaymentMethod } from '../../src/lib/finance/supplier-payment-method';

const ACCOUNT = '11111111-2222-4333-8444-555555555555';

describe('packPaymentMethod', () => {
  it('accepte les six modes connus, avec ou sans compte', () => {
    for (const mode of ['CASH', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY', 'CARD', 'OTHER']) {
      expect(packPaymentMethod(mode, null)).toBe(mode);
      expect(packPaymentMethod(mode, ACCOUNT)).toBe(`${mode}@${ACCOUNT}`);
    }
  });

  it('refuse un mode hors liste et toute saisie contenant « @ »', () => {
    expect(() => packPaymentMethod('Espèces', null)).toThrow(/mode de règlement/i);
    expect(() => packPaymentMethod('CASH@evil', null)).toThrow(/mode de règlement/i);
    expect(() => packPaymentMethod('@', ACCOUNT)).toThrow(/mode de règlement/i);
  });
});

describe('unpackPaymentMethod', () => {
  it('relit un mode et son compte', () => {
    expect(unpackPaymentMethod(`CASH@${ACCOUNT}`)).toEqual({ method: 'CASH', treasuryAccountId: ACCOUNT });
    expect(unpackPaymentMethod('CHECK')).toEqual({ method: 'CHECK', treasuryAccountId: null });
  });

  it("ignore un identifiant qui n'est pas un UUID, sans jamais lever", () => {
    expect(unpackPaymentMethod('CASH@pas-un-uuid')).toEqual({ method: 'CASH', treasuryAccountId: null });
    expect(unpackPaymentMethod('a@b@c')).toEqual({ method: 'a', treasuryAccountId: null });
    expect(unpackPaymentMethod('CASH@')).toEqual({ method: 'CASH', treasuryAccountId: null });
    expect(unpackPaymentMethod('@')).toEqual({ method: '', treasuryAccountId: null });
  });
});
