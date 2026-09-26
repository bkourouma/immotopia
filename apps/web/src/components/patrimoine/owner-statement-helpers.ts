import type { OwnerStatement, OwnerStatementItem } from '../../types/patrimoine-types';
import { t } from '../../i18n/t';

/**
 * Dernière version du calcul — voir `OWNER_STATEMENT_COMPUTATION_VERSION`
 * dans `owner-statement-computation.ts` côté API. Lot 10 : la retenue à la
 * source et le dépôt de garantie conservé entrent dans le net (version 3).
 */
export const CURRENT_STATEMENT_COMPUTATION = 3;

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

/**
 * Lot 10 : la retenue à la source et le dépôt de garantie conservé n'ont pas
 * leur propre colonne sur `OwnerStatement` — ils vivent en lignes `OTHER`
 * du relevé (`owner-statement-computation.ts`), reconnues par leur libellé.
 * Somme sur toutes les lignes du relevé, tous biens confondus.
 */
function sumItemsByLabelPrefix(items: OwnerStatementItem[], labelPrefix: string): number {
  return items
    .filter(item => item.type === 'OTHER' && item.label.startsWith(labelPrefix))
    .reduce((sum, item) => sum + Number(item.amount), 0);
}

export function totalWithholdingTax(statement: Pick<OwnerStatement, 'items'>): number {
  // Le préfixe est comparé au libellé brut produit par le serveur
  // (`owner-statement-computation.ts`), toujours en français : le traduire
  // ferait échouer `.startsWith()` dès que l'écran n'est pas en français.
  return sumItemsByLabelPrefix(statement.items, 'Retenue à la source');
}

export function totalDepositRetained(statement: Pick<OwnerStatement, 'items'>): number {
  return sumItemsByLabelPrefix(statement.items, 'Dépôt de garantie conservé');
}
