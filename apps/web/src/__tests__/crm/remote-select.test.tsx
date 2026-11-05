import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { ContactRemoteSelect, DealRemoteSelect } from '../../components/crm/RemoteSelect';

/**
 * Sélecteurs du CRM à recherche distante (lot DIV-A) : plus de `limit: 500` ni
 * `1000` pour remplir une liste déroulante. La liste est demandée à l'ouverture
 * (20 au plus), puis filtrée par le serveur à chaque pause de frappe ; l'option
 * déjà choisie garde son libellé.
 */

const listContacts = vi.fn();
const getContact = vi.fn();
const listDeals = vi.fn();
const getDeal = vi.fn();

vi.mock('../../services/crm-service', () => ({
  listContacts: (...a: unknown[]) => listContacts(...a),
  getContact: (...a: unknown[]) => getContact(...a),
  listDeals: (...a: unknown[]) => listDeals(...a),
  getDeal: (...a: unknown[]) => getDeal(...a)
}));

function contact(id: string, firstName: string, lastName: string) {
  return { id, firstName, lastName, email: `${firstName.toLowerCase()}@example.com`, contactType: 'PERSON' };
}

function mountContact(props: Partial<React.ComponentProps<typeof ContactRemoteSelect>> = {}) {
  const onChange = vi.fn();
  const utilitaires = render(
    <AntApp>
      <ContactRemoteSelect tenantId="agence-1" placeholder="Sélectionner un contact" onChange={onChange} {...props} />
    </AntApp>
  );
  return { onChange, ...utilitaires };
}

function ouvrir() {
  fireEvent.mouseDown(screen.getByRole('combobox'));
}

beforeEach(() => {
  vi.clearAllMocks();
  listContacts.mockResolvedValue({
    success: true,
    contacts: [contact('c1', 'Awa', 'Diallo'), contact('c2', 'Moussa', 'Traoré')],
    pagination: { page: 1, limit: 20, total: 2, totalPages: 1 }
  });
  getContact.mockResolvedValue({ success: true, data: contact('c9', 'Fanta', 'Kone') });
  listDeals.mockResolvedValue({
    success: true,
    deals: [{ id: 'd1', type: 'ACHAT', stage: 'VISIT', budgetMax: 25000000 }],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
  });
  getDeal.mockResolvedValue({ success: true, data: { id: 'd7', type: 'LOCATION', stage: 'NEW', budgetMax: null } });
});

describe('ContactRemoteSelect', () => {
  it('ne charge rien au montage ; à l’ouverture, une seule requête de 20 contacts au plus', async () => {
    mountContact();
    expect(listContacts).not.toHaveBeenCalled();

    ouvrir();

    await waitFor(() => expect(listContacts).toHaveBeenCalledTimes(1));
    expect(listContacts).toHaveBeenCalledWith('agence-1', { search: undefined, page: 1, limit: 20 });
    expect(await screen.findByText('Awa Diallo (awa@example.com)')).toBeInTheDocument();
  });

  it('la frappe part au serveur après une pause (une seule requête), avec le texte saisi', async () => {
    mountContact();
    ouvrir();
    await waitFor(() => expect(listContacts).toHaveBeenCalledTimes(1));
    listContacts.mockClear();

    const champ = screen.getByRole('combobox');
    fireEvent.change(champ, { target: { value: 'M' } });
    fireEvent.change(champ, { target: { value: 'Mou' } });
    fireEvent.change(champ, { target: { value: 'Moussa' } });

    await waitFor(() => expect(listContacts).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(listContacts).toHaveBeenCalledWith('agence-1', { search: 'Moussa', page: 1, limit: 20 });
  });

  it('choisir une option renvoie son identifiant et garde son libellé affiché', async () => {
    const { onChange } = mountContact();
    ouvrir();
    fireEvent.click(await screen.findByText('Moussa Traoré (moussa@example.com)'));

    expect(onChange).toHaveBeenCalledWith('c2');
  });

  it('une valeur déjà choisie (édition, préremplissage) s’affiche avec son libellé sans ouvrir la liste', async () => {
    mountContact({ value: 'c9' });

    expect(await screen.findByText('Fanta Kone (fanta@example.com)')).toBeInTheDocument();
    expect(getContact).toHaveBeenCalledWith('agence-1', 'c9');
    expect(listContacts).not.toHaveBeenCalled();
  });
});

describe('DealRemoteSelect', () => {
  it('ne demande que les affaires du contact choisi, 20 au plus, et relance la liste quand le contact change', async () => {
    const { rerender } = render(
      <AntApp>
        <DealRemoteSelect tenantId="agence-1" contactId="c1" placeholder="Aucune affaire (optionnel)" />
      </AntApp>
    );
    ouvrir();
    await waitFor(() => expect(listDeals).toHaveBeenCalledTimes(1));
    expect(listDeals).toHaveBeenCalledWith('agence-1', { contactId: 'c1', search: undefined, page: 1, limit: 20 });
    expect(await screen.findByText(/Achat - Visite/)).toBeInTheDocument();

    listDeals.mockClear();
    rerender(
      <AntApp>
        <DealRemoteSelect tenantId="agence-1" contactId="c2" placeholder="Aucune affaire (optionnel)" />
      </AntApp>
    );
    ouvrir();
    await waitFor(() => expect(listDeals).toHaveBeenCalledTimes(1));
    expect(listDeals).toHaveBeenCalledWith('agence-1', { contactId: 'c2', search: undefined, page: 1, limit: 20 });
  });

  it('l’affaire déjà choisie garde son libellé', async () => {
    render(
      <AntApp>
        <DealRemoteSelect tenantId="agence-1" contactId="c1" value="d7" />
      </AntApp>
    );
    expect(await screen.findByText('Location - Nouveau')).toBeInTheDocument();
    expect(getDeal).toHaveBeenCalledWith('agence-1', 'd7');
  });
});
