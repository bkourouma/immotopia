import { copilotSessionGeneration } from '../utils/copilot-status-cache';

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
let selection: { language: AssistantLanguage | null; generation: number } | undefined;
const subscribers = new Set<() => void>();

export function isAssistantLanguage(value: unknown): value is AssistantLanguage {
  return typeof value === 'string' && assistantLanguageCodes.some(code => code === value);
}

export function readAssistantLanguage(): AssistantLanguage | null {
  return selection?.generation === copilotSessionGeneration ? selection.language : null;
}

export function selectAssistantLanguage(language: AssistantLanguage | null): void {
  if (readAssistantLanguage() === language) return;
  selection = { language, generation: copilotSessionGeneration };
  for (const callback of subscribers) callback();
}
export function subscribeAssistantLanguage(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}
