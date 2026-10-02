import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Patrimoine from '../../pages/OwnerPortal/Patrimoine';
import type { PatrimoineOverview } from '../../services/owner-portal-patrimoine-service';

/**
 * « Mon patrimoine » — portail propriétaire, lot P5.
 *
 * Modèle de `__tests__/owner-portal/account.test.tsx` : le mock du service
 * couvre le seul export que l'écran utilise (`getPatrimoine`). Une rubrique
 * absente de la réponse (clé manquante, pas `null`/`false`, contrat
 * `p5-contrat-api.md`) ne doit faire apparaître ni carte ni colonne.
 */

const getPatrimoine = vi.fn();

vi.mock('../../services/owner-portal-patrimoine-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/owner-portal-patrimoine-service')>(
    '../../services/owner-portal-patrimoine-service'
  );
  return {
    ...actual,
    ownerPortalPatrimoineService: {
      ...actual.ownerPortalPatrimoineService,
      getPatrimoine: (...a: unknown[]) => getPatrimoine(...a)
    }
  };
});

function overview(overrides: Partial<PatrimoineOverview> = {}): PatrimoineOverview {
  return {
    sections: { valuation: true, yield: true, loans: true, works: true, documents: true },
    summary: {
      propertyCount: 1,
      currency: 'XOF',
      totalEstimatedValue: 45_000_000,
      totalLatentCapitalGain: 5_000_000,
      totalRemainingLoanCapital: 12_000_000
    },
    properties: [
      {
        id: 'prop-1',
        title: 'Villa Cocody',
        address: 'Rue des Jardins',
        city: 'Abidjan',
        ownerSharePercent: null,
        valuation: {
          estimatedValue: 45_000_000,
          valuatedAt: '2026-01-10',
          acquisitionCost: 40_000_000,
          currency: 'XOF'
        },
        latentCapitalGain: 5_000_000,
        yield: { grossYield: 6.5, netYield: 5.1, netNetYield: 4.2, annualRent: 3_000_000, annualExpenses: 500_000 },
        loanSummary: { count: 1, remainingCapital: 12_000_000 }
      }
    ],
    ...overrides
  };
}

function mount() {
  return render(
    <MemoryRouter>
      <Patrimoine />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Mon patrimoine — synthèse et biens', () => {
  it('affiche la synthèse et le bien avec toutes les rubriques', async () => {
    getPatrimoine.mockResolvedValue(overview());

    mount();

    expect(await screen.findByText('Villa Cocody', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Nombre de biens')).toBeInTheDocument();
    expect(screen.getAllByText(/45\s000\s000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/12\s000\s000/).length).toBeGreaterThan(0);
  });

  // Recette du 29/09/2026 : la devise s'affichait « XOF » (code ISO renvoyé par
  // l'API, recopié tel quel) là où le reste de l'application dit « FCFA ».
  it('écrit la devise « FCFA » comme le formateur commun, jamais le code « XOF »', async () => {
    getPatrimoine.mockResolvedValue(overview());

    const { container } = mount();

    expect(await screen.findByText('Villa Cocody', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getAllByText(/45\s000\s000\sFCFA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/12\s000\s000\sFCFA/).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/XOF/);
  });

  it('conserve une devise autre que le franc CFA', async () => {
    getPatrimoine.mockResolvedValue(
      overview({
        summary: {
          propertyCount: 1,
          currency: 'EUR',
          totalEstimatedValue: 45_000_000,
          totalLatentCapitalGain: 5_000_000,
          totalRemainingLoanCapital: 12_000_000
        }
      })
    );

    mount();

    expect(await screen.findByText('Villa Cocody', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getAllByText(/45\s000\s000\sEUR/).length).toBeGreaterThan(0);
  });

  it('ne rend pas les colonnes d’une rubrique absente de la réponse', async () => {
    const sansEmprunts = overview({
      sections: { valuation: true, yield: true, loans: false, works: true, documents: true },
      summary: {
        propertyCount: 1,
        currency: 'XOF',
        totalEstimatedValue: 45_000_000,
        totalLatentCapitalGain: 5_000_000
      },
      properties: [
        {
          id: 'prop-1',
          title: 'Villa Cocody',
          address: 'Rue des Jardins',
          city: 'Abidjan',
          ownerSharePercent: null,
          valuation: {
            estimatedValue: 45_000_000,
            valuatedAt: '2026-01-10',
            acquisitionCost: 40_000_000,
            currency: 'XOF'
          },
          latentCapitalGain: 5_000_000,
          yield: { grossYield: 6.5, netYield: 5.1, annualRent: 3_000_000, annualExpenses: 500_000 }
        }
      ]
    });
    getPatrimoine.mockResolvedValue(sansEmprunts);

    mount();

    expect(await screen.findByText('Villa Cocody', {}, { timeout: 8000 })).toBeInTheDocument();
    // Rubrique « emprunts » absente : ni la carte de synthèse, ni la colonne
    // « Capital restant dû », ni le rendement net-net (révélerait les mensualités).
    expect(screen.queryByText('Capital restant dû')).not.toBeInTheDocument();
    expect(screen.queryByText('Rendement net-net')).not.toBeInTheDocument();
  });

  it('affiche un message dédié quand la vue est masquée (404)', async () => {
    getPatrimoine.mockRejectedValue({ response: { status: 404 } });

    mount();

    expect(await screen.findByText("Cette vue n'est pas disponible.", {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
