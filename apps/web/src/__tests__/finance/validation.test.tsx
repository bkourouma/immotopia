import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FileDeValidation } from '../../pages/finance/FileDeValidation';
import type { PendingDocument, SupplierInvoice } from '../../types/finance-lot2-types';

/**
 * File de validation — les garanties de l'écran du validateur (récit 11,
 * `specs/017-finance-fournisseurs-chantiers/spec.md`, décision D7 du plan).
 *
 * Modelé sur `__tests__/finance/facturation.test.tsx` : même palier desktop
 * forcé pour obtenir le tableau plutôt que les cartes, mêmes délais
 * `findBy*` de 8 s pour la charge parallèle de la suite complète, même choix
 * de préposer l'URL plutôt que de simuler l'ouverture d'un `<Select>` AntD
 * pour vérifier un filtre (voir `balances.test.tsx`).
 *
 * Le test le plus important n'est pas celui qui valide une pièce — c'est
 * celui qui vérifie qu'une file vide se présente comme une bonne nouvelle, et
 * celui qui vérifie que le nom du saisisseur est bien sur CHAQUE ligne :
 * c'est la seule raison d'être de cet écran (§ de tête de
 * `FileDeValidation.tsx`).
 */

const getValidationQueue = vi.fn();
const validateSupplierInvoice = vi.fn();
const validateSupplierPayment = vi.fn();
const validateCashVoucher = vi.fn();
const deleteDraftCashVoucher = vi.fn();
const listSupplierInvoices = vi.fn();

vi.mock('../../services/finance-lot2-service', () => ({
  getValidationQueue: (...a: unknown[]) => getValidationQueue(...a),
  listSupplierInvoices: (...a: unknown[]) => listSupplierInvoices(...a),
  validateSupplierInvoice: (...a: unknown[]) => validateSupplierInvoice(...a),
  validateSupplierPayment: (...a: unknown[]) => validateSupplierPayment(...a),
  validateCashVoucher: (...a: unknown[]) => validateCashVoucher(...a),
  deleteDraftCashVoucher: (...a: unknown[]) => deleteDraftCashVoucher(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function piece(overrides: Partial<PendingDocument> = {}): PendingDocument {
  return {
    documentType: 'SUPPLIER_INVOICE',
    documentId: 'facture-1',
    label: 'Quincaillerie Treichville — Facture FA-2026-0142',
    amount: 1_850_000,
    currency: 'XOF',
    createdAt: '2026-09-10T09:15:00.000Z',
    createdByUserId: 'user-mariam-kouadio',
    createdByLabel: 'Mariam Kouadio',
    ...overrides
  };
}

function fileTypique(): PendingDocument[] {
  return [
    piece(),
    piece({
      documentType: 'SUPPLIER_PAYMENT',
      documentId: 'reglement-1',
      label: 'Transport Riviera — Règlement du 15/09/2026',
      amount: 450_000,
      createdAt: '2026-09-15T16:30:00.000Z',
      createdByUserId: 'user-ibrahima-yao',
      createdByLabel: 'Ibrahima Yao'
    }),
    piece({
      documentType: 'CASH_VOUCHER',
      documentId: 'caisse-1',
      label: 'Pièce de caisse 2026-0031 — Ousmane Touré',
      amount: 150_000,
      createdAt: '2026-09-08T07:45:00.000Z',
      createdByUserId: 'user-aissatou-brou',
      createdByLabel: 'Aïssatou Brou'
    })
  ];
}

function mount(url = '/tenant/agence-1/finance/validation') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/validation" element={<FileDeValidation />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getValidationQueue.mockResolvedValue(fileTypique());
  validateSupplierInvoice.mockResolvedValue({ id: 'facture-1', status: 'VALIDATED' });
  validateSupplierPayment.mockResolvedValue({ id: 'reglement-1', status: 'VALIDATED' });
  validateCashVoucher.mockResolvedValue({ id: 'caisse-1', status: 'VALIDATED' });
  deleteDraftCashVoucher.mockResolvedValue(undefined);
  listSupplierInvoices.mockResolvedValue([]);
});

describe('File de validation — les trois natures', () => {
  it('affiche chacune des trois natures avec son libellé français', async () => {
    mount();

    // Chaque libellé apparaît au moins deux fois (la tuile de compte et la
    // ligne du tableau) : `getAllByText` plutôt que `getByText`, qui
    // échouerait sur cette ambiguïté légitime.
    expect((await screen.findAllByText('Facture fournisseur', {}, { timeout: 8000 })).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Règlement fournisseur').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pièce de caisse').length).toBeGreaterThan(0);

    // Aucun code brut du contrat ne doit fuiter à l'écran.
    expect(screen.queryByText('SUPPLIER_INVOICE')).not.toBeInTheDocument();
    expect(screen.queryByText('SUPPLIER_PAYMENT')).not.toBeInTheDocument();
    expect(screen.queryByText('CASH_VOUCHER')).not.toBeInTheDocument();
  });

  it('nomme le saisisseur sur chaque ligne — la raison d’être de l’écran', async () => {
    mount();

    await screen.findByText('Quincaillerie Treichville — Facture FA-2026-0142', {}, { timeout: 8000 });

    expect(screen.getByText('Mariam Kouadio')).toBeInTheDocument();
    expect(screen.getByText('Ibrahima Yao')).toBeInTheDocument();
    expect(screen.getByText('Aïssatou Brou')).toBeInTheDocument();
  });
});

describe('File de validation — filtre par saisisseur', () => {
  it('porte le filtre par saisisseur dans l’URL et envoie un identifiant, jamais un nom', async () => {
    getValidationQueue.mockResolvedValue([piece()]);
    mount('/tenant/agence-1/finance/validation?saisisseur=user-mariam-kouadio');

    await screen.findByText('Quincaillerie Treichville — Facture FA-2026-0142', {}, { timeout: 8000 });

    await waitFor(() =>
      expect(getValidationQueue).toHaveBeenCalledWith('agence-1', { createdByUserId: 'user-mariam-kouadio' })
    );

    // La régression que ce test empêche : deux homonymes enverraient le même
    // libellé et casseraient le filtre — exactement le défaut déjà corrigé
    // au lot 1 sur le filtre par bien. L'argument reçu ne doit jamais
    // ressembler à un nom de personne.
    const argumentRecu = getValidationQueue.mock.calls[0][1] as { createdByUserId?: string };
    expect(argumentRecu.createdByUserId).toBe('user-mariam-kouadio');
    expect(argumentRecu.createdByUserId).not.toMatch(/Mariam|Kouadio/);
  });

  it('interroge la file sans filtre quand aucun saisisseur n’est choisi', async () => {
    mount();
    await screen.findByText('Quincaillerie Treichville — Facture FA-2026-0142', {}, { timeout: 8000 });

    await waitFor(() => expect(getValidationQueue).toHaveBeenCalledWith('agence-1', { createdByUserId: undefined }));
  });
});

describe('File de validation — valider une pièce', () => {
  it('annonce le caractère irréversible avant de valider, puis valide', async () => {
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText('Quincaillerie Treichville — Facture FA-2026-0142', {}, { timeout: 8000 });

    const boutonsAvant = await screen.findAllByRole('button', { name: 'Valider' }, { timeout: 8000 });
    const nombreAvant = boutonsAvant.length;
    await user.click(boutonsAvant[0]);

    // La confirmation dit l'irréversibilité avant toute action — ce n'est
    // pas la relance sans risque du lot 1.
    expect(await screen.findByText(/est irréversible/i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(validateSupplierInvoice).not.toHaveBeenCalled();

    // La boîte de dialogue ajoute son propre bouton « Valider » (l'OK de la
    // confirmation) à ceux, déjà présents, de chaque ligne : c'est le
    // dernier ajouté au DOM.
    const boutonsApres = await waitFor(() => {
      const trouves = screen.getAllByRole('button', { name: 'Valider' });
      expect(trouves.length).toBeGreaterThan(nombreAvant);
      return trouves;
    });
    const confirmer = boutonsApres[boutonsApres.length - 1];
    await user.click(confirmer);

    await waitFor(() => expect(validateSupplierInvoice).toHaveBeenCalledWith('agence-1', 'facture-1'));
  });
});

describe('File de validation — validation en lot', () => {
  it('valide plusieurs pièces sélectionnées et rend compte de ce qui est passé', async () => {
    validateSupplierPayment.mockRejectedValue({ response: { data: { message: 'Compte fournisseur introuvable.' } } });
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText('Quincaillerie Treichville — Facture FA-2026-0142', {}, { timeout: 8000 });

    const cases = screen.getAllByRole('checkbox').filter(c => c.getAttribute('aria-label')?.startsWith('Sélectionner'));
    await user.click(cases[0]);
    await user.click(cases[1]);

    const nombreAvant = screen.getAllByRole('button', { name: 'Valider' }).length;
    await user.click(await screen.findByRole('button', { name: 'Valider la sélection' }, { timeout: 8000 }));

    const boutonsApres = await waitFor(() => {
      const trouves = screen.getAllByRole('button', { name: 'Valider' });
      expect(trouves.length).toBeGreaterThan(nombreAvant);
      return trouves;
    });
    const confirmer = boutonsApres[boutonsApres.length - 1];
    await user.click(confirmer);

    await waitFor(() => expect(validateSupplierInvoice).toHaveBeenCalledTimes(1));
    expect(validateSupplierPayment).toHaveBeenCalledTimes(1);

    // Le compte rendu dit ce qui est passé ET ce qui a échoué — jamais un
    // simple total muet, ce qui distinguerait un validateur qui coche tout
    // sans lire d'un qui vérifie.
    expect(await screen.findByText('Compte rendu de la validation en lot', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/Quincaillerie Treichville — Facture FA-2026-0142 — validée/)).toBeInTheDocument();
    expect(
      screen.getByText(/Transport Riviera — Règlement du 15\/09\/2026 — Compte fournisseur introuvable\./)
    ).toBeInTheDocument();
  });
});

describe('File de validation — état vide', () => {
  it('présente une file vide comme une bonne nouvelle, jamais comme une panne', async () => {
    getValidationQueue.mockResolvedValue([]);
    mount();

    expect(
      await screen.findByText(
        "Bonne nouvelle : aucune pièce n'attend de validation, tout est à jour.",
        {},
        { timeout: 8000 }
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/échec/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/panne/i)).not.toBeInTheDocument();
  });
});

describe('File de validation — état d’erreur', () => {
  it('affiche un état d’erreur réel avec un moyen de réessayer', async () => {
    getValidationQueue.mockRejectedValue(new Error('réseau coupé'));
    mount();

    expect(
      await screen.findByText('Impossible de charger la file de validation.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});

describe('File de validation — vocabulaire (P-1 du PRD)', () => {
  it('ne montre jamais « débit » ni « crédit », casse et accents indifférents', async () => {
    mount();

    await screen.findByText('Quincaillerie Treichville — Facture FA-2026-0142', {}, { timeout: 8000 });
    await screen.findByText('Transport Riviera — Règlement du 15/09/2026');
    await screen.findByText('Pièce de caisse 2026-0031 — Ousmane Touré');

    const texte = document.body.textContent ?? '';
    const normalise = texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    expect(normalise).not.toMatch(/\bdebit/);
    expect(normalise).not.toMatch(/\bcredit/);
  });
});

// ---------------------------------------------------------------------------
// Jeter un brouillon — recette du 20 septembre 2026 (ANO-20)
// ---------------------------------------------------------------------------

describe('File de validation — jeter un brouillon de pièce de caisse', () => {
  it("N'OFFRE la suppression QUE sur une pièce de caisse", async () => {
    // Le serveur ne sait jeter que celles-là. Proposer le geste ailleurs
    // laisserait croire qu'un brouillon de facture se supprime aussi.
    mount();

    await screen.findByText('Pièce de caisse 2026-0031 — Ousmane Touré', {}, { timeout: 8000 });

    expect(screen.getAllByRole('button', { name: 'Valider' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Supprimer' })).toHaveLength(1);
  });

  it('DIT pourquoi supprimer un brouillon ne coûte rien, puis supprime', async () => {
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText('Pièce de caisse 2026-0031 — Ousmane Touré', {}, { timeout: 8000 });

    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    await user.click(boutons[0]);

    // La différence avec l'annulation est dite AVANT le geste : c'est elle
    // qui explique pourquoi aucun motif n'est demandé ici.
    expect(
      await screen.findByText(/ni numéro, ni écriture, ni imputation/i, {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(deleteDraftCashVoucher).not.toHaveBeenCalled();

    const apres = await waitFor(() => {
      const trouves = screen.getAllByRole('button', { name: 'Supprimer' });
      expect(trouves.length).toBeGreaterThan(boutons.length);
      return trouves;
    });
    await user.click(apres[apres.length - 1]);

    await waitFor(() => expect(deleteDraftCashVoucher).toHaveBeenCalledWith('agence-1', 'caisse-1'));
    // Et surtout : la suppression ne passe jamais par la validation, qui est
    // précisément ce que le chantier clôturé refusait.
    expect(validateCashVoucher).not.toHaveBeenCalled();
  });

  it('MONTRE le refus du serveur quand la pièce est en fait validée', async () => {
    deleteDraftCashVoucher.mockRejectedValue({
      response: {
        data: { message: 'Cette pièce de caisse est validée : elle ne se supprime pas, elle s’annule.' }
      }
    });
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText('Pièce de caisse 2026-0031 — Ousmane Touré', {}, { timeout: 8000 });

    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    await user.click(boutons[0]);
    const apres = await waitFor(() => {
      const trouves = screen.getAllByRole('button', { name: 'Supprimer' });
      expect(trouves.length).toBeGreaterThan(boutons.length);
      return trouves;
    });
    await user.click(apres[apres.length - 1]);

    expect(await screen.findByText(/elle ne se supprime pas/i, {}, { timeout: 8000 })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Régler deux fois la même facture — recette du 20 septembre 2026
//
// Le cas réel : un règlement fournisseur en brouillon de 28 000 000, saisi une
// AUTRE session, qui solderait une seconde fois `FRS-QA-001` déjà réglée.
// `FactureFournisseur.tsx` avertissait déjà, mais sur les seuls règlements de
// la session en cours — le contrat gelé n'ayant pas de `listSupplierPayments`.
// Ce doublon-là n'était donc visible QUE dans cette file globale, et elle n'y
// offrait qu'un bouton « Valider » muet.
// ---------------------------------------------------------------------------

function reglementDouble(overrides: Partial<PendingDocument> = {}): PendingDocument {
  return piece({
    documentType: 'SUPPLIER_PAYMENT',
    documentId: 'reglement-doublon',
    label: 'Règlement fournisseur — QA Matériaux du Sud SARL',
    amount: 28_000_000,
    createdAt: '2026-09-18T10:00:00.000Z',
    createdByUserId: 'user-autre-session',
    createdByLabel: 'Fatou Camara',
    supplierId: 'fournisseur-qa',
    allocations: [{ invoiceId: 'facture-frs-qa-001', invoiceReference: 'FRS-QA-001', amount: 28_000_000 }],
    ...overrides
  });
}

function factureQa(remainingPayable: number | null): SupplierInvoice {
  return {
    id: 'facture-frs-qa-001',
    supplierId: 'fournisseur-qa',
    supplierLabel: 'QA Matériaux du Sud SARL',
    siteId: null,
    siteLabel: null,
    invoiceDate: '2026-03-04',
    reference: 'FRS-QA-001',
    amount: 28_000_000,
    currency: 'XOF',
    status: 'VALIDATED',
    validatedAt: '2026-03-05T08:00:00.000Z',
    remainingPayable
  };
}

describe('File de validation — un règlement qui solderait deux fois la même facture', () => {
  it('AVERTIT sur la ligne, en relisant les factures du fournisseur visé', async () => {
    getValidationQueue.mockResolvedValue([reglementDouble()]);
    listSupplierInvoices.mockResolvedValue([factureQa(0)]);
    mount();

    expect(
      await screen.findByText('Déjà réglée(s) ou dépassée(s) : FRS-QA-001', {}, { timeout: 8000 })
    ).toBeInTheDocument();

    // Le reste dû vient bien de la LISTE des factures du fournisseur — seule
    // réponse à porter `remainingPayable` —, et le fournisseur vient du
    // règlement lui-même, jamais d'un nom lu dans son libellé.
    await waitFor(() => expect(listSupplierInvoices).toHaveBeenCalledWith('agence-1', 'fournisseur-qa'));
  });

  it("N'EMPÊCHE PAS de valider : c'est un avertissement, pas un blocage", async () => {
    // Saisir un règlement avant qu'un autre ne solde la même facture est
    // légitime. Désactiver le bouton retirerait au validateur la décision
    // qu'on cherche justement à éclairer.
    const user = userEvent.setup({ delay: null });
    getValidationQueue.mockResolvedValue([reglementDouble()]);
    listSupplierInvoices.mockResolvedValue([factureQa(0)]);
    mount();

    await screen.findByText('Déjà réglée(s) ou dépassée(s) : FRS-QA-001', {}, { timeout: 8000 });

    const valider = screen.getByRole('button', { name: 'Valider' });
    expect(valider).toBeEnabled();
    await user.click(valider);

    // La confirmation redit le risque au moment décisif : le validateur qui
    // clique vite est celui à qui l'alerte de la ligne aura échappé.
    expect(
      await screen.findByText(/risque de payer deux fois la même facture/i, {}, { timeout: 8000 })
    ).toBeInTheDocument();

    const boutons = await waitFor(() => {
      const trouves = screen.getAllByRole('button', { name: 'Valider' });
      expect(trouves.length).toBeGreaterThan(1);
      return trouves;
    });
    await user.click(boutons[boutons.length - 1]);

    await waitFor(() => expect(validateSupplierPayment).toHaveBeenCalledWith('agence-1', 'reglement-doublon'));
  });

  it('AVERTIT aussi quand l’affectation dépasse le reste dû sans le solder', async () => {
    getValidationQueue.mockResolvedValue([reglementDouble()]);
    listSupplierInvoices.mockResolvedValue([factureQa(5_000_000)]);
    mount();

    expect(
      await screen.findByText('Déjà réglée(s) ou dépassée(s) : FRS-QA-001', {}, { timeout: 8000 })
    ).toBeInTheDocument();
  });

  it('SE TAIT quand le reste dû couvre l’affectation — aucune fausse alerte', async () => {
    getValidationQueue.mockResolvedValue([reglementDouble()]);
    listSupplierInvoices.mockResolvedValue([factureQa(28_000_000)]);
    mount();

    await screen.findByText('Règlement fournisseur — QA Matériaux du Sud SARL', {}, { timeout: 8000 });
    await waitFor(() => expect(listSupplierInvoices).toHaveBeenCalled());

    expect(screen.queryByText(/Déjà réglée/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider' })).toBeEnabled();
  });

  it('SE TAIT quand le reste dû est inconnu, plutôt que de le supposer', async () => {
    // Lecture en échec (droit manquant, réseau) : la file reste utilisable et
    // n'invente aucune alerte. Une fausse alerte apprendrait au validateur à
    // passer outre, et la vraie ne servirait plus à rien.
    getValidationQueue.mockResolvedValue([reglementDouble()]);
    listSupplierInvoices.mockRejectedValue(new Error('403'));
    mount();

    await screen.findByText('Règlement fournisseur — QA Matériaux du Sud SARL', {}, { timeout: 8000 });
    await waitFor(() => expect(listSupplierInvoices).toHaveBeenCalled());

    expect(screen.queryByText(/Déjà réglée/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider' })).toBeEnabled();
    expect(screen.queryByText('Impossible de charger la file de validation.')).not.toBeInTheDocument();
  });

  it('NE RELIT AUCUNE facture pour un acompte sans affectation', async () => {
    getValidationQueue.mockResolvedValue([reglementDouble({ allocations: [] })]);
    mount();

    await screen.findByText('Règlement fournisseur — QA Matériaux du Sud SARL', {}, { timeout: 8000 });

    expect(listSupplierInvoices).not.toHaveBeenCalled();
    expect(screen.queryByText(/Déjà réglée/)).not.toBeInTheDocument();
  });

  it('rassemble les références risquées dans la confirmation de la validation EN LOT', async () => {
    // C'est le geste où l'on ne relit pas chaque ligne : l'alerte doit y être.
    const user = userEvent.setup({ delay: null });
    getValidationQueue.mockResolvedValue([reglementDouble()]);
    listSupplierInvoices.mockResolvedValue([factureQa(0)]);
    mount();

    await screen.findByText('Déjà réglée(s) ou dépassée(s) : FRS-QA-001', {}, { timeout: 8000 });

    const cases = screen.getAllByRole('checkbox').filter(c => c.getAttribute('aria-label')?.startsWith('Sélectionner'));
    await user.click(cases[0]);
    await user.click(await screen.findByRole('button', { name: 'Valider la sélection' }, { timeout: 8000 }));

    expect(
      await screen.findByText(/FRS-QA-001 déjà réglée\(s\) ou dépassée\(s\)/i, {}, { timeout: 8000 })
    ).toBeInTheDocument();
  });
});
