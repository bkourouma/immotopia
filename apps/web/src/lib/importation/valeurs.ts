import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import type { EntreeReferentiel } from './types';

dayjs.extend(customParseFormat);

/**
 * Ce qu'il faut faire subir à une cellule de tableur avant d'y croire.
 *
 * Trois chantiers distincts, et volontairement séparés :
 *
 *  - **le texte** : comparer « Gros œuvre » et « GROS OEUVRE  » sans se
 *    tromper, ce qui suppose de retirer les accents, la casse, la
 *    ponctuation et les espaces en trop ;
 *  - **les nombres** : un montant arrive souvent en TEXTE, avec des espaces
 *    insécables en séparateur de milliers et une virgule décimale ;
 *  - **les dates** : `exceljs` rend une cellule datée en `Date`, mais une
 *    colonne saisie à la main rend « 12/03/2026 », et un classeur exporté
 *    par un logiciel métier rend parfois le numéro de série d'Excel.
 *
 * Tout est pur et sans React : c'est ce qui rend ce fichier testable sans
 * monter un écran.
 */

// ---------------------------------------------------------------------------
// Texte
// ---------------------------------------------------------------------------

/**
 * La forme sous laquelle deux libellés se comparent.
 *
 * « Gros œuvre » et « GROS-OEUVRE » doivent se rejoindre : `NFD` détache les
 * accents, la ligature « œ » est dépliée à la main (Unicode ne la décompose
 * pas), et tout ce qui n'est ni lettre ni chiffre devient une espace.
 */
export function normaliserTexte(brut: string): string {
  return brut
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'AE')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Nombres
// ---------------------------------------------------------------------------

/** Toutes les espaces qu'un tableur glisse dans un montant, insécables comprises. */
const ESPACES = /[\s\u00a0\u202f\u2007]/g;

/**
 * Lit un montant écrit par un humain ou par un tableur.
 *
 * Cas couverts, tous rencontrés dans de vrais fichiers d'agence :
 *
 * ```text
 *   1 250,50        →  1250.5    (espace de milliers, virgule décimale)
 *   1 250,50 F CFA  →  1250.5    (la devise est du bruit)
 *   1.250,50        →  1250.5    (point de milliers, virgule décimale)
 *   1,250.50        →  1250.5    (écriture anglo-saxonne)
 *   12 000          →  12000
 *   (1 500)         →  -1500     (négatif comptable entre parenthèses)
 *   0               →  0         (accepté : un don entre en stock à zéro)
 *   ""              →  null      (absent, ce n'est pas zéro)
 * ```
 *
 * **Le séparateur décimal est le DERNIER des deux** quand point et virgule
 * cohabitent : c'est la seule règle qui tranche « 1.250,50 » et « 1,250.50 »
 * sans deviner la langue du fichier. Quand un seul apparaît une seule fois,
 * il est décimal — la convention française n'emploie pas la virgule pour les
 * milliers. Répété, il ne peut être que séparateur de milliers.
 */
export function nettoyerMontant(brut: unknown): number | null {
  if (brut === null || brut === undefined) return null;
  if (typeof brut === 'number') return Number.isFinite(brut) ? brut : null;
  if (typeof brut !== 'string') return null;

  let texte = brut.replace(ESPACES, '');
  if (texte === '') return null;

  // Deux refus francs, avant tout nettoyage.
  //
  // `#` : les codes d'erreur d'Excel — `#DIV/0!`, `#N/A`, `#VALEUR!` — sont
  // du bruit, pas des nombres. Sans ce refus, « #DIV/0! » perdait ses
  // symboles et rentrait comme un montant de **zéro**, ce qui est pire qu'un
  // refus : une dépense effacée en silence.
  //
  // `/` : un montant n'en porte jamais, une date si. Une colonne de dates
  // rapprochée par erreur à un montant rendait « 12/03/2026 » → 12 032 026.
  if (texte.includes('#') || texte.includes('/')) return null;

  // Négatif comptable : « (1 500) » vaut −1500.
  let negatif = false;
  if (/^\(.*\)$/.test(texte)) {
    negatif = true;
    texte = texte.slice(1, -1);
  }

  // Devise, pourcentage, lettres parasites : tout ce qui n'est pas un chiffre
  // ni un séparateur ni un signe s'en va.
  texte = texte.replace(/[^\d.,+-]/g, '');
  if (texte.startsWith('-')) {
    negatif = true;
    texte = texte.slice(1);
  } else if (texte.startsWith('+')) {
    texte = texte.slice(1);
  }
  texte = texte.replace(/[+-]/g, '');
  if (texte === '') return null;

  const points = (texte.match(/\./g) ?? []).length;
  const virgules = (texte.match(/,/g) ?? []).length;

  if (points > 0 && virgules > 0) {
    const decimal = texte.lastIndexOf('.') > texte.lastIndexOf(',') ? '.' : ',';
    const milliers = decimal === '.' ? ',' : '.';
    texte = texte.split(milliers).join('');
    texte = texte.replace(decimal, '.');
  } else if (virgules === 1) {
    texte = texte.replace(',', '.');
  } else if (virgules > 1) {
    texte = texte.split(',').join('');
  } else if (points > 1) {
    texte = texte.split('.').join('');
  }

  if (!/^\d*\.?\d*$/.test(texte) || texte === '' || texte === '.') return null;

  const valeur = Number(texte);
  if (!Number.isFinite(valeur)) return null;
  return negatif ? -valeur : valeur;
}

/** Un entier, ou `null`. Un « 3,5 » rendu là où un entier est attendu échoue. */
export function nettoyerEntier(brut: unknown): number | null {
  const valeur = nettoyerMontant(brut);
  if (valeur === null) return null;
  return Number.isInteger(valeur) ? valeur : null;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Le jour zéro du numéro de série d'Excel.
 *
 * 1899-12-30 et non 1900-01-01 : Excel a conservé le 29 février 1900, qui
 * n'a jamais existé, et décale donc tout d'un jour.
 */
const SERIE_EXCEL_ORIGINE = Date.UTC(1899, 11, 30);
const JOUR_MS = 24 * 60 * 60 * 1000;

const FORMATS_JOUR = ['YYYY-MM-DD', 'DD/MM/YYYY', 'D/M/YYYY', 'DD-MM-YYYY', 'DD.MM.YYYY', 'YYYY/MM/DD', 'DD/MM/YY'];

const FORMATS_MOIS = ['YYYY-MM', 'MM/YYYY', 'M/YYYY', 'MM-YYYY'];

/**
 * Rend `YYYY-MM-DD`, la seule forme que les services acceptent.
 *
 * `exceljs` rend le plus souvent un `Date` ; le texte « 12/03/2026 » et le
 * numéro de série d'Excel sont prévus parce que les deux arrivent. Les
 * formats sont essayés en mode strict : sans cela `dayjs` accepte « 31/31 »
 * et rend une date en silence.
 *
 * **Le jour est lu en heure locale** quand la cellule est un `Date` : une
 * conversion en UTC ferait reculer d'un jour toutes les dates saisies à
 * Abidjan, et une pièce de caisse datée de la veille est une pièce fausse.
 */
export function versDateISO(brut: unknown): string | null {
  if (brut === null || brut === undefined || brut === '') return null;

  if (brut instanceof Date) {
    if (Number.isNaN(brut.getTime())) return null;
    return dayjs(brut).format('YYYY-MM-DD');
  }

  if (typeof brut === 'number') {
    return depuisSerieExcel(brut);
  }

  if (typeof brut !== 'string') return null;
  const texte = brut.trim();
  if (texte === '') return null;

  // Un classeur exporté rend parfois le numéro de série en texte.
  if (/^\d{1,6}$/.test(texte)) {
    return depuisSerieExcel(Number(texte));
  }

  for (const format of FORMATS_JOUR) {
    const lu = dayjs(texte, format, true);
    if (lu.isValid()) return lu.format('YYYY-MM-DD');
  }

  // Dernier recours : une chaîne ISO complète avec heure et fuseau.
  const iso = dayjs(texte);
  return iso.isValid() && /\d{4}-\d{2}-\d{2}/.test(texte) ? iso.format('YYYY-MM-DD') : null;
}

function depuisSerieExcel(serie: number): string | null {
  // Au-delà de 2958465, on est après le 31/12/9999 : ce n'est plus une date.
  if (!Number.isFinite(serie) || serie < 1 || serie > 2958465) return null;
  // La série compte des jours UTC ; on relit en UTC, sinon un fuseau négatif
  // fait reculer la date d'un jour.
  const instant = new Date(SERIE_EXCEL_ORIGINE + Math.round(serie) * JOUR_MS);
  const annee = instant.getUTCFullYear();
  const mois = String(instant.getUTCMonth() + 1).padStart(2, '0');
  const jour = String(instant.getUTCDate()).padStart(2, '0');
  return `${annee}-${mois}-${jour}`;
}

/**
 * Une période mensuelle, rendue `YYYY-MM`.
 *
 * Une note de salaire et une constatation de loyer portent un mois, pas un
 * jour. « 03/2026 », « mars 2026 » sous forme de date, ou une date complète
 * dont on ne garde que le mois : les trois arrivent.
 */
export function versPeriodeISO(brut: unknown): string | null {
  if (typeof brut === 'string') {
    const texte = brut.trim();
    for (const format of FORMATS_MOIS) {
      const lu = dayjs(texte, format, true);
      if (lu.isValid()) return lu.format('YYYY-MM');
    }
  }
  const jour = versDateISO(brut);
  return jour ? jour.slice(0, 7) : null;
}

/** L'année et le mois d'une période `YYYY-MM`. */
export function decouperPeriode(periode: string): { periodYear: number; periodMonth: number } | null {
  const correspondance = /^(\d{4})-(\d{2})$/.exec(periode);
  if (!correspondance) return null;
  const periodYear = Number(correspondance[1]);
  const periodMonth = Number(correspondance[2]);
  if (periodMonth < 1 || periodMonth > 12) return null;
  return { periodYear, periodMonth };
}

// ---------------------------------------------------------------------------
// Rapprochement d'un libellé sur une liste de référence
// ---------------------------------------------------------------------------

export type ResultatRapprochement =
  { trouve: true; entree: EntreeReferentiel } | { trouve: false; motif: 'introuvable' | 'ambigu' };

/**
 * Retrouve l'entrée que désigne un libellé écrit à la main.
 *
 * Trois passes, de la plus sûre à la plus permissive, et **aucune quatrième** :
 * une correspondance approximative sur les caractères ferait entrer une
 * dépense sur le mauvais poste sans que personne ne s'en aperçoive.
 *
 *  1. égalité après normalisation, sur le libellé puis sur les alias ;
 *  2. inclusion dans un sens ou dans l'autre, à condition qu'UNE SEULE entrée
 *     corresponde ;
 *  3. sinon, on le dit : `introuvable`, ou `ambigu` quand plusieurs entrées
 *     se disputent le libellé.
 */
export function rapprocherLibelle(entrees: EntreeReferentiel[], brut: string): ResultatRapprochement {
  const cible = normaliserTexte(brut);
  if (cible === '') return { trouve: false, motif: 'introuvable' };

  const exactes = entrees.filter(entree =>
    [entree.libelle, ...(entree.alias ?? [])].some(candidat => normaliserTexte(candidat) === cible)
  );
  if (exactes.length === 1) return { trouve: true, entree: exactes[0] };
  if (exactes.length > 1) return { trouve: false, motif: 'ambigu' };

  const partielles = entrees.filter(entree =>
    [entree.libelle, ...(entree.alias ?? [])].some(candidat => {
      const normalise = normaliserTexte(candidat);
      if (normalise === '') return false;
      return normalise.includes(cible) || cible.includes(normalise);
    })
  );
  if (partielles.length === 1) return { trouve: true, entree: partielles[0] };
  if (partielles.length > 1) return { trouve: false, motif: 'ambigu' };

  return { trouve: false, motif: 'introuvable' };
}
