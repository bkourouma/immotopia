import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Contacts } from '../../pages/crm/Contacts';
import { DealKanban } from '../../components/crm/DealKanban';
import { ContactForm } from '../../components/crm/ContactForm';

/**
 * Lot 4 UI/UX, tâche T3 : CRM, contacts et affaires.
 * États vide / erreur / cartes mobiles de la liste des contacts, suppression nommée,
 * changement d'étape sans glisser-déposer, garde de sortie du formulaire de contact.
 */

const listContacts = vi.fn();
const deleteContact = vi.fn();
let desktop = true;

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: {},
    active: desktop ? 'lg' : 'xs',
    isMobile: !desktop,
    isTablet: false,
    isDesktop: desktop
  })
}));
vi.mock('../../services/membership-service', () => ({
  listAssignableMembers: vi.fn(async () => ({ success: true, data: { members: [] } }))
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
  listTags: vi.fn(async () => ({ success: true, data: [] })),
  deleteContact: (...a: unknown[]) => deleteContact(...a)
}));
vi.mock('../../components/ui/location-selector', () => ({ LocationSelector: () => <div /> }));
vi.mock('../../services/geographic-service', () => ({
  getLocationByCommuneId: vi.fn(async () => null),
  searchLocations: vi.fn(async () => [])
}));
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

const reponse = (contacts: unknown[]) => ({
  success: true,
  contacts,
  pagination: { page: 1, limit: 20, total: contacts.length, totalPages: 1 }
});

function mountContacts() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/crm/contacts']}>
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
  desktop = true;
});

describe('Contacts — états et actions', { timeout: 60_000 }, () => {
  it('une seule action primaire dans l’en-tête : « Nouveau contact »', async () => {
    listContacts.mockResolvedValue(reponse([CONTACT]));
    mountContacts();
    await screen.findByText('Awa Diallo', undefined, T);
    expect(screen.getByRole('heading', { level: 1, name: 'Contacts' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Nouveau contact/ })).toHaveLength(1);
  });

  it('liste vide sans critère : invitation à créer le premier contact', async () => {
    listContacts.mockResolvedValue(reponse([]));
    mountContacts();
    expect(await screen.findByText('Aucun contact trouvé', undefined, T)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer un contact' })).toBeInTheDocument();
  });

  it('erreur de chargement : message métier et bouton « Réessayer » qui relance la lecture', async () => {
    const user = userEvent.setup();
    listContacts.mockRejectedValueOnce(new Error('Network Error'));
    listContacts.mockResolvedValue(reponse([CONTACT]));
    mountContacts();

    expect(await screen.findByText(/Impossible de charger les contacts/, undefined, T)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Awa Diallo', undefined, T)).toBeInTheDocument();
    expect(listContacts).toHaveBeenCalledTimes(2);
  });

  it('la suppression demande confirmation en nommant le contact', async () => {
    const user = userEvent.setup();
    listContacts.mockResolvedValue(reponse([CONTACT]));
    deleteContact.mockResolvedValue({ success: true });
    mountContacts();
    await screen.findByText('Awa Diallo', undefined, T);

    await user.click(screen.getByRole('button', { name: 'Supprimer Awa Diallo' }));
    const dialogue = await screen.findByRole('dialog', undefined, T);
    expect(within(dialogue).getAllByText('Supprimer le contact Awa Diallo ?').length).toBeGreaterThan(0);
    expect(deleteContact).not.toHaveBeenCalled();

    await user.click(within(dialogue).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(deleteContact).toHaveBeenCalledWith('agence-1', 'c1'), T);
  });

  it('sous 992 px : cartes à la place du tableau, avec action « Appeler »', async () => {
    desktop = false;
    listContacts.mockResolvedValue(reponse([CONTACT]));
    mountContacts();
    await screen.findByText('Awa Diallo', undefined, T);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Contacts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Appeler/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Sélectionner Awa Diallo' })).toBeInTheDocument();
  });
});

describe('DealKanban — déplacer sans glisser-déposer', () => {
  it('« Déplacer vers… » appelle onStageChange avec l’étape choisie', async () => {
    const user = userEvent.setup();
    const onStageChange = vi.fn();
    const deal = {
      id: 'd1',
      contactId: 'c1',
      type: 'ACHAT',
      stage: 'NEW',
      budgetMax: 50000000,
      version: 1,
      createdAt: new Date().toISOString(),
      contact: { firstName: 'Awa', lastName: 'Diallo' }
    };
    const vide = { deals: [], total: 0, page: 1, loading: false, loadingMore: false };
    render(
      <DealKanban
        stages={['NEW', 'QUALIFIED']}
        columns={{
          NEW: { ...vide, deals: [deal as never], total: 1 },
          QUALIFIED: vide
        }}
        onStageChange={onStageChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /Déplacer l'affaire de Awa Diallo/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Qualifié' }));

    expect(onStageChange).toHaveBeenCalledWith('d1', 'QUALIFIED');
    expect(screen.getByTestId('kanban-total-NEW')).toHaveTextContent('1');
  });
});

describe('ContactForm — garde de sortie', () => {
  it('« Annuler » après une saisie demande confirmation avant de quitter', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <AntApp>
        <ContactForm onSubmit={vi.fn()} onCancel={onCancel} />
      </AntApp>
    );

    await user.type(screen.getByPlaceholderText('Prénom'), 'Awa');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect((await screen.findAllByText('Abandonner la saisie ?', undefined, T)).length).toBeGreaterThan(0);
    expect(onCancel).not.toHaveBeenCalled();

    const dialogue = await screen.findByRole('dialog', undefined, T);
    await user.click(within(dialogue).getByRole('button', { name: 'Abandonner' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1), T);
  });

  it('sans saisie, « Annuler » quitte directement', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <AntApp>
        <ContactForm onSubmit={vi.fn()} onCancel={onCancel} />
      </AntApp>
    );
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
