import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropertyHoldingTaxSection } from '../../components/patrimoine/entities/PropertyHoldingTaxSection';

/**
 * `<PropertyHoldingTaxSection>` — détenteurs et quotes-parts d'un bien (somme
 * bloquée côté client au-delà de 100 %, contenu du PUT) et message 400 du
 * serveur affiché.
 */

const getPropertyHoldings = vi.fn();
const setPropertyHoldings = vi.fn();
const getPropertyTaxProfile = vi.fn();
const setPropertyTaxProfile = vi.fn();
const getPropertyTaxEstimate = vi.fn();

vi.mock('../../services/patrimoine-entities-service', () => ({
  getPropertyHoldings: (...a: unknown[]) => getPropertyHoldings(...a),
  setPropertyHoldings: (...a: unknown[]) => setPropertyHoldings(...a),
  getPropertyTaxProfile: (...a: unknown[]) => getPropertyTaxProfile(...a),
  setPropertyTaxProfile: (...a: unknown[]) => setPropertyTaxProfile(...a),
  getPropertyTaxEstimate: (...a: unknown[]) => getPropertyTaxEstimate(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function holdingsData(overrides: Record<string, unknown> = {}) {
  return {
    propertyId: 'property-1',
    totalSharePercent: 60,
    unassignedSharePercent: 40,
    holdings: [
      {
        id: 'holding-1',
        entityId: 'entity-1',
        entityName: 'SCI Les Palmiers',
        legalForm: 'SCI',
        country: 'CI',
        sharePercent: 60,
        effectiveFrom: null,
        notes: null
      }
    ],
    entities: [
      { id: 'entity-1', name: 'SCI Les Palmiers', legalForm: 'SCI', country: 'CI' },
      { id: 'entity-2', name: 'Holding B', legalForm: 'HOLDING', country: 'CI' }
    ],
    ...overrides
  };
}

function profileData() {
  return {
    propertyId: 'property-1',
    profile: null,
    derived: {
      builtStatus: 'BUILT' as const,
      occupancy: 'RENTED' as const,
      annualRent: 1_200_000,
      marketValue: null,
      country: 'CI' as const,
      countrySource: 'AGENCY' as const
    }
  };
}

function estimateData() {
  return {
    propertyId: 'property-1',
    fiscalYear: 2026,
    country: 'CI' as const,
    countrySource: 'AGENCY' as const,
    parametersYear: 2026,
    parametersFallback: false,
    allParametersValidated: false,
    inputs: {
      propertyKind: 'BUILT' as const,
      occupancy: 'RENTED' as const,
      annualRent: 1_200_000,
      declaredRentalValue: null,
      marketValue: null,
      exemptUntilYear: null
    },
    holders: [],
    totalShare: 60
  };
}

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <PropertyHoldingTaxSection tenantId="agence-1" propertyId="property-1" />
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getPropertyHoldings.mockResolvedValue(holdingsData());
  getPropertyTaxProfile.mockResolvedValue(profileData());
  getPropertyTaxEstimate.mockResolvedValue(estimateData());
});

describe('<PropertyHoldingTaxSection> — détenteurs', () => {
  it('bloque côté client une somme de quotes-parts supérieure à 100', async () => {
    const user = userEvent.setup();
    monter();

    await screen.findByText('Détenteurs et quotes-parts');
    await user.click(screen.getByRole('button', { name: 'Ajouter un détenteur' }));

    const shareInputs = screen.getAllByLabelText('Quote-part');
    await user.clear(shareInputs[1]);
    await user.type(shareInputs[1], '50');

    await user.click(screen.getByRole('button', { name: 'Enregistrer les détenteurs' }));

    expect(
      await screen.findByText('La somme des quotes-parts dépasse 100 % (actuellement 110 %).')
    ).toBeInTheDocument();
    expect(setPropertyHoldings).not.toHaveBeenCalled();
  });

  it('envoie le contenu attendu au PUT', async () => {
    setPropertyHoldings.mockResolvedValue(holdingsData());
    monter();

    await screen.findByText('Détenteurs et quotes-parts');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enregistrer les détenteurs' }));

    await waitFor(() =>
      expect(setPropertyHoldings).toHaveBeenCalledWith('agence-1', 'property-1', {
        holdings: [{ entityId: 'entity-1', sharePercent: 60 }]
      })
    );
  });

  it('affiche le message 400 renvoyé par le serveur', async () => {
    setPropertyHoldings.mockRejectedValue({
      response: { status: 400, data: { message: 'La somme des quotes-parts dépasse 100 % (actuellement 120 %).' } }
    });
    monter();

    await screen.findByText('Détenteurs et quotes-parts');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enregistrer les détenteurs' }));

    expect(
      await screen.findByText('La somme des quotes-parts dépasse 100 % (actuellement 120 %).')
    ).toBeInTheDocument();
  });
});
