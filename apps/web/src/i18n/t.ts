import i18next from './index';

export type TranslationValues = Record<string, string | number | null | undefined>;

/**
 * Traduit un texte français vers la langue affichée.
 *
 * Volontairement **hors hook** : les 328 composants repris par
 * `scripts/i18n-migrate.mjs` déclarent des libellés partout — dans le corps du
 * composant, mais aussi dans des `columns` de tableau construites au niveau du
 * module, dans des fonctions utilitaires, dans des tableaux de constantes.
 * `useTranslation()` aurait été un appel de hook invalide dans la moitié de ces
 * endroits, et les distinguer automatiquement sans se tromper n'était pas
 * réaliste sur ce volume.
 *
 * Ce `t` ne déclenche donc **aucun rendu** quand la langue change. C'est
 * `App.tsx` qui s'en charge, en remontant l'arbre des routes sur un `key`
 * portant la langue : tout ce qui est affiché est reconstruit, y compris ce qui
 * avait été mémorisé.
 *
 * @param text  Le texte français, qui sert aussi de clé de traduction.
 * @param values Valeurs interpolées, référencées `{{nom}}` dans le texte.
 */
export function t(text: string, values?: TranslationValues): string {
  // `defaultValue` n'est pas une precaution : c'est ce qui fait marcher
  // l'interpolation. Sur une cle absente — c'est-a-dire sur TOUTE cle en
  // francais, puisque le francais n'a pas de catalogue — i18next renvoie la cle
  // brute sans y remplacer quoi que ce soit, et l'ecran affichait « Reference
  // {{ref}} ». Une valeur par defaut, elle, est interpolee normalement.
  //
  // `replace` isole les valeurs des options reservees d'i18next (`lng`, `ns`,
  // `count`, `defaultValue`...) : un texte qui interpole `{{count}}` ne bascule
  // pas par surprise sur la resolution des pluriels.
  return i18next.t(text, { defaultValue: text, replace: values }) as string;
}

/**
 * Déclare un texte français à traduire **plus tard, à l'affichage** — et le
 * renvoie tel quel.
 *
 * Pour les constantes de module : un `t()` y serait appelé une seule fois, à
 * l'import, dans la langue du moment, et ne suivrait pas un changement de
 * langue. Le texte reste donc en français dans la donnée, et l'écran appelle
 * `t(descripteur.libelle)` au rendu.
 *
 * Sans ce marqueur, `scripts/i18n-migrate.mjs` ne verrait pas la clé — ou
 * l'envelopperait dans un `t()` au chargement du module. Il recense l'argument
 * de `aTraduire()` dans les catalogues, sans jamais le réécrire.
 */
export function aTraduire(text: string): string {
  return text;
}

export default t;
