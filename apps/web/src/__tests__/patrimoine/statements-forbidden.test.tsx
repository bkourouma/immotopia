import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OwnerStatementsPage } from '../../pages/patrimoine/statements/OwnerStatementsPage';
import { CommissionsAgents } from '../../pages/finance/CommissionsAgents';
import { statementApiErrorMessage } from '../../pages/patrimoine/statements/statement-errors';

/**
 * BUG-2026-11-03-014 : sur un refus de droits (403), l'écran des relevés
 * affiche le message traduit de l'API (jamais « Forbidden ») et l'écran des
 * commissions un état « accès refusé », pas « Impossible de charger ces données ».
 */

const listOwnerStatements = vi.fn();
const getAgentCommissions = vi.fn();

vi.mock('../../services/patrimoine-service', () => ({
  createOwnerStatement: vi.fn(),
  listOwnerStatements: (...a: unknown[]) => listOwnerStatements(...a),
  recomputeOwnerStatement: vi.fn(),
  sendOwnerStatement: vi.fn()
}));
vi.mock('../../services/crm-service', () => ({ listContacts: vi.fn().mockResolvedValue({ contacts: [] }) }));
vi.mock('../../services/property-service', () => ({
  listProperties: vi.fn().mockResolvedValue({ properties: [] })
}));
vi.mock('../../services/agent-commissions-service', () => ({
  getAgentCommissions: (...a: unknown[]) => getAgentCommissions(...a)
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } }) }));
vi.mock('../../hooks/useMenuAccess', () => ({ useOwnAssetsOnly: () => false }));
vi.mock('../../components/patrimoine/OwnerStatementGenerator', () => ({
  OwnerStatementGenerator: () => <div>generateur</div>
}));

const REFUS = "Vous n'avez pas les droits nécessaires pour effectuer cette action.";
const erreur403 = { response: { status: 403, data: { success: false, error: 'Forbidden', message: REFUS } } };

function mount(path: string, element: React.ReactElement, url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path={path} element={element} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('refus de droits — relevés propriétaires', () => {
  it('affiche le message traduit de l’API, pas « Forbidden »', async () => {
    listOwnerStatements.mockRejectedValue(erreur403);
    mount('/tenant/:tenantId/patrimoine/statements', <OwnerStatementsPage />, '/tenant/agence-1/patrimoine/statements');
    expect(await screen.findByText(REFUS, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Forbidden')).not.toBeInTheDocument();
  });

  it('403 sans message : phrase de repli en français', () => {
    expect(statementApiErrorMessage({ response: { status: 403, data: { error: 'Forbidden' } } }, 'x')).toBe(
      "Vous n'avez pas accès aux relevés de gérance."
    );
    expect(statementApiErrorMessage({ response: { status: 500, data: { message: 'Panne' } } }, 'x')).toBe('Panne');
    expect(statementApiErrorMessage(new Error('réseau'), 'repli')).toBe('repli');
  });
});

describe('refus de droits — commissions des agents', () => {
  it('affiche le refus de l’API et non « Impossible de charger »', async () => {
    getAgentCommissions.mockRejectedValue(erreur403);
    mount('/tenant/:tenantId/finance/commissions', <CommissionsAgents />, '/tenant/agence-1/finance/commissions');
    expect(await screen.findByText(REFUS, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(/Impossible de charger/)).not.toBeInTheDocument();
  });
});
