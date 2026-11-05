import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CollaboratorsList } from '../../pages/tenant/CollaboratorsList';

/**
 * Collaborateurs : liste paginée serveur pilotée par la barre de recherche.
 * Critères dans l'URL, requête `listMembers` rejouée à chaque changement,
 * « aucun résultat » avec Effacer, export aux mêmes critères.
 */

const isDesktop = vi.hoisted(() => ({ value: true }));
const listMembers = vi.hoisted(() => vi.fn());
const listRoles = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: {},
    active: isDesktop.value ? 'lg' : 'xs',
    isMobile: !isDesktop.value,
    isTablet: false,
    isDesktop: isDesktop.value
  })
}));
vi.mock('../../services/membership-service', () => ({
  listMembers: (...args: unknown[]) => listMembers(...args),
  disableMember: vi.fn(),
  enableMember: vi.fn()
}));
vi.mock('../../services/role-service', () => ({
  listRoles: (...args: unknown[]) => listRoles(...args)
}));

const MEMBER = {
  id: 'm1',
  userId: 'u1',
  status: 'ACTIVE',
  roles: [{ id: 'r1', key: 'AGENT', name: 'Agent' }],
  user: { id: 'u1', email: 'kouame@exemple.test', fullName: 'Kouamé Yao', lastLoginAt: null }
};

function reponse(members: unknown[]) {
  return {
    success: true,
    data: { members, pagination: { page: 1, limit: 20, total: members.length, totalPages: 1 } }
  };
}

function Url() {
  const { search } = useLocation();
  return <div data-testid="url">{search}</div>;
}

function renderPage(initial = '/tenant/t1/collaborators') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/tenant/:tenantId/collaborators" element={<CollaboratorsList />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  isDesktop.value = true;
  listMembers.mockReset();
  listRoles.mockReset();
  listMembers.mockResolvedValue(reponse([MEMBER]));
  listRoles.mockResolvedValue([{ id: 'r1', key: 'AGENT', name: 'Agent', scope: 'TENANT' }]);
});

describe('CollaboratorsList : recherche multicritères', () => {
  it('charge la première page sans critère', async () => {
    renderPage();
    expect(await screen.findByText('Kouamé Yao', undefined, T)).toBeInTheDocument();
    expect(listMembers).toHaveBeenCalledWith('t1', { page: 1, limit: 20 });
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('applique la saisie après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Kouamé Yao', undefined, T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'kou');
    await vi.waitFor(
      () => expect(listMembers).toHaveBeenLastCalledWith('t1', { search: 'kou', page: 1, limit: 20 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=kou');
  });

  it('relit les critères de l’URL et affiche des puces', async () => {
    renderPage('/tenant/t1/collaborators?status=ACTIVE,DISABLED&role=r1');
    await screen.findByText('Kouamé Yao', undefined, T);
    expect(listMembers).toHaveBeenCalledWith('t1', {
      status: 'ACTIVE,DISABLED',
      roleId: 'r1',
      page: 1,
      limit: 20
    });
    expect((await within(screen.getByRole('search')).findAllByText(/Actif/, undefined, T)).length).toBeGreaterThan(0);
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    listMembers.mockImplementation(async (_t: string, params: Record<string, unknown>) =>
      reponse(params.search ? [] : [MEMBER])
    );
    renderPage('/tenant/t1/collaborators?q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(boutons[boutons.length - 1]);
    expect(await screen.findByText('Kouamé Yao', undefined, T)).toBeInTheDocument();
    expect(listMembers).toHaveBeenLastCalledWith('t1', { page: 1, limit: 20 });
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });

  it('affiche le message de liste vide sans critère', async () => {
    listMembers.mockResolvedValue(reponse([]));
    renderPage();
    expect(await screen.findByText('Aucun collaborateur pour le moment.', undefined, T)).toBeInTheDocument();
  });
});
