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
  StockAbilities,
  StockBalanceView,
  StockFieldContext,
  StockInvoiceReceiptsView,
  StockLocationView,
  StockMeta,
  StockMovementView,
  StockReceivableInvoice
} from '../../types/finance-stock-controle-types';

/**
 * Le stock au quotidien — lot 5, deuxième sous-lot (PRD E9, besoins S2, S3,
 * S4), refondu au lot 040 (contrôle du stock de chantier, ecrans §5 et §11.2).
 *
 * Comme `retenues-de-garantie.test.tsx`, ce fichier monte l'écran **par-dessus
 * un `apiClient` simulé**, jamais par-dessus un service doublé : la garantie
 * de corps de requête vaut alors pour ce que l'écran envoie réellement, geste
 * par geste.
 *
 * Ce que ce fichier surveille en priorité :
 *
 * 1. **Le prix d'une sortie n'est PAS saisi**, et le corps posté est la forme
 *    multi-lignes `IssueRequest` (preneur OU demandeur, `clientRequestId`).
 * 2. **C'est la sortie qui impute, pas la livraison** (P-7) — dit à qui voit
 *    les valeurs.
 * 3. **Le serveur masque, l'écran n'invente pas** : sans valeurs, aucune
 *    colonne ni aucun montant ; sur un lieu en comptage, « Comptage en cours »,
 *    jamais « 0 FCFA ».
 * 4. **Un réessai après une coupure ne double rien** : le même
 *    `clientRequestId` repart, et un rejeu (`200`) dit « déjà enregistrée ».
 * 5. **`quantity × unitCost` ne fait pas `totalValue`**, et les quantités
 *    portent quatre décimales.
 * 6. **Vocabulaire** : jamais « débit » ni « crédit », et aucun mot qui juge
 *    une personne.
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

const ecran = vi.hoisted(() => ({ mobile: false }));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () =>
    ecran.mobile
      ? { screens: {}, active: 'xs', isMobile: true, isTablet: false, isDesktop: false }
      : { screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true }
}));

vi.mock('../../utils/save-blob', () => ({
  saveBlob: vi.fn(),
  filenameFromDisposition: (disposition: unknown, secours: string) => {
    const trouve = String(disposition ?? '').match(/filename="?([^";]+)"?/i);
    return trouve?.[1] ?? secours;
  }
}));

// Le canvas manque à jsdom : la réduction d'image rend le fichier tel quel.
vi.mock('../../utils/downscale-image', () => ({
  downscaleImageFile: vi.fn(async (file: File) => file)
}));

import apiClient from '../../utils/api-client';
import { saveBlob } from '../../utils/save-blob';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'agence-1';

const CIMENT = 'article-ciment-01';
const FER = 'article-fer-02';
const SABLE = 'article-sable-03';
const MAGASIN = 'lieu-magasin-01';
const DEPOT_RIVIERA = 'lieu-riviera-02';
const RIVIERA = 'chantier-riviera';
const COCODY = 'chantier-cocody';
const POSTE_GROS_OEUVRE = 'poste-gros-oeuvre';
const POSTE_COUVERTURE = 'poste-couverture';
const PRENEUR = 'preneur-kone';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Le formulaire pré-remplit ses dates à aujourd'hui : rien n'est écrit en dur. */
const AUJOURDHUI = dayjs().format('YYYY-MM-DD');

// ---------------------------------------------------------------------------
// Jeux d'essai
// ---------------------------------------------------------------------------

function lieu(partiel: Partial<StockLocationView> & Pick<StockLocationView, 'id' | 'label'>): StockLocationView {
  return {
    tenantId: TENANT,
    kind: 'WAREHOUSE',
    siteId: null,
    siteLabel: null,
    isActive: true,
    countInProgress: null,
    siteClosed: false,
    openingCountSuggested: false,
    toRecount: [],
    ...partiel
  };
}

const TOUS_LES_DROITS: StockAbilities = {
  canReceive: true,
  canIssue: true,
  canTransfer: true,
  canCount: true,
  canValidateCount: true,
  canDispose: true,
  canManageTakers: true,
  valuesVisible: true,
  canViewAlerts: true,
  canManageSettings: true
};

/** Le magasinier : il reçoit, sort, transfère et compte ; il ne voit aucune valeur. */
const MAGASINIER: Partial<StockAbilities> = {
  canValidateCount: false,
  canDispose: false,
  valuesVisible: false,
  canViewAlerts: false,
  canManageSettings: false
};

const FACTURE_0142: StockReceivableInvoice = {
  id: 'facture-0142',
  reference: 'F-2026-0142',
  supplierName: 'Quincaillerie du Niger',
  invoiceDate: '2026-09-01',
  siteId: null,
  siteName: null,
  receiptCount: 1,
  lastReceiptAt: '2026-09-02T08:12:00.000Z',
  amount: 2_198_500
};

const FACTURE_0151: StockReceivableInvoice = {
  id: 'facture-0151',
  reference: 'F-2026-0151',
  supplierName: 'Ciments d’Abidjan',
  invoiceDate: '2026-09-05',
  siteId: RIVIERA,
  siteName: 'Villa de la Riviera',
  receiptCount: 0,
  lastReceiptAt: null,
  amount: 408_000
};

function contexteTerrain(
  options: { abilities?: Partial<StockAbilities>; requireTaker?: boolean } = {}
): StockFieldContext {
  return {
    locations: [
      lieu({ id: MAGASIN, label: "Magasin central d'Angré" }),
      lieu({
        id: DEPOT_RIVIERA,
        kind: 'SITE',
        label: 'Dépôt de la Villa Riviera',
        siteId: RIVIERA,
        siteLabel: 'Villa de la Riviera'
      })
    ],
    sites: [
      {
        id: RIVIERA,
        name: 'Villa de la Riviera',
        status: 'IN_PROGRESS',
        closed: false,
        stockEnabled: true,
        locationId: DEPOT_RIVIERA
      },
      {
        id: COCODY,
        name: 'Résidence Cocody',
        status: 'IN_PROGRESS',
        closed: false,
        stockEnabled: false,
        locationId: null
      },
      {
        id: 'chantier-clos',
        name: 'Chantier clos du Plateau',
        status: 'CLOSED',
        closed: true,
        stockEnabled: false,
        locationId: null
      }
    ],
    costCategories: [
      { id: POSTE_GROS_OEUVRE, label: 'Gros œuvre' },
      { id: POSTE_COUVERTURE, label: 'Couverture' }
    ],
    items: [
      {
        id: CIMENT,
        reference: 'CIM-42',
        label: 'Ciment CPJ 42,5',
        unit: 'sac',
        category: 'Gros œuvre',
        defaultCostCategoryId: POSTE_GROS_OEUVRE
      },
      {
        id: FER,
        reference: 'FER-12',
        label: 'Fer à béton HA 12',
        unit: 'barre',
        category: 'Gros œuvre',
        defaultCostCategoryId: null
      },
      { id: SABLE, reference: 'SAB-00', label: 'Sable lavé', unit: 'm³', category: null, defaultCostCategoryId: null }
    ],
    takers: [
      {
        id: PRENEUR,
        label: 'Koné Ibrahim — Équipe maçonnerie',
        fullName: 'Koné Ibrahim',
        teamOrCompany: 'Équipe maçonnerie',
        phone: null,
        employeeId: null,
        contractorId: null,
        linkedPersonLabel: null,
        isActive: true,
        createdAt: '2026-09-01T08:00:00.000Z'
      }
    ],
    receivableInvoices: [FACTURE_0142, FACTURE_0151],
    reasonCodes: {
      count: ['BREAKAGE', 'COUNTING_ERROR', 'UNEXPLAINED_DISAPPEARANCE', 'OTHER'],
      scrap: ['BREAKAGE', 'DETERIORATION', 'OTHER'],
      supplierReturn: ['NON_CONFORMING', 'DAMAGED_ON_DELIVERY', 'EXCESS_DELIVERY', 'OTHER'],
      transfer: ['SITE_SUPPLY', 'RETURN_TO_WAREHOUSE', 'OTHER']
    },
    settings: { requireTaker: options.requireTaker ?? false, backdatingLimitDays: 7 },
    abilities: { ...TOUS_LES_DROITS, ...(options.abilities ?? {}) },
    people: []
  };
}

/**
 * Quatre soldes, et chacun porte une règle. Le ciment est en stock dans DEUX
 * lieux, à deux coûts moyens différents : le coût moyen est par (article, LIEU).
 */
const SOLDES: StockBalanceView[] = [
  {
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: MAGASIN,
    locationLabel: "Magasin central d'Angré",
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
    locationId: DEPOT_RIVIERA,
    locationLabel: 'Dépôt de la Villa Riviera',
    quantity: 80,
    value: 408_000,
    averageUnitCost: 5_100,
    currency: 'XOF'
  },
  {
    itemId: FER,
    itemReference: 'FER-12',
    itemLabel: 'Fer à béton HA 12',
    itemUnit: 'barre',
    locationId: MAGASIN,
    locationLabel: "Magasin central d'Angré",
    quantity: 0,
    value: 0,
    averageUnitCost: 0,
    currency: 'XOF'
  },
  {
    itemId: SABLE,
    itemReference: 'SAB-00',
    itemLabel: 'Sable lavé',
    itemUnit: 'm³',
    locationId: MAGASIN,
    locationLabel: "Magasin central d'Angré",
    quantity: 18.75,
    value: 243_750,
    averageUnitCost: 13_000,
    currency: 'XOF'
  }
];

/** Les mêmes soldes, tels que le serveur les rend sans STOCK_VALUES_VIEW. */
function sansValeurs(soldes: StockBalanceView[]): StockBalanceView[] {
  return soldes.map(solde => ({ ...solde, value: null, averageUnitCost: null }));
}

function mouvement(partiel: Partial<StockMovementView> & Pick<StockMovementView, 'id' | 'type'>): StockMovementView {
  return {
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: MAGASIN,
    locationLabel: "Magasin central d'Angré",
    movementDate: '2026-09-02T00:00:00.000Z',
    quantity: 1,
    isDecrease: false,
    unitCost: 0,
    totalValue: 0,
    currency: 'XOF',
    quantityAfter: 0,
    valueAfter: 0,
    siteId: null,
    siteLabel: null,
    costCategoryLabel: null,
    requestedBy: null,
    takerId: null,
    takerLabel: null,
    supplierInvoiceId: null,
    supplierInvoiceReference: null,
    transferGroupId: null,
    stockCountId: null,
    slipId: null,
    slipNumber: null,
    reasonCode: null,
    reason: null,
    valuationSource: null,
    supplierCreditValue: null,
    createdByUserId: 'u1',
    createdByLabel: 'Aissatou Brou',
    createdAt: '2026-09-02T08:12:00.000Z',
    entryLagDays: 0,
    attachmentsCount: 0,
    ...partiel
  };
}

const MOUVEMENTS: StockMovementView[] = [
  mouvement({
    id: 'mvt-receipt-ciment',
    type: 'RECEIPT',
    quantity: 400,
    unitCost: 4_700,
    totalValue: 1_880_000,
    quantityAfter: 400,
    valueAfter: 1_880_000,
    supplierInvoiceId: 'facture-0142',
    supplierInvoiceReference: 'F-2026-0142',
    slipId: 'bon-br-42',
    slipNumber: 'BR-2026-00042',
    valuationSource: 'INVOICE_LINE',
    attachmentsCount: 2
  }),
  /**
   * LA LIGNE QUI COMPTE : `25 × 1 900` vaut 47 500, mais `totalValue` vaut
   * 47 503. La sortie a vidé l'emplacement et emporté la valeur résiduelle.
   */
  mouvement({
    id: 'mvt-issue-fer',
    type: 'ISSUE',
    itemId: FER,
    itemReference: 'FER-12',
    itemLabel: 'Fer à béton HA 12',
    itemUnit: 'barre',
    movementDate: '2026-09-11T00:00:00.000Z',
    quantity: 25,
    isDecrease: true,
    unitCost: 1_900,
    totalValue: 47_503,
    quantityAfter: 0,
    valueAfter: 0,
    siteId: COCODY,
    siteLabel: 'Résidence Cocody',
    costCategoryLabel: 'Gros œuvre',
    requestedBy: 'Fatoumata Kouadio, conductrice de travaux',
    takerId: PRENEUR,
    takerLabel: 'Fatoumata Kouadio — Conduite de travaux',
    slipId: 'bon-bs-57',
    slipNumber: 'BS-2026-00057',
    createdByLabel: 'Ibrahima Yao',
    createdAt: '2026-09-14T16:20:00.000Z',
    entryLagDays: 3
  }),
  mouvement({
    id: 'mvt-adjustment-sable',
    type: 'ADJUSTMENT',
    itemId: SABLE,
    itemReference: 'SAB-00',
    itemLabel: 'Sable lavé',
    itemUnit: 'm³',
    movementDate: '2026-09-16T00:00:00.000Z',
    quantity: 0.25,
    isDecrease: true,
    unitCost: 13_000,
    totalValue: 3_250,
    quantityAfter: 18.75,
    valueAfter: 243_750,
    reasonCode: 'COUNTING_ERROR',
    createdAt: '2026-09-16T17:30:00.000Z'
  })
];

function sansValeursMouvements(mouvements: StockMovementView[]): StockMovementView[] {
  return mouvements.map(m => ({ ...m, unitCost: null, totalValue: null, valueAfter: null, valuationSource: null }));
}

const BON_SORTIE = { id: 'bon-bs-58', kind: 'ISSUE', number: 'BS-2026-00058', documentDate: AUJOURDHUI, createdAt: '' };
const BON_RECEPTION = {
  id: 'bon-br-43',
  kind: 'RECEIPT',
  number: 'BR-2026-00043',
  documentDate: AUJOURDHUI,
  createdAt: ''
};

const SORTIE_RENDUE = mouvement({
  id: 'mvt-issue-cree',
  type: 'ISSUE',
  quantity: 12,
  isDecrease: true,
  unitCost: 4_750,
  totalValue: 57_000,
  quantityAfter: 308,
  valueAfter: 1_463_000,
  siteId: RIVIERA,
  siteLabel: 'Villa de la Riviera',
  requestedBy: 'Koné Ibrahim — Équipe maçonnerie',
  slipId: BON_SORTIE.id,
  slipNumber: BON_SORTIE.number
});

function receptionsDe(invoiceId: string): StockInvoiceReceiptsView {
  const facture = invoiceId === FACTURE_0142.id ? FACTURE_0142 : FACTURE_0151;
  const deja = facture.id === FACTURE_0142.id;
  return {
    invoice: {
      id: facture.id,
      reference: facture.reference,
      supplierName: facture.supplierName,
      invoiceDate: facture.invoiceDate,
      status: 'VALIDATED',
      amount: facture.amount,
      lines: deja
        ? [
            {
              id: 'ligne-0142-1',
              label: 'Ciment CPJ 42,5 — 400 sacs',
              quantity: 400,
              unitPrice: 4_700,
              amount: 1_880_000,
              hasUnitPrice: true
            }
          ]
        : [
            {
              id: 'ligne-0151-1',
              label: 'Ciment CPJ 42,5 — 80 sacs',
              quantity: 80,
              unitPrice: 5_100,
              amount: 408_000,
              hasUnitPrice: true
            }
          ]
    },
    byItem: deja
      ? [
          {
            itemId: CIMENT,
            itemLabel: 'Ciment CPJ 42,5',
            itemUnit: 'sac',
            receivedQuantity: 100,
            returnedQuantity: 10,
            returnableQuantity: 90,
            returnNeedsInvoiceLine: true
          }
        ]
      : [],
    receipts: deja
      ? [
          {
            slipId: 'bon-br-42',
            slipNumber: 'BR-2026-00042',
            receiptDate: '2026-09-02',
            createdAt: '2026-09-02T08:12:00.000Z',
            createdByLabel: 'Aissatou Brou',
            locationLabel: "Magasin central d'Angré",
            lines: [
              {
                itemId: CIMENT,
                itemLabel: 'Ciment CPJ 42,5',
                itemUnit: 'sac',
                quantity: 400,
                unitCost: 4_700,
                totalValue: 1_880_000
              }
            ]
          }
        ]
      : [],
    returns: [],
    receivedValue: deja ? 1_880_000 : 0,
    returnedValue: 0
  };
}

interface Configuration {
  contexte?: StockFieldContext;
  soldes?: StockBalanceView[];
  soldesMeta?: Partial<StockMeta>;
  mouvements?: StockMovementView[];
  mouvementsMeta?: Partial<StockMeta>;
  pageSuivante?: StockMovementView[];
}

/** Route les GET par motif d'URL, comme le ferait le vrai serveur. */
function configurerGet(options: Configuration = {}) {
  const contexte = options.contexte ?? contexteTerrain();
  const valeursVisibles = contexte.abilities.valuesVisible;
  const meta = (complement?: Partial<StockMeta>): StockMeta => ({
    valuesVisible: valeursVisibles,
    blindLocationIds: [],
    nextCursor: null,
    ...complement
  });
  const soldes = options.soldes ?? (valeursVisibles ? SOLDES : sansValeurs(SOLDES));
  const mouvements = options.mouvements ?? (valeursVisibles ? MOUVEMENTS : sansValeursMouvements(MOUVEMENTS));

  get.mockImplementation(async (url: string) => {
    if (/\/finance\/stock\/field-context(\?|$)/.test(url)) {
      return { data: { data: contexte, meta: meta() } };
    }
    if (/\/finance\/stock\/balances(\?|$)/.test(url)) return { data: { data: soldes, meta: meta(options.soldesMeta) } };
    if (/\/finance\/stock\/movements\/authors/.test(url)) {
      return { data: { data: [{ userId: 'u1', label: 'Aissatou Brou' }] } };
    }
    if (/\/finance\/stock\/movements\/export\.csv/.test(url)) {
      return {
        data: new Blob(['date;article\n']),
        headers: { 'content-disposition': 'attachment; filename="journal-stock-2026-10-04.csv"' }
      };
    }
    if (/\/finance\/stock\/movements(\?|$)/.test(url)) {
      if (/cursor=page-2/.test(url)) {
        return { data: { data: options.pageSuivante ?? [], meta: meta({ nextCursor: null }) } };
      }
      return { data: { data: mouvements, meta: meta(options.mouvementsMeta) } };
    }
    if (/\/finance\/stock\/takers/.test(url)) return { data: { data: contexte.takers } };
    if (/\/finance\/stock\/receivable-invoices/.test(url)) {
      return { data: { data: [], meta: meta() } };
    }
    const facture = /\/finance\/stock\/supplier-invoices\/([^/]+)\/receipts/.exec(url);
    if (facture) return { data: { data: receptionsDe(facture[1]), meta: meta() } };
    return { data: { data: [] } };
  });
}

/** Une réponse d'écriture : `201` à la création, `200` pour un rejeu. */
function reponseEcriture(data: unknown, status = 201) {
  return { status, data: { data, meta: { valuesVisible: true, blindLocationIds: [] } } };
}

const COUPURE = Object.assign(new Error('Network Error'), { request: {} });

beforeEach(() => {
  vi.clearAllMocks();
  ecran.mobile = false;
  configurerGet();
  post.mockResolvedValue(reponseEcriture({ slip: BON_SORTIE, movements: [SORTIE_RENDUE] }));
});

function monter(url = `/tenant/${TENANT}/finance/stock`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const rendu = render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/stock" element={<Stock />} />
            <Route path="/tenant/:tenantId/finance/stock/magasin" element={<div>Écran Magasin ouvert</div>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
  return Object.assign(rendu, { queryClient });
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
 * Ouvre une liste déroulante AntD et clique l'option demandée, cherchée dans le
 * menu de CE sélecteur (`<id>_list`) : AntD laisse dans le document les menus
 * déjà déployés, et une recherche globale cliquerait la mauvaise option.
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

/** La ligne du tableau qui porte ce texte (unique dans le document). */
async function ligne(texte: string | RegExp): Promise<HTMLElement> {
  const cellule = await screen.findByText(texte, {}, { timeout: 8000 });
  return cellule.closest('tr') as HTMLElement;
}

function boiteOuverte(): HTMLElement {
  const boites = Array.from(document.querySelectorAll('.ant-modal-body'));
  const boite = boites[boites.length - 1];
  if (!boite) throw new Error('Aucune boîte de dialogue ouverte.');
  return boite as HTMLElement;
}

/** Le tableau des soldes est chargé. Ancre UNIQUE : un seul solde à Riviera. */
async function attendreEtat(): Promise<void> {
  await screen.findByText('Dépôt de la Villa Riviera', {}, { timeout: 8000 });
}

async function ouvrirSortie(): Promise<void> {
  const user = userEvent.setup({ delay: null });
  await attendreEtat();
  await user.click(screen.getByRole('button', { name: /Enregistrer une sortie/ }));
  await screen.findByText('Qui emporte la marchandise ?', {}, { timeout: 8000 });
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
  await screen.findByText('BR-2026-00042', {}, { timeout: 8000 });
}

/**
 * Choisit le preneur du carnet. Son sélecteur n'a pas d'identifiant propre :
 * l'option est cherchée par son texte, qu'aucun autre menu ne porte.
 */
async function choisirPreneur(): Promise<void> {
  fireEvent.mouseDown(within(boiteOuverte()).getByRole('combobox', { name: 'Preneur' }));
  const options = await screen.findAllByText('Koné Ibrahim — Équipe maçonnerie', {}, { timeout: 8000 });
  const option = options.find(element => element.closest('.ant-select-item'));
  if (!option) throw new Error('Option du preneur introuvable.');
  fireEvent.click(option);
}

/** Remplit la sortie : 12 sacs de ciment du magasin vers la Villa de la Riviera, remis à Koné. */
async function remplirSortie(options: { preneur?: boolean } = {}): Promise<void> {
  await choisirOption('sortie-lieu', "Magasin central d'Angré");
  await choisirOption('sortie-chantier', 'Villa de la Riviera');
  await choisirOption('sortie-article-0', 'CIM-42 — Ciment CPJ 42,5');
  saisirNombre('sortie-quantite-0', '12');
  if (options.preneur !== false) await choisirPreneur();
}

function dernierPost(): { adresse: string; corps: Record<string, unknown> } {
  const [adresse, corps] = post.mock.calls[post.mock.calls.length - 1] as [string, Record<string, unknown>];
  return { adresse, corps };
}

function appelsGet(motif: RegExp): string[] {
  return get.mock.calls.map((appel: unknown[]) => String(appel[0])).filter(adresse => motif.test(adresse));
}

// ---------------------------------------------------------------------------

describe("L'état du stock — par lieu et par article", () => {
  it('montre le même article dans deux lieux, à deux coûts moyens différents', async () => {
    monter();

    await attendreEtat();
    expect(screen.getAllByText("Magasin central d'Angré").length).toBe(3);
    expect(screen.getByText(/4\s750/)).toBeInTheDocument();
    expect(screen.getByText(/5\s100/)).toBeInTheDocument();
    expect(screen.getByText(/1\s520\s000/)).toBeInTheDocument();
    expect(screen.getByText(/408\s000/)).toBeInTheDocument();
  }, 15000);

  it('affiche les quantités à quatre décimales — « 18,75 m³ », jamais « 0 »', async () => {
    monter();

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

    await waitFor(() => expect(appelsGet(/stock\/balances\?onlyInStock=true/).length).toBeGreaterThan(0));
  }, 15000);

  it('les filtres de lieu et d’article partent en requête', async () => {
    monter();

    await attendreEtat();
    await choisirOption('filtre-lieu-stock', "Magasin central d'Angré");
    await waitFor(() =>
      expect(appelsGet(new RegExp(`stock/balances\\?locationId=${MAGASIN}`)).length).toBeGreaterThan(0)
    );

    await choisirOption('filtre-article-stock', 'CIM-42 — Ciment CPJ 42,5');
    await waitFor(() => expect(appelsGet(new RegExp(`itemId=${CIMENT}`)).length).toBeGreaterThan(0));
  }, 20000);

  it('n’affiche aucun total recalculé : le contrat n’offre pas de résumé du stock', async () => {
    monter();

    await attendreEtat();
    expect(screen.queryByText(/2\s171\s750/)).not.toBeInTheDocument();
  }, 15000);

  it('ne lit plus les chantiers, postes ni fournisseurs par les routes financières : le contexte terrain suffit', async () => {
    monter();

    await attendreEtat();
    expect(appelsGet(/\/stock\/field-context/).length).toBeGreaterThan(0);
    expect(appelsGet(/\/finance\/sites(\?|$)/)).toEqual([]);
    expect(appelsGet(/\/finance\/cost-categories/)).toEqual([]);
    expect(appelsGet(/\/finance\/suppliers/)).toEqual([]);
  }, 15000);
});

describe('Le serveur masque, l’écran n’invente pas (B1, A2)', () => {
  it('sans les valeurs : ni colonne de valeur, ni montant, ni bandeau sur le coût', async () => {
    configurerGet({ contexte: contexteTerrain({ abilities: MAGASINIER }) });
    monter();

    await attendreEtat();
    expect(screen.getByText('Les valeurs du stock ne sont pas affichées pour votre rôle.')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Coût moyen unitaire' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Valeur' })).not.toBeInTheDocument();
    expect(screen.queryByText("C'est la sortie qui impute le chantier, pas la livraison")).not.toBeInTheDocument();
    expect(corpsDuDocument()).not.toMatch(/fcfa/);
    expect(screen.queryByText(/coût moyen unitaire est propre/)).not.toBeInTheDocument();
  }, 15000);

  it('un lieu en comptage, valeurs visibles : « Comptage en cours » dans la quantité, le coût moyen et la valeur', async () => {
    configurerGet({
      soldes: SOLDES.map(solde =>
        solde.locationId === DEPOT_RIVIERA ? { ...solde, quantity: null, value: null, averageUnitCost: null } : solde
      ),
      soldesMeta: { blindLocationIds: [DEPOT_RIVIERA] }
    });
    monter();

    const ligneRiviera = await ligne('Dépôt de la Villa Riviera');
    // La pastille du lieu, puis la quantité, le coût moyen et la valeur.
    expect(within(ligneRiviera).getAllByText('Comptage en cours').length).toBe(4);
    expect(normaliser(ligneRiviera.textContent ?? '')).not.toMatch(/fcfa/);
    expect(ligneRiviera.textContent).not.toMatch(/—/);
  }, 15000);
});

describe('Le journal des mouvements', () => {
  it('affiche `totalValue` tel quel, jamais « quantité × prix unitaire »', async () => {
    monter();
    await ouvrirJournal();

    const ligneSortie = await ligne('Fatoumata Kouadio, conductrice de travaux');
    expect(within(ligneSortie).getByText(/47\s503/)).toBeInTheDocument();
    expect(within(ligneSortie).queryByText(/47\s500/)).not.toBeInTheDocument();
  }, 20000);

  it('montre le sens du mouvement par un signe, et les quantités à quatre décimales', async () => {
    monter();
    await ouvrirJournal();

    const ligneAjustement = await ligne(STOCK_MOVEMENT_TYPE_LABELS.ADJUSTMENT);
    expect(within(ligneAjustement).getByText('− 0,25 m³')).toBeInTheDocument();
    expect(within(ligneAjustement).getByText('Erreur du comptage précédent')).toBeInTheDocument();

    const ligneReception = await ligne('BR-2026-00042');
    expect(within(ligneReception).getByText('+ 400 sac')).toBeInTheDocument();
  }, 20000);

  it('dit qu’une réception n’impute aucun chantier, et montre le preneur d’aujourd’hui à côté de l’instantané', async () => {
    monter();
    await ouvrirJournal();

    const ligneReception = await ligne('BR-2026-00042');
    expect(within(ligneReception).getByText('Aucune imputation')).toBeInTheDocument();

    const ligneSortie = await ligne('Fatoumata Kouadio, conductrice de travaux');
    expect(within(ligneSortie).getByText('Résidence Cocody')).toBeInTheDocument();
    expect(
      within(ligneSortie).getByText('(aujourd’hui : Fatoumata Kouadio — Conduite de travaux)')
    ).toBeInTheDocument();
  }, 20000);

  it('signale un délai de saisie par la pastille « +3 j »', async () => {
    monter();
    await ouvrirJournal();

    const ligneSortie = await ligne('Fatoumata Kouadio, conductrice de travaux');
    expect(within(ligneSortie).getByText('+3 j')).toBeInTheDocument();
  }, 20000);

  it('les filtres de nature et de période partent en requête', async () => {
    monter();
    await ouvrirJournal();

    await choisirOption('journal-nature', 'Sortie vers un chantier');
    await waitFor(() => expect(appelsGet(/stock\/movements\?type=ISSUE/).length).toBeGreaterThan(0));

    const du = champ('journal-du') as HTMLInputElement;
    fireEvent.change(du, { target: { value: '01/09/2026' } });
    fireEvent.keyDown(du, { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(appelsGet(/from=2026-09-01/).length).toBeGreaterThan(0));
  }, 45000);

  it('lit les pages par curseur : « Charger plus » envoie `cursor`, et garde les lignes déjà chargées', async () => {
    const user = userEvent.setup({ delay: null });
    configurerGet({
      mouvementsMeta: { nextCursor: 'page-2' },
      pageSuivante: [
        mouvement({ id: 'mvt-ancien', type: 'RECEIPT', slipNumber: 'BR-2026-00007', slipId: 'bon-br-7', quantity: 9 })
      ]
    });
    monter();
    await ouvrirJournal();

    expect(appelsGet(/stock\/movements\?limit=50$/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Charger plus' }));

    expect(await screen.findByText('BR-2026-00007', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(appelsGet(/stock\/movements\?.*cursor=page-2/).length).toBe(1);
    expect(screen.getByText('BR-2026-00042')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Charger plus' })).not.toBeInTheDocument();
  }, 45000);

  it('une première page relue après « Charger plus » ne perd ni ne double aucun mouvement', async () => {
    const user = userEvent.setup({ delay: null });
    configurerGet();
    const routeDeBase = get.getMockImplementation() as (url: string) => Promise<unknown>;
    const meta = (nextCursor: string | null): StockMeta => ({
      valuesVisible: true,
      blindLocationIds: [],
      nextCursor
    });
    const bon = (numero: number, id: string) =>
      mouvement({ id, type: 'RECEIPT', slipNumber: `BR-2026-${String(numero).padStart(5, '0')}`, slipId: `bon-${id}` });
    // Avant : [42, 41] puis [40]. Une réception arrive en tête (43) :
    // la première page devient [43, 42], la suivante [41, 40].
    let apres = false;
    get.mockImplementation(async (url: string) => {
      if (/\/finance\/stock\/movements(\?|$)/.test(url)) {
        if (!apres) {
          if (/cursor=c-avant/.test(url)) return { data: { data: [bon(40, 'm40')], meta: meta(null) } };
          return { data: { data: [MOUVEMENTS[0], bon(41, 'm41')], meta: meta('c-avant') } };
        }
        if (/cursor=c-apres/.test(url)) return { data: { data: [bon(41, 'm41'), bon(40, 'm40')], meta: meta(null) } };
        if (/cursor=/.test(url)) return { data: { data: [], meta: meta(null) } };
        return { data: { data: [bon(43, 'm43'), MOUVEMENTS[0]], meta: meta('c-apres') } };
      }
      return routeDeBase(url);
    });
    const { queryClient } = monter();
    await ouvrirJournal();
    await user.click(screen.getByRole('button', { name: 'Charger plus' }));
    expect(await screen.findByText('BR-2026-00040', {}, { timeout: 8000 })).toBeInTheDocument();

    // Une écriture invalide le journal : la première page est relue.
    apres = true;
    await queryClient.invalidateQueries({ queryKey: ['stock-movements'] });

    expect(await screen.findByText('BR-2026-00043', {}, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(appelsGet(/cursor=c-apres/).length).toBe(1));
    for (const numero of ['BR-2026-00043', 'BR-2026-00042', 'BR-2026-00041', 'BR-2026-00040']) {
      await waitFor(() => expect(screen.getAllByText(numero)).toHaveLength(1));
    }
    expect(screen.queryByRole('button', { name: 'Charger plus' })).not.toBeInTheDocument();
  }, 45000);

  it('sans les valeurs, les trois filtres par personne sont absents — pas désactivés', async () => {
    configurerGet({ contexte: contexteTerrain({ abilities: MAGASINIER }) });
    monter();
    await ouvrirJournal();

    expect(document.getElementById('journal-preneur')).toBeNull();
    expect(document.getElementById('journal-auteur')).toBeNull();
    expect(document.getElementById('journal-demandeur')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Prix unitaire' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Valeur du mouvement' })).not.toBeInTheDocument();
    expect(appelsGet(/movements\/authors/)).toEqual([]);
    expect(screen.getByText(/Sans les colonnes de valeur\./)).toBeInTheDocument();
  }, 20000);

  it('avec les valeurs, les filtres « Preneur » et « Saisi par » partent en requête', async () => {
    monter();
    await ouvrirJournal();

    await choisirOption('journal-auteur', 'Aissatou Brou');
    await waitFor(() => expect(appelsGet(/stock\/movements\?.*createdByUserId=u1/).length).toBeGreaterThan(0));
    await choisirOption('journal-preneur', 'Koné Ibrahim — Équipe maçonnerie');
    await waitFor(() => expect(appelsGet(new RegExp(`takerId=${PRENEUR}`)).length).toBeGreaterThan(0));
  }, 45000);

  it('exporte en CSV avec les mêmes filtres, en blob, et relaie le refus 422', async () => {
    const user = userEvent.setup({ delay: null });
    monter();
    await ouvrirJournal();
    await choisirOption('journal-nature', 'Sortie vers un chantier');

    await user.click(screen.getByRole('button', { name: /Exporter \(CSV\)/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    const appel = get.mock.calls.find((a: unknown[]) => /export\.csv/.test(String(a[0]))) as unknown[];
    expect(String(appel[0])).toMatch(/export\.csv\?type=ISSUE$/);
    expect(appel[1]).toEqual({ responseType: 'blob' });
    expect((saveBlob as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('journal-stock-2026-10-04.csv');

    const precedent = get.getMockImplementation() as (url: string) => Promise<unknown>;
    get.mockImplementation(async (url: string) => {
      if (/export\.csv/.test(url)) throw { response: { status: 422, data: new Blob(['{}']) } };
      return precedent(url);
    });
    await user.click(screen.getByRole('button', { name: /Exporter \(CSV\)/ }));
    expect(
      await screen.findByText(
        "L'export dépasse 50 000 lignes. Réduisez la période ou ajoutez un filtre.",
        {},
        { timeout: 8000 }
      )
    ).toBeInTheDocument();
  }, 60000);

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    const precedent = get.getMockImplementation() as (url: string) => Promise<unknown>;
    get.mockImplementation(async (url: string) => {
      if (/stock\/balances/.test(url)) throw new Error('panne');
      return precedent(url);
    });
    monter();

    expect(
      await screen.findByText("Impossible de charger l'état du stock.", {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Réessayer' }).length).toBeGreaterThanOrEqual(1);
  }, 15000);
});

describe('L’en-tête : les gestes affichés sont ceux que l’appelant peut faire', () => {
  it('dit en tête que c’est la sortie qui impute, pas la livraison', async () => {
    monter();

    expect(
      await screen.findByText("C'est la sortie qui impute le chantier, pas la livraison", {}, { timeout: 8000 })
    ).toBeInTheDocument();
  }, 15000);

  it('« Rebut » et « Retour au fournisseur » n’existent qu’avec `canDispose`', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await attendreEtat();
    await user.click(screen.getByRole('button', { name: /Autres mouvements/ }));
    expect(await screen.findByRole('menuitem', { name: 'Rebut' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Retour au fournisseur' })).toBeInTheDocument();
  }, 15000);

  it('le magasinier n’a pas « Autres mouvements » ; sans aucun droit d’écriture, aucun bouton', async () => {
    configurerGet({ contexte: contexteTerrain({ abilities: MAGASINIER }) });
    const { unmount } = monter();

    await attendreEtat();
    expect(screen.queryByRole('button', { name: /Autres mouvements/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enregistrer une sortie/ })).toBeInTheDocument();
    unmount();

    configurerGet({
      contexte: contexteTerrain({ abilities: { ...MAGASINIER, canReceive: false, canIssue: false } })
    });
    monter();
    await attendreEtat();
    expect(screen.queryByRole('button', { name: /Enregistrer une réception/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enregistrer une sortie/ })).not.toBeInTheDocument();
  }, 20000);

  it('sous 992 px, propose d’ouvrir l’écran Magasin', async () => {
    const user = userEvent.setup({ delay: null });
    ecran.mobile = true;
    monter();

    await user.click(await screen.findByRole('button', { name: 'Ouvrir l’écran Magasin' }, { timeout: 8000 }));
    expect(await screen.findByText('Écran Magasin ouvert')).toBeInTheDocument();
  }, 15000);

  it('un refus 403 du contexte terrain affiche l’état « refus »', async () => {
    get.mockImplementation(async () => {
      throw { response: { status: 403, data: { code: 'FORBIDDEN', message: 'Accès refusé' } } };
    });
    monter();

    expect(await screen.findByText('Le stock ne vous est pas ouvert', {}, { timeout: 8000 })).toBeInTheDocument();
  }, 15000);
});

describe('La sortie : aucun prix, un preneur, plusieurs lignes (B2, B3-R3, P-4)', () => {
  it('le formulaire n’offre aucun champ de montant, sous aucun nom', async () => {
    monter();
    await ouvrirSortie();

    const boite = boiteOuverte();
    expect(within(boite).queryByLabelText(/^Prix/)).not.toBeInTheDocument();
    expect(within(boite).queryByLabelText(/^Montant/)).not.toBeInTheDocument();
    expect(within(boite).queryByLabelText(/Coût moyen/i)).not.toBeInTheDocument();
    expect(within(boite).queryByLabelText(/Valeur/i)).not.toBeInTheDocument();
    expect(within(boite).getByText(/ne demande aucun prix/i)).toBeInTheDocument();
  }, 20000);

  it('ne propose pas un chantier clos', async () => {
    monter();
    await ouvrirSortie();

    fireEvent.mouseDown(champ('sortie-chantier'));
    await screen.findAllByText('Villa de la Riviera', {}, { timeout: 8000 });
    expect(screen.queryByText('Chantier clos du Plateau')).not.toBeInTheDocument();
  }, 20000);

  it('nomme son aperçu « aperçu », par ligne et seulement avec les valeurs', async () => {
    monter();
    await ouvrirSortie();
    await remplirSortie({ preneur: false });

    expect(await screen.findByText(/Aperçu\s*:/, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/Aperçu indicatif seulement/i)).toBeInTheDocument();
    expect(screen.getByText(/57\s000/)).toBeInTheDocument();
  }, 45000);

  it('poste la forme multi-lignes `IssueRequest`, avec le preneur et un `clientRequestId`, et AUCUN prix', async () => {
    const user = userEvent.setup({ delay: null });
    monter();
    await ouvrirSortie();
    await remplirSortie();

    await user.click(screen.getByRole('button', { name: 'Enregistrer la sortie' }));
    await waitFor(() => expect(post).toHaveBeenCalled());

    const { adresse, corps } = dernierPost();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/issues`);
    expect(Object.keys(corps).sort()).toEqual([
      'clientRequestId',
      'issueDate',
      'lines',
      'locationId',
      'siteId',
      'takerId'
    ]);
    expect(corps).toMatchObject({
      locationId: MAGASIN,
      siteId: RIVIERA,
      issueDate: AUJOURDHUI,
      takerId: PRENEUR,
      lines: [{ itemId: CIMENT, quantity: 12, costCategoryId: POSTE_GROS_OEUVRE }]
    });
    expect(String(corps.clientRequestId)).toMatch(UUID);
    expect(JSON.stringify(corps)).not.toMatch(/unitCost|totalValue|averageUnitCost|tenantId/);

    expect(await screen.findByText('Sortie enregistrée — BS-2026-00058', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Télécharger le bon \(PDF\)/ })).toBeInTheDocument();
    expect(screen.getByText('Faites signer le bon par le preneur, puis photographiez-le.')).toBeInTheDocument();
  }, 60000);

  it('preneur OU demandeur : sans l’un ni l’autre l’envoi reste fermé, un nom saisi part en `requestedBy`', async () => {
    const user = userEvent.setup({ delay: null });
    monter();
    await ouvrirSortie();
    await remplirSortie({ preneur: false });

    expect(screen.getByRole('button', { name: 'Enregistrer la sortie' })).toBeDisabled();
    // Le texte d'avant le lot prêtait une intention : il a disparu.
    expect(corpsDuDocument()).not.toMatch(/disparait sans que personne/);
    expect(screen.getByText(/Le preneur est la personne à qui la marchandise est remise/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Saisir un nom sans l’ajouter au carnet' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nom du demandeur' }), {
      target: { value: 'Mamadou Kouassi' }
    });
    const envoyer = screen.getByRole('button', { name: 'Enregistrer la sortie' });
    await waitFor(() => expect(envoyer).toBeEnabled());
    await user.click(envoyer);

    await waitFor(() => expect(post).toHaveBeenCalled());
    const { corps } = dernierPost();
    expect(corps.requestedBy).toBe('Mamadou Kouassi');
    expect(corps).not.toHaveProperty('takerId');
  }, 60000);

  it('l’agence qui exige un preneur ne propose pas de nom libre', async () => {
    configurerGet({ contexte: contexteTerrain({ requireTaker: true }) });
    monter();
    await ouvrirSortie();

    expect(screen.queryByRole('button', { name: 'Saisir un nom sans l’ajouter au carnet' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Votre agence exige un preneur du carnet pour chaque sortie et chaque transfert.')
    ).toBeInTheDocument();
  }, 20000);

  it('refuse deux lignes pour le même article et le même poste', async () => {
    const user = userEvent.setup({ delay: null });
    monter();
    await ouvrirSortie();
    await remplirSortie();

    await user.click(screen.getByRole('button', { name: /Ajouter un article/ }));
    await choisirOption('sortie-article-1', 'CIM-42 — Ciment CPJ 42,5');
    saisirNombre('sortie-quantite-1', '3');

    expect(
      await screen.findByText('Cet article est déjà dans la sortie : modifiez sa quantité.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer la sortie' })).toBeDisabled();
  }, 60000);

  it('sans les valeurs : ni aperçu, ni montant dans le message de succès', async () => {
    const user = userEvent.setup({ delay: null });
    configurerGet({ contexte: contexteTerrain({ abilities: MAGASINIER }) });
    post.mockResolvedValue(reponseEcriture({ slip: BON_SORTIE, movements: sansValeursMouvements([SORTIE_RENDUE]) }));
    monter();
    await ouvrirSortie();
    await remplirSortie();

    expect(screen.queryByText(/Aperçu\s*:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer la sortie' }));

    expect(
      await screen.findByText('Sortie enregistrée : bon BS-2026-00058.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(corpsDuDocument()).not.toMatch(/fcfa/);
  }, 60000);
});

describe('Une sortie supérieure au stock est refusée, et l’écran le montre avant', () => {
  it('affiche le stock disponible sous la ligne, et avertit au-delà', async () => {
    monter();
    await ouvrirSortie();

    expect(screen.getByText(/Choisissez un lieu et un article pour voir le stock disponible/i)).toBeInTheDocument();
    await choisirOption('sortie-lieu', "Magasin central d'Angré");
    await choisirOption('sortie-article-0', 'CIM-42 — Ciment CPJ 42,5');

    expect(await within(boiteOuverte()).findByText('320 sac', {}, { timeout: 8000 })).toBeInTheDocument();
    saisirNombre('sortie-quantite-0', '400');
    expect(
      await screen.findByText('Cette sortie dépasse le stock disponible, et sera refusée', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByText(/le geste juste est un inventaire/i)).toBeInTheDocument();
  }, 45000);

  it('un lieu en comptage ne montre aucune quantité disponible, ni avertissement de dépassement', async () => {
    configurerGet({
      contexte: contexteTerrain({ abilities: MAGASINIER }),
      soldes: sansValeurs(SOLDES).map(solde => (solde.locationId === MAGASIN ? { ...solde, quantity: null } : solde)),
      soldesMeta: { blindLocationIds: [MAGASIN] }
    });
    monter();
    await ouvrirSortie();
    await choisirOption('sortie-lieu', "Magasin central d'Angré");
    await choisirOption('sortie-article-0', 'CIM-42 — Ciment CPJ 42,5');
    saisirNombre('sortie-quantite-0', '400');

    expect(
      await screen.findByText(/la quantité disponible n’est pas affichée/, {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(within(boiteOuverte()).queryByText('320 sac')).not.toBeInTheDocument();
    expect(screen.queryByText('Cette sortie dépasse le stock disponible, et sera refusée')).not.toBeInTheDocument();
  }, 45000);

  it('relaie le message du serveur tel quel quand il refuse', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockRejectedValue({
      response: { status: 409, data: { code: 'STOCK_INSUFFICIENT', message: 'Stock insuffisant dans ce lieu.' } }
    });
    monter();
    await ouvrirSortie();
    await remplirSortie();

    await user.click(screen.getByRole('button', { name: 'Enregistrer la sortie' }));
    expect(await screen.findByText('Stock insuffisant dans ce lieu.', {}, { timeout: 8000 })).toBeInTheDocument();
  }, 60000);
});

describe('Un réessai après une coupure ne double rien (B3-R2)', () => {
  it('le même `clientRequestId` repart, et un rejeu dit « déjà enregistrée »', async () => {
    const user = userEvent.setup({ delay: null });
    post
      .mockRejectedValueOnce(COUPURE)
      .mockResolvedValueOnce(reponseEcriture({ slip: BON_SORTIE, movements: [SORTIE_RENDUE] }, 200));
    monter();
    await ouvrirSortie();
    await remplirSortie();

    await user.click(screen.getByRole('button', { name: 'Enregistrer la sortie' }));
    expect(await screen.findByText('La connexion a été perdue.', {}, { timeout: 8000 })).toBeInTheDocument();
    // Les saisies sont conservées.
    expect(champ('sortie-quantite-0')).toHaveValue('12');

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(
      await screen.findByText('Sortie déjà enregistrée — BS-2026-00058', {}, { timeout: 8000 })
    ).toBeInTheDocument();

    expect(post).toHaveBeenCalledTimes(2);
    const premier = (post.mock.calls[0][1] as Record<string, unknown>).clientRequestId;
    const second = (post.mock.calls[1][1] as Record<string, unknown>).clientRequestId;
    expect(String(premier)).toMatch(UUID);
    expect(second).toBe(premier);
  }, 60000);
});

describe('Une réponse incertaine garde l’identifiant de requête ; un refus définitif le renouvelle', () => {
  it('503 et 429 : même `clientRequestId` ; après un 409, un nouveau', async () => {
    const user = userEvent.setup({ delay: null });
    post
      .mockRejectedValueOnce({ response: { status: 503, data: { message: 'Service momentanément indisponible.' } } })
      .mockRejectedValueOnce({ response: { status: 429, data: { message: 'Trop de demandes, patientez.' } } })
      .mockRejectedValueOnce({
        response: { status: 409, data: { code: 'STOCK_INSUFFICIENT', message: 'Stock insuffisant dans ce lieu.' } }
      })
      .mockResolvedValueOnce(reponseEcriture({ slip: BON_SORTIE, movements: [SORTIE_RENDUE] }));
    monter();
    await ouvrirSortie();
    await remplirSortie();

    // Après un envoi, l'icône de chargement d'Ant Design reste dans le nom
    // accessible (« loading … ») sous jsdom : le bouton se cherche par motif.
    const enregistrer = async () =>
      user.click(await screen.findByRole('button', { name: /Enregistrer la sortie/ }, { timeout: 8000 }));
    await enregistrer();
    expect(await screen.findByText('Service momentanément indisponible.', {}, { timeout: 8000 })).toBeInTheDocument();
    await enregistrer();
    expect(await screen.findByText('Trop de demandes, patientez.', {}, { timeout: 8000 })).toBeInTheDocument();
    await enregistrer();
    expect(await screen.findByText('Stock insuffisant dans ce lieu.', {}, { timeout: 8000 })).toBeInTheDocument();
    await enregistrer();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(4));

    const ids = post.mock.calls.map((appel: unknown[]) => (appel[1] as Record<string, unknown>).clientRequestId);
    expect(String(ids[0])).toMatch(UUID);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).toBe(ids[0]);
    expect(String(ids[3])).toMatch(UUID);
    expect(ids[3]).not.toBe(ids[2]);
  }, 60000);
});

describe('Le poste est exigé, et la proposition de l’article n’a aucune autorité', () => {
  it('pré-sélectionne le poste proposé, le dit, et le laisse changer', async () => {
    monter();
    await ouvrirSortie();

    await choisirOption('sortie-article-0', 'CIM-42 — Ciment CPJ 42,5');

    expect(await screen.findByText(/est le poste proposé par cet article/i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(champ('sortie-poste-0').closest('.ant-select')?.textContent).toMatch(/Gros œuvre/);

    await choisirOption('sortie-poste-0', 'Couverture');
    expect(champ('sortie-poste-0').closest('.ant-select')?.textContent).toMatch(/Couverture/);
  }, 45000);

  it('dit qu’un article sans proposition est un cas normal', async () => {
    monter();
    await ouvrirSortie();

    await choisirOption('sortie-article-0', 'FER-12 — Fer à béton HA 12');
    expect(
      await screen.findByText(/Cet article ne propose aucun poste, et c'est un cas normal/i, {}, { timeout: 8000 })
    ).toBeInTheDocument();
  }, 45000);
});

describe('La réception : facture du contexte, prix facultatif, contrôles (A8, B4)', () => {
  it('propose les factures réceptionnables sans passer par le fournisseur', async () => {
    monter();
    await ouvrirReception();

    expect(document.getElementById('reception-fournisseur')).toBeNull();
    fireEvent.mouseDown(champ('reception-facture'));
    expect(await screen.findByText(/F-2026-0142 — Quincaillerie du Niger/, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/F-2026-0151 — Ciments d’Abidjan/)).toBeInTheDocument();
    expect(screen.getByText('Déjà réceptionnée (1 fois)')).toBeInTheDocument();
    expect(appelsGet(/\/finance\/suppliers/)).toEqual([]);
  }, 45000);

  it('une facture déjà réceptionnée montre les réceptions précédentes', async () => {
    monter();
    await ouvrirReception();

    await choisirOption('reception-facture', /F-2026-0142 — Quincaillerie/);
    expect(await screen.findByText('Cette facture a déjà été réceptionnée', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(boiteOuverte()).getByText('BR-2026-00042')).toBeInTheDocument();
    expect(screen.getByText(/Une livraison en plusieurs fois est normale/)).toBeInTheDocument();
    expect(appelsGet(/supplier-invoices\/facture-0142\/receipts/).length).toBeGreaterThan(0);
  }, 45000);

  it('envoie `supplierInvoiceLineId`, omet `unitCost` laissé tel quel, et porte un `clientRequestId`', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockResolvedValue(
      reponseEcriture({
        slip: BON_RECEPTION,
        movements: [
          mouvement({ id: 'mvt-r1', type: 'RECEIPT', quantity: 80, quantityAfter: 160, totalValue: 408_000 })
        ],
        controls: [
          {
            code: 'RECEIPT_OVER_INVOICE',
            severity: 'WARNING',
            message: 'La valeur reçue dépasse le montant de la facture.',
            itemIds: [],
            amount: 420_000,
            threshold: 408_000,
            alertId: 'alerte-1'
          }
        ]
      })
    );
    monter();
    await ouvrirReception();

    await choisirOption('reception-facture', /F-2026-0151 — Ciments/);
    // Le lieu du chantier de la facture est prérempli.
    await waitFor(() =>
      expect(champ('reception-lieu').closest('.ant-select')?.textContent).toMatch(/Dépôt de la Villa Riviera/)
    );
    await choisirOption('reception-article-0', 'CIM-42 — Ciment CPJ 42,5');
    saisirNombre('reception-quantite-0', '80');
    await choisirOption('reception-ligne-facture-0', 'Ciment CPJ 42,5 — 80 sacs');
    expect(await screen.findByText('Prix repris de la facture.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ajouter une ligne/ }));
    await choisirOption('reception-article-1', 'SAB-00 — Sable lavé');
    saisirNombre('reception-quantite-1', '24.5');
    saisirNombre('reception-prix-1', '13000');

    await user.click(screen.getByRole('button', { name: 'Enregistrer la réception' }));
    await waitFor(() => expect(post).toHaveBeenCalled());

    const { adresse, corps } = dernierPost();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/receipts`);
    expect(corps).toMatchObject({
      locationId: DEPOT_RIVIERA,
      supplierInvoiceId: 'facture-0151',
      receiptDate: AUJOURDHUI
    });
    expect(corps.lines).toEqual([
      { itemId: CIMENT, quantity: 80, supplierInvoiceLineId: 'ligne-0151-1' },
      { itemId: SABLE, quantity: 24.5, unitCost: 13_000 }
    ]);
    expect(String(corps.clientRequestId)).toMatch(UUID);
    expect(corps).not.toHaveProperty('tenantId');

    // L'écran de confirmation : le bon, et les contrôles du serveur.
    expect(await screen.findByText('Réception enregistrée — BR-2026-00043', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('La valeur reçue dépasse le montant de la facture.')).toBeInTheDocument();
  }, 60000);

  it('le prix est facultatif : une ligne sans prix ne ferme pas l’envoi', async () => {
    monter();
    await ouvrirReception();

    await choisirOption('reception-facture', /F-2026-0151 — Ciments/);
    await choisirOption('reception-article-0', 'CIM-42 — Ciment CPJ 42,5');
    saisirNombre('reception-quantite-0', '80');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer la réception' })).toBeEnabled());
    expect(screen.getByText(/Laissé vide, le prix est repris de la ligne de facture/)).toBeInTheDocument();
  }, 60000);

  it('sans facture, l’envoi reste fermé', async () => {
    monter();
    await ouvrirReception();

    await choisirOption('reception-lieu', "Magasin central d'Angré");
    await choisirOption('reception-article-0', 'CIM-42 — Ciment CPJ 42,5');
    saisirNombre('reception-quantite-0', '400');

    expect(screen.getByRole('button', { name: 'Enregistrer la réception' })).toBeDisabled();
  }, 60000);

  it('sans les valeurs, aucun champ de prix ; l’aide dit qu’il n’y a rien à saisir', async () => {
    const user = userEvent.setup({ delay: null });
    configurerGet({ contexte: contexteTerrain({ abilities: MAGASINIER }) });
    post.mockResolvedValue(reponseEcriture({ slip: BON_RECEPTION, movements: [], controls: [] }));
    monter();
    await ouvrirReception();

    expect(document.getElementById('reception-prix-0')).toBeNull();
    expect(screen.getByText(/Vous n’avez rien à saisir/)).toBeInTheDocument();

    await choisirOption('reception-facture', /F-2026-0151 — Ciments/);
    await choisirOption('reception-article-0', 'CIM-42 — Ciment CPJ 42,5');
    saisirNombre('reception-quantite-0', '80');
    await choisirOption('reception-ligne-facture-0', 'Ciment CPJ 42,5 — 80 sacs');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la réception' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(JSON.stringify(dernierPost().corps)).not.toMatch(/unitCost/);
  }, 60000);
});

describe('Le retour au fournisseur (A6)', () => {
  it('n’offre que les articles reçus, exige la ligne de facture quand il le faut, et relaie STOCK_RETURN_UNVALUED', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockRejectedValue({
      response: {
        status: 409,
        data: { code: 'STOCK_RETURN_UNVALUED', message: 'Cette ligne de facture ne porte pas de prix unitaire.' }
      }
    });
    monter();
    await attendreEtat();
    await user.click(screen.getByRole('button', { name: /Autres mouvements/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Retour au fournisseur' }));
    await screen.findByText(/Le retour diminue le stock et le solde dû au fournisseur/, {}, { timeout: 8000 });

    await choisirOption('retour-facture', /F-2026-0142 — Quincaillerie/);
    // L'article attend les réceptions de la facture : il n'est proposé qu'ensuite.
    await waitFor(() => expect(champ('retour-article')).not.toBeDisabled(), { timeout: 8000 });
    await choisirOption('retour-article', 'Ciment CPJ 42,5');
    expect(
      await screen.findByText('Reçu sur cette facture : 100 sac · déjà retourné : 10 sac · retournable : 90 sac')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Le montant déduit de la dette du fournisseur est le prix de cette ligne.')
    ).toBeInTheDocument();

    await choisirOption('retour-lieu', "Magasin central d'Angré");
    saisirNombre('retour-quantite', '5');
    await user.click(screen.getByRole('radio', { name: /Non conforme à la commande/ }));

    // La ligne de facture est exigée : l'envoi reste fermé sans elle.
    expect(screen.getByRole('button', { name: 'Enregistrer le retour' })).toBeDisabled();
    await choisirOption('retour-ligne-facture', 'Ciment CPJ 42,5 — 400 sacs');
    const envoyer = screen.getByRole('button', { name: 'Enregistrer le retour' });
    await waitFor(() => expect(envoyer).toBeEnabled());
    await user.click(envoyer);

    expect(
      await screen.findByText('Cette ligne de facture ne porte pas de prix unitaire.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(dernierPost().adresse).toBe(`/tenants/${TENANT}/finance/stock/supplier-returns`);
    expect(dernierPost().corps).toMatchObject({
      supplierInvoiceId: 'facture-0142',
      supplierInvoiceLineId: 'ligne-0142-1',
      itemId: CIMENT,
      quantity: 5,
      reasonCode: 'NON_CONFORMING'
    });
  }, 60000);
});

describe('Une photo choisie avant l’enregistrement part sur le mouvement créé (rec040-03)', () => {
  /** Route les POST : l'écriture du mouvement, puis l'envoi des pièces. */
  function routerPosts(adresseEcriture: RegExp, mouvementCree: StockMovementView) {
    post.mockImplementation(async (url: string, corps: unknown) => {
      if (/\/stock\/attachments$/.test(url)) {
        const formulaire = corps as FormData;
        return {
          status: 201,
          data: {
            data: {
              id: 'piece-1',
              targetType: formulaire.get('targetType'),
              targetId: formulaire.get('targetId'),
              purpose: formulaire.get('purpose'),
              fileName: 'rebut-avant.jpg'
            }
          }
        };
      }
      if (adresseEcriture.test(url)) return reponseEcriture(mouvementCree);
      throw new Error(`POST inattendu : ${url}`);
    });
  }

  function postsPieces(): FormData[] {
    return post.mock.calls
      .filter((appel: unknown[]) => /\/stock\/attachments$/.test(String(appel[0])))
      .map((appel: unknown[]) => appel[1] as FormData);
  }

  function choisirPhoto(nom: string): void {
    const fichier = new File(['photo'], nom, { type: 'image/jpeg' });
    const champFichier = boiteOuverte().querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(champFichier, { target: { files: [fichier] } });
  }

  it('rebut : la photo « En attente » est envoyée sur le mouvement, puis dite « Envoyée »', async () => {
    const user = userEvent.setup({ delay: null });
    routerPosts(
      /\/finance\/stock\/scraps$/,
      mouvement({ id: 'mvt-rebut-1', type: 'SCRAP', itemId: FER, isDecrease: true, quantity: 1 })
    );
    monter();
    await attendreEtat();
    await user.click(screen.getByRole('button', { name: /Autres mouvements/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rebut' }));
    await screen.findByText(/Un rebut retire du stock une matière détruite/, {}, { timeout: 8000 });

    await choisirOption('rebut-lieu', "Magasin central d'Angré");
    await choisirOption('rebut-article', /FER-12/);
    saisirNombre('rebut-quantite', '1');
    await user.click(screen.getByRole('radio', { name: /Casse/ }));
    choisirPhoto('rebut-avant.jpg');
    expect(await within(boiteOuverte()).findByText('En attente', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(postsPieces()).toHaveLength(0);

    const envoyer = screen.getByRole('button', { name: 'Enregistrer le rebut' });
    await waitFor(() => expect(envoyer).toBeEnabled());
    await user.click(envoyer);

    await waitFor(() => expect(postsPieces()).toHaveLength(1), { timeout: 8000 });
    const [piece] = postsPieces();
    expect(piece.get('targetType')).toBe('MOVEMENT');
    expect(piece.get('targetId')).toBe('mvt-rebut-1');
    expect(piece.get('purpose')).toBe('GOODS_PHOTO');
    expect(await within(boiteOuverte()).findByText('Envoyée', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(boiteOuverte()).getByText('rebut-avant.jpg')).toBeInTheDocument();
  }, 60000);

  it('retour au fournisseur : même chose, la photo part sur le mouvement de retour', async () => {
    const user = userEvent.setup({ delay: null });
    routerPosts(
      /\/finance\/stock\/supplier-returns$/,
      mouvement({ id: 'mvt-retour-1', type: 'SUPPLIER_RETURN', isDecrease: true, quantity: 5 })
    );
    monter();
    await attendreEtat();
    await user.click(screen.getByRole('button', { name: /Autres mouvements/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Retour au fournisseur' }));
    await screen.findByText(/Le retour diminue le stock et le solde dû au fournisseur/, {}, { timeout: 8000 });

    await choisirOption('retour-facture', /F-2026-0142 — Quincaillerie/);
    await waitFor(() => expect(champ('retour-article')).not.toBeDisabled(), { timeout: 8000 });
    await choisirOption('retour-article', 'Ciment CPJ 42,5');
    await choisirOption('retour-lieu', "Magasin central d'Angré");
    saisirNombre('retour-quantite', '5');
    await user.click(screen.getByRole('radio', { name: /Non conforme à la commande/ }));
    await choisirOption('retour-ligne-facture', 'Ciment CPJ 42,5 — 400 sacs');
    choisirPhoto('retour-avant.jpg');
    expect(await within(boiteOuverte()).findByText('En attente', {}, { timeout: 8000 })).toBeInTheDocument();

    const envoyer = screen.getByRole('button', { name: 'Enregistrer le retour' });
    await waitFor(() => expect(envoyer).toBeEnabled());
    await user.click(envoyer);

    await waitFor(() => expect(postsPieces()).toHaveLength(1), { timeout: 8000 });
    const [piece] = postsPieces();
    expect(piece.get('targetType')).toBe('MOVEMENT');
    expect(piece.get('targetId')).toBe('mvt-retour-1');
    expect(await within(boiteOuverte()).findByText('Envoyée', {}, { timeout: 8000 })).toBeInTheDocument();
  }, 60000);
});

describe('Vocabulaire', () => {
  it('n’affiche jamais « débit » ni « crédit », ni aucun mot qui juge une personne', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await attendreEtat();
    const verifier = () => {
      const texte = corpsDuDocument();
      expect(texte).not.toMatch(/\bdebit/);
      expect(texte).not.toMatch(/\bcredit/);
      expect(texte).not.toMatch(/\bvols?\b/);
      expect(texte).not.toMatch(/\bvoleurs?\b/);
      expect(texte).not.toMatch(/\bfraud/);
      expect(texte).not.toMatch(/\bdetourn/);
    };
    verifier();

    await user.click(screen.getByRole('tab', { name: 'Journal des mouvements' }));
    await ligne('Fatoumata Kouadio, conductrice de travaux');
    verifier();
  }, 20000);

  it('ni dans les formulaires de réception et de sortie', async () => {
    monter();

    await ouvrirReception();
    expect(corpsDuDocument()).not.toMatch(/\bdebit|\bcredit|\bvols?\b|\bfraud|\bdetourn/);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    await ouvrirSortie();
    await remplirSortie({ preneur: false });
    expect(corpsDuDocument()).not.toMatch(/\bdebit|\bcredit|\bvols?\b|\bfraud|\bdetourn/);
  }, 60000);
});
