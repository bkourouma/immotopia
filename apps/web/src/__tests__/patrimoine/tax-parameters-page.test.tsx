import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaxParametersPage } from '../../pages/patrimoine/tax/TaxParametersPage';

/**
 * `<TaxParametersPage>` — pays, année, source (lien https uniquement),
 * statut.
 */

const getTaxParameters = vi.fn();

vi.mock('../../services/patrimoine-entities-service', () => ({
  getTaxParameters: (...a: unknown[]) => getTaxParameters(...a)
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function parametersData(overrides: Record<string, unknown> = {}) {
  return {
    countries: [
      { country: 'CI', years: [2026] },
      { country: 'ML', years: [2026] }
    ],
    country: 'CI',
    requestedYear: null,
    parametersYear: 2026,
    fallback: false,
    parameters: [
      {
        id: 'param-1',
        taxKind: 'PROPERTY_TAX',
        key: 'rate',
        propertyKind: 'BUILT',
        occupancy: 'RENTED',
        ownerKind: 'INDIVIDUAL',
        bracketIndex: 0,
        lowerBound: null,
        upperBound: null,
        value: 9,
        valueText: null,
        unit: 'PERCENT',
        label: 'Impôt sur le patrimoine foncier bâti loué, personne physique',
        source: 'CGI CI 2026, art. 158 al. 1',
        sourceUrl: 'https://dgi.cgici.com/indexs.htm',
        status: 'A_VALIDER',
        notes: null
      },
      {
        id: 'param-2',
        taxKind: 'PROPERTY_TAX',
        key: 'base',
        propertyKind: 'UNBUILT',
        occupancy: 'ANY',
        ownerKind: 'ANY',
        bracketIndex: 0,
        lowerBound: null,
        upperBound: null,
        value: null,
        valueText: 'MARKET_VALUE',
        unit: 'CODE',
        label: 'Base : valeur marchande du terrain au 1er janvier',
        source: 'CGI CI 2026, art. 161',
        sourceUrl: 'javascript:alert(1)',
        status: 'VALIDE',
        notes: null
      }
    ],
    ...overrides
  };
}

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/patrimoine/tax-parameters']}>
          <Routes>
            <Route path="/tenant/:tenantId/patrimoine/tax-parameters" element={<TaxParametersPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getTaxParameters.mockResolvedValue(parametersData());
});

describe('<TaxParametersPage>', () => {
  it('demande les paramètres pour le pays et l’année par défaut', async () => {
    monter();

    await screen.findByText('Impôt sur le patrimoine foncier bâti loué, personne physique');
    expect(getTaxParameters).toHaveBeenCalledWith('agence-1', { country: 'CI', year: undefined });
  });

  it('affiche le statut de chaque paramètre', async () => {
    monter();

    await screen.findByText('Impôt sur le patrimoine foncier bâti loué, personne physique');
    expect(screen.getByText('À valider')).toBeInTheDocument();
    expect(screen.getByText('Validé')).toBeInTheDocument();
  });

  it('affiche un lien uniquement pour une source en https', async () => {
    monter();

    await screen.findByText('Impôt sur le patrimoine foncier bâti loué, personne physique');
    const links = screen.getAllByRole('link', { name: 'Voir la source' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://dgi.cgici.com/indexs.htm');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
