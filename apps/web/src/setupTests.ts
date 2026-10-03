// Jest setup file for frontend tests
import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { LANGUAGE_STORAGE_KEY } from './i18n/config';
import { resetCopilotStatusCache } from './utils/copilot-status-cache';

// Le cache de `GET /ai/status` est global au module : un test ne doit pas hériter de l'état d'un autre.
afterEach(() => resetCopilotStatusCache());

// La suite est ecrite en francais : elle cherche « Enregistrer », pas « Save ».
//
// Sans ce choix explicite, `detectInitialLanguage()` interroge le navigateur,
// et jsdom se declare `en-US` : l'application demarrait en anglais et 415 tests
// echouaient sur des libelles traduits. Pose AVANT que les tests n'importent
// quoi que ce soit, puisque la detection a lieu au chargement du module i18n.
window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
  })
});

// jsdom n'implémente pas ResizeObserver, dont Ant Design 6 se sert dans Menu,
// Layout et Drawer. Les suites qui mockent `antd` en entier ne le rencontraient
// pas ; celles qui montent la vraie coquille, si.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}
