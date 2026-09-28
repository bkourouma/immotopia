import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../LanguageProvider';
import { useLanguage } from '../useLanguage';
import { LANGUAGE_STORAGE_KEY } from '../config';

/**
 * Régression : deux `setLanguage` qui se chevauchent (ex. détection du
 * navigateur au montage vs préférence du compte reprise juste après par
 * `LanguagePreferenceSync`) ne garantissent pas que le premier appelé soit le
 * premier résolu. Sans garde « dernier appel gagnant », un appel plus ancien
 * qui finit après un plus récent écrasait son résultat — l'écran retombait
 * sur la langue du premier appel alors que le second, plus récent, avait
 * déjà « gagné ».
 *
 * `loadLanguage` (le chargement réseau du catalogue) est le seul point
 * asynchrone dont on contrôle l'ordre de résolution ici ; `i18next` est
 * simulé pour ne pas dépendre de l'instance réelle.
 */

const changeLanguageMock = vi.fn().mockResolvedValue(undefined);
let loadLanguageMock: ReturnType<typeof vi.fn>;

vi.mock('../index', () => ({
  i18next: {
    get language() {
      return 'fr';
    },
    changeLanguage: (...args: unknown[]) => changeLanguageMock(...args)
  },
  loadLanguage: (...args: unknown[]) => loadLanguageMock(...args)
}));

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

type SetLanguage = ReturnType<typeof useLanguage>['setLanguage'];

function Harness({ captureSetLanguage }: { captureSetLanguage: (fn: SetLanguage) => void }) {
  const { language, setLanguage, isSwitching } = useLanguage();
  captureSetLanguage(setLanguage);
  return (
    <div>
      <span data-testid="language">{language}</span>
      <span data-testid="switching">{String(isSwitching)}</span>
    </div>
  );
}

describe('LanguageProvider — course entre deux setLanguage', () => {
  afterEach(() => {
    // La suite tourne en français (`setupTests.ts`).
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    document.documentElement.setAttribute('dir', 'ltr');
    document.documentElement.setAttribute('lang', 'fr');
    vi.clearAllMocks();
  });

  it('le second appel gagne quand le premier se résout après lui', async () => {
    const deferredEn = deferred();
    const deferredAr = deferred();
    loadLanguageMock = vi.fn((lang: string) => {
      if (lang === 'en') return deferredEn.promise;
      if (lang === 'ar') return deferredAr.promise;
      return Promise.resolve();
    });

    let setLanguage: SetLanguage = async () => undefined;
    render(
      <LanguageProvider>
        <Harness captureSetLanguage={fn => (setLanguage = fn)} />
      </LanguageProvider>
    );

    await waitFor(() => expect(screen.getByTestId('language')).toHaveTextContent('fr'));

    // Deux bascules lancées l'une après l'autre, sans attendre la première —
    // exactement ce qui se produit entre la détection du navigateur et la
    // préférence du compte reprise juste derrière. Les `setLanguage` sont
    // appelés hors d'un évènement utilisateur (comme le sont ceux déclenchés
    // par `LanguagePreferenceSync`) : `act()` fait attendre React jusqu'à ce
    // que toutes les mises à jour d'état déclenchées, y compris celles qui
    // suivent un `await` interne, soient commises avant l'assertion.
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = setLanguage('en');
      second = setLanguage('ar');

      // Le SECOND appel (arabe) se résout AVANT le premier (anglais) : c'est
      // la course que la garde doit trancher en faveur du plus récent.
      deferredAr.resolve();
      await second;
      deferredEn.resolve();
      await first;
    });

    expect(screen.getByTestId('language')).toHaveTextContent('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    // Le dernier appel en date (ar) doit faire retomber `isSwitching`, pas
    // le premier qui a perdu la course et abandonné avant d'y toucher.
    expect(screen.getByTestId('switching')).toHaveTextContent('false');
  });
});
