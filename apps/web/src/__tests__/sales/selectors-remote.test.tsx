import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropertySelect, BuyerContactSelect } from '../../pages/sales/selectors';

/**
 * Sélecteurs bien et acquéreur des formulaires de vente : recherche distante
 * (20 options au plus, terme envoyé à l'API, libellé d'une valeur préremplie
 * retrouvé par son identifiant). Plus de `limit: 500`.
 */

const listProperties = vi.fn();
const getProperty = vi.fn();
vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a),
  getProperty: (...a: unknown[]) => getProperty(...a)
}));

const listContacts = vi.fn();
const getContact = vi.fn();
vi.mock('../../services/crm-service', () => ({
  listContacts: (...a: unknown[]) => listContacts(...a),
  getContact: (...a: unknown[]) => getContact(...a),
  listDeals: vi.fn()
}));
vi.mock('../../services/tenant-service', () => ({ getOwnerClients: vi.fn().mockResolvedValue([]) }));
vi.mock('../../services/membership-service', () => ({ listAssignableMembers: vi.fn() }));

const T = { timeout: 8000 };

function monter(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  listProperties.mockResolvedValue({
    properties: [{ id: 'p1', internalReference: 'REF-001', title: 'Villa Cocody' }],
    pagination: {}
  });
  getProperty.mockResolvedValue({ id: 'p9', internalReference: 'REF-009', title: 'Terrain Yopougon' });
  listContacts.mockResolvedValue({
    contacts: [{ id: 'c1', firstName: 'Moussa', lastName: 'Diallo', legalName: null, email: 'm@x.ci' }],
    pagination: {}
  });
  getContact.mockResolvedValue({
    data: { id: 'c9', firstName: 'Awa', lastName: 'Traoré', legalName: null, email: null }
  });
});

describe('PropertySelect : recherche distante', () => {
  it('charge 20 biens au plus, sans limite de 500', async () => {
    monter(<PropertySelect tenantId="t1" />);
    await waitFor(() => expect(listProperties).toHaveBeenCalledWith('t1', { q: undefined, limit: 20 }), T);
  });

  it('envoie la saisie à l’API après le debounce (paramètre q)', async () => {
    const user = userEvent.setup({ delay: null });
    monter(<PropertySelect tenantId="t1" />);
    await user.type(await screen.findByRole('combobox', {}, T), 'yopougon');
    await waitFor(() => expect(listProperties).toHaveBeenLastCalledWith('t1', { q: 'yopougon', limit: 20 }), T);
  });

  it('renvoie l’identifiant du bien choisi', async () => {
    const onChange = vi.fn();
    monter(<PropertySelect tenantId="t1" onChange={onChange} />);
    fireEvent.mouseDown(await screen.findByRole('combobox', {}, T));
    const option = await waitFor(() => {
      const el = screen.getAllByText('REF-001 · Villa Cocody').find(node => node.closest('.ant-select-item'));
      if (!el) throw new Error('option absente');
      return el;
    }, T);
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith('p1');
  });

  it('affiche le libellé d’une valeur préremplie absente des options', async () => {
    monter(<PropertySelect tenantId="t1" value="p9" />);
    expect(await screen.findByText('REF-009 · Terrain Yopougon', {}, T)).toBeInTheDocument();
    expect(getProperty).toHaveBeenCalledWith('t1', 'p9');
  });
});

describe('BuyerContactSelect : recherche distante', () => {
  it('cherche par le paramètre search, 20 contacts au plus', async () => {
    const user = userEvent.setup({ delay: null });
    monter(<BuyerContactSelect tenantId="t1" />);
    await waitFor(() => expect(listContacts).toHaveBeenCalledWith('t1', { search: undefined, limit: 20 }), T);
    await user.type(await screen.findByRole('combobox', {}, T), 'diallo');
    await waitFor(() => expect(listContacts).toHaveBeenLastCalledWith('t1', { search: 'diallo', limit: 20 }), T);
  });

  it('affiche le nom d’un acquéreur déjà choisi', async () => {
    monter(<BuyerContactSelect tenantId="t1" value="c9" />);
    expect(await screen.findByText('Awa Traoré', {}, T)).toBeInTheDocument();
  });
});
