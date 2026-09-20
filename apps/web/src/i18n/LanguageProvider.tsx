import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import dayjs from 'dayjs';
import type { Locale as AntdLocale } from 'antd/es/locale';
import frFR from 'antd/locale/fr_FR';
import { changeLanguage as applyLanguage } from './index';
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
  /** Change la langue, la mémorise, et la remonte au profil si connecté. */
  setLanguage: (language: Language) => Promise<void>;
  /** Vrai pendant le chargement d'un catalogue. */
  isSwitching: boolean;
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

  const setLanguage = useCallback(async (next: Language) => {
    setIsSwitching(true);
    try {
      // Catalogue, locale AntD et locale dayjs sont chargés ensemble : basculer
      // l'un sans les autres affichait des mois français sous des libellés
      // arabes le temps d'un aller-retour réseau.
      const [, antd] = await Promise.all([
        applyLanguage(next),
        antdLocaleLoaders[next]().then(module => module.default),
        dayjsLocaleLoaders[next]()
      ]);

      dayjs.locale(LANGUAGES[next].dayjs);
      applyDocumentLanguage(next);
      setAntdLocale(antd);
      setLanguageState(next);
      persistLanguage(next);
    } finally {
      setIsSwitching(false);
    }
  }, []);

  // Au montage, on applique la langue réellement voulue : celle mémorisée, ou
  // celle du navigateur. `setLanguage` attend le catalogue avant de basculer,
  // si bien que texte, sens d'écriture et locale de dates changent ensemble.
  useEffect(() => {
    const detected = detectInitialLanguage();
    if (detected === DEFAULT_LANGUAGE) {
      applyDocumentLanguage(DEFAULT_LANGUAGE);
      return;
    }
    void setLanguage(detected);
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
      antdLocale
    }),
    [language, setLanguage, isSwitching, antdLocale]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
