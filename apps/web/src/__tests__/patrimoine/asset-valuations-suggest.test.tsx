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

function monter(onCompleteInfo = vi.fn(), asset: Record<string, unknown> = ACTIF, canWrite?: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter>
          <AssetValuationsTab
            tenantId="agence-1"
            asset={asset as never}
            onCompleteInfo={onCompleteInfo}
            canWrite={canWrite}
          />
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
    expect(screen.getByText('5 ans')).toBeInTheDocument();
    // Le libellé porte déjà « (%) » : la valeur s'affiche sans second « % ».
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.queryByText('10 %')).not.toBeInTheDocument();
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

async function calculer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Calculer une valeur/ }));
}

describe('suggestion refusée pour une raison métier', () => {
  it.each([
    [
      'ZERO_VALUE',
      'Cette classe donne une valeur nulle avec les informations actuelles : saisissez la valeur manuellement.'
    ],
    ['OUT_OF_RANGE', "Le calcul donne un montant hors limites : vérifiez les informations de l'actif."],
    [
      'ACQUISITION_DATE_IN_FUTURE',
      "La date d'acquisition est postérieure à la date de calcul : corrigez-la dans les informations de l'actif."
    ]
  ])('%s : message dédié, jamais « Il manque des informations »', async (reason, texte) => {
    const user = userEvent.setup();
    suggestAssetValuation.mockResolvedValue({ ok: false, missing: [], reason });
    monter();

    await calculer(user);

    expect(await screen.findByText(texte)).toBeInTheDocument();
    expect(screen.queryByText(/Il manque des informations/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer cette valeur' })).not.toBeInTheDocument();
  });

  it('une date d’acquisition future renvoie vers l’édition de l’actif', async () => {
    const user = userEvent.setup();
    suggestAssetValuation.mockResolvedValue({ ok: false, missing: [], reason: 'ACQUISITION_DATE_IN_FUTURE' });
    const onCompleteInfo = monter();

    await calculer(user);
    await user.click(await screen.findByRole('button', { name: "Compléter les informations de l'actif" }));

    expect(onCompleteInfo).toHaveBeenCalled();
  });

  it('ne propose jamais d’enregistrer un montant nul ou négatif', async () => {
    const user = userEvent.setup();
    suggestAssetValuation.mockResolvedValue({
      ok: true,
      amount: 0,
      currency: 'XOF',
      method: 'UNIT_VALUE',
      assumptions: []
    });
    monter();

    await calculer(user);

    expect(await screen.findByText(/Valeur calculée/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer cette valeur' })).not.toBeInTheDocument();
  });
});

describe('« Modifier » une suggestion', () => {
  const SUGGESTION = {
    ok: true,
    amount: 3_500_000,
    currency: 'XOF',
    method: 'DEPRECIATION_LINEAR',
    assumptions: []
  };

  async function ouvrirFormulaire(user: ReturnType<typeof userEvent.setup>) {
    suggestAssetValuation.mockResolvedValue(SUGGESTION);
    monter();
    await calculer(user);
    const panneau = (await screen.findByText(/Valeur calculée/)).closest('.ant-alert') as HTMLElement;
    await user.click(within(panneau).getByRole('button', { name: 'Modifier' }));
    return screen.findByRole('dialog');
  }

  it('garde la méthode calculée si le montant est inchangé', async () => {
    const user = userEvent.setup();
    const dialogue = await ouvrirFormulaire(user);

    expect(within(dialogue).queryByText(/Montant modifié/)).not.toBeInTheDocument();
    await user.click(within(dialogue).getByRole('button', { name: 'Ajouter' }));

    await waitFor(() =>
      expect(createAssetValuation).toHaveBeenCalledWith(
        'agence-1',
        'a1',
        expect.objectContaining({ estimatedValue: 3_500_000, method: 'DEPRECIATION_LINEAR' })
      )
    );
  });

  it('repasse en saisie manuelle et le dit quand le montant change', async () => {
    const user = userEvent.setup();
    const dialogue = await ouvrirFormulaire(user);

    const montant = within(dialogue).getByLabelText('Valeur estimée');
    await user.clear(montant);
    await user.type(montant, '3000000');

    expect(
      await within(dialogue).findByText('Montant modifié : la valeur sera enregistrée comme saisie manuelle.')
    ).toBeInTheDocument();
    await user.click(within(dialogue).getByRole('button', { name: 'Ajouter' }));

    await waitFor(() =>
      expect(createAssetValuation).toHaveBeenCalledWith(
        'agence-1',
        'a1',
        expect.objectContaining({ estimatedValue: 3_000_000, method: 'MANUAL' })
      )
    );
  });
});

describe('expertise et source', () => {
  it('exige une source pour une expertise et affiche l’erreur serveur sur ce champ', async () => {
    const user = userEvent.setup();
    createAssetValuation.mockRejectedValueOnce({
      response: { data: { errors: [{ path: 'source', message: 'Source refusée par le serveur' }] } }
    });
    monter();

    await user.click(await screen.findByRole('button', { name: /Ajouter une valeur/ }));
    const dialogue = await screen.findByRole('dialog');
    await user.type(within(dialogue).getByLabelText('Valeur estimée'), '5000000');
    await user.click(within(dialogue).getByLabelText('Méthode'));
    await user.click(await screen.findByTitle('Expertise'));
    await user.click(within(dialogue).getByRole('button', { name: 'Ajouter' }));

    expect(
      await screen.findByText("Indiquez l'expert ou le document (source) pour une expertise.")
    ).toBeInTheDocument();
    expect(createAssetValuation).not.toHaveBeenCalled();

    await user.type(within(dialogue).getByLabelText('Source'), 'Cabinet Kouassi');
    await user.click(within(dialogue).getByRole('button', { name: 'Ajouter' }));

    expect(await screen.findByText('Source refusée par le serveur')).toBeInTheDocument();
    expect(createAssetValuation).toHaveBeenCalledWith(
      'agence-1',
      'a1',
      expect.objectContaining({ method: 'EXPERT_APPRAISAL', source: 'Cabinet Kouassi' })
    );
  });
});

describe('utilisateur en lecture seule', () => {
  it('garde « Calculer une valeur » mais retire les boutons d’écriture', async () => {
    const user = userEvent.setup();
    suggestAssetValuation.mockResolvedValue({
      ok: true,
      amount: 3_500_000,
      currency: 'XOF',
      method: 'DEPRECIATION_LINEAR',
      assumptions: []
    });
    monter(vi.fn(), ACTIF, false);

    await calculer(user);

    expect(await screen.findByText(/Valeur calculée/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer cette valeur' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter une valeur/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Supprimer')).not.toBeInTheDocument();
  });

  it('retire les boutons d’écriture après un refus 403 du serveur', async () => {
    const user = userEvent.setup();
    suggestAssetValuation.mockResolvedValue({
      ok: true,
      amount: 3_500_000,
      currency: 'XOF',
      method: 'DEPRECIATION_LINEAR',
      assumptions: []
    });
    createAssetValuation.mockRejectedValueOnce({ response: { status: 403, data: {} } });
    monter();

    await calculer(user);
    await user.click(await screen.findByRole('button', { name: 'Enregistrer cette valeur' }));
    const confirmation = await screen.findByText(/Enregistrer cette valeur de/);
    await user.click(
      within(confirmation.closest('.ant-popover') as HTMLElement).getByRole('button', { name: 'Enregistrer' })
    );

    await waitFor(() => expect(screen.queryByRole('button', { name: /Ajouter une valeur/ })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Enregistrer cette valeur' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculer une valeur/ })).toBeInTheDocument();
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
