import { t } from '../../../i18n/t';
import { estLigneExemple } from '../../../lib/importation/gabarit-constantes';
import type { CompteRenduImport } from '../../../lib/importation/execution';
import type { LigneRapport } from '../../../lib/importation/rapport';
import type { CelluleEvaluee, LigneEvaluee, TypeChamp } from '../../../lib/importation/types';

/**
 * Logique pure de l'écran « Importer mon patrimoine » : aucune dépendance à
 * React ni au réseau, donc testable telle quelle.
 *
 * Chaque ligne du fichier reçoit EXACTEMENT un statut au rapport.
 */

export type PolitiqueDoublons = 'ignorer' | 'refuser';

// ---------------------------------------------------------------------------
// Lignes d'exemple du gabarit
// ---------------------------------------------------------------------------

interface LigneBrute {
  numero: number;
  cellules: string[];
}

/** Écarte la ligne d'exemple du gabarit ; rend aussi les numéros écartés. */
export function retirerLignesExemple<F extends { lignes: LigneBrute[] }>(
  feuille: F
): { feuille: F; retirees: number[] } {
  const retirees: number[] = [];
  const lignes = feuille.lignes.filter(ligne => {
    if (estLigneExemple(ligne.cellules)) {
      retirees.push(ligne.numero);
      return false;
    }
    return true;
  });
  return { feuille: { ...feuille, lignes }, retirees };
}

// ---------------------------------------------------------------------------
// Doublons
// ---------------------------------------------------------------------------

/**
 * Applique le choix de l'utilisateur sur les doublons probables.
 *
 *  - `ignorer` : une ligne en doublon (sans autre erreur) est décochée ; elle
 *    ne part pas et figure « ignorée » au rapport ;
 *  - `refuser` : elle reste cochée mais passe en erreur, jusqu'à correction
 *    (le doublon disparaît alors de lui-même) ou décochage.
 *
 * Les entrées ne sont jamais modifiées.
 */
export function appliquerPolitiqueDoublons(
  lignes: LigneEvaluee[],
  politique: PolitiqueDoublons
): { lignes: LigneEvaluee[]; ignoreesDoublons: number[] } {
  const ignoreesDoublons: number[] = [];
  const resultat = lignes.map(ligne => {
    if (ligne.doublon === null || ligne.erreurs.length > 0 || !ligne.selectionnee) return ligne;
    if (politique === 'ignorer') {
      ignoreesDoublons.push(ligne.numero);
      return { ...ligne, selectionnee: false };
    }
    return {
      ...ligne,
      erreurs: [...ligne.erreurs, t('Doublon refusé : {{motif}}', { motif: ligne.doublon })]
    };
  });
  return { lignes: resultat, ignoreesDoublons };
}

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------

/** Décoche les lignes retenues avant envoi (hors quota) : elles ne partent pas. */
export function exclureLignes(lignes: LigneEvaluee[], numeros: number[]): LigneEvaluee[] {
  if (numeros.length === 0) return lignes;
  const exclus = new Set(numeros);
  return lignes.map(ligne => (exclus.has(ligne.numero) ? { ...ligne, selectionnee: false } : ligne));
}

/** Les lignes qui partiraient : cochées et sans erreur, dans l'ordre du fichier. */
export function lignesPretes(lignes: LigneEvaluee[]): LigneEvaluee[] {
  return lignes.filter(ligne => ligne.selectionnee && ligne.erreurs.length === 0);
}

const SEPARATEUR_MODES = /[,;/|+]/;

/** Normalise une liste de modes tapée librement vers SALE / RENTAL / SHORT_TERM. */
export function normaliserModes(texte: string): string[] {
  const modes = new Set<string>();
  for (const morceau of texte.split(SEPARATEUR_MODES)) {
    const brut = morceau.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    if (brut === '') continue;
    if (brut === 'RENTAL' || brut.startsWith('LOCATION') || brut === 'LOUER' || brut === 'A LOUER') {
      modes.add('RENTAL');
    } else if (brut === 'SHORT_TERM' || brut.includes('SAISON') || brut.includes('COURT')) {
      modes.add('SHORT_TERM');
    } else if (brut === 'SALE' || brut.startsWith('VENTE') || brut === 'VENDRE' || brut === 'A VENDRE') {
      modes.add('SALE');
    }
  }
  return [...modes];
}

/** Les modes d'une ligne évaluée, lus dans la première cellule présente parmi `cles`. */
export function modesDeLaLigne(
  ligne: LigneEvaluee,
  cles: string[] = ['transactionMode', 'modes', 'modesTransaction']
): string[] {
  for (const cle of cles) {
    const cellule = ligne.cellules[cle];
    if (!cellule) continue;
    const source = typeof cellule.valeur === 'string' && cellule.valeur !== '' ? cellule.valeur : cellule.texte;
    return normaliserModes(source);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Compteurs de l'aperçu
// ---------------------------------------------------------------------------

export interface CompteursApercu {
  pretes: number;
  enErreur: number;
  doublons: number;
  ignorees: number;
  horsQuota: number;
}

/**
 * `lignes` : lignes après politique de doublons. Les hors-quota sont inclus
 * dans `lignesPretes` : ils sont décomptés des prêtes.
 */
export function calculerCompteurs(lignes: LigneEvaluee[], horsQuota: number[]): CompteursApercu {
  const prets = lignesPretes(lignes).length;
  return {
    pretes: Math.max(0, prets - horsQuota.length),
    enErreur: lignes.filter(ligne => ligne.selectionnee && ligne.erreurs.length > 0).length,
    doublons: lignes.filter(ligne => ligne.doublon !== null).length,
    ignorees: lignes.filter(ligne => !ligne.selectionnee).length,
    horsQuota: horsQuota.length
  };
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

export interface EntreeRapport {
  /** Lignes après politique de doublons (les hors-quota n'y sont PAS décochés). */
  lignes: LigneEvaluee[];
  /** Numéros décochés par la politique « ignorer les doublons ». */
  ignoreesDoublons: number[];
  /** Numéros retenus par l'estimation de quota. */
  horsQuota: number[];
  /** Absent : rien n'a été envoyé. */
  compteRendu: CompteRenduImport | null;
}

function textesDeLaLigne(ligne: LigneEvaluee): Record<string, string> {
  const textes: Record<string, string> = {};
  for (const [cle, cellule] of Object.entries(ligne.cellules)) textes[cle] = cellule.texte;
  return textes;
}

/** Assemble le rapport : chaque ligne du fichier a exactement un statut. */
export function construireLignesRapport(entree: EntreeRapport): LigneRapport[] {
  const doublonsIgnores = new Set(entree.ignoreesDoublons);
  const horsQuota = new Set(entree.horsQuota);
  const creees = new Map((entree.compteRendu?.lignesCreees ?? []).map(l => [l.numero, l.detail]));
  const refusees = new Map((entree.compteRendu?.echouees ?? []).map(l => [l.numero, l]));

  return entree.lignes.map((ligne): LigneRapport => {
    const base = { numero: ligne.numero, textes: textesDeLaLigne(ligne) };
    if (creees.has(ligne.numero)) {
      return { ...base, statut: 'importee', motif: t('Créée.'), detail: creees.get(ligne.numero) ?? null };
    }
    const refusee = refusees.get(ligne.numero);
    if (refusee) {
      // Une référence ImmoTopia : le bien EXISTE, seule sa seconde écriture a échoué.
      if (refusee.reference) {
        return { ...base, statut: 'partielle', motif: refusee.motif, detail: refusee.reference };
      }
      return { ...base, statut: 'refusee_serveur', motif: refusee.motif, detail: null };
    }
    if (doublonsIgnores.has(ligne.numero)) {
      return { ...base, statut: 'ignoree', motif: ligne.doublon ?? t('Doublon ignoré.'), detail: null };
    }
    if (!ligne.selectionnee) {
      return { ...base, statut: 'ignoree', motif: t('Ligne décochée.'), detail: null };
    }
    if (ligne.erreurs.length > 0) {
      return { ...base, statut: 'en_erreur', motif: ligne.erreurs.join(' ; '), detail: null };
    }
    if (horsQuota.has(ligne.numero)) {
      return {
        ...base,
        statut: 'hors_quota',
        motif: t('Capacité de l’abonnement atteinte (estimation avant envoi)'),
        detail: null
      };
    }
    // Prête mais absente du compte rendu : import interrompu ou non lancé.
    return { ...base, statut: 'non_traitee', motif: t('Import interrompu avant cette ligne.'), detail: null };
  });
}

// ---------------------------------------------------------------------------
// Relance
// ---------------------------------------------------------------------------

/**
 * Les lignes à rejouer : les refus du serveur relançables (`relancable !==
 * false`) et les lignes non traitées. Jamais une ligne déjà créée, ni un
 * refus non relançable (ex. bien créé, valorisation à ajouter par l'autre
 * import).
 */
export function lignesARelancer(lignes: LigneEvaluee[], compteRendu: CompteRenduImport): LigneEvaluee[] {
  const creees = new Set(compteRendu.lignesCreees.map(l => l.numero));
  const aRejouer = new Set<number>([
    ...compteRendu.echouees.filter(e => e.relancable !== false).map(e => e.numero),
    ...compteRendu.nonTraitees
  ]);
  return lignes
    .filter(ligne => aRejouer.has(ligne.numero) && !creees.has(ligne.numero))
    .map(ligne => ({ ...ligne, selectionnee: true }));
}

/**
 * Fusionne le compte rendu d'une relance dans le précédent : les lignes
 * rejouées prennent leur nouveau résultat, les autres gardent l'ancien.
 */
export function fusionnerComptesRendus(
  precedent: CompteRenduImport,
  relance: CompteRenduImport,
  numerosRelances: number[]
): CompteRenduImport {
  const rejouees = new Set(numerosRelances);
  return {
    ...precedent,
    creees: precedent.creees + relance.creees,
    echouees: [...precedent.echouees.filter(e => !rejouees.has(e.numero)), ...relance.echouees].sort(
      (a, b) => a.numero - b.numero
    ),
    lignesCreees: [...precedent.lignesCreees, ...relance.lignesCreees],
    nonTraitees: relance.nonTraitees,
    interrompue: relance.interrompue
  };
}

/**
 * Les lignes qu'un retour à l'aperçu ne doit JAMAIS renvoyer : celles déjà
 * créées, et celles non relançables (écriture partielle, réponse incertaine :
 * l'objet existe peut-être déjà).
 */
export function numerosDejaTraites(compteRendu: CompteRenduImport | null): number[] {
  if (!compteRendu) return [];
  return [
    ...compteRendu.lignesCreees.map(l => l.numero),
    ...compteRendu.echouees.filter(e => e.relancable === false).map(e => e.numero)
  ];
}

// ---------------------------------------------------------------------------
// Cache d'évaluation : à la frappe, seule la ligne modifiée est réévaluée
// ---------------------------------------------------------------------------

export interface BrouillonEvaluable {
  numero: number;
  textes: Record<string, string>;
  selectionnee: boolean;
}

interface EntreeCache {
  textes: Record<string, string>;
  selectionnee: boolean;
  ligne: LigneEvaluee;
}

export interface CacheEvaluation {
  dependances: readonly unknown[];
  lignes: Map<number, EntreeCache>;
}

export function creerCacheEvaluation(): CacheEvaluation {
  return { dependances: [], lignes: new Map() };
}

/**
 * Évalue les brouillons en ne rejouant `evaluer` que pour une ligne dont le
 * texte (référence d'objet : `modifierCellule` ne recrée que la ligne
 * touchée) ou la case a changé. Un changement de `dependances` (descripteur,
 * référentiel, date) invalide tout.
 */
export function evaluerAvecCache<B extends BrouillonEvaluable>(
  cache: CacheEvaluation,
  dependances: readonly unknown[],
  brouillons: B[],
  evaluer: (brouillon: B) => LigneEvaluee
): LigneEvaluee[] {
  const memeContexte =
    cache.dependances.length === dependances.length && cache.dependances.every((d, i) => Object.is(d, dependances[i]));
  const precedentes = memeContexte ? cache.lignes : new Map<number, EntreeCache>();
  const suivantes = new Map<number, EntreeCache>();
  const resultat = brouillons.map(brouillon => {
    const connue = precedentes.get(brouillon.numero);
    if (connue && connue.textes === brouillon.textes && connue.selectionnee === brouillon.selectionnee) {
      suivantes.set(brouillon.numero, connue);
      return connue.ligne;
    }
    const ligne = evaluer(brouillon);
    suivantes.set(brouillon.numero, { textes: brouillon.textes, selectionnee: brouillon.selectionnee, ligne });
    return ligne;
  });
  cache.dependances = dependances;
  cache.lignes = suivantes;
  return resultat;
}

// ---------------------------------------------------------------------------
// La valeur réellement lue sous une cellule
// ---------------------------------------------------------------------------

const SANS_ESPACES = /\s+/g;

/**
 * Pour un champ numérique ou date, la valeur INTERPRÉTÉE quand elle diffère du
 * texte saisi (« 10 000 FCFA » lu 10 000 ; « 2022-03-15 » lu 15/03/2022) :
 * la personne voit ce qui partira vraiment. `null` : rien à ajouter.
 */
export function valeurInterpretee(type: TypeChamp, cellule: CelluleEvaluee | undefined): string | null {
  if (!cellule || cellule.erreur || cellule.valeur === null || cellule.valeur === undefined) return null;
  const saisi = cellule.texte.trim();
  if (type === 'montant' || type === 'quantite' || type === 'entier') {
    if (typeof cellule.valeur !== 'number') return null;
    const formate = cellule.valeur.toLocaleString('fr-FR', { maximumFractionDigits: 6 });
    const nu = saisi.replace(SANS_ESPACES, '');
    if (nu === formate.replace(SANS_ESPACES, '') || nu === String(cellule.valeur)) return null;
    return formate;
  }
  if (type === 'date' && typeof cellule.valeur === 'string') {
    const [annee, mois, jour] = cellule.valeur.split('-');
    if (!annee || !mois || !jour) return null;
    const formate = `${jour}/${mois}/${annee}`;
    return saisi === formate ? null : formate;
  }
  return null;
}
