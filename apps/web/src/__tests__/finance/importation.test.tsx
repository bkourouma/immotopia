import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Importation — reprendre un suivi Excel dans le module finance.
 *
 * ---------------------------------------------------------------------------
 * Où ces tests portent, et pourquoi là
 * ---------------------------------------------------------------------------
 *
 * L'essentiel de cette fonctionnalité est PUR : rapprocher un en-tête à un
 * champ, lire « 1 250,50 », dire qu'une ligne est fautive, décider ce qui
 * part. Ces gestes se vérifient sur `lib/importation` sans monter un écran,
 * et c'est ce que font les quatre premières suites — elles courent en
 * millisecondes et disent précisément ce qui casse.
 *
 * La cinquième monte l'écran réel, par-dessus des SERVICES simulés, pour
 * garantir qu'il reste bien ignorant des natures : la liste déroulante de
 * l'étape 1 ne porte que ce que `DESCRIPTEURS` déclare.
 *
 * `exceljs` n'est jamais chargé ici : le classeur n'est lu que dans l'écran,
 * et aucun test n'en dépose. `lireClasseur` reste couvert par le typage et
 * par l'usage réel — le simuler ne prouverait que le simulacre.
 */

vi.mock('../../services/finance-lot2-service', () => ({
  createCashVoucher: vi.fn(),
  createSupplierInvoice: vi.fn(),
  listSupplierInvoices: vi.fn().mockResolvedValue([]),
  listCostCategories: vi.fn().mockResolvedValue([]),
  listSuppliers: vi.fn().mockResolvedValue([]),
  listConstructionSites: vi.fn().mockResolvedValue([])
}));

vi.mock('../../services/finance-lot3-service', () => ({
  createPurchaseOrder: vi.fn(),
  listPurchaseOrders: vi.fn().mockResolvedValue([])
}));

vi.mock('../../services/finance-salaries-service', () => ({
  createSalaryNote: vi.fn(),
  listSalaryNotes: vi.fn().mockResolvedValue([]),
  listEmployees: vi.fn().mockResolvedValue([])
}));

vi.mock('../../services/finance-contractors-service', () => ({
  createProgressStatement: vi.fn(),
  listProgressStatements: vi.fn().mockResolvedValue([]),
  listContractors: vi.fn().mockResolvedValue([]),
  listContractorContracts: vi.fn().mockResolvedValue([])
}));

vi.mock('../../services/finance-stock-mouvements-service', () => ({
  recordStockReceipt: vi.fn(),
  recordStockIssue: vi.fn(),
  listStockMovements: vi.fn().mockResolvedValue([]),
  listStockItems: vi.fn().mockResolvedValue([]),
  listStockLocations: vi.fn().mockResolvedValue([]),
  listSupplierInvoicesForReceipt: vi.fn().mockResolvedValue([])
}));

vi.mock('../../services/finance-lot4-service', () => ({
  recordLandLeaseAccrual: vi.fn(),
  listLandLeaseAccruals: vi.fn().mockResolvedValue([]),
  listLandLeases: vi.fn().mockResolvedValue([])
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

import { createCashVoucher, listConstructionSites, listCostCategories } from '../../services/finance-lot2-service';
import {
  champsObligatoiresManquants,
  chargerReferentiel,
  DESCRIPTEURS,
  evaluerLigne,
  executerImport,
  marquerDoublons,
  nettoyerMontant,
  proposerRapprochement,
  REFERENTIEL_VIDE,
  trouverDescripteur,
  versDateISO
} from '../../lib/importation';
import type { ContexteImportation, DescripteurNature, LigneEvaluee } from '../../lib/importation';
import type { CostCategory, ConstructionSite } from '../../types/finance-lot2-types';
import { Importation } from '../../pages/finance/Importation';

const TENANT = 'agence-1';
const CHANTIER = 'chantier-1';

const POSTE_GROS_OEUVRE: CostCategory = { id: 'poste-1', label: 'Gros œuvre', position: 1, isActive: true };
const POSTE_PEINTURE: CostCategory = { id: 'poste-2', label: 'Peinture', position: 2, isActive: true };

const CHANTIER_RIVIERA: ConstructionSite = {
  id: CHANTIER,
  name: 'Résidence Riviera',
  zone: 'Cocody',
  propertyId: null,
  propertyLabel: null,
  managerLabel: null,
  landLeaseId: null,
  status: 'ACTIVE' as ConstructionSite['status'],
  startDate: null,
  plannedEndDate: null,
  progressPercent: 0,
  closedAt: null,
  actualCost: 0,
  finalCost: null,
  currency: 'XOF',
  stockEnabledAt: null
};

function contexte(surcharges: Partial<ContexteImportation> = {}): ContexteImportation {
  return {
    tenantId: TENANT,
    siteId: CHANTIER,
    dateParDefaut: '2026-09-20',
    referentiel: { ...REFERENTIEL_VIDE, postes: [POSTE_GROS_OEUVRE, POSTE_PEINTURE] },
    ...surcharges
  };
}

function caisse(): DescripteurNature {
  const descripteur = trouverDescripteur('piece-de-caisse');
  if (!descripteur) throw new Error('Le descripteur de la pièce de caisse a disparu.');
  return descripteur;
}

/** Une ligne de pièce de caisse complète, que les tests dégradent au besoin. */
function ligneDeCaisse(surcharges: Record<string, string> = {}): Record<string, string> {
  return {
    costCategoryId: 'Gros œuvre',
    beneficiary: 'Kouadio Yao',
    amount: '1 250,50',
    voucherDate: '12/03/2026',
    reason: 'Achat de ciment',
    ...surcharges
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Le rapprochement automatique des colonnes
// ---------------------------------------------------------------------------

describe('Le rapprochement automatique des colonnes', () => {
  it('reconnaît les en-têtes d’un fichier tenu à la main, casse et accents compris', () => {
    const colonnes = ['DATE', 'Bénéficiaire', 'MONTANT', 'Poste de dépense', 'Objet'];
    const rapprochement = proposerRapprochement(colonnes, caisse().champs);

    expect(rapprochement).toEqual(['voucherDate', 'beneficiary', 'amount', 'costCategoryId', 'reason']);
  });

  it('reconnaît un synonyme déclaré par le descripteur plutôt que le libellé exact', () => {
    // Aucun de ces en-têtes n'est le libellé du champ : ce sont ses `entetes`.
    const colonnes = ['Jour', 'Payé à', 'Somme', 'Rubrique', 'Motif'];
    const rapprochement = proposerRapprochement(colonnes, caisse().champs);

    expect(rapprochement).toEqual(['voucherDate', 'beneficiary', 'amount', 'costCategoryId', 'reason']);
  });

  it('n’attribue jamais deux fois le même champ, et laisse la colonne en trop sans champ', () => {
    const colonnes = ['Montant', 'Montant', 'Motif'];
    const rapprochement = proposerRapprochement(colonnes, caisse().champs);

    expect(rapprochement[0]).toBe('amount');
    expect(rapprochement[1]).toBeNull();
    expect(rapprochement[2]).toBe('reason');
  });

  it('laisse sans champ une colonne qui ne ressemble à rien', () => {
    const rapprochement = proposerRapprochement(['Zzzz inconnu'], caisse().champs);
    expect(rapprochement).toEqual([null]);
  });

  it('ne bloque pas sur une date non rapprochée, qui a une valeur par défaut', () => {
    // « Date de la pièce » est obligatoire, mais la date de l'étape 1 la comble.
    const rapprochement = proposerRapprochement(['Bénéficiaire', 'Montant', 'Poste', 'Motif'], caisse().champs);
    const manquants = champsObligatoiresManquants(caisse(), rapprochement);

    expect(manquants).toHaveLength(0);
  });

  it('bloque, en les nommant, sur les champs obligatoires sans colonne ni valeur par défaut', () => {
    const rapprochement = proposerRapprochement(['Montant'], caisse().champs);
    const manquants = champsObligatoiresManquants(caisse(), rapprochement).map(champ => champ.cle);

    expect(manquants).toEqual(expect.arrayContaining(['costCategoryId', 'beneficiary', 'reason']));
    expect(manquants).not.toContain('amount');
    expect(manquants).not.toContain('voucherDate');
  });
});

// ---------------------------------------------------------------------------
// 2. Le nettoyage des valeurs venues d'un tableur
// ---------------------------------------------------------------------------

describe('Le nettoyage d’un montant écrit à la main', () => {
  it('lit « 1 250,50 » — espace de milliers, virgule décimale', () => {
    expect(nettoyerMontant('1 250,50')).toBe(1250.5);
  });

  it('lit « 1 250,50 » écrit avec une espace insécable, comme un tableur le pose', () => {
    expect(nettoyerMontant('1 250,50')).toBe(1250.5);
    expect(nettoyerMontant('1 250,50')).toBe(1250.5);
  });

  it('écarte la devise collée au montant', () => {
    expect(nettoyerMontant('1 250,50 F CFA')).toBe(1250.5);
  });

  it('tranche entre les deux écritures quand point et virgule cohabitent', () => {
    expect(nettoyerMontant('1.250,50')).toBe(1250.5);
    expect(nettoyerMontant('1,250.50')).toBe(1250.5);
  });

  it('rend le nombre tel quel quand le tableur l’a déjà converti', () => {
    expect(nettoyerMontant(1250.5)).toBe(1250.5);
    expect(nettoyerMontant(0)).toBe(0);
  });

  it('distingue « vide » de « zéro »', () => {
    expect(nettoyerMontant('')).toBeNull();
    expect(nettoyerMontant('   ')).toBeNull();
    expect(nettoyerMontant('0')).toBe(0);
  });

  it('refuse ce qui n’est pas un nombre, au lieu de rendre NaN', () => {
    expect(nettoyerMontant('à voir')).toBeNull();
    expect(nettoyerMontant('#DIV/0!')).toBeNull();
  });
});

describe('La lecture d’une date', () => {
  it('lit « 12/03/2026 » comme le 12 mars, pas le 3 décembre', () => {
    expect(versDateISO('12/03/2026')).toBe('2026-03-12');
  });

  it('lit un objet Date rendu par exceljs sans reculer d’un jour', () => {
    expect(versDateISO(new Date(2026, 2, 12, 15, 30))).toBe('2026-03-12');
  });

  it('lit le numéro de série d’Excel', () => {
    // 45000 = 30 mars 2023 dans le calendrier d'Excel (origine 1899-12-30).
    expect(versDateISO(45000)).toBe('2023-03-15');
  });

  it('refuse une date impossible plutôt que de la corriger en silence', () => {
    expect(versDateISO('31/02/2026')).toBeNull();
    expect(versDateISO('bientôt')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Ce qu'une ligne vaut
// ---------------------------------------------------------------------------

describe('L’évaluation d’une ligne', () => {
  it('résout un libellé de poste en identifiant, sans casse ni accents', () => {
    const ligne = evaluerLigne(caisse(), 4, ligneDeCaisse({ costCategoryId: 'GROS OEUVRE' }), contexte());

    expect(ligne.erreurs).toEqual([]);
    expect(ligne.cellules.costCategoryId.valeur).toBe('poste-1');
    expect(ligne.cellules.costCategoryId.libelleResolu).toBe('Gros œuvre');
    expect(ligne.cellules.amount.valeur).toBe(1250.5);
    expect(ligne.cellules.voucherDate.valeur).toBe('2026-03-12');
  });

  it('dit en clair qu’un poste est introuvable, au lieu d’envoyer une ligne qui échouera', () => {
    const ligne = evaluerLigne(caisse(), 4, ligneDeCaisse({ costCategoryId: 'Plomberie' }), contexte());

    expect(ligne.erreurs).toHaveLength(1);
    expect(ligne.erreurs[0]).toContain('Plomberie');
    expect(ligne.erreurs[0]).toContain('introuvable');
  });

  it('comble une date absente par la date par défaut de l’étape 1', () => {
    const ligne = evaluerLigne(caisse(), 4, ligneDeCaisse({ voucherDate: '' }), contexte());

    expect(ligne.erreurs).toEqual([]);
    expect(ligne.cellules.voucherDate.valeur).toBe('2026-09-20');
  });

  it('refuse une ligne dont un champ obligatoire est vide, en le nommant', () => {
    const ligne = evaluerLigne(caisse(), 4, ligneDeCaisse({ beneficiary: '' }), contexte());

    expect(ligne.erreurs).toHaveLength(1);
    expect(ligne.erreurs[0]).toContain('Bénéficiaire');
  });

  it('refuse la ligne quand la nature exige un chantier et qu’aucun n’est choisi', () => {
    const ligne = evaluerLigne(caisse(), 4, ligneDeCaisse(), contexte({ siteId: null }));

    expect(ligne.erreurs).toContain('Aucun chantier choisi : cette nature en exige un.');
  });
});

// ---------------------------------------------------------------------------
// 4. Les doublons : signalés, jamais refusés
// ---------------------------------------------------------------------------

describe('La détection des doublons', () => {
  const bon = trouverDescripteur('bon-de-commande') as DescripteurNature;

  function ligneDeBon(surcharges: Record<string, string> = {}) {
    return {
      supplierId: 'Matériaux du Sud',
      reference: 'BC-001',
      orderDate: '12/03/2026',
      costCategoryId: 'Gros œuvre',
      label: 'Ciment',
      amount: '1 000',
      ...surcharges
    };
  }

  const contexteBon = contexte({
    referentiel: {
      ...REFERENTIEL_VIDE,
      postes: [POSTE_GROS_OEUVRE],
      fournisseurs: [
        {
          id: 'fourn-1',
          name: 'Matériaux du Sud',
          kind: 'MATERIALS',
          contactName: null,
          contactPhone: null,
          contactEmail: null,
          maintenanceVendorId: null,
          thirdPartyAccountId: 'compte-1'
        } as never
      ]
    }
  });

  it('marque la ligne qui ressemble à une pièce déjà en base, sans la décocher', () => {
    const ligne = evaluerLigne(bon, 4, ligneDeBon(), contexteBon);
    const empreinte = bon.empreinte?.(
      Object.fromEntries(Object.entries(ligne.cellules).map(([cle, cellule]) => [cle, cellule.valeur])),
      contexteBon
    );

    const marquees = marquerDoublons(bon, [ligne], contexteBon, [empreinte as string]);

    expect(marquees[0].doublon).not.toBeNull();
    expect(marquees[0].selectionnee).toBe(true);
  });

  it('marque aussi le doublon interne au fichier, en citant la première ligne', () => {
    const premiere = evaluerLigne(bon, 4, ligneDeBon(), contexteBon);
    const seconde = evaluerLigne(bon, 5, ligneDeBon(), contexteBon);

    const marquees = marquerDoublons(bon, [premiere, seconde], contexteBon, []);

    expect(marquees[0].doublon).toBeNull();
    expect(marquees[1].doublon).toContain('4');
  });

  it('ne signale rien quand la nature n’offre aucune liste : la pièce de caisse', () => {
    const descripteur = caisse();

    expect(descripteur.empreinte).toBeUndefined();
    expect(descripteur.chargerEmpreintes).toBeUndefined();
    expect(descripteur.doublonImpossible).toContain('pièces de caisse');

    const ligne = evaluerLigne(descripteur, 4, ligneDeCaisse(), contexte());
    expect(marquerDoublons(descripteur, [ligne], contexte(), ['peu importe'])[0].doublon).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. L'import, et son compte rendu
// ---------------------------------------------------------------------------

describe('L’import', () => {
  const creer = createCashVoucher as unknown as ReturnType<typeof vi.fn>;

  function lignes(): LigneEvaluee[] {
    return [
      evaluerLigne(caisse(), 4, ligneDeCaisse({ beneficiary: 'Kouadio Yao' }), contexte()),
      evaluerLigne(caisse(), 5, ligneDeCaisse({ beneficiary: 'Aya Traoré' }), contexte()),
      evaluerLigne(caisse(), 6, ligneDeCaisse({ beneficiary: 'Sékou Camara' }), contexte())
    ];
  }

  it('saisit une pièce par ligne, en brouillon, avec les valeurs résolues', async () => {
    creer.mockResolvedValue({});

    const rendu = await executerImport({ descripteur: caisse(), lignes: lignes(), contexte: contexte() });

    expect(rendu.creees).toBe(3);
    expect(rendu.echouees).toEqual([]);
    expect(creer).toHaveBeenCalledTimes(3);
    expect(creer).toHaveBeenNthCalledWith(1, TENANT, {
      siteId: CHANTIER,
      costCategoryId: 'poste-1',
      beneficiary: 'Kouadio Yao',
      amount: 1250.5,
      voucherDate: '2026-03-12',
      reason: 'Achat de ciment'
    });
  });

  it('n’envoie pas une ligne en erreur, et la compte à part', async () => {
    creer.mockResolvedValue({});
    const jeu = lignes();
    // La deuxième ligne porte un poste introuvable.
    jeu[1] = evaluerLigne(caisse(), 5, ligneDeCaisse({ costCategoryId: 'Plomberie' }), contexte());
    expect(jeu[1].erreurs.length).toBeGreaterThan(0);

    const rendu = await executerImport({ descripteur: caisse(), lignes: jeu, contexte: contexte() });

    expect(rendu.creees).toBe(2);
    expect(rendu.enErreur).toBe(1);
    expect(creer).toHaveBeenCalledTimes(2);
    expect(creer.mock.calls.map(appel => appel[1].beneficiary)).toEqual(['Kouadio Yao', 'Sékou Camara']);
  });

  it('n’envoie pas une ligne décochée, et la compte à part', async () => {
    creer.mockResolvedValue({});
    const jeu = lignes();
    jeu[1] = { ...jeu[1], selectionnee: false };

    const rendu = await executerImport({ descripteur: caisse(), lignes: jeu, contexte: contexte() });

    expect(rendu.creees).toBe(2);
    expect(rendu.decochees).toBe(1);
    expect(creer).toHaveBeenCalledTimes(2);
    expect(creer.mock.calls.map(appel => appel[1].beneficiary)).toEqual(['Kouadio Yao', 'Sékou Camara']);
  });

  it('rend le compte rendu ligne par ligne, avec le motif du serveur', async () => {
    creer
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ response: { data: { message: 'Le chantier est clos.' } } })
      .mockResolvedValueOnce({});

    const jeu = lignes();
    jeu.push({ ...jeu[0], numero: 7, selectionnee: false });
    jeu.push(evaluerLigne(caisse(), 8, ligneDeCaisse({ amount: 'à voir' }), contexte()));

    const rendu = await executerImport({ descripteur: caisse(), lignes: jeu, contexte: contexte() });

    expect(rendu.total).toBe(5);
    expect(rendu.creees).toBe(2);
    expect(rendu.decochees).toBe(1);
    expect(rendu.enErreur).toBe(1);
    expect(rendu.echouees).toEqual([{ numero: 5, motif: 'Le chantier est clos.' }]);
  });

  it('égrène la progression, une ligne à la fois', async () => {
    creer.mockResolvedValue({});
    const etapes: Array<[number, number]> = [];

    await executerImport({
      descripteur: caisse(),
      lignes: lignes(),
      contexte: contexte(),
      surProgression: (traitees, total) => etapes.push([traitees, total])
    });

    expect(etapes).toEqual([
      [1, 3],
      [2, 3],
      [3, 3]
    ]);
  });

  it('une ligne refusée n’empêche pas les suivantes : rien n’est transactionnel', async () => {
    creer
      .mockRejectedValueOnce({ response: { data: { message: 'Refus.' } } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const rendu = await executerImport({ descripteur: caisse(), lignes: lignes(), contexte: contexte() });

    expect(rendu.creees).toBe(2);
    expect(rendu.echouees).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Le chargement des listes de référence
// ---------------------------------------------------------------------------

describe('Le chargement des listes de référence', () => {
  it('ne charge que ce que la nature déclare', async () => {
    const listerPostes = listCostCategories as unknown as ReturnType<typeof vi.fn>;
    const listerChantiers = listConstructionSites as unknown as ReturnType<typeof vi.fn>;
    listerPostes.mockResolvedValue([POSTE_GROS_OEUVRE]);

    const referentiel = await chargerReferentiel(TENANT, caisse().referentiels);

    expect(listerPostes).toHaveBeenCalledWith(TENANT);
    expect(listerChantiers).not.toHaveBeenCalled();
    expect(referentiel.postes).toHaveLength(1);
    expect(referentiel.fournisseurs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7. L'écran ne connaît aucune nature
// ---------------------------------------------------------------------------

/**
 * Choisit une option de liste déroulante par son libellé.
 *
 * Même dispositif qu'aux bons de commande (`bons-de-commande.test.tsx`) :
 * `fireEvent.mouseDown` pour ouvrir — le placeholder d'AntD 6 porte
 * `pointer-events: none`, que `userEvent` refuse à juste titre — puis la
 * classe `ant-select-item` pour distinguer l'option du même libellé affiché
 * ailleurs à l'écran.
 */
async function optionParLibelle(libelle: string): Promise<HTMLElement> {
  return waitFor(() => {
    const candidat = screen.getAllByText(libelle).find(element => element.closest('.ant-select-item'));
    if (!candidat) throw new Error(`Option introuvable : « ${libelle} »`);
    return candidat;
  });
}

async function choisirNature(libelle: string): Promise<void> {
  const listes = await screen.findAllByRole('combobox', {}, { timeout: 8000 });
  fireEvent.mouseDown(listes[0]);
  fireEvent.click(await optionParLibelle(libelle));
}

describe('L’écran d’importation', () => {
  function monter() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return render(
      <QueryClientProvider client={client}>
        <AntApp>
          <MemoryRouter initialEntries={[`/tenant/${TENANT}/finance/importation`]}>
            <Routes>
              <Route path="/tenant/:tenantId/finance/importation" element={<Importation />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    );
  }

  it('propose exactement les natures déclarées par les descripteurs, et rien de plus', async () => {
    monter();

    await screen.findByText('Importation');
    const listes = await screen.findAllByRole('combobox', {}, { timeout: 8000 });
    fireEvent.mouseDown(listes[0]);

    for (const descripteur of DESCRIPTEURS) {
      expect(await optionParLibelle(descripteur.libelle)).toBeInTheDocument();
    }

    const options = document.querySelectorAll('.ant-select-item-option');
    expect(options).toHaveLength(DESCRIPTEURS.length);
  });

  it('réclame le chantier quand la nature l’exige, avant de laisser charger un fichier', async () => {
    (listConstructionSites as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([CHANTIER_RIVIERA]);
    (listCostCategories as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([POSTE_GROS_OEUVRE]);

    monter();
    await screen.findByText('Importation');
    await choisirNature('Pièce de caisse');

    // Le chantier apparaît, et « Continuer » reste fermé tant qu'il manque.
    // Le nom accessible du bouton porte « loading » tant que les listes de
    // référence arrivent : on attend leur chargement avant de conclure.
    await screen.findByText('Chantier');
    const continuer = () => screen.getByRole('button', { name: /Continuer/ });
    await waitFor(() => expect(continuer()).not.toHaveClass('ant-btn-loading'));
    expect(continuer()).toBeDisabled();

    const listes = await screen.findAllByRole('combobox');
    fireEvent.mouseDown(listes[1]);
    fireEvent.click(await optionParLibelle('Résidence Riviera'));

    await waitFor(() => expect(continuer()).toBeEnabled());
  });

  it('ne réclame aucun chantier pour une nature qui n’en a pas besoin', async () => {
    monter();
    await screen.findByText('Importation');
    await choisirNature('Constatation de loyer de terrain');

    await waitFor(() => expect(screen.queryByText('Choisir un chantier')).not.toBeInTheDocument());
    expect(listConstructionSites).not.toHaveBeenCalled();
  });
});
