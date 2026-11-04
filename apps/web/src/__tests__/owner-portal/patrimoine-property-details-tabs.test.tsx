import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import PatrimoinePropertyDetails from '../../pages/OwnerPortal/PatrimoinePropertyDetails';
import type { PatrimoinePropertyDetails as Details } from '../../services/owner-portal-patrimoine-service';

/**
 * Détail d'un bien patrimonial : valorisations, emprunts, travaux et documents
 * sont des onglets (`?tab=`), la synthèse reste visible au-dessus.
 */

const getPropertyDetails = vi.fn();
const downloadDocument = vi.fn();

vi.mock('../../services/owner-portal-patrimoine-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/owner-portal-patrimoine-service')>(
    '../../services/owner-portal-patrimoine-service'
  );
  return {
    ...actual,
    ownerPortalPatrimoineService: {
      ...actual.ownerPortalPatrimoineService,
      getPropertyDetails: (...a: unknown[]) => getPropertyDetails(...a),
      downloadDocument: (...a: unknown[]) => downloadDocument(...a)
    }
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

function details(): Details {
  return {
    sections: { valuation: true, yield: true, loans: true, works: true, documents: true },
    property: {
      id: 'prop-1',
      title: 'Villa Cocody',
      address: 'Rue des Jardins',
      city: 'Abidjan',
      ownerSharePercent: null
    },
    valuation: { estimatedValue: 45_000_000, valuatedAt: '2026-01-10', acquisitionCost: 40_000_000, currency: 'XOF' },
    valuations: [
      { id: 'val-1', valuatedAt: '2026-01-10', estimatedValue: 45_000_000, currency: 'XOF', method: 'MARKET' }
    ] as unknown as Details['valuations'],
    latentCapitalGain: 5_000_000,
    yield: { grossYield: 6.5, netYield: 5.1, netNetYield: 4.2, annualRent: 3_000_000, annualExpenses: 500_000 },
    loans: [
      {
        id: 'loan-1',
        lender: 'Banque Atlantique',
        capitalAmount: 20_000_000,
        remainingCapital: 12_000_000,
        interestRate: 6.5,
        monthlyPayment: 250_000,
        currency: 'XOF',
        startDate: '2023-01-01',
        endDate: null,
        status: 'ACTIVE'
      }
    ],
    works: [
      {
        id: 'work-1',
        title: 'Réfection toiture',
        status: 'PLANNED',
        plannedDate: '2026-03-01',
        completedDate: null,
        estimatedCost: 1_000_000,
        actualCost: null,
        currency: 'XOF'
      }
    ] as unknown as Details['works'],
    documents: []
  };
}

function Adresse() {
  const location = useLocation();
  return <span data-testid="adresse">{`${location.pathname}${location.search}`}</span>;
}

function mount(url = '/owner/patrimoine/prop-1') {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[url]}>
        <Adresse />
        <Routes>
          <Route path="/owner/patrimoine/:propertyId" element={<PatrimoinePropertyDetails />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

describe('Détail du patrimoine — onglets', () => {
  it('affiche les quatre onglets et garde la synthèse visible', async () => {
    getPropertyDetails.mockResolvedValue(details());
    mount();

    expect(await screen.findByText('Villa Cocody', {}, { timeout: 8000 })).toBeInTheDocument();
    for (const nom of ['Historique des valorisations', 'Emprunts', 'Travaux', 'Documents']) {
      expect(screen.getByRole('tab', { name: nom })).toBeInTheDocument();
    }
    expect(screen.getByText('Quote-part')).toBeInTheDocument();
    expect(screen.getByText('Rendement')).toBeInTheDocument();
  });

  it('ouvre par défaut le premier onglet non vide (valorisations)', async () => {
    getPropertyDetails.mockResolvedValue(details());
    mount();

    await screen.findByText('Villa Cocody', {}, { timeout: 8000 });
    expect(screen.getByRole('tab', { name: 'Historique des valorisations' })).toHaveAttribute('aria-selected', 'true');
  });

  it("?tab=travaux ouvre l'onglet travaux", async () => {
    getPropertyDetails.mockResolvedValue(details());
    mount('/owner/patrimoine/prop-1?tab=travaux');

    expect(await screen.findByText('Réfection toiture', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Travaux' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Banque Atlantique')).not.toBeInTheDocument();
  });

  it("un clic sur un onglet l'écrit dans l'adresse", async () => {
    getPropertyDetails.mockResolvedValue(details());
    mount();

    await screen.findByText('Villa Cocody', {}, { timeout: 8000 });
    fireEvent.click(screen.getByRole('tab', { name: 'Emprunts' }));

    expect(await screen.findByText('Banque Atlantique')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('adresse').textContent).toContain('tab=emprunts'));
  });
});
