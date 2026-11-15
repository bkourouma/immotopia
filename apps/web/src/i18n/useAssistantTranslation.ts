import { useEffect, useState } from 'react';
import i18next, { loadLanguage } from './index';
import type { TranslationValues } from './t';
import { useAssistantLanguage } from './useAssistantLanguage';
import {
  assistantLanguages,
  isAssistantLanguage,
  readAssistantLanguage,
  type AssistantLanguage
} from './assistant-language';
import es from './locales/assistant-es.json';
import hi from './locales/assistant-hi.json';
import zh from './locales/assistant-zh.json';

const catalogs: Record<'es' | 'hi' | 'zh', Record<string, string>> = { es, hi, zh };

function translate(language: AssistantLanguage, text: string, values?: TranslationValues): string {
  if (language === 'es' || language === 'hi' || language === 'zh') {
    const translated = catalogs[language][text] ?? text;
    return translated.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
      values?.[key] == null ? match : String(values[key])
    );
  }
  return i18next.t(text, { lng: language, defaultValue: text, replace: values }) as string;
}

/** Utilisé par les traitements asynchrones du chat, hors du rendu React. */
export function translateActiveAssistant(text: string, values?: TranslationValues): string {
  const base = i18next.resolvedLanguage ?? i18next.language;
  const language = readAssistantLanguage() ?? (isAssistantLanguage(base) ? base : 'fr');
  return translate(language, text, values);
}

export function useAssistantTranslation() {
  const settings = useAssistantLanguage();
  const { language } = settings;
  const [, refresh] = useState(0);
  useEffect(() => {
    if (language !== 'en' && language !== 'ar') return;
    let active = true;
    void loadLanguage(language).then(() => {
      if (active) refresh(version => version + 1);
    });
    return () => {
      active = false;
    };
  }, [language]);

  const t = (text: string, values?: TranslationValues) => translate(language, text, values);
  return { ...settings, locale: assistantLanguages[language].speech, t };
}
