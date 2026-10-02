import { t } from '../../i18n/t';
import { estUneFormuleRefusee } from './formules';
import { entreesIndexees } from './referentiel';
import {
  decouperPeriode,
  nettoyerEntier,
  nettoyerMontant,
  normaliserTexte,
  rapprocherLibelleIndexe,
  versDateISO,
  versPeriodeISO
} from './valeurs';
import type {
  CelluleEvaluee,
  ChampDocument,
  ContexteImportation,
  DescripteurNature,
  LigneEvaluee,
  ValeursLigne
} from './types';

/**
 * Le rapprochement des colonnes, puis l'évaluation d'une ligne.
 *
 * Deux gestes distincts, et c'est voulu :
 *
 *  - **rapprocher** répond à « quelle colonne du fichier est quel champ du
 *    document ». Il se fait une fois, sur les en-têtes, et la personne le
 *    corrige à la main ;
 *  - **évaluer** répond à « que vaut cette ligne, et peut-elle partir ». Il
 *    se rejoue à CHAQUE modification d'une cellule dans l'aperçu, parce que
 *    changer « 1 250,50 » en « 1250 » change aussi la validité de la ligne.
 *
 * Aucune des deux fonctions ne connaît de nature : elles ne lisent que le
 * descripteur qu'on leur passe.
 */

// ---------------------------------------------------------------------------
// Étape 3 — la colonne du fichier et le champ du document
// ---------------------------------------------------------------------------

/**
 * À quel point cet en-tête ressemble à ce champ. 0 = aucun rapport.
 *
 * L'échelle est grossière à dessein : une proposition n'a pas à être juste à
 * tous les coups, elle a à être corrigible. Trois paliers suffisent, et un
 * palier vaut mieux qu'un score continu que personne ne saurait régler.
 */
export function scoreEntete(entete: string, champ: ChampDocument): number {
  const cible = normaliserTexte(entete);
  if (cible === '') return 0;

  const candidats = [champ.libelle, ...champ.entetes].map(normaliserTexte).filter(candidat => candidat !== '');

  for (const candidat of candidats) {
    if (candidat === cible) return 100;
  }
  for (const candidat of candidats) {
    // Même garde que ci-dessous : une abréviation d'une ou deux lettres (« m »
    // pour « m² ») est préfixe de « montant » et rapprocherait n'importe quoi.
    const court = cible.length < candidat.length ? cible : candidat;
    if (court.length < 3) continue;
    if (cible.startsWith(candidat) || candidat.startsWith(cible)) return 70;
  }
  for (const candidat of candidats) {
    // Un candidat d'une ou deux lettres (« pu », « qté ») inclus dans un
    // en-tête long rapprocherait n'importe quoi : on l'exige entier.
    if (candidat.length >= 4 && (cible.includes(candidat) || candidat.includes(cible))) return 50;
  }
  return 0;
}

/**
 * Propose, pour chaque colonne du fichier, le champ du document le plus
 * probable.
 *
 * Attribution gloutonne sur le meilleur score d'abord : une colonne « Date de
 * la pièce » prend le champ `voucherDate` avant qu'une colonne « Date » plus
 * vague ne le réclame. **Un champ n'est proposé qu'une fois** — deux colonnes
 * imputées au même champ, c'est une donnée écrasée en silence.
 *
 * @returns un tableau parallèle aux colonnes : la clé du champ, ou `null`.
 */
export function proposerRapprochement(colonnes: string[], champs: ChampDocument[]): Array<string | null> {
  const paires: Array<{ colonne: number; champ: string; score: number }> = [];

  colonnes.forEach((entete, index) => {
    for (const champ of champs) {
      const score = scoreEntete(entete, champ);
      if (score > 0) paires.push({ colonne: index, champ: champ.cle, score });
    }
  });

  paires.sort((a, b) => b.score - a.score || a.colonne - b.colonne);

  const rapprochement: Array<string | null> = colonnes.map(() => null);
  const champsPris = new Set<string>();

  for (const paire of paires) {
    if (rapprochement[paire.colonne] !== null) continue;
    if (champsPris.has(paire.champ)) continue;
    rapprochement[paire.colonne] = paire.champ;
    champsPris.add(paire.champ);
  }

  return rapprochement;
}

/**
 * Les champs obligatoires qu'aucune colonne ne porte et qu'aucune valeur par
 * défaut ne comble. Tant que la liste n'est pas vide, l'aperçu est bloqué —
 * et l'écran dit lesquels manquent, jamais un « formulaire incomplet » nu.
 */
export function champsObligatoiresManquants(
  descripteur: DescripteurNature,
  rapprochement: Array<string | null>
): ChampDocument[] {
  const rapproches = new Set(rapprochement.filter((cle): cle is string => cle !== null));
  return descripteur.champs.filter(champ => champ.obligatoire && !rapproches.has(champ.cle) && !champ.valeurParDefaut);
}

// ---------------------------------------------------------------------------
// Étape 4 — ce que vaut une ligne
// ---------------------------------------------------------------------------

/** Convertit une cellule selon le type du champ, et dit pourquoi si elle échoue. */
function evaluerCellule(champ: ChampDocument, texte: string, contexte: ContexteImportation): CelluleEvaluee {
  const brut = texte.trim();

  if (brut === '') {
    const defaut = champ.valeurParDefaut ? champ.valeurParDefaut(contexte) : null;
    if (defaut !== null && defaut !== undefined) {
      return evaluerCellule(champ, String(defaut), contexte);
    }
    if (champ.obligatoire) {
      return { texte, valeur: null, erreur: t('« {{champ}} » est vide.', { champ: t(champ.libelle) }) };
    }
    return { texte, valeur: null };
  }

  // Une formule (« = » ou « @ » en tête) est refusée pour TOUT type de champ : un
  // tableur l'exécuterait, et un nombre ou une date n'en commence jamais par un.
  if (estUneFormuleRefusee(brut)) {
    return {
      texte,
      valeur: null,
      erreur: t('« {{champ}} » ne peut pas commencer par « = » ou « @ » (formule refusée).', {
        champ: t(champ.libelle)
      })
    };
  }

  switch (champ.type) {
    case 'texte':
      return { texte, valeur: brut };

    case 'montant':
    case 'quantite': {
      const valeur = nettoyerMontant(brut);
      if (valeur === null) {
        return {
          texte,
          valeur: null,
          erreur: t("« {{champ}} » : « {{valeur}} » n'est pas un nombre.", { champ: t(champ.libelle), valeur: brut })
        };
      }
      if (valeur < 0) {
        return {
          texte,
          valeur: null,
          erreur: t('« {{champ}} » ne peut pas être négatif.', { champ: t(champ.libelle) })
        };
      }
      if (champ.type === 'quantite' && valeur === 0) {
        return {
          texte,
          valeur: null,
          erreur: t('« {{champ}} » ne peut pas être nulle.', { champ: t(champ.libelle) })
        };
      }
      return { texte, valeur };
    }

    case 'entier': {
      const valeur = nettoyerEntier(brut);
      if (valeur === null) {
        return {
          texte,
          valeur: null,
          erreur: t("« {{champ}} » : « {{valeur}} » n'est pas un nombre entier.", {
            champ: t(champ.libelle),
            valeur: brut
          })
        };
      }
      return { texte, valeur };
    }

    case 'date': {
      const valeur = versDateISO(brut);
      if (valeur === null) {
        return {
          texte,
          valeur: null,
          erreur: t("« {{champ}} » : « {{valeur}} » n'est pas une date.", { champ: t(champ.libelle), valeur: brut })
        };
      }
      return { texte, valeur };
    }

    case 'periode': {
      const valeur = versPeriodeISO(brut);
      if (valeur === null || decouperPeriode(valeur) === null) {
        return {
          texte,
          valeur: null,
          erreur: t("« {{champ}} » : « {{valeur}} » n'est pas un mois.", { champ: t(champ.libelle), valeur: brut })
        };
      }
      return { texte, valeur };
    }

    case 'reference': {
      if (!champ.referentiel) {
        return {
          texte,
          valeur: null,
          erreur: t('« {{champ}} » : aucune liste de référence déclarée.', { champ: t(champ.libelle) })
        };
      }
      const index = entreesIndexees(champ.referentiel, contexte.referentiel);
      const resultat = rapprocherLibelleIndexe(index, brut, { exacte: champ.correspondanceExacte === true });
      if (!resultat.trouve) {
        const motif =
          resultat.motif === 'ambigu'
            ? t('« {{champ}} » : « {{valeur}} » correspond à plusieurs entrées. Précisez.', {
                champ: t(champ.libelle),
                valeur: brut
              })
            : t('« {{champ}} » : « {{valeur}} » est introuvable dans la liste.', {
                champ: t(champ.libelle),
                valeur: brut
              });
        return { texte, valeur: null, erreur: motif };
      }
      return { texte, valeur: resultat.entree.id, libelleResolu: resultat.entree.libelle };
    }

    default:
      return { texte, valeur: brut };
  }
}

/**
 * Évalue une ligne entière : conversion de chaque cellule, puis les règles du
 * descripteur.
 *
 * `textes` porte ce que la personne voit — le contenu du fichier, ou sa
 * correction. Les champs absents du rapprochement sont présents avec une
 * chaîne vide, ce qui déclenche leur valeur par défaut le cas échéant.
 */
export function evaluerLigne(
  descripteur: DescripteurNature,
  numero: number,
  textes: Record<string, string>,
  contexte: ContexteImportation,
  selectionnee = true
): LigneEvaluee {
  const cellules: Record<string, CelluleEvaluee> = {};
  const erreurs: string[] = [];

  for (const champ of descripteur.champs) {
    const cellule = evaluerCellule(champ, textes[champ.cle] ?? '', contexte);
    cellules[champ.cle] = cellule;
    if (cellule.erreur) erreurs.push(cellule.erreur);
  }

  if (descripteur.chantier === 'exige' && !contexte.siteId) {
    erreurs.push(t('Aucun chantier choisi : cette nature en exige un.'));
  }

  if (erreurs.length === 0 && descripteur.valider) {
    erreurs.push(...descripteur.valider(valeursDeLaLigne(cellules), contexte));
  }

  return { numero, selectionnee, cellules, erreurs, doublon: null };
}

/** Les valeurs converties, sous la forme que `construire()` et `empreinte()` lisent. */
export function valeursDeLaLigne(cellules: Record<string, CelluleEvaluee>): ValeursLigne {
  const valeurs: ValeursLigne = {};
  for (const [cle, cellule] of Object.entries(cellules)) {
    valeurs[cle] = cellule.valeur;
  }
  return valeurs;
}

/**
 * Marque les lignes qui ressemblent à une pièce déjà en base.
 *
 * **Signalé, jamais refusé** : deux dépenses identiques le même jour, ça
 * existe. La ligne reste cochée ; c'est la personne qui décoche. Les
 * doublons INTERNES au fichier sont marqués eux aussi — un tableur recopié
 * deux fois est le cas le plus fréquent.
 */
export function marquerDoublons(
  descripteur: DescripteurNature,
  lignes: LigneEvaluee[],
  contexte: ContexteImportation,
  empreintesExistantes: string[]
): LigneEvaluee[] {
  if (!descripteur.empreinte) return lignes;

  const enBase = new Set(empreintesExistantes);
  const vues = new Map<string, number>();

  const motifBase = (empreinte: string): string =>
    descripteur.motifDoublon
      ? descripteur.motifDoublon(empreinte)
      : t('Une pièce du même chantier, du même montant et de la même date existe déjà.');
  const motifFichier = (empreinte: string, premiere: number): string =>
    descripteur.motifDoublon
      ? descripteur.motifDoublon(empreinte, premiere)
      : t('Identique à la ligne {{ligne}} de ce fichier.', { ligne: premiere });

  return lignes.map(ligne => {
    if (ligne.erreurs.length > 0) return { ...ligne, doublon: null };
    const brute = descripteur.empreinte?.(valeursDeLaLigne(ligne.cellules), contexte) ?? null;
    const empreintes = (Array.isArray(brute) ? brute : [brute]).filter(
      (empreinte): empreinte is string => typeof empreinte === 'string' && empreinte !== ''
    );
    if (empreintes.length === 0) return { ...ligne, doublon: null };

    // Le doublon interne au fichier prime sur celui de la base. Chaque
    // empreinte est testée, puis toutes sont mémorisées pour les lignes
    // suivantes.
    let doublon: string | null = null;
    for (const empreinte of empreintes) {
      const premiere = vues.get(empreinte);
      if (premiere !== undefined) {
        doublon = motifFichier(empreinte, premiere);
        break;
      }
    }
    if (doublon === null) {
      const touchee = empreintes.find(empreinte => enBase.has(empreinte));
      if (touchee !== undefined) doublon = motifBase(touchee);
    }
    for (const empreinte of empreintes) {
      if (!vues.has(empreinte)) vues.set(empreinte, ligne.numero);
    }
    return { ...ligne, doublon };
  });
}
