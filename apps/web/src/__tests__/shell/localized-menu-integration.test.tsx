import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import { useLanguage } from '../../i18n/useLanguage';
import { LANGUAGE_STORAGE_KEY } from '../../i18n/config';
import { i18next } from '../../i18n';
import { getNavigation } from '../../navigation/model';
import { AppNavigation } from '../../components/shell/AppNavigation';
import { Breadcrumbs } from '../../components/shell/Breadcrumbs';

/**
 * Intégration : le menu rendu et le fil d'Ariane suivent une bascule de
 * langue faite EN SESSION, sans remonter le module ni recharger la page.
 *
 * `AppNavigation` est un composant pur : il affiche le `persona` qu'on lui
 * passe, il ne lit pas lui-même la langue. Dans l'application réelle, c'est
 * `<LocalizedScreens>` (`App.tsx`) qui force le nouveau calcul en remontant
 * tout ce qu'il enveloppe par une `key={language}` quand la langue change —
 * sans quoi `getNavigation()` ne serait jamais rappelée. `LocalizedMenu`
 * ci-dessous reproduit ce même mécanisme pour ce test, à défaut de monter la
 * coquille complète (`AppShell`), qui ne consomme pas non plus le contexte de
 * langue et ne se remonterait donc pas ici faute de `<LocalizedScreens>`.
 *
 * Ce test échoue avec l'ancien code, où `NAVIGATION`/les libellés de section
 * étaient des CONSTANTES DE MODULE construites une seule fois à l'import (donc
 * figées en français) plutôt que des fonctions (`getNavigation()`,
 * `getSectionLabels()`) rappelées — et donc recalculées — à chaque montage.
 */

const TENANT = 'tenant-1';
const PATH = `/tenant/${TENANT}/rental/leases`;

function LocalizedMenu() {
  const { language } = useLanguage();
  return (
    <React.Fragment key={language}>
      <AppNavigation persona={getNavigation().collaborateur} context={{ tenantId: TENANT }} variant="sidebar" />
      <Breadcrumbs />
    </React.Fragment>
  );
}

function LanguageProbe() {
  const { setLanguage } = useLanguage();
  return (
    <div>
      <button onClick={() => void setLanguage('en')}>passer en anglais</button>
      <button onClick={() => void setLanguage('ar')}>passer en arabe</button>
    </div>
  );
}

function renderHarness() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[PATH]}>
        <LanguageProbe />
        <LocalizedMenu />
      </MemoryRouter>
    </LanguageProvider>
  );
}

describe('Menu et fil d’Ariane — suivent une bascule de langue en session', () => {
  afterEach(async () => {
    // La suite tourne en français (`setupTests.ts`) : on y revient pour ne
    // pas laisser une langue de test fuiter sur le fichier suivant. L'instance
    // `i18next` est un singleton de module qui survit d'un `it()` à l'autre
    // DANS ce fichier (seuls les fichiers de test sont isolés) : sans ce
    // `changeLanguage('fr')`, le test suivant démarrerait avec un état React
    // à « fr » mais des libellés encore dans la langue du test précédent.
    await i18next.changeLanguage('fr');
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    document.documentElement.setAttribute('dir', 'ltr');
    document.documentElement.setAttribute('lang', 'fr');
  });

  it('affiche le menu et le fil d’Ariane en français au premier rendu', async () => {
    renderHarness();
    expect(await screen.findByText('Tableau de bord')).toBeInTheDocument();
    expect(screen.getByText('Retour à Gestion locative')).toBeInTheDocument();
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('bascule vers l’anglais sans remontage ni rechargement', async () => {
    renderHarness();
    await screen.findByText('Tableau de bord');

    screen.getByText('passer en anglais').click();

    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument(), { timeout: 8000 });
    expect(screen.queryByText('Tableau de bord')).not.toBeInTheDocument();
    expect(screen.getByText('Back to Rental management')).toBeInTheDocument();
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('bascule vers l’arabe et inverse le sens d’écriture, en direct', async () => {
    renderHarness();
    await screen.findByText('Tableau de bord');

    screen.getByText('passer en arabe').click();

    await waitFor(() => expect(screen.getByText('لوحة المعلومات')).toBeInTheDocument(), { timeout: 8000 });
    expect(screen.queryByText('Tableau de bord')).not.toBeInTheDocument();
    expect(screen.getByText('العودة إلى إدارة الإيجارات')).toBeInTheDocument();
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });

  it('enchaîne deux bascules (anglais puis arabe) sans jamais retomber sur le français', async () => {
    renderHarness();
    await screen.findByText('Tableau de bord');

    screen.getByText('passer en anglais').click();
    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument(), { timeout: 8000 });

    screen.getByText('passer en arabe').click();
    await waitFor(() => expect(screen.getByText('لوحة المعلومات')).toBeInTheDocument(), { timeout: 8000 });
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });
});
