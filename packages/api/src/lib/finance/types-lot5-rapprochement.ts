/**
 * Contrat gelé — lot 5, quatrième sous-lot : la bascule d'un chantier au
 * stock, et le rapprochement acheté / consommé / restant (PRD E9, besoins S7
 * et principe P-7).
 *
 * Écrit **avant** les implémentations, et il ne bouge plus.
 *
 * ---------------------------------------------------------------------------
 * La bascule : explicite, par chantier, irréversible
 * ---------------------------------------------------------------------------
 *
 * `ConstructionSite.stockEnabledAt` porte la date depuis le lot 2, où elle
 * avait été posée en prévision de celui-ci et que personne ne lisait. À
 * partir de cette date, une facture de matériaux rattachée au chantier ne
 * s'impute plus à son coût : elle entre en stock, et c'est la **sortie** qui
 * impute (principe P-7).
 *
 * ### Pourquoi il n'y a pas de route pour revenir en arrière
 *
 * Revenir en arrière obligerait à rejouer l'imputation de toutes les factures
 * postérieures à la bascule, et à défaire celle de toutes les sorties. Le coût
 * du chantier changerait sous les pieds de celui qui le regarde, et rien ne
 * dirait pourquoi. Le PRD dit « irréversible » ; ce contrat n'offre donc
 * aucune fonction de retour, pas même réservée à un administrateur.
 *
 * Une agence qui bascule par erreur un chantier n'a qu'un recours : ne plus
 * s'en servir. C'est sévère, c'est dit d'avance, et c'est plus honnête qu'un
 * retour arrière qui laisserait des chiffres faux derrière lui.
 *
 * ### Ce que la bascule fait, concrètement
 *
 * Elle date `stockEnabledAt` et **crée le lieu de stockage du chantier** s'il
 * n'en a pas : sans lieu, une réception pour ce chantier n'aurait nulle part
 * où atterrir, et l'utilisateur découvrirait le manque au pire moment.
 *
 * ### Ce qu'elle NE fait pas, et qui revient au superviseur
 *
 * Brancher la bascule dans la validation de facture — faire que
 * `validateSupplierInvoiceTx` débite le 311 au lieu du compte de charge et
 * n'écrive aucune imputation quand le chantier est au stock — est un geste
 * transverse, dans un fichier qui n'appartient pas à ce sous-lot. Il est posé
 * à l'intégration, exactement comme `assertSiteOpenTx` au lot 4.
 *
 * **Tant qu'il n'est pas posé, la bascule ne change rien et le coût est
 * compté deux fois.** C'est écrit ici pour que personne ne suppose le
 * contraire : la leçon du lot 4, où trois sous-lots sont restés du code mort
 * faute de ce branchement, a coûté assez cher pour être retenue.
 *
 * ---------------------------------------------------------------------------
 * Le rapprochement : ce qu'on a payé face à ce qui est arrivé
 * ---------------------------------------------------------------------------
 *
 * Le besoin S7 demande « acheté / consommé / restant par chantier, par
 * article ; l'écart non justifié mis en évidence ».
 *
 * Il faut être précis sur ce qu'« écart » veut dire, parce que la lecture
 * naïve ne donne rien. **Entré − sorti − restant vaut zéro par
 * construction** : c'est une identité comptable, pas une mesure. Un
 * rapprochement bâti là-dessus afficherait toujours zéro et rassurerait à
 * tort.
 *
 * L'écart qui existe vraiment est ailleurs :
 *
 * ```
 * ce que le fournisseur a facturé au chantier      invoicedAmount
 * ce qui est réellement entré en stock             receivedValue
 * ----------------------------------------------------------------
 * l'écart, et il est réel                          unreconciledAmount
 * ```
 *
 * On a payé cent sacs, quatre-vingt-dix sont arrivés. Ou bien la facture
 * portait aussi du transport, qui n'entre pas en stock. Le premier cas est un
 * vol ou une erreur, le second est normal — **et le système ne sait pas les
 * distinguer**. Il montre l'écart et laisse un humain trancher ; prétendre
 * l'interpréter serait accuser quelqu'un sur une soustraction.
 *
 * C'est aussi l'écart entre le compte 311 et la valeur du stock, annoncé dans
 * l'en-tête du contrat des mouvements.
 *
 * ### Et par article, en quantités
 *
 * Reçu, sorti, restant. Ces trois-là se lisent, ne se soustraient pas entre
 * eux pour produire un quatrième chiffre, et disent simplement où en est
 * chaque matériau sur ce chantier.
 */

import type { PrismaTransactionClient } from '../../utils/database';

import { NotImplementedYetError } from './types';

// ---------------------------------------------------------------------------
// La bascule
// ---------------------------------------------------------------------------

export interface SiteStockStatusRecord {
  siteId: string;
  siteLabel: string;
  /** Nulle tant que le chantier n'est pas passé au stock. */
  stockEnabledAt: Date | null;
  /** Le lieu de stockage du chantier. Nul tant qu'il n'a pas basculé. */
  stockLocationId: string | null;
  stockLocationLabel: string | null;
}

/**
 * Fait passer un chantier au stock. **Irréversible** — voir l'en-tête.
 *
 * Date `stockEnabledAt` et crée le lieu de stockage du chantier s'il n'en a
 * pas encore.
 *
 * Refuse un chantier déjà basculé : redater la bascule changerait quelles
 * factures s'imputent et quelles factures entrent en stock, rétroactivement.
 *
 * Refuse un chantier clos : basculer ce qu'on a déclaré fini n'a pas de sens,
 * et un chantier clos n'accepte de toute façon plus d'imputation.
 *
 * **Ne touche à aucune facture passée.** La bascule vaut pour la suite. Les
 * factures déjà imputées le restent — les défaire ferait baisser le coût d'un
 * chantier sans qu'aucune dépense n'ait été annulée.
 */
export type EnableStockOnSiteTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  siteId: string,
  params: { enabledAt: Date }
) => Promise<SiteStockStatusRecord>;

export type GetSiteStockStatus = (tenantId: string, siteId: string) => Promise<SiteStockStatusRecord>;

/**
 * Dit si le chantier était au stock à une date donnée.
 *
 * C'est la fonction que la validation de facture appellera à l'intégration.
 * Elle prend la **date de la pièce**, pas l'instant présent : une facture du
 * mois dernier, saisie aujourd'hui sur un chantier basculé hier, appartient à
 * l'avant — et doit s'imputer comme avant.
 *
 * Renvoie `false` pour un chantier inexistant plutôt que de lever : ce n'est
 * pas son travail, et l'appelant a déjà lu le chantier.
 */
export type IsSiteStockEnabledTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  siteId: string,
  at: Date
) => Promise<boolean>;

// ---------------------------------------------------------------------------
// Le rapprochement
// ---------------------------------------------------------------------------

export interface SiteStockReconciliationLine {
  itemId: string;
  itemReference: string;
  itemLabel: string;
  itemUnit: string;
  /** Entré dans le lieu du chantier : réceptions et transferts reçus. */
  receivedQuantity: number;
  /** Sorti vers ce chantier, depuis n'importe quel lieu. C'est le consommé. */
  issuedQuantity: number;
  /** Ce qui reste au lieu du chantier, à l'instant de la lecture. */
  remainingQuantity: number;
  /** Valeur de ce qui a été consommé. C'est ce qui est entré dans le coût. */
  issuedValue: number;
  /** Valeur de ce qui reste. */
  remainingValue: number;
  currency: string;
}

export interface SiteStockReconciliationRecord {
  siteId: string;
  siteLabel: string;
  stockEnabledAt: Date | null;
  /**
   * Ce que les fournisseurs ont facturé au chantier depuis la bascule.
   *
   * Factures validées et non annulées, rattachées au chantier, postérieures à
   * `stockEnabledAt`.
   */
  invoicedAmount: number;
  /** Ce qui est réellement entré en stock, en valeur. */
  receivedValue: number;
  /**
   * `invoicedAmount − receivedValue`. **L'écart, et il est réel.**
   *
   * Positif : on a facturé plus qu'il n'est entré. Vol, erreur, ou frais de
   * transport que la facture portait — le système ne sait pas les distinguer
   * et ne prétend pas le faire. Voir l'en-tête.
   */
  unreconciledAmount: number;
  /** Total consommé, en valeur. C'est la part du coût du chantier qui vient du stock. */
  issuedValue: number;
  /** Total restant sur le chantier, en valeur. */
  remainingValue: number;
  currency: string;
  lines: SiteStockReconciliationLine[];
}

/**
 * Le rapprochement d'un chantier, article par article.
 *
 * **Lecture seule, et tout y est calculé.** Aucun de ces chiffres n'est une
 * colonne.
 *
 * Fonctionne aussi sur un chantier qui n'a pas basculé : tout y vaut zéro, et
 * `stockEnabledAt` nul le dit. Refuser serait obliger l'écran à savoir
 * d'avance ce qu'il vient demander.
 */
export type GetSiteStockReconciliation = (tenantId: string, siteId: string) => Promise<SiteStockReconciliationRecord>;

// ---------------------------------------------------------------------------
// Talons
// ---------------------------------------------------------------------------

export const enableStockOnSiteTxStub: EnableStockOnSiteTx = async () => {
  throw new NotImplementedYetError('enableStockOnSiteTx');
};

export const getSiteStockStatusStub: GetSiteStockStatus = async () => {
  throw new NotImplementedYetError('getSiteStockStatus');
};

export const isSiteStockEnabledTxStub: IsSiteStockEnabledTx = async () => {
  throw new NotImplementedYetError('isSiteStockEnabledTx');
};

export const getSiteStockReconciliationStub: GetSiteStockReconciliation = async () => {
  throw new NotImplementedYetError('getSiteStockReconciliation');
};
