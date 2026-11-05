import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BonsDeCommande } from '../../pages/finance/BonsDeCommande';
import { BonDeCommande } from '../../pages/finance/BonDeCommande';
import type { PurchaseOrder } from '../../types/finance-lot3-types';
import type { ConstructionSite, CostCategory, Supplier } from '../../types/finance-lot2-types';

/**
 * Bons de commande — les garanties de `pages/finance/BonsDeCommande.tsx` (la
 * liste filtrable) et `pages/finance/BonDeCommande.tsx` (saisie, émission,
 * annulation), lot 3 (specs/018-finance-budget-pilotage/data-model.md §5).
 *
 * Modèle exact de `__tests__/finance/fournisseurs.test.tsx` : `useBreakpoint`
 * figé en desktop, un `<MemoryRouter>` posé sur les routes paramétrées
 * exactement telles que cet agent les documente dans son rapport, une sonde
 * `<Adresse>` pour vérifier la navigation, et un mock qui couvre CHAQUE export
 * utilisé (Vitest refuse en silence un import non déclaré, AGENTS.md).
 */

const listPurchaseOrders = vi.fn();
const createPurchaseOrder = vi.fn();
const getPurchaseOrder = vi.fn();
const issuePurchaseOrder = vi.fn();
const cancelPurchaseOrder = vi.fn();

vi.mock('../../services/finance-lot3-service', () => ({
  listPurchaseOrders: (...a: unknown[]) => listPurchaseOrders(...a),
  createPurchaseOrder: (...a: unknown[]) => createPurchaseOrder(...a),
  getPurchaseOrder: (...a: unknown[]) => getPurchaseOrder(...a),
  issuePurchaseOrder: (...a: unknown[]) => issuePurchaseOrder(...a),
  cancelPurchaseOrder: (...a: unknown[]) => cancelPurchaseOrder(...a)
}));

const listConstructionSites = vi.fn();
const listSuppliers = vi.fn();
const defaultListSuppliersPage = async (
  _tenantId: string,
  filters: { search?: string; page?: number; limit?: number } = {}
) => {
  const all = (await listSuppliers()) as Supplier[];
  const filtered = all.filter(item => item.name.toLowerCase().includes((filters.search ?? '').toLowerCase()));
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  return { items: filtered.slice((page - 1) * limit, page * limit), total: filtered.length };
};
const listSuppliersPage = vi.fn(defaultListSuppliersPage);
const getSupplier = vi.fn(async (_tenantId: string, id: string) =>
  ((await listSuppliers()) as Supplier[]).find(item => item.id === id)
);
const listCostCategories = vi.fn();

vi.mock('../../services/finance-lot2-service', () => ({
  listConstructionSites: (...a: unknown[]) => listConstructionSites(...a),
  listSuppliers: (...a: unknown[]) => listSuppliers(...a),
  listSuppliersPage: (...a: unknown[]) =>
    listSuppliersPage(...(a as [string, { search?: string; page?: number; limit?: number }])),
  getSupplier: (...a: unknown[]) => getSupplier(...(a as [string, string])),
  listCostCategories: (...a: unknown[]) => listCostCategories(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function chantier(overrides: Partial<ConstructionSite> = {}): ConstructionSite {
  return {
    id: 'chantier-1',
    name: 'Villa duplex — Angré Centre',
    zone: 'Angré, Cocody',
    propertyId: null,
    propertyLabel: null,
    managerLabel: null,
    // Aucun bail de terrain par defaut : c'est le cas courant.
    landLeaseId: null,
    status: 'IN_PROGRESS',
    startDate: '2026-04-01',
    plannedEndDate: null,
    progressPercent: 40,
    closedAt: null,
    finalCost: null,
    actualCost: 0,
    currency: 'XOF',
    stockEnabledAt: null,
    ...overrides
  };
}

function fournisseur(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 'frs-01',
    name: "Ciments d'Afrique CI",
    kind: 'MATERIALS',
    contactName: 'Ousmane Kouassi',
    contactPhone: '+225 07 22 10 20 30',
    contactEmail: 'contact@ciments-afrique.ci',
    maintenanceVendorId: null,
    thirdPartyAccountId: 'compte-frs-01',
    isActive: true,
    ...overrides
  };
}

function poste(overrides: Partial<CostCategory> = {}): CostCategory {
  return { id: 'poste-gros-oeuvre', label: 'Gros œuvre', position: 1, isActive: true, ...overrides };
}

function bon(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 'bon-1',
    siteId: 'chantier-1',
    siteLabel: 'Villa duplex — Angré Centre',
    supplierId: 'frs-01',
    supplierLabel: "Ciments d'Afrique CI",
    reference: 'BC-2026-0041',
    orderDate: '2026-04-02',
    status: 'DRAFT',
    currency: 'XOF',
    lines: [
      {
        id: 'bon-1-l1',
        costCategoryId: 'poste-gros-oeuvre',
        costCategoryLabel: 'Gros œuvre',
        label: 'Ciment et fer à béton',
        amount: 3_500_000
      }
    ],
    totalAmount: 3_500_000,
    // Délibérément DIFFÉRENT de `totalAmount` : si les deux montants
    // coïncidaient, un test cherchant l'un des deux par le texte affiché
    // trouverait les deux cellules et échouerait sur une ambiguïté qui ne
    // dirait rien du composant lui-même.
    invoicedAmount: 500_000,
    remainingAmount: 3_000_000,
    invoicingState: 'PARTIALLY_INVOICED',
    ...overrides
  };
}

/** Nettoie casse et accents, pour une vérification insensible aux deux. */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Sonde d'adresse : révèle l'état de liste porté par l'URL et la navigation. */
function Adresse() {
  const location = useLocation();
  return <span data-testid="adresse">{location.pathname + location.search}</span>;
}

function mountListe(url = '/tenant/agence-1/finance/bons-de-commande') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/finance/bons-de-commande" element={<BonsDeCommande />} />
            <Route path="/tenant/:tenantId/finance/bons-de-commande/:orderId" element={<span>fiche du bon</span>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountBon(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/finance/bons-de-commande/:orderId" element={<BonDeCommande />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listSuppliersPage.mockImplementation(defaultListSuppliersPage);
  listConstructionSites.mockResolvedValue([chantier()]);
  listSuppliers.mockResolvedValue([fournisseur()]);
  listCostCategories.mockResolvedValue([poste()]);
});

describe('Bons de commande — liste et filtres', () => {
  it('écarte les options de l’ancienne agence si sa réponse arrive après le changement', async () => {
    let finishOld: ((result: { items: Supplier[]; total: number }) => void) | undefined;
    listPurchaseOrders.mockResolvedValue([bon()]);
    listSuppliersPage.mockImplementation((tenant: string) =>
      tenant === 'agence-1'
        ? new Promise<{ items: Supplier[]; total: number }>(resolve => {
            finishOld = resolve;
          })
        : Promise.resolve({ items: [fournisseur({ id: 'frs-new', name: 'Fournisseur nouvelle agence' })], total: 1 })
    );
    function SwitchTenant() {
      const navigate = useNavigate();
      return <button onClick={() => navigate('/tenant/agence-2/finance/bons-de-commande')}>Changer d’agence</button>;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <AntApp>
          <MemoryRouter initialEntries={['/tenant/agence-1/finance/bons-de-commande']}>
            <SwitchTenant />
            <Routes>
              <Route path="/tenant/:tenantId/finance/bons-de-commande" element={<BonsDeCommande />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    );

    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Fournisseur' }));
    await waitFor(() =>
      expect(listSuppliersPage).toHaveBeenCalledWith('agence-1', expect.objectContaining({ page: 1, limit: 20 }))
    );
    await userEvent.click(screen.getByRole('button', { name: 'Changer d’agence' }));
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Fournisseur' }));
    expect(
      await screen.findByText('Fournisseur nouvelle agence', { selector: '.ant-select-item-option-content' })
    ).toBeInTheDocument();
    await act(async () => finishOld?.({ items: [fournisseur({ name: 'Fournisseur ancienne agence' })], total: 1 }));
    expect(screen.queryByText('Fournisseur ancienne agence')).not.toBeInTheDocument();
  });

  it('affiche une ligne par bon, avec le chantier et le fournisseur en libellé', async () => {
    listPurchaseOrders.mockResolvedValue([bon()]);
    mountListe();

    expect(await screen.findByText('BC-2026-0041', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Villa duplex — Angré Centre')).toBeInTheDocument();
    expect(screen.getByText("Ciments d'Afrique CI")).toBeInTheDocument();
    expect(screen.getByText(/3\s500\s000/)).toBeInTheDocument();
  });

  it('ne demande rien de filtré à l’API : la liste arrive en entier et se filtre localement', async () => {
    listPurchaseOrders.mockResolvedValue([bon()]);
    mountListe('/tenant/agence-1/finance/bons-de-commande?siteId=chantier-1&status=DRAFT');

    await screen.findByText('BC-2026-0041', {}, { timeout: 8000 });
    expect(listPurchaseOrders).toHaveBeenCalledWith('agence-1');
  });

  it('affiche l’état vide quand aucun bon n’existe', async () => {
    listPurchaseOrders.mockResolvedValue([]);
    mountListe();

    expect(
      await screen.findByText("Aucun bon de commande n'est encore enregistré.", {}, { timeout: 8000 })
    ).toBeInTheDocument();
  });

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    listPurchaseOrders.mockRejectedValue(new Error('panne'));
    mountListe();

    expect(
      await screen.findByText('Impossible de charger les bons de commande.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('mène vers la fiche du bon cliqué', async () => {
    listPurchaseOrders.mockResolvedValue([bon()]);
    const user = userEvent.setup({ delay: null });
    mountListe();

    await user.click(await screen.findByRole('button', { name: 'Voir le détail' }, { timeout: 8000 }));

    expect(screen.getByTestId('adresse')).toHaveTextContent('/tenant/agence-1/finance/bons-de-commande/bon-1');
    expect(await screen.findByText('fiche du bon')).toBeInTheDocument();
  });

  it('mène vers la saisie d’un nouveau bon', async () => {
    listPurchaseOrders.mockResolvedValue([]);
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText("Aucun bon de commande n'est encore enregistré.", {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Nouveau bon/ })[0]);

    expect(screen.getByTestId('adresse')).toHaveTextContent('/tenant/agence-1/finance/bons-de-commande/nouveau');
  });
});

describe('Bons de commande — recherche locale', () => {
  const T = { timeout: 8000 };
  const PLACEHOLDER = 'Référence, chantier, fournisseur…';

  beforeEach(() => {
    listPurchaseOrders.mockResolvedValue([
      bon(),
      bon({
        id: 'bon-2',
        reference: 'BC-2026-0042',
        siteId: 'chantier-2',
        siteLabel: 'Résidence Les Palmiers',
        supplierId: 'frs-02',
        supplierLabel: 'Quincaillerie du Plateau',
        status: 'ISSUED',
        totalAmount: 800_000,
        remainingAmount: 800_000,
        invoicingState: 'NOT_INVOICED'
      })
    ]);
  });

  /** Lignes de données du tableau (l'en-tête est exclu). */
  const lignes = () => screen.getAllByRole('row').slice(1);

  it('cherche dans la référence, le chantier et le fournisseur sans tenir compte des accents', async () => {
    const user = userEvent.setup({ delay: null });
    mountListe();

    await user.type(await screen.findByPlaceholderText(PLACEHOLDER, {}, T), 'PALMIERS');

    await waitFor(() => expect(screen.queryByText('BC-2026-0041')).not.toBeInTheDocument(), T);
    expect(screen.getByText('BC-2026-0042')).toBeInTheDocument();
    expect(screen.getByTestId('adresse')).toHaveTextContent('q=PALMIERS');
  });

  it('applique le chantier d’une URL partagée (clé `siteId` conservée)', async () => {
    // Une valeur d'URL absente des options du critère est ignorée : le chantier partagé doit exister.
    listConstructionSites.mockResolvedValue([
      chantier(),
      chantier({ id: 'chantier-2', name: 'Résidence Les Palmiers' })
    ]);
    mountListe('/tenant/agence-1/finance/bons-de-commande?siteId=chantier-2');

    expect(await screen.findByText('BC-2026-0042', {}, T)).toBeInTheDocument();
    // Les options arrivent en asynchrone : la liste est d'abord complète, puis filtrée.
    await waitFor(() => expect(screen.queryByText('BC-2026-0041')).not.toBeInTheDocument(), T);
    expect(lignes()).toHaveLength(1);
  });

  it('applique le statut et l’intervalle de montants d’une URL partagée', async () => {
    mountListe('/tenant/agence-1/finance/bons-de-commande?status=ISSUED&montantMin=500000&montantMax=900000');

    expect(await screen.findByText('BC-2026-0042', {}, T)).toBeInTheDocument();
    expect(screen.queryByText('BC-2026-0041')).not.toBeInTheDocument();
  });

  it('« Effacer les critères » ramène toute la liste', async () => {
    const user = userEvent.setup({ delay: null });
    mountListe('/tenant/agence-1/finance/bons-de-commande?q=zzz');

    const barre = await screen.findByRole('search', {}, T);
    await user.click(await within(barre).findByRole('button', { name: 'Effacer les critères' }, T));

    expect(await screen.findByText('BC-2026-0041', {}, T)).toBeInTheDocument();
    expect(lignes()).toHaveLength(2);
    expect(screen.getByTestId('adresse')).not.toHaveTextContent('q=');
  });
});

describe('Bon de commande — saisie', () => {
  it('enregistre un bon en brouillon avec les identifiants choisis, jamais leurs libellés', async () => {
    createPurchaseOrder.mockResolvedValue(bon());
    mountBon('/tenant/agence-1/finance/bons-de-commande/nouveau');

    const comboboxes = await screen.findAllByRole('combobox', {}, { timeout: 8000 });
    fireEvent.mouseDown(comboboxes[0]);
    fireEvent.click(await screen.findByText('Villa duplex — Angré Centre'));
    fireEvent.mouseDown(screen.getAllByRole('combobox')[1]);
    fireEvent.click(await screen.findByText("Ciments d'Afrique CI"));
    fireEvent.mouseDown(screen.getAllByRole('combobox')[2]);
    fireEvent.click(await screen.findByText('Gros œuvre'));

    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    await user.type(screen.getByLabelText('Référence'), 'BC-2026-0041');
    await user.type(screen.getByLabelText('Libellé de la ligne'), 'Ciment et fer à béton');
    await user.type(screen.getByLabelText('Montant de la ligne'), '3500000');

    await user.click(screen.getByRole('button', { name: 'Enregistrer en brouillon' }));

    await waitFor(() => expect(createPurchaseOrder).toHaveBeenCalledTimes(1));
    expect(createPurchaseOrder.mock.calls[0][1]).toMatchObject({
      siteId: 'chantier-1',
      supplierId: 'frs-01',
      reference: 'BC-2026-0041',
      lines: [{ costCategoryId: 'poste-gros-oeuvre', label: 'Ciment et fer à béton', amount: 3_500_000 }]
    });
  }, 30000);

  it('préremplit le chantier depuis `?chantierId=`, par son identifiant', async () => {
    createPurchaseOrder.mockResolvedValue(bon());
    mountBon('/tenant/agence-1/finance/bons-de-commande/nouveau?chantierId=chantier-1');

    await screen.findByText('Nouveau bon de commande', {}, { timeout: 8000 });
    // Le chantier prérempli se lit dans le combobox : son libellé y apparaît
    // une fois les référentiels chargés.
    expect(await screen.findByText('Villa duplex — Angré Centre', {}, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('Bon de commande — quantité et prix unitaire', () => {
  it('calcule le montant de la ligne, verrouille son champ, et transmet les trois valeurs', async () => {
    createPurchaseOrder.mockResolvedValue(bon());
    mountBon('/tenant/agence-1/finance/bons-de-commande/nouveau');

    const comboboxes = await screen.findAllByRole('combobox', {}, { timeout: 8000 });
    fireEvent.mouseDown(comboboxes[0]);
    fireEvent.click(await screen.findByText('Villa duplex — Angré Centre'));
    fireEvent.mouseDown(screen.getAllByRole('combobox')[1]);
    fireEvent.click(await screen.findByText("Ciments d'Afrique CI"));
    fireEvent.mouseDown(screen.getAllByRole('combobox')[2]);
    fireEvent.click(await screen.findByText('Gros œuvre'));

    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    await user.type(screen.getByLabelText('Référence'), 'BC-2026-0042');
    await user.type(screen.getByLabelText('Libellé de la ligne'), 'Ciment CPJ 45');
    await user.type(screen.getByLabelText('Quantité'), '40');
    await user.type(screen.getByLabelText('Prix unitaire'), '87500');

    // 40 × 87 500 = 3 500 000, et le montant n'est plus à la main.
    const champMontant = screen.getByLabelText('Montant de la ligne');
    await waitFor(() => expect(champMontant).toBeDisabled());
    // Le champ regroupe les milliers pendant la frappe (espace insécable
    // étroite, comme `<MoneyValue>`) : 3500000 s'affiche « 3 500 000 ».
    await waitFor(() => expect(champMontant).toHaveValue('3 500 000'));

    await user.click(screen.getByRole('button', { name: 'Enregistrer en brouillon' }));

    await waitFor(() => expect(createPurchaseOrder).toHaveBeenCalledTimes(1));
    expect(createPurchaseOrder.mock.calls[0][1]).toMatchObject({
      lines: [
        {
          costCategoryId: 'poste-gros-oeuvre',
          label: 'Ciment CPJ 45',
          amount: 3_500_000,
          quantity: 40,
          unitPrice: 87_500
        }
      ]
    });
  }, 30000);

  it('laisse le montant saisissable tant que la quantité ou le prix unitaire manque', async () => {
    mountBon('/tenant/agence-1/finance/bons-de-commande/nouveau');

    await screen.findByText('Nouveau bon de commande', {}, { timeout: 8000 });
    expect(screen.getByLabelText('Montant de la ligne')).not.toBeDisabled();

    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    // Une seule des deux valeurs : le forfait reste saisissable au montant.
    await user.type(screen.getByLabelText('Quantité'), '40');
    expect(screen.getByLabelText('Montant de la ligne')).not.toBeDisabled();
  }, 30000);

  it('affiche la quantité et le prix unitaire des lignes du bon quand elles en portent', async () => {
    getPurchaseOrder.mockResolvedValue(
      bon({
        lines: [
          {
            id: 'bon-1-l1',
            costCategoryId: 'poste-gros-oeuvre',
            costCategoryLabel: 'Gros œuvre',
            label: 'Ciment et fer à béton',
            amount: 3_500_000,
            quantity: 40,
            unitPrice: 87_500
          }
        ]
      })
    );
    mountBon('/tenant/agence-1/finance/bons-de-commande/bon-1');

    await screen.findByText('Lignes du bon', {}, { timeout: 8000 });
    expect(screen.getByRole('columnheader', { name: 'Quantité' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Prix unitaire' })).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText(/87\s500/)).toBeInTheDocument();
  }, 30000);

  it('plafonne les lignes du bon à 50 par page (pagination locale)', async () => {
    getPurchaseOrder.mockResolvedValue(
      bon({
        lines: Array.from({ length: 55 }, (_, i) => ({
          id: `bon-1-l${i + 1}`,
          costCategoryId: 'poste-gros-oeuvre',
          costCategoryLabel: 'Gros œuvre',
          label: `Ligne ${String(i + 1).padStart(2, '0')}`,
          amount: 1_000
        }))
      })
    );
    mountBon('/tenant/agence-1/finance/bons-de-commande/bon-1');

    expect(await screen.findByText('Ligne 01', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Ligne 50')).toBeInTheDocument();
    expect(screen.queryByText('Ligne 51')).not.toBeInTheDocument();
  }, 30000);
});

describe('Bon de commande — émission et annulation', () => {
  it('avertit avant d’émettre, puis appelle le service seulement après confirmation', async () => {
    getPurchaseOrder.mockResolvedValue(bon({ status: 'DRAFT' }));
    issuePurchaseOrder.mockResolvedValue(bon({ status: 'ISSUED' }));
    const user = userEvent.setup({ delay: null });
    mountBon('/tenant/agence-1/finance/bons-de-commande/bon-1');

    await screen.findByRole('button', { name: /Émettre le bon/ }, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: /Émettre le bon/ }));

    expect(await screen.findByText(/irréversible/i)).toBeInTheDocument();
    expect(issuePurchaseOrder).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: "Confirmer l'émission" }));

    await waitFor(() => expect(issuePurchaseOrder).toHaveBeenCalledWith('agence-1', 'bon-1'));
  });

  it('avertit avant d’annuler, puis appelle le service seulement après confirmation', async () => {
    getPurchaseOrder.mockResolvedValue(bon({ status: 'ISSUED' }));
    cancelPurchaseOrder.mockResolvedValue(bon({ status: 'CANCELLED' }));
    const user = userEvent.setup({ delay: null });
    mountBon('/tenant/agence-1/finance/bons-de-commande/bon-1');

    await screen.findByRole('button', { name: 'Annuler le bon' }, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Annuler le bon' }));

    expect(await screen.findByText(/irréversible/i)).toBeInTheDocument();
    expect(cancelPurchaseOrder).not.toHaveBeenCalled();

    // Le motif est obligatoire : le serveur l'exige, et une annulation
    // irréversible qui n'est pas tracée est un trou d'audit. Tant qu'il est
    // vide, la validation ne part pas — c'est ce que ce cas épingle depuis
    // le 20 septembre 2026, où l'écran n'en demandait aucun et où chaque
    // annulation repartait en 400 sans que rien ne bouge à l'écran.
    await user.click(screen.getByRole('button', { name: "Confirmer l'annulation" }));
    expect(cancelPurchaseOrder).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Motif de l'annulation"), 'Commande passée en double');
    await user.click(screen.getByRole('button', { name: "Confirmer l'annulation" }));

    await waitFor(() =>
      expect(cancelPurchaseOrder).toHaveBeenCalledWith('agence-1', 'bon-1', 'Commande passée en double')
    );
  });

  it('n’offre aucune action sur un bon annulé', async () => {
    getPurchaseOrder.mockResolvedValue(bon({ status: 'CANCELLED' }));
    mountBon('/tenant/agence-1/finance/bons-de-commande/bon-1');

    // Le titre, jamais le fil d'Ariane : les deux affichent la même
    // référence du bon.
    await screen.findByRole('heading', { name: 'BC-2026-0041' }, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: /Émettre le bon/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annuler le bon' })).not.toBeInTheDocument();
  });
});

describe('Vocabulaire — principe P-1 du PRD', () => {
  it('n’affiche jamais « débit » ni « crédit », ni sur la liste ni sur la fiche', async () => {
    listPurchaseOrders.mockResolvedValue([bon()]);
    const { container: c1 } = mountListe();
    await screen.findByText('BC-2026-0041', {}, { timeout: 8000 });
    expect(normaliser(c1.textContent ?? '')).not.toMatch(/\bdebit\b/);
    expect(normaliser(c1.textContent ?? '')).not.toMatch(/\bcredit\b/);

    getPurchaseOrder.mockResolvedValue(bon({ status: 'ISSUED' }));
    const { container: c2 } = mountBon('/tenant/agence-1/finance/bons-de-commande/bon-1');
    await screen.findByRole('heading', { name: 'BC-2026-0041' }, { timeout: 8000 });
    expect(normaliser(c2.textContent ?? '')).not.toMatch(/\bdebit\b/);
    expect(normaliser(c2.textContent ?? '')).not.toMatch(/\bcredit\b/);
  });
});
