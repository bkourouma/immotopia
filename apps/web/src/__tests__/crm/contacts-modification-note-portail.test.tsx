import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Contacts } from '../../pages/crm/Contacts';

/**
 * Spec 042, P3 : la fenêtre « Modifier » de la liste des contacts relit le
 * détail du contact, seul à porter la note « avis au compte portail » (la
 * liste ne la renvoie pas).
 */

const listContacts = vi.fn();
const getContact = vi.fn();
const listTags = vi.fn();

vi.mock('../../services/membership-service', () => ({
  listAssignableMembers: vi.fn(async () => ({ success: true, data: [] }))
}));
vi.mock('../../services/entitlements-service', () => ({
  getMenuEntitlements: vi.fn(async () => ({ enforcement: 'warn' }))
}));
vi.mock('../../services/crm-service', () => ({
  listContacts: (...a: unknown[]) => listContacts(...a),
  getContact: (...a: unknown[]) => getContact(...a),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  createActivity: vi.fn(),
  listTags: (...a: unknown[]) => listTags(...a),
  deleteContact: vi.fn()
}));
vi.mock('../../components/ui/location-selector', () => ({
  LocationSelector: () => <div />
}));
vi.mock('../../services/geographic-service', () => ({
  getLocationByCommuneId: vi.fn(async () => null),
  searchLocations: vi.fn(async () => [])
}));

const listed = {
  id: 'c1',
  tenantId: 'agence-1',
  firstName: 'Awa',
  lastName: 'Gogoua',
  email: 'nouvelle@example.ci',
  contactType: 'PERSON',
  tags: []
};

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
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

beforeEach(() => {
  vi.clearAllMocks();
  listContacts.mockResolvedValue({
    success: true,
    contacts: [listed],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
  });
  listTags.mockResolvedValue({ success: true, data: [] });
});

describe('Contacts — fenêtre « Modifier »', { timeout: 60_000 }, () => {
  it('charge le détail du contact et affiche la note du compte portail', async () => {
    getContact.mockResolvedValue({
      success: true,
      data: { ...listed, portalAccountEmailNotice: { maskedEmail: 'a•••@ex•••.ci' } }
    });
    const user = userEvent.setup({ delay: null });
    mount();

    await user.click(await screen.findByRole('button', { name: /edit/i }, { timeout: 8000 }));

    const note = await screen.findByTestId('portal-email-notice', {}, { timeout: 8000 });
    expect(getContact).toHaveBeenCalledWith('agence-1', 'c1');
    expect(note.textContent).toContain("Les avis de prélèvement partent à l'adresse du compte portail :");
    expect(note.querySelector('bdi')?.textContent).toBe('a•••@ex•••.ci');
  });

  it('ouvre quand même le formulaire (sans la note) si le détail ne se charge pas', async () => {
    getContact.mockRejectedValue(new Error('réseau'));
    const user = userEvent.setup({ delay: null });
    mount();

    await user.click(await screen.findByRole('button', { name: /edit/i }, { timeout: 8000 }));

    expect(await screen.findByDisplayValue('nouvelle@example.ci', {}, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(getContact).toHaveBeenCalled());
    expect(screen.queryByTestId('portal-email-notice')).toBeNull();
  });
});
