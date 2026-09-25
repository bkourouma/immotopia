import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { BonsDeCommande } from '../../pages/finance/BonsDeCommande';
import { BonDeCommande } from '../../pages/finance/BonDeCommande';
import { PieceDeCaisse } from '../../pages/finance/PieceDeCaisse';
import { FactureFournisseur } from '../../pages/finance/FactureFournisseur';
import type { PurchaseOrder } from '../../types/finance-lot3-types';
import type {
  CashVoucher,
  ConstructionSite,
  CostCategory,
  Supplier,
  SupplierInvoice,
  SupplierInvoiceDetail
} from '../../types/finance-lot2-types';

/**
 * Dupliquer une pièce financière — les garanties communes aux trois écrans
 * concernés : bon de commande, pièce de caisse, facture fournisseur.
 *
 * Un fichier pour les trois, parce que c'est UNE règle qui traverse trois
 * écrans, et qu'elle doit y tenir de la même façon :
 *
 * 1. le formulaire de saisie porte bien les valeurs de l'originale ;
 * 2. la référence de la copie est **vide** (là où il y en a une) et la date
 *    est celle **du jour** ;
 * 3. **aucun appel d'écriture ne part** : dupliquer pré-remplit, ne crée rien.
 *
 * Chaque cas duplique délibérément une pièce **annulée** : c'est le cas
 * d'usage le plus courant — on annule pour ressaisir — et rien ne doit le
 * bloquer.
 *
 * Modèle exact de `__tests__/finance/bons-de-commande.test.tsx` et
 * `chantiers.test.tsx` : `useBreakpoint` figé en desktop, des délais `findBy*`
 * de 8 s pour tenir sous la charge parallèle de la suite, `fireEvent` plutôt
 * que `userEvent` pour piloter un `<Select>` d'AntD (qui s'ouvre sur
 * `mousedown`), et un mock couvrant CHAQUE export utilisé par les écrans
 * montés — Vitest refuse en silence un import non déclaré (AGENTS.md).
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
const listCostCategories = vi.fn();
const listSuppliers = vi.fn();
const listSupplierInvoices = vi.fn();
const getSupplierInvoice = vi.fn();
const createSupplierInvoice = vi.fn();
const validateSupplierInvoice = vi.fn();
const voidSupplierInvoice = vi.fn();
const createSupplierPayment = vi.fn();
const validateSupplierPayment = vi.fn();
const voidSupplierPayment = vi.fn();
const createCashVoucher = vi.fn();
const validateCashVoucher = vi.fn();
const voidCashVoucher = vi.fn();
const getCashVoucherPdfUrl = vi.fn();

vi.mock('../../services/finance-lot2-service', () => ({
  listConstructionSites: (...a: unknown[]) => listConstructionSites(...a),
  listCostCategories: (...a: unknown[]) => listCostCategories(...a),
  listSuppliers: (...a: unknown[]) => listSuppliers(...a),
  listSupplierInvoices: (...a: unknown[]) => listSupplierInvoices(...a),
  getSupplierInvoice: (...a: unknown[]) => getSupplierInvoice(...a),
  createSupplierInvoice: (...a: unknown[]) => createSupplierInvoice(...a),
  validateSupplierInvoice: (...a: unknown[]) => validateSupplierInvoice(...a),
  voidSupplierInvoice: (...a: unknown[]) => voidSupplierInvoice(...a),
  createSupplierPayment: (...a: unknown[]) => createSupplierPayment(...a),
  validateSupplierPayment: (...a: unknown[]) => validateSupplierPayment(...a),
  voidSupplierPayment: (...a: unknown[]) => voidSupplierPayment(...a),
  createCashVoucher: (...a: unknown[]) => createCashVoucher(...a),
  validateCashVoucher: (...a: unknown[]) => validateCashVoucher(...a),
  voidCashVoucher: (...a: unknown[]) => voidCashVoucher(...a),
  getCashVoucherPdfUrl: (...a: unknown[]) => getCashVoucherPdfUrl(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const AUJOURD_HUI = dayjs().format('DD/MM/YYYY');

function chantier(overrides: Partial<ConstructionSite> = {}): ConstructionSite {
  return {
    id: 'chantier-1',
    name: 'Villa duplex — Angré Centre',
    zone: 'Angré, Cocody',
    propertyId: null,
    propertyLabel: null,
    managerLabel: null,
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

const POSTE_GROS_OEUVRE: CostCategory = { id: 'poste-gros-oeuvre', label: 'Gros œuvre', position: 1, isActive: true };
const POSTE_MAIN_OEUVRE: CostCategory = {
  id: 'poste-main-oeuvre',
  label: "Main-d'œuvre",
  position: 5,
  isActive: true
};

/** Un bon ANNULÉ, à deux lignes, dont l'une porte quantité et prix unitaire. */
function bonAnnule(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 'bon-1',
    siteId: 'chantier-1',
    siteLabel: 'Villa duplex — Angré Centre',
    supplierId: 'frs-01',
    supplierLabel: "Ciments d'Afrique CI",
    reference: 'BC-2026-0041',
    orderDate: '2026-04-02',
    status: 'CANCELLED',
    currency: 'XOF',
    lines: [
      {
        id: 'bon-1-l1',
        costCategoryId: 'poste-gros-oeuvre',
        costCategoryLabel: 'Gros œuvre',
        label: 'Ciment CPJ 45',
        amount: 3_500_000,
        quantity: 40,
        unitPrice: 87_500
      },
      {
        id: 'bon-1-l2',
        costCategoryId: 'poste-main-oeuvre',
        costCategoryLabel: "Main-d'œuvre",
        label: 'Forfait de pose',
        amount: 250_000,
        quantity: null,
        unitPrice: null
      }
    ],
    totalAmount: 3_750_000,
    invoicedAmount: 500_000,
    remainingAmount: 3_250_000,
    invoicingState: 'PARTIALLY_INVOICED',
    ...overrides
  };
}

/** Une pièce de caisse ANNULÉE, telle que le serveur la renvoie. */
function pieceAnnulee(overrides: Partial<CashVoucher> = {}): CashVoucher {
  return {
    id: 'caisse-1',
    number: '2026-0007',
    siteId: 'chantier-1',
    siteLabel: 'Villa duplex — Angré Centre',
    costCategoryId: 'poste-main-oeuvre',
    costCategoryLabel: "Main-d'œuvre",
    beneficiary: 'Adama Diarra',
    amount: 125_000,
    currency: 'XOF',
    voucherDate: '2026-04-02',
    reason: 'Location de coffrage',
    status: 'VOIDED',
    validatedAt: '2026-04-02T10:00:00.000Z',
    ...overrides
  };
}

/** Une facture ANNULÉE, telle que la LISTE la rend : sans lignes ni imputations. */
function factureAnnulee(overrides: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return {
    id: 'fact-01',
    supplierId: 'frs-01',
    supplierLabel: "Ciments d'Afrique CI",
    siteId: 'chantier-1',
    siteLabel: 'Villa duplex — Angré Centre',
    invoiceDate: '2026-07-04',
    reference: 'FRS-2026-0101',
    amount: 2_400_000,
    currency: 'XOF',
    status: 'VOIDED',
    validatedAt: '2026-07-05T09:00:00.000Z',
    ...overrides
  };
}

/** Le DÉTAIL de cette facture : lui seul porte les lignes et les imputations. */
function detailFacture(overrides: Partial<SupplierInvoiceDetail> = {}): SupplierInvoiceDetail {
  return {
    id: 'fact-01',
    supplierId: 'frs-01',
    siteId: 'chantier-1',
    invoiceDate: '2026-07-04',
    reference: 'FRS-2026-0101',
    amount: 2_400_000,
    currency: 'XOF',
    status: 'VOIDED',
    validatedAt: '2026-07-05T09:00:00.000Z',
    lines: [
      { id: 'l1', label: 'Ciment CPJ 45', amount: 1_500_000, quantity: 20, unitPrice: 75_000 },
      { id: 'l2', label: 'Forfait de pose', amount: 900_000, quantity: null, unitPrice: null }
    ],
    allocations: [
      { id: 'a1', siteId: 'chantier-1', costCategoryId: 'poste-gros-oeuvre', amount: 1_500_000 },
      { id: 'a2', siteId: 'chantier-1', costCategoryId: 'poste-main-oeuvre', amount: 900_000 }
    ],
    ...overrides
  };
}

function nouveauClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function monterBons(url = '/tenant/agence-1/finance/bons-de-commande') {
  return render(
    <QueryClientProvider client={nouveauClient()}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/bons-de-commande" element={<BonsDeCommande />} />
            <Route path="/tenant/:tenantId/finance/bons-de-commande/:orderId" element={<BonDeCommande />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function monterCaisse() {
  return render(
    <QueryClientProvider client={nouveauClient()}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/finance/pieces-de-caisse']}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/pieces-de-caisse" element={<PieceDeCaisse />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function monterFactures() {
  return render(
    <QueryClientProvider client={nouveauClient()}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/finance/factures-fournisseurs?fournisseur=frs-01']}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/factures-fournisseurs" element={<FactureFournisseur />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

/**
 * Les libellés affichés par les menus déroulants de l'écran.
 *
 * On lit le texte du `.ant-select` lui-même : à partir d'Ant Design v6, la
 * valeur choisie n'est plus portée par l'`<input>` (qui reste vide, il ne sert
 * qu'à la recherche), et il n'y a donc rien à interroger par `toHaveValue`.
 */
function valeursChoisies(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.ant-select')).map(el => el.textContent ?? '');
}

/**
 * Un montant tel que le champ de saisie l'affiche.
 *
 * `montantSaisiProps` regroupe les milliers avec la même primitive `Intl` que
 * `<MoneyValue>` : en français, une espace insécable ÉTROITE (U+202F),
 * invisible à la relecture mais bien réelle. On la fabrique plutôt que de
 * l'écrire à la main, pour qu'une comparaison n'échoue pas sur un caractère
 * qu'on ne voit pas.
 */
function montantAffiche(valeur: number): string {
  return valeur.toLocaleString('fr-FR');
}

beforeEach(() => {
  vi.clearAllMocks();
  listConstructionSites.mockResolvedValue([chantier()]);
  listSuppliers.mockResolvedValue([fournisseur()]);
  listCostCategories.mockResolvedValue([POSTE_GROS_OEUVRE, POSTE_MAIN_OEUVRE]);
  listSupplierInvoices.mockResolvedValue([]);
  listPurchaseOrders.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// a) Bon de commande
// ---------------------------------------------------------------------------

describe('Dupliquer — bon de commande', () => {
  it('pré-remplit la saisie depuis un bon annulé, référence vide et date du jour, sans rien créer', async () => {
    listPurchaseOrders.mockResolvedValue([bonAnnule()]);
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    const { container } = monterBons();

    await screen.findByText('BC-2026-0041', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Dupliquer' }));

    // On est bien sur la SAISIE, pas sur une fiche.
    expect(await screen.findByText('Nouveau bon de commande', {}, { timeout: 8000 })).toBeInTheDocument();

    // Règle 2 : la référence de la copie est vide, et son champ a le focus.
    const champReference = screen.getByLabelText('Référence');
    expect(champReference).toHaveValue('');
    await waitFor(() => expect(champReference).toHaveFocus());

    // Règle 3 : la date est celle du jour, jamais le 02/04/2026 de l'originale.
    expect(screen.getByLabelText('Date')).toHaveValue(AUJOURD_HUI);

    // Chantier et fournisseur repris, par leur libellé affiché.
    await waitFor(() =>
      expect(valeursChoisies(container)).toEqual(
        expect.arrayContaining(['Villa duplex — Angré Centre', "Ciments d'Afrique CI"])
      )
    );

    // Les DEUX lignes, avec poste, libellé, quantité et prix unitaire.
    const libelles = screen.getAllByLabelText('Libellé de la ligne');
    expect(libelles).toHaveLength(2);
    expect(libelles[0]).toHaveValue('Ciment CPJ 45');
    expect(libelles[1]).toHaveValue('Forfait de pose');
    expect(valeursChoisies(container)).toEqual(expect.arrayContaining(['Gros œuvre', "Main-d'œuvre"]));

    const quantites = screen.getAllByLabelText('Quantité');
    expect(quantites[0]).toHaveValue('40');
    // La ligne au forfait n'invente pas de quantité.
    expect(quantites[1]).toHaveValue('');
    expect(screen.getAllByLabelText('Prix unitaire')[0]).toHaveValue(montantAffiche(87500));
    const montants = screen.getAllByLabelText('Montant de la ligne');
    expect(montants[0]).toHaveValue(montantAffiche(3500000));
    expect(montants[1]).toHaveValue(montantAffiche(250000));

    // Le pré-remplissage se dit, il ne se devine pas — et le gabarit
    // `{{reference}}` ne doit pas rester visible, faute de valeur interpolée.
    expect(
      await screen.findByText(/Formulaire pré-rempli d'après le bon BC-2026-0041/, {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument();

    // Et surtout : RIEN n'a été écrit.
    expect(createPurchaseOrder).not.toHaveBeenCalled();
    expect(issuePurchaseOrder).not.toHaveBeenCalled();
    expect(cancelPurchaseOrder).not.toHaveBeenCalled();
  }, 30000);
});

// ---------------------------------------------------------------------------
// b) Pièce de caisse
// ---------------------------------------------------------------------------

describe('Dupliquer — pièce de caisse', () => {
  it('reprend la pièce affichée dans le formulaire, date du jour, sans rien créer', async () => {
    // La pièce renvoyée par le serveur diffère volontairement de ce qui vient
    // d'être tapé : c'est bien d'ELLE que la copie doit repartir, et non des
    // restes de la saisie précédente.
    createCashVoucher.mockResolvedValue(pieceAnnulee());
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    const { container } = monterCaisse();

    const listes = await screen.findAllByRole('combobox', {}, { timeout: 8000 });
    fireEvent.mouseDown(listes[0]);
    fireEvent.click(await screen.findByText('Villa duplex — Angré Centre'));
    fireEvent.mouseDown(screen.getAllByRole('combobox')[1]);
    fireEvent.click(await screen.findByText('Gros œuvre'));

    await user.type(screen.getByLabelText('Bénéficiaire'), 'Sékou Traoré');
    await user.type(screen.getByLabelText('Montant (FCFA)'), '450000');
    await user.type(screen.getByLabelText('Motif'), 'Salaire équipe finitions');
    await user.click(screen.getByRole('button', { name: /Émettre la pièce/ }));

    await waitFor(() => expect(createCashVoucher).toHaveBeenCalledTimes(1));
    await screen.findByRole('button', { name: /Émettre une nouvelle pièce/ }, { timeout: 8000 });

    await user.click(screen.getByRole('button', { name: /Dupliquer/ }));

    // Le formulaire porte les valeurs de la pièce, pas celles qui avaient
    // été tapées avant l'émission.
    await waitFor(() => expect(screen.getByLabelText('Bénéficiaire')).toHaveValue('Adama Diarra'));
    expect(screen.getByLabelText('Montant (FCFA)')).toHaveValue(montantAffiche(125000));
    expect(screen.getByLabelText('Motif')).toHaveValue('Location de coffrage');
    expect(valeursChoisies(container)).toEqual(expect.arrayContaining(['Villa duplex — Angré Centre', "Main-d'œuvre"]));

    // Règle 3 : la date du jour, jamais le 02/04/2026 de la pièce d'origine.
    expect(screen.getByLabelText('Date')).toHaveValue(AUJOURD_HUI);

    // Le formulaire est de nouveau saisissable : on repart d'une émission.
    expect(screen.getByRole('button', { name: /Émettre la pièce/ })).toBeInTheDocument();

    expect(
      await screen.findByText(/Formulaire pré-rempli d'après la pièce de Adama Diarra/, {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument();

    // Aucune écriture de plus que l'émission initiale : dupliquer ne crée rien.
    expect(createCashVoucher).toHaveBeenCalledTimes(1);
    expect(validateCashVoucher).not.toHaveBeenCalled();
    expect(voidCashVoucher).not.toHaveBeenCalled();
  }, 30000);
});

// ---------------------------------------------------------------------------
// c) Facture fournisseur
// ---------------------------------------------------------------------------

describe('Dupliquer — facture fournisseur', () => {
  it('relit le détail pour reprendre lignes et imputations, référence vide, sans rien créer', async () => {
    listSupplierInvoices.mockResolvedValue([factureAnnulee()]);
    getSupplierInvoice.mockResolvedValue(detailFacture());
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    const { container } = monterFactures();

    await screen.findByText('FRS-2026-0101', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Dupliquer' }));

    // La liste ne porte ni lignes ni imputations : le détail est relu, par
    // identifiant.
    await waitFor(() => expect(getSupplierInvoice).toHaveBeenCalledWith('agence-1', 'fact-01'));

    // Règle 2 : référence vide, et son champ prend le focus.
    const champReference = screen.getByLabelText('Référence');
    await waitFor(() => expect(champReference).toHaveValue(''));
    await waitFor(() => expect(champReference).toHaveFocus());

    // Règle 3 : la date du jour, jamais le 04/07/2026 de l'originale. Deux
    // champs portent le libellé « Date » sur cet écran (la saisie et le
    // règlement) : on vise celui de la facture par son identifiant.
    expect(container.querySelector('#facture-date')).toHaveValue(AUJOURD_HUI);

    // Les deux lignes, avec quantité, prix unitaire et montant.
    const libelles = screen.getAllByLabelText('Libellé de la ligne');
    expect(libelles).toHaveLength(2);
    expect(libelles[0]).toHaveValue('Ciment CPJ 45');
    expect(libelles[1]).toHaveValue('Forfait de pose');
    const quantites = screen.getAllByLabelText('Quantité');
    expect(quantites[0]).toHaveValue('20');
    expect(quantites[1]).toHaveValue('');
    expect(screen.getAllByLabelText('Prix unitaire')[0]).toHaveValue(montantAffiche(75000));
    const montantsLignes = screen.getAllByLabelText('Montant de la ligne');
    expect(montantsLignes[0]).toHaveValue(montantAffiche(1500000));
    expect(montantsLignes[1]).toHaveValue(montantAffiche(900000));

    // Les deux imputations : chantier, poste, montant.
    const montantsImputes = screen.getAllByLabelText('Montant imputé');
    expect(montantsImputes).toHaveLength(2);
    expect(montantsImputes[0]).toHaveValue(montantAffiche(1500000));
    expect(montantsImputes[1]).toHaveValue(montantAffiche(900000));
    expect(valeursChoisies(container)).toEqual(expect.arrayContaining(['Gros œuvre', "Main-d'œuvre"]));
    expect(valeursChoisies(container).filter(v => v === 'Villa duplex — Angré Centre')).toHaveLength(2);

    expect(
      await screen.findByText(/Formulaire pré-rempli d'après la facture FRS-2026-0101/, {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument();

    // Aucune écriture : dupliquer ne fait que lire.
    expect(createSupplierInvoice).not.toHaveBeenCalled();
    expect(validateSupplierInvoice).not.toHaveBeenCalled();
    expect(voidSupplierInvoice).not.toHaveBeenCalled();
    expect(createSupplierPayment).not.toHaveBeenCalled();
  }, 30000);
});
