import { t } from '../i18n/t';

/**
 * Les natures d'une imputation de chantier, telles qu'elles se lisent.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi cette table n'est pas `DOCUMENT_TYPE_LABELS`
 * ---------------------------------------------------------------------------
 *
 * `DOCUMENT_TYPE_LABELS` (`finance-lot2-types.ts`) nomme les pièces
 * **annulables** : facture fournisseur, règlement fournisseur, pièce de
 * caisse. Trois valeurs, et c'est tout ce que le moteur d'annulation connaît.
 *
 * Les imputations, elles, viennent de **sept** sources
 * (`CostAllocationSourceType`, schéma Prisma) : les trois ci-dessus plus la
 * note de salaire, la situation de tâcheron, la sortie de stock et la
 * constatation de loyer de terrain. L'écran du chantier se servait de la
 * table des pièces annulables pour nommer ces sept natures, et les quatre
 * qu'elle ignore retombaient donc sur leur **code technique** : le tableau des
 * imputations affichait `SALARY_NOTE` en toutes lettres à côté de « Facture
 * fournisseur » et « Pièce de caisse ». Relevé par le test de bout en bout du
 * 20 septembre 2026.
 *
 * Deux tables, donc, parce qu'il y a deux ensembles : confondre « ce qui
 * s'annule » et « ce qui impute » est précisément ce qui a produit le défaut.
 *
 * La clé est indexée en `string` à dessein : la valeur arrive du serveur, et
 * une nature ajoutée en base sans passer par ici doit s'afficher telle quelle
 * plutôt que de faire tomber l'écran.
 */
export function libelleNatureImputation(nature: string): string {
  const libelles: Record<string, string> = {
    SUPPLIER_INVOICE: t('Facture fournisseur'),
    SUPPLIER_PAYMENT: t('Règlement fournisseur'),
    CASH_VOUCHER: t('Pièce de caisse'),
    SALARY_NOTE: t('Note de salaire'),
    PROGRESS_STATEMENT: t('Situation de tâcheron'),
    STOCK_ISSUE: t('Sortie de stock'),
    LAND_LEASE_ACCRUAL: t('Loyer de terrain')
  };

  return libelles[nature] ?? nature;
}
