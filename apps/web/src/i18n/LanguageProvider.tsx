import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import dayjs from 'dayjs';
import type { Locale as AntdLocale } from 'antd/es/locale';
import frFR from 'antd/es/locale/fr_FR';
import { i18next, loadLanguage } from './index';
import {
  DEFAULT_LANGUAGE,
  detectInitialLanguage,
  isLanguage,
  isRtl,
  LANGUAGE_STORAGE_KEY,
  LANGUAGES,
  type Language
} from './config';

export interface LanguageContextValue {
  /** Langue effectivement affichée. */
  language: Language;
  /** Sens d'écriture, recopié sur `<html dir>` et sur `<ConfigProvider>`. */
  direction: 'ltr' | 'rtl';
  /** Vrai pour l'arabe. Évite `direction === 'rtl'` disséminé dans les écrans. */
  rtl: boolean;
  /** Locale BCP-47 pour `Intl.NumberFormat` et consorts. */
  locale: string;
  /**
   * Change la langue affichée. Mémorisée dans `localStorage` par défaut
   * (`persist: false` réservé à la détection du navigateur au montage, qui ne
   * doit pas être prise pour un choix — voir `LanguagePreferenceSync`, qui
   * remonte un changement explicite au profil quand la personne est connectée).
   */
  setLanguage: (language: Language, options?: { persist?: boolean }) => Promise<void>;
  /** Vrai pendant le chargement d'un catalogue. */
  isSwitching: boolean;
  /**
   * Vrai une fois que la détection initiale (langue mémorisée, sinon repli
   * navigateur) a fini de s'appliquer. `LanguagePreferenceSync` s'en sert
   * pour ne lire `language` qu'une fois stable — voir son commentaire pour
   * la course que ce drapeau referme : `isSwitching` ne suffit pas, car les
   * effets d'un composant ENFANT (ici `LanguagePreferenceSync`) se
   * déclenchent avant ceux de ce PROVIDER au montage, donc avant même que
   * `isSwitching` ne passe à `true` pour la détection initiale.
   */
  initialLanguageResolved: boolean;
}

export const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

/** Locales Ant Design chargées à la demande — ~12 Ko chacune, inutiles en français. */
const antdLocaleLoaders: Record<Language, () => Promise<{ default: AntdLocale }>> = {
  fr: () => Promise.resolve({ default: frFR }),
  en: () => import('antd/locale/en_US'),
  ar: () => import('antd/locale/ar_EG')
};

const dayjsLocaleLoaders: Record<Language, () => Promise<unknown>> = {
  // `dayjs/locale/fr` est déjà importé par `index.tsx` : les DatePicker et le
  // calendrier react-big-calendar en dépendent au premier rendu.
  fr: () => Promise.resolve(null),
  en: () => import('dayjs/locale/en'),
  ar: () => import('dayjs/locale/ar')
};

function persistLanguage(language: Language): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Stockage refusé : le choix ne survivra pas au rechargement, sans plus.
  }
}

/**
 * Applique la langue à tout ce qui vit **hors de React** : l'attribut `lang` du
 * document (lecteurs d'écran, césure, `:lang()` en CSS), l'attribut `dir`
 * (miroir complet de la mise en page en arabe) et la locale globale de dayjs.
 */
function applyDocumentLanguage(language: Language): void {
  const root = document.documentElement;
  root.setAttribute('lang', language);
  root.setAttribute('dir', LANGUAGES[language].dir);
  // Cible de repli pour la CSS : `html[data-lang='ar']` sert à charger une
  // pile de polices couvrant l'arabe, qu'Inter ne couvre pas.
  root.setAttribute('data-lang', language);
}

export interface LanguageProviderProps {
  children: ReactNode;
}

/**
 * Le provider ne monte pas `<ConfigProvider>` lui-même : le thème et la taille
 * des composants sont décidés par `<ThemedApp>`, qui lit `antdLocale` via
 * `useLanguage()` et le passe au seul `<ConfigProvider>` de l'application.
 */

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  /**
   * L'état part **toujours** du français, même quand la langue mémorisée est
   * l'arabe. C'est délibéré, et ce n'est pas un détail.
   *
   * Le catalogue arrive par le réseau. Si l'état partait déjà sur `ar`, le
   * `setLanguageState('ar')` qui suit son chargement écrirait la même valeur :
   * React ne verrait aucun changement, l'arbre ne se repeindrait pas, et
   * l'écran resterait en français **avec une mise en page arabe** — constaté.
   *
   * Partir du français garantit que l'arrivée du catalogue est une vraie
   * transition d'état : le `key` de `<LocalizedScreens>` change, tout est
   * reconstruit avec les traductions en place. Le prix est une frame de
   * français au premier affichage, presque toujours couverte par le
   * `<Suspense>` du chargement des écrans.
   */
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [antdLocale, setAntdLocale] = useState<AntdLocale>(frFR);
  const [isSwitching, setIsSwitching] = useState(false);
  // Volontairement un état distinct d'`isSwitching` — voir le commentaire de
  // `initialLanguageResolved` sur `LanguageContextValue`.
  const [initialLanguageResolved, setInitialLanguageResolved] = useState(false);

  /**
   * Identifiant du dernier `setLanguage` appelé, incrémenté de façon
   * synchrone à chaque appel (avant tout `await`). Deux bascules peuvent se
   * chevaucher — détection du navigateur au montage vs préférence du compte
   * reprise par `LanguagePreferenceSync` juste après — et le réseau ne
   * garantit pas que la première appelée soit la première résolue : sans
   * cette garde, un appel plus ancien qui finit après un plus récent
   * écraserait son résultat (texte anglais affiché malgré une bascule vers
   * l'arabe déjà terminée). Seul l'appel dont l'identifiant est toujours le
   * plus récent après ses `await` a le droit d'écrire l'état, `i18next`
   * compris — d'où l'appel à `i18next.changeLanguage` déplacé après la
   * garde plutôt que dans `Promise.all`.
   */
  const languageRequestId = useRef(0);

  const setLanguage = useCallback(async (next: Language, options?: { persist?: boolean }) => {
    const persist = options?.persist ?? true;
    const requestId = ++languageRequestId.current;
    setIsSwitching(true);
    try {
      // Catalogue, locale AntD et locale dayjs sont chargés ensemble : basculer
      // l'un sans les autres affichait des mois français sous des libellés
      // arabes le temps d'un aller-retour réseau. Charger le catalogue ne
      // bascule pas encore `i18next` : `loadLanguage` est idempotent et sans
      // effet de bord partagé, contrairement à `i18next.changeLanguage`.
      const [, antd] = await Promise.all([
        loadLanguage(next),
        antdLocaleLoaders[next]().then(module => module.default),
        dayjsLocaleLoaders[next]()
      ]);

      if (languageRequestId.current !== requestId) {
        // Un appel plus récent a démarré entre-temps : celui-ci a perdu la
        // course, il n'écrit plus rien (ni `i18next`, ni le document, ni
        // l'état React, ni `localStorage`).
        return;
      }

      await i18next.changeLanguage(next);

      if (languageRequestId.current !== requestId) {
        // Un appel plus récent a démarré pendant `changeLanguage` lui-même.
        return;
      }

      dayjs.locale(LANGUAGES[next].dayjs);
      applyDocumentLanguage(next);
      setAntdLocale(antd);
      setLanguageState(next);
      // `persist: false` est réservé à la détection du navigateur au montage
      // (voir plus bas) : une langue devinée depuis `navigator.languages`
      // n'est pas un choix de la personne, et l'écrire dans `localStorage`
      // la ferait passer pour tel — `LanguagePreferenceSync` l'enverrait
      // alors au compte comme si elle l'avait sélectionnée elle-même.
      if (persist) persistLanguage(next);
    } finally {
      // Seul le dernier appel en date fait retomber `isSwitching` : un appel
      // périmé qui se termine (ou abandonne à la garde ci-dessus) ne doit pas
      // marquer la fin d'une bascule encore en cours côté appel plus récent.
      if (languageRequestId.current === requestId) {
        setIsSwitching(false);
      }
    }
  }, []);

  // Au montage, on affiche la langue réellement voulue : celle mémorisée, ou
  // à défaut celle du navigateur. `setLanguage` attend le catalogue avant de
  // basculer, si bien que texte, sens d'écriture et locale de dates changent
  // ensemble. Seule une langue déjà mémorisée (donc déjà un choix, explicite
  // ou repris du compte à une connexion précédente) est réécrite dans
  // `localStorage` ; une langue simplement devinée depuis le navigateur ne
  // l'est pas — voir `persist` ci-dessus et `detectInitialLanguage` dans
  // `config.ts`.
  useEffect(() => {
    const detected = detectInitialLanguage();
    if (detected === DEFAULT_LANGUAGE) {
      applyDocumentLanguage(DEFAULT_LANGUAGE);
      setInitialLanguageResolved(true);
      return;
    }
    let alreadyStored = false;
    try {
      alreadyStored = isLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
    } catch {
      // Navigation privée ou stockage refusé : rien à distinguer.
    }
    void setLanguage(detected, { persist: alreadyStored }).finally(() => {
      setInitialLanguageResolved(true);
    });
    // Volontairement au montage seulement : les changements ultérieurs passent
    // par `setLanguage`, qui fait déjà tout ce travail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Un autre onglet a changé de langue : on s'aligne plutôt que d'afficher deux
  // langues différentes dans la même session.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LANGUAGE_STORAGE_KEY) return;
      if (isLanguage(event.newValue) && event.newValue !== language) {
        void setLanguage(event.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [language, setLanguage]);

  const value = useMemo<LanguageContextValue & { antdLocale: AntdLocale }>(
    () => ({
      language,
      direction: LANGUAGES[language].dir,
      rtl: isRtl(language),
      locale: LANGUAGES[language].locale,
      setLanguage,
      isSwitching,
      initialLanguageResolved,
      antdLocale
    }),
    [language, setLanguage, isSwitching, initialLanguageResolved, antdLocale]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
