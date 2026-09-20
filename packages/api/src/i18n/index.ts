import { AsyncLocalStorage } from 'node:async_hooks';
import en from './locales/en.json';
import ar from './locales/ar.json';

/**
 * i18n du serveur — messages d'erreur, e-mails et documents generes.
 *
 * Meme principe que cote web (`apps/web/src/i18n`) : **le francais est la
 * langue source**, et la cle de traduction *est* le texte francais. Un message
 * sans traduction sort donc en francais, jamais vide et jamais en `error.key`.
 */

export const LANGUAGES = ['fr', 'en', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'fr';

/** Le francais n'a pas de catalogue : sa cle est deja son texte. */
const CATALOGS: Record<Exclude<Language, 'fr'>, Record<string, string>> = { en, ar };

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * Langue de la requete en cours.
 *
 * Passe par `AsyncLocalStorage` plutot que par un parametre : les erreurs
 * typees sont levees a 87 endroits, au fond de services qui ne connaissent pas
 * la requete HTTP. Leur faire porter une langue aurait voulu dire modifier
 * chaque signature de service jusqu'a la racine — pour un besoin qui ne
 * concerne que la mise en forme finale du message.
 */
const requestLanguage = new AsyncLocalStorage<Language>();

export function runWithLanguage<T>(language: Language, callback: () => T): T {
  return requestLanguage.run(language, callback);
}

/** Langue de la requete en cours, ou francais hors requete (jobs, scripts). */
export function currentLanguage(): Language {
  return requestLanguage.getStore() ?? DEFAULT_LANGUAGE;
}

/**
 * Negocie une langue a partir d'un en-tete `Accept-Language`.
 *
 * Volontairement simple : on lit les etiquettes dans l'ordre, on ne garde que
 * la sous-etiquette primaire (`fr-CA` -> `fr`), et on renvoie la premiere que
 * nous supportons. Les facteurs de qualite (`;q=0.8`) sont ignores — les
 * navigateurs listent deja leurs preferences dans l'ordre.
 */
export function negotiateLanguage(acceptLanguage: string | undefined): Language | null {
  if (!acceptLanguage) return null;

  for (const part of acceptLanguage.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase();
    const base = tag?.split('-')[0];
    if (isLanguage(base)) return base;
  }

  return null;
}

/** Remplace les `{{nom}}` par leur valeur. Une valeur absente laisse le motif. */
function interpolate(text: string, values?: Record<string, string | number>): string {
  if (!values) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/**
 * Traduit un texte francais.
 *
 * @param text     Texte francais, qui sert aussi de cle.
 * @param values   Valeurs interpolees, referencees `{{nom}}` dans le texte.
 * @param language Langue visee. Par defaut, celle de la requete en cours.
 */
export function t(
  text: string,
  values?: Record<string, string | number>,
  language: Language = currentLanguage()
): string {
  // `language !== 'fr'` ne suffit pas a TypeScript pour indexer CATALOGS : il
  // faut lui dire que ce qui reste est bien une de ses cles.
  if (language === DEFAULT_LANGUAGE) return interpolate(text, values);

  const translated = CATALOGS[language as Exclude<Language, 'fr'>]?.[text];
  // Une entree vide vaut « pas encore traduit » et retombe sur le francais.
  return interpolate(translated || text, values);
}
