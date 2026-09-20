import { t } from '../../i18n/t';
import { valeursDeLaLigne } from './rapprochement';
import type { ContexteImportation, DescripteurNature, LigneEvaluee } from './types';

/**
 * L'écriture — une ligne à la fois, et pourquoi.
 *
 * ---------------------------------------------------------------------------
 * Pas de lot, pas de transaction, pas de parallélisme
 * ---------------------------------------------------------------------------
 *
 * Les services existants créent UNE pièce par appel. Aucun d'eux n'accepte un
 * lot, et en inventer un supposerait un point d'entrée qui n'existe pas.
 * L'import les appelle donc en série :
 *
 *  - **en série** parce qu'un mouvement de stock dépend de ce qui précède —
 *    le coût moyen d'un lieu se recalcule à chaque entrée, et le serveur
 *    refuse une sortie supérieure au stock. Vingt appels lancés ensemble
 *    donneraient un résultat qui dépend de l'ordre d'arrivée ;
 *  - **sans transaction** parce qu'il n'y en a pas à l'échelle de l'import.
 *    Une ligne qui échoue n'annule pas les précédentes : elles restent, en
 *    brouillon, et le compte rendu dit lesquelles. C'est tenable précisément
 *    parce que rien n'est validé — un import à moitié passé se jette pièce
 *    par pièce depuis « Pièces à valider ».
 *
 * Le compte rendu est **par ligne**, avec le motif rendu par le serveur, et
 * non un « 3 erreurs » qui n'aide personne à corriger son fichier.
 */

export interface ResultatLigne {
  /** Le numéro DANS LE FICHIER. C'est celui que la personne va rouvrir. */
  numero: number;
  motif: string;
}

export interface CompteRenduImport {
  /** Le nombre de lignes de l'aperçu, toutes catégories confondues. */
  total: number;
  /** Les pièces réellement créées, à l'état brouillon. */
  creees: number;
  /** Envoyées et refusées par le serveur, avec SON motif. */
  echouees: ResultatLigne[];
  /** Jamais envoyées parce que décochées. */
  decochees: number;
  /** Jamais envoyées parce qu'en erreur. Le motif est déjà à l'écran. */
  enErreur: number;
}

export interface OptionsExecution {
  descripteur: DescripteurNature;
  lignes: LigneEvaluee[];
  contexte: ContexteImportation;
  /** Appelé après chaque ligne traitée, pour la barre de progression. */
  surProgression?: (traitees: number, aEnvoyer: number) => void;
}

/**
 * Lit le motif qu'un service a rapporté.
 *
 * Les services laissent remonter l'erreur d'`apiClient` telle quelle : le
 * message métier du serveur est dans `response.data.message`. Un import qui
 * afficherait « Request failed with status code 400 » obligerait à ouvrir la
 * console pour savoir quel poste est inconnu.
 */
export function motifDeLErreur(erreur: unknown): string {
  const candidat = erreur as { response?: { data?: { message?: unknown } }; message?: unknown };
  const duServeur = candidat?.response?.data?.message;
  if (typeof duServeur === 'string' && duServeur.trim() !== '') return duServeur;
  if (typeof candidat?.message === 'string' && candidat.message.trim() !== '') return candidat.message;
  return t('Le serveur a refusé la ligne sans en donner le motif.');
}

/**
 * Enregistre les lignes cochées et valides, dans l'ordre du fichier.
 *
 * Une ligne décochée n'est pas envoyée. Une ligne en erreur non plus —
 * l'aperçu en a déjà dit le motif, et l'envoyer ne ferait que rapporter le
 * même refus depuis plus loin. Un doublon signalé, lui, **part** s'il est
 * resté coché : c'est la décision du propriétaire du produit, et deux
 * dépenses identiques le même jour, ça existe.
 */
export async function executerImport(options: OptionsExecution): Promise<CompteRenduImport> {
  const { descripteur, lignes, contexte, surProgression } = options;

  const decochees = lignes.filter(ligne => !ligne.selectionnee).length;
  const enErreur = lignes.filter(ligne => ligne.selectionnee && ligne.erreurs.length > 0).length;
  const aEnvoyer = lignes.filter(ligne => ligne.selectionnee && ligne.erreurs.length === 0);

  const echouees: ResultatLigne[] = [];
  let creees = 0;
  let traitees = 0;

  for (const ligne of aEnvoyer) {
    try {
      await descripteur.enregistrer(valeursDeLaLigne(ligne.cellules), contexte);
      creees += 1;
    } catch (erreur) {
      echouees.push({ numero: ligne.numero, motif: motifDeLErreur(erreur) });
    }
    traitees += 1;
    surProgression?.(traitees, aEnvoyer.length);
  }

  return { total: lignes.length, creees, echouees, decochees, enErreur };
}
