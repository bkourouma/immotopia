export const assistantLanguages = {
  fr: { label: 'Français', speech: 'fr-FR' },
  en: { label: 'English', speech: 'en-US' },
  ar: { label: 'العربية', speech: 'ar' },
  es: { label: 'Español', speech: 'es-ES' },
  zh: { label: '简体中文', speech: 'zh-CN' },
  hi: { label: 'हिन्दी', speech: 'hi-IN' }
} as const;

export type AssistantLanguage = keyof typeof assistantLanguages;
export const assistantLanguageCodes = Object.keys(assistantLanguages) as AssistantLanguage[];
const storageKey = 'immotopia.assistantLanguage';
const changeEvent = 'immotopia:assistant-language';
let selection: AssistantLanguage | null | undefined;

export function isAssistantLanguage(value: unknown): value is AssistantLanguage {
  return typeof value === 'string' && assistantLanguageCodes.some(code => code === value);
}

export function readAssistantLanguage(): AssistantLanguage | null {
  if (selection !== undefined) return selection;
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(storageKey);
    return isAssistantLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

export function selectAssistantLanguage(language: AssistantLanguage | null): void {
  try {
    if (language) window.localStorage.setItem(storageKey, language);
    else window.localStorage.removeItem(storageKey);
    selection = undefined;
  } catch {
    // Une session avec stockage bloqué peut toujours sélectionner une langue.
    selection = language;
  }
  window.dispatchEvent(new Event(changeEvent));
}
export function subscribeAssistantLanguage(callback: () => void): () => void {
  function sync(event: StorageEvent) {
    if (event.key !== storageKey && event.key !== null) return;
    selection = undefined;
    callback();
  }
  window.addEventListener(changeEvent, callback);
  window.addEventListener('storage', sync);
  return () => {
    window.removeEventListener(changeEvent, callback);
    window.removeEventListener('storage', sync);
  };
}
