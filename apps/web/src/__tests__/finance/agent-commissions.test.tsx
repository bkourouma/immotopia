import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommissionsAgents } from '../../pages/finance/CommissionsAgents';

/**
 * Commissions des agents — lot 2 de la gestion locative.
 *
 * Suit le modèle de `__tests__/finance/balances.test.tsx` : un
 * `<QueryClientProvider>` avec `retry: false`, un `<MemoryRouter>` posé sur la
 * route paramétrée, et des délais explicites de 8 s sur les `findBy*` pour
 * survivre à la charge parallèle de la suite complète.
 *
 * Le mock de `services/agent-commissions-service` couvre l'unique export que
 * l'écran utilise (`getAgentCommissions`) : Vitest refuse tout import qu'un
 * `vi.mock` ne déclare pas explicitement, là où Jest renvoyait `undefined` en
 * silence (AGENTS.md).
 */

const getAgentCommissions = vi.fn();

vi.mock('../../services/agent-commissions-service', () => ({
  getAgentCommissions: (...a: unknown[]) => getAgentCommissions(...a)
}));

function rapport(overrides: Record<string, unknown> = {}) {
  return {
    period: '2026-09',
    totals: {
      feesAmount: 450_000,
      vatAmount: 81_000,
      shareAmount: 270_000,
      unassignedFeesAmount: 50_000
    },
    agents: [
      {
        agentUserId: 'agent-1',
        agentName: 'Fatoumata Kouassi',
        sharePercent: 60,
        feeCount: 2,
        feesAmount: 400_000,
        shareAmount: 240_000,
        lines: [
          {
            id: 'ligne-1',
            collectedAt: '2026-09-05',
            leaseId: 'bail-1',
            leaseNumber: 'BAIL-001',
            propertyTitle: 'Villa 4 pièces - Cocody Angré',
            collectedAmount: 350_000,
            feeAmount: 350_000,
            shareAmount: 210_000
          },
          {
            id: 'ligne-2',
            collectedAt: '2026-09-12',
            leaseId: 'bail-2',
            leaseNumber: 'BAIL-002',
            propertyTitle: 'Appartement 2 pièces - Marcory',
            collectedAmount: 50_000,
            feeAmount: 50_000,
            shareAmount: 30_000
          }
        ]
      },
      {
        agentUserId: null,
        agentName: 'Sans gestionnaire',
        sharePercent: null,
        feeCount: 1,
        feesAmount: 50_000,
        shareAmount: 0,
        lines: [
          {
            id: 'ligne-3',
            collectedAt: '2026-09-20',
            leaseId: 'bail-3',
            leaseNumber: 'BAIL-003',
            propertyTitle: 'Studio - Yopougon',
            collectedAmount: 50_000,
            feeAmount: 50_000,
            shareAmount: 0
          }
        ]
      }
    ],
    ...overrides
  };
}

/** Sonde d'adresse : révèle la période portée par l'URL. */
function Adresse() {
  const location = useLocation();
  return <span data-testid="adresse">{location.pathname + location.search}</span>;
}

function mount(url = '/tenant/agence-1/finance/commissions') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/finance/commissions" element={<CommissionsAgents />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Commissions des agents — rendu', () => {
  it('affiche les quatre indicateurs et une ligne par agent', async () => {
    getAgentCommissions.mockResolvedValue(rapport());
    mount();

    expect(await screen.findByText('Fatoumata Kouassi', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Sans gestionnaire')).toBeInTheDocument();

    // « Honoraires HT » apparaît deux fois : le libellé de l'indicateur et
    // l'en-tête de colonne du tableau. Seule sa présence compte ici.
    expect(screen.getAllByText('Honoraires HT').length).toBeGreaterThan(0);
    expect(screen.getByText('TVA')).toBeInTheDocument();
    expect(screen.getByText('Commissions dues aux agents')).toBeInTheDocument();
    expect(screen.getByText('Honoraires sans gestionnaire')).toBeInTheDocument();

    // 450 000, avec l'espace insécable étroite posée par `MoneyValue`.
    expect(screen.getByText(/450\s000\sFCFA/)).toBeInTheDocument();
  });

  it('affiche l’aide de la ligne « Sans gestionnaire »', async () => {
    getAgentCommissions.mockResolvedValue(rapport());
    mount();

    await screen.findByText('Sans gestionnaire', {}, { timeout: 8000 });
    expect(screen.getByLabelText('Aide')).toBeInTheDocument();
  });

  it('déplie une ligne d’agent pour afficher le détail des encaissements', async () => {
    getAgentCommissions.mockResolvedValue(rapport());
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText('Fatoumata Kouassi', {}, { timeout: 8000 });
    expect(screen.queryByText('BAIL-001')).not.toBeInTheDocument();

    const ligneAgent = screen.getByText('Fatoumata Kouassi').closest('tr') as HTMLElement;
    const declencheur = ligneAgent.querySelector('.ant-table-row-expand-icon') as HTMLElement;
    await user.click(declencheur);

    expect(await screen.findByText('BAIL-001', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Villa 4 pièces - Cocody Angré')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'BAIL-001' })).toHaveAttribute(
      'href',
      '/tenant/agence-1/rental/leases/bail-1'
    );
  });

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    getAgentCommissions.mockRejectedValue(new Error('boom'));
    mount();

    expect(
      await screen.findByText('Impossible de charger les commissions des agents.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByText('Réessayer')).toBeInTheDocument();
  });

  it('affiche l’état vide quand aucun honoraire n’a été encaissé', async () => {
    getAgentCommissions.mockResolvedValue(rapport({ agents: [] }));
    mount();

    expect(
      await screen.findByText('Aucun honoraire encaissé sur cette période.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
  });
});

describe('Commissions des agents — période', () => {
  it('interroge le mois courant par défaut', async () => {
    getAgentCommissions.mockResolvedValue(rapport());
    mount();

    await waitFor(() => expect(getAgentCommissions).toHaveBeenCalled(), { timeout: 8000 });
    const moisCourant = new Date().toISOString().slice(0, 7);
    expect(getAgentCommissions).toHaveBeenCalledWith('agence-1', moisCourant);
  });

  it('relit la période depuis l’adresse au montage', async () => {
    getAgentCommissions.mockResolvedValue(rapport());
    mount('/tenant/agence-1/finance/commissions?period=2026-01');

    await waitFor(() => expect(getAgentCommissions).toHaveBeenCalledWith('agence-1', '2026-01'), { timeout: 8000 });
  });

  it('change de mois relance l’appel avec la nouvelle période', async () => {
    getAgentCommissions.mockResolvedValue(rapport());
    const user = userEvent.setup({ delay: null });
    mount('/tenant/agence-1/finance/commissions?period=2026-01');

    await waitFor(() => expect(getAgentCommissions).toHaveBeenCalledWith('agence-1', '2026-01'), { timeout: 8000 });

    // Le mois affiché dans le panneau (« Feb ») ne dépend pas de la langue de
    // l'application : aucun `<ConfigProvider locale>` n'est posé ici, et
    // `MonthPanel` retombe sur les mois abrégés anglais de dayjs. Passer par
    // le clic du panneau plutôt que par une saisie de texte évite donc toute
    // fragilité liée à la locale globale de dayjs, partagée entre les fichiers
    // de test.
    const champPeriode = document.getElementById('commissions-agents-periode') as HTMLInputElement;
    await user.click(champPeriode);
    await user.click(await screen.findByText('Feb', {}, { timeout: 8000 }));

    await waitFor(() => expect(screen.getByTestId('adresse')).toHaveTextContent('period=2026-02'), {
      timeout: 8000
    });
    await waitFor(() => expect(getAgentCommissions).toHaveBeenCalledWith('agence-1', '2026-02'), { timeout: 8000 });
  });
});
