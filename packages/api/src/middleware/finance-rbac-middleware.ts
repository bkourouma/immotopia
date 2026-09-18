import { requirePermission } from './rbac-middleware';

/**
 * Droits du module financier operationnel — lot 1.
 *
 * Meme forme que `rental-rbac-middleware.ts` : un garde nomme par permission,
 * pose sur la route, plutot qu'une verification dispersee dans les
 * controleurs.
 *
 * **La saisie et la validation sont deux droits distincts** des maintenant,
 * alors que le lot 1 ne livre aucune piece a valider. C'est deliberé :
 * l'organisation cible de la cliente est « plusieurs saisisseurs, un
 * validateur » (decision D7), et rendre cette separation possible apres coup
 * couterait bien plus cher que de la poser des l'origine. Au lot 1, les deux
 * droits peuvent etre attribues au meme role ; au lot 2, ils se separent sans
 * qu'aucune route ne change.
 *
 * Le seed correspondant vit dans `prisma/seeds/finance-permissions-seed.ts`.
 */

/** Lire les comptes de tiers et leurs releves. */
export const requireAccountsRead = requirePermission('FINANCE_ACCOUNTS_READ');

/** Lire les balances et les comptes rendus de campagne. */
export const requireReportsRead = requirePermission('FINANCE_REPORTS_READ');

/** Creer une piece : campagne de facturation, et au lot 2 facture et bon de caisse. */
export const requireDocumentsCreate = requirePermission('FINANCE_DOCUMENTS_CREATE');

/** Valider une piece. Distinct de la creation, voir l'en-tete. */
export const requireDocumentsValidate = requirePermission('FINANCE_DOCUMENTS_VALIDATE');

/** Gerer les chantiers. Sans objet au lot 1, pose pour le lot 2. */
export const requireSitesManage = requirePermission('FINANCE_SITES_MANAGE');

/** Parametrer le module : plan de comptes, postes de depense. Lot 2. */
export const requireSettingsManage = requirePermission('FINANCE_SETTINGS_MANAGE');
