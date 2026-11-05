import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Contacts } from '../../pages/crm/Contacts';

/**
 * Contacts — recherche multicritères (lot DIV-A). Liste paginée par le serveur :
 * le champ libre et tous les critères partent à l'API, l'état vit dans l'URL.
 */

const listContacts = vi.fn();
const listTags = vi.fn();

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/membership-service', () => ({
  listAssignableMembers: vi.fn(async () => ({
    success: true,
    data: { members: [{ user: { id: 'u1', fullName: 'Awa Koné', email: 'awa@agence.ci' } }] }
  }))
}));
vi.mock('../../services/entitlements-service', () => ({
  getMenuEntitlements: vi.fn(async () => ({ enforcement: 'warn' }))
}));
vi.mock('../../services/crm-service', () => ({
  listContacts: (...a: unknown[]) => listContacts(...a),
  getContact: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  createActivity: vi.fn(),
  listTags: (...a: unknown[]) => listTags(...a),
  deleteContact: vi.fn()
}));
vi.mock('../../components/crm/ContactForm', () => ({ ContactForm: () => null }));
vi.mock('../../components/crm/ActivityForm', () => ({ ActivityForm: () => null }));
vi.mock('../../components/crm/BulkTagManager', () => ({ BulkTagManager: () => null }));

const CONTACT = {
  id: 'c1',
  firstName: 'Awa',
  lastName: 'Diallo',
  email: 'awa.diallo@example.com',
  phonePrimary: '0707070707',
  contactType: 'PERSON',
  status: 'LEAD'
};

const reponse = (contacts: unknown[], total = contacts.length) => ({
  success: true,
  contacts,
  pagination: { page: 1, limit: 20, total, totalPages: Math.max(1, Math.ceil(total / 20)) }
});

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function mount(initial = '/tenant/agence-1/crm/contacts') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/tenant/:tenantId/crm/contacts" element={<Contacts />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  vi.clearAllMocks();
  listContacts.mockResolvedValue(reponse([CONTACT]));
  listTags.mockResolvedValue({ success: true, data: [{ id: 't1', name: 'VIP', color: null }] });
});

describe('Contacts — recherche multicritères', () => {
  it('charge la première page sans critère et affiche la barre de recherche', async () => {
    mount();
    expect(await screen.findByText('Awa Diallo', undefined, T)).toBeInTheDocument();
    expect(listContacts).toHaveBeenCalledWith('agence-1', { page: 1, limit: 20 });
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('la saisie part à l’API après la pause et se retrouve dans l’URL', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Awa Diallo', undefined, T);

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), '0707');

    await vi.waitFor(
      () => expect(listContacts).toHaveBeenLastCalledWith('agence-1', { search: '0707', page: 1, limit: 20 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=0707');
  });

  it('relit tous les critères de l’URL : statut, étiquettes, collaborateur, période, affaire en cours', async () => {
    mount(
      '/tenant/agence-1/crm/contacts?status=LEAD,ACTIVE_CLIENT&tagIds=t1&assignedTo=u1&createdFrom=2026-10-01&createdTo=2026-10-31&hasActiveDeal=1&page=2'
    );
    await screen.findByText('Awa Diallo', undefined, T);
    expect(listContacts).toHaveBeenCalledWith('agence-1', {
      status: 'LEAD,ACTIVE_CLIENT',
      tagIds: 't1',
      assignedTo: 'u1',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      hasActiveDeal: 'true',
      page: 2,
      limit: 20
    });
  });

  it('sous critère sans résultat : « Aucun résultat » puis « Effacer les critères » ramène la liste complète', async () => {
    const user = userEvent.setup();
    listContacts.mockImplementation(async (_t: string, params: Record<string, unknown>) =>
      reponse(params.search ? [] : [CONTACT])
    );
    mount('/tenant/agence-1/crm/contacts?q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    // L'invite à créer un contact n'est pas affichée : la liste n'est pas vide, elle est filtrée.
    expect(screen.queryByText('Commencez par créer votre premier contact.')).not.toBeInTheDocument();

    const boutons = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(boutons[boutons.length - 1]);

    expect(await screen.findByText('Awa Diallo', undefined, T)).toBeInTheDocument();
    expect(listContacts).toHaveBeenLastCalledWith('agence-1', { page: 1, limit: 20 });
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });

  it('sans aucune donnée : invitation à créer le premier contact', async () => {
    listContacts.mockResolvedValue(reponse([]));
    mount();
    expect(await screen.findByText('Commencez par créer votre premier contact.', undefined, T)).toBeInTheDocument();
  });
});
