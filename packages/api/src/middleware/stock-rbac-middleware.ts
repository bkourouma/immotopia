import { requireAnyPermission, requirePermission } from './rbac-middleware';

/**
 * Droits du stock de chantier — lot 040 (spec 040, B1, data-model §3).
 *
 * Même forme que `finance-rbac-middleware.ts` : une garde nommée par
 * permission, posée sur la route, plutôt qu'une vérification dispersée dans
 * les contrôleurs. Les routes du stock passent sur ces gardes (B1-R2) ;
 * restent sur `FINANCE_*` l'écriture du référentiel et des réglages, la
 * bascule, le statut et le rapprochement d'un chantier, et sa clôture (B1-R3).
 *
 * Le seed correspondant vit dans `prisma/seeds/stock-permissions-seed.ts`, la
 * migration de données dans `20261008090200_controle_stock_permissions`.
 *
 * Les permissions se lisent par `getUserPermissions` (cache de 5 minutes par
 * instance, B1-R6) : un rôle attribué ou retiré prend effet au plus tard
 * 5 minutes après. Un contrôle qui engage la sécurité d'une écriture et porte
 * sur d'AUTRES utilisateurs que l'appelant (dérogation A1-R3, destinataires de
 * l'e-mail d'alerte) lit la base, jamais ces gardes.
 */

/** Les dix permissions du stock. */
export const STOCK_PERMISSIONS = {
  VIEW: 'STOCK_VIEW',
  VALUES_VIEW: 'STOCK_VALUES_VIEW',
  RECEIVE: 'STOCK_RECEIVE',
  ISSUE: 'STOCK_ISSUE',
  TRANSFER: 'STOCK_TRANSFER',
  COUNT: 'STOCK_COUNT',
  TAKERS_MANAGE: 'STOCK_TAKERS_MANAGE',
  COUNT_VALIDATE: 'STOCK_COUNT_VALIDATE',
  DISPOSE: 'STOCK_DISPOSE',
  ALERTS_VIEW: 'STOCK_ALERTS_VIEW'
} as const;

export type StockPermissionKey = (typeof STOCK_PERMISSIONS)[keyof typeof STOCK_PERMISSIONS];

/** Consulter le stock : référentiel, soldes en quantité, journal, inventaires, preneurs, bons. */
export const requireStockView = requirePermission(STOCK_PERMISSIONS.VIEW);

/** Voir les valeurs, les indicateurs et les filtres par personne. */
export const requireStockValuesView = requirePermission(STOCK_PERMISSIONS.VALUES_VIEW);

/** Enregistrer une réception. */
export const requireStockReceive = requirePermission(STOCK_PERMISSIONS.RECEIVE);

/** Enregistrer une sortie vers un chantier. */
export const requireStockIssue = requirePermission(STOCK_PERMISSIONS.ISSUE);

/** Transférer entre deux lieux. */
export const requireStockTransfer = requirePermission(STOCK_PERMISSIONS.TRANSFER);

/** Ouvrir, compter, clore et justifier un inventaire. */
export const requireStockCount = requirePermission(STOCK_PERMISSIONS.COUNT);

/** Gérer le carnet des preneurs. */
export const requireStockTakersManage = requirePermission(STOCK_PERMISSIONS.TAKERS_MANAGE);

/** Valider ou abandonner un inventaire, écarter une ligne. */
export const requireStockCountValidate = requirePermission(STOCK_PERMISSIONS.COUNT_VALIDATE);

/** Rebut, retour fournisseur, retrait d'une pièce jointe. */
export const requireStockDispose = requirePermission(STOCK_PERMISSIONS.DISPOSE);

/** Consulter et traiter les alertes. */
export const requireStockAlertsView = requirePermission(STOCK_PERMISSIONS.ALERTS_VIEW);

/**
 * Justifier une ligne d'inventaire clos : `STOCK_COUNT` ou
 * `STOCK_COUNT_VALIDATE` (spec A2-R5).
 */
export const requireStockCountOrValidate = requireAnyPermission([
  STOCK_PERMISSIONS.COUNT,
  STOCK_PERMISSIONS.COUNT_VALIDATE
]);

/**
 * Les six droits qui ouvrent un dépôt de pièce jointe (spec B5-R6). La garde
 * de route exige l'un d'eux ; le service vérifie ensuite le droit propre à la
 * cible (sortie, transfert, rebut, bon, ligne d'inventaire).
 */
export const STOCK_ATTACHMENT_DEPOSIT_PERMISSIONS: StockPermissionKey[] = [
  STOCK_PERMISSIONS.RECEIVE,
  STOCK_PERMISSIONS.ISSUE,
  STOCK_PERMISSIONS.TRANSFER,
  STOCK_PERMISSIONS.COUNT,
  STOCK_PERMISSIONS.COUNT_VALIDATE,
  STOCK_PERMISSIONS.DISPOSE
];

/** Garde de route du dépôt d'une pièce jointe : l'un des six droits de dépôt. */
export const requireStockAttachmentDeposit = requireAnyPermission(STOCK_ATTACHMENT_DEPOSIT_PERMISSIONS);
