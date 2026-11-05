import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { Deals } from '../../pages/crm/Deals';
import { exportToCSV } from '../../utils/export-utils';

/**
 * Pipeline des affaires chargé PAR COLONNE (lot DIV-A).
 *
 * Avant : `limit: 1000` pour remplir le pipeline, puis un filtre du texte côté
 * client sur cette page serveur (le compteur et la liste pouvaient se
 * contredire). Maintenant : une requête par étape, 30 cartes par page, le
 * total de l'étape dans l'en-tête de colonne, « Afficher plus » pour la page
 * suivante d'UNE colonne, et la recherche part à l'API.
 */

const listDeals = vi.fn();
const updateDeal = vi.fn();

vi.mock('../../services/crm-service', () => ({
  listDeals: (...a: unknown[]) => listDeals(...a),
  updateDeal: (...a: unknown[]) => updateDeal(...a),
  createDeal: vi.fn(),
  createActivity: vi.fn()
}));
vi.mock('../../components/crm/DealForm', () => ({ DealForm: () => null }));
vi.mock('../../components/crm/ActivityForm', () => ({ ActivityForm: () => null }));
vi.mock('../../services/membership-service', () => ({
  listAssignableMembers: vi.fn(async () => ({
    success: true,
    data: { members: [{ user: { id: 'u1', fullName: 'Awa Koné', email: 'awa@agence.ci' } }] }
  }))
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../utils/export-utils', () => ({ exportToCSV: vi.fn(), exportToExcel: vi.fn() }));

function deal(id: string, stage: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    contactId: `c-${id}`,
    stage,
    type: 'ACHAT',
    version: 1,
    createdAt: '2026-10-01T10:00:00.000Z',
    contact: { firstName: 'Awa', lastName: `Client ${id}`, email: `${id}@example.com` },
    ...extra
  };
}

function page(stage: string, items: unknown[], total: number, pageNumber = 1) {
  return {
    success: true,
    deals: items,
    pagination: { page: pageNumber, limit: 30, total, totalPages: Math.ceil(total / 30) }
  };
}

/** Réponses par défaut : une affaire par étape, sauf NEW qui en compte 45. */
function repondreParEtape() {
  listDeals.mockImplementation(async (_tenant: string, filters: { stage?: string; page?: number; search?: string }) => {
    const { stage, page: p = 1 } = filters;
    if (stage === 'NEW') {
      return p === 1
        ? page(
            'NEW',
            Array.from({ length: 30 }, (_, i) => deal(`new-${i}`, 'NEW')),
            45,
            1
          )
        : page(
            'NEW',
            Array.from({ length: 15 }, (_, i) => deal(`new-${30 + i}`, 'NEW')),
            45,
            2
          );
    }
    if (stage === 'QUALIFIED') return page('QUALIFIED', [deal('q-1', 'QUALIFIED')], 1);
    if (stage === 'VISIT') return page('VISIT', [deal('v-1', 'VISIT')], 1);
    return page('NEGOTIATION', [], 0);
  });
}

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function mount(initial = '/tenant/agence-1/crm/deals') {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[initial]}>
        <Url />
        <Routes>
          <Route path="/tenant/:tenantId/crm/deals" element={<Deals />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  repondreParEtape();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Affaires — pipeline chargé par colonne', () => {
  it('fait une requête par étape (30 par page, jamais 1000) et affiche le total de chaque étape', async () => {
    mount();

    await waitFor(() => expect(screen.getByTestId('kanban-total-NEW')).toHaveTextContent('45'));
    expect(screen.getByTestId('kanban-total-QUALIFIED')).toHaveTextContent('1');
    expect(screen.getByTestId('kanban-total-NEGOTIATION')).toHaveTextContent('0');

    const appels = listDeals.mock.calls.map(([, filters]) => filters);
    expect(appels).toHaveLength(4);
    expect(appels.map(f => f.stage).sort()).toEqual(['NEGOTIATION', 'NEW', 'QUALIFIED', 'VISIT']);
    for (const filtres of appels) {
      expect(filtres.limit).toBe(30);
      expect(filtres.page).toBe(1);
    }
    expect(appels.some(f => f.limit >= 1000)).toBe(false);
    // 30 cartes chargées sur 45 dans NEW : « Afficher plus » est proposé.
    expect(screen.getAllByText('Afficher plus')).toHaveLength(1);
  });

  it('« Afficher plus » charge la page suivante de CETTE colonne seulement', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('kanban-total-NEW')).toHaveTextContent('45'));
    listDeals.mockClear();

    fireEvent.click(screen.getByText('Afficher plus'));

    await waitFor(() => expect(listDeals).toHaveBeenCalledTimes(1));
    expect(listDeals.mock.calls[0][1]).toMatchObject({ stage: 'NEW', page: 2, limit: 30 });
    // Les 45 cartes sont là, le bouton disparaît, les autres colonnes n'ont pas bougé.
    await waitFor(() => expect(screen.queryByText('Afficher plus')).not.toBeInTheDocument());
    expect(screen.getByText('Awa Client new-44')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-total-QUALIFIED')).toHaveTextContent('1');
  });

  it('la recherche part à l’API pour chaque colonne (aucun filtrage côté client)', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('kanban-total-NEW')).toHaveTextContent('45'));
    listDeals.mockClear();
    // Le texte tapé ne correspond à aucune carte affichée : si le client filtrait,
    // les cartes disparaîtraient sans requête.
    listDeals.mockImplementation(async (_t: string, f: { stage?: string }) =>
      f.stage === 'VISIT' ? page('VISIT', [deal('v-9', 'VISIT')], 1) : page(String(f.stage), [], 0)
    );

    const user = userEvent.setup();
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'Cocody');

    await waitFor(() => expect(listDeals).toHaveBeenCalledTimes(4), { timeout: 4000 });
    expect(screen.getByTestId('url')).toHaveTextContent('q=Cocody');
    for (const [, filters] of listDeals.mock.calls) {
      expect(filters.search).toBe('Cocody');
      expect(filters.page).toBe(1);
      expect(filters.limit).toBe(30);
    }
    await waitFor(() => expect(screen.getByTestId('kanban-total-NEW')).toHaveTextContent('0'));
    expect(screen.getByTestId('kanban-total-VISIT')).toHaveTextContent('1');
    expect(screen.getByText('1 résultat')).toBeInTheDocument();
  });

  it('un critère sans résultat affiche « Aucun résultat » et « Effacer les filtres », pas l’invite à créer', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('kanban-total-NEW')).toHaveTextContent('45'));
    listDeals.mockImplementation(async (_t: string, f: { stage?: string }) => page(String(f.stage), [], 0));

    const user = userEvent.setup();
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'zzz');

    await screen.findByText('Aucun résultat', undefined, { timeout: 4000 });
    expect(screen.queryByText('Commencez par créer votre première affaire.')).not.toBeInTheDocument();
    // Le bouton « Effacer les critères » de la barre ramène à la liste complète.
    repondreParEtape();
    listDeals.mockClear();
    await user.click(screen.getAllByText('Effacer les critères')[0]);
    await waitFor(() => expect(screen.getByTestId('kanban-total-NEW')).toHaveTextContent('45'));
    expect(screen.getByTestId('url')).toHaveTextContent('');
  });

  it('déplacer une carte garde le même appel d’API et recharge les deux colonnes touchées', async () => {
    updateDeal.mockResolvedValue({ success: true });
    mount();
    await waitFor(() => expect(screen.getByTestId('kanban-total-QUALIFIED')).toHaveTextContent('1'));
    listDeals.mockClear();

    const carte = screen.getByText('Awa Client q-1').closest('[draggable="true"]') as HTMLElement;
    const colonneVisite = screen.getByTestId('kanban-total-VISIT').closest('.flex-shrink-0') as HTMLElement;
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(carte, { dataTransfer });
    fireEvent.dragOver(colonneVisite, { dataTransfer });
    await act(async () => {
      fireEvent.drop(colonneVisite, { dataTransfer });
    });

    await waitFor(() => expect(updateDeal).toHaveBeenCalledWith('agence-1', 'q-1', { stage: 'VISIT', version: 1 }));
    await waitFor(() => expect(listDeals).toHaveBeenCalledTimes(2));
    expect(listDeals.mock.calls.map(([, f]) => f.stage).sort()).toEqual(['QUALIFIED', 'VISIT']);
    expect(within(document.body).queryAllByText('Afficher plus')).toHaveLength(1);
  });

  it('le critère d’étape (dans l’URL) ne garde que ses colonnes et n’interroge que celles-là', async () => {
    mount('/tenant/agence-1/crm/deals?stage=VISIT,NEGOTIATION&type=ACHAT&assignedTo=u1');

    await waitFor(() => expect(listDeals).toHaveBeenCalledTimes(2));
    const appels = listDeals.mock.calls.map(([, f]) => f);
    expect(appels.map(f => f.stage).sort()).toEqual(['NEGOTIATION', 'VISIT']);
    for (const filtres of appels) {
      expect(filtres).toMatchObject({ type: 'ACHAT', assignedTo: 'u1', page: 1, limit: 30 });
    }
    await waitFor(() => expect(screen.getByTestId('kanban-total-VISIT')).toHaveTextContent('1'));
    expect(screen.queryByTestId('kanban-total-NEW')).not.toBeInTheDocument();
  });

  it.each(['WON', 'LOST'])('une étape clôturée %s sélectionnée affiche ses affaires dans le pipeline', async stage => {
    listDeals.mockImplementation(async () => page(stage, [deal('closed-1', stage)], 1));
    mount(`/tenant/agence-1/crm/deals?stage=${stage}`);

    expect(await screen.findByText('Awa Client closed-1')).toBeInTheDocument();
    expect(screen.getByTestId(`kanban-total-${stage}`)).toHaveTextContent('1');
    expect(screen.getByText('1 résultat')).toBeInTheDocument();
    expect(listDeals).toHaveBeenCalledTimes(1);
    expect(listDeals.mock.calls[0][1]).toMatchObject({ stage, page: 1, limit: 30 });
    expect(screen.queryByText('Aucun résultat')).not.toBeInTheDocument();
  });

  it('l’export du pipeline sans critère d’étape reste limité aux étapes affichées', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('kanban-total-NEW')).toHaveTextContent('45'));
    listDeals.mockClear();
    listDeals.mockResolvedValue(page('NEW', [deal('export-1', 'NEW')], 1));

    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));

    await waitFor(() => expect(exportToCSV).toHaveBeenCalled());
    expect(listDeals.mock.calls[0][1]).toMatchObject({ stage: 'NEW,QUALIFIED,VISIT,NEGOTIATION', page: 1 });
  });

  it('la vue Liste envoie les mêmes critères à l’API, avec la page du serveur', async () => {
    listDeals.mockImplementation(async () => ({
      success: true,
      deals: [deal('l-1', 'VISIT')],
      pagination: { page: 2, limit: 20, total: 41, totalPages: 3 }
    }));
    mount('/tenant/agence-1/crm/deals?q=Awa&stage=VISIT&page=2');
    await waitFor(() => expect(listDeals).toHaveBeenCalled());
    listDeals.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Liste' }));

    await waitFor(() => expect(listDeals).toHaveBeenCalledTimes(1));
    expect(listDeals.mock.calls[0][1]).toEqual({ search: 'Awa', stage: 'VISIT', page: 2, limit: 20 });
    expect(await screen.findByText('41 résultats')).toBeInTheDocument();
  });
});
