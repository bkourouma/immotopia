import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantSubscriptionSettings } from '../../pages/tenant/TenantSubscriptionSettings';
import { getAssetUsage } from '../../services/personal-space-service';

/**
 * `/tenant/:tenantId/settings/abonnement` — abonnement vu par l'agence :
 * formule en consultation, consommation, demande d'extension (offres lues
 * dans le catalogue, vague 3). Les factures et le paiement en ligne vivent sur
 * `/settings/facturation` (tenant-billing-settings.test.tsx). Les services
 * sont mockés en entier (chaque export utilisé par la page).
 */

const getOwnEntitlements = vi.fn();
const useMenuEntryAccess = vi.fn();
const createExtensionRequest = vi.fn();
const listOwnExtensionRequests = vi.fn();
const listExtensionOffers = vi.fn();

// Droits de la personne dans l'agence (même source que le menu) : mockés, sans appel réseau.
vi.mock('../../hooks/useMenuAccess', () => ({
  useMenuEntryAccess: (...a: unknown[]) => useMenuEntryAccess(...a)
}));

vi.mock('../../services/subscription-v2-service', () => ({
  getOwnEntitlements: (...a: unknown[]) => getOwnEntitlements(...a)
}));

vi.mock('../../services/subscription-extras-service', () => ({
  createExtensionRequest: (...a: unknown[]) => createExtensionRequest(...a),
  listExtensionOffers: (...a: unknown[]) => listExtensionOffers(...a),
  listOwnExtensionRequests: (...a: unknown[]) => listOwnExtensionRequests(...a)
}));

// Carte du palier personnel : pour une agence, l'usage renvoie `AGENCY` et la carte disparaît.
vi.mock('../../services/personal-space-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/personal-space-service')>(
    '../../services/personal-space-service'
  );
  return {
    ...actual,
    getAssetUsage: vi.fn().mockResolvedValue({ plan: 'AGENCY', limit: null, used: 0, canAdd: true, upgrade: null }),
    getTenantIdentity: vi.fn().mockResolvedValue({ type: 'AGENCY', contactPhone: null })
  };
});

const ENTITLEMENTS = {
  tenantId: 'tenant-1',
  subscriptionId: 'sub-1',
  status: 'TRIALING',
  phase: 'TRIAL',
  readOnly: false,
  readOnlyReason: null,
  manualReadOnlyAt: null,
  manualReadOnlyReason: null,
  trialEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
  graceEndsAt: null,
  billingCycle: 'MONTHLY',
  currentPeriodStart: '2026-01-01T00:00:00.000Z',
  currentPeriodEnd: '2026-02-01T00:00:00.000Z',
  packs: ['AGENCE'],
  modules: ['MODULE_AGENCY'],
  moduleAccess: { MODULE_AGENCY: 'FULL', MODULE_SYNDIC: 'NONE', MODULE_PROMOTER: 'NONE' },
  features: [],
  capacities: {
    LOTS: { included: 100, extensions: 0, overrides: 0, limit: 100, used: 42, remaining: 58, overBy: 0 },
    COPROPRIETES: { included: 0, extensions: 0, overrides: 0, limit: 0, used: 0, remaining: 0, overBy: 0 },
    CHANTIERS: { included: 0, extensions: 0, overrides: 0, limit: 0, used: 0, remaining: 0, overBy: 0 },
    BIENS_DETENUS: { included: 0, extensions: 0, overrides: 0, limit: 0, used: 0, remaining: 0, overBy: 0 },
    ACTIFS: { included: 0, extensions: 0, overrides: 0, limit: 0, used: 60, remaining: 0, overBy: 60 },
    SIGNATURES_MENSUELLES: { included: 20, extensions: 0, overrides: 0, limit: 20, used: 3, remaining: 17, overBy: 0 }
  },
  quotaPolicy: 'BILL_OVERAGE',
  enforcement: 'enforce',
  computedAt: '2026-01-15T00:00:00.000Z'
};

const BillingProbe: React.FC = () => <div>Page Facturation {useLocation().search}</div>;

const OFFERS = [
  {
    code: 'EXT_LOTS_10',
    name: 'Bloc de 10 lots',
    description: '150 FCFA le lot',
    monthlyPrice: 1500,
    capacities: { LOTS: 10 },
    isSellable: true
  },
  {
    code: 'EXT_SIGNATURES_SUPPLEMENTAIRES',
    name: 'Signatures électroniques — bloc de 50',
    description: null,
    monthlyPrice: 0,
    capacities: { SIGNATURES_MENSUELLES: 50 },
    isSellable: false
  }
];

function mount(url = '/tenant/tenant-1/settings/abonnement') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/settings/abonnement" element={<TenantSubscriptionSettings />} />
            <Route path="/tenant/:tenantId/settings/facturation" element={<BillingProbe />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getOwnEntitlements.mockReset();
  useMenuEntryAccess.mockReturnValue({ ready: true, allowed: true });
  listOwnExtensionRequests.mockResolvedValue([]);
  listExtensionOffers.mockResolvedValue(OFFERS);
});

describe('<TenantSubscriptionSettings> — formule', () => {
  it("affiche les packs, la période, les jours d'essai restants et la consommation", async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
    mount();

    expect(await screen.findByText('Formule')).toBeInTheDocument();
    expect(screen.getAllByText('Agence').length).toBeGreaterThan(0);
    expect(screen.queryByText('AGENCE')).not.toBeInTheDocument();
    expect(screen.getByText('42 / 100')).toBeInTheDocument();
    expect(getOwnEntitlements).toHaveBeenCalledWith('tenant-1');

    // La formule se consulte : aucun bouton de modification des packs.
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument();
  });

  it("envoie une demande d'extension à l'API (plus de mailto)", async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
    createExtensionRequest.mockResolvedValue({
      id: 'req-1',
      tenantId: 'tenant-1',
      requestedByUserId: 'u-1',
      requestedByName: 'Awa',
      catalogCode: null,
      catalogName: null,
      quantity: null,
      message: 'Il nous faut 50 lots',
      status: 'OPEN',
      handledAt: null,
      handledByUserId: null,
      handledNote: null,
      createdAt: '2026-02-02T00:00:00.000Z'
    });
    const user = userEvent.setup();
    mount();

    await screen.findByText('Formule');
    await user.type(screen.getByLabelText('Votre demande'), 'Il nous faut 50 lots');
    await user.click(screen.getByRole('button', { name: /Envoyer la demande/ }));

    await waitFor(() =>
      expect(createExtensionRequest).toHaveBeenCalledWith('tenant-1', {
        catalogCode: null,
        quantity: null,
        message: 'Il nous faut 50 lots'
      })
    );
    expect(await screen.findByRole('table', { name: 'Mes demandes' })).toBeInTheDocument();
  });

  it("propose les extensions renvoyées par l'API, avec description et prix, ou « Tarif à confirmer »", async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
    const user = userEvent.setup();
    mount();

    await screen.findByText('Formule');
    expect(listExtensionOffers).toHaveBeenCalledWith('tenant-1');
    await user.click(screen.getByLabelText('Offre souhaitée'));
    await user.click(await screen.findByText('Bloc de 10 lots'));
    expect(await screen.findByText(/150 FCFA le lot — .*500 FCFA HT par mois et par unité/)).toBeInTheDocument();

    await user.click(screen.getByLabelText('Offre souhaitée'));
    await user.click(await screen.findByText('Signatures électroniques — bloc de 50'));
    expect(await screen.findByText('Tarif à confirmer')).toBeInTheDocument();
  });

  it('sans offre pour les packs, invite à décrire le besoin', async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
    listExtensionOffers.mockResolvedValue([]);
    mount();

    expect(
      await screen.findByText('Aucune extension disponible pour vos packs, décrivez votre besoin')
    ).toBeInTheDocument();
  });

  it("n'affiche que les capacités à limite positive ou ouvertes par une extension proposée", async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
    mount();

    await screen.findByText('Formule');
    expect(screen.getByText('Lots')).toBeInTheDocument();
    expect(screen.getByText('Signatures électroniques (par mois)')).toBeInTheDocument();
    expect(screen.queryByText('Copropriétés')).not.toBeInTheDocument();
    expect(screen.queryByText('Chantiers')).not.toBeInTheDocument();
    expect(screen.queryByText('Biens détenus')).not.toBeInTheDocument();
    expect(screen.queryByText('60 / 0')).not.toBeInTheDocument();
  });

  it('ne montre plus les factures sur cette page', async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
    mount();

    await screen.findByText('Formule');
    expect(screen.queryByRole('button', { name: /Payer en ligne/ })).not.toBeInTheDocument();
  });

  it("indique l'absence d'abonnement", async () => {
    getOwnEntitlements.mockResolvedValue({ ...ENTITLEMENTS, phase: 'NONE' });
    mount();

    expect(await screen.findByText("Cette agence n'a pas encore d'abonnement.")).toBeInTheDocument();
  });

  it('affiche le motif quand la lecture seule manuelle est active (Baba, 25/09)', async () => {
    getOwnEntitlements.mockResolvedValue({
      ...ENTITLEMENTS,
      phase: 'READ_ONLY',
      readOnly: true,
      readOnlyReason: 'MANUAL',
      manualReadOnlyAt: '2026-01-20T00:00:00.000Z',
      manualReadOnlyReason: 'Abus signalé'
    });
    mount();

    expect(await screen.findByText('Compte en lecture seule')).toBeInTheDocument();
    expect(screen.getByText('Décidée par ImmoTopia. Motif : Abus signalé')).toBeInTheDocument();
  });
});

describe('<TenantSubscriptionSettings> — droits, packs et demandes', () => {
  it('sans TENANT_SETTINGS_VIEW : « Accès réservé », sans aucun appel à l’API d’abonnement', async () => {
    useMenuEntryAccess.mockReturnValue({ ready: true, allowed: false });
    mount();

    expect(await screen.findByText('Accès réservé')).toBeInTheDocument();
    expect(useMenuEntryAccess).toHaveBeenCalledWith('tenant-1', 'mon-compte-abonnement');
    expect(getOwnEntitlements).not.toHaveBeenCalled();
    expect(listExtensionOffers).not.toHaveBeenCalled();
    expect(listOwnExtensionRequests).not.toHaveBeenCalled();
  });

  it('attend la lecture des droits avant d’appeler l’API', async () => {
    useMenuEntryAccess.mockReturnValue({ ready: false, allowed: true });
    mount();

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(screen.queryByText('Accès réservé')).not.toBeInTheDocument();
    expect(getOwnEntitlements).not.toHaveBeenCalled();
  });

  it('affiche les libellés des packs, avec repli sur le code', async () => {
    getOwnEntitlements.mockResolvedValue({
      ...ENTITLEMENTS,
      packs: ['PATRIMOINE_ESSENTIEL', 'INTEGRE', 'NOUVEAU_PACK']
    });
    mount();

    expect(await screen.findByText('Patrimoine Essentiel, Opérateur intégré, NOUVEAU_PACK')).toBeInTheDocument();
  });

  it("ne lit pas l'usage des actifs pour une agence (route patrimoine/usage en 403)", async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
    mount();

    await screen.findByText('Formule');
    expect(getAssetUsage).not.toHaveBeenCalled();
  });

  it("lit l'usage des actifs pour un espace personnel", async () => {
    getOwnEntitlements.mockResolvedValue({ ...ENTITLEMENTS, packs: ['PARTICULIER_GRATUIT'] });
    mount();

    await screen.findByText('Formule');
    await waitFor(() => expect(getAssetUsage).toHaveBeenCalledWith('tenant-1'));
  });

  it('« Mes demandes » : colonnes Offre (traduite) et Quantité', async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
    const base = {
      tenantId: 'tenant-1',
      requestedByUserId: 'u-1',
      requestedByName: 'Awa',
      handledAt: null,
      handledByUserId: null,
      handledNote: null,
      status: 'OPEN',
      createdAt: '2026-02-02T00:00:00.000Z'
    };
    listOwnExtensionRequests.mockResolvedValue([
      {
        ...base,
        id: 'r1',
        catalogCode: 'EXT_LOTS_10',
        catalogName: 'Nom français',
        quantity: 3,
        message: 'Trois blocs'
      },
      { ...base, id: 'r2', catalogCode: null, catalogName: null, quantity: null, message: 'Autre besoin' },
      { ...base, id: 'r3', catalogCode: 'EXT_RETIREE', catalogName: 'Ancienne offre', quantity: 1, message: 'Retirée' }
    ]);
    mount();

    const table = await screen.findByRole('table', { name: 'Mes demandes' });
    const rows = within(table).getAllByRole('row');
    expect(within(table).getByRole('columnheader', { name: 'Offre' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Quantité' })).toBeInTheDocument();
    // Nom lu dans les offres chargées (traduites par l'API), pas dans la demande.
    expect(within(rows[1]).getByText('Bloc de 10 lots')).toBeInTheDocument();
    expect(within(rows[1]).getByText('3')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Autre demande')).toBeInTheDocument();
    expect(within(rows[2]).getByText('—')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Ancienne offre')).toBeInTheDocument();
  });
});

describe('<TenantSubscriptionSettings> — retour de paiement (?paiement=)', () => {
  it('renvoie une agence vers Facturation en gardant le code de paiement', async () => {
    getOwnEntitlements.mockResolvedValue(ENTITLEMENTS);
    mount('/tenant/tenant-1/settings/abonnement?paiement=IMP-abc');

    expect(await screen.findByText('Page Facturation ?paiement=IMP-abc')).toBeInTheDocument();
  });

  it('renvoie quand même vers Facturation si la lecture des droits échoue', async () => {
    getOwnEntitlements.mockRejectedValue({ response: { status: 500, data: { message: 'Erreur' } } });
    mount('/tenant/tenant-1/settings/abonnement?paiement=IMP-abc');

    expect(await screen.findByText('Page Facturation ?paiement=IMP-abc')).toBeInTheDocument();
  });

  it("garde l'espace personnel sur cette page : la carte du palier suit le paiement", async () => {
    getOwnEntitlements.mockResolvedValue({ ...ENTITLEMENTS, packs: ['PARTICULIER_GRATUIT'] });
    mount('/tenant/tenant-1/settings/abonnement?paiement=IMP-abc');

    expect(await screen.findByText('Formule')).toBeInTheDocument();
    expect(screen.queryByText(/Page Facturation/)).not.toBeInTheDocument();
  });
});
