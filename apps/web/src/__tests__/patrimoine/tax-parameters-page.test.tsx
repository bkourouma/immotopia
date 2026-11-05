import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function monter(initial = '/tenant/agence-1/patrimoine/tax-parameters') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
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

const LIBELLE_FONCIER = 'Impôt sur le patrimoine foncier bâti loué, personne physique';
const LIBELLE_REVENUS = 'Taux de l’impôt sur les revenus fonciers';
const T = { timeout: 8000 };

function avecRevenus() {
  const data = parametersData() as { parameters: Array<Record<string, unknown>> } & Record<string, unknown>;
  data.parameters = [
    ...data.parameters,
    {
      id: 'param-3',
      taxKind: 'RENTAL_INCOME_TAX',
      key: 'rate',
      propertyKind: 'ANY',
      occupancy: 'ANY',
      ownerKind: 'ANY',
      bracketIndex: 0,
      lowerBound: null,
      upperBound: null,
      value: 4,
      valueText: null,
      unit: 'PERCENT',
      label: LIBELLE_REVENUS,
      source: 'CGI CI 2026, art. 100',
      sourceUrl: null,
      status: 'VALIDE',
      notes: null
    }
  ];
  return data;
}

describe('<TaxParametersPage> — recherche', () => {
  it('filtre le tableau en local sur le libellé, sans rappeler l’API', async () => {
    const user = userEvent.setup();
    getTaxParameters.mockResolvedValue(avecRevenus());
    monter();

    await screen.findByText(LIBELLE_REVENUS, undefined, T);
    await user.type(within(screen.getByRole('search')).getByPlaceholderText(/Impôt, clé/), 'revenus fonciers');

    await waitFor(() => expect(screen.queryByText(LIBELLE_FONCIER)).not.toBeInTheDocument(), T);
    expect(screen.getByText(LIBELLE_REVENUS)).toBeInTheDocument();
    expect(getTaxParameters).toHaveBeenCalledTimes(1);
  });

  it('filtre par impôt depuis l’URL ; pays et année restent des sélecteurs de jeu de paramètres', async () => {
    getTaxParameters.mockResolvedValue(avecRevenus());
    monter('/tenant/agence-1/patrimoine/tax-parameters?impot=RENTAL_INCOME_TAX');

    expect(await screen.findByText(LIBELLE_REVENUS, undefined, T)).toBeInTheDocument();
    expect(screen.queryByText(LIBELLE_FONCIER)).not.toBeInTheDocument();
    expect(getTaxParameters).toHaveBeenCalledWith('agence-1', { country: 'CI', year: undefined });
    expect(screen.getByLabelText('Année')).toBeInTheDocument();
  });
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
