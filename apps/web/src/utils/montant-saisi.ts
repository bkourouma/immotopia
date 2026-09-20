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
 * espace normale, insécable, insécable étroite, virgule anglaise — et ne
 * garder que les chiffres, le signe et un éventuel point décimal. Balayer
 * large ici coûte moins cher qu'un montant qui refuse de se sauvegarder parce
 * que le caractère de séparation exact ne correspondait pas à celui attendu.
 */

/** Transforme un montant (ou un état de saisie en cours) en texte regroupé. */
export function formatterMontant(value: number | string | undefined): string {
  if (value === undefined || value === null || value === '') return '';

  const brut = String(value);
  const numerique = Number(brut);

  // Un `-` seul (début de saisie d'un montant négatif) ou tout autre état non
  // encore numérique : on renvoie la saisie telle quelle plutôt que d'effacer
  // ce que la personne vient de taper.
  if (!Number.isFinite(numerique)) return brut;

  return numerique.toLocaleString(activeLocale());
}

/** Retire tout ce que `formatterMontant` a pu ajouter, pour ne garder qu'un nombre exploitable. */
export function parserMontant(value: string | undefined): string {
  if (value === undefined) return '';

  // On ne connaît pas à l'avance le séparateur exact (espace insécable
  // étroite en français, virgule en anglais...), donc on ne retire pas un
  // caractère précis : on ne garde que ce qui compose un nombre — chiffres,
  // point décimal, signe moins — et tout le reste tombe, séparateur de
  // milliers compris.
  return value.replace(/[^\d.-]/g, '');
}

/** Prêt à étaler sur un `<InputNumber>` de montant : `<InputNumber {...montantSaisiProps} ... />`. */
export const montantSaisiProps = {
  formatter: formatterMontant,
  parser: parserMontant
};
