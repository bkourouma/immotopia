import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommissionsAgents } from '../../pages/finance/CommissionsAgents';

/**
 * Commissions des agents — lot FIN-B, phase 1 : pagination locale du tableau
 * principal (20) et du sous-tableau des encaissements (10 au-delà de 10).
 */

const getAgentCommissions = vi.fn();

vi.mock('../../services/agent-commissions-service', () => ({
  getAgentCommissions: (...a: unknown[]) => getAgentCommissions(...a)
}));

const numero = (i: number) => String(i).padStart(2, '0');

function ligne(i: number) {
  return {
    id: `ligne-${i}`,
    collectedAt: '2026-09-05',
    leaseId: `bail-${i}`,
    leaseNumber: `BAIL-${numero(i)}`,
    propertyTitle: `Bien ${numero(i)}`,
    collectedAmount: 1000,
    feeAmount: 100,
    shareAmount: 60
  };
}

function rapport(nombreAgents: number, lignesDuPremier = 1) {
  return {
    period: '2026-09',
    totals: { feesAmount: 1, vatAmount: 1, shareAmount: 1, unassignedFeesAmount: 0 },
    agents: Array.from({ length: nombreAgents }, (_, i) => ({
      agentUserId: `agent-${i + 1}`,
      agentName: `Agent ${numero(i + 1)}`,
      sharePercent: 60,
      feeCount: 1,
      feesAmount: 100,
      shareAmount: 60,
      lines: Array.from({ length: i === 0 ? lignesDuPremier : 1 }, (_, j) => ligne(j + 1))
    }))
  };
}

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/finance/commissions?period=2026-09']}>
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

describe('Commissions des agents — pagination locale', () => {
  it('affiche 20 agents sur 25, avec le compteur', async () => {
    getAgentCommissions.mockResolvedValue(rapport(25));
    mount();

    expect(await screen.findByText('Agent 20', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Agent 21')).not.toBeInTheDocument();
    expect(screen.getByText('1–20 sur 25')).toBeInTheDocument();
  }, 15000);

  it('pagine par 10 le sous-tableau d’un agent qui compte plus de 10 encaissements', async () => {
    getAgentCommissions.mockResolvedValue(rapport(2, 12));
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText('Agent 01', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Expand row/i })[0]);

    expect(await screen.findByText('BAIL-10', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('BAIL-11')).not.toBeInTheDocument();
    expect(screen.getByText('1–10 sur 12')).toBeInTheDocument();
  }, 15000);
});
