import { useContext } from 'react';
import { LanguageContext, type LanguageContextValue } from './LanguageProvider';
import type { Locale as AntdLocale } from 'antd/es/locale';

/**
 * Langue courante, sens d'écriture et bascule. Lève hors de
 * `<LanguageProvider>` plutôt que de renvoyer un français silencieux : une
 * valeur par défaut masquerait un provider oublié jusqu'en production.
 */
export function useLanguage(): LanguageContextValue & { antdLocale: AntdLocale } {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage doit être appelé sous <LanguageProvider>.');
  }
  return context as LanguageContextValue & { antdLocale: AntdLocale };
}
