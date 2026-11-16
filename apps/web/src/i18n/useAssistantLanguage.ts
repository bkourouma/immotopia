import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { isAssistantLanguage, readAssistantLanguage, subscribeAssistantLanguage } from './assistant-language';

export function useAssistantLanguage() {
  const { i18n } = useTranslation();
  const selected = useSyncExternalStore(subscribeAssistantLanguage, readAssistantLanguage, () => null);
  const base = i18n.resolvedLanguage ?? i18n.language;
  return { selected, language: selected ?? (isAssistantLanguage(base) ? base : 'fr') };
}
