import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE, LANGUAGE_CODES, type Language } from './config';

/**
 * Catalogues découpés par module (`locales/en/finance.json`, …) pour rester
 * relisibles, et agrégés en un espace de noms unique côté i18next : le codemod
 * émet `t('texte')` sans avoir à deviner à quel module appartient une chaîne
 * partagée entre deux écrans.
 *
 * `import.meta.glob` produit un import dynamique par fichier : le français ne
 * télécharge rien du tout (il n'a pas de catalogue — la clé *est* le texte),
 * et l'anglais comme l'arabe ne sont téléchargés qu'une fois choisis.
 */
const catalogLoaders = import.meta.glob<Record<string, string>>('./locales/*/*.json', {
  import: 'default'
});

const NAMESPACE = 'app';

const loadedLanguages = new Set<Language>([DEFAULT_LANGUAGE]);

/**
 * Charge et enregistre les catalogues d'une langue. Idempotent : rappelé pour
 * une langue déjà chargée, il rend la main immédiatement.
 */
export async function loadLanguage(language: Language): Promise<void> {
  if (loadedLanguages.has(language)) return;

  const prefix = `./locales/${language}/`;
  const entries = Object.entries(catalogLoaders).filter(([path]) => path.startsWith(prefix));

  const catalogs = await Promise.all(
    entries.map(async ([path, load]) => {
      try {
        return await load();
      } catch (error) {
        // Un catalogue manquant dégrade l'écran vers le français : c'est
        // nettement préférable à un écran blanc.
        console.error(`[i18n] catalogue illisible : ${path}`, error);
        return {} as Record<string, string>;
      }
    })
  );

  i18next.addResourceBundle(language, NAMESPACE, Object.assign({}, ...catalogs), true, true);
  loadedLanguages.add(language);
}

/**
 * Bascule la langue de l'instance i18next, catalogue chargé d'abord. L'affichage
 * ne change donc jamais en deux temps (textes anglais puis textes arabes).
 */
export async function changeLanguage(language: Language): Promise<void> {
  await loadLanguage(language);
  await i18next.changeLanguage(language);
}

void i18next.use(initReactI18next).init({
  lng: DEFAULT_LANGUAGE,
  supportedLngs: LANGUAGE_CODES,
  ns: [NAMESPACE],
  defaultNS: NAMESPACE,
  resources: {},
  // Aucun repli d'une langue sur l'autre : le repli est le texte français
  // lui-même, que `t()` passe en `defaultValue` (voir `i18n/t.ts`).
  //
  // Et surtout **pas** de `parseMissingKeyHandler` ici. Il intercepte les clés
  // absentes avant `defaultValue` et renvoie la clé brute, sans interpolation :
  // comme le français n'a pas de catalogue, *toutes* ses clés sont absentes, et
  // l'écran affichait « Réf. HTTP-404 · {{pathname}} ».
  fallbackLng: false,
  // Une entrée encore vide dans un catalogue vaut « pas encore traduit », et
  // doit retomber sur le français. Sans cette option, i18next renvoie la chaîne
  // vide telle quelle : l'interface s'affichait avec des boutons sans libellé.
  returnEmptyString: false,
  // Les deux séparateurs sont désactivés : le texte français contient des « : »
  // et des « . » que i18next prendrait sinon pour une notation `ns:a.b`.
  keySeparator: false,
  nsSeparator: false,
  interpolation: {
    // React échappe déjà tout ce qu'il rend ; ré-échapper produisait des
    // « &#39; » visibles dans les apostrophes françaises.
    escapeValue: false
  },
  react: {
    // Les catalogues sont chargés avant le basculement (`changeLanguage`) :
    // aucune suspension à orchestrer, et les écrans déjà montés n'ont pas à
    // retomber sur leur `<Suspense>`.
    useSuspense: false
  }
});

// L'instance démarre en français, et **rien ici** ne la fait basculer.
//
// Appliquer la langue détectée dès le chargement du module semblait plus
// direct, mais cela créait deux propriétaires de la même décision : ce module
// et `<LanguageProvider>`, qui charge en plus la locale AntD et celle de dayjs.
// Les deux couraient l'un contre l'autre, et l'écran pouvait s'afficher avec
// des textes d'une langue et des dates d'une autre. Le provider décide seul.

export { i18next };
export default i18next;
