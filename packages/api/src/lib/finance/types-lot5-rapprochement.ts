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
 * ### Correction : une livraison interne n'est pas un achat
 *
 * Ce contrat mettait d'abord les réceptions **et** les transferts reçus dans
 * une seule grandeur, `receivedValue`, confrontée à `invoicedAmount`. C'était
 * faux, et faux dans le cas le plus courant : un chantier alimenté depuis un
 * magasin central n'a aucune facture à son nom, `invoicedAmount` vaut zéro,
 * et l'écart affichait l'opposé de tout ce qui lui avait été livré — un
 * nombre négatif qui ne voulait rien dire.
 *
 * Les deux entrées sont donc séparées, parce que ce sont deux choses
 * différentes :
 *
 *   `receivedValue`      ce qui est entré depuis une facture fournisseur
 *   `transferredInValue` ce qui est venu d'un autre lieu de l'agence
 *
 * Seule la première se confronte au facturé. La seconde a déjà été payée
 * ailleurs, ou ne l'a jamais été — la compter réduirait un écart sans qu'aucun
 * fournisseur n'ait rien apporté.
 *
 * Relevé par l'agent du service, qui a écrit que sur un chantier alimenté
 * surtout par transferts l'écart serait « structurellement négatif et
 * difficile à lire ». Un indicateur qui se trompe dans le cas courant est pire
 * qu'un indicateur absent.
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
  /** Entré dans le lieu du chantier depuis une FACTURE. */
  receivedQuantity: number;
  /**
   * Entré depuis un autre lieu de l'agence.
   *
   * Compté à part, jamais mêlé au reçu : une livraison interne n'est pas un
   * achat, et la confondre fausse l'écart. Voir l'en-tête.
   */
  transferredInQuantity: number;
  /** Sorti vers ce chantier, depuis n'importe quel lieu. C'est le consommé. */
  issuedQuantity: number;
  /** Ce qui reste au lieu du chantier, à l'instant de la lecture. */
  remainingQuantity: number;
  /** Valeur entrée depuis une facture. */
  receivedValue: number;
  /** Valeur venue d'un autre lieu. Comptée à part — voir l'en-tête. */
  transferredInValue: number;
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
  /**
   * Ce qui est réellement entré en stock **depuis une facture**, en valeur.
   *
   * Les transferts reçus n'y sont pas : voir `transferredInValue`.
   */
  receivedValue: number;
  /**
   * Ce qui est venu d'un autre lieu de l'agence.
   *
   * Ne se confronte à rien : cette matière a été payée ailleurs, ou jamais.
   * Exposée parce qu'elle explique une bonne part du restant, et qu'un
   * restant sans explication se lit comme une anomalie.
   */
  transferredInValue: number;
  /**
   * `invoicedAmount − receivedValue`. **L'écart, et il est réel.**
   *
   * Positif : on a facturé plus qu'il n'est entré. Vol, erreur, ou frais de
   * transport que la facture portait — le système ne sait pas les distinguer
   * et ne prétend pas le faire. Voir l'en-tête.
   *
   * **Vaut zéro quand le chantier n'a pas basculé**, et n'est alors pas
   * déduit : sans période de bascule il n'y a aucune facture à confronter, et
   * la soustraction rendrait l'opposé de tout ce qui est entré.
   *
   * Les transferts reçus n'entrent PAS dans ce calcul. Une livraison interne
   * n'est pas un achat.
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
 * Fonctionne aussi sur un chantier qui n'a pas basculé. Refuser serait
 * obliger l'écran à savoir d'avance ce qu'il vient demander.
 *
 * ### Correction : un chantier non basculé ne montre PAS que des zéros
 *
 * Ce paragraphe disait « tout y vaut zéro ». C'était faux, et cela cachait
 * une donnée réelle : rien n'empêche de sortir du stock d'un magasin central
 * vers un chantier qui n'a pas basculé, et ces sorties ont bel et bien imputé
 * son coût. Les afficher à zéro aurait fait mentir l'écran sur un chiffre qui
 * existe.
 *
 * Ce qui vaut zéro sans bascule, ce sont les **deux seuls chiffres qui en
 * dépendent** : `invoicedAmount` — il n'y a pas de période de bascule, donc
 * aucune facture à confronter — et par conséquent `unreconciledAmount`. Le
 * consommé, le reçu et le restant disent la vérité dans tous les cas.
 *
 * Relevé par l'agent du service, qui a implémenté la lettre du contrat tout
 * en écrivant que c'était le seul endroit où son rendu cachait une donnée
 * réelle. C'était la bonne réaction, et c'est le contrat qui avait tort.
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
