/**
 * Langues de l'interface — source unique de vérité.
 *
 * Le **français est la langue source** : les clés de traduction *sont* le texte
 * français. `t('Ajouter un bien')` renvoie « Ajouter un bien » tant qu'aucun
 * catalogue n'est chargé, et l'anglais comme l'arabe se contentent d'associer
 * ce texte à leur propre formulation (`locales/en/*.json`).
 *
 * Ce choix, inhabituel, est celui qui rendait la reprise des 328 composants
 * déjà écrits automatisable : aucune clé à nommer, aucune collision à arbitrer,
 * et un diff qui reste lisible. Sa contrepartie : **retoucher un texte français
 * casse ses traductions**. Passer alors par `npm run i18n:extract -w
 * @immotopia/web`, qui signale les clés orphelines.
 */
export const LANGUAGES = {
  fr: {
    code: 'fr',
    /** Nom de la langue, écrit dans cette langue (§ jamais traduit). */
    nativeName: 'Français',
    englishName: 'French',
    dir: 'ltr',
    /** Étiquette compacte du sélecteur de l'en-tête. */
    short: 'FR',
    /** Locale BCP-47 passée à `Intl` et à `toLocaleString`. */
    locale: 'fr-FR',
    /** Nom du fichier `dayjs/locale/*` correspondant. */
    dayjs: 'fr',
    /** Nom du fichier `antd/locale/*` correspondant. */
    antd: 'fr_FR'
  },
  en: {
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    dir: 'ltr',
    short: 'EN',
    locale: 'en-US',
    dayjs: 'en',
    antd: 'en_US'
  },
  ar: {
    code: 'ar',
    nativeName: 'العربية',
    englishName: 'Arabic',
    dir: 'rtl',
    short: 'ع',
    // `ar` sans région : les chiffres restent en chiffres arabes occidentaux
    // (0-9) plutôt qu'en chiffres indo-arabes (٠-٩), que `ar-EG` imposerait.
    // Des montants en ٣٥٠٠٠٠ dans un tableau financier seraient illisibles
    // pour la moitié des utilisateurs de la région.
    locale: 'ar',
    dayjs: 'ar',
    antd: 'ar_EG'
  }
} as const;

export type Language = keyof typeof LANGUAGES;

export const LANGUAGE_CODES = Object.keys(LANGUAGES) as Language[];

export const DEFAULT_LANGUAGE: Language = 'fr';

/** Clé `localStorage` du choix de langue, partagée avec `api-client`. */
export const LANGUAGE_STORAGE_KEY = 'immotopia.language';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGE_CODES as string[]).includes(value);
}

export function isRtl(language: Language): boolean {
  return LANGUAGES[language].dir === 'rtl';
}

/**
 * Langue à afficher au premier rendu, avant même que `<AuthProvider>` ait
 * répondu : choix explicite mémorisé, puis préférence du navigateur, puis
 * français. La préférence stockée en base, elle, s'applique à la connexion
 * (`LanguageProvider`), et seulement si l'utilisateur n'a rien choisi ici.
 */
export function detectInitialLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;

  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Navigation privée ou stockage refusé : on continue sans mémoire.
  }

  const navigatorLanguages = window.navigator.languages ?? [window.navigator.language];
  for (const tag of navigatorLanguages) {
    const base = tag?.split('-')[0]?.toLowerCase();
    if (isLanguage(base)) return base;
  }

  return DEFAULT_LANGUAGE;
}
