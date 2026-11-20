/**
 * Devises sans sous-unité (franc CFA et assimilés) : jamais de décimales.
 * Source unique côté web ; miroir de `ZERO_DECIMAL_CURRENCIES` dans
 * `packages/api/src/lib/syndics/charge-allocation-methods.ts` (garder identiques).
 */
export const ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
  'XOF',
  'XAF',
  'FCFA',
  'CFA',
  'XPF',
  'GNF',
  'KMF',
  'DJF',
  'BIF',
  'RWF'
]);

/** Insensible à la casse et aux espaces. */
export function isZeroDecimalCurrency(currency: string | null | undefined): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(
    String(currency ?? '')
      .replace(/\s/g, '')
      .toUpperCase()
  );
}
