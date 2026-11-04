import { activeLocale } from '../i18n/format';

/**
 * Regroupement des milliers pendant la frappe d'un montant, pour `<InputNumber>`.
 *
 * ---------------------------------------------------------------------------
 * Le besoin
 * ---------------------------------------------------------------------------
 *
 * Un montant à huit chiffres collés (`50000000`) ne se relit pas : l'erreur
 * d'un zéro en trop ou en moins ne saute pas aux yeux. `<MoneyValue>` corrige
 * déjà ce défaut à l'AFFICHAGE en regroupant les milliers via
 * `toLocaleString(activeLocale())` — mais un `<InputNumber>` ne passe pas par
 * `<MoneyValue>`, et rien ne regroupait la SAISIE. Cet utilitaire fournit la
 * paire `formatter`/`parser` qui fait vivre la même règle pendant la frappe :
 * on tape `50000000`, le champ affiche « 50 000 000 » au fur et à mesure.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi le même séparateur qu'à l'affichage
 * ---------------------------------------------------------------------------
 *
 * `toLocaleString('fr-FR')` ne pose pas une virgule mais une **espace
 * insécable étroite** (U+202F) — invisible à l'œil, mais bien réelle dans la
 * chaîne. Un séparateur choisi au hasard (espace normale, virgule) créerait
 * une incohérence entre ce qu'on tape et ce qu'affiche `<MoneyValue>` juste à
 * côté. `formatterMontant` appelle donc la même primitive `Intl` que
 * `<MoneyValue>`, locale courante comprise : espace insécable étroite en
 * français, virgule en anglais, ce que `Intl` choisit en arabe. Si la langue
 * change, ce fichier n'a rien à savoir de plus.
 *
 * ---------------------------------------------------------------------------
 * Ce que la frappe en cours impose
 * ---------------------------------------------------------------------------
 *
 * `<InputNumber>` reformate à CHAQUE caractère tapé, pas seulement à la
 * validation. Le `formatter`/`parser` doit donc rester correct sur des états
 * transitoires qu'un montant déjà saisi ne présente jamais :
 *   - le champ vide (on efface tout) — ne jamais y substituer un `0` ;
 *   - le signe seul (`-`), le temps de taper le premier chiffre d'un écart
 *     négatif (un avenant de budget de chantier peut baisser un poste) ;
 *   - une valeur en cours de frappe, où le regroupement se refait à chaque
 *     chiffre (`5` → `50` → `500` → `5 000` → `50 000` → `50 000 0` → « 50 000
 *     0 » redevient « 500 000 » dès que ce chiffre est confirmé, etc.).
 *
 * Le `parser`, lui, doit accepter tout ce que le `formatter` a pu poser —
 * espace normale, insécable, insécable étroite, séparateur de milliers de la
 * langue — et rendre un nombre au format JavaScript (`1000.5`).
 *
 * Le séparateur décimal (BUG-2026-11-03-025) : une version antérieure ne
 * gardait que « chiffres, point et signe ». En français, la virgule de
 * « 1 000,5 » tombait et le montant devenait 10 005 — un reversement dix fois
 * trop élevé. Le parseur dépend maintenant de la langue (séparateurs lus sur
 * `Intl`) : il retire les milliers, lit `,` (fr), `.` (en) ou `٫` (ar) comme
 * décimale, accepte aussi le point en français et en arabe, et lit les chiffres
 * arabo-indiens. Le formateur travaille sur le TEXTE, jamais via `Number`, pour
 * ne perdre ni la virgule en cours de frappe (`1000,`) ni un zéro final
 * (`1000,50`). Deux décimales au plus (colonne `Decimal(14,2)`).
 */

/** Le XOF n'a pas de centimes, mais la colonne est `Decimal(14,2)` : au plus deux décimales saisies. */
const MAX_DECIMALES = 2;

/** Séparateurs de la langue courante, lus sur `Intl` plutôt que codés en dur. */
function separateurs(): { groupe: string; decimal: string } {
  const parts = new Intl.NumberFormat(activeLocale(), { useGrouping: true }).formatToParts(1234567.5);
  return {
    groupe: parts.find(part => part.type === 'group')?.value ?? ' ',
    decimal: parts.find(part => part.type === 'decimal')?.value ?? '.'
  };
}

/** Chiffres arabo-indiens (٠-٩) et persans (۰-۹) vers ASCII. */
function chiffresLatins(texte: string): string {
  return texte
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x06f0));
}

/**
 * Un même séparateur répété est un séparateur de milliers quand les groupes qu'il
 * ouvre en comptent trois chiffres (« 1.000.000 », « 1,000,000 »), le dernier
 * pouvant être en cours de frappe. « 1,2,3 » n'en a pas la forme : règle de la langue.
 */
function ressembleAuxMilliers(texte: string, separateur: string): boolean {
  const groupes = texte.replace(new RegExp('[\\s\\u00a0\\u202f-]', 'g'), '').split(separateur).slice(1);
  return groupes.every((groupe, i) => (i === groupes.length - 1 ? groupe.length <= 3 : groupe.length === 3));
}

/**
 * Texte saisi (ou posé par le formateur) vers `[-]chiffres[.décimales]`, sans
 * mise en forme. Garde les états transitoires : `''`, `'-'`, `'1000.'` (virgule
 * tapée, décimales à venir).
 */
function normaliser(saisie: string, maxDecimales: number = MAX_DECIMALES): string {
  const { groupe, decimal } = separateurs();
  const texte = chiffresLatins(saisie).replace(/[−‒–]/g, '-');

  // Décimale : celle de la langue, plus `.` et `,` tant qu'ils ne servent pas
  // de séparateur de milliers (en anglais la virgule groupe, elle n'est
  // jamais décimale ; en français et en arabe le point est aussi lu décimal).
  const decimales = new Set<string>([decimal, '.', ',', '٫']);
  decimales.delete(groupe);
  decimales.add(decimal);

  // Hypothèse H38 : quand le texte porte PLUSIEURS séparateurs (collage, ou
  // « 1.000.000 »), la langue ne tranche plus, la forme du texte le fait :
  //   - `,` et `.` ensemble : le plus à droite est la décimale, les autres
  //     sont des milliers (« 1,234.56 » = 1234,56 ; « 1.234,56 » aussi) ;
  //   - un même séparateur répété : ce sont des milliers (« 1.000.000 » = un million) ;
  //   - un seul séparateur : règle de la langue ci-dessus (BUG-2026-11-03-025).
  const caracteres = Array.from(texte);
  const positionsSeparateurs = caracteres.flatMap((c, i) => (c === '.' || c === ',' || c === '٫' ? [i] : []));
  const typesSeparateurs = new Set(positionsSeparateurs.map(i => caracteres[i]));
  let positionDecimale: number | null | undefined; // undefined : règle de la langue
  if (typesSeparateurs.size >= 2) positionDecimale = positionsSeparateurs[positionsSeparateurs.length - 1];
  else if (positionsSeparateurs.length > 1 && ressembleAuxMilliers(texte, [...typesSeparateurs][0])) {
    positionDecimale = null;
  }

  let resultat = '';
  let negatif = false;
  let aVirgule = false;
  let apres = 0;
  for (let index = 0; index < caracteres.length; index += 1) {
    const caractere = caracteres[index];
    if (positionDecimale !== undefined && positionsSeparateurs.includes(index)) {
      if (index === positionDecimale && !aVirgule) {
        aVirgule = true;
        resultat += resultat === '' ? '0.' : '.';
      }
      continue;
    }
    if (caractere === '-') {
      if (resultat === '') negatif = true;
    } else if (caractere >= '0' && caractere <= '9') {
      if (!aVirgule) resultat += caractere;
      else if (apres < maxDecimales) {
        resultat += caractere;
        apres += 1;
      }
    } else if (decimales.has(caractere) && !aVirgule) {
      aVirgule = true;
      resultat += resultat === '' ? '0.' : '.';
    }
    // Tout le reste (espaces, insécables, groupe de la langue, lettres) tombe.
  }
  return (negatif ? '-' : '') + resultat;
}

/** Informations passées par `<InputNumber>` à son `formatter` (`input` : le texte brut tapé). */
interface InfosFormatter {
  userTyping: boolean;
  input: string;
}

/** Transforme un montant (ou un état de saisie en cours) en texte regroupé. */
export function formatterMontant(
  value: number | string | undefined,
  info?: InfosFormatter,
  maxDecimales: number = MAX_DECIMALES
): string {
  if (value === undefined || value === null || value === '') return '';

  // Pendant la frappe, le texte tapé fait foi : `value` est déjà passé par
  // l'analyse numérique et a perdu la virgule finale ou un zéro final.
  const source = info?.userTyping && typeof info.input === 'string' ? info.input : String(value);

  // Notation scientifique (très grand nombre) : repli sur Intl.
  if (/e/i.test(source) && Number.isFinite(Number(source))) {
    return Number(source).toLocaleString(activeLocale());
  }

  const normalise = normaliser(source, maxDecimales);

  // Rien d'exploitable encore (`-` seul au début d'un montant négatif, ou
  // tout autre état non numérique) : on renvoie la saisie plutôt que d'effacer
  // ce que la personne vient de taper.
  if (normalise === '' || normalise === '-') return normalise === '' ? source : normalise;

  const negatif = normalise.startsWith('-');
  const [entiers, decimales] = normalise.replace('-', '').split('.');
  const groupes = new Intl.NumberFormat(activeLocale(), { useGrouping: true, maximumFractionDigits: 0 }).format(
    BigInt(entiers)
  );
  const partieDecimale = decimales === undefined ? '' : separateurs().decimal + decimales;
  return (negatif ? '-' : '') + groupes + partieDecimale;
}

/**
 * Remet un texte saisi ou formaté au format `1000.5`. Accepte tout ce que le
 * formateur a pu poser (espaces normales, insécables, séparateur de milliers de
 * la langue) et le séparateur décimal de la langue — ou le point.
 */
export function parserMontant(value: string | undefined, maxDecimales: number = MAX_DECIMALES): string {
  if (value === undefined) return '';
  return normaliser(value, maxDecimales);
}

/**
 * Paire `formatter`/`parser` pour un nombre à `maxDecimales` décimales au plus.
 * Le parseur garde la virgule saisie : « 5,5 » reste 5,5 (et non 55), pour qu'un
 * contrôle en aval puisse le refuser au lieu de le convertir en silence. Un taux
 * à quatre décimales : `saisieNombreProps(4)` ; un entier à contrôler : `(2)`.
 */
export function saisieNombreProps(maxDecimales: number) {
  return {
    formatter: (value: number | string | undefined, info?: InfosFormatter) =>
      formatterMontant(value, info, maxDecimales),
    parser: (value: string | undefined) => parserMontant(value, maxDecimales)
  };
}

/** Prêt à étaler sur un `<InputNumber>` de montant : `<InputNumber {...montantSaisiProps} ... />`. */
export const montantSaisiProps = {
  formatter: formatterMontant,
  parser: parserMontant
};
