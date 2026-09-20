/**
 * Dupliquer une pièce financière — le véhicule de la copie.
 *
 * ---------------------------------------------------------------------------
 * Ce que « dupliquer » veut dire ici
 * ---------------------------------------------------------------------------
 *
 * **Dupliquer PRÉ-REMPLIT le formulaire de saisie, et ne crée rien.** Aucun
 * appel d'écriture ne part au moment du clic ; la pièce naît, comme toujours,
 * du bouton d'enregistrement habituel, en brouillon. C'est le principe du
 * module : une pièce naît d'un geste explicite.
 *
 * Trois choses ne se recopient donc **jamais** : la référence (vide, et son
 * champ reçoit le focus — deux pièces sous la même référence sont une erreur
 * comptable, et on préfère forcer la ressaisie à proposer un « (copie) » qu'il
 * faudrait corriger), la date (celle du jour, jamais celle de l'originale), et
 * tout ce que le serveur calcule ou pose lui-même : numéro de pièce, statut,
 * date de validation, identifiant du validateur, montants facturés ou restants.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi l'état de navigation, et pas l'URL
 * ---------------------------------------------------------------------------
 *
 * L'écran de création d'un bon de commande est le même composant que sa fiche,
 * atteint par `…/bons-de-commande/nouveau`, et il lit déjà `?chantierId=` pour
 * se pré-remplir. On aurait donc pu allonger cette URL. **Trois raisons de ne
 * pas le faire**, et de passer par le `state` de `navigate()` :
 *
 * 1. Une copie transporte des LIGNES — poste, libellé, quantité, prix
 *    unitaire, autant de fois qu'il y en a. Sérialisées en query string, elles
 *    donneraient une URL illisible, plafonnée en longueur, et exigeraient un
 *    format d'encodage maison à maintenir des deux côtés.
 * 2. Le principe posé par les écrans de liste est qu'une URL partageable
 *    **rouvre le même contexte**. Un brouillon pré-rempli n'est pas un
 *    contexte : c'est une intention passagère. Collée dans un message, une
 *    telle URL ressusciterait une saisie à moitié faite chez quelqu'un
 *    d'autre, et un rechargement de page la ferait réapparaître alors qu'on
 *    vient peut-être de l'abandonner.
 * 3. `?chantierId=` reste, lui, un vrai contexte — un identifiant unique et
 *    stable — et continue de vivre dans l'URL. Les deux mécanismes ne se
 *    marchent pas dessus : l'un dit « ce chantier », l'autre « repars de cette
 *    pièce-là ».
 *
 * L'écran destinataire **consomme** l'état dès qu'il l'a appliqué (il se
 * renavigue sur la même adresse avec un état vide) : un retour arrière ou un
 * rechargement ne re-remplit donc pas le formulaire dans le dos de la
 * personne.
 *
 * La pièce de caisse, elle, n'a pas besoin de véhicule du tout : sa
 * duplication se joue dans un seul écran, sur l'unique pièce affichée, et
 * reste de l'état local. La facture fournisseur non plus : son formulaire de
 * saisie est sur le même écran que sa liste — mais elle doit RELIRE le détail
 * de la facture (`getSupplierInvoice`), la liste ne portant ni les lignes ni
 * les imputations.
 */

import type { PurchaseOrder } from '../types/finance-lot3-types';

/** Une ligne de bon de commande, réduite à ce qui se recopie. */
export interface LigneDupliquee {
  costCategoryId: string;
  label: string;
  amount: number;
  quantity: number | null;
  unitPrice: number | null;
}

/**
 * La copie d'un bon de commande, transportée de la liste (ou de la fiche) vers
 * l'écran de saisie par le `state` de `navigate()`.
 *
 * `referenceOrigine` n'est PAS la référence de la copie — celle-ci reste vide.
 * Elle ne sert qu'au message qui annonce le pré-remplissage : dire de quelle
 * pièce on repart vaut mieux qu'un formulaire qui se remplit tout seul sans
 * explication.
 */
export interface DuplicationBonDeCommande {
  siteId: string;
  supplierId: string;
  referenceOrigine: string;
  lignes: LigneDupliquee[];
}

/** Clé sous laquelle la copie voyage dans l'état de navigation. */
export const CLE_DUPLICATION_BON = 'duplicationBonDeCommande';

/**
 * Ce qu'on retient d'un bon pour le dupliquer : son chantier, son fournisseur
 * et ses lignes, et rien d'autre.
 *
 * Écrite ici — et non dans la liste ET dans la fiche, les deux écrans qui
 * offrent l'action — pour qu'un champ oublié d'un côté ne puisse pas
 * réapparaître de l'autre. Ce qui est **volontairement laissé** : le statut,
 * l'état de facturation, la date du bon, et les trois montants calculés par le
 * serveur (total, facturé, reste à facturer).
 */
export function copieDuBon(bon: PurchaseOrder): DuplicationBonDeCommande {
  return {
    siteId: bon.siteId,
    supplierId: bon.supplierId,
    referenceOrigine: bon.reference,
    lignes: bon.lines.map(ligne => ({
      costCategoryId: ligne.costCategoryId,
      label: ligne.label,
      amount: ligne.amount,
      quantity: ligne.quantity ?? null,
      unitPrice: ligne.unitPrice ?? null
    }))
  };
}

/**
 * Lit une copie de bon dans un état de navigation, ou `null`.
 *
 * L'état de navigation vient du navigateur : il survit à un retour arrière et
 * peut avoir été écrit par une version précédente de l'application. On le
 * vérifie donc champ par champ plutôt que de le croire sur parole — un objet
 * mal formé pré-remplirait le formulaire avec des `undefined`, que l'écran
 * enverrait ensuite au serveur.
 */
export function lireDuplicationBon(state: unknown): DuplicationBonDeCommande | null {
  if (!state || typeof state !== 'object') return null;
  const brut = (state as Record<string, unknown>)[CLE_DUPLICATION_BON];
  if (!brut || typeof brut !== 'object') return null;

  const { siteId, supplierId, referenceOrigine, lignes } = brut as Record<string, unknown>;
  if (typeof siteId !== 'string' || typeof supplierId !== 'string') return null;
  if (!Array.isArray(lignes)) return null;

  const lignesValides = lignes
    .filter((ligne): ligne is Record<string, unknown> => Boolean(ligne) && typeof ligne === 'object')
    .filter(ligne => typeof ligne.costCategoryId === 'string' && typeof ligne.label === 'string')
    .map(ligne => ({
      costCategoryId: ligne.costCategoryId as string,
      label: ligne.label as string,
      amount: typeof ligne.amount === 'number' ? ligne.amount : 0,
      quantity: typeof ligne.quantity === 'number' ? ligne.quantity : null,
      unitPrice: typeof ligne.unitPrice === 'number' ? ligne.unitPrice : null
    }));

  return {
    siteId,
    supplierId,
    // Jamais `undefined` : i18next laisse le gabarit `{{reference}}` visible à
    // l'écran quand la valeur interpolée manque.
    referenceOrigine: typeof referenceOrigine === 'string' ? referenceOrigine : '',
    lignes: lignesValides
  };
}
