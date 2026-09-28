import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HoldingEntityDetailPage } from '../../pages/patrimoine/entities/HoldingEntityDetailPage';

/**
 * `<HoldingEntityDetailPage>` — quotes-parts, consolidation, sélecteur
 * d'année (avec bandeau de repli), avertissement d'estimation indicative et
 * étiquette « À valider ».
 */

const getHoldingEntity = vi.fn();
const getEntityConsolidation = vi.fn();
const getEntityTaxEstimate = vi.fn();
const addEntityHolding = vi.fn();
const updateEntityHolding = vi.fn();
const removeEntityHolding = vi.fn();
const updateHoldingEntity = vi.fn();

vi.mock('../../services/patrimoine-entities-service', () => ({
  getHoldingEntity: (...a: unknown[]) => getHoldingEntity(...a),
  getEntityConsolidation: (...a: unknown[]) => getEntityConsolidation(...a),
  getEntityTaxEstimate: (...a: unknown[]) => getEntityTaxEstimate(...a),
  addEntityHolding: (...a: unknown[]) => addEntityHolding(...a),
  updateEntityHolding: (...a: unknown[]) => updateEntityHolding(...a),
  removeEntityHolding: (...a: unknown[]) => removeEntityHolding(...a),
  updateHoldingEntity: (...a: unknown[]) => updateHoldingEntity(...a)
}));

vi.mock('../../services/crm-service', () => ({
  listContacts: vi.fn().mockResolvedValue({ contacts: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } })
}));

vi.mock('../../services/property-service', () => ({
  listProperties: vi
    .fn()
    .mockResolvedValue({ properties: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } })
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function entityDetail() {
  return {
    id: 'entity-1',
    name: 'SCI Les Palmiers',
    legalForm: 'SCI',
    country: 'CI',
    rccm: null,
    taxId: null,
    isActive: true,
    parentEntity: null,
    contact: null,
    propertiesCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    notes: null,
    fiscalOwnerKind: null,
    effectiveOwnerKind: 'INDIVIDUAL',
    children: [],
    holdings: [
      {
        id: 'holding-1',
        propertyId: 'property-1',
        sharePercent: 60,
        effectiveFrom: null,
        notes: null,
        property: {
          id: 'property-1',
          title: 'Villa Angré',
          internalReference: 'BIEN-0001',
          propertyType: 'HOUSE',
          status: 'AVAILABLE'
        },
        propertyTotalSharePercent: 60
      }
    ]
  };
}

function consolidation() {
  return {
    entityId: 'entity-1',
    asOf: '2026-09-28',
    currency: 'XOF' as const,
    totals: {
      propertiesCount: 1,
      estimatedValue: 50_000_000,
      outstandingDebt: 10_000_000,
      netEquity: 40_000_000,
      annualRent: 3_600_000,
      annualExpenses: 500_000,
      annualLoanPayments: 800_000,
      annualCashFlow: 2_300_000,
      grossYield: 0.072,
      netYield: 0.062,
      netNetYield: null,
      latentCapitalGain: null,
      costBasisIncomplete: true
    },
    properties: [
      {
        propertyId: 'property-1',
        title: 'Villa Angré',
        internalReference: 'BIEN-0001',
        sharePercent: 60,
        pending: false,
        estimatedValue: 50_000_000,
        outstandingDebt: 10_000_000,
        annualRent: 3_600_000,
        annualExpenses: 500_000,
        annualLoanPayments: 800_000,
        annualCashFlow: 2_300_000,
        grossYield: 0.072,
        netYield: 0.062
      }
    ]
  };
}

function taxComputation() {
  return {
    taxKind: 'PROPERTY_TAX' as const,
    applicable: true,
    reason: null,
    parametersYear: 2026,
    parametersFallback: false,
    baseKind: 'RENTAL_VALUE' as const,
    amountFull: 108_000,
    lines: [
      {
        code: 'PRINCIPAL' as const,
        label: 'Impôt sur le patrimoine foncier bâti loué',
        base: 1_200_000,
        rate: 9,
        amount: 108_000,
        parameterId: 'param-1',
        parameterKey: 'rate',
        source: 'CGI CI 2026',
        status: 'A_VALIDER' as const
      }
    ],
    warnings: [],
    allParametersValidated: false
  };
}

function taxEstimate(overrides: Record<string, unknown> = {}) {
  return {
    entityId: 'entity-1',
    fiscalYear: 2026,
    ownerKind: 'INDIVIDUAL' as const,
    parameters: [{ country: 'CI' as const, parametersYear: 2026, fallback: false }],
    allParametersValidated: false,
    totals: { PROPERTY_TAX: 108_000, RENTAL_INCOME_TAX: 36_000, total: 144_000 },
    properties: [
      {
        propertyId: 'property-1',
        title: 'Villa Angré',
        internalReference: 'BIEN-0001',
        sharePercent: 60,
        partialYear: false,
        country: 'CI' as const,
        parametersYear: 2026,
        taxes: [taxComputation()],
        amountShareByKind: { PROPERTY_TAX: 64_800, RENTAL_INCOME_TAX: 21_600 },
        totalShare: 86_400
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
        <MemoryRouter initialEntries={['/tenant/agence-1/patrimoine/entities/entity-1']}>
          <Routes>
            <Route path="/tenant/:tenantId/patrimoine/entities/:entityId" element={<HoldingEntityDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getHoldingEntity.mockResolvedValue(entityDetail());
  getEntityConsolidation.mockResolvedValue(consolidation());
  getEntityTaxEstimate.mockResolvedValue(taxEstimate());
});

describe('<HoldingEntityDetailPage> — quotes-parts et consolidation', () => {
  it('affiche le bien rattaché avec sa quote-part', async () => {
    monter();

    expect((await screen.findAllByText('Villa Angré')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('60 %').length).toBeGreaterThan(0);
  });

  it('affiche la consolidation, avec l’avertissement de coût de revient incomplet', async () => {
    monter();

    expect(await screen.findByText('Coût de revient incomplet')).toBeInTheDocument();
  });
});

describe('<HoldingEntityDetailPage> — estimation fiscale', () => {
  it('affiche l’avertissement d’estimation indicative', async () => {
    monter();

    expect(await screen.findByText('Estimation indicative, à valider par un conseil fiscal.')).toBeInTheDocument();
  });

  it('affiche l’étiquette « À valider » sur une ligne dont le paramètre n’est pas validé', async () => {
    monter();

    await screen.findAllByText('Villa Angré');
    expect(await screen.findAllByText('À valider')).not.toHaveLength(0);
  });

  it('appelle l’estimation avec year=2027 après changement d’année', async () => {
    const user = userEvent.setup();
    monter();

    await screen.findAllByText('Villa Angré');
    await waitFor(() => expect(getEntityTaxEstimate).toHaveBeenCalledWith('agence-1', 'entity-1', 2026));

    const yearSelect = screen.getByLabelText('Année fiscale');
    await user.click(yearSelect);
    const option2027 = await screen.findByTitle('2027');
    await user.click(option2027);

    await waitFor(() => expect(getEntityTaxEstimate).toHaveBeenCalledWith('agence-1', 'entity-1', 2027));
  });

  it('affiche le bandeau de repli quand les paramètres viennent d’une année antérieure', async () => {
    getEntityTaxEstimate.mockResolvedValue(
      taxEstimate({ parameters: [{ country: 'CI', parametersYear: 2026, fallback: true }] })
    );
    monter();

    expect(
      await screen.findByText(/Aucun paramètre fiscal .* pour 2026 : utilisation des derniers paramètres disponibles\./)
    ).toBeInTheDocument();
  });
});
