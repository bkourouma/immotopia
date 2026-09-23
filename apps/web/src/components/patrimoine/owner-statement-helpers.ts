import type { OwnerStatement } from '../../types/patrimoine-types';
import { t } from '../../i18n/t';

/** Dernière version du calcul — voir `owner-statement-computation.ts` côté API. */
export const CURRENT_STATEMENT_COMPUTATION = 2;

/**
 * Relevé produit par l'ancien calcul, qui prenait le loyer du contrat pour un
 * loyer encaissé et ne déduisait aucun honoraire.
 */
export function isLegacyStatement(statement: Pick<OwnerStatement, 'computationVersion'>): boolean {
  return (statement.computationVersion ?? 1) < CURRENT_STATEMENT_COMPUTATION;
}

export function statementStatusLabel(status: OwnerStatement['status']): string {
  if (status === 'DRAFT') return t('Brouillon');
  if (status === 'SENT') return t('Envoyé');
  if (status === 'PAID') return t('Payé');
  return status;
}
