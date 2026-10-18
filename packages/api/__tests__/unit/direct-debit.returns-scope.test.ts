/**
 * Périmètre du service de retour banque (spec 042, P4, data-model §9) : une
 * remise ou un import de copropriété ne se lit qu'avec le syndicat de la
 * route ; le locatif ne voit jamais une remise de copropriété.
 */
import {
  remittanceScopeWhere,
  returnImportScopeWhere,
  scopeOf,
  syndicateIdOf
} from '../../src/lib/direct-debit/returns/shared';

describe('périmètre du retour banque', () => {
  const rental = { scope: 'RENTAL_LEASE' } as const;
  const syndic = { scope: 'SYNDIC_LOT', syndicateId: 'syn-1' } as const;

  it('locatif : filtre sur le périmètre, sans syndicat', () => {
    expect(remittanceScopeWhere(rental)).toEqual({ scope: 'RENTAL_LEASE' });
    expect(returnImportScopeWhere(rental)).toEqual({ scope: 'RENTAL_LEASE' });
    expect(scopeOf(rental)).toBe('RENTAL_LEASE');
    expect(syndicateIdOf(rental)).toBeNull();
  });

  it('copropriété : le syndicat de la route s’ajoute au périmètre (remises et imports)', () => {
    expect(remittanceScopeWhere(syndic)).toEqual({ scope: 'SYNDIC_LOT', syndicateId: 'syn-1' });
    expect(returnImportScopeWhere(syndic)).toEqual({ scope: 'SYNDIC_LOT', syndicateId: 'syn-1' });
    expect(scopeOf(syndic)).toBe('SYNDIC_LOT');
    expect(syndicateIdOf(syndic)).toBe('syn-1');
  });
});
