import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Chantiers } from '../../pages/finance/Chantiers';
import { ChantierDetail } from '../../pages/finance/ChantierDetail';
import { PieceDeCaisse } from '../../pages/finance/PieceDeCaisse';
import type { CashVoucher, ConstructionSite, CostCategory, SiteDetail } from '../../types/finance-lot2-types';

/**
 * Chantiers, détail d'un chantier et pièce de caisse — les garanties des
 * trois écrans du volet « chantiers » du lot 2
 * (specs/017-finance-fournisseurs-chantiers/spec.md, User Stories 7, 8, 9, 10).
 *
 * Modèle exact de `__tests__/finance/facturation.test.tsx` et
 * `balances.test.tsx` : `useBreakpoint` figé en desktop (pour un
 * `<ConfirmAction>` déterministe, un `Popconfirm` plutôt qu'un tiroir mobile),
 * un mock de `finance-lot2-service` qui couvre CHAQUE export utilisé par les
 * trois écrans — Vitest, contrairement à Jest, refuse en silence un import non
 * déclaré (AGENTS.md) — et des délais `findBy*` de 8 s pour tenir sous la
 * charge parallèle de la suite complète.
 */

const listConstructionSites = vi.fn();
const createConstructionSite = vi.fn();
const getSiteDetail = vi.fn();
const listCostCategories = vi.fn();
const createCashVoucher = vi.fn();
const validateCashVoucher = vi.fn();
const getCashVoucherPdfUrl = vi.fn();

vi.mock('../../services/finance-lot2-service', () => ({
  listConstructionSites: (...a: unknown[]) => listConstructionSites(...a),
  createConstructionSite: (...a: unknown[]) => createConstructionSite(...a),
  getSiteDetail: (...a: unknown[]) => getSiteDetail(...a),
  listCostCategories: (...a: unknown[]) => listCostCategories(...a),
  createCashVoucher: (...a: unknown[]) => createCashVoucher(...a),
  validateCashVoucher: (...a: unknown[]) => validateCashVoucher(...a),
  getCashVoucherPdfUrl: (...a: unknown[]) => getCashVoucherPdfUrl(...a)
}));

const listProperties = vi.fn();
vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function chantier(overrides: Partial<ConstructionSite> = {}): ConstructionSite {
  return {
    id: 'chantier-1',
    name: 'Villa duplex — Angré Centre',
    zone: 'Angré, Cocody',
    propertyId: 'bien-1',
    propertyLabel: 'Villa duplex — Angré Centre (en construction)',
    managerLabel: 'Mamadou Konan',
    // Aucun bail de terrain par defaut : c'est le cas courant.
    landLeaseId: null,
    status: 'IN_PROGRESS',
    startDate: '2026-04-01',
    plannedEndDate: '2026-11-30',
    progressPercent: 70,
    closedAt: null,
    finalCost: null,
    actualCost: 4_450_000,
    currency: 'XOF',
    stockEnabledAt: null,
    ...overrides
  };
}

function poste(overrides: Partial<CostCategory> = {}): CostCategory {
  return { id: 'poste-gros-oeuvre', label: 'Gros œuvre', position: 1, isActive: true, ...overrides };
}

function detail(overrides: Partial<SiteDetail> = {}): SiteDetail {
  return {
    site: chantier(),
    // Deux imputations par poste, à des montants distincts : le sous-total
    // (poste-gros-oeuvre : 4 000 000, poste-main-oeuvre : 1 500 000) ne doit
    // JAMAIS coïncider avec le montant d'une imputation individuelle, sans
    // quoi une assertion sur le sous-total matcherait aussi la ligne de
    // détail et laisserait passer un sous-total mal calculé.
    allocations: [
      {
        id: 'alloc-1',
        allocationDate: '2026-04-03',
        costCategoryId: 'poste-gros-oeuvre',
        costCategoryLabel: 'Gros œuvre',
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: 'facture-secrete-01',
        sourceLabel: "Facture FC-2026-0141 — Ciments d'Afrique CI",
        amount: 3_200_000
      },
      {
        id: 'alloc-1b',
        allocationDate: '2026-04-18',
        costCategoryId: 'poste-gros-oeuvre',
        costCategoryLabel: 'Gros œuvre',
        sourceType: 'CASH_VOUCHER',
        sourceId: 'piece-caisse-secrete-02',
        sourceLabel: 'Pièce de caisse 2026-0033 — Sable et gravier',
        amount: 800_000
      },
      {
        id: 'alloc-2',
        allocationDate: '2026-04-22',
        costCategoryId: 'poste-main-oeuvre',
        costCategoryLabel: "Main-d'œuvre",
        sourceType: 'CASH_VOUCHER',
        sourceId: 'piece-caisse-secrete-01',
        sourceLabel: 'Pièce de caisse 2026-0032 — Salaire équipe maçons',
        amount: 1_250_000
      },
      {
        id: 'alloc-2b',
        allocationDate: '2026-04-29',
        costCategoryId: 'poste-main-oeuvre',
        costCategoryLabel: "Main-d'œuvre",
        sourceType: 'CASH_VOUCHER',
        sourceId: 'piece-caisse-secrete-03',
        sourceLabel: "Pièce de caisse 2026-0034 — Prime d'équipe",
        amount: 250_000
      }
    ],
    byCostCategory: [
      { costCategoryId: 'poste-gros-oeuvre', label: 'Gros œuvre', amount: 4_000_000 },
      { costCategoryId: 'poste-main-oeuvre', label: "Main-d'œuvre", amount: 1_500_000 }
    ],
    ...overrides
  };
}

function voucher(overrides: Partial<CashVoucher> = {}): CashVoucher {
  return {
    id: 'piece-1',
    // La fixture par defaut est un BROUILLON, donc sans numero : il est
    // attribue a la validation (decision du 19 septembre 2026). Un test qui
    // partirait d'un brouillon numerote mettrait au point un cas qui n'existe
    // pas.
    number: null,
    siteId: 'chantier-1',
    siteLabel: 'Villa duplex — Angré Centre',
    costCategoryId: 'poste-main-oeuvre',
    costCategoryLabel: "Main-d'œuvre",
    beneficiary: 'Sékou Traoré',
    amount: 450_000,
    currency: 'XOF',
    voucherDate: '2026-09-18',
    reason: 'Salaire équipe finitions',
    status: 'DRAFT',
    validatedAt: null,
    ...overrides
  };
}

/** Nettoie casse et accents, pour une vérification insensible aux deux. */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Sonde d'adresse : révèle l'état de liste porté par l'URL. */
function Adresse() {
  const location = useLocation();
  return <span data-testid="adresse">{location.pathname + location.search}</span>;
}

function mountListe(url = '/tenant/agence-1/finance/chantiers') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/finance/chantiers" element={<Chantiers />} />
            <Route path="/tenant/:tenantId/finance/chantiers/:siteId" element={<span>détail du chantier</span>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountDetail(url = '/tenant/agence-1/finance/chantiers/chantier-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/finance/chantiers/:siteId" element={<ChantierDetail />} />
            <Route path="/tenant/:tenantId/finance/chantiers/:siteId/stock" element={<span>stock du chantier</span>} />
            <Route path="/tenant/:tenantId/finance/pieces-de-caisse" element={<span>pièce de caisse</span>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountCaisse(url = '/tenant/agence-1/finance/pieces-de-caisse') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/pieces-de-caisse" element={<PieceDeCaisse />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listProperties.mockResolvedValue({
    properties: [{ id: 'bien-1', title: 'Villa duplex — Angré Centre (en construction)' }],
    pagination: { page: 1, limit: 200, total: 1, totalPages: 1 }
  });
  listCostCategories.mockResolvedValue([
    poste(),
    poste({ id: 'poste-main-oeuvre', label: "Main-d'œuvre", position: 5 })
  ]);
  getCashVoucherPdfUrl.mockReturnValue('/tenants/agence-1/finance/cash-vouchers/piece-1.pdf');
});

describe('Chantiers — liste et création', () => {
  it('affiche une ligne par chantier, avec le coût réel déjà calculé', async () => {
    listConstructionSites.mockResolvedValue([chantier()]);
    mountListe();

    expect(await screen.findByText('Villa duplex — Angré Centre', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/4\s450\s000/)).toBeInTheDocument();
    expect(screen.getByText('Mamadou Konan')).toBeInTheDocument();
  });

  it('crée un chantier sans bien préexistant : le bien reste facultatif', async () => {
    listConstructionSites.mockResolvedValue([]);
    createConstructionSite.mockResolvedValue(
      chantier({ id: 'nouveau', name: 'Terrain loué — Riviera', propertyId: null })
    );
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText("Aucun chantier n'est encore enregistré.", {}, { timeout: 8000 });

    const boutons = screen.getAllByRole('button', { name: 'Nouveau chantier' });
    await user.click(boutons[0]);

    const champNom = await screen.findByLabelText('Nom du chantier');
    await user.type(champNom, 'Terrain loué — Riviera');

    await user.click(screen.getByRole('button', { name: 'Créer le chantier' }));

    await waitFor(() => expect(createConstructionSite).toHaveBeenCalledTimes(1));
    const [, params] = createConstructionSite.mock.calls[0];
    expect(params).toMatchObject({ name: 'Terrain loué — Riviera' });
    // Le point du récit : aucun bien n'est exigé, et aucun n'a été choisi.
    expect(params.propertyId).toBeUndefined();
  });

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    listConstructionSites.mockRejectedValue(new Error('panne'));
    mountListe();

    expect(await screen.findByText('Impossible de charger les chantiers.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('le sélecteur « Bien » cherche à distance avec la saisie, 20 résultats au plus', async () => {
    listConstructionSites.mockResolvedValue([]);
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText("Aucun chantier n'est encore enregistré.", {}, { timeout: 8000 });
    // Rien n'est chargé tant que le formulaire est fermé.
    expect(listProperties).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole('button', { name: /Nouveau chantier/ })[0]);
    await screen.findByLabelText('Nom du chantier');

    await user.type(screen.getByLabelText('Bien (facultatif)'), 'Duplex');

    await waitFor(
      () =>
        expect(listProperties).toHaveBeenCalledWith('agence-1', expect.objectContaining({ q: 'Duplex', limit: 20 })),
      { timeout: 8000 }
    );
    for (const [, filtres] of listProperties.mock.calls) expect(filtres.limit).toBe(20);
  }, 15000);

  it('n’offre aucun champ pour saisir le coût réel', async () => {
    listConstructionSites.mockResolvedValue([chantier()]);
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText('Villa duplex — Angré Centre', {}, { timeout: 8000 });
    // Le bouton porte une icône : son nom accessible est « plus Nouveau chantier ».
    await user.click(screen.getAllByRole('button', { name: /Nouveau chantier/ })[0]);
    await screen.findByLabelText('Nom du chantier');

    expect(screen.queryByLabelText(/coût réel/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /coût/i })).not.toBeInTheDocument();
  });
});

describe('Chantiers — recherche locale', () => {
  const T = { timeout: 8000 };
  const lignes = () => screen.getAllByRole('row').slice(1);

  beforeEach(() => {
    listConstructionSites.mockResolvedValue([
      chantier(),
      chantier({
        id: 'chantier-2',
        name: 'Résidence Palmeraie',
        zone: 'Marcory',
        propertyId: 'bien-2',
        propertyLabel: 'Palmeraie bloc A',
        managerLabel: 'Awa Diallo',
        status: 'PLANNED',
        actualCost: 900_000
      }),
      chantier({
        id: 'chantier-3',
        name: 'Terrain loué — Riviera',
        zone: null,
        propertyId: null,
        propertyLabel: null,
        managerLabel: null,
        status: 'CLOSED',
        actualCost: 12_000_000
      })
    ]);
  });

  it('cherche dans le nom, la zone, le bien et le responsable, et garde le terme dans l’URL', async () => {
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText('Résidence Palmeraie', {}, T);
    expect(lignes()).toHaveLength(3);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'diallo');

    await waitFor(() => expect(lignes()).toHaveLength(1), T);
    expect(screen.getByText('Résidence Palmeraie')).toBeInTheDocument();
    expect(screen.getByTestId('adresse')).toHaveTextContent('q=diallo');
    // La recherche est locale : la liste n'est demandée qu'une fois, sans critère.
    expect(listConstructionSites).toHaveBeenCalledTimes(1);
    expect(listConstructionSites).toHaveBeenCalledWith('agence-1');
  }, 30000);

  it('filtre par statut depuis l’URL (clé « status » conservée)', async () => {
    mountListe('/tenant/agence-1/finance/chantiers?status=CLOSED');

    expect(await screen.findByText('Terrain loué — Riviera', {}, T)).toBeInTheDocument();
    expect(screen.queryByText('Résidence Palmeraie')).not.toBeInTheDocument();
    expect(lignes()).toHaveLength(1);
  });

  it('filtre par bien depuis l’URL, en retrouvant le libellé du bien porté par les chantiers', async () => {
    mountListe('/tenant/agence-1/finance/chantiers?bien=bien-2');

    expect(await screen.findByText('Résidence Palmeraie', {}, T)).toBeInTheDocument();
    expect(lignes()).toHaveLength(1);
    // La puce du critère porte le libellé du bien, jamais son identifiant.
    expect((await screen.findAllByTitle(/Palmeraie bloc A/, {}, T)).length).toBeGreaterThan(0);
    expect(screen.queryByText('bien-2')).not.toBeInTheDocument();
  });

  it('filtre par coût réel minimum depuis l’URL', async () => {
    mountListe('/tenant/agence-1/finance/chantiers?coutMin=1000000');

    expect(await screen.findByText('Terrain loué — Riviera', {}, T)).toBeInTheDocument();
    expect(lignes()).toHaveLength(2);
    expect(screen.queryByText('Résidence Palmeraie')).not.toBeInTheDocument();
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup({ delay: null });
    mountListe('/tenant/agence-1/finance/chantiers?q=zzz');

    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', {}, T)).toBeInTheDocument();
    // Deux boutons du même nom : la barre et le bloc d'état.
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);

    expect(await screen.findByText('Résidence Palmeraie', {}, T)).toBeInTheDocument();
    expect(lignes()).toHaveLength(3);
    expect(screen.getByTestId('adresse').textContent).not.toContain('q=');
  });
});

describe('Détail d’un chantier — recherche dans les imputations', () => {
  const T = { timeout: 8000 };
  const lignes = () => screen.getAllByRole('row').slice(1);
  const URL_IMP = '/tenant/agence-1/finance/chantiers/chantier-1?onglet=imputations';

  beforeEach(() => {
    getSiteDetail.mockResolvedValue(detail());
  });

  it('cherche dans le poste, la nature et la pièce d’origine, et garde le terme dans l’URL (préfixe imp)', async () => {
    const user = userEvent.setup({ delay: null });
    mountDetail(URL_IMP);

    await screen.findByText('Pièce de caisse 2026-0033 — Sable et gravier', {}, T);
    expect(lignes()).toHaveLength(4);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'sable');

    await waitFor(() => expect(lignes()).toHaveLength(1), T);
    expect(screen.getByText('Pièce de caisse 2026-0033 — Sable et gravier')).toBeInTheDocument();
    expect(screen.getByTestId('adresse')).toHaveTextContent('imp.q=sable');
    // Une seule requête : la recherche est locale.
    expect(getSiteDetail).toHaveBeenCalledTimes(1);
  }, 30000);

  it('filtre par poste depuis l’URL', async () => {
    mountDetail(`${URL_IMP}&imp.poste=poste-main-oeuvre`);

    expect(await screen.findByText('Pièce de caisse 2026-0032 — Salaire équipe maçons', {}, T)).toBeInTheDocument();
    expect(lignes()).toHaveLength(2);
    expect(screen.queryByText("Facture FC-2026-0141 — Ciments d'Afrique CI")).not.toBeInTheDocument();
  });

  it('filtre par montant minimum depuis l’URL', async () => {
    mountDetail(`${URL_IMP}&imp.montantMin=1000000`);

    expect(await screen.findByText("Facture FC-2026-0141 — Ciments d'Afrique CI", {}, T)).toBeInTheDocument();
    expect(lignes()).toHaveLength(2);
    expect(screen.queryByText('Pièce de caisse 2026-0033 — Sable et gravier')).not.toBeInTheDocument();
  });

  it('propose d’effacer les critères, et le récapitulatif par poste n’a pas de barre', async () => {
    const user = userEvent.setup({ delay: null });
    mountDetail(`${URL_IMP}&imp.q=zzz`);

    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', {}, T)).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('Pièce de caisse 2026-0033 — Sable et gravier', {}, T)).toBeInTheDocument();
    expect(lignes()).toHaveLength(4);

    cleanup();
    mountDetail();
    await screen.findByText('Sous-totaux par poste', {}, T);
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  }, 30000);
});

describe('Détail d’un chantier', () => {
  it('affiche les sous-totaux par poste et le coût réel, sans jamais les recalculer à l’écran', async () => {
    getSiteDetail.mockResolvedValue(detail());
    mountDetail();

    // Le nom du chantier apparaît à la fois dans le fil d'Ariane et dans le
    // titre : on cible le titre pour lever l'ambiguïté.
    expect(
      await screen.findByRole('heading', { name: 'Villa duplex — Angré Centre' }, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByText('Sous-totaux par poste')).toBeInTheDocument();
    // Les sous-totaux (4 000 000 et 1 500 000) sont la somme des DEUX
    // imputations de chaque poste — jamais recalculés ici, ils viennent tels
    // quels de `SiteDetail.byCostCategory`.
    expect(screen.getByText(/4\s000\s000/)).toBeInTheDocument();
    expect(screen.getByText(/1\s500\s000/)).toBeInTheDocument();
    // Le coût réel affiché dans l'en-tête est celui du serveur (4 450 000),
    // jamais une somme recalculée en local.
    expect(screen.getByText(/4\s450\s000/)).toBeInTheDocument();
  });

  it('affiche un libellé lisible pour chaque pièce d’origine, jamais son identifiant', async () => {
    getSiteDetail.mockResolvedValue(detail());
    mountDetail('/tenant/agence-1/finance/chantiers/chantier-1?onglet=imputations');

    await screen.findByRole('heading', { name: 'Villa duplex — Angré Centre' }, { timeout: 8000 });

    expect(screen.getByText("Facture FC-2026-0141 — Ciments d'Afrique CI")).toBeInTheDocument();
    expect(screen.getByText('Pièce de caisse 2026-0032 — Salaire équipe maçons')).toBeInTheDocument();
    expect(screen.queryByText('facture-secrete-01')).not.toBeInTheDocument();
    expect(screen.queryByText('piece-caisse-secrete-01')).not.toBeInTheDocument();
  });

  it('n’offre aucun champ pour saisir ou corriger le coût réel', async () => {
    getSiteDetail.mockResolvedValue(detail());
    mountDetail();

    await screen.findByRole('heading', { name: 'Villa duplex — Angré Centre' }, { timeout: 8000 });

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /coût/i })).not.toBeInTheDocument();
  });

  it('affiche un état vide sans imputation, sans que ce soit une panne', async () => {
    getSiteDetail.mockResolvedValue(detail({ allocations: [], byCostCategory: [] }));
    mountDetail();

    const message = 'Aucune imputation n’a encore été enregistrée sur ce chantier.';
    // Un onglet à la fois : l'état vide du récapitulatif, puis celui des imputations.
    expect(await screen.findAllByText(message, {}, { timeout: 8000 })).toHaveLength(1);
    fireEvent.click(screen.getByRole('tab', { name: 'Imputations' }));
    await waitFor(() => expect(screen.getAllByText(message)).toHaveLength(1));
    expect(screen.getByRole('tab', { name: 'Imputations' })).toHaveAttribute('aria-selected', 'true');
  });

  it('?onglet=imputations affiche les imputations, un onglet inconnu retombe sur les postes, sans nouvelle requête', async () => {
    getSiteDetail.mockResolvedValue(detail());
    mountDetail('/tenant/agence-1/finance/chantiers/chantier-1?onglet=imputations');
    await screen.findByRole('heading', { name: 'Villa duplex — Angré Centre' }, { timeout: 8000 });
    expect(screen.getByText('Pièce de caisse 2026-0033 — Sable et gravier')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Imputations' })).toHaveAttribute('aria-selected', 'true');
    expect(getSiteDetail).toHaveBeenCalledTimes(1);
    cleanup();

    getSiteDetail.mockClear();
    mountDetail('/tenant/agence-1/finance/chantiers/chantier-1?onglet=inconnu');
    await screen.findByRole('heading', { name: 'Villa duplex — Angré Centre' }, { timeout: 8000 });
    expect(screen.getByRole('tab', { name: 'Sous-totaux par poste' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Pièce de caisse 2026-0033 — Sable et gravier')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Imputations' }));
    expect(await screen.findByText('Pièce de caisse 2026-0033 — Sable et gravier')).toBeInTheDocument();
    expect(getSiteDetail).toHaveBeenCalledTimes(1);
  });

  it('pagine les imputations localement : 20 lignes, puis les 5 suivantes', async () => {
    const user = userEvent.setup({ delay: null });
    const base = detail();
    const allocations = Array.from({ length: 25 }, (_, i) => ({
      ...base.allocations[0],
      id: `alloc-${i + 1}`,
      sourceLabel: `Pièce numéro ${String(i + 1).padStart(2, '0')}`
    }));
    getSiteDetail.mockResolvedValue(detail({ allocations }));
    mountDetail('/tenant/agence-1/finance/chantiers/chantier-1?onglet=imputations');

    await screen.findByText('Pièce numéro 01', {}, { timeout: 8000 });
    expect(screen.getByText('Pièce numéro 20')).toBeInTheDocument();
    expect(screen.queryByText('Pièce numéro 21')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(await screen.findByText('Pièce numéro 21')).toBeInTheDocument();
    expect(screen.getByText('Pièce numéro 25')).toBeInTheDocument();
    expect(screen.queryByText('Pièce numéro 20')).not.toBeInTheDocument();
  }, 15000);

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    getSiteDetail.mockRejectedValue(new Error('panne'));
    mountDetail();

    expect(await screen.findByText('Impossible de charger ce chantier.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('mentionne la date de bascule au stock, avec un lien vers l’écran Stock du chantier, quand le chantier y est passé', async () => {
    const user = userEvent.setup();
    getSiteDetail.mockResolvedValue(detail({ site: chantier({ stockEnabledAt: '2026-09-20T13:15:55.397Z' }) }));
    mountDetail();

    await screen.findByRole('heading', { name: 'Villa duplex — Angré Centre' }, { timeout: 8000 });

    expect(screen.getByText(/Passé au stock le/)).toBeInTheDocument();
    const lien = screen.getByRole('button', { name: 'Voir le stock' });
    await user.click(lien);

    expect(await screen.findByText('stock du chantier')).toBeInTheDocument();
  });

  it('ne mentionne rien sur le stock quand le chantier n’a pas basculé', async () => {
    getSiteDetail.mockResolvedValue(detail({ site: chantier({ stockEnabledAt: null }) }));
    mountDetail();

    await screen.findByRole('heading', { name: 'Villa duplex — Angré Centre' }, { timeout: 8000 });

    expect(screen.queryByText(/Passé au stock/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voir le stock' })).not.toBeInTheDocument();
  });

  // Le garde-fou serveur (`assertSiteOpenTx`) refusait déjà la validation
  // d'une pièce sur un chantier clôturé, mais trop tard : rien n'empêchait de
  // SAISIR un brouillon qu'on ne pouvait ensuite ni valider ni supprimer. Ces
  // deux tests couvrent la remontée de la prévention au moment de la saisie.
  it('désactive « Nouvelle pièce de caisse » sur un chantier clôturé, avec la raison en infobulle', async () => {
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    getSiteDetail.mockResolvedValue(
      detail({ site: chantier({ status: 'CLOSED', closedAt: '2026-09-01T08:00:00.000Z' }) })
    );
    mountDetail();

    await screen.findByRole('heading', { name: 'Villa duplex — Angré Centre' }, { timeout: 8000 });

    const bouton = screen.getByRole('button', { name: 'Nouvelle pièce de caisse' });
    expect(bouton).toBeDisabled();

    // La raison est dite, jamais seulement l'interdit. La recherche cible
    // « Rouvrez-le », propre à l'infobulle : le badge de statut affiche
    // aussi « Clôturé », qui rendrait /clôturé/i ambigu.
    await user.hover(bouton);
    expect(await screen.findByText(/Rouvrez-le/i, {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('laisse actif « Nouvelle pièce de caisse » sur un chantier en cours', async () => {
    getSiteDetail.mockResolvedValue(detail());
    mountDetail();

    await screen.findByRole('heading', { name: 'Villa duplex — Angré Centre' }, { timeout: 8000 });

    expect(screen.getByRole('button', { name: 'Nouvelle pièce de caisse' })).not.toBeDisabled();
  });

  // Régression : la pièce de caisse a longtemps partagé son adresse avec
  // l'écran Caisse (voir App.tsx) — ce bouton menait donc, selon l'ordre des
  // routes, à un écran qui n'était jamais la pièce de caisse. Il pointe
  // maintenant vers `/finance/pieces-de-caisse`, avec le chantier en
  // paramètre de requête.
  it('« Nouvelle pièce de caisse » mène à la pièce de caisse, chantier en paramètre de requête', async () => {
    getSiteDetail.mockResolvedValue(detail());
    const user = userEvent.setup({ delay: null });
    mountDetail();

    await screen.findByRole('heading', { name: 'Villa duplex — Angré Centre' }, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Nouvelle pièce de caisse' }));

    expect(await screen.findByText('pièce de caisse', {}, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('Pièce de caisse', () => {
  async function remplirEtEmettre(user: ReturnType<typeof userEvent.setup>) {
    listConstructionSites.mockResolvedValue([chantier()]);
    createCashVoucher.mockResolvedValue(voucher());
    mountCaisse();

    // Le composant `Select` d'AntD s'ouvre sur `mousedown`, pas sur `click` :
    // `fireEvent` évite ici les vérifications de visibilité/`pointer-events`
    // de `userEvent`, qui se bloquent sur la superposition du menu déroulant
    // (aucun autre test du dépôt ne pilote un `<Select>` via `userEvent`).
    // Le composant `Select` d'AntD s'ouvre sur `mousedown`, pas sur `click` :
    // `fireEvent` évite ici les vérifications de visibilité/`pointer-events`
    // de `userEvent`, qui se bloquent sur la superposition du menu déroulant
    // (aucun autre test du dépôt ne pilote un `<Select>` via `userEvent`).
    const comboboxes = await screen.findAllByRole('combobox', {}, { timeout: 8000 });
    fireEvent.mouseDown(comboboxes[0]);
    fireEvent.click(await screen.findByText('Villa duplex — Angré Centre'));

    fireEvent.mouseDown(screen.getAllByRole('combobox')[1]);
    fireEvent.click(await screen.findByText("Main-d'œuvre"));

    await user.type(screen.getByLabelText('Bénéficiaire'), 'Sékou Traoré');
    await user.type(screen.getByLabelText('Montant (FCFA)'), '450000');
    await user.type(screen.getByLabelText('Motif'), 'Salaire équipe finitions');

    // Le bouton porte une icône : son nom accessible inclut celle-ci.
    await user.click(screen.getByRole('button', { name: /Émettre la pièce/ }));
  }

  it('émet une pièce de caisse sans numéro, et ne fait pas mine d’en avoir un', async () => {
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    await remplirEtEmettre(user);

    await waitFor(() => expect(createCashVoucher).toHaveBeenCalledTimes(1));
    expect(createCashVoucher.mock.calls[0][1]).toMatchObject({
      siteId: 'chantier-1',
      costCategoryId: 'poste-main-oeuvre',
      beneficiary: 'Sékou Traoré',
      amount: 450_000,
      reason: 'Salaire équipe finitions'
    });
    // Un brouillon se designe par son beneficiaire, faute de numero.
    expect(await screen.findByText('Pièce à valider — Sékou Traoré', {}, { timeout: 8000 })).toBeInTheDocument();
    // Et surtout : aucun numero n'est affiche, pas meme un tiret de
    // remplacement, qui se lirait comme un numero sur une piece papier.
    expect(screen.queryByText(/Pièce\s+\d{4}-\d{4}/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pièce\s+[—-]\s*$/)).not.toBeInTheDocument();
  }, 15000);

  // Ce test monte l'ecran complet et enchaine plusieurs interactions dans
  // jsdom. Il passe seul en quelques secondes, mais depasse le delai par
  // defaut quand six fichiers de tests montent des composants en parallele.
  // Un delai explicite vaut mieux qu'une suite qui echoue au hasard : une
  // suite instable apprend a ignorer les echecs.
  it('présente la validation comme irréversible, avant de la déclencher', async () => {
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    // Le serveur rend la piece numerotee : c'est la validation qui pose le
    // numero, et cet appel est le seul endroit ou il peut apparaitre.
    validateCashVoucher.mockResolvedValue(
      voucher({ status: 'VALIDATED', number: '2026-0107', validatedAt: '2026-09-18T10:00:00.000Z' })
    );
    await remplirEtEmettre(user);

    await screen.findByText('Pièce à valider — Sékou Traoré', {}, { timeout: 8000 });
    // Le déclencheur (« Valider la pièce ») et le bouton de confirmation
    // (okText « Valider ») portent des noms distincts, à dessein.
    await user.click(screen.getByRole('button', { name: 'Valider la pièce' }));

    // L'avertissement est dit AVANT la validation, dans la confirmation.
    expect(await screen.findByText(/irréversible/i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(validateCashVoucher).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Valider' }));

    await waitFor(() => expect(validateCashVoucher).toHaveBeenCalledWith('agence-1', 'piece-1'));
    expect(await screen.findByText('Validée', {}, { timeout: 8000 })).toBeInTheDocument();
    // Le numero n'apparait qu'ici, une fois la piece validee.
    expect(await screen.findByText('Pièce 2026-0107', {}, { timeout: 8000 })).toBeInTheDocument();
  }, 60000);

  // Un chantier clôturé a un coût figé : le proposer ici laisserait saisir un
  // brouillon que la validation refuserait de toute façon (`assertSiteOpenTx`
  // côté serveur). La prévention est remontée au sélecteur.
  it('n’offre pas les chantiers clôturés dans le sélecteur de chantier', async () => {
    listConstructionSites.mockResolvedValue([
      chantier(),
      chantier({ id: 'chantier-clos', name: 'Chantier clos — Marcory', status: 'CLOSED', closedAt: '2026-08-01' })
    ]);
    mountCaisse();

    const comboboxes = await screen.findAllByRole('combobox', {}, { timeout: 8000 });
    fireEvent.mouseDown(comboboxes[0]);

    expect(await screen.findByText('Villa duplex — Angré Centre', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Chantier clos — Marcory')).not.toBeInTheDocument();
  });

  // Le bouton de la fiche est grise sur un chantier cloture, mais l'adresse
  // reste ouvrable : un signet, un lien d'hier, un chantier cloture depuis.
  it('RELÂCHE un chantier clôturé passé en adresse, et dit pourquoi', async () => {
    listConstructionSites.mockResolvedValue([
      chantier(),
      chantier({ id: 'chantier-clos', name: 'Chantier clos — Marcory', status: 'CLOSED', closedAt: '2026-08-01' })
    ]);
    mountCaisse('/tenant/agence-1/finance/pieces-de-caisse?chantierId=chantier-clos');

    expect(
      await screen.findByText(/Ce chantier est clôturé .* Choisissez-en un autre/i, {}, { timeout: 8000 })
    ).toBeInTheDocument();

    // Et surtout : le champ ne garde pas l'identifiant brut, faute d'option
    // portant encore son libellé.
    expect(screen.queryByText('chantier-clos')).not.toBeInTheDocument();
    expect(screen.queryByText('Chantier clos — Marcory')).not.toBeInTheDocument();
  });

  it('ne dit rien de tel quand le chantier passé en adresse est ouvert', async () => {
    mountCaisse('/tenant/agence-1/finance/pieces-de-caisse?chantierId=chantier-1');

    await screen.findAllByRole('combobox', {}, { timeout: 8000 });
    expect(screen.queryByText(/Ce chantier est clôturé/i)).not.toBeInTheDocument();
  });

  it('imprime le bon via l’URL fournie par le service', async () => {
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    const ouvrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    await remplirEtEmettre(user);

    await screen.findByText('Pièce à valider — Sékou Traoré', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: /Imprimer le bon/ }));

    expect(getCashVoucherPdfUrl).toHaveBeenCalledWith('agence-1', 'piece-1');
    expect(ouvrir).toHaveBeenCalledWith(
      '/tenants/agence-1/finance/cash-vouchers/piece-1.pdf',
      '_blank',
      'noopener,noreferrer'
    );

    ouvrir.mockRestore();
  }, 15000);
});

describe('Vocabulaire (P-1 du PRD)', () => {
  it('la liste des chantiers n’affiche jamais « débit » ni « crédit »', async () => {
    listConstructionSites.mockResolvedValue([chantier()]);
    mountListe();

    await screen.findByText('Villa duplex — Angré Centre', {}, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  }, 15000);

  it('le détail d’un chantier n’affiche jamais « débit » ni « crédit »', async () => {
    getSiteDetail.mockResolvedValue(detail());
    mountDetail();

    await screen.findByRole('heading', { name: 'Villa duplex — Angré Centre' }, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  });

  it('la pièce de caisse n’affiche jamais « débit » ni « crédit »', async () => {
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    await remplirEtEmettreVocabulaire(user);

    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  }, 15000);

  async function remplirEtEmettreVocabulaire(user: ReturnType<typeof userEvent.setup>) {
    listConstructionSites.mockResolvedValue([chantier()]);
    createCashVoucher.mockResolvedValue(voucher());
    mountCaisse();

    const comboboxes = await screen.findAllByRole('combobox', {}, { timeout: 8000 });
    await user.click(comboboxes[0]);
    await user.click(await screen.findByText('Villa duplex — Angré Centre'));
    await user.click(screen.getAllByRole('combobox')[1]);
    await user.click(await screen.findByText("Main-d'œuvre"));
    await user.type(screen.getByLabelText('Bénéficiaire'), 'Sékou Traoré');
    await user.type(screen.getByLabelText('Montant (FCFA)'), '450000');
    await user.type(screen.getByLabelText('Motif'), 'Salaire équipe finitions');
    await user.click(screen.getByRole('button', { name: /Émettre la pièce/ }));
    await screen.findByText('Pièce à valider — Sékou Traoré', {}, { timeout: 8000 });
  }
});
