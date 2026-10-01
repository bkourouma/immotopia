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
  /** Le `code` métier du serveur (« QUOTA_EXCEEDED », « OWN_ASSETS_ONLY »…), quand il en rend un. */
  code?: string;
  /** Faux : la ligne est à moitié faite (ou son issue est incertaine), la relancer pourrait créer un doublon. */
  relancable?: boolean;
  /** La référence ImmoTopia de l'objet déjà créé, pour une ligne à moitié faite. */
  reference?: string;
}

export interface LigneCreee {
  numero: number;
  /** La chaîne rendue par `enregistrer` (ex. la référence attribuée), ou `null`. */
  detail: string | null;
}

/**
 * Une écriture en deux temps réussie à moitié : le bien est créé mais sa
 * valorisation a été refusée. La ligne n'est PAS relançable — la rejouer
 * créerait un second bien.
 */
export class ErreurPartielle extends Error {
  /** Le `code` métier du refus serveur de la seconde écriture, s'il y en avait un. */
  readonly code?: string;
  /** La référence ImmoTopia du bien déjà créé. */
  readonly reference?: string;
  /** Le statut HTTP du refus de la seconde écriture (un 429 interrompt l'import). */
  readonly statut?: number;

  constructor(message: string, code?: string, reference?: string, statut?: number) {
    super(message);
    this.name = 'ErreurPartielle';
    this.code = code;
    this.reference = reference;
    this.statut = statut;
  }
}

/**
 * Une erreur levée AVANT tout appel réseau (donnée locale incohérente) : le
 * serveur n'a rien reçu, la ligne est donc relançable comme un refus ordinaire.
 */
export class ErreurAvantEnvoi extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurAvantEnvoi';
  }
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
  /** Les lignes créées, avec le détail rendu par `enregistrer`. */
  lignesCreees: LigneCreee[];
  /** Numéros des lignes à envoyer mais jamais tentées : l'import a été interrompu. */
  nonTraitees: number[];
  /** Pourquoi l'import s'est arrêté avant la fin, ou `null`. */
  interrompue: 'utilisateur' | 'limite' | null;
}

export interface OptionsExecution {
  descripteur: DescripteurNature;
  lignes: LigneEvaluee[];
  contexte: ContexteImportation;
  /** Appelé après chaque ligne traitée, pour la barre de progression. */
  surProgression?: (traitees: number, aEnvoyer: number) => void;
  /** Testé avant chaque ligne : vrai ⇒ on s'arrête, le reste va dans `nonTraitees`. */
  interrompre?: () => boolean;
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

/** Le `code` métier que le serveur joint à son refus, s'il en joint un. */
function codeDeLErreur(erreur: unknown): string | undefined {
  const code = (erreur as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' && code !== '' ? code : undefined;
}

function statutDeLErreur(erreur: unknown): number | undefined {
  const candidat = erreur as { response?: { status?: unknown }; statut?: unknown };
  const statut = candidat?.response?.status ?? candidat?.statut;
  return typeof statut === 'number' ? statut : undefined;
}

/**
 * Vrai quand le serveur a pu créer l'objet sans que la réponse nous parvienne :
 * ni réponse du tout (délai dépassé, réseau coupé) ni statut exploitable, ou une
 * passerelle en défaut (502, 503, 504). Rejouer la ligne risquerait un doublon.
 */
function reponseIncertaine(erreur: unknown): boolean {
  if (erreur instanceof ErreurAvantEnvoi) return false;
  const reponse = (erreur as { response?: unknown })?.response;
  if (reponse === undefined || reponse === null) {
    // Seule une erreur de TRANSPORT (axios : `code` réseau, `request` posé,
    // `isAxiosError`) laisse un doute. Une erreur locale d'un descripteur
    // (donnée illisible, levée avant l'envoi) garde son propre motif.
    const transport = erreur as { isAxiosError?: unknown; request?: unknown; code?: unknown };
    return transport?.isAxiosError === true || transport?.request !== undefined || typeof transport?.code === 'string';
  }
  const statut = statutDeLErreur(erreur);
  return statut === 502 || statut === 503 || statut === 504;
}

/**
 * Enregistre les lignes cochées et valides, dans l'ordre du fichier.
 *
 * Une ligne décochée n'est pas envoyée. Une ligne en erreur non plus —
 * l'aperçu en a déjà dit le motif, et l'envoyer ne ferait que rapporter le
 * même refus depuis plus loin. Un doublon signalé, lui, **part** s'il est
 * resté coché : c'est la décision du propriétaire du produit, et deux
 * dépenses identiques le même jour, ça existe.
 *
 * Un refus ordinaire (4xx, 5xx) ne bloque jamais les lignes suivantes. Deux
 * choses seulement interrompent l'import : `interrompre()` (la personne) et
 * un HTTP 429 (la limite de débit) ; les lignes jamais tentées sont alors
 * rendues dans `nonTraitees`.
 */
export async function executerImport(options: OptionsExecution): Promise<CompteRenduImport> {
  const { descripteur, lignes, contexte, surProgression, interrompre } = options;

  const decochees = lignes.filter(ligne => !ligne.selectionnee).length;
  const enErreur = lignes.filter(ligne => ligne.selectionnee && ligne.erreurs.length > 0).length;
  const aEnvoyer = lignes.filter(ligne => ligne.selectionnee && ligne.erreurs.length === 0);

  const echouees: ResultatLigne[] = [];
  const lignesCreees: LigneCreee[] = [];
  const nonTraitees: number[] = [];
  let interrompue: CompteRenduImport['interrompue'] = null;
  let creees = 0;
  let traitees = 0;

  for (const ligne of aEnvoyer) {
    // Une fois interrompu, plus rien n'est appelé : le reste est « non traité ».
    if (interrompue === null && interrompre?.()) interrompue = 'utilisateur';
    if (interrompue !== null) {
      nonTraitees.push(ligne.numero);
      continue;
    }

    try {
      const detail = await descripteur.enregistrer(valeursDeLaLigne(ligne.cellules), contexte);
      creees += 1;
      lignesCreees.push({ numero: ligne.numero, detail: typeof detail === 'string' ? detail : null });
    } catch (erreur) {
      const resultat: ResultatLigne = { numero: ligne.numero, motif: motifDeLErreur(erreur) };
      const code = erreur instanceof ErreurPartielle ? erreur.code : codeDeLErreur(erreur);
      if (code) resultat.code = code;
      // Le statut se lit AVANT le type de l'erreur : un 429 reçu sur la seconde
      // écriture d'une ligne à moitié faite interrompt l'import comme un autre.
      const limite = statutDeLErreur(erreur) === 429;
      if (limite) interrompue = 'limite';
      if (erreur instanceof ErreurPartielle) {
        resultat.relancable = false;
        if (erreur.reference) resultat.reference = erreur.reference;
        if (limite && !resultat.code) resultat.code = 'RATE_LIMITED';
      } else if (limite) {
        // Limite de débit : continuer ne ferait qu'aggraver le refus.
        resultat.code = code ?? 'RATE_LIMITED';
        resultat.relancable = true;
        if (!estUnMotifDuServeur(erreur)) {
          resultat.motif = t('Trop de requêtes : l’import est interrompu, relancez-le dans un instant.');
        }
      } else if (reponseIncertaine(erreur)) {
        // Le serveur a peut-être créé l'objet : cette ligne n'est jamais rejouée automatiquement.
        resultat.code = 'REPONSE_INCERTAINE';
        resultat.relancable = false;
        resultat.motif = t(
          'La réponse du serveur n’est pas parvenue : vérifiez la liste des biens avant de relancer cette ligne.'
        );
      }
      echouees.push(resultat);
    }
    traitees += 1;
    surProgression?.(traitees, aEnvoyer.length);
  }

  return { total: lignes.length, creees, echouees, decochees, enErreur, lignesCreees, nonTraitees, interrompue };
}

/** Vrai si le serveur a joint un motif lisible à son refus. */
function estUnMotifDuServeur(erreur: unknown): boolean {
  const message = (erreur as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message.trim() !== '';
}
