import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BauxDeTerrain } from '../../pages/finance/BauxDeTerrain';
import { BailDeTerrain } from '../../pages/finance/BailDeTerrain';
import type { LandLease, LandLeaseAccrual, LandLeasePayment } from '../../types/finance-lot4-types';
import type { ConstructionSite, CostCategory } from '../../types/finance-lot2-types';

/**
 * Baux de terrain — les garanties des deux écrans du lot 4, sous-lot 1
 * (`specs/019-finance-baux-terrain/data-model.md`).
 *
 * Modèle exact de `__tests__/finance/budget.test.tsx` : `useBreakpoint` figé
 * en desktop pour un `<ConfirmAction>` déterministe (`Popconfirm`), un mock de
 * `finance-lot4-service` ET `finance-lot2-service` qui couvre CHAQUE export
 * utilisé par les deux écrans — Vitest refuse en silence un import non
 * déclaré (AGENTS.md) —, et des délais `findBy*` de 8 s pour la charge
 * parallèle de la suite complète.
 *
 * Les fixtures par défaut (un bail, un paiement validé, DEUX constatations)
 * sont arithmétiquement cohérentes entre elles : payé (4 000 000) moins
 * consommé (2 × 333 333 = 666 666) égale exactement l'opposé du solde du
 * compte de tiers (accountBalance : -3 333 334). Un test qui romprait cette
 * cohérence le ferait exprès, pour vérifier un cas précis (ex. constatation
 * sans imputation).
 */

const listLandLeases = vi.fn();
const createLandLease = vi.fn();
const getLandLease = vi.fn();
const setSiteLandLease = vi.fn();
const listLandLeasePayments = vi.fn();
const createLandLeasePayment = vi.fn();
const validateLandLeasePayment = vi.fn();
const listLandLeaseAccruals = vi.fn();
const recordLandLeaseAccrual = vi.fn();

vi.mock('../../services/finance-lot4-service', () => ({
  listLandLeases: (...a: unknown[]) => listLandLeases(...a),
  createLandLease: (...a: unknown[]) => createLandLease(...a),
  getLandLease: (...a: unknown[]) => getLandLease(...a),
  setSiteLandLease: (...a: unknown[]) => setSiteLandLease(...a),
  listLandLeasePayments: (...a: unknown[]) => listLandLeasePayments(...a),
  createLandLeasePayment: (...a: unknown[]) => createLandLeasePayment(...a),
  validateLandLeasePayment: (...a: unknown[]) => validateLandLeasePayment(...a),
  listLandLeaseAccruals: (...a: unknown[]) => listLandLeaseAccruals(...a),
  recordLandLeaseAccrual: (...a: unknown[]) => recordLandLeaseAccrual(...a)
}));

const listConstructionSites = vi.fn();
const listCostCategories = vi.fn();
vi.mock('../../services/finance-lot2-service', () => ({
  listConstructionSites: (...a: unknown[]) => listConstructionSites(...a),
  listCostCategories: (...a: unknown[]) => listCostCategories(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function bail(overrides: Partial<LandLease> = {}): LandLease {
  return {
    id: 'bail-1',
    landlordName: 'Mamadou Kouadio',
    landLabel: 'Terrain de la Riviera, 800 m²',
    annualAmount: 4_000_000,
    costCategoryId: 'poste-divers',
    costCategoryLabel: 'Divers',
    monthlyAmount: 333_333,
    currency: 'XOF',
    startDate: '2026-08-01',
    endDate: null,
    isActive: true,
    sites: [{ siteId: 'chantier-1', siteLabel: 'Terrain loué — Riviera', status: 'IN_PROGRESS' }],
    // Voir l'en-tête : cohérent avec le paiement et les deux constatations
    // par défaut ci-dessous.
    accountBalance: -3_333_334,
    ...overrides
  };
}

function paiement(overrides: Partial<LandLeasePayment> = {}): LandLeasePayment {
  return {
    id: 'paiement-1',
    landLeaseId: 'bail-1',
    landlordName: 'Mamadou Kouadio',
    paymentDate: '2026-08-01',
    amount: 4_000_000,
    currency: 'XOF',
    coverageStartDate: '2026-08-01',
    coverageEndDate: '2027-07-31',
    status: 'VALIDATED',
    createdByLabel: 'Ibrahima Yao',
    validatedAt: '2026-08-01T09:00:00.000Z',
    ...overrides
  };
}

function constatation(overrides: Partial<LandLeaseAccrual> = {}): LandLeaseAccrual {
  return {
    id: 'constat-1',
    landLeaseId: 'bail-1',
    landlordName: 'Mamadou Kouadio',
    periodYear: 2026,
    periodMonth: 8,
    amount: 333_333,
    currency: 'XOF',
    allocations: [{ siteId: 'chantier-1', siteLabel: 'Terrain loué — Riviera', amount: 333_333 }],
    createdAt: '2026-08-01T02:00:00.000Z',
    ...overrides
  };
}

function chantierDisponible(overrides: Partial<ConstructionSite> = {}): ConstructionSite {
  return {
    id: 'chantier-2',
    name: 'Extension villa — Bingerville',
    zone: 'Bingerville, Abidjan',
    propertyId: null,
    propertyLabel: null,
    managerLabel: null,
    // Libre de tout bail : c'est le cas que le selecteur doit proposer.
    landLeaseId: null,
    status: 'PLANNED',
    startDate: null,
    plannedEndDate: null,
    progressPercent: 0,
    closedAt: null,
    finalCost: null,
    actualCost: 0,
    currency: 'XOF',
    stockEnabledAt: null,
    ...overrides
  };
}

function poste(overrides: Partial<CostCategory> = {}): CostCategory {
  return { id: 'poste-divers', label: 'Divers', position: 7, isActive: true, ...overrides };
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

function mountListe(url = '/tenant/agence-1/finance/baux-terrain') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/finance/baux-terrain" element={<BauxDeTerrain />} />
            <Route path="/tenant/:tenantId/finance/baux-terrain/:landLeaseId" element={<BailDeTerrain />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountFiche(url = '/tenant/agence-1/finance/baux-terrain/bail-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/finance/baux-terrain/:landLeaseId" element={<BailDeTerrain />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getLandLease.mockResolvedValue(bail());
  listLandLeasePayments.mockResolvedValue([paiement()]);
  listLandLeaseAccruals.mockResolvedValue([
    constatation(),
    constatation({ id: 'constat-2', periodMonth: 9, createdAt: '2026-09-01T02:00:00.000Z' })
  ]);
  listConstructionSites.mockResolvedValue([chantierDisponible()]);
  listCostCategories.mockResolvedValue([poste()]);
});

describe('Baux de terrain — liste et création', () => {
  it('affiche le loyer annuel, la mensualité et ce qu’il reste à consommer, jamais le solde brut', async () => {
    listLandLeases.mockResolvedValue([bail()]);
    mountListe();

    expect(await screen.findByText('Terrain de la Riviera, 800 m²', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Mamadou Kouadio')).toBeInTheDocument();
    // Le nom du poste de dépense, jamais son identifiant (`costCategoryId`).
    expect(screen.getByText('Divers')).toBeInTheDocument();
    expect(screen.getByText(/4\s000\s000/)).toBeInTheDocument();
    expect(screen.getByText(/333\s333/)).toBeInTheDocument();
    // Le solde du compte (-3 333 334) devient « il reste 3 333 334 à
    // consommer » : jamais le nombre négatif brut.
    expect(screen.getByText(/3\s333\s334/)).toBeInTheDocument();
    expect(screen.queryByText(/-3\s333\s334/)).not.toBeInTheDocument();
  });

  it('affiche la mensualité telle que le serveur la rend, jamais une division de l’annuel par douze', async () => {
    // 4 000 000 / 12 = 333 333,33… : si l’écran divisait lui-même, il
    // afficherait 333 333, jamais ce 300 000 délibérément différent.
    listLandLeases.mockResolvedValue([bail({ monthlyAmount: 300_000 })]);
    mountListe();

    await screen.findByText('Terrain de la Riviera, 800 m²', {}, { timeout: 8000 });
    expect(screen.getByText(/300\s000/)).toBeInTheDocument();
    expect(screen.queryByText(/333\s333/)).not.toBeInTheDocument();
  });

  it('liste les chantiers rattachés par leur nom, et dit clairement quand il n’y en a aucun', async () => {
    listLandLeases.mockResolvedValue([bail(), bail({ id: 'bail-2', landLabel: 'Terrain de Port-Bouët', sites: [] })]);
    mountListe();

    await screen.findByText('Terrain de la Riviera, 800 m²', {}, { timeout: 8000 });
    expect(screen.getByText('Terrain loué — Riviera')).toBeInTheDocument();
    expect(screen.getByText('Aucun chantier rattaché')).toBeInTheDocument();
  });

  it('crée un bail depuis le formulaire, avec les champs du contrat gelé', async () => {
    listLandLeases.mockResolvedValue([]);
    createLandLease.mockResolvedValue(bail({ id: 'bail-nouveau' }));
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText("Aucun bail de terrain n'est encore enregistré.", {}, { timeout: 8000 });

    await user.click(screen.getAllByRole('button', { name: /Nouveau bail/ })[0]);
    await user.type(await screen.findByLabelText('Bailleur'), 'Mamadou Kouadio');
    await user.type(screen.getByLabelText('Terrain loué'), 'Terrain de la Riviera, 800 m²');
    await user.type(screen.getByLabelText('Loyer annuel (FCFA)'), '4000000');

    const posteSelect = await screen.findByLabelText('Poste de dépense', {}, { timeout: 8000 });
    fireEvent.mouseDown(posteSelect);
    fireEvent.click(await screen.findByText('Divers'));

    // AntD `DatePicker` ne porte pas de placeholder stable d'un environnement
    // à l'autre (dépend de la locale du `ConfigProvider`, absent de ce montage
    // isolé) : on cible directement l'entrée réelle par son `id`, celui-là
    // même que l'écran lui donne (`bail-debut`).
    const champDebut = document.getElementById('bail-debut') as HTMLInputElement;
    fireEvent.change(champDebut, { target: { value: '01/08/2026' } });
    fireEvent.keyDown(champDebut, { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer le bail' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Enregistrer le bail' }));

    await waitFor(() => expect(createLandLease).toHaveBeenCalledTimes(1));
    expect(createLandLease.mock.calls[0][1]).toMatchObject({
      landlordName: 'Mamadou Kouadio',
      landLabel: 'Terrain de la Riviera, 800 m²',
      annualAmount: 4_000_000,
      costCategoryId: 'poste-divers',
      startDate: '2026-08-01'
    });
  }, 30000);

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    listLandLeases.mockRejectedValue(new Error('panne'));
    mountListe();

    expect(
      await screen.findByText('Impossible de charger les baux de terrain.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('navigue vers la fiche du bail à l’adresse exacte que cette fiche déclare lire', async () => {
    // Le défaut relevé deux fois au lot 2 : une navigation en `?xxx=` vers une
    // route qui porte l'identifiant dans le CHEMIN ne mène nulle part. Ici,
    // les deux routes sont déclarées avec le même chemin que celui utilisé
    // pour naviguer (voir `mountListe`) : si le geste n'utilisait pas le bon
    // chemin, la fiche ne se monterait jamais et ce test échouerait.
    listLandLeases.mockResolvedValue([bail()]);
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText('Terrain de la Riviera, 800 m²', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Voir le bail' }));

    // On retrouve la fiche du bail (en-tête + statistique), pas la liste.
    expect(await screen.findByText('Payé à ce jour', {}, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('Baux de terrain — recherche locale', () => {
  const T = { timeout: 8000 };
  const lignes = () => document.querySelectorAll('.ant-table-tbody tr.ant-table-row');

  beforeEach(() => {
    listLandLeases.mockResolvedValue([
      bail(),
      bail({
        id: 'bail-2',
        landlordName: 'Awa Diallo',
        landLabel: 'Terrain de Port-Bouët',
        costCategoryId: 'poste-loyers',
        costCategoryLabel: 'Loyers',
        isActive: false,
        sites: []
      })
    ]);
  });

  it('cherche dans le bailleur, le terrain, le poste et les chantiers rattachés, et garde le terme dans l’URL', async () => {
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText('Terrain de Port-Bouët', {}, T);
    expect(lignes()).toHaveLength(2);
    const champ = within(screen.getByRole('search')).getByRole('textbox');

    // Chantier rattaché (la colonne montre aussi « Aucun chantier rattaché »).
    await user.type(champ, 'riviera');
    await waitFor(() => expect(lignes()).toHaveLength(1), T);
    expect(screen.queryByText('Terrain de Port-Bouët')).not.toBeInTheDocument();
    expect(screen.getByTestId('adresse')).toHaveTextContent('q=riviera');

    await user.clear(champ);
    await user.type(champ, 'diallo');
    await waitFor(() => expect(screen.queryByText('Terrain de la Riviera, 800 m²')).not.toBeInTheDocument(), T);
    expect(lignes()).toHaveLength(1);
    // La recherche est locale : la liste n'est demandée qu'une fois.
    expect(listLandLeases).toHaveBeenCalledTimes(1);
  }, 30000);

  it('filtre actif / terminé depuis l’URL', async () => {
    mountListe('/tenant/agence-1/finance/baux-terrain?actif=0');
    expect(await screen.findByText('Terrain de Port-Bouët', {}, T)).toBeInTheDocument();
    expect(lignes()).toHaveLength(1);
    expect(screen.queryByText('Terrain de la Riviera, 800 m²')).not.toBeInTheDocument();
  });

  it('filtre par poste de dépense depuis l’URL', async () => {
    mountListe('/tenant/agence-1/finance/baux-terrain?poste=poste-divers');
    expect(await screen.findByText('Terrain de la Riviera, 800 m²', {}, T)).toBeInTheDocument();
    expect(lignes()).toHaveLength(1);
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup({ delay: null });
    mountListe('/tenant/agence-1/finance/baux-terrain?q=zzz');

    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', {}, T)).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);

    expect(await screen.findByText('Terrain de Port-Bouët', {}, T)).toBeInTheDocument();
    expect(lignes()).toHaveLength(2);
    expect(screen.getByTestId('adresse').textContent).not.toContain('q=');
  });
});

describe('Fiche du bail — recherche dans les paiements et les constatations', () => {
  const T = { timeout: 8000 };
  const lignes = () => document.querySelectorAll('.ant-table-tbody tr.ant-table-row');

  beforeEach(() => {
    listLandLeasePayments.mockResolvedValue([
      paiement(),
      paiement({
        id: 'paiement-2',
        paymentDate: '2026-09-10',
        amount: 1_000_000,
        status: 'DRAFT',
        validatedAt: null,
        createdByLabel: 'Awa Diallo'
      })
    ]);
  });

  it('cherche dans « saisi par » (préfixe pai) sans toucher aux sommes de l’en-tête', async () => {
    const user = userEvent.setup({ delay: null });
    mountFiche('/tenant/agence-1/finance/baux-terrain/bail-1?onglet=paiements');

    await screen.findByText('Nouveau paiement annuel', {}, T);
    await waitFor(() => expect(lignes()).toHaveLength(2), T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'diallo');

    await waitFor(() => expect(lignes()).toHaveLength(1), T);
    expect(screen.getByTestId('adresse')).toHaveTextContent('pai.q=diallo');
    // « Payé à ce jour » reste la somme des paiements VALIDÉS de la liste complète.
    const cartePayee = screen.getByText('Payé à ce jour').closest('.ant-card') as HTMLElement;
    expect(within(cartePayee).getByText(/4\s000\s000/)).toBeInTheDocument();
    // Une seule lecture des paiements : la recherche est locale.
    expect(listLandLeasePayments).toHaveBeenCalledTimes(1);
  }, 30000);

  it('filtre par statut depuis l’URL', async () => {
    mountFiche('/tenant/agence-1/finance/baux-terrain/bail-1?onglet=paiements&pai.status=DRAFT');
    await screen.findByText('Nouveau paiement annuel', {}, T);
    await waitFor(() => expect(lignes()).toHaveLength(1), T);
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument();
  });

  it('filtre par montant minimum depuis l’URL', async () => {
    mountFiche('/tenant/agence-1/finance/baux-terrain/bail-1?onglet=paiements&pai.montantMin=2000000');
    await screen.findByText('Nouveau paiement annuel', {}, T);
    await waitFor(() => expect(lignes()).toHaveLength(1), T);
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument();
  });

  it('filtre les constatations par période (préfixe cst) : un mois entier compte dès qu’il touche l’intervalle', async () => {
    mountFiche('/tenant/agence-1/finance/baux-terrain/bail-1?onglet=constatations&cst.periodeFrom=2026-09-01');

    expect(await screen.findByText('Septembre 2026', {}, T)).toBeInTheDocument();
    expect(screen.queryByText('Août 2026')).not.toBeInTheDocument();
    expect(lignes()).toHaveLength(1);
    // « Consommé à ce jour » garde la somme des deux constatations (2 × 333 333).
    const carteConsommee = screen.getByText('Consommé à ce jour').closest('.ant-card') as HTMLElement;
    expect(within(carteConsommee).getByText(/666\s666/)).toBeInTheDocument();
  });

  it('cherche dans la période et propose d’effacer les critères des constatations', async () => {
    const user = userEvent.setup({ delay: null });
    mountFiche('/tenant/agence-1/finance/baux-terrain/bail-1?onglet=constatations&cst.q=zzz');

    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', {}, T)).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);

    expect(await screen.findByText('Août 2026', {}, T)).toBeInTheDocument();
    expect(lignes()).toHaveLength(2);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'septembre');
    await waitFor(() => expect(lignes()).toHaveLength(1), T);
    expect(screen.getByTestId('adresse')).toHaveTextContent('cst.q=septembre');
  }, 30000);
});

describe('Fiche du bail — les trois chiffres qui rendent le mécanisme lisible', () => {
  it('affiche le payé, le consommé et le reste à consommer, cohérents entre eux', async () => {
    mountFiche();

    await screen.findByRole('heading', { name: 'Terrain de la Riviera, 800 m²' }, { timeout: 8000 });

    // « Payé » (4 000 000) coïncide avec le loyer annuel et le paiement listé
    // plus bas : on cible donc la carte statistique précisément par son
    // libellé, plutôt qu'un texte qui apparaît ailleurs sur la page pour une
    // autre raison.
    const cartePayee = screen.getByText('Payé à ce jour').closest('.ant-card') as HTMLElement;
    expect(within(cartePayee).getByText(/4\s000\s000/)).toBeInTheDocument();

    const carteConsommee = screen.getByText('Consommé à ce jour').closest('.ant-card') as HTMLElement;
    expect(within(carteConsommee).getByText(/666\s666/)).toBeInTheDocument(); // 2 × 333 333

    const carteReste = screen.getByText('Reste à consommer').closest('.ant-card') as HTMLElement;
    expect(within(carteReste).getByText(/3\s333\s334/)).toBeInTheDocument();
  });

  it('affiche un message explicite quand une constatation n’a aucune imputation, jamais un blanc', async () => {
    listLandLeaseAccruals.mockResolvedValue([constatation({ allocations: [] })]);
    mountFiche('/tenant/agence-1/finance/baux-terrain/bail-1?onglet=constatations');

    await screen.findByRole('heading', { name: 'Terrain de la Riviera, 800 m²' }, { timeout: 8000 });
    expect(
      await screen.findByText(/Aucun chantier actif sur ce bail à cette date/i, {}, { timeout: 8000 })
    ).toBeInTheDocument();
  });

  it('affiche le nom des chantiers rattachés, jamais leur identifiant', async () => {
    mountFiche();

    await screen.findByRole('heading', { name: 'Terrain de la Riviera, 800 m²' }, { timeout: 8000 });
    expect(screen.getByText('Terrain loué — Riviera')).toBeInTheDocument();
    expect(screen.queryByText('chantier-1')).not.toBeInTheDocument();
  });

  it('affiche le nom du poste de dépense auquel le loyer s’impute, jamais son identifiant', async () => {
    mountFiche();

    await screen.findByRole('heading', { name: 'Terrain de la Riviera, 800 m²' }, { timeout: 8000 });
    expect(screen.getByText(/Loyer imputé au poste « Divers »/)).toBeInTheDocument();
    expect(screen.queryByText('poste-divers')).not.toBeInTheDocument();
  });
});

describe('Fiche du bail — paiements', () => {
  it('avertit avant de valider un paiement, puis appelle le service seulement après confirmation', async () => {
    listLandLeasePayments.mockResolvedValue([paiement({ status: 'DRAFT', validatedAt: null })]);
    validateLandLeasePayment.mockResolvedValue(paiement());
    const user = userEvent.setup({ delay: null });
    mountFiche('/tenant/agence-1/finance/baux-terrain/bail-1?onglet=paiements');

    await screen.findByRole('button', { name: 'Valider' }, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(await screen.findByText(/irréversible/i)).toBeInTheDocument();
    expect(validateLandLeasePayment).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirmer la validation' }));

    await waitFor(() => expect(validateLandLeasePayment).toHaveBeenCalledWith('agence-1', 'paiement-1'));
  });

  it('enregistre un nouveau paiement en brouillon avec les champs du contrat gelé', async () => {
    createLandLeasePayment.mockResolvedValue(paiement({ id: 'paiement-2', status: 'DRAFT' }));
    const user = userEvent.setup({ delay: null });
    mountFiche('/tenant/agence-1/finance/baux-terrain/bail-1?onglet=paiements');

    await screen.findByText('Nouveau paiement annuel', {}, { timeout: 8000 });
    await user.type(screen.getByLabelText('Montant'), '4000000');

    // Même remarque que pour la création d'un bail : on cible les entrées
    // réelles par leur `id` plutôt que par un placeholder dépendant de la
    // locale du `ConfigProvider`.
    const champDebut = document.getElementById('paiement-debut') as HTMLInputElement;
    const champFin = document.getElementById('paiement-fin') as HTMLInputElement;
    fireEvent.change(champDebut, { target: { value: '01/08/2026' } });
    fireEvent.keyDown(champDebut, { key: 'Enter', code: 'Enter' });
    fireEvent.change(champFin, { target: { value: '31/07/2027' } });
    fireEvent.keyDown(champFin, { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer le paiement' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));

    await waitFor(() => expect(createLandLeasePayment).toHaveBeenCalledTimes(1));
    expect(createLandLeasePayment.mock.calls[0][1]).toMatchObject({
      landLeaseId: 'bail-1',
      amount: 4_000_000,
      coverageStartDate: '2026-08-01',
      coverageEndDate: '2027-07-31'
    });
  }, 30000);
});

describe('Fiche du bail — rattachement des chantiers', () => {
  it('rattache un chantier existant au bail', async () => {
    setSiteLandLease.mockResolvedValue(bail());
    const user = userEvent.setup({ delay: null });
    mountFiche();

    await screen.findByRole('heading', { name: 'Terrain de la Riviera, 800 m²' }, { timeout: 8000 });

    const select = await screen.findByLabelText('Rattacher un chantier existant', {}, { timeout: 8000 });
    fireEvent.mouseDown(select);
    fireEvent.click(await screen.findByText('Extension villa — Bingerville'));

    await user.click(screen.getByRole('button', { name: 'Rattacher' }));

    await waitFor(() => expect(setSiteLandLease).toHaveBeenCalledWith('agence-1', 'chantier-2', 'bail-1'));
  }, 15000);

  it('détache un chantier rattaché après confirmation', async () => {
    setSiteLandLease.mockResolvedValue({ ...bail(), sites: [] });
    const user = userEvent.setup({ delay: null });
    mountFiche();

    await screen.findByText('Terrain loué — Riviera', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Détacher' }));

    // Le bouton déclencheur affiche aussi « Détacher » : on vérifie la
    // confirmation par sa description, unique dans le document.
    expect(await screen.findByText(/prochaine constatation mensuelle/i, {}, { timeout: 8000 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmer le détachement' }));

    await waitFor(() => expect(setSiteLandLease).toHaveBeenCalledWith('agence-1', 'chantier-1', null));
  }, 30000);
});

describe('Fiche du bail — onglets paresseux et pagination locale', () => {
  it('ne charge la liste des chantiers qu’à l’ouverture du sélecteur de rattachement', async () => {
    const user = userEvent.setup({ delay: null });
    mountFiche();

    await screen.findByRole('heading', { name: 'Terrain de la Riviera, 800 m²' }, { timeout: 8000 });
    await screen.findByLabelText('Rattacher un chantier existant', {}, { timeout: 8000 });
    expect(listConstructionSites).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText('Rattacher un chantier existant'));

    await waitFor(() => expect(listConstructionSites).toHaveBeenCalledTimes(1));
  }, 20000);

  it('n’affiche que l’onglet demandé, et passer d’un onglet à l’autre met `?onglet=` dans l’adresse', async () => {
    const user = userEvent.setup({ delay: null });
    mountFiche();

    await screen.findByRole('heading', { name: 'Terrain de la Riviera, 800 m²' }, { timeout: 8000 });
    // Onglet par défaut : les chantiers rattachés, pas le formulaire de paiement.
    expect(await screen.findByText('Terrain loué — Riviera', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Nouveau paiement annuel')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Paiements annuels' }));
    expect(await screen.findByText('Nouveau paiement annuel', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Terrain loué — Riviera')).not.toBeInTheDocument();
  }, 20000);

  it('un `?onglet=` inconnu retombe sur le premier onglet, les chantiers rattachés', async () => {
    mountFiche('/tenant/agence-1/finance/baux-terrain/bail-1?onglet=nimporte');

    expect(await screen.findByText('Terrain loué — Riviera', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Nouveau paiement annuel')).not.toBeInTheDocument();
    expect(screen.queryByText('Constater un mois à la main')).not.toBeInTheDocument();
  }, 15000);

  it('pagine les constatations en local : 20 lignes, puis 5 à la page 2', async () => {
    const user = userEvent.setup({ delay: null });
    listLandLeaseAccruals.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) =>
        constatation({ id: `constat-${i + 1}`, periodYear: 2001 + i, periodMonth: 1, amount: 1000 + i })
      )
    );
    mountFiche('/tenant/agence-1/finance/baux-terrain/bail-1?onglet=constatations');

    await screen.findByText('Janvier 2001', {}, { timeout: 8000 });
    expect(document.querySelectorAll('.ant-table-tbody tr.ant-table-row')).toHaveLength(20);
    expect(screen.queryByText('Janvier 2021')).not.toBeInTheDocument();

    await user.click(screen.getByTitle('2'));

    expect(await screen.findByText('Janvier 2021', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(document.querySelectorAll('.ant-table-tbody tr.ant-table-row')).toHaveLength(5);
  }, 30000);
});

describe('Vocabulaire (P-1 du PRD)', () => {
  it('la liste des baux n’affiche jamais « débit » ni « crédit »', async () => {
    listLandLeases.mockResolvedValue([bail()]);
    mountListe();

    await screen.findByText('Terrain de la Riviera, 800 m²', {}, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  });

  it('la fiche du bail n’affiche jamais « débit » ni « crédit »', async () => {
    mountFiche();

    await screen.findByRole('heading', { name: 'Terrain de la Riviera, 800 m²' }, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  });
});
