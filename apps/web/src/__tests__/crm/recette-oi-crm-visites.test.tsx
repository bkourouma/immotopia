import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';

/**
 * Recette « opérateur intégré » du 28 septembre 2026 :
 * - BUG-014 : aucun écran pour créer un tag CRM ;
 * - BUG-015 : modale de conversion en anglais, rôles en codes bruts ;
 * - BUG-016 : recherche avancée (puces en clair, filtres appliqués, sauvegarde
 *   par une modale et non `window.prompt`) ;
 * - BUG-017/018 : libellés de types d'affaire, étapes et montants ;
 * - BUG-020 : onglet Visites d'un bien (liste, statut, clôture avec
 *   compte-rendu, note jamais effacée par un `notes: null`).
 */

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../../utils/api-client', () => ({ default: api, __esModule: true }));

vi.mock('../../services/geographic-service', () => ({
  __esModule: true,
  getAllCommunes: vi.fn(async () => [
    { communeId: 'commune-1', commune: 'Bingerville', displayName: 'Bingerville', region: 'Lagunes' }
  ])
}));
vi.mock('../../services/membership-service', () => ({
  __esModule: true,
  listMembers: vi.fn(async () => ({
    success: true,
    data: {
      members: [{ userId: 'user-1', user: { id: 'user-1', fullName: 'Salif Coulibaly OI', email: 's@oi.test' } }]
    }
  }))
}));

import { ConvertContactDialog } from '../../components/crm/ConvertContactDialog';
import { TagManager } from '../../components/crm/TagManager';
import { AdvancedContactSearch } from '../../components/crm/AdvancedContactSearch';
import { PropertyVisitsList } from '../../components/properties/PropertyVisitsList';
import { describeFilter } from '../../components/crm/contact-search-filter-labels';
import {
  describeDeal,
  formatFcfa,
  getContactRoleLabel,
  getContactStatusLabel,
  getDealTypeLabel,
  getMaturityLabel
} from '../../utils/crm-utils';
import { completePropertyVisit, updateVisitStatus } from '../../services/property-service';

const wrap = (ui: React.ReactElement, route = '/tenant/agence-1/crm/x') =>
  render(
    <AntApp>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/tenant/:tenantId/*" element={ui} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );

/** Contenu de la modale Ant Design ouverte dont le titre est `titre`. */
async function modale(titre: string): Promise<HTMLElement> {
  const found = await waitFor(() => {
    const el = Array.from(document.querySelectorAll('.ant-modal-title')).find(n => n.textContent === titre);
    if (!el) throw new Error(`Modale « ${titre} » absente`);
    return el.closest('.ant-modal-container, .ant-modal-content, .ant-modal, [role="dialog"]') as HTMLElement;
  });
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('libellés CRM (BUG-015, 017, 018)', () => {
  it('traduit les codes en clair', () => {
    expect(getContactRoleLabel('PROPRIETAIRE')).toBe('Propriétaire');
    expect(getContactStatusLabel('ACTIVE_CLIENT')).toBe('Client actif');
    expect(getMaturityLabel('COLD')).toBe('Froid');
    expect(getDealTypeLabel('VENTE')).toBe('Vente');
  });

  it("une affaire de vente n'est plus libellée « Location » et le montant est en FCFA", () => {
    const texte = describeDeal({ type: 'VENTE', stage: 'QUALIFIED', budgetMax: 50000000 });
    expect(texte).toMatch(/^Vente - Qualifié - 50\D000\D000 FCFA$/);
    expect(texte).not.toContain('€');
    expect(formatFcfa(null)).toBe('—');
  });
});

describe('modale de conversion (BUG-015)', () => {
  it('est entièrement en français', () => {
    render(<ConvertContactDialog contactName="Kouassi Yao OI" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Convertir le prospect en client')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Convertir en client' })).toBeInTheDocument();
    expect(screen.getByText('Propriétaire')).toBeInTheDocument();
    expect(screen.queryByText(/Convert Lead/)).not.toBeInTheDocument();
  });
});

describe('TagManager : création d’un tag (BUG-014)', () => {
  it('crée le tag puis l’assigne au contact', async () => {
    api.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/crm/tags')) return { data: { success: true, data: [] } };
      return { data: { success: true, data: [] } };
    });
    api.post.mockImplementation(async (url: string) => {
      if (url.endsWith('/crm/tags')) {
        return { data: { success: true, data: { id: 'tag-1', name: 'Prospect OI', color: '#1890ff' } } };
      }
      return { data: { success: true } };
    });

    wrap(<TagManager tenantId="agence-1" contactId="contact-1" contactName="Aminata Traoré OI" onClose={vi.fn()} />);

    const champ = await screen.findByPlaceholderText('Nom du nouveau tag');
    await userEvent.type(champ, 'Prospect OI');
    await userEvent.click(screen.getByRole('button', { name: /Créer le tag/ }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/tenants/agence-1/crm/tags', { name: 'Prospect OI', color: '#1890ff' })
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/tenants/agence-1/crm/contacts/contact-1/tags', { tagId: 'tag-1' })
    );
  });

  it('affiche un message clair quand le nom existe déjà', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: [] } });
    api.post.mockRejectedValue({
      response: { status: 409, data: { message: 'Tag "X" already exists in this tenant' } }
    });
    wrap(<TagManager tenantId="agence-1" contactId="contact-1" contactName="A" onClose={vi.fn()} />);
    await userEvent.type(await screen.findByPlaceholderText('Nom du nouveau tag'), 'X');
    await userEvent.click(screen.getByRole('button', { name: /Créer le tag/ }));
    expect(await screen.findByText('Un tag portant ce nom existe déjà.')).toBeInTheDocument();
  });
});

describe('puces de filtres (BUG-016)', () => {
  const refs = {
    communes: [{ id: 'commune-1', name: 'Bingerville' }],
    tags: [{ id: 'tag-1', name: 'Prospect OI' }],
    users: [{ id: 'user-1', fullName: 'Salif Coulibaly OI' }]
  };

  it('nomme les valeurs au lieu d’afficher clés techniques et identifiants', () => {
    expect(describeFilter('communeIds', ['commune-1'], refs)).toBe('Communes : Bingerville');
    expect(describeFilter('statuses', ['ACTIVE_CLIENT'], refs)).toBe('Statuts : Client actif');
    expect(describeFilter('maturityLevels', ['COLD', 'HOT'], refs)).toBe('Maturité : Froid, Chaud');
    expect(describeFilter('roles', ['ACQUEREUR'], refs)).toBe('Rôles CRM : Acquéreur');
    expect(describeFilter('tagIds', ['tag-1'], refs)).toBe('Tags : Prospect OI');
    expect(describeFilter('assignedToUserIds', ['user-1'], refs)).toBe('Assigné à : Salif Coulibaly OI');
    expect(describeFilter('statuses', [], refs)).toBeNull();
  });
});

describe('recherche avancée (BUG-016)', () => {
  const contact = {
    id: 'c1',
    firstName: 'Mariam',
    lastName: 'Koné OI',
    email: 'm@oi.test',
    contactType: 'PERSON',
    status: 'ACTIVE_CLIENT',
    maturityLevel: 'COLD',
    tags: [],
    activeDeals: [],
    roles: []
  };

  beforeEach(() => {
    api.get.mockResolvedValue({ data: { success: true, data: [] } });
    api.post.mockImplementation(async (url: string, body: any) => ({
      data: url.endsWith('/search')
        ? {
            contacts: [contact],
            pagination: { total: 1, page: 1, limit: 50, totalPages: 1 },
            appliedFilters: body?.filters ?? {}
          }
        : { success: true, data: { id: 'saved-1' } }
    }));
  });

  it('applique réellement les filtres, nomme les statuts et sauvegarde par une modale', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('ignoré');
    wrap(<AdvancedContactSearch />, '/tenant/agence-1/newsletter/lists');

    // Statut et maturité en libellés, jamais ACTIVE_CLIENT / COLD.
    expect(await screen.findByText('Client actif')).toBeInTheDocument();
    expect(screen.getByText('Froid')).toBeInTheDocument();
    expect(screen.queryByText('ACTIVE_CLIENT')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Filtres avancés/ }));
    const dialogue = await modale('Filtres avancés');
    await userEvent.click(within(dialogue).getByRole('checkbox', { name: 'Client actif' }));
    await userEvent.click(within(dialogue).getByRole('button', { name: 'Appliquer les filtres' }));

    // La recherche déclenchée par « Appliquer » porte déjà les nouveaux filtres.
    await waitFor(() => {
      const derniere = api.post.mock.calls.filter(c => String(c[0]).endsWith('/search')).at(-1)!;
      expect(derniere[1].filters.statuses).toEqual(['ACTIVE_CLIENT']);
    });
    expect(await screen.findByText('Statuts : Client actif')).toBeInTheDocument();

    // Sauvegarde : une modale avec un champ, aucun window.prompt.
    await userEvent.click(screen.getByRole('button', { name: /Sauvegarder/ }));
    const nom = await screen.findByPlaceholderText('Nom de la recherche');
    await userEvent.type(nom, 'Clients actifs');
    const dialogueSauvegarde = await modale('Sauvegarder la recherche');
    await userEvent.click(within(dialogueSauvegarde).getByRole('button', { name: 'Sauvegarder' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/tenants/agence-1/crm/contacts-search/saved',
        expect.objectContaining({ name: 'Clients actifs', scope: 'PERSONAL' })
      )
    );
    expect(prompt).not.toHaveBeenCalled();
  });
});

describe('onglet Visites d’un bien (BUG-020)', () => {
  const visite = {
    id: 'visit-1',
    propertyId: 'prop-1',
    visitType: 'VISIT',
    goal: 'NETWORKING',
    scheduledAt: '2026-10-05T10:00:00.000Z',
    status: 'SCHEDULED',
    notes: 'Visite A2 avec Aminata (recette OI)',
    contact: { id: 'c1', firstName: 'Aminata', lastName: 'Traoré OI' },
    assignedTo: { id: 'user-1', email: 's@oi.test', fullName: 'Salif Coulibaly OI' },
    createdAt: '',
    updatedAt: ''
  };

  it('liste la visite avec son statut, son objectif et son assigné', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: [visite] } });
    wrap(<PropertyVisitsList tenantId="agence-1" propertyId="prop-1" />);
    expect(await screen.findByText('Aminata Traoré OI')).toBeInTheDocument();
    expect(screen.getByText('Mise en relation')).toBeInTheDocument();
    expect(screen.getByText('Salif Coulibaly OI')).toBeInTheDocument();
    expect(screen.getByText('Planifié')).toBeInTheDocument();
    expect(screen.getByText('Visite A2 avec Aminata (recette OI)')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/tenants/agence-1/properties/prop-1/visits');
  });

  it('clôture la visite avec un compte-rendu qui part avec la requête', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: [visite] } });
    api.post.mockResolvedValue({ data: { success: true, data: { ...visite, status: 'DONE' } } });
    wrap(<PropertyVisitsList tenantId="agence-1" propertyId="prop-1" />);
    await userEvent.click(await screen.findByRole('button', { name: /Clôturer/ }));
    const dialogueClotu = await modale('Clôturer la visite');
    const zone = within(dialogueClotu).getByRole('textbox');
    // La note de planification sert de base au compte-rendu.
    expect(zone).toHaveValue('Visite A2 avec Aminata (recette OI)');
    await userEvent.type(zone, ' — client intéressé');
    await userEvent.click(within(dialogueClotu).getByRole('button', { name: 'Marquer comme terminée' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/tenants/agence-1/properties/prop-1/visits/visit-1/complete', {
        notes: 'Visite A2 avec Aminata (recette OI) — client intéressé'
      })
    );
  });

  it("affiche le refus de droits en français quand l'API répond 403", async () => {
    api.get.mockRejectedValue({ response: { status: 403, data: { message: 'Forbidden' } } });
    wrap(<PropertyVisitsList tenantId="agence-1" propertyId="prop-1" />);
    expect(
      await screen.findByText("Vous n'avez pas les droits nécessaires pour consulter les visites.")
    ).toBeInTheDocument();
  });
});

describe('services de visite (BUG-020)', () => {
  it("n'envoie plus notes: null quand aucun compte-rendu n'est saisi", async () => {
    api.post.mockResolvedValue({ data: { success: true, data: {} } });
    await completePropertyVisit('agence-1', 'prop-1', 'visit-1');
    expect(api.post).toHaveBeenCalledWith('/tenants/agence-1/properties/prop-1/visits/visit-1/complete', {});
  });

  it('change le statut sans toucher aux notes', async () => {
    api.patch.mockResolvedValue({ data: { success: true, data: {} } });
    await updateVisitStatus('agence-1', 'prop-1', 'visit-1', 'CONFIRMED' as never);
    expect(api.patch).toHaveBeenCalledWith('/tenants/agence-1/properties/prop-1/visits/visit-1/status', {
      status: 'CONFIRMED'
    });
  });
});
