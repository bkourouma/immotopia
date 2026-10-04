import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StockMagasin } from '../../pages/finance/StockMagasin';
import { nouvelIdentifiantDeRequete } from '../../utils/stock-client-request-id';
import type { StockCount, StockCountLine } from '../../types/finance-stock-inventaire-types';
import type {
  StockBalanceView,
  StockFieldContext,
  StockLocationView,
  StockReceivableInvoice
} from '../../types/finance-stock-controle-types';

/**
 * E2 — Magasin, l'écran mobile en trois gestes (ecrans §6, §11.1, §11.3).
 *
 * Téléphone de 360 px simulé (`useBreakpoint` en mobile), `apiClient` simulé à
 * la frontière réseau, vrais services et composants par-dessus. La réduction
 * d'image (`utils/downscale-image`, canvas absent de jsdom) rend le fichier
 * tel quel.
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

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'xs', isMobile: true, isTablet: false, isDesktop: false })
}));

vi.mock('../../utils/downscale-image', () => ({
  downscaleImageFile: vi.fn(async (file: File) => file)
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const put = apiClient.put as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'agence-1';
const MAGASIN = 'lieu-magasin-01';
const DEPOT = 'lieu-riviera-02';
const CIMENT = 'article-ciment-01';
const FER = 'article-fer-02';
const PRENEUR = 'preneur-01';
const FACTURE = 'facture-01';
const FACTURE_RECUE = 'facture-02';
const LIGNE_FACTURE = 'ligne-facture-01';
const COMPTAGE = 'comptage-01';
const BON = 'bon-01';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TIMEOUT = { timeout: 8000 };

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

function facture(
  partiel: Partial<StockReceivableInvoice> & Pick<StockReceivableInvoice, 'id'>
): StockReceivableInvoice {
  return {
    reference: 'FA-2026-0142',
    supplierName: "Ciments d'Abidjan",
    invoiceDate: '2026-09-28',
    siteId: null,
    siteName: 'Chantier Riviera',
    receiptCount: 0,
    lastReceiptAt: null,
    amount: 1_250_000,
    ...partiel
  };
}

function contexte(
  abilities: Partial<StockFieldContext['abilities']> = {},
  partiel: Partial<StockFieldContext> = {}
): StockFieldContext {
  return {
    locations: [
      lieu({ id: MAGASIN, label: 'Magasin central' }),
      lieu({ id: DEPOT, label: 'Dépôt Riviera', kind: 'SITE', siteId: 'chantier-riviera' })
    ],
    sites: [
      {
        id: 'chantier-riviera',
        name: 'Villa Riviera',
        status: 'OPEN',
        closed: false,
        stockEnabled: true,
        locationId: DEPOT
      }
    ],
    costCategories: [{ id: 'poste-gros-oeuvre', label: 'Gros œuvre' }],
    items: [
      {
        id: CIMENT,
        reference: 'CIM-42',
        label: 'Ciment CPJ 42,5',
        unit: 'sac',
        category: null,
        defaultCostCategoryId: 'poste-gros-oeuvre'
      },
      {
        id: FER,
        reference: 'FER-12',
        label: 'Fer à béton HA 12',
        unit: 'barre',
        category: null,
        defaultCostCategoryId: 'poste-gros-oeuvre'
      }
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
        createdAt: '2026-09-01T00:00:00.000Z'
      }
    ],
    receivableInvoices: [
      facture({ id: FACTURE }),
      facture({ id: FACTURE_RECUE, reference: 'FA-2026-0100', supplierName: 'Fers du Plateau', receiptCount: 2 })
    ],
    reasonCodes: {
      count: ['BREAKAGE', 'UNEXPLAINED_DISAPPEARANCE', 'OPENING_BALANCE', 'OTHER'],
      scrap: ['BREAKAGE', 'OTHER'],
      supplierReturn: ['NON_CONFORMING', 'OTHER'],
      transfer: ['SITE_SUPPLY', 'OTHER']
    },
    settings: { requireTaker: false, backdatingLimitDays: 7 },
    abilities: {
      canReceive: true,
      canIssue: true,
      canTransfer: true,
      canCount: true,
      canValidateCount: false,
      canDispose: false,
      canManageTakers: false,
      valuesVisible: false,
      canViewAlerts: false,
      canManageSettings: false,
      ...abilities
    },
    people: [],
    ...partiel
  };
}

function ligneComptage(partiel: Partial<StockCountLine> & Pick<StockCountLine, 'id' | 'itemId'>): StockCountLine {
  return {
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    countedQuantity: 40,
    notCounted: false,
    countedBlind: true,
    countedByUserId: 'user-1',
    countedByLabel: 'Awa Traoré',
    countedAtServer: '2026-10-04T08:15:00.000Z',
    expectedQuantity: null,
    variance: null,
    varianceValue: null,
    unitCostAtValidation: null,
    reasonCode: null,
    reason: null,
    justified: false,
    justifiedByLabel: null,
    justifiedAt: null,
    setAside: null,
    movementsSinceCapture: null,
    attachmentsCount: 0,
    ...partiel
  };
}

function comptage(status: 'DRAFT' | 'COUNTED', lines: StockCountLine[]): StockCount {
  return {
    id: COMPTAGE,
    tenantId: TENANT,
    locationId: MAGASIN,
    locationLabel: 'Magasin central',
    kind: 'REGULAR',
    status,
    blind: status === 'DRAFT',
    countedAt: '2026-10-04',
    createdByUserId: 'user-1',
    createdByLabel: 'Awa Traoré',
    closedAt: status === 'COUNTED' ? '2026-10-04T10:00:00.000Z' : null,
    closedByLabel: status === 'COUNTED' ? 'Awa Traoré' : null,
    validatedAt: null,
    validatedByLabel: null,
    cancelledAt: null,
    cancelReason: null,
    selfValidated: false,
    selfValidationReason: null,
    counters: [{ userId: 'user-1', label: 'Awa Traoré' }],
    lines,
    linesCount: lines.length,
    uncountedLinesCount: 0,
    varianceCount: status === 'COUNTED' ? 1 : null,
    countedValue: null,
    varianceValueGross: null,
    varianceValueNet: null,
    setAsideVarianceValue: null,
    currency: 'XOF',
    slip: null,
    validation: null,
    toRecount: []
  };
}

function solde(quantity: number | null): StockBalanceView {
  return {
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: MAGASIN,
    locationLabel: 'Magasin central',
    quantity,
    value: quantity === null ? null : quantity * 8000,
    averageUnitCost: quantity === null ? null : 8000,
    currency: 'XOF'
  };
}

const SLIP = {
  id: BON,
  kind: 'ISSUE',
  number: 'BS-2026-00057',
  documentDate: '2026-10-04',
  createdAt: '2026-10-04T10:42:00.000Z'
};
const BR = { ...SLIP, id: 'bon-br', kind: 'RECEIPT', number: 'BR-2026-00012' };

interface Config {
  ctx?: StockFieldContext;
  soldes?: StockBalanceView[];
  blindLocationIds?: string[];
  detail?: StockCount;
}

function configurer(config: Config = {}) {
  const ctx = config.ctx ?? contexte();
  const meta = { valuesVisible: ctx.abilities.valuesVisible, blindLocationIds: config.blindLocationIds ?? [] };
  get.mockImplementation(async (url: string) => {
    if (/\/stock\/field-context$/.test(url)) return { data: { data: ctx, meta } };
    if (/\/stock\/movements(\?|$)/.test(url)) return { data: { data: [], meta } };
    if (/\/stock\/balances(\?|$)/.test(url)) return { data: { data: config.soldes ?? [solde(120)], meta } };
    if (/\/supplier-invoices\/[^/]+\/receipts$/.test(url)) {
      return {
        data: {
          data: {
            invoice: {
              id: FACTURE_RECUE,
              reference: 'FA-2026-0100',
              supplierName: 'Fers du Plateau',
              invoiceDate: '2026-09-20',
              status: 'VALIDATED',
              amount: null,
              lines: [
                {
                  id: LIGNE_FACTURE,
                  label: 'Ciment CPJ 42,5 — 200 sacs',
                  quantity: 200,
                  unitPrice: null,
                  amount: null,
                  hasUnitPrice: true
                }
              ]
            },
            byItem: [],
            receipts: [
              {
                slipId: 'bon-br-ancien',
                slipNumber: 'BR-2026-00008',
                receiptDate: '2026-09-22',
                createdAt: '2026-09-22T09:00:00.000Z',
                createdByLabel: 'Awa Traoré',
                locationLabel: 'Magasin central',
                lines: [
                  {
                    itemId: CIMENT,
                    itemLabel: 'Ciment CPJ 42,5',
                    itemUnit: 'sac',
                    quantity: 100,
                    unitCost: null,
                    totalValue: null
                  }
                ]
              }
            ],
            returns: [],
            receivedValue: null,
            returnedValue: null
          },
          meta
        }
      };
    }
    if (/\/stock\/receivable-invoices(\?|$)/.test(url)) {
      return {
        data: {
          data: [facture({ id: 'facture-ancienne', reference: 'FA-2025-0999', supplierName: 'Quincaillerie Adjamé' })],
          meta
        }
      };
    }
    if (/\/stock\/counts\/[^/]+$/.test(url)) return { data: { data: config.detail } };
    return { data: { data: [] } };
  });
}

function reponsesPost() {
  post.mockImplementation(async (url: string) => {
    if (/\/stock\/receipts$/.test(url))
      return { status: 201, data: { data: { slip: BR, movements: [], controls: [] }, meta: {} } };
    if (/\/stock\/issues$/.test(url)) return { status: 201, data: { data: { slip: SLIP, movements: [] }, meta: {} } };
    if (/\/stock\/attachments$/.test(url)) return { status: 201, data: { data: { id: 'piece-1' } } };
    if (/\/close$/.test(url)) return { data: { data: comptage('COUNTED', []) } };
    return { data: { data: null } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem(`immotopia.stock.lieu.${TENANT}`, MAGASIN);
  configurer();
  reponsesPost();
  put.mockResolvedValue({ data: { data: ligneComptage({ id: 'l-1', itemId: CIMENT }) } });
});

afterEach(() => {
  window.localStorage.removeItem(`immotopia.stock.lieu.${TENANT}`);
});

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[`/tenant/${TENANT}/finance/stock/magasin`]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/stock/magasin" element={<StockMagasin />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function bouton(nom: string | RegExp) {
  return screen.findByRole('button', { name: nom }, TIMEOUT);
}

async function cliquer(nom: string | RegExp) {
  fireEvent.click(await bouton(nom));
}

function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function vocabulaireNeutre() {
  const texte = normaliser(document.body.textContent ?? '');
  expect(texte).not.toMatch(/\bvols?\b/);
  expect(texte).not.toMatch(/\bvoleurs?\b/);
  expect(texte).not.toMatch(/\bfraud/);
  expect(texte).not.toMatch(/\bdetourn/);
}

function postsVers(motif: RegExp): Array<[string, Record<string, unknown>]> {
  return (post.mock.calls as Array<[string, Record<string, unknown>]>).filter(([url]) => motif.test(url));
}

/** Recevoir jusqu'à l'étape « Vérifiez », avec une ligne de facture choisie ou non. */
async function recevoirJusquAVerifier(options: { ligneFacture: boolean }) {
  await cliquer('Recevoir');
  if (options.ligneFacture) {
    await cliquer(/Fers du Plateau/);
    await cliquer('Continuer : c’est une autre livraison');
  } else {
    await cliquer(/Ciments d'Abidjan/);
  }
  await cliquer('Continuer');
  await cliquer(/Ajouter un article/);
  await cliquer(/CIM-42 — Ciment/);
  fireEvent.change(await screen.findByLabelText('Quantité reçue', {}, TIMEOUT), { target: { value: '50' } });
  if (options.ligneFacture) await cliquer(/Ciment CPJ 42,5 — 200 sacs/);
  await cliquer('Ajouter');
  await cliquer('Continuer');
  await cliquer('Passer');
  await screen.findByText('Vérifiez', {}, TIMEOUT);
}

/** Sortir jusqu'à l'étape des articles. */
async function sortirJusquAuxArticles() {
  await cliquer('Sortir');
  await cliquer(/Villa Riviera/);
  await cliquer(/Koné Ibrahim/);
  await cliquer('Continuer');
  await screen.findByText('Quels articles ?', {}, TIMEOUT);
}

// ===========================================================================
// Accueil
// ===========================================================================

describe('L’accueil du magasin', () => {
  it('n’affiche que les gestes permis : Recevoir, Sortir, Compter, jamais le rebut', async () => {
    monter();
    expect(await bouton('Recevoir')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sortir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compter' })).toBeInTheDocument();
    expect(screen.queryByText(/Rebut/)).not.toBeInTheDocument();
    expect(screen.getByText('Lieu : Magasin central')).toBeInTheDocument();
  });

  it('sans aucun geste permis : « Aucun geste de stock ne vous est ouvert »', async () => {
    configurer({ ctx: contexte({ canReceive: false, canIssue: false, canCount: false, canTransfer: false }) });
    monter();
    expect(await screen.findByText('Aucun geste de stock ne vous est ouvert', {}, TIMEOUT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recevoir' })).not.toBeInTheDocument();
  });

  it('un seul appel de référentiel au chargement : GET /stock/field-context, aucun solde', async () => {
    monter();
    await bouton('Recevoir');
    const urls = (get.mock.calls as [string][]).map(([url]) => url);
    expect(urls[0]).toBe(`/tenants/${TENANT}/finance/stock/field-context`);
    expect(urls.filter(url => /field-context/.test(url))).toHaveLength(1);
    for (const url of urls) {
      expect(url).not.toMatch(/\/stock\/(items|locations|balances)|\/suppliers|\/sites|cost-categories/);
    }
    // Le seul autre appel est « Aujourd'hui sur ce lieu », sans filtre par personne.
    for (const url of urls.slice(1)) {
      expect(url).toMatch(/\/stock\/movements\?/);
      expect(url).not.toMatch(/takerId|createdByUserId|requestedBy/);
    }
  });

  it('demande le lieu quand aucun n’est mémorisé', async () => {
    window.localStorage.removeItem(`immotopia.stock.lieu.${TENANT}`);
    monter();
    expect(await screen.findByText('Sur quel lieu travaillez-vous ?', {}, TIMEOUT)).toBeInTheDocument();
    await cliquer(/Dépôt Riviera/);
    expect(window.localStorage.getItem(`immotopia.stock.lieu.${TENANT}`)).toBe(DEPOT);
    expect(await bouton('Recevoir')).toBeInTheDocument();
  });
});

// ===========================================================================
// Recevoir
// ===========================================================================

describe('Recevoir', () => {
  it('une facture déjà reçue montre les réceptions précédentes avant de continuer', async () => {
    monter();
    await cliquer('Recevoir');
    await cliquer(/Fers du Plateau/);

    expect(await screen.findByText('Cette facture a déjà été réceptionnée', {}, TIMEOUT)).toBeInTheDocument();
    expect(await screen.findByText('BR-2026-00008', {}, TIMEOUT)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/supplier-invoices/${FACTURE_RECUE}/receipts`);
    expect(screen.getByRole('button', { name: 'Continuer : c’est une autre livraison' })).toBeInTheDocument();
  }, 40000);

  it('cherche hors des factures chargées par GET /stock/receivable-invoices', async () => {
    monter();
    await cliquer('Recevoir');
    fireEvent.change(await screen.findByLabelText('Fournisseur ou référence', {}, TIMEOUT), {
      target: { value: 'Adjamé' }
    });
    await cliquer('Chercher dans toutes les factures');

    expect(await screen.findByRole('button', { name: /Quincaillerie Adjamé/ }, TIMEOUT)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      `/tenants/${TENANT}/finance/stock/receivable-invoices?search=Adjam%C3%A9&limit=20`
    );
  }, 40000);

  it('le corps ne porte aucun prix, même avec les valeurs ; la ligne de facture et un UUID', async () => {
    configurer({ ctx: contexte({ valuesVisible: true }) });
    monter();
    await recevoirJusquAVerifier({ ligneFacture: true });
    await cliquer('Enregistrer la réception');

    await waitFor(() => expect(postsVers(/\/stock\/receipts$/)).toHaveLength(1), TIMEOUT);
    const [, corps] = postsVers(/\/stock\/receipts$/)[0];
    expect(corps.locationId).toBe(MAGASIN);
    expect(corps.supplierInvoiceId).toBe(FACTURE_RECUE);
    expect(corps.lines).toEqual([{ itemId: CIMENT, quantity: 50, supplierInvoiceLineId: LIGNE_FACTURE }]);
    expect(JSON.stringify(corps)).not.toMatch(/unitCost/);
    expect(String(corps.clientRequestId)).toMatch(UUID);
    expect(await screen.findByText('BR-2026-00012', {}, TIMEOUT)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/FCFA/);
  }, 60000);

  it('coupure réseau puis réessai : le même identifiant ; un rejeu 200 dit « déjà enregistrée »', async () => {
    let appels = 0;
    post.mockImplementation(async (url: string) => {
      if (/\/stock\/receipts$/.test(url)) {
        appels += 1;
        if (appels === 1) throw new Error('Network Error');
        return { status: 200, data: { data: { slip: BR, movements: [], controls: [] }, meta: {} } };
      }
      return { data: { data: null } };
    });
    monter();
    await recevoirJusquAVerifier({ ligneFacture: false });
    await cliquer('Enregistrer la réception');

    expect(await screen.findByText('La connexion a été perdue.', {}, TIMEOUT)).toBeInTheDocument();
    await cliquer(/Réessayer/);

    expect(
      await screen.findByText('Cette opération était déjà enregistrée : voici son bon.', {}, TIMEOUT)
    ).toBeInTheDocument();
    const envois = postsVers(/\/stock\/receipts$/);
    expect(envois).toHaveLength(2);
    expect(envois[0][1].clientRequestId).toBe(envois[1][1].clientRequestId);
    expect(envois[0][1].lines).toEqual([{ itemId: CIMENT, quantity: 50 }]);
  }, 60000);
});

// ===========================================================================
// Sortir
// ===========================================================================

describe('Sortir', () => {
  it('requireTaker : pas de lien « Saisir un nom… »', async () => {
    configurer({ ctx: contexte({}, { settings: { requireTaker: true, backdatingLimitDays: 7 } }) });
    monter();
    await cliquer('Sortir');
    await cliquer(/Villa Riviera/);
    expect(await screen.findByText('Qui emporte la marchandise ?', {}, TIMEOUT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Saisir un nom/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Votre agence exige un preneur du carnet/)).toBeInTheDocument();
  }, 40000);

  it('sans requireTaker : un nom saisi part en requestedBy, sans takerId', async () => {
    monter();
    await cliquer('Sortir');
    await cliquer(/Villa Riviera/);
    await cliquer('Saisir un nom sans l’ajouter au carnet');
    fireEvent.change(await screen.findByLabelText('Nom de la personne qui emporte', {}, TIMEOUT), {
      target: { value: 'Yao Serge' }
    });
    await cliquer('Continuer');
    await cliquer(/Ajouter un article/);
    await cliquer(/CIM-42 — Ciment/);
    fireEvent.change(await screen.findByLabelText('Quantité remise', {}, TIMEOUT), { target: { value: '10' } });
    await cliquer('Ajouter');
    await cliquer('Continuer');
    await cliquer('Passer');
    await cliquer('Enregistrer la sortie');

    await waitFor(() => expect(postsVers(/\/stock\/issues$/)).toHaveLength(1), TIMEOUT);
    const [, corps] = postsVers(/\/stock\/issues$/)[0];
    expect(corps.requestedBy).toBe('Yao Serge');
    expect(corps).not.toHaveProperty('takerId');
    expect(corps.lines).toEqual([{ itemId: CIMENT, quantity: 10, costCategoryId: 'poste-gros-oeuvre' }]);
    expect(await screen.findByText('Faites signer le bon par le preneur.', {}, TIMEOUT)).toBeInTheDocument();
    vocabulaireNeutre();
  }, 60000);

  it('lieu en comptage : ni quantité disponible, ni avertissement de dépassement', async () => {
    configurer({ soldes: [solde(null)], blindLocationIds: [MAGASIN] });
    monter();
    await sortirJusquAuxArticles();
    await cliquer(/Ajouter un article/);
    await cliquer(/CIM-42 — Ciment/);
    fireEvent.change(await screen.findByLabelText('Quantité remise', {}, TIMEOUT), { target: { value: '999' } });

    expect(await screen.findByText(/la quantité disponible n’est pas affichée/, {}, TIMEOUT)).toBeInTheDocument();
    expect(screen.queryByText(/Disponible ici/)).not.toBeInTheDocument();
    expect(screen.queryByText(/La quantité dépasse/)).not.toBeInTheDocument();
  }, 40000);

  it('montre « Disponible ici » et prévient d’un dépassement hors comptage', async () => {
    monter();
    await sortirJusquAuxArticles();
    await cliquer(/Ajouter un article/);
    await cliquer(/CIM-42 — Ciment/);
    fireEvent.change(await screen.findByLabelText('Quantité remise', {}, TIMEOUT), { target: { value: '150' } });

    expect(await screen.findByText('Disponible ici : 120 sac', {}, TIMEOUT)).toBeInTheDocument();
    expect(screen.getByText('La quantité dépasse ce qui est disponible ici.')).toBeInTheDocument();
  }, 40000);

  it('la photo part APRÈS la sortie, en multipart sur le bon ; un échec n’annule pas la sortie', async () => {
    let essais = 0;
    post.mockImplementation(async (url: string) => {
      if (/\/stock\/issues$/.test(url)) return { status: 201, data: { data: { slip: SLIP, movements: [] }, meta: {} } };
      if (/\/stock\/attachments$/.test(url)) {
        essais += 1;
        throw {
          response: { status: 413, data: { code: 'STOCK_ATTACHMENT_TOO_LARGE', message: 'Fichier trop lourd.' } }
        };
      }
      return { data: { data: null } };
    });
    monter();
    await sortirJusquAuxArticles();
    await cliquer(/Ajouter un article/);
    await cliquer(/CIM-42 — Ciment/);
    fireEvent.change(await screen.findByLabelText('Quantité remise', {}, TIMEOUT), { target: { value: '10' } });
    await cliquer('Ajouter');
    await cliquer('Continuer');

    const fichier = new File(['photo'], 'ciment.jpg', { type: 'image/jpeg' });
    const champ = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(champ, { target: { files: [fichier] } });
    expect(await screen.findByText('En attente', {}, TIMEOUT)).toBeInTheDocument();
    expect(postsVers(/\/stock\/attachments$/)).toHaveLength(0);

    await cliquer('Passer');
    await cliquer('Enregistrer la sortie');
    expect(await screen.findByText('BS-2026-00057', {}, TIMEOUT)).toBeInTheDocument();

    await waitFor(() => expect(essais).toBe(1), TIMEOUT);
    const [, formulaire] = postsVers(/\/stock\/attachments$/)[0] as unknown as [string, FormData];
    expect(formulaire).toBeInstanceOf(FormData);
    expect(formulaire.get('targetType')).toBe('SLIP');
    expect(formulaire.get('targetId')).toBe(BON);
    const premierId = formulaire.get('clientRequestId');
    expect(String(premierId)).toMatch(UUID);
    expect(await screen.findByText('Fichier trop lourd.', {}, TIMEOUT)).toBeInTheDocument();
    // La sortie reste enregistrée.
    expect(screen.getByText('Sortie enregistrée')).toBeInTheDocument();

    // Réessayer l'envoi : même identifiant, aucun doublon possible.
    fireEvent.click(screen.getAllByRole('button', { name: /Réessayer/ })[0]);
    await waitFor(() => expect(essais).toBe(2), TIMEOUT);
    const [, second] = postsVers(/\/stock\/attachments$/)[1] as unknown as [string, FormData];
    expect(second.get('clientRequestId')).toBe(premierId);
  }, 60000);
});

// ===========================================================================
// Compter
// ===========================================================================

describe('Compter', () => {
  function avecComptage(
    status: 'DRAFT' | 'COUNTED',
    lignes: StockCountLine[],
    lieuPartiel: Partial<StockLocationView> = {}
  ) {
    const ctx = contexte();
    ctx.locations = ctx.locations.map(l =>
      l.id === MAGASIN
        ? { ...l, countInProgress: { countId: COMPTAGE, status, kind: 'REGULAR' as const }, ...lieuPartiel }
        : l
    );
    configurer({ ctx, detail: comptage(status, lignes) });
  }

  it('en cours : aucun attendu, aucun motif ; le PUT ne porte que l’article, la quantité et l’identifiant', async () => {
    avecComptage('DRAFT', [ligneComptage({ id: 'l-1', itemId: CIMENT })], {
      toRecount: [{ itemId: FER, itemLabel: 'Fer à béton HA 12', countId: 'ancien', setAsideAt: '2026-09-01' }]
    });
    monter();
    await cliquer('Compter');

    expect(await screen.findByText(/Comptez ce que vous voyez/, {}, TIMEOUT)).toBeInTheDocument();
    expect(screen.getByText('À recompter')).toBeInTheDocument();
    expect(screen.getByText('Déjà comptés (1)')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Attendu\s*:/);
    expect(screen.queryByLabelText(/Motif/)).not.toBeInTheDocument();
    vocabulaireNeutre();

    await cliquer(/FER-12 — Fer à béton/);
    fireEvent.change(await screen.findByLabelText('Quantité comptée', {}, TIMEOUT), { target: { value: '12' } });
    await cliquer('Enregistrer');

    await waitFor(() => expect(put).toHaveBeenCalled(), TIMEOUT);
    const [adresse, corps] = put.mock.calls[0] as [string, Record<string, unknown>];
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/counts/${COMPTAGE}/lines`);
    expect(Object.keys(corps).sort()).toEqual(['clientRequestId', 'countedQuantity', 'itemId']);
    expect(corps).toMatchObject({ itemId: FER, countedQuantity: 12 });
    expect(String(corps.clientRequestId)).toMatch(UUID);
  }, 40000);

  it('« Rien trouvé (0) » pose zéro, et une ressaisie dit ce qu’elle remplace', async () => {
    avecComptage('DRAFT', [ligneComptage({ id: 'l-1', itemId: CIMENT })]);
    monter();
    await cliquer('Compter');
    await cliquer(/CIM-42 — Ciment/);
    expect(
      await screen.findByText(/Cette quantité remplace celle saisie à .* par Awa Traoré/, {}, TIMEOUT)
    ).toBeInTheDocument();
    await cliquer('Rien trouvé (0)');
    await cliquer('Enregistrer');
    await waitFor(() => expect(put).toHaveBeenCalled(), TIMEOUT);
    expect((put.mock.calls[0] as [string, Record<string, unknown>])[1].countedQuantity).toBe(0);
  }, 40000);

  it('« Clore le comptage » poste …/close après confirmation', async () => {
    avecComptage('DRAFT', [ligneComptage({ id: 'l-1', itemId: CIMENT })]);
    monter();
    await cliquer('Compter');
    await cliquer('Clore le comptage');
    expect(await screen.findByText(/apparaîtront comme « non comptés »/, {}, TIMEOUT)).toBeInTheDocument();
    await cliquer('Clore le comptage');

    await waitFor(() => expect(postsVers(/\/close$/)).toHaveLength(1), TIMEOUT);
    expect(postsVers(/\/close$/)[0][0]).toBe(`/tenants/${TENANT}/finance/stock/counts/${COMPTAGE}/close`);
  }, 40000);

  it('409 STOCK_COUNT_INCOMPLETE liste les articles du serveur, chacun ramenant à sa saisie', async () => {
    avecComptage('DRAFT', [ligneComptage({ id: 'l-1', itemId: CIMENT })]);
    post.mockRejectedValue({
      response: {
        status: 409,
        data: {
          code: 'STOCK_COUNT_INCOMPLETE',
          message: 'Incomplet',
          data: { items: [{ itemId: FER, itemLabel: 'Fer à béton HA 12' }] }
        }
      }
    });
    monter();
    await cliquer('Compter');
    await cliquer('Clore le comptage');
    await cliquer('Clore le comptage');

    expect(await screen.findByText(/Il reste à compter : Fer à béton HA 12/, {}, TIMEOUT)).toBeInTheDocument();
    await cliquer('Fer à béton HA 12');
    expect(await screen.findByLabelText('Quantité comptée', {}, TIMEOUT)).toBeInTheDocument();
  }, 40000);

  it('clos : « Justifier » propose les motifs du comptage sans « Stock d’ouverture » ; « Autre » sans précision reste fermé', async () => {
    avecComptage('COUNTED', [
      ligneComptage({ id: 'l-1', itemId: CIMENT, expectedQuantity: 100, countedQuantity: 92, variance: -8 })
    ]);
    monter();
    await cliquer('Compter');
    expect(
      await screen.findByText('Attendu : 100 sac · Compté : 92 sac · Écart : −8 sac', {}, TIMEOUT)
    ).toBeInTheDocument();
    await cliquer('Justifier');

    const radios = await screen.findAllByRole('radio', {}, TIMEOUT);
    const libelles = radios.map(radio => radio.closest('label')?.textContent ?? '');
    expect(libelles.some(texte => /Stock d’ouverture/.test(texte))).toBe(false);
    expect(libelles.some(texte => /Casse/.test(texte))).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: /Autre/ }));
    expect(screen.getByRole('button', { name: 'Enregistrer le motif' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Précision/), { target: { value: 'Sacs mouillés' } });
    expect(screen.getByRole('button', { name: 'Enregistrer le motif' })).not.toBeDisabled();
    vocabulaireNeutre();
    expect(document.body.textContent).not.toMatch(/FCFA/);
  }, 40000);
});

// ===========================================================================
// Identifiant de requête
// ===========================================================================

describe('nouvelIdentifiantDeRequete', () => {
  it('rend un UUID v4 même sans crypto.randomUUID', () => {
    const origine = globalThis.crypto;
    const sansRandomUUID = { getRandomValues: origine.getRandomValues.bind(origine) };
    vi.stubGlobal('crypto', sansRandomUUID);
    try {
      expect(nouvelIdentifiantDeRequete()).toMatch(UUID);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
