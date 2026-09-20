import i18next from 'i18next';
import { DEFAULT_LANGUAGE, isLanguage, LANGUAGES } from './config';

/**
 * Locale BCP-47 de la langue affichée, lisible **hors composant**.
 *
 * Les 180 appels à `toLocaleString('fr-FR')` déjà présents dans les écrans
 * n'ont pas de hook à leur disposition — beaucoup vivent dans des fonctions
 * utilitaires ou des `columns` déclarées au niveau du module. Lire la langue
 * sur l'instance i18next, plutôt que via le contexte React, permet de les
 * convertir sans les réécrire en composants.
 *
 * Contrepartie assumée : ce qui est mémorisé avant un changement de langue
 * garde son ancien format jusqu'au prochain rendu. Le `key={language}` posé sur
 * l'arbre applicatif dans `App.tsx` force ce rendu.
 */
export function activeLocale(): string {
  const language = i18next.resolvedLanguage ?? i18next.language;
  return LANGUAGES[isLanguage(language) ? language : DEFAULT_LANGUAGE].locale;
}

/** Devise par défaut : le produit est déployé en zone franc CFA. */
export const DEFAULT_CURRENCY = 'FCFA';

/**
 * Nombre formaté dans la langue courante. Passe par `Intl` plutôt que par une
 * mise en forme maison : l'arabe groupe les milliers autrement que le français,
 * et les deux diffèrent du séparateur anglais.
 */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(activeLocale(), options).format(value);
}

/**
 * Pourcentage déjà exprimé en points (12,5 → « 12,5 % »), et non en fraction :
 * c'est la convention de toutes les API du produit.
 */
export function formatPercent(value: number, fractionDigits = 1): string {
  return (
    new Intl.NumberFormat(activeLocale(), {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    }).format(value) + ' %'
  );
}

/**
 * Formats de date dayjs par langue. L'ordre jour/mois change avec la langue, et
 * un `DD/MM/YYYY` écrit en dur se lirait à l'envers pour un anglophone.
 */
export const DATE_FORMATS = {
  fr: { short: 'DD/MM/YYYY', long: 'DD MMMM YYYY', dateTime: 'DD/MM/YYYY [à] HH:mm', month: 'MMMM YYYY' },
  en: { short: 'MM/DD/YYYY', long: 'MMMM D, YYYY', dateTime: 'MM/DD/YYYY [at] HH:mm', month: 'MMMM YYYY' },
  ar: { short: 'DD/MM/YYYY', long: 'D MMMM YYYY', dateTime: 'DD/MM/YYYY — HH:mm', month: 'MMMM YYYY' }
} as const;

export type DateFormatName = keyof (typeof DATE_FORMATS)['fr'];

/** Motif dayjs correspondant au format demandé, dans la langue courante. */
export function dateFormat(name: DateFormatName = 'short'): string {
  const language = i18next.resolvedLanguage ?? i18next.language;
  return DATE_FORMATS[isLanguage(language) ? language : DEFAULT_LANGUAGE][name];
}
