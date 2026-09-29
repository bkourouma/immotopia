import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetValuationsTab } from '../../components/patrimoine/actifs/AssetValuationsTab';
import { ReliabilityBadge } from '../../components/patrimoine/actifs/ReliabilityBadge';

/**
 * Onglet « Valeurs » (lot 2) : suggestion de valeur sans écriture automatique,
 * champs manquants, fiabilité de chaque valeur et raisons en infobulle.
 */

const listAssetValuations = vi.fn();
const createAssetValuation = vi.fn();
const suggestAssetValuation = vi.fn();

vi.mock('../../services/patrimoine-assets-service', () => ({
  listAssetValuations: (...a: unknown[]) => listAssetValuations(...a),
  createAssetValuation: (...a: unknown[]) => createAssetValuation(...a),
  suggestAssetValuation: (...a: unknown[]) => suggestAssetValuation(...a),
  updateAssetValuation: vi.fn(),
  deleteAssetValuation: vi.fn()
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const ACTIF = {
  id: 'a1',
  name: 'Toyota Hilux',
  assetClass: 'VEHICLE_EQUIPMENT',
  currency: 'XOF'
};

function valeur(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    assetId: 'a1',
    valuatedAt: '2026-06-01T00:00:00.000Z',
    estimatedValue: 6_000_000,
    currency: 'XOF',
    method: 'EXPERT_APPRAISAL',
    source: null,
    notes: null,
    reliability: 'HIGH',
    reliabilityReasons: ['METHOD_EXPERT'],
    ...overrides
  };
}

function monter(onCompleteInfo = vi.fn(), asset: Record<string, unknown> = ACTIF) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter>
          <AssetValuationsTab tenantId="agence-1" asset={asset as never} onCompleteInfo={onCompleteInfo} />
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
  return onCompleteInfo;
}

beforeEach(() => {
  vi.clearAllMocks();
  listAssetValuations.mockResolvedValue([valeur()]);
  createAssetValuation.mockResolvedValue(valeur({ id: 'v2' }));
});

describe('suggestion de valeur', () => {
  const SUGGESTION = {
    ok: true,
    amount: 3_500_000,
    currency: 'XOF',
    method: 'DEPRECIATION_LINEAR',
    assumptions: [
      { key: 'usefulLifeYears', value: 5 },
      { key: 'residualValuePercent', value: 10 },
      { key: 'cléInconnue', value: 'x' }
    ]
  };

  it('affiche valeur, méthode et hypothèses sans rien enregistrer', async () => {
    const user = userEvent.setup();
    suggestAssetValuation.mockResolvedValue(SUGGESTION);
    monter();

    await user.click(await screen.findByRole('button', { name: /Calculer une valeur/ }));

    expect(await screen.findByText(/Valeur calculée/)).toBeInTheDocument();
    expect(screen.getByText('Amortissement linéaire')).toBeInTheDocument();
    expect(screen.getByText("Durée d'utilité")).toBeInTheDocument();
    expect(screen.getByText('Valeur résiduelle (%)')).toBeInTheDocument();
    expect(screen.getByText('10 %')).toBeInTheDocument();
    expect(screen.getByText('cléInconnue')).toBeInTheDocument();
    expect(suggestAssetValuation).toHaveBeenCalledWith('agence-1', 'a1');
    expect(createAssetValuation).not.toHaveBeenCalled();
  });

  it('n’enregistre qu’après clic sur « Enregistrer cette valeur » puis confirmation', async () => {
    const user = userEvent.setup();
    suggestAssetValuation.mockResolvedValue(SUGGESTION);
    monter();

    await user.click(await screen.findByRole('button', { name: /Calculer une valeur/ }));
    await user.click(await screen.findByRole('button', { name: 'Enregistrer cette valeur' }));
    expect(createAssetValuation).not.toHaveBeenCalled();

    const confirmation = await screen.findByText(/Enregistrer cette valeur de/);
    await user.click(
      within(confirmation.closest('.ant-popover') as HTMLElement).getByRole('button', { name: 'Enregistrer' })
    );

    await waitFor(() =>
      expect(createAssetValuation).toHaveBeenCalledWith('agence-1', 'a1', {
        valuatedAt: new Date().toISOString().slice(0, 10),
        estimatedValue: 3_500_000,
        currency: 'XOF',
        method: 'DEPRECIATION_LINEAR'
      })
    );
  });

  it('« Modifier » préremplit le formulaire sans enregistrer', async () => {
    const user = userEvent.setup();
    suggestAssetValuation.mockResolvedValue(SUGGESTION);
    monter();

    await user.click(await screen.findByRole('button', { name: /Calculer une valeur/ }));
    const panneau = (await screen.findByText(/Valeur calculée/)).closest('.ant-alert') as HTMLElement;
    await user.click(within(panneau).getByRole('button', { name: 'Modifier' }));

    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByLabelText('Valeur estimée')).toHaveValue('3500000');
    expect(createAssetValuation).not.toHaveBeenCalled();
  });

  it('liste les champs manquants et renvoie vers l’édition de l’actif', async () => {
    const user = userEvent.setup();
    suggestAssetValuation.mockResolvedValue({ ok: false, missing: ['usefulLifeYears', 'companyValue'] });
    const onCompleteInfo = monter();

    await user.click(await screen.findByRole('button', { name: /Calculer une valeur/ }));

    expect(await screen.findByText("Durée d'utilité")).toBeInTheDocument();
    expect(screen.getByText("Valeur de l'entreprise")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Compléter les informations de l'actif" }));
    expect(onCompleteInfo).toHaveBeenCalled();
    expect(createAssetValuation).not.toHaveBeenCalled();
  });

  it('explique qu’une classe sans méthode calculable se valorise à la main', async () => {
    const user = userEvent.setup();
    suggestAssetValuation.mockResolvedValue({ ok: false, missing: [] });
    monter();

    await user.click(await screen.findByRole('button', { name: /Calculer une valeur/ }));

    expect(await screen.findByText('Cette classe se valorise par saisie manuelle ou expertise.')).toBeInTheDocument();
  });
});

describe('fiabilité des valeurs', () => {
  it('affiche le niveau en toutes lettres pour chaque valeur, null se lisant « Faible »', async () => {
    listAssetValuations.mockResolvedValue([
      valeur(),
      valeur({ id: 'v2', reliability: 'MEDIUM', reliabilityReasons: ['METHOD_COMPUTED'] }),
      valeur({ id: 'v3', reliability: null, reliabilityReasons: [] })
    ]);
    monter();

    expect(await screen.findByText('Élevée')).toBeInTheDocument();
    expect(screen.getByText('Moyenne')).toBeInTheDocument();
    expect(screen.getByText('Faible')).toBeInTheDocument();
  });

  it('donne les raisons en infobulle', async () => {
    const user = userEvent.setup();
    render(
      <ReliabilityBadge
        reliability="LOW"
        reasons={['METHOD_MANUAL_NO_SOURCE', 'STALE_ONE_LEVEL', 'LEGAL_STATUS_FRAGILE']}
      />
    );

    await user.hover(screen.getByText('Faible'));

    expect(await screen.findByText('Saisie manuelle, sans source')).toBeInTheDocument();
    expect(screen.getByText('Valeur ancienne')).toBeInTheDocument();
    expect(screen.getByText('Statut juridique fragile')).toBeInTheDocument();
  });
});
