import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configure, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BalanceClients } from '../../pages/finance/BalanceClients';
import { BalanceAgee } from '../../pages/finance/BalanceAgee';

/**
 * rec040-01 : un 403 de l'API (rôle sans la permission, par exemple un
 * magasinier devant une page financière) doit rendre le refus d'accès, pas la
 * panne générique « Impossible de charger… ». Un 403 d'abonnement (avec `code`)
 * garde le message d'erreur et son bouton Réessayer. Échantillon : les deux
 * balances, qui passent l'erreur brute de la requête à `<DataView errorCause>`.
 */

configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 30000 });

const getClientsBalance = vi.fn();
const getClientsAgingBalance = vi.fn();

vi.mock('../../services/finance-service', () => ({
  getClientsBalance: (...a: unknown[]) => getClientsBalance(...a),
  getClientsAgingBalance: (...a: unknown[]) => getClientsAgingBalance(...a)
}));
vi.mock('../../services/property-service', () => ({ listProperties: vi.fn().mockResolvedValue({ data: [] }) }));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const erreurHttp = (status: number, data: Record<string, unknown> = {}) =>
  Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status, data } });

function monter(chemin: string, ecran: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[`/tenant/agence-1/finance/${chemin}`]}>
          <Routes>
            <Route path={`/tenant/:tenantId/finance/${chemin}`} element={ecran} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const ECRANS: Array<[string, string, React.ReactElement, typeof getClientsBalance, string]> = [
  [
    'balance clients',
    'balance-clients',
    <BalanceClients />,
    getClientsBalance,
    'Impossible de charger la balance clients.'
  ],
  ['balance âgée', 'balance-agee', <BalanceAgee />, getClientsAgingBalance, 'Impossible de charger la balance âgée.']
];

describe.each(ECRANS)('%s : erreur de chargement', (_nom, chemin, ecran, appel, messageGenerique) => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('403 sans code : refus d’accès, pas la panne générique', async () => {
    appel.mockRejectedValue(erreurHttp(403, { message: 'Permission refusée' }));
    monter(chemin, ecran);
    expect(await screen.findByText('Accès non autorisé')).toBeInTheDocument();
    expect(screen.queryByText(messageGenerique)).not.toBeInTheDocument();
  });

  it('403 d’abonnement (avec code) : garde le message d’erreur', async () => {
    appel.mockRejectedValue(erreurHttp(403, { code: 'SUBSCRIPTION_LIMIT' }));
    monter(chemin, ecran);
    expect(await screen.findByText(messageGenerique)).toBeInTheDocument();
    expect(screen.queryByText('Accès non autorisé')).not.toBeInTheDocument();
  });

  it('500 : garde le message d’erreur', async () => {
    appel.mockRejectedValue(erreurHttp(500));
    monter(chemin, ecran);
    expect(await screen.findByText(messageGenerique)).toBeInTheDocument();
  });
});
