import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Stock } from '../../pages/finance/Stock';
import { STOCK_MOVEMENT_TYPE_LABELS } from '../../types/finance-stock-mouvements-types';
import type {
  StockBalance,
  StockItemRef,
  StockLocationRef,
  StockMovement
} from '../../types/finance-stock-mouvements-types';

/**
 * Le stock au quotidien — lot 5, deuxième sous-lot (PRD E9, besoins S2, S3,
 * S4 ; contrat gelé `packages/api/src/lib/finance/types-lot5-mouvements.ts`).
 *
 * Comme `retenues-de-garantie.test.tsx`, ce fichier monte l'écran **par-dessus
 * un `apiClient` simulé**, jamais par-dessus un service doublé : la garantie
 * de corps de requête vaut alors pour ce que l'écran envoie réellement, geste
 * par geste. `__tests__/finance/corps-des-requetes.test.ts` épingle les mêmes
 * corps au niveau du service seul.
 *
 * ---------------------------------------------------------------------------
 * Ce que ce fichier surveille en priorité
 * ---------------------------------------------------------------------------
 *
 * 1. **Le prix d'une sortie n'est PAS saisi.** Aucun champ de montant dans le
 *    formulaire, et le corps posté ne porte ni `unitCost`, ni `totalValue`, ni
 *    `averageUnitCost` — le schéma serveur est `.strict()` et les refuserait.
 * 2. **C'est la sortie qui impute, pas la livraison** (principe P-7). L'écran
 *    le dit en tête, et le redit dans le formulaire de réception.
 * 3. **Une sortie supérieure au stock est refusée.** Le stock disponible est
 *    montré à côté du champ de quantité, l'écran avertit avant l'envoi, et
 *    relaie le refus du serveur tel quel.
 * 4. **`quantity × unitCost` ne fait pas `totalValue`.** Le jeu d'essai le
 *    prouve : une sortie qui vide un emplacement emporte la valeur résiduelle,
 *    et l'écran affiche `totalValue`, jamais un produit recalculé.
 * 5. **Les quantités portent quatre décimales.** « 18,75 m³ » ne doit jamais
 *    s'afficher « 19 » ni « 0 ».
 * 6. **Jamais « débit » ni « crédit »** (P-1 du PRD) — le balayage attrape
 *    « débiteur » au passage, et c'est voulu.
 *
 * `useBreakpoint` est figé en desktop pour que `<FilterSheet>` rende ses
 * contrôles en ligne et `<DataView>` un tableau, comme dans
 * `__tests__/finance/retenues-de-garantie.test.tsx`.
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'agence-1';

const CIMENT = 'article-ciment-01';
const FER = 'article-fer-02';
const SABLE = 'article-sable-03';
const MAGASIN = 'lieu-magasin-01';
const DEPOT_NONGO = 'lieu-nongo-02';
const NONGO = 'chantier-nongo';
const RATOMA = 'chantier-ratoma';
const POSTE_GROS_OEUVRE = 'poste-gros-oeuvre';
const POSTE_COUVERTURE = 'poste-couverture';

/** Le formulaire pré-remplit ses dates à aujourd'hui : rien n'est écrit en dur. */
const AUJOURDHUI = dayjs().format('YYYY-MM-DD');

// ---------------------------------------------------------------------------
// Jeux d'essai
// ---------------------------------------------------------------------------

const ARTICLES: StockItemRef[] = [
  {
    id: CIMENT,
    reference: 'CIM-42',
    label: 'Ciment CPJ 42,5',
    unit: 'sac',
    category: 'Gros œuvre',
    // Un poste PROPOSÉ, sans aucune autorité sur la sortie.
    defaultCostCategoryId: POSTE_GROS_OEUVRE,
    defaultCostCategoryLabel: 'Gros œuvre',
    isActive: true
  },
  {
    id: FER,
    reference: 'FER-12',
    label: 'Fer à béton HA 12',
    unit: 'barre',
    category: 'Gros œuvre',
    // Aucun poste proposé : un cas NORMAL, pas une donnée manquante.
    defaultCostCategoryId: null,
    defaultCostCategoryLabel: null,
    isActive: true
  },
  {
    id: SABLE,
    reference: 'SAB-00',
    label: 'Sable lavé',
    unit: 'm³',
    category: null,
    defaultCostCategoryId: null,
    defaultCostCategoryLabel: null,
    isActive: true
  }
];

const LIEUX: StockLocationRef[] = [
  { id: MAGASIN, kind: 'WAREHOUSE', label: 'Magasin central de Kipé', siteId: null, siteLabel: null, isActive: true },
  {
    id: DEPOT_NONGO,
    kind: 'SITE',
    label: 'Dépôt de la Villa de Nongo',
    siteId: NONGO,
    siteLabel: 'Villa de Nongo',
    isActive: true
  }
];

/**
 * Cinq soldes, et chacun porte une règle.
 *
 * Le ciment est en stock dans DEUX lieux, à deux coûts moyens différents : le
 * coût moyen est par (article, LIEU), jamais global.
 */
const SOLDES: StockBalance[] = [
  {
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    quantity: 320,
    value: 1_520_000,
    averageUnitCost: 4_750,
    currency: 'XOF'
  },
  {
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: DEPOT_NONGO,
    locationLabel: 'Dépôt de la Villa de Nongo',
    quantity: 80,
    value: 408_000,
    // Reçu plus cher sur place : le MÊME article, un AUTRE coût moyen.
    averageUnitCost: 5_100,
    currency: 'XOF'
  },
  {
    // Quantité nulle, valeur nulle : la ligne que « masquer les lignes à
    // zéro » doit faire disparaître.
    itemId: FER,
    itemReference: 'FER-12',
    itemLabel: 'Fer à béton HA 12',
    itemUnit: 'barre',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    quantity: 0,
    value: 0,
    averageUnitCost: 0,
    currency: 'XOF'
  },
  {
    // QUATRE DÉCIMALES : « 18,75 m³ », jamais « 19 » ni « 0 ».
    itemId: SABLE,
    itemReference: 'SAB-00',
    itemLabel: 'Sable lavé',
    itemUnit: 'm³',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    quantity: 18.75,
    value: 243_750,
    averageUnitCost: 13_000,
    currency: 'XOF'
  }
];

const MOUVEMENTS: StockMovement[] = [
  {
    id: 'mvt-receipt-ciment',
    type: 'RECEIPT',
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    movementDate: '2026-09-02T00:00:00.000Z',
    quantity: 400,
    isDecrease: false,
    unitCost: 4_700,
    totalValue: 1_880_000,
    currency: 'XOF',
    quantityAfter: 400,
    valueAfter: 1_880_000,
    // Une réception n'impute AUCUN chantier.
    siteId: null,
    siteLabel: null,
    costCategoryLabel: null,
    requestedBy: null,
    supplierInvoiceReference: 'F-2026-0142',
    createdByLabel: 'Aissatou Barry',
    createdAt: '2026-09-02T08:12:00.000Z'
  },
  {
    /**
     * LA LIGNE QUI COMPTE : `25 × 1 900` vaut 47 500, mais `totalValue` vaut
     * 47 503. La sortie a vidé l'emplacement et emporté la valeur résiduelle.
     * Un écran qui recalculerait le total afficherait 47 500, et mentirait de
     * trois francs.
     */
    id: 'mvt-issue-fer',
    type: 'ISSUE',
    itemId: FER,
    itemReference: 'FER-12',
    itemLabel: 'Fer à béton HA 12',
    itemUnit: 'barre',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    movementDate: '2026-09-11T00:00:00.000Z',
    quantity: 25,
    isDecrease: true,
    unitCost: 1_900,
    totalValue: 47_503,
    currency: 'XOF',
    quantityAfter: 0,
    valueAfter: 0,
    siteId: RATOMA,
    siteLabel: 'Résidence Ratoma',
    costCategoryLabel: 'Gros œuvre',
    requestedBy: 'Fatoumata Camara, conductrice de travaux',
    supplierInvoiceReference: null,
    createdByLabel: 'Ibrahima Sow',
    createdAt: '2026-09-11T16:20:00.000Z'
  },
  {
    id: 'mvt-adjustment-sable',
    type: 'ADJUSTMENT',
    itemId: SABLE,
    itemReference: 'SAB-00',
    itemLabel: 'Sable lavé',
    itemUnit: 'm³',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    movementDate: '2026-09-16T00:00:00.000Z',
    // Un quart de mètre cube : « 0,25 », jamais « 0 ».
    quantity: 0.25,
    isDecrease: true,
    unitCost: 13_000,
    totalValue: 3_250,
    currency: 'XOF',
    quantityAfter: 18.75,
    valueAfter: 243_750,
    siteId: null,
    siteLabel: null,
    costCategoryLabel: null,
    requestedBy: null,
    supplierInvoiceReference: null,
    createdByLabel: 'Aissatou Barry',
    createdAt: '2026-09-16T17:30:00.000Z'
  }
];

/** Le mouvement rendu par une sortie réussie, valorisé par le SERVEUR. */
const SORTIE_RENDUE: StockMovement = {
  ...MOUVEMENTS[1],
  id: 'mvt-issue-cree',
  itemId: CIMENT,
  itemReference: 'CIM-42',
  itemLabel: 'Ciment CPJ 42,5',
  itemUnit: 'sac',
  quantity: 12,
  unitCost: 4_750,
  totalValue: 57_000,
  quantityAfter: 308,
  valueAfter: 1_463_000,
  siteId: NONGO,
  siteLabel: 'Villa de Nongo',
  requestedBy: 'Mamadou Diallo'
};

/** Route les GET par motif d'URL, comme le ferait le vrai serveur. */
function configurerGet(options: { soldes?: StockBalance[]; mouvements?: StockMovement[] } = {}) {
  const soldes = options.soldes ?? SOLDES;
  const mouvements = options.mouvements ?? MOUVEMENTS;

  get.mockImplementation(async (url: string) => {
    if (/\/finance\/stock\/balances(\?|$)/.test(url)) return { data: { data: soldes } };
    if (/\/finance\/stock\/movements(\?|$)/.test(url)) return { data: { data: mouvements } };
    if (/\/finance\/stock\/items(\?|$)/.test(url)) return { data: { data: ARTICLES } };
    if (/\/finance\/stock\/locations(\?|$)/.test(url)) return { data: { data: LIEUX } };
    if (/\/finance\/sites(\?|$)/.test(url)) {
      return {
        data: {
          data: [
            { id: NONGO, name: 'Villa de Nongo' },
            { id: RATOMA, name: 'Résidence Ratoma' }
          ]
        }
      };
    }
    if (/\/finance\/cost-categories(\?|$)/.test(url)) {
      return {
        data: {
          data: [
            { id: POSTE_GROS_OEUVRE, label: 'Gros œuvre', position: 1, isActive: true },
            { id: POSTE_COUVERTURE, label: 'Couverture', position: 2, isActive: true }
          ]
        }
      };
    }
    // Les factures d'un fournisseur : une validée, une en brouillon. Le
    // service ne doit proposer que la première.
    if (/\/finance\/suppliers\/[^/]+\/invoices/.test(url)) {
      return {
        data: {
          data: [
            {
              id: 'facture-0142',
              supplierId: 'frs-1',
              supplierLabel: 'Quincaillerie du Niger',
              siteId: null,
              siteLabel: null,
              invoiceDate: '2026-09-01',
              reference: 'F-2026-0142',
              amount: 2_198_500,
              currency: 'XOF',
              status: 'VALIDATED',
              validatedAt: '2026-09-02T10:00:00.000Z'
            },
            {
              id: 'facture-brouillon',
              supplierId: 'frs-1',
              supplierLabel: 'Quincaillerie du Niger',
              siteId: null,
              siteLabel: null,
              invoiceDate: '2026-09-15',
              reference: 'F-2026-0199',
              amount: 400_000,
              currency: 'XOF',
              status: 'DRAFT',
              validatedAt: null
            }
          ]
        }
      };
    }
    if (/\/finance\/suppliers(\?|$)/.test(url)) {
      return {
        data: {
          data: [
            {
              id: 'frs-1',
              name: 'Quincaillerie du Niger',
              kind: 'GOODS',
              contactName: null,
              phone: null,
              email: null,
              maintenanceVendorId: null,
              thirdPartyAccountId: 'compte-quincaillerie',
              isActive: true
            }
          ]
        }
      };
    }
    return { data: { data: [] } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  configurerGet();
  post.mockResolvedValue({ data: { data: SORTIE_RENDUE } });
});

function monter(url = `/tenant/${TENANT}/finance/stock`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/stock" element={<Stock />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Outillage
// ---------------------------------------------------------------------------

/** Nettoie casse et accents, pour un balayage insensible aux deux. */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function corpsDuDocument(): string {
  return normaliser(document.body.textContent ?? '');
}

/** Le contrôle portant cet `id`. Les libellés se répètent d'un onglet à l'autre. */
function champ(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Champ « ${id} » introuvable.`);
  return element;
}

/**
 * Ouvre une liste déroulante AntD et clique l'option demandée.
 *
 * L'option est cherchée **dans le menu de CE sélecteur**, jamais n'importe où,
 * et pour deux raisons distinctes :
 *
 * - les libellés des options (un lieu, un article) paraissent aussi dans le
 *   tableau, et un clic sur une cellule ne prouverait rien ;
 * - AntD **laisse dans le document** les menus déjà déployés. Deux lignes de
 *   réception offrent les mêmes articles : une recherche globale cliquerait
 *   l'option de la ligne précédente et modifierait la mauvaise ligne, sans que
 *   rien ne le signale. Le menu est donc retrouvé par l'identifiant de sa
 *   liste, `<id>_list`, que rc-select dérive de celui du champ.
 */
async function choisirOption(id: string, texte: string | RegExp): Promise<void> {
  fireEvent.mouseDown(champ(id));
  const menu = await waitFor(
    () => {
      const liste = document.getElementById(`${id}_list`);
      const menuDuChamp = liste?.closest('.ant-select-dropdown');
      if (!menuDuChamp) throw new Error(`Menu du sélecteur « ${id} » introuvable.`);
      return menuDuChamp as HTMLElement;
    },
    { timeout: 8000 }
  );
  const candidats = await within(menu).findAllByText(texte, {}, { timeout: 8000 });
  // Les options VISIBLES portent `ant-select-item` ; la liste accessible
  // cachée du même menu répète les mêmes textes sans cette classe.
  const option = candidats.find(element => element.closest('.ant-select-item'));
  if (!option) throw new Error(`Option « ${String(texte)} » absente du menu « ${id} ».`);
  fireEvent.click(option);
}

/** Saisit un nombre dans un `<InputNumber>` et laisse AntD le valider. */
function saisirNombre(id: string, valeur: string): void {
  const entree = champ(id) as HTMLInputElement;
  fireEvent.change(entree, { target: { value: valeur } });
  fireEvent.blur(entree);
}

/**
 * La ligne du tableau qui porte ce texte.
 *
 * Le texte passé doit être **unique dans le document** : « Magasin central de
 * Kipé » ne l'est pas — trois soldes y sont — et c'est pourquoi les lignes
 * sont retrouvées ici par leur référence de pièce, leur demandeur ou leur
 * nature, jamais par leur lieu.
 */
async function ligne(texte: string | RegExp): Promise<HTMLElement> {
  const cellule = await screen.findByText(texte, {}, { timeout: 8000 });
  return cellule.closest('tr') as HTMLElement;
}

/** Le corps de la boîte de dialogue ouverte, pour y chercher sans ambiguïté. */
function boiteOuverte(): HTMLElement {
  const boite = document.querySelector('.ant-modal-body');
  if (!boite) throw new Error('Aucune boîte de dialogue ouverte.');
  return boite as HTMLElement;
}

/** Le tableau des soldes est chargé. Ancre UNIQUE : un seul solde à Nongo. */
async function attendreEtat(): Promise<void> {
  await screen.findByText('Dépôt de la Villa de Nongo', {}, { timeout: 8000 });
}

async function ouvrirSortie(): Promise<void> {
  const user = userEvent.setup({ delay: null });
  await attendreEtat();
  await user.click(screen.getByRole('button', { name: /Enregistrer une sortie/ }));
  await screen.findByText("C'est ce geste qui impute le chantier", {}, { timeout: 8000 });
}

async function ouvrirReception(): Promise<void> {
  const user = userEvent.setup({ delay: null });
  await attendreEtat();
  await user.click(screen.getByRole('button', { name: /Enregistrer une réception/ }));
  await screen.findByText('Une réception ne fait monter aucun coût de chantier', {}, { timeout: 8000 });
}

/** Passe au journal des mouvements, et attend qu'il soit là. */
async function ouvrirJournal(): Promise<void> {
  const user = userEvent.setup({ delay: null });
  await attendreEtat();
  await user.click(screen.getByRole('tab', { name: 'Journal des mouvements' }));
  await screen.findByText('F-2026-0142', {}, { timeout: 8000 });
}

/** Remplit la sortie de bout en bout : 12 sacs de ciment vers la Villa de Nongo. */
async function remplirSortie(): Promise<void> {
  await choisirOption('sortie-lieu', 'Magasin central de Kipé');
  await choisirOption('sortie-article', 'CIM-42 — Ciment CPJ 42,5');
  saisirNombre('sortie-quantite', '12');
  await choisirOption('sortie-chantier', 'Villa de Nongo');
  fireEvent.change(champ('sortie-demandeur'), { target: { value: 'Mamadou Diallo' } });
}

function dernierPost(): { adresse: string; corps: Record<string, unknown> } {
  const [adresse, corps] = post.mock.calls[post.mock.calls.length - 1] as [string, Record<string, unknown>];
  return { adresse, corps };
}

// ---------------------------------------------------------------------------

describe("L'état du stock — par lieu et par article", () => {
  it('montre le même article dans deux lieux, à deux coûts moyens différents', async () => {
    monter();

    await attendreEtat();
    // Trois soldes au magasin central, un au dépôt de Nongo.
    expect(screen.getAllByText('Magasin central de Kipé').length).toBe(3);

    // Le coût moyen est par (article, LIEU) : un coût global ne saurait pas
    // dire ce que vaut le stock d'un dépôt.
    expect(screen.getByText(/4\s750\sFCFA/)).toBeInTheDocument();
    expect(screen.getByText(/5\s100\sFCFA/)).toBeInTheDocument();

    // Et les valeurs propres à chaque lieu, telles que le serveur les émet.
    expect(screen.getByText(/1\s520\s000\sFCFA/)).toBeInTheDocument();
    expect(screen.getByText(/408\s000\sFCFA/)).toBeInTheDocument();
  }, 15000);

  it('affiche les quantités à quatre décimales — « 18,75 m³ », jamais « 0 »', async () => {
    monter();

    // `formatMoney` arrondirait à l'unité et collerait « FCFA » derrière : il
    // ne convient à aucune quantité.
    expect(await screen.findByText('18,75 m³', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('320 sac')).toBeInTheDocument();
  }, 15000);

  it('dit ce que veut dire une ligne à zéro plutôt que de la laisser muette', async () => {
    monter();

    const ligneFer = await ligne('Fer à béton HA 12');
    expect(within(ligneFer).getByText(/plus rien ici/)).toBeInTheDocument();
  }, 15000);

  it('« masquer les lignes à zéro » part en paramètre de requête, jamais en tri local', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await attendreEtat();
    await user.click(screen.getByRole('checkbox', { name: 'Masquer les lignes à zéro' }));

    await waitFor(() =>
      expect(
        get.mock.calls.some((appel: unknown[]) => /stock\/balances\?onlyInStock=true/.test(String(appel[0])))
      ).toBe(true)
    );
  }, 15000);

  it('les filtres de lieu et d’article partent en requête', async () => {
    monter();

    await attendreEtat();
    await choisirOption('filtre-lieu-stock', 'Magasin central de Kipé');

    await waitFor(() =>
      expect(
        get.mock.calls.some((appel: unknown[]) =>
          new RegExp(`stock/balances\\?locationId=${MAGASIN}`).test(String(appel[0]))
        )
      ).toBe(true)
    );

    await choisirOption('filtre-article-stock', 'CIM-42 — Ciment CPJ 42,5');

    await waitFor(() =>
      expect(get.mock.calls.some((appel: unknown[]) => new RegExp(`itemId=${CIMENT}`).test(String(appel[0])))).toBe(
        true
      )
    );
  }, 20000);

  it('n’affiche aucun total recalculé : le contrat n’offre pas de résumé du stock', async () => {
    monter();

    await attendreEtat();
    // La somme des quatre valeurs vaudrait 2 171 750. Elle ne doit apparaître
    // nulle part : un total d'écran changerait avec les filtres.
    expect(screen.queryByText(/2\s171\s750/)).not.toBeInTheDocument();
  }, 15000);
});

describe('Le journal des mouvements', () => {
  it('affiche `totalValue` tel quel, jamais « quantité × prix unitaire »', async () => {
    monter();
    await ouvrirJournal();

    const ligneSortie = await ligne('Fatoumata Camara, conductrice de travaux');
    // 25 × 1 900 = 47 500, mais le serveur émet 47 503 : la dernière sortie a
    // emporté la valeur résiduelle de l'emplacement.
    expect(within(ligneSortie).getByText(/47\s503\sFCFA/)).toBeInTheDocument();
    expect(within(ligneSortie).queryByText(/47\s500\sFCFA/)).not.toBeInTheDocument();
  }, 20000);

  it('montre le sens du mouvement par un signe, et les quantités à quatre décimales', async () => {
    monter();
    await ouvrirJournal();

    const ligneAjustement = await ligne(STOCK_MOVEMENT_TYPE_LABELS.ADJUSTMENT);
    expect(within(ligneAjustement).getByText('− 0,25 m³')).toBeInTheDocument();

    const ligneReception = await ligne('F-2026-0142');
    expect(within(ligneReception).getByText('+ 400 sac')).toBeInTheDocument();
  }, 20000);

  it('dit qu’une réception n’impute aucun chantier, plutôt que de laisser la case vide', async () => {
    monter();
    await ouvrirJournal();

    const ligneReception = await ligne('F-2026-0142');
    expect(within(ligneReception).getByText('Aucune imputation')).toBeInTheDocument();

    // La sortie, elle, porte son chantier, son poste et son demandeur.
    const ligneSortie = await ligne('Fatoumata Camara, conductrice de travaux');
    expect(within(ligneSortie).getByText('Résidence Ratoma')).toBeInTheDocument();
  }, 20000);

  it('les filtres de nature et de période partent en requête', async () => {
    monter();
    await ouvrirJournal();

    await choisirOption('journal-nature', 'Sortie vers un chantier');
    await waitFor(() =>
      expect(get.mock.calls.some((appel: unknown[]) => /stock\/movements\?type=ISSUE/.test(String(appel[0])))).toBe(
        true
      )
    );

    const du = champ('journal-du') as HTMLInputElement;
    fireEvent.change(du, { target: { value: '01/09/2026' } });
    fireEvent.keyDown(du, { key: 'Enter', code: 'Enter' });

    await waitFor(() =>
      expect(get.mock.calls.some((appel: unknown[]) => /from=2026-09-01/.test(String(appel[0])))).toBe(true)
    );
  }, 25000);

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    get.mockImplementation(async () => {
      throw new Error('panne');
    });
    monter();

    expect(
      await screen.findByText("Impossible de charger l'état du stock.", {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Réessayer' }).length).toBeGreaterThanOrEqual(1);
  }, 15000);
});

describe('C’est la sortie qui impute, pas la livraison (principe P-7)', () => {
  it('le dit en tête de l’écran, avant tout le reste', async () => {
    monter();

    expect(
      await screen.findByText("C'est la sortie qui impute le chantier, pas la livraison", {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByText(/aucun coût de chantier ne bouge à ce moment-là/i)).toBeInTheDocument();
  }, 15000);

  it('le redit dans le formulaire de réception, là où l’on se trompera', async () => {
    monter();
    await ouvrirReception();

    expect(screen.getByText('Une réception ne fait monter aucun coût de chantier')).toBeInTheDocument();
    expect(screen.getByText(/c'est la sortie vers un chantier qui l'imputera/i)).toBeInTheDocument();
  }, 20000);
});

describe('Le prix d’une sortie n’est pas saisi (principe P-4)', () => {
  it('le formulaire n’offre aucun champ de montant, sous aucun nom', async () => {
    monter();
    await ouvrirSortie();

    expect(screen.queryByLabelText(/^Prix/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Montant/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Coût moyen/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Valeur/i)).not.toBeInTheDocument();
    // Et l'écran dit pourquoi, plutôt que de le laisser deviner.
    expect(screen.getByText(/ne demande/i)).toBeInTheDocument();
  }, 20000);

  it('nomme son aperçu « aperçu », et dit que le serveur tranchera', async () => {
    monter();
    await ouvrirSortie();
    await remplirSortie();

    expect(await screen.findByText(/Aperçu\s*:/, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/Aperçu indicatif seulement/i)).toBeInTheDocument();
    expect(screen.getByText(/Aucun prix n'est saisi ni envoyé/i)).toBeInTheDocument();
    // 12 sacs au coût moyen de 4 750 : l'aperçu, et rien de plus.
    expect(screen.getByText(/57\s000\sFCFA/)).toBeInTheDocument();
  }, 25000);

  it('poste exactement les sept champs du schéma, et AUCUN prix', async () => {
    const user = userEvent.setup({ delay: null });
    monter();
    await ouvrirSortie();
    await remplirSortie();

    await user.click(screen.getByRole('button', { name: 'Enregistrer la sortie' }));

    await waitFor(() => expect(post).toHaveBeenCalled());

    const { adresse, corps } = dernierPost();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/issues`);
    expect(Object.keys(corps).sort()).toEqual([
      'costCategoryId',
      'issueDate',
      'itemId',
      'locationId',
      'quantity',
      'requestedBy',
      'siteId'
    ]);

    // Le schéma serveur est `.strict()` : un de ces trois champs vaudrait un
    // 400, et laisserait croire qu'un prix saisi a été pris en compte.
    expect(corps).not.toHaveProperty('unitCost');
    expect(corps).not.toHaveProperty('totalValue');
    expect(corps).not.toHaveProperty('averageUnitCost');
    // `tenantId` est dans le CHEMIN, jamais dans le corps.
    expect(corps).not.toHaveProperty('tenantId');

    expect(corps).toMatchObject({
      locationId: MAGASIN,
      itemId: CIMENT,
      quantity: 12,
      siteId: NONGO,
      // Pré-sélectionné depuis la PROPOSITION de l'article, et envoyé parce
      // que l'utilisateur ne l'a pas changé.
      costCategoryId: POSTE_GROS_OEUVRE,
      requestedBy: 'Mamadou Diallo',
      issueDate: AUJOURDHUI
    });
  }, 30000);
});

describe('Une sortie supérieure au stock est refusée, et l’écran le montre avant', () => {
  it('affiche le stock disponible à côté du champ de quantité', async () => {
    monter();
    await ouvrirSortie();

    // Avant tout choix, l'écran dit quoi faire plutôt que d'annoncer zéro.
    expect(screen.getByText(/Choisissez un lieu et un article pour voir le stock disponible/i)).toBeInTheDocument();

    await choisirOption('sortie-lieu', 'Magasin central de Kipé');
    await choisirOption('sortie-article', 'CIM-42 — Ciment CPJ 42,5');

    expect(await screen.findByText(/Stock disponible dans ce lieu/i, {}, { timeout: 8000 })).toBeInTheDocument();
    // Dans la boîte, et non dans le tableau derrière : « 320 sac » y figure
    // aussi, et le chercher partout ne prouverait rien.
    expect(within(boiteOuverte()).getByText('320 sac')).toBeInTheDocument();
  }, 25000);

  it('avertit dès que la quantité dépasse le stock, et dit que le geste juste est un inventaire', async () => {
    monter();
    await ouvrirSortie();

    await choisirOption('sortie-lieu', 'Magasin central de Kipé');
    await choisirOption('sortie-article', 'CIM-42 — Ciment CPJ 42,5');
    saisirNombre('sortie-quantite', '400');

    expect(
      await screen.findByText('Cette sortie dépasse le stock disponible, et sera refusée', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByText(/le geste juste est un inventaire/i)).toBeInTheDocument();
  }, 25000);

  it('relaie le message du serveur tel quel quand il refuse', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockRejectedValue({
      response: { data: { message: 'Stock insuffisant : 320 sac disponibles dans ce lieu.' } }
    });
    monter();
    await ouvrirSortie();
    await remplirSortie();

    await user.click(screen.getByRole('button', { name: 'Enregistrer la sortie' }));

    // Le serveur seul connaît l'état réel au moment de l'écriture : une
    // phrase générique perdrait le chiffre.
    expect(
      await screen.findByText('Stock insuffisant : 320 sac disponibles dans ce lieu.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
  }, 30000);
});

describe('Le poste est exigé, et la proposition de l’article n’a aucune autorité', () => {
  it('pré-sélectionne le poste proposé, le dit, et le laisse changer', async () => {
    monter();
    await ouvrirSortie();

    await choisirOption('sortie-article', 'CIM-42 — Ciment CPJ 42,5');

    expect(await screen.findByText(/est le poste/i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/C'est la sortie qui décide du poste, jamais l'article/i)).toBeInTheDocument();
    // Pré-sélectionné, donc visible dans le sélecteur.
    expect(champ('sortie-poste').closest('.ant-select')?.textContent).toMatch(/Gros œuvre/);

    // Et modifiable : le changement l'emporte sur la proposition.
    await choisirOption('sortie-poste', 'Couverture');
    expect(champ('sortie-poste').closest('.ant-select')?.textContent).toMatch(/Couverture/);
  }, 25000);

  it('dit qu’un article sans proposition est un cas normal, et exige quand même le poste', async () => {
    monter();
    await ouvrirSortie();

    await choisirOption('sortie-article', 'FER-12 — Fer à béton HA 12');

    expect(
      await screen.findByText(/Cet article ne propose aucun poste, et c'est un cas normal/i, {}, { timeout: 8000 })
    ).toBeInTheDocument();
  }, 25000);
});

describe('Le demandeur est exigé (besoin S3)', () => {
  it('sans demandeur, l’envoi reste fermé — un matériau sans nom disparaît sans réponse', async () => {
    monter();
    await ouvrirSortie();

    await choisirOption('sortie-lieu', 'Magasin central de Kipé');
    await choisirOption('sortie-article', 'CIM-42 — Ciment CPJ 42,5');
    saisirNombre('sortie-quantite', '12');
    await choisirOption('sortie-chantier', 'Villa de Nongo');

    expect(screen.getByRole('button', { name: 'Enregistrer la sortie' })).toBeDisabled();
    expect(screen.getByText(/c'est la personne qui répond de cette marchandise/i)).toBeInTheDocument();

    fireEvent.change(champ('sortie-demandeur'), { target: { value: 'Mamadou Diallo' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer la sortie' })).toBeEnabled());
  }, 30000);
});

describe('Une réception s’adosse à une facture fournisseur validée (besoin S2)', () => {
  it('ne propose que les factures validées du fournisseur choisi', async () => {
    monter();
    await ouvrirReception();

    await choisirOption('reception-fournisseur', 'Quincaillerie du Niger');
    fireEvent.mouseDown(champ('reception-facture'));

    await screen.findByText(/F-2026-0142/, {}, { timeout: 8000 });
    // Le brouillon n'est pas proposé : le serveur le refuserait.
    expect(screen.queryByText(/F-2026-0199/)).not.toBeInTheDocument();
  }, 25000);

  it('poste les quatre champs du schéma, avec une ligne par article', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockResolvedValue({ data: { data: [MOUVEMENTS[0], MOUVEMENTS[0]] } });
    monter();
    await ouvrirReception();

    await choisirOption('reception-lieu', 'Magasin central de Kipé');
    await choisirOption('reception-fournisseur', 'Quincaillerie du Niger');
    await choisirOption('reception-facture', /F-2026-0142/);

    await choisirOption('reception-article-0', 'CIM-42 — Ciment CPJ 42,5');
    saisirNombre('reception-quantite-0', '400');
    saisirNombre('reception-prix-0', '4700');

    await user.click(screen.getByRole('button', { name: /Ajouter une ligne/ }));
    await choisirOption('reception-article-1', 'SAB-00 — Sable lavé');
    // Quatre décimales dès la saisie : on reçoit des mètres cubes.
    saisirNombre('reception-quantite-1', '24.5');
    // Le zéro est accepté — un don, une reprise, une chute récupérée.
    saisirNombre('reception-prix-1', '0');

    await user.click(screen.getByRole('button', { name: 'Enregistrer la réception' }));

    await waitFor(() => expect(post).toHaveBeenCalled());

    const { adresse, corps } = dernierPost();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/receipts`);
    expect(Object.keys(corps).sort()).toEqual(['lines', 'locationId', 'receiptDate', 'supplierInvoiceId']);
    expect(corps).not.toHaveProperty('tenantId');
    // `supplierInvoiceId` n'est PAS une répétition : le chemin ne le porte pas,
    // et c'est lui qui valorise la réception.
    expect(corps.supplierInvoiceId).toBe('facture-0142');
    expect(corps.receiptDate).toBe(AUJOURDHUI);
    expect(corps.lines).toEqual([
      { itemId: CIMENT, quantity: 400, unitCost: 4_700 },
      { itemId: SABLE, quantity: 24.5, unitCost: 0 }
    ]);
  }, 40000);

  it('sans facture, l’envoi reste fermé : une entrée sans pièce est une valeur venue de nulle part', async () => {
    monter();
    await ouvrirReception();

    await choisirOption('reception-lieu', 'Magasin central de Kipé');
    await choisirOption('reception-article-0', 'CIM-42 — Ciment CPJ 42,5');
    saisirNombre('reception-quantite-0', '400');
    saisirNombre('reception-prix-0', '4700');

    expect(screen.getByRole('button', { name: 'Enregistrer la réception' })).toBeDisabled();
    expect(screen.getByText(/La facture est/)).toBeInTheDocument();
  }, 30000);
});

describe('Vocabulaire (P-1 du PRD)', () => {
  it('n’affiche jamais « débit » ni « crédit » sur les deux onglets — « débiteur » compris', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await attendreEtat();
    // Le balayage est volontairement large : « débiteur » contient « débit ».
    expect(corpsDuDocument()).not.toMatch(/\bdebit/);
    expect(corpsDuDocument()).not.toMatch(/\bcredit/);

    await user.click(screen.getByRole('tab', { name: 'Journal des mouvements' }));
    await ligne('Fatoumata Camara, conductrice de travaux');
    expect(corpsDuDocument()).not.toMatch(/\bdebit/);
    expect(corpsDuDocument()).not.toMatch(/\bcredit/);
  }, 20000);

  it('n’affiche pas davantage ces mots dans les deux formulaires', async () => {
    monter();

    await ouvrirReception();
    expect(corpsDuDocument()).not.toMatch(/\bdebit/);
    expect(corpsDuDocument()).not.toMatch(/\bcredit/);

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    await ouvrirSortie();
    await remplirSortie();
    expect(corpsDuDocument()).not.toMatch(/\bdebit/);
    expect(corpsDuDocument()).not.toMatch(/\bcredit/);
  }, 35000);
});
