import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import type { AuthContextType } from '../../types/auth-types';
import { AppShell } from '../../components/shell/AppShell';
import { AppNavigation } from '../../components/shell/AppNavigation';
import { getNavigation } from '../../navigation/model';
// La coquille porte desormais le selecteur de langue : sans ce provider,
// `useLanguage` leve, et c'est voulu — un provider oublie doit se voir.
import { LanguageProvider } from '../../i18n/LanguageProvider';

/**
 * La coquille est le changement le plus étendu du Lot 1 : elle sert les 100
 * écrans et choisit sa navigation à partir du persona. Ces tests la montent
 * réellement, persona par persona, plutôt que de se fier à une capture d'un
 * seul écran connecté.
 *
 * `matchMedia` est mocké à `matches: false` dans `setupTests` : le rendu par
 * défaut est donc le palier mobile. Le cas desktop est obtenu en surchargeant
 * la mesure de `Grid.useBreakpoint()`.
 */

const TENANT = 'tenant-1';

function makeAuth(over: Partial<AuthContextType>): AuthContextType {
  return {
    user: {
      id: 'user-1',
      email: 'test@example.com',
      fullName: 'Alex Martin',
      avatarUrl: null,
      globalRole: 'USER',
      emailVerified: true,
      preferredLanguage: null,
      isActive: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    },
    isAuthenticated: true,
    isLoading: false,
    error: null,
    tenantMembership: null,
    tenantClient: null,
    isLoadingMembership: false,
    login: async () => undefined,
    logout: async () => undefined,
    register: async () => undefined,
    refreshToken: async () => undefined,
    clearError: () => undefined,
    ...over
  } as AuthContextType;
}

const collaborateur = makeAuth({
  tenantMembership: {
    id: 'membership-1',
    tenantId: TENANT,
    tenant: { id: TENANT, name: 'Agence Demo', slug: 'agence-demo' },
    status: 'ACTIVE'
  } as AuthContextType['tenantMembership']
});

const locataire = makeAuth({
  tenantClient: { id: 'client-1', clientType: 'RENTER' } as AuthContextType['tenantClient']
});

const proprietaire = makeAuth({
  tenantClient: { id: 'client-2', clientType: 'OWNER' } as AuthContextType['tenantClient']
});

const superAdmin = makeAuth({
  user: { ...makeAuth({}).user!, globalRole: 'SUPER_ADMIN' }
});

function renderShell(auth: AuthContextType, path: string) {
  return render(
    <LanguageProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="*" element={<div data-testid="contenu">contenu de l’écran</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </LanguageProvider>
  );
}

describe('AppShell — montage par persona', () => {
  it('rend le contenu de la route dans la coquille, pour chaque persona', () => {
    for (const [auth, path] of [
      [collaborateur, `/tenant/${TENANT}/rental/leases`],
      [locataire, '/tenant/lease'],
      [proprietaire, '/owner/revenues'],
      [superAdmin, '/admin/tenants']
    ] as const) {
      const { unmount } = renderShell(auth, path);
      expect(screen.getByTestId('contenu')).toBeInTheDocument();
      unmount();
    }
  });

  it('expose les repères ARIA attendus', () => {
    renderShell(collaborateur, `/tenant/${TENANT}/rental/leases`);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});

describe('AppShell — barre d’onglets basse', () => {
  it('donne 5 onglets au collaborateur, dont « Plus »', () => {
    renderShell(collaborateur, '/dashboard');
    const bar = screen.getByRole('navigation', { name: 'Navigation principale' });
    const boutons = within(bar).getAllByRole('button');
    expect(boutons).toHaveLength(5);
    expect(within(bar).getByText('Encaisser')).toBeInTheDocument();
    expect(within(bar).getByText('Plus')).toBeInTheDocument();
  });

  it('donne 4 onglets au locataire, et aucun « Plus »', () => {
    renderShell(locataire, '/tenant');
    const bar = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(bar).getAllByRole('button')).toHaveLength(4);
    expect(within(bar).queryByText('Plus')).not.toBeInTheDocument();
  });

  it('n’en donne aucune au super-administrateur', () => {
    renderShell(superAdmin, '/admin/tenants');
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).not.toBeInTheDocument();
  });

  it('marque l’onglet actif par aria-current', () => {
    renderShell(collaborateur, `/tenant/${TENANT}/rental/installments`);
    const bar = screen.getByRole('navigation', { name: 'Navigation principale' });
    const actif = within(bar).getByText('Encaisser').closest('button');
    expect(actif).toHaveAttribute('aria-current', 'page');
  });
});

describe('AppShell — fil d’Ariane', () => {
  it('reste muet sur un écran de premier niveau', () => {
    renderShell(collaborateur, '/dashboard');
    // Sous 992 px le fil se réduit à un retour ; à un seul niveau, rien.
    expect(screen.queryByText(/Retour à/)).not.toBeInTheDocument();
  });

  it('propose un retour vers le parent immédiat sous 992 px', () => {
    renderShell(collaborateur, `/tenant/${TENANT}/rental/leases`);
    expect(screen.getByText('Retour à Gestion locative')).toBeInTheDocument();
  });

  it('ne dit jamais « Agence » au locataire', () => {
    renderShell(locataire, '/tenant/lease');
    expect(screen.queryByText(/Agence/)).not.toBeInTheDocument();
  });
});

describe('AppShell — garde du persona', () => {
  it('n’affiche aucun menu tant que l’appartenance charge', () => {
    // Afficher le menu public à un collaborateur, même une seconde, est pire
    // que de n'afficher aucun menu.
    renderShell(makeAuth({ isLoadingMembership: true }), '/dashboard');
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).not.toBeInTheDocument();
    // Le contenu, lui, est bien rendu.
    expect(screen.getByTestId('contenu')).toBeInTheDocument();
  });
});

describe('AppShell — action primaire sortie du menu', () => {
  it('propose le FAB sur l’écran hôte, sous 992 px', () => {
    renderShell(collaborateur, `/tenant/${TENANT}/rental/leases`);
    expect(screen.getByRole('button', { name: 'Nouveau bail' })).toBeInTheDocument();
  });

  it('ne le propose pas ailleurs, ni sur le formulaire de création', () => {
    const { unmount } = renderShell(collaborateur, `/tenant/${TENANT}/rental/leases/new`);
    expect(screen.queryByRole('button', { name: 'Nouveau bail' })).not.toBeInTheDocument();
    unmount();

    renderShell(collaborateur, '/dashboard');
    expect(screen.queryByRole('button', { name: 'Nouveau bail' })).not.toBeInTheDocument();
  });

  it('couvre les quatre actions retirées du menu', () => {
    for (const [path, label] of [
      ['properties', 'Ajouter une propriété'],
      ['crm/contacts', 'Nouveau contact'],
      ['rental/leases', 'Nouveau bail'],
      ['maintenance', 'Signaler un problème']
    ] as const) {
      const { unmount } = renderShell(collaborateur, `/tenant/${TENANT}/${path}`);
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      unmount();
    }
  });
});

describe('AppNavigation — intertitres de domaine', () => {
  function renderNav(variant: 'sidebar' | 'rail') {
    return render(
      <MemoryRouter initialEntries={[`/tenant/${TENANT}/rental/leases`]}>
        <AppNavigation persona={getNavigation().collaborateur} context={{ tenantId: TENANT }} variant={variant} />
      </MemoryRouter>
    );
  }

  it('coiffe Baux et Encaisser d’un titre « Gestion locative »', () => {
    renderNav('sidebar');
    expect(screen.getByText('Gestion locative')).toBeInTheDocument();
    // Le titre n'est pas une destination : rien ne se replie sous lui, rien ne
    // se clique. C'est toute la difference avec l'accordeon que le §4.3 defait.
    expect(screen.queryByRole('menuitem', { name: 'Gestion locative' })).toBeNull();
  });

  it('laisse Baux à un clic, sous son titre', () => {
    renderNav('sidebar');
    // Une destination, pas un en-tete de sous-menu : le titre de domaine ne l'a
    // pas transformee en accordeon.
    const baux = screen.getByText('Baux').closest('li');
    expect(baux).not.toBeNull();
    expect(baux!.className).toContain('ant-menu-item');
    expect(baux!.className).not.toContain('ant-menu-submenu');
  });

  it('laisse le rail plat : un intertitre y serait tronque', () => {
    renderNav('rail');
    expect(screen.queryByText('Gestion locative')).toBeNull();
  });

  it('coiffe le portail propriétaire de « Mon portefeuille » et « Suivi des bâtiments »', () => {
    render(
      <MemoryRouter initialEntries={['/owner/revenues']}>
        <AppNavigation persona={getNavigation().proprietaire} context={{}} variant="sidebar" />
      </MemoryRouter>
    );
    expect(screen.getByText('Mon portefeuille')).toBeInTheDocument();
    expect(screen.getByText('Suivi des bâtiments')).toBeInTheDocument();
    // « Plus » n'appartient a aucun domaine : un filet l'empeche de se lire
    // comme la derniere entree de « Suivi des batiments ».
    expect(document.querySelector('.ant-menu-item-divider')).not.toBeNull();
  });
});

describe('AppShell — compte non rattaché', () => {
  it('rend l’écran dédié à la place de la coquille, sans aucun élément de navigation', () => {
    // Ni agence, ni contrat client : aucune destination, donc aucun menu.
    renderShell(makeAuth({}), '/dashboard');
    expect(screen.getByRole('heading', { name: 'Créer mon espace' })).toBeInTheDocument();
    expect(screen.getByText(/n’est relié à aucune agence/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    // Le contenu de la route n'est pas rendu : il n'aurait rien a afficher.
    expect(screen.queryByTestId('contenu')).not.toBeInTheDocument();
  });

  it('propose une sortie, et rappelle le compte concerné', () => {
    renderShell(makeAuth({}), '/properties');
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument();
  });
});
