import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Fournisseurs } from '../../pages/finance/Fournisseurs';
import { BalanceFournisseurs } from '../../pages/finance/BalanceFournisseurs';
import { FactureFournisseur } from '../../pages/finance/FactureFournisseur';
import type {
  ConstructionSite,
  CostCategory,
  Supplier,
  SupplierInvoice,
  SupplierPayment,
  SuppliersBalanceLine
} from '../../types/finance-lot2-types';

/**
 * Fournisseurs, balance fournisseurs et facture fournisseur — les garanties
 * des trois écrans du volet « fournisseurs » du lot 2
 * (`specs/017-finance-fournisseurs-chantiers/spec.md`).
 *
 * Suit le modèle de `__tests__/finance/balances.test.tsx` et
 * `facturation.test.tsx` : un `<QueryClientProvider>` avec `retry: false`, un
 * `<MemoryRouter>` posé sur la route paramétrée, `useBreakpoint` figé en
 * desktop pour obtenir le tableau et rendre `<ConfirmAction>` déterministe
 * (`Popconfirm`, pas le tiroir mobile), et des délais explicites de 8 s sur
 * les `findBy*` pour survivre à la charge parallèle de la suite complète.
 *
 * Le mock de `services/finance-lot2-service` couvre tous les exports que les
 * trois écrans utilisent : Vitest refuse tout import qu'un `vi.mock` ne
 * déclare pas explicitement, là où Jest renvoyait `undefined` en silence
 * (AGENTS.md).
 */

const listSuppliers = vi.fn();
const createSupplier = vi.fn();
const getSuppliersBalance = vi.fn();
const listSupplierInvoices = vi.fn();
const createSupplierInvoice = vi.fn();
const validateSupplierInvoice = vi.fn();
const voidSupplierInvoice = vi.fn();
const createSupplierPayment = vi.fn();
const listSupplierPayments = vi.fn();
const validateSupplierPayment = vi.fn();
const voidSupplierPayment = vi.fn();
const listConstructionSites = vi.fn();
const listCostCategories = vi.fn();

vi.mock('../../services/finance-lot2-service', () => ({
  listSuppliers: (...a: unknown[]) => listSuppliers(...a),
  createSupplier: (...a: unknown[]) => createSupplier(...a),
  getSuppliersBalance: (...a: unknown[]) => getSuppliersBalance(...a),
  listSupplierInvoices: (...a: unknown[]) => listSupplierInvoices(...a),
  createSupplierInvoice: (...a: unknown[]) => createSupplierInvoice(...a),
  validateSupplierInvoice: (...a: unknown[]) => validateSupplierInvoice(...a),
  voidSupplierInvoice: (...a: unknown[]) => voidSupplierInvoice(...a),
  createSupplierPayment: (...a: unknown[]) => createSupplierPayment(...a),
  listSupplierPayments: (...a: unknown[]) => listSupplierPayments(...a),
  validateSupplierPayment: (...a: unknown[]) => validateSupplierPayment(...a),
  voidSupplierPayment: (...a: unknown[]) => voidSupplierPayment(...a),
  listConstructionSites: (...a: unknown[]) => listConstructionSites(...a),
  listCostCategories: (...a: unknown[]) => listCostCategories(...a)
}));

// Permissions de la personne connectée : `null` = aucun filtrage (administrateur).
// Un test qui veut un Comptable sans droit de validation pose un ensemble sans
// `FINANCE_DOCUMENTS_VALIDATE`.
let permissionsDetenues: Set<string> | null = null;
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set<string>(), permissions: permissionsDetenues, ready: true })
}));

// `TreasuryAccountSelector` appelle `listTreasuryAccounts` : sans ce mock, une
// vraie requête réseau partirait depuis le formulaire de règlement.
const listTreasuryAccounts = vi.fn();
vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: (...a: unknown[]) => listTreasuryAccounts(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function fournisseur(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 'frs-01',
    name: 'Matériaux du Bandama SARL',
    kind: 'MATERIALS',
    contactName: 'Ousmane Kouassi',
    contactPhone: '+225 07 22 10 20 30',
    contactEmail: 'contact@materiaux-bandama.ci',
    maintenanceVendorId: null,
    thirdPartyAccountId: 'compte-frs-01',
    isActive: true,
    ...overrides
  };
}

function ligneBalance(overrides: Partial<SuppliersBalanceLine> = {}): SuppliersBalanceLine {
  return {
    accountId: 'compte-frs-01',
    supplierId: 'frs-01',
    label: 'Matériaux du Bandama SARL',
    totalBilled: 2_400_000,
    totalSettled: 1_900_000,
    balance: 500_000,
    currency: 'XOF',
    ...overrides
  };
}

function facture(overrides: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return {
    id: 'fact-01',
    supplierId: 'frs-01',
    supplierLabel: 'Matériaux du Bandama SARL',
    siteId: 'chantier-1',
    siteLabel: 'Chantier Résidence Palmeraie',
    invoiceDate: '2026-07-04',
    reference: 'FRS-2026-0101',
    amount: 2_400_000,
    currency: 'XOF',
    status: 'DRAFT',
    validatedAt: null,
    ...overrides
  };
}

function reglement(overrides: Partial<SupplierPayment> = {}): SupplierPayment {
  return {
    id: 'regl-01',
    supplierId: 'frs-01',
    supplierLabel: 'Matériaux du Bandama SARL',
    paymentDate: '2026-07-10',
    amount: 300_000,
    currency: 'XOF',
    status: 'DRAFT',
    allocations: [],
    ...overrides
  };
}

function chantier(overrides: Partial<ConstructionSite> = {}): ConstructionSite {
  return {
    id: 'chantier-1',
    name: 'Chantier Résidence Palmeraie',
    zone: 'Cocody',
    propertyId: null,
    propertyLabel: null,
    managerLabel: null,
    // Aucun bail de terrain par defaut : c'est le cas courant.
    landLeaseId: null,
    status: 'IN_PROGRESS',
    startDate: '2026-01-01',
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

function poste(overrides: Partial<CostCategory> = {}): CostCategory {
  return { id: 'poste-1', label: 'Gros œuvre', position: 1, isActive: true, ...overrides };
}

/** Sonde d'adresse : révèle l'état de liste porté par l'URL et la navigation. */
function Adresse() {
  const location = useLocation();
  return <span data-testid="adresse">{location.pathname + location.search}</span>;
}

function mountFournisseurs(url = '/tenant/agence-1/finance/fournisseurs') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/finance/fournisseurs" element={<Fournisseurs />} />
            <Route
              path="/tenant/:tenantId/finance/factures-fournisseurs"
              element={<span>factures du fournisseur</span>}
            />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountBalance(url = '/tenant/agence-1/finance/balance-fournisseurs') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/finance/balance-fournisseurs" element={<BalanceFournisseurs />} />
            <Route path="/tenant/:tenantId/finance/comptes/:accountId" element={<span>relevé du compte</span>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountFacture(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/factures-fournisseurs" element={<FactureFournisseur />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function compteTresorerie(overrides: Record<string, unknown> = {}) {
  return {
    id: 'compte-caisse',
    kind: 'CASH',
    label: 'Caisse principale',
    accountNumber: '5711',
    mmOperator: null,
    bankName: null,
    bankAccountRef: null,
    isDefault: true,
    isActive: true,
    balance: 0,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissionsDetenues = null;
  listSupplierPayments.mockResolvedValue([]);
  listTreasuryAccounts.mockResolvedValue([
    compteTresorerie(),
    compteTresorerie({ id: 'compte-banque', kind: 'BANK', label: 'Banque principale', accountNumber: '5211' }),
    compteTresorerie({
      id: 'compte-cheques',
      kind: 'CHECKS_TO_CASH',
      label: 'Chèques à encaisser',
      accountNumber: '513'
    })
  ]);
  listConstructionSites.mockResolvedValue([chantier()]);
  listCostCategories.mockResolvedValue([poste()]);
  listSupplierInvoices.mockResolvedValue([]);
});

describe('Fournisseurs — liste et création', () => {
  it('affiche une ligne par fournisseur, avec sa nature', async () => {
    listSuppliers.mockResolvedValue([
      fournisseur(),
      fournisseur({
        id: 'frs-02',
        name: 'Électricité Générale Bamako',
        kind: 'SERVICES',
        contactName: 'Boubacar Traoré'
      })
    ]);
    mountFournisseurs();

    expect(await screen.findByText('Matériaux du Bandama SARL', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Électricité Générale Bamako')).toBeInTheDocument();
    expect(screen.getByText('Matériaux')).toBeInTheDocument();
    expect(screen.getByText('Prestation')).toBeInTheDocument();
  });

  it('crée un fournisseur depuis le formulaire, avec sa nature', async () => {
    listSuppliers.mockResolvedValue([fournisseur()]);
    createSupplier.mockResolvedValue(fournisseur({ id: 'frs-09', name: 'Nouveau Fournisseur SARL', kind: 'SERVICES' }));
    const user = userEvent.setup({ delay: null });
    mountFournisseurs();

    await screen.findByText('Matériaux du Bandama SARL', {}, { timeout: 8000 });
    // Nom accessible : « plus Nouveau fournisseur » — l'icône décorative du
    // bouton (`PlusOutlined`) porte elle-même un `aria-label`, concaténé au
    // texte visible dans le calcul du nom accessible.
    await user.click(screen.getByRole('button', { name: /Nouveau fournisseur/ }));

    await user.type(await screen.findByLabelText('Raison sociale'), 'Nouveau Fournisseur SARL');

    // La modale ne porte qu'un seul menu déroulant : la nature.
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('Prestation'));

    await user.click(screen.getByRole('button', { name: 'Créer' }));

    await waitFor(() => expect(createSupplier).toHaveBeenCalledTimes(1));
    expect(createSupplier.mock.calls[0][1]).toMatchObject({ name: 'Nouveau Fournisseur SARL', kind: 'SERVICES' });
  });

  it('mène vers les factures du fournisseur cliqué', async () => {
    listSuppliers.mockResolvedValue([fournisseur()]);
    const user = userEvent.setup({ delay: null });
    mountFournisseurs();

    await user.click(await screen.findByRole('button', { name: 'Voir ses factures' }, { timeout: 8000 }));

    expect(screen.getByTestId('adresse')).toHaveTextContent('/tenant/agence-1/finance/factures-fournisseurs');
    expect(screen.getByTestId('adresse')).toHaveTextContent('fournisseur=frs-01');
  });

  it('affiche l’état vide quand aucun fournisseur n’existe', async () => {
    listSuppliers.mockResolvedValue([]);
    mountFournisseurs();

    expect(await screen.findByText('Aucun fournisseur enregistré.', {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    listSuppliers.mockRejectedValue(new Error('boom'));
    mountFournisseurs();

    expect(
      await screen.findByText('Impossible de charger les fournisseurs.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByText('Réessayer')).toBeInTheDocument();
  });
});

describe('Balance fournisseurs', () => {
  it('affiche une ligne par fournisseur, avec le total de contrôle en pied de liste', async () => {
    getSuppliersBalance.mockResolvedValue({
      lines: [
        ligneBalance(),
        ligneBalance({
          accountId: 'compte-frs-02',
          supplierId: 'frs-02',
          label: 'BTP Sahel Construction',
          totalBilled: 5_000_000,
          totalSettled: 2_000_000,
          balance: 3_000_000
        })
      ],
      // 500 000 + 3 000 000 : volontairement distinct de chaque solde de
      // ligne, pour que le total de contrôle reste une valeur unique à
      // l'écran.
      totalBalance: 3_500_000,
      currency: 'XOF'
    });
    mountBalance();

    expect(await screen.findByText('Matériaux du Bandama SARL', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('BTP Sahel Construction')).toBeInTheDocument();
    expect(screen.getByText('Facturé')).toBeInTheDocument();
    expect(screen.getByText('Réglé')).toBeInTheDocument();
    expect(screen.getByText('Total de contrôle')).toBeInTheDocument();
    expect(screen.getByText(/3\s500\s000\sFCFA/)).toBeInTheDocument();
  });

  it('mène au relevé du compte cliqué', async () => {
    getSuppliersBalance.mockResolvedValue({ lines: [ligneBalance()], totalBalance: 0, currency: 'XOF' });
    const user = userEvent.setup({ delay: null });
    mountBalance();

    await user.click(await screen.findByRole('button', { name: 'Voir le relevé' }, { timeout: 8000 }));

    expect(screen.getByTestId('adresse')).toHaveTextContent('/tenant/agence-1/finance/comptes/compte-frs-01');
    expect(await screen.findByText('relevé du compte')).toBeInTheDocument();
  });

  it('affiche l’état vide quand aucun fournisseur n’existe', async () => {
    getSuppliersBalance.mockResolvedValue({ lines: [], totalBalance: 0, currency: 'XOF' });
    mountBalance();

    expect(await screen.findByText('Aucun fournisseur enregistré.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Total de contrôle')).not.toBeInTheDocument();
  });

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    getSuppliersBalance.mockRejectedValue(new Error('boom'));
    mountBalance();

    expect(
      await screen.findByText('Impossible de charger la balance fournisseurs.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
  });
});

describe('Facture fournisseur — rattachement au chantier', () => {
  beforeEach(() => {
    listSuppliers.mockResolvedValue([
      fournisseur({ id: 'frs-01', kind: 'MATERIALS' }),
      fournisseur({ id: 'frs-02', name: 'Électricité Générale Bamako', kind: 'SERVICES' })
    ]);
  });

  it('avertit, avant l’envoi, qu’un chantier est obligatoire pour un fournisseur de matériaux', async () => {
    const user = userEvent.setup({ delay: null });
    mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01');

    await user.type(await screen.findByLabelText('Référence', {}, { timeout: 8000 }), 'FRS-2026-0001');
    await user.type(screen.getByLabelText('Montant de la ligne'), '2400000');

    expect(await screen.findByText('Rattachement à un chantier obligatoire')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer en brouillon' })).toBeDisabled();
  });

  it('n’exige rien pour un fournisseur de prestation', async () => {
    const user = userEvent.setup({ delay: null });
    mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-02');

    await user.type(await screen.findByLabelText('Référence', {}, { timeout: 8000 }), 'FRS-2026-0002');
    await user.type(screen.getByLabelText('Libellé de la ligne'), 'Dépannage électrique');
    await user.type(screen.getByLabelText('Montant de la ligne'), '850000');

    expect(screen.queryByText('Rattachement à un chantier obligatoire')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer en brouillon' })).not.toBeDisabled());
  });
});

describe('Facture fournisseur — quantité et prix unitaire', () => {
  beforeEach(() => {
    listSuppliers.mockResolvedValue([fournisseur({ id: 'frs-01', kind: 'SERVICES' })]);
  });

  it('calcule le montant de la ligne à partir de la quantité et du prix unitaire', async () => {
    const user = userEvent.setup({ delay: null });
    mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01');

    await user.type(await screen.findByLabelText('Référence', {}, { timeout: 8000 }), 'FRS-2026-0010');
    await user.type(screen.getByLabelText('Libellé de la ligne'), 'Ciment CPJ 45');
    await user.type(screen.getByLabelText('Quantité'), '2.5');
    await user.type(screen.getByLabelText('Prix unitaire'), '95000');

    // 2,5 × 95 000 = 237 500, et le champ montant ne se saisit plus.
    const champMontant = screen.getByLabelText('Montant de la ligne');
    await waitFor(() => expect(champMontant).toBeDisabled());
    // Le champ regroupe les milliers pendant la frappe (espace insécable
    // étroite, comme `<MoneyValue>`) : 237500 s'affiche « 237 500 ».
    await waitFor(() => expect(champMontant).toHaveValue('237 500'));
  }, 30000);

  it('laisse le montant saisissable quand ni quantité ni prix unitaire ne sont renseignés', async () => {
    const user = userEvent.setup({ delay: null });
    mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01');

    await user.type(await screen.findByLabelText('Référence', {}, { timeout: 8000 }), 'FRS-2026-0011');
    await user.type(screen.getByLabelText('Libellé de la ligne'), 'Forfait de dépannage');
    await user.type(screen.getByLabelText('Montant de la ligne'), '850000');

    // Le cas d'une prestation : aucune quantité, un montant saisi à la main.
    expect(screen.getByLabelText('Montant de la ligne')).not.toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer en brouillon' })).not.toBeDisabled());
  }, 30000);

  it('transmet la quantité et le prix unitaire au service, à côté du montant', async () => {
    createSupplierInvoice.mockResolvedValue(facture());
    const user = userEvent.setup({ delay: null });
    mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01');

    await user.type(await screen.findByLabelText('Référence', {}, { timeout: 8000 }), 'FRS-2026-0012');
    await user.type(screen.getByLabelText('Libellé de la ligne'), 'Ciment CPJ 45');
    await user.type(screen.getByLabelText('Quantité'), '2.5');
    await user.type(screen.getByLabelText('Prix unitaire'), '95000');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer en brouillon' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Enregistrer en brouillon' }));

    await waitFor(() => expect(createSupplierInvoice).toHaveBeenCalledTimes(1));
    expect(createSupplierInvoice.mock.calls[0][1]).toMatchObject({
      lines: [{ label: 'Ciment CPJ 45', amount: 237_500, quantity: 2.5, unitPrice: 95_000 }]
    });
  }, 30000);
});

describe('Facture fournisseur — écart d’imputation', () => {
  beforeEach(() => {
    listSuppliers.mockResolvedValue([fournisseur({ id: 'frs-01', kind: 'MATERIALS' })]);
  });

  // Le test le plus lourd du fichier : saisie de reference, de libelle, de
  // montant, deux menus deroulants, puis effacement et resaisie du montant
  // impute. Il passe seul, et depasse le delai par defaut sous charge.
  it('affiche l’écart en direct, et bloque l’enregistrement tant qu’il n’est pas nul', async () => {
    const user = userEvent.setup({ delay: null });
    mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01');

    await user.type(await screen.findByLabelText('Référence', {}, { timeout: 8000 }), 'FRS-2026-0001');
    await user.type(screen.getByLabelText('Libellé de la ligne'), 'Ciment et fer à béton');
    await user.type(screen.getByLabelText('Montant de la ligne'), '1000000');

    await user.click(screen.getByRole('button', { name: /Ajouter une imputation/ }));

    // Un seul menu déroulant précède ceux de l'imputation : celui du
    // fournisseur, en haut de l'écran.
    const comboboxes = await screen.findAllByRole('combobox', {}, { timeout: 8000 });
    await user.click(comboboxes[1]);
    await user.click(await screen.findByText('Chantier Résidence Palmeraie'));
    await user.click(screen.getAllByRole('combobox')[2]);
    await user.click(await screen.findByText('Gros œuvre'));

    await user.type(screen.getByLabelText('Montant imputé'), '500000');

    expect(await screen.findByText('Écart de saisie')).toBeInTheDocument();
    expect(screen.getByText(/500\s000\sFCFA/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer en brouillon' })).toBeDisabled();

    await user.clear(screen.getByLabelText('Montant imputé'));
    await user.type(screen.getByLabelText('Montant imputé'), '1000000');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer en brouillon' })).not.toBeDisabled());
  }, 60000);
});

describe('Facture fournisseur — validation et annulation', () => {
  beforeEach(() => {
    listSuppliers.mockResolvedValue([fournisseur({ id: 'frs-01', kind: 'MATERIALS' })]);
  });

  it('présente la validation d’une facture brouillon comme irréversible avant de la confirmer', async () => {
    listSupplierInvoices.mockResolvedValue([facture({ id: 'fact-01', status: 'DRAFT', reference: 'FRS-2026-0101' })]);
    validateSupplierInvoice.mockResolvedValue(
      facture({
        id: 'fact-01',
        status: 'VALIDATED',
        reference: 'FRS-2026-0101',
        validatedAt: '2026-07-05T09:00:00.000Z'
      })
    );
    const user = userEvent.setup({ delay: null });
    mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01');

    await screen.findByText('FRS-2026-0101', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(await screen.findByText(/irréversible/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmer la validation' }));

    await waitFor(() => expect(validateSupplierInvoice).toHaveBeenCalledWith('agence-1', 'fact-01'));
  });

  it('exige un motif avant de confirmer l’annulation d’une facture validée', async () => {
    listSupplierInvoices.mockResolvedValue([
      facture({ id: 'fact-02', status: 'VALIDATED', reference: 'FRS-2026-0102' })
    ]);
    voidSupplierInvoice.mockResolvedValue(facture({ id: 'fact-02', status: 'VOIDED', reference: 'FRS-2026-0102' }));
    const user = userEvent.setup({ delay: null });
    mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01');

    await screen.findByText('FRS-2026-0102', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    const confirmer = await screen.findByRole('button', { name: "Confirmer l'annulation" });
    expect(confirmer).toBeDisabled();

    await user.type(screen.getByLabelText("Motif de l'annulation"), 'Erreur de saisie sur le montant');
    expect(confirmer).not.toBeDisabled();

    await user.click(confirmer);

    await waitFor(() =>
      expect(voidSupplierInvoice).toHaveBeenCalledWith('agence-1', 'fact-02', 'Erreur de saisie sur le montant')
    );
  });
});

describe('Règlement — factures à régler', () => {
  beforeEach(() => {
    listSuppliers.mockResolvedValue([fournisseur({ id: 'frs-01', kind: 'MATERIALS' })]);
  });

  // Recette du 20 septembre 2026 : `FRS-QA-001`, réglée depuis mars, restait
  // proposée au règlement, et un second règlement de 28 000 000 avait été
  // saisi dessus en doublon.
  it('ne propose plus une facture VALIDÉE déjà soldée (reste dû nul)', async () => {
    listSupplierInvoices.mockResolvedValue([
      facture({
        id: 'fact-soldee',
        status: 'VALIDATED',
        reference: 'FRS-QA-001',
        amount: 28_000_000,
        remainingPayable: 0
      })
    ]);
    mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01');

    await screen.findByText('Règlement', {}, { timeout: 8000 });
    expect(
      await screen.findByText('Aucune facture validée pour ce fournisseur : un règlement ici sera un acompte.')
    ).toBeInTheDocument();
    // La facture reste visible dans le TABLEAU des factures (ce n'est pas le
    // sujet ici) ; c'est la section « Factures à régler », elle, qui ne doit
    // plus lui proposer de case à cocher.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  // Nuance explicitement exigée : il reste à payer, la facture doit rester
  // proposée — et l'affectation par défaut doit se plafonner au reste dû,
  // pas au montant total de la facture.
  it('garde une facture VALIDÉE partiellement réglée, affectée par défaut à son reste dû', async () => {
    listSupplierInvoices.mockResolvedValue([
      facture({
        id: 'fact-partielle',
        status: 'VALIDATED',
        reference: 'FRS-2026-0202',
        amount: 1_200_000,
        remainingPayable: 400_000
      })
    ]);
    const user = userEvent.setup({ delay: null });
    mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01');

    await screen.findByText('Règlement', {}, { timeout: 8000 });
    const caseACocher = await screen.findByRole('checkbox', { name: /FRS-2026-0202/ });
    await user.click(caseACocher);

    const champMontant = screen.getByLabelText('Montant affecté à FRS-2026-0202');
    expect(champMontant).toHaveValue('400 000');
  });

  // Un champ absent (ancien cache, mock incomplet) ne doit jamais faire
  // disparaître une dette réelle en silence.
  it('garde une facture VALIDÉE dont le reste dû est inconnu (champ absent)', async () => {
    listSupplierInvoices.mockResolvedValue([
      facture({ id: 'fact-sans-reste', status: 'VALIDATED', reference: 'FRS-2026-0303', amount: 900_000 })
    ]);
    mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01');

    await screen.findByText('Règlement', {}, { timeout: 8000 });
    expect(await screen.findByRole('checkbox', { name: /FRS-2026-0303/ })).toBeInTheDocument();
  });
});

describe('Règlement — acompte sans facture', () => {
  it('n’est pas traité comme une erreur : l’écran l’annonce, il ne le bloque pas', async () => {
    listSuppliers.mockResolvedValue([
      fournisseur({ id: 'frs-04', name: 'Plomberie Moderne Abidjan', kind: 'SERVICES' })
    ]);
    listSupplierInvoices.mockResolvedValue([]); // aucune facture validée pour ce fournisseur
    createSupplierPayment.mockResolvedValue(
      reglement({ id: 'regl-04', supplierId: 'frs-04', supplierLabel: 'Plomberie Moderne Abidjan', amount: 300_000 })
    );
    const user = userEvent.setup({ delay: null });
    mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-04');

    await screen.findByText('Règlement', {}, { timeout: 8000 });
    await user.type(screen.getByLabelText('Montant du règlement'), '300000');

    expect(await screen.findByText('Ce règlement sera enregistré comme acompte')).toBeInTheDocument();
    expect(screen.queryByText(/dépasse le montant/i)).not.toBeInTheDocument();

    // Le mode de règlement est obligatoire depuis le 20 septembre 2026 : le
    // serveur l'exige, et l'écran ne le demandait pas — aucun règlement
    // fournisseur n'était enregistrable. Tant qu'il est vide, le bouton
    // reste inerte, et c'est ce que ce cas épingle avant de le choisir.
    expect(screen.getByRole('button', { name: 'Enregistrer le règlement' })).toBeDisabled();

    await user.click(screen.getByLabelText('Mode de règlement'));
    await user.click(await screen.findByText('Virement bancaire'));

    expect(screen.getByRole('button', { name: 'Enregistrer le règlement' })).not.toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Enregistrer le règlement' }));

    await waitFor(() => expect(createSupplierPayment).toHaveBeenCalledTimes(1));
    expect(createSupplierPayment.mock.calls[0][1]).toMatchObject({
      supplierId: 'frs-04',
      amount: 300_000,
      method: 'BANK_TRANSFER',
      allocations: []
    });
  });
});

describe('Règlement — avertissement avant de valider un règlement déjà soldé', () => {
  // Constat de recette du 20 septembre 2026 : `FRS-QA-001`, déjà soldée,
  // avait reçu un second règlement en doublon. La saisie d'un règlement
  // avant qu'un autre ne solde la même facture est un cas légitime (deux
  // gestionnaires peuvent régler la même facture sans se concerter) : ce
  // règlement doit donc pouvoir se valider quand même — mais pas sans que
  // l'utilisateur en soit averti.
  it('avertit, sans bloquer, quand un règlement en brouillon vise une facture déjà soldée', async () => {
    listSuppliers.mockResolvedValue([fournisseur({ id: 'frs-01', kind: 'MATERIALS' })]);
    listSupplierInvoices.mockResolvedValue([
      facture({
        id: 'fact-deja-soldee',
        status: 'VALIDATED',
        reference: 'FRS-QA-001',
        amount: 28_000_000,
        remainingPayable: 0
      })
    ]);
    const doublon = reglement({
      id: 'regl-doublon',
      supplierId: 'frs-01',
      amount: 28_000_000,
      allocations: [{ invoiceId: 'fact-deja-soldee', invoiceReference: 'FRS-QA-001', amount: 28_000_000 }]
    });
    // Le règlement saisi se relit du serveur : la liste le renvoie après la création.
    createSupplierPayment.mockImplementation(async () => {
      listSupplierPayments.mockResolvedValue([doublon]);
      return doublon;
    });
    const user = userEvent.setup({ delay: null });
    mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01');

    await screen.findByText('Règlement', {}, { timeout: 8000 });
    await user.type(screen.getByLabelText('Montant du règlement'), '28000000');
    await user.click(screen.getByLabelText('Mode de règlement'));
    await user.click(await screen.findByText('Virement bancaire'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer le règlement' }));

    await waitFor(() => expect(createSupplierPayment).toHaveBeenCalledTimes(1));

    // L'alerte est visible directement dans la liste — AVANT tout clic sur
    // « Valider », pas seulement dans la boîte de confirmation.
    expect(await screen.findByText(/Déjà réglée\(s\) ou dépassée\(s\)/)).toBeInTheDocument();

    // Le bouton « Valider » reste actif : un avertissement, pas un refus.
    const boutonValider = screen.getByRole('button', { name: 'Valider' });
    expect(boutonValider).not.toBeDisabled();

    await user.click(boutonValider);
    expect(await screen.findByText(/risque de payer deux fois la même facture/)).toBeInTheDocument();
  });
});

describe('Règlements relus du serveur (BUG-2026-09-29-001)', () => {
  beforeEach(() => {
    listSuppliers.mockResolvedValue([fournisseur({ id: 'frs-01', name: 'BTP Sahel OI', kind: 'SERVICES' })]);
    listSupplierInvoices.mockResolvedValue([]);
  });

  const url = '/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01';

  it('liste, dès le chargement, les règlements saisis par une autre personne, avec statut, mode, compte et acteurs', async () => {
    listSupplierPayments.mockResolvedValue([
      reglement({
        id: 'regl-valide',
        amount: 10_000,
        status: 'VALIDATED',
        method: 'CHECK',
        treasuryLabel: 'Banque principale',
        createdByName: 'Aïcha Comptable',
        validatedByName: 'Awa Konaté'
      }),
      reglement({ id: 'regl-brouillon', amount: 200_000, status: 'DRAFT', method: 'BANK_TRANSFER' }),
      reglement({
        id: 'regl-annule',
        amount: 5_000,
        status: 'VOIDED',
        method: 'CASH',
        voidReason: 'Chèque perdu'
      })
    ]);
    mountFacture(url);

    expect(await screen.findByText('Règlements de BTP Sahel OI', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(listSupplierPayments).toHaveBeenCalledWith('agence-1', 'frs-01');
    // Mode en français, compte de trésorerie, saisisseur et valideur.
    expect(await screen.findByText('Chèque')).toBeInTheDocument();
    expect(screen.getByText('Banque principale')).toBeInTheDocument();
    expect(screen.getByText('Aïcha Comptable')).toBeInTheDocument();
    expect(screen.getByText('Validé par Awa Konaté')).toBeInTheDocument();
    expect(screen.getByText('Virement bancaire')).toBeInTheDocument();
    expect(screen.getByText('Chèque perdu')).toBeInTheDocument();
    // Brouillon : « Valider » ; validé : « Annuler » ; annulé : aucune action.
    expect(screen.getAllByRole('button', { name: 'Valider' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Annuler' })).toHaveLength(1);
  });

  it('annule un règlement validé par une autre personne, avec un motif, puis relit la liste', async () => {
    listSupplierPayments.mockResolvedValue([
      reglement({ id: 'regl-a31c', amount: 10_000, status: 'VALIDATED', method: 'CHECK' })
    ]);
    voidSupplierPayment.mockImplementation(async () => {
      listSupplierPayments.mockResolvedValue([
        reglement({ id: 'regl-a31c', amount: 10_000, status: 'VOIDED', method: 'CHECK', voidReason: 'Erreur' })
      ]);
    });
    const user = userEvent.setup({ delay: null });
    mountFacture(url);

    await user.click(await screen.findByRole('button', { name: 'Annuler' }, { timeout: 8000 }));
    await user.type(await screen.findByLabelText("Motif de l'annulation"), 'Erreur');
    await user.click(screen.getByRole('button', { name: "Confirmer l'annulation" }));

    await waitFor(() => expect(voidSupplierPayment).toHaveBeenCalledWith('agence-1', 'regl-a31c', 'Erreur'));
    await waitFor(() => expect(listSupplierPayments.mock.calls.length).toBeGreaterThan(1));
    expect(await screen.findByText('Annulée', {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('valide un règlement en brouillon saisi ailleurs, puis relit la liste', async () => {
    listSupplierPayments.mockResolvedValue([reglement({ id: 'regl-b', amount: 10_000, status: 'DRAFT' })]);
    validateSupplierPayment.mockResolvedValue(reglement({ id: 'regl-b', status: 'VALIDATED' }));
    const user = userEvent.setup({ delay: null });
    mountFacture(url);

    await user.click(await screen.findByRole('button', { name: 'Valider' }, { timeout: 8000 }));
    await user.click(await screen.findByRole('button', { name: 'Confirmer la validation' }));

    await waitFor(() => expect(validateSupplierPayment).toHaveBeenCalledWith('agence-1', 'regl-b'));
    await waitFor(() => expect(listSupplierPayments.mock.calls.length).toBeGreaterThan(1));
  });

  it('dit pourquoi une validation est refusée (solde insuffisant), avec le message du serveur', async () => {
    listSupplierPayments.mockResolvedValue([reglement({ id: 'regl-c', amount: 200_000, status: 'DRAFT' })]);
    validateSupplierPayment.mockRejectedValue({
      response: { status: 400, data: { message: 'Solde insuffisant sur « Caisse principale »' } }
    });
    const user = userEvent.setup({ delay: null });
    mountFacture(url);

    await user.click(await screen.findByRole('button', { name: 'Valider' }, { timeout: 8000 }));
    await user.click(await screen.findByRole('button', { name: 'Confirmer la validation' }));

    expect(await screen.findByText(/Solde insuffisant sur/)).toBeInTheDocument();
  });
});

describe('Règlement — compte de trésorerie (BUG-2026-09-29-002)', () => {
  beforeEach(() => {
    listSuppliers.mockResolvedValue([fournisseur({ id: 'frs-01', name: 'BTP Sahel OI', kind: 'SERVICES' })]);
  });

  it('propose les comptes qui peuvent PAYER le mode choisi, et envoie le compte retenu', async () => {
    createSupplierPayment.mockResolvedValue(reglement({ id: 'regl-x' }));
    const user = userEvent.setup({ delay: null });
    mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01');

    await screen.findByText('Règlement', {}, { timeout: 8000 });
    await user.type(screen.getByLabelText('Montant du règlement'), '200000');
    await user.click(screen.getByLabelText('Mode de règlement'));
    await user.click(await screen.findByText('Chèque'));

    // Un chèque ÉMIS sort de la banque : ni la caisse, ni les « chèques à encaisser ».
    await user.click(screen.getByLabelText('Compte de trésorerie'));
    expect(await screen.findByText('Banque principale · 5211')).toBeInTheDocument();
    expect(screen.queryByText('Caisse principale · 5711')).not.toBeInTheDocument();
    expect(screen.queryByText('Chèques à encaisser · 513')).not.toBeInTheDocument();
    await user.click(screen.getByText('Banque principale · 5211'));

    await user.click(screen.getByRole('button', { name: 'Enregistrer le règlement' }));

    await waitFor(() => expect(createSupplierPayment).toHaveBeenCalledTimes(1));
    expect(createSupplierPayment.mock.calls[0][1]).toMatchObject({
      method: 'CHECK',
      treasuryAccountId: 'compte-banque'
    });
  });

  it('sans compte choisi, n’en envoie aucun : le serveur prend celui du mode', async () => {
    createSupplierPayment.mockResolvedValue(reglement({ id: 'regl-y' }));
    const user = userEvent.setup({ delay: null });
    mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01');

    await screen.findByText('Règlement', {}, { timeout: 8000 });
    await user.type(screen.getByLabelText('Montant du règlement'), '5000');
    await user.click(screen.getByLabelText('Mode de règlement'));
    await user.click(await screen.findByText('Espèces'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer le règlement' }));

    await waitFor(() => expect(createSupplierPayment).toHaveBeenCalledTimes(1));
    expect(createSupplierPayment.mock.calls[0][1]).toMatchObject({ method: 'CASH', treasuryAccountId: null });
  });
});

describe('Actions réservées aux validateurs (BUG-2026-09-29-006, volet fournisseurs)', () => {
  beforeEach(() => {
    listSuppliers.mockResolvedValue([fournisseur({ id: 'frs-01', name: 'BTP Sahel OI', kind: 'SERVICES' })]);
    listSupplierInvoices.mockResolvedValue([
      facture({ id: 'fact-brouillon', status: 'DRAFT', reference: 'FRS-B-001' }),
      facture({ id: 'fact-validee', status: 'VALIDATED', reference: 'FRS-V-001', remainingPayable: 100 })
    ]);
    listSupplierPayments.mockResolvedValue([
      reglement({ id: 'regl-brouillon', status: 'DRAFT', amount: 1_000 }),
      reglement({ id: 'regl-valide', status: 'VALIDATED', amount: 2_000 })
    ]);
  });

  const url = '/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01';

  it('masque Valider et Annuler (factures et règlements) sans FINANCE_DOCUMENTS_VALIDATE', async () => {
    permissionsDetenues = new Set(['FINANCE_DOCUMENTS_CREATE', 'FINANCE_ACCOUNTS_READ']);
    mountFacture(url);

    await screen.findByText('FRS-B-001', {}, { timeout: 8000 });
    await screen.findByText('Règlements de BTP Sahel OI');
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument();
    // La saisie reste offerte, et « Dupliquer » aussi.
    expect(screen.getByRole('button', { name: 'Enregistrer le règlement' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Dupliquer' }).length).toBeGreaterThan(0);
  });

  it('propose Valider et Annuler à qui détient FINANCE_DOCUMENTS_VALIDATE', async () => {
    permissionsDetenues = new Set(['FINANCE_DOCUMENTS_VALIDATE']);
    mountFacture(url);

    await screen.findByText('FRS-B-001', {}, { timeout: 8000 });
    await screen.findByText('Règlements de BTP Sahel OI');
    // Une facture brouillon + un règlement brouillon ; une facture validée + un règlement validé.
    expect(screen.getAllByRole('button', { name: 'Valider' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Annuler' })).toHaveLength(2);
  });

  it('propose les actions quand la navigation n’est pas filtrée (administrateur d’agence)', async () => {
    permissionsDetenues = null;
    mountFacture(url);

    await screen.findByText('FRS-B-001', {}, { timeout: 8000 });
    expect(await screen.findAllByRole('button', { name: 'Valider' })).toHaveLength(2);
  });

  it('remplace un 403 par un message clair, et non par le texte technique du serveur', async () => {
    permissionsDetenues = null; // les droits ont pu changer depuis le chargement
    validateSupplierInvoice.mockRejectedValue({
      response: {
        status: 403,
        data: { message: 'Forbidden', requiredPermission: 'FINANCE_DOCUMENTS_VALIDATE' }
      }
    });
    const user = userEvent.setup({ delay: null });
    mountFacture(url);

    await screen.findByText('FRS-B-001', {}, { timeout: 8000 });
    const boutons = await screen.findAllByRole('button', { name: 'Valider' });
    await user.click(boutons[0]);
    await user.click(await screen.findByRole('button', { name: 'Confirmer la validation' }));

    expect(await screen.findByText("Vous n'avez pas le droit de valider une facture fournisseur.")).toBeInTheDocument();
  });
});

describe('Vocabulaire — principe P-1 du PRD, étendu par FR-028', () => {
  it('n’affiche jamais « débit » ni « crédit », sur aucun des trois écrans', async () => {
    const motsInterdits = /d[ée]bit|cr[ée]dit/i;

    listSuppliers.mockResolvedValue([
      fournisseur(),
      fournisseur({ id: 'frs-04', name: 'Plomberie Moderne Abidjan', kind: 'SERVICES' })
    ]);
    const { container: c1 } = mountFournisseurs();
    await screen.findByText('Matériaux du Bandama SARL', {}, { timeout: 8000 });
    expect(c1.textContent).not.toMatch(motsInterdits);

    getSuppliersBalance.mockResolvedValue({
      // Un solde négatif — l'acompte qui rend le compte débiteur — est
      // précisément le cas où la tentation d'écrire « crédit » est la plus
      // forte : le test le couvre exprès.
      lines: [
        ligneBalance({ label: 'Plomberie Moderne Abidjan', totalBilled: 0, totalSettled: 300_000, balance: -300_000 })
      ],
      totalBalance: -300_000,
      currency: 'XOF'
    });
    const { container: c2 } = mountBalance();
    await screen.findByText('Plomberie Moderne Abidjan', {}, { timeout: 8000 });
    expect(c2.textContent).not.toMatch(motsInterdits);

    listSupplierInvoices.mockResolvedValue([facture()]);
    const { container: c3 } = mountFacture('/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01');
    await screen.findByText('FRS-2026-0101', {}, { timeout: 8000 });
    expect(c3.textContent).not.toMatch(motsInterdits);
  });
});
