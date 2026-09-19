import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
    name: 'Villa duplex — Kipé Centre',
    zone: 'Kipé, Ratoma',
    propertyId: 'bien-1',
    propertyLabel: 'Villa duplex — Kipé Centre (en construction)',
    managerLabel: 'Mamadou Bah',
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
    siteLabel: 'Villa duplex — Kipé Centre',
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

function mountListe(url = '/tenant/agence-1/finance/chantiers') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
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
          <Routes>
            <Route path="/tenant/:tenantId/finance/chantiers/:siteId" element={<ChantierDetail />} />
            <Route path="/tenant/:tenantId/finance/caisse" element={<span>pièce de caisse</span>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountCaisse(url = '/tenant/agence-1/finance/caisse') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/caisse" element={<PieceDeCaisse />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listProperties.mockResolvedValue({
    properties: [{ id: 'bien-1', title: 'Villa duplex — Kipé Centre (en construction)' }],
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

    expect(await screen.findByText('Villa duplex — Kipé Centre', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/4\s450\s000\sFCFA/)).toBeInTheDocument();
    expect(screen.getByText('Mamadou Bah')).toBeInTheDocument();
  });

  it('crée un chantier sans bien préexistant : le bien reste facultatif', async () => {
    listConstructionSites.mockResolvedValue([]);
    createConstructionSite.mockResolvedValue(
      chantier({ id: 'nouveau', name: 'Terrain loué — Nongo', propertyId: null })
    );
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText("Aucun chantier n'est encore enregistré.", {}, { timeout: 8000 });

    const boutons = screen.getAllByRole('button', { name: 'Nouveau chantier' });
    await user.click(boutons[0]);

    const champNom = await screen.findByLabelText('Nom du chantier');
    await user.type(champNom, 'Terrain loué — Nongo');

    await user.click(screen.getByRole('button', { name: 'Créer le chantier' }));

    await waitFor(() => expect(createConstructionSite).toHaveBeenCalledTimes(1));
    const [, params] = createConstructionSite.mock.calls[0];
    expect(params).toMatchObject({ name: 'Terrain loué — Nongo' });
    // Le point du récit : aucun bien n'est exigé, et aucun n'a été choisi.
    expect(params.propertyId).toBeUndefined();
  });

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    listConstructionSites.mockRejectedValue(new Error('panne'));
    mountListe();

    expect(await screen.findByText('Impossible de charger les chantiers.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('n’offre aucun champ pour saisir le coût réel', async () => {
    listConstructionSites.mockResolvedValue([chantier()]);
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText('Villa duplex — Kipé Centre', {}, { timeout: 8000 });
    // Le bouton porte une icône : son nom accessible est « plus Nouveau chantier ».
    await user.click(screen.getAllByRole('button', { name: /Nouveau chantier/ })[0]);
    await screen.findByLabelText('Nom du chantier');

    expect(screen.queryByLabelText(/coût réel/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /coût/i })).not.toBeInTheDocument();
  });
});

describe('Détail d’un chantier', () => {
  it('affiche les sous-totaux par poste et le coût réel, sans jamais les recalculer à l’écran', async () => {
    getSiteDetail.mockResolvedValue(detail());
    mountDetail();

    // Le nom du chantier apparaît à la fois dans le fil d'Ariane et dans le
    // titre : on cible le titre pour lever l'ambiguïté.
    expect(
      await screen.findByRole('heading', { name: 'Villa duplex — Kipé Centre' }, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByText('Sous-totaux par poste')).toBeInTheDocument();
    // Les sous-totaux (4 000 000 et 1 500 000) sont la somme des DEUX
    // imputations de chaque poste — jamais recalculés ici, ils viennent tels
    // quels de `SiteDetail.byCostCategory`.
    expect(screen.getByText(/4\s000\s000\sFCFA/)).toBeInTheDocument();
    expect(screen.getByText(/1\s500\s000\sFCFA/)).toBeInTheDocument();
    // Le coût réel affiché dans l'en-tête est celui du serveur (4 450 000),
    // jamais une somme recalculée en local.
    expect(screen.getByText(/4\s450\s000\sFCFA/)).toBeInTheDocument();
  });

  it('affiche un libellé lisible pour chaque pièce d’origine, jamais son identifiant', async () => {
    getSiteDetail.mockResolvedValue(detail());
    mountDetail();

    await screen.findByRole('heading', { name: 'Villa duplex — Kipé Centre' }, { timeout: 8000 });

    expect(screen.getByText("Facture FC-2026-0141 — Ciments d'Afrique CI")).toBeInTheDocument();
    expect(screen.getByText('Pièce de caisse 2026-0032 — Salaire équipe maçons')).toBeInTheDocument();
    expect(screen.queryByText('facture-secrete-01')).not.toBeInTheDocument();
    expect(screen.queryByText('piece-caisse-secrete-01')).not.toBeInTheDocument();
  });

  it('n’offre aucun champ pour saisir ou corriger le coût réel', async () => {
    getSiteDetail.mockResolvedValue(detail());
    mountDetail();

    await screen.findByRole('heading', { name: 'Villa duplex — Kipé Centre' }, { timeout: 8000 });

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /coût/i })).not.toBeInTheDocument();
  });

  it('affiche un état vide sans imputation, sans que ce soit une panne', async () => {
    getSiteDetail.mockResolvedValue(detail({ allocations: [], byCostCategory: [] }));
    mountDetail();

    expect(
      await screen.findAllByText('Aucune imputation n’a encore été enregistrée sur ce chantier.', {}, { timeout: 8000 })
    ).toHaveLength(2);
  });

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    getSiteDetail.mockRejectedValue(new Error('panne'));
    mountDetail();

    expect(await screen.findByText('Impossible de charger ce chantier.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
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
    fireEvent.click(await screen.findByText('Villa duplex — Kipé Centre'));

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

    await screen.findByText('Villa duplex — Kipé Centre', {}, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  }, 15000);

  it('le détail d’un chantier n’affiche jamais « débit » ni « crédit »', async () => {
    getSiteDetail.mockResolvedValue(detail());
    mountDetail();

    await screen.findByRole('heading', { name: 'Villa duplex — Kipé Centre' }, { timeout: 8000 });
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
    await user.click(await screen.findByText('Villa duplex — Kipé Centre'));
    await user.click(screen.getAllByRole('combobox')[1]);
    await user.click(await screen.findByText("Main-d'œuvre"));
    await user.type(screen.getByLabelText('Bénéficiaire'), 'Sékou Traoré');
    await user.type(screen.getByLabelText('Montant (FCFA)'), '450000');
    await user.type(screen.getByLabelText('Motif'), 'Salaire équipe finitions');
    await user.click(screen.getByRole('button', { name: /Émettre la pièce/ }));
    await screen.findByText('Pièce à valider — Sékou Traoré', {}, { timeout: 8000 });
  }
});
