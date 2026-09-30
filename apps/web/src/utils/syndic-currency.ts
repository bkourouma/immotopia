/**
 * Devise affichée dans les écrans Syndic : le franc CFA se lit « FCFA » partout
 * dans l'application, jamais son code ISO « XOF » / « XAF » (BUG-2026-09-30-088).
 * `undefined` reste `undefined` (l'appelant n'a rien dit : le composant de
 * montant applique sa devise par défaut) et `null` reste `null` (pas de devise).
 */
export function displayCurrency(code: string | null | undefined): string | null | undefined {
  if (code === undefined || code === null) return code;
  const upper = code.trim().toUpperCase();
  return upper === 'XOF' || upper === 'XAF' ? 'FCFA' : code;
}
