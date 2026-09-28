import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../LanguageProvider';
import { useLanguage } from '../useLanguage';
import { LanguagePreferenceSync } from '../LanguagePreferenceSync';
import { LANGUAGE_STORAGE_KEY, type Language } from '../config';

/**
 * Régression du bug « la connexion écrase la langue du compte avec celle du
 * navigateur » : `LanguageProvider` écrivait la langue DÉTECTÉE (navigateur
 * compris) dans `localStorage` dès le montage, ce qui faisait passer
 * `LanguagePreferenceSync` à côté de la préférence du compte, puis renvoyait
 * la langue du navigateur au serveur comme si la personne l'avait choisie.
 *
 * `useAuth` est simulé : ces tests ne couvrent pas `AuthContext` lui-même,
 * seulement la relation entre la langue affichée et le compte connecté.
 */

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => useAuthMock()
}));

const updatePreferredLanguageMock = vi.fn().mockResolvedValue({});
vi.mock('../../services/auth-service', () => ({
  updatePreferredLanguage: (...args: unknown[]) => updatePreferredLanguageMock(...args)
}));

/**
 * Langue dont le PROCHAIN chargement de catalogue doit échouer — sert
 * uniquement le test (f). `null` (par défaut) laisse `loadLanguage` réel
 * inchangé pour tous les autres tests du fichier.
 */
let failNextLoadFor: Language | null = null;

/**
 * Langue dont le PROCHAIN chargement de catalogue doit rester en attente
 * jusqu'à résolution manuelle — sert uniquement le test (g), pour placer
 * `isAuthenticated` à `true` PENDANT qu'une bascule de `LanguageProvider` est
 * encore en cours (`initialLanguageResolved === false`), plutôt qu'après
 * qu'elle a abouti. `null` (par défaut) laisse `loadLanguage` réel inchangé
 * pour tous les autres tests du fichier.
 */
let deferredLoadFor: Language | null = null;
let releaseDeferredLoad: (() => void) | null = null;

vi.mock('../index', async importOriginal => {
  const actual = await importOriginal<typeof import('../index')>();
  return {
    ...actual,
    loadLanguage: async (language: Language) => {
      if (failNextLoadFor === language) {
        failNextLoadFor = null;
        throw new Error(`catalogue « ${language} » indisponible (test)`);
      }
      if (deferredLoadFor === language) {
        deferredLoadFor = null;
        await new Promise<void>(resolve => {
          releaseDeferredLoad = resolve;
        });
      }
      return actual.loadLanguage(language);
    }
  };
});

function LanguageProbe() {
  const { language, setLanguage } = useLanguage();
  return (
    <div>
      <span data-testid="language">{language}</span>
      <button onClick={() => void setLanguage('en')}>en</button>
      <button onClick={() => void setLanguage('ar')}>ar</button>
    </div>
  );
}

function renderHarness() {
  return render(
    <LanguageProvider>
      <LanguagePreferenceSync />
      <LanguageProbe />
    </LanguageProvider>
  );
}

async function expectLanguage(expected: string) {
  // Chargement réel des catalogues/locales AntD/dayjs (rien n'est mocké ici,
  // contrairement à `language-provider-race.test.tsx`) : le délai par défaut
  // de `waitFor` (1000 ms) est trop court sous charge — même convention que
  // `__tests__/finance/*.test.tsx`.
  await waitFor(() => expect(screen.getByTestId('language')).toHaveTextContent(expected), { timeout: 8000 });
}

/** Langues du navigateur simulées ; restaurées après chaque test. */
function setNavigatorLanguages(languages: string[]) {
  Object.defineProperty(window.navigator, 'languages', { value: languages, configurable: true });
}

describe('LanguagePreferenceSync — relie la langue affichée au compte connecté', () => {
  const originalLanguages = window.navigator.languages;

  beforeEach(() => {
    useAuthMock.mockReset();
    updatePreferredLanguageMock.mockClear();
    useAuthMock.mockReturnValue({ isAuthenticated: false, user: null });
  });

  afterEach(() => {
    // La suite tourne en français (`setupTests.ts`) : on y revient pour ne
    // pas laisser une langue de test fuiter sur le fichier suivant.
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    setNavigatorLanguages([...originalLanguages]);
    failNextLoadFor = null;
    deferredLoadFor = null;
    releaseDeferredLoad = null;
  });

  it('(a) navigateur anglais, aucun choix local, compte arabe : la préférence du compte prime, sans renvoi au serveur', async () => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    setNavigatorLanguages(['en-US']);

    const { rerender } = renderHarness();
    // Détection du navigateur avant même que la session ne réponde.
    await expectLanguage('en');

    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      user: { id: 'user-1', preferredLanguage: 'ar' }
    });
    rerender(
      <LanguageProvider>
        <LanguagePreferenceSync />
        <LanguageProbe />
      </LanguageProvider>
    );

    await expectLanguage('ar');
    expect(updatePreferredLanguageMock).not.toHaveBeenCalled();
  });

  it('(b) la détection du navigateur au montage n’écrit rien dans localStorage', async () => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    setNavigatorLanguages(['en-US']);

    renderHarness();
    await expectLanguage('en');

    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  it('(c) compte sans préférence, langue affichée reprise du navigateur : aucun envoi au serveur', async () => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    setNavigatorLanguages(['en-US']);

    const { rerender } = renderHarness();
    await expectLanguage('en');

    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      user: { id: 'user-2', preferredLanguage: null }
    });
    rerender(
      <LanguageProvider>
        <LanguagePreferenceSync />
        <LanguageProbe />
      </LanguageProvider>
    );

    // Rien à attendre de plus : la langue reste celle du navigateur.
    await expectLanguage('en');
    expect(updatePreferredLanguageMock).not.toHaveBeenCalled();
  });

  it('(d) connecté, changement de langue explicite : le compte est mis à jour une seule fois', async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      user: { id: 'user-3', preferredLanguage: 'fr' }
    });

    renderHarness();
    await expectLanguage('fr');

    screen.getByText('en').click();

    await expectLanguage('en');
    await waitFor(() => expect(updatePreferredLanguageMock).toHaveBeenCalledTimes(1), { timeout: 8000 });
    expect(updatePreferredLanguageMock).toHaveBeenCalledWith('en');
  });

  it('(e) un nouvel objet `user` de même id, avec une préférence périmée, ne ramène pas l’ancienne langue', async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      user: { id: 'user-4', preferredLanguage: 'fr' }
    });

    const { rerender } = renderHarness();
    await expectLanguage('fr');

    // Choix explicite en session : remonté au compte, comme au test (d).
    screen.getByText('en').click();
    await expectLanguage('en');
    await waitFor(() => expect(updatePreferredLanguageMock).toHaveBeenCalledTimes(1), { timeout: 8000 });

    // Un `/me` renvoie un NOUVEL objet `user`, même id, avec la préférence
    // d'avant la bascule — pas encore rafraîchie côté serveur. Il ne doit pas
    // ramener le français.
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      user: { id: 'user-4', preferredLanguage: 'fr' }
    });
    rerender(
      <LanguageProvider>
        <LanguagePreferenceSync />
        <LanguageProbe />
      </LanguageProvider>
    );

    await expectLanguage('en');
    // Aucun nouvel envoi : ce deuxième rendu ne doit rien déclencher de plus.
    expect(updatePreferredLanguageMock).toHaveBeenCalledTimes(1);
  });

  it('(f) la bascule vers la préférence du compte échoue : un changement explicite ultérieur est quand même remonté', async () => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    setNavigatorLanguages(['fr-FR']);
    // Le catalogue anglais échoue à charger à la connexion : `setLanguage('en')`
    // (déclenché par la préférence du compte) rejette.
    failNextLoadFor = 'en';

    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      user: { id: 'user-5', preferredLanguage: 'en' }
    });

    renderHarness();

    // La bascule a échoué : l'écran reste en français (repli navigateur),
    // pas en anglais.
    await expectLanguage('fr');

    // Sans le correctif, `savedLanguage.current` resterait indéfiniment
    // `undefined` après cet échec, et l'effet 2 (garde `=== undefined`) ne
    // remonterait donc plus jamais aucun changement explicite pour ce
    // compte. Un choix explicite vers une AUTRE langue que celle qui a
    // échoué (l'arabe, jamais l'anglais déjà connu du serveur) doit partir.
    screen.getByText('ar').click();

    await expectLanguage('ar');
    await waitFor(() => expect(updatePreferredLanguageMock).toHaveBeenCalledWith('ar'), { timeout: 8000 });
  });

  it('(g) session déjà active au premier rendu (rechargement) : la bascule du navigateur, encore en cours quand la session répond, ne doit pas être remontée au compte une fois retombée', async () => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    setNavigatorLanguages(['en-US']);
    // Le catalogue anglais détecté au montage reste en attente : on simule
    // ainsi une session DÉJÀ authentifiée au tout premier rendu (cookie
    // valide, contrairement aux autres tests qui authentifient après coup)
    // pendant que `LanguageProvider` bascule encore vers l'anglais.
    deferredLoadFor = 'en';
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      user: { id: 'user-6', preferredLanguage: null }
    });

    renderHarness();

    // La bascule est en cours (`initialLanguageResolved === false`) : sans
    // le correctif, l'effet 1 de `LanguagePreferenceSync` lirait ici
    // `language` encore à `'fr'` (valeur transitoire) et la figerait comme
    // référence, avant que la bascule vers l'anglais n'aboutisse.
    await waitFor(() => expect(releaseDeferredLoad).not.toBeNull());

    act(() => {
      releaseDeferredLoad!();
    });

    // La bascule aboutit : l'écran passe en anglais, un simple repli
    // navigateur que personne n'a choisi.
    await expectLanguage('en');
    // Rien à remonter au compte : ni au moment de la bascule, ni après —
    // laisser le temps à un éventuel effet différé de se déclencher.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(updatePreferredLanguageMock).not.toHaveBeenCalled();
  });
});
