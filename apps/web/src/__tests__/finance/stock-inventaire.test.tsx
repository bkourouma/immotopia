import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StockInventaire } from '../../pages/finance/StockInventaire';
import type { StockCount, StockCountLine, StockTransfer } from '../../types/finance-stock-inventaire-types';
import type {
  StockBalanceView,
  StockFieldContext,
  StockLocationView,
  StockMovementView
} from '../../types/finance-stock-controle-types';

/**
 * E3 — Transferts et inventaire physique (ecrans §7, §11.2, §11.3).
 *
 * L'écran est monté par-dessus un `apiClient` simulé — jamais le service
 * doublé : les garanties d'adresse et de corps valent pour ce que l'écran
 * envoie réellement.
 *
 * Ce qui compte plus que le reste :
 *
 * 1. **Pendant le comptage, rien ne dit l'attendu** : aucun « Le système dit »,
 *    aucune colonne d'attendu ni d'écart, aucune lecture des soldes du lieu
 *    compté, aucun motif à la saisie (A2, A2-R5).
 * 2. **La justification se fait après la clôture**, par motif d'une liste
 *    fermée ; « justifié » vient du serveur (`justified`).
 * 3. **La validation est prévenue par le serveur** (`CountView.validation`) et
 *    conserve les mouvements postérieurs (A3).
 * 4. **Aucun mot interdit** (D2), et un écart n'est jamais rouge.
 *
 * `useBreakpoint` est figé en desktop pour un `<ConfirmAction>` déterministe.
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
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const put = apiClient.put as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'agence-1';
const MAGASIN = 'lieu-magasin-01';
const DEPOT = 'lieu-riviera-02';
const DEPOT_CLOS = 'lieu-cocody-03';
const CIMENT = 'article-ciment-01';
const FER = 'article-fer-02';
const SABLE = 'article-sable-03';
const TOLE = 'article-tole-04';
const EN_COURS = 'comptage-en-cours-01';
const CLOS = 'comptage-clos-02';
const VALIDE = 'comptage-valide-03';
const PRENEUR = 'preneur-01';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MOINS = '−';
const TIMEOUT = { timeout: 8000 };

const ARTICLES = {
  [CIMENT]: { reference: 'CIM-42', label: 'Ciment CPJ 42,5', unit: 'sac' },
  [FER]: { reference: 'FER-12', label: 'Fer à béton HA 12', unit: 'barre' },
  [SABLE]: { reference: 'SAB-00', label: 'Sable lavé', unit: 'm³' },
  [TOLE]: { reference: 'TOL-BA', label: 'Tôle bac alu 6 m', unit: 'tôle' }
} as const;

function lieu(
  partiel: Partial<StockLocationView> & Pick<StockLocationView, 'id' | 'label' | 'kind'>
): StockLocationView {
  return {
    tenantId: TENANT,
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

function contexte(partiel: Partial<StockFieldContext> = {}, abilities: Partial<StockFieldContext['abilities']> = {}) {
  const ctx: StockFieldContext = {
    locations: [
      lieu({ id: MAGASIN, label: "Magasin central d'Angré", kind: 'WAREHOUSE' }),
      lieu({ id: DEPOT, label: 'Dépôt de la Villa Riviera', kind: 'SITE', siteId: 'chantier-riviera' }),
      lieu({ id: DEPOT_CLOS, label: 'Dépôt de Cocody', kind: 'SITE', siteId: 'chantier-cocody', siteClosed: true })
    ],
    sites: [],
    costCategories: [],
    items: Object.entries(ARTICLES).map(([id, a]) => ({ id, ...a, category: null, defaultCostCategoryId: null })),
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
    receivableInvoices: [],
    reasonCodes: {
      count: ['BREAKAGE', 'UNEXPLAINED_DISAPPEARANCE', 'OPENING_BALANCE', 'OTHER'],
      scrap: ['BREAKAGE', 'OTHER'],
      supplierReturn: ['NON_CONFORMING', 'OTHER'],
      transfer: ['SITE_SUPPLY', 'RETURN_TO_WAREHOUSE', 'REBALANCING', 'OTHER']
    },
    settings: { requireTaker: false, backdatingLimitDays: 7 },
    abilities: {
      canReceive: true,
      canIssue: true,
      canTransfer: true,
      canCount: true,
      canValidateCount: true,
      canDispose: false,
      canManageTakers: false,
      valuesVisible: true,
      canViewAlerts: true,
      canManageSettings: false,
      ...abilities
    },
    people: [],
    ...partiel
  };
  return ctx;
}

function ligne(id: string, itemId: keyof typeof ARTICLES, partiel: Partial<StockCountLine> = {}): StockCountLine {
  const article = ARTICLES[itemId];
  return {
    id,
    itemId,
    itemReference: article.reference,
    itemLabel: article.label,
    itemUnit: article.unit,
    countedQuantity: 0,
    notCounted: false,
    countedBlind: true,
    countedByUserId: 'user-1',
    countedByLabel: 'Awa Traoré',
    countedAtServer: '2026-09-18T08:40:00.000Z',
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

function comptage(partiel: Partial<StockCount> & Pick<StockCount, 'id' | 'status' | 'lines'>): StockCount {
  return {
    tenantId: TENANT,
    locationId: MAGASIN,
    locationLabel: "Magasin central d'Angré",
    kind: 'REGULAR',
    blind: false,
    countedAt: '2026-09-18T00:00:00.000Z',
    createdByUserId: 'user-1',
    createdByLabel: 'Awa Traoré',
    closedAt: null,
    closedByLabel: null,
    validatedAt: null,
    validatedByLabel: null,
    cancelledAt: null,
    cancelReason: null,
    selfValidated: false,
    selfValidationReason: null,
    counters: [{ userId: 'user-1', label: 'Awa Traoré' }],
    linesCount: partiel.lines.length,
    uncountedLinesCount: 0,
    varianceCount: null,
    countedValue: null,
    varianceValueGross: null,
    varianceValueNet: null,
    setAsideVarianceValue: null,
    currency: 'XOF',
    slip: null,
    validation: null,
    toRecount: [],
    ...partiel
  };
}

/** En cours : attendu et écart à `null`, pour tous. */
function enCours(): StockCount {
  return comptage({
    id: EN_COURS,
    status: 'DRAFT',
    blind: true,
    lines: [ligne('l-ciment', CIMENT, { countedQuantity: 418 }), ligne('l-sable', SABLE, { countedQuantity: 12.25 })]
  });
}

/**
 * Clos : un écart à justifier (−7 annoncé, 188 − 200 ferait −12), un écart
 * justifié, une ligne d'avant le lot à motif libre, une ligne non comptée.
 */
function clos(partiel: Partial<StockCount> = {}): StockCount {
  return comptage({
    id: CLOS,
    status: 'COUNTED',
    locationId: DEPOT,
    locationLabel: 'Dépôt de la Villa Riviera',
    closedAt: '2026-09-25T16:10:00.000Z',
    closedByLabel: 'Awa Traoré',
    varianceCount: 3,
    varianceValueNet: -612_500,
    uncountedLinesCount: 1,
    validation: { callerIsCounter: false, selfValidationAllowed: false },
    lines: [
      ligne('l-fer', FER, { expectedQuantity: 200, countedQuantity: 188, variance: -7, varianceValue: -490_000 }),
      ligne('l-ciment', CIMENT, {
        expectedQuantity: 80,
        countedQuantity: 75,
        variance: -5,
        reasonCode: 'BREAKAGE',
        justified: true
      }),
      ligne('l-tole', TOLE, {
        expectedQuantity: 57,
        countedQuantity: 60,
        variance: 3,
        reason: 'Trois tôles retrouvées derrière la réserve.',
        justified: true
      }),
      ligne('l-sable', SABLE, {
        countedQuantity: null,
        notCounted: true,
        countedByLabel: null,
        countedAtServer: null,
        expectedQuantity: 4.5
      })
    ],
    ...partiel
  });
}

/** Clos et prêt à valider : tout est justifié, rien n'est non compté. */
function closPret(partiel: Partial<StockCount> = {}): StockCount {
  const base = clos();
  return {
    ...base,
    uncountedLinesCount: 0,
    lines: base.lines
      .filter(l => !l.notCounted)
      .map(l => ({ ...l, justified: true, reasonCode: l.reasonCode ?? (l.reason ? null : 'BREAKAGE') })),
    ...partiel
  };
}

function valide(partiel: Partial<StockCount> = {}): StockCount {
  return comptage({
    id: VALIDE,
    status: 'VALIDATED',
    locationId: DEPOT,
    locationLabel: 'Dépôt de la Villa Riviera',
    validatedAt: '2026-09-01T09:15:00.000Z',
    validatedByLabel: 'Ibrahima Kouadio',
    varianceCount: 1,
    countedValue: 6_000_000,
    varianceValueGross: 400_000,
    varianceValueNet: -400_000,
    setAsideVarianceValue: 0,
    slip: {
      id: 'bon-pvi-01',
      kind: 'COUNT_REPORT',
      number: 'PVI-2026-00007',
      documentDate: '2026-09-01',
      createdAt: '2026-09-01T09:15:00.000Z'
    },
    lines: [
      ligne('l-v-ciment', CIMENT, {
        expectedQuantity: 80,
        countedQuantity: 75,
        variance: -5,
        reasonCode: 'BREAKAGE',
        justified: true,
        movementsSinceCapture: 2
      }),
      ligne('l-v-fer', FER, {
        expectedQuantity: 40,
        countedQuantity: 40,
        variance: 0,
        justified: false,
        countedBlind: false,
        movementsSinceCapture: null
      })
    ],
    ...partiel
  });
}

function solde(itemId: keyof typeof ARTICLES, locationId: string, quantity: number | null): StockBalanceView {
  const article = ARTICLES[itemId];
  return {
    itemId,
    itemReference: article.reference,
    itemLabel: article.label,
    itemUnit: article.unit,
    locationId,
    locationLabel: '',
    quantity,
    value: quantity === null ? null : quantity * 1000,
    averageUnitCost: quantity === null ? null : 1000,
    currency: 'XOF'
  };
}

function moitie(id: string, isDecrease: boolean): StockMovementView {
  return {
    id,
    type: 'TRANSFER',
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: isDecrease ? MAGASIN : DEPOT,
    locationLabel: isDecrease ? "Magasin central d'Angré" : 'Dépôt de la Villa Riviera',
    movementDate: '2026-09-19',
    quantity: 50,
    isDecrease,
    unitCost: null,
    totalValue: null,
    currency: 'XOF',
    quantityAfter: isDecrease ? 370 : null,
    valueAfter: null,
    siteId: null,
    siteLabel: null,
    costCategoryLabel: null,
    requestedBy: null,
    takerId: PRENEUR,
    takerLabel: null,
    supplierInvoiceId: null,
    supplierInvoiceReference: null,
    transferGroupId: 'transfert-01',
    stockCountId: null,
    slipId: null,
    slipNumber: null,
    reasonCode: 'SITE_SUPPLY',
    reason: null,
    valuationSource: null,
    supplierCreditValue: null,
    createdByUserId: 'user-1',
    createdByLabel: 'Awa Traoré',
    createdAt: '2026-09-19T10:00:00.000Z',
    entryLagDays: 0,
    attachmentsCount: 0
  };
}

const TRANSFERT: StockTransfer = {
  transferGroupId: 'transfert-01',
  movements: [moitie('m-out', true), moitie('m-in', false)],
  fromLocationLabel: "Magasin central d'Angré",
  toLocationLabel: 'Dépôt de la Villa Riviera',
  quantity: 50,
  value: 4_000_000,
  currency: 'XOF'
};

function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Aucun mot interdit (D2) dans le rendu. */
function attendreVocabulaireNeutre() {
  const texte = normaliser(document.body.textContent ?? '');
  expect(texte).not.toMatch(/\bvols?\b/);
  expect(texte).not.toMatch(/\bvoleurs?\b/);
  expect(texte).not.toMatch(/\bfraud/);
  expect(texte).not.toMatch(/\bdetourn/);
}

interface Config {
  ctx?: StockFieldContext;
  liste?: StockCount[];
  detail?: StockCount;
  soldes?: StockBalanceView[];
  blindLocationIds?: string[];
  valuesVisible?: boolean;
}

function configurerGet(config: Config = {}) {
  const ctx = config.ctx ?? contexte();
  const liste = config.liste ?? [enCours(), clos(), valide()];
  const meta = {
    valuesVisible: config.valuesVisible ?? ctx.abilities.valuesVisible,
    blindLocationIds: config.blindLocationIds ?? []
  };
  get.mockImplementation(async (url: string) => {
    if (/\/stock\/field-context$/.test(url)) return { data: { data: ctx, meta } };
    if (/\/stock\/balances(\?|$)/.test(url)) {
      return { data: { data: config.soldes ?? [solde(CIMENT, MAGASIN, 420), solde(SABLE, MAGASIN, 0.25)], meta } };
    }
    const detail = /\/stock\/counts\/([^/?]+)$/.exec(url);
    if (detail) {
      const trouve = config.detail ?? liste.find(c => c.id === detail[1]) ?? liste[0];
      return { data: { data: trouve } };
    }
    if (/\/stock\/counts(\?|$)/.test(url)) {
      return { data: { data: liste.map(c => ({ ...c, lines: [] })), meta } };
    }
    if (/\/stock\/attachments(\?|$)/.test(url)) return { data: { data: [] } };
    return { data: { data: [] } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  configurerGet();
  post.mockResolvedValue({
    status: 201,
    data: { data: TRANSFERT, meta: { valuesVisible: true, blindLocationIds: [] } }
  });
  put.mockResolvedValue({ data: { data: ligne('l-ciment', CIMENT) } });
});

function monter(url = `/tenant/${TENANT}/finance/stock/inventaire`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/stock/inventaire" element={<StockInventaire />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function monterDetail(countId: string) {
  return monter(`/tenant/${TENANT}/finance/stock/inventaire?inventaire=${countId}`);
}

/** Les options du menu déroulant ouvert pour ce sélecteur. */
async function optionsDe(etiquette: RegExp): Promise<HTMLElement[]> {
  const select = await screen.findByLabelText(etiquette, {}, TIMEOUT);
  fireEvent.mouseDown(select);
  return waitFor(() => {
    const liste = document.getElementById(`${select.id}_list`);
    const panneau = liste?.closest('.ant-select-dropdown');
    const items = Array.from(panneau?.querySelectorAll('.ant-select-item-option') ?? []) as HTMLElement[];
    if (items.length === 0) throw new Error(`Aucune option pour ${String(etiquette)}`);
    return items;
  }, TIMEOUT);
}

/** Les options d'un sélecteur désigné par son identifiant (deux champs portent le même libellé). */
async function optionsDeId(id: string): Promise<HTMLElement[]> {
  const select = await waitFor(() => {
    const trouve = document.getElementById(id);
    if (!trouve) throw new Error(`Sélecteur ${id} introuvable`);
    return trouve;
  }, TIMEOUT);
  fireEvent.mouseDown(select);
  return waitFor(() => {
    const liste = document.getElementById(`${id}_list`);
    const panneau = liste?.closest('.ant-select-dropdown');
    const items = Array.from(panneau?.querySelectorAll('.ant-select-item-option') ?? []) as HTMLElement[];
    if (items.length === 0) throw new Error(`Aucune option pour ${id}`);
    return items;
  }, TIMEOUT);
}

async function choisir(etiquette: RegExp, texteOption: RegExp) {
  const items = await optionsDe(etiquette);
  const trouve = items.find(item => texteOption.test(item.textContent ?? ''));
  if (!trouve) throw new Error(`Option introuvable pour ${String(texteOption)}`);
  fireEvent.click(trouve);
}

async function ongletInventaire() {
  fireEvent.click(await screen.findByRole('tab', { name: 'Inventaire physique' }, TIMEOUT));
}

/** Remplit un transfert complet : lieux, article, quantité, demandeur, motif. */
async function remplirTransfert() {
  await choisir(/Lieu d’origine/, /Magasin central d'Angré/);
  await choisir(/Lieu d’arrivée/, /Dépôt de la Villa Riviera/);
  await choisir(/Article transféré/, /CIM-42/);
  fireEvent.change(screen.getByLabelText('Quantité'), { target: { value: '50' } });
  await choisir(/^Preneur$/, /Koné Ibrahim/);
  fireEvent.click(screen.getByRole('radio', { name: /Approvisionnement/ }));
}

// ===========================================================================
// 1. Le transfert (ecrans §7.1)
// ===========================================================================

describe('Le transfert entre lieux', () => {
  it('dit, avant le formulaire, qu’un transfert n’impute rien', async () => {
    monter();
    expect(
      await screen.findByText(/Un transfert n’impute rien : ce n’est pas une dépense/, {}, TIMEOUT)
    ).toBeInTheDocument();
    expect(screen.getByText(/Seule la sortie de stock impute un chantier/)).toBeInTheDocument();
  });

  it('poste demandeur, motif et identifiant de requête — ni agence, ni prix, ni chantier', async () => {
    monter();
    await remplirTransfert();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le transfert' }));

    await waitFor(() => expect(post).toHaveBeenCalled(), TIMEOUT);
    const [adresse, corps] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/transfers`);
    expect(Object.keys(corps).sort()).toEqual(
      [
        'clientRequestId',
        'fromLocationId',
        'itemId',
        'quantity',
        'reasonCode',
        'takerId',
        'toLocationId',
        'transferDate'
      ].sort()
    );
    expect(corps.takerId).toBe(PRENEUR);
    expect(corps.reasonCode).toBe('SITE_SUPPLY');
    expect(String(corps.clientRequestId)).toMatch(UUID);
    expect(corps).not.toHaveProperty('tenantId');
    expect(corps).not.toHaveProperty('unitCost');
    expect(corps).not.toHaveProperty('siteId');
  }, 40000);

  it('envoie la précision quand le motif est « Autre », et ferme l’envoi tant qu’elle manque', async () => {
    monter();
    await remplirTransfert();
    fireEvent.click(screen.getByRole('radio', { name: /Autre/ }));
    expect(screen.getByRole('button', { name: 'Enregistrer le transfert' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Précision/), { target: { value: 'Prêt au chantier voisin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le transfert' }));

    await waitFor(() => expect(post).toHaveBeenCalled(), TIMEOUT);
    const [, corps] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(corps.reasonCode).toBe('OTHER');
    expect(corps.reason).toBe('Prêt au chantier voisin');
  }, 40000);

  it('désactive le lieu d’un chantier clos dans les destinations', async () => {
    monter();
    const items = await optionsDe(/Lieu d’arrivée/);
    const clos = items.find(item => /Dépôt de Cocody/.test(item.textContent ?? ''));
    expect(clos?.textContent).toMatch(/\(chantier clos\)/);
    expect(clos?.className).toMatch(/ant-select-item-option-disabled/);
  }, 40000);

  it('lieu d’origine en comptage : ni quantité, ni avertissement de dépassement', async () => {
    configurerGet({ soldes: [solde(SABLE, MAGASIN, null)], blindLocationIds: [MAGASIN] });
    monter();
    await choisir(/Lieu d’origine/, /Magasin central d'Angré/);
    await choisir(/Article transféré/, /SAB-00/);
    fireEvent.change(screen.getByLabelText('Quantité'), { target: { value: '9' } });

    expect(await screen.findByText(/la quantité disponible n’est pas affichée/, {}, TIMEOUT)).toBeInTheDocument();
    expect(screen.queryByText(/La quantité dépasse/)).not.toBeInTheDocument();
    expect(screen.queryByText(/il reste/)).not.toBeInTheDocument();
  }, 40000);

  it('n’affiche pas la valeur déplacée sans les valeurs', async () => {
    configurerGet({ ctx: contexte({}, { valuesVisible: false }), valuesVisible: false });
    post.mockResolvedValue({
      status: 201,
      data: { data: { ...TRANSFERT, value: null }, meta: { valuesVisible: false, blindLocationIds: [] } }
    });
    monter();
    await remplirTransfert();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le transfert' }));

    expect(await screen.findByText('Dernier transfert enregistré', {}, TIMEOUT)).toBeInTheDocument();
    expect(screen.queryByText('Valeur déplacée')).not.toBeInTheDocument();
    expect(screen.getByText(/Les valeurs du stock ne sont pas affichées pour votre rôle/)).toBeInTheDocument();
    // « il y reste » d'un lieu en comptage : masqué, pas « 0 ».
    expect(screen.getByText('Masqué (comptage en cours)')).toBeInTheDocument();
  }, 40000);
});

// ===========================================================================
// 2. La liste et l'ouverture (ecrans §7.2, §7.3)
// ===========================================================================

describe('La liste des inventaires', () => {
  it('affiche les quatre états par leur libellé, et « Masqué » pour un comptage en cours', async () => {
    monter();
    await ongletInventaire();

    expect(await screen.findByText('Comptage en cours', {}, TIMEOUT)).toBeInTheDocument();
    expect(screen.getByText('Comptage clos')).toBeInTheDocument();
    expect(screen.queryByText('Brouillon')).not.toBeInTheDocument();
    expect(screen.getAllByText('Masqué').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Justifier les écarts' })).toBeInTheDocument();
  }, 40000);

  it('ouvre un inventaire courant : le lieu et la date, jamais l’agence', async () => {
    post.mockResolvedValue({ data: { data: enCours() } });
    monter();
    await ongletInventaire();
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir un inventaire' }, TIMEOUT));
    await choisir(/Lieu à compter/, /Magasin central d'Angré/);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir l’inventaire' }));

    await waitFor(() => expect(post).toHaveBeenCalled(), TIMEOUT);
    const [adresse, corps] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/counts`);
    expect(Object.keys(corps).sort()).toEqual(['countedAt', 'locationId']);
  }, 40000);

  it('?ouvrir=OPENING&lieu= préremplit l’inventaire d’ouverture quand le lieu le porte', async () => {
    const ctx = contexte();
    ctx.locations = ctx.locations.map(l => (l.id === DEPOT ? { ...l, openingCountSuggested: true } : l));
    configurerGet({ ctx });
    monter(`/tenant/${TENANT}/finance/stock/inventaire?ouvrir=OPENING&lieu=${DEPOT}`);

    const fenetre = await screen.findByRole('dialog', {}, TIMEOUT);
    expect(within(fenetre).getByText('Inventaire d’ouverture')).toBeInTheDocument();
    expect(within(fenetre).getByText(/Un surplus y entre sans valeur/)).toBeInTheDocument();
    const natures = await optionsDeId('comptage-nature');
    expect(natures.map(n => n.textContent)).toEqual([
      'Inventaire courant',
      'Inventaire d’ouverture',
      'Inventaire de clôture'
    ]);
  }, 40000);

  it('n’offre pas « Inventaire d’ouverture » quand openingCountSuggested est faux', async () => {
    monter(`/tenant/${TENANT}/finance/stock/inventaire?ouvrir=OPENING&lieu=${DEPOT}`);

    const fenetre = await screen.findByRole('dialog', {}, TIMEOUT);
    expect(within(fenetre).getByText('Inventaire courant')).toBeInTheDocument();
    const natures = await optionsDeId('comptage-nature');
    expect(natures.map(n => n.textContent)).toEqual(['Inventaire courant', 'Inventaire de clôture']);
  }, 40000);
});

// ===========================================================================
// 3. Le comptage à l'aveugle (ecrans §7.4)
// ===========================================================================

describe('Le comptage en cours (DRAFT)', () => {
  it('ne dit jamais l’attendu, et ne lit aucun solde', async () => {
    monterDetail(EN_COURS);
    expect(await screen.findByText(/Comptage à l’aveugle/, {}, TIMEOUT)).toBeInTheDocument();
    await screen.findByText('418 sac', {}, TIMEOUT);

    expect(screen.queryByText(/Le système dit/)).not.toBeInTheDocument();
    expect(screen.queryByText('Ce que le système disait')).not.toBeInTheDocument();
    expect(screen.queryByText('Écart')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Motif/)).not.toBeInTheDocument();
    for (const [url] of get.mock.calls as [string][]) {
      expect(url).not.toMatch(/\/stock\/balances/);
    }
    attendreVocabulaireNeutre();
  }, 40000);

  it('le PUT ne porte que l’article, la quantité comptée et l’identifiant — jamais de motif', async () => {
    monterDetail(EN_COURS);
    await choisir(/Article compté/, /FER-12/);
    fireEvent.change(screen.getByLabelText('Quantité comptée'), { target: { value: '188' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le comptage' }));

    await waitFor(() => expect(put).toHaveBeenCalled(), TIMEOUT);
    const [adresse, corps] = put.mock.calls[0] as [string, Record<string, unknown>];
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/counts/${EN_COURS}/lines`);
    expect(Object.keys(corps).sort()).toEqual(['clientRequestId', 'countedQuantity', 'itemId']);
    expect(corps.countedQuantity).toBe(188);
    expect(String(corps.clientRequestId)).toMatch(UUID);
    expect(corps).not.toHaveProperty('reason');
    expect(corps).not.toHaveProperty('expectedQuantity');
  }, 40000);

  it('« Clore le comptage » poste …/close après confirmation', async () => {
    post.mockResolvedValue({ data: { data: clos() } });
    monterDetail(EN_COURS);
    fireEvent.click(await screen.findByRole('button', { name: 'Clore le comptage' }, TIMEOUT));
    const boutons = await screen.findAllByRole('button', { name: 'Clore le comptage' }, TIMEOUT);
    fireEvent.click(boutons[boutons.length - 1]);

    await waitFor(() => expect(post).toHaveBeenCalled(), TIMEOUT);
    expect(post.mock.calls[0][0]).toBe(`/tenants/${TENANT}/finance/stock/counts/${EN_COURS}/close`);
  }, 40000);

  it('relaie STOCK_COUNT_INCOMPLETE en nommant les articles du serveur', async () => {
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
    monterDetail(EN_COURS);
    fireEvent.click(await screen.findByRole('button', { name: 'Clore le comptage' }, TIMEOUT));
    const boutons = await screen.findAllByRole('button', { name: 'Clore le comptage' }, TIMEOUT);
    fireEvent.click(boutons[boutons.length - 1]);

    expect(await screen.findByText(/Il reste à compter : Fer à béton HA 12/, {}, TIMEOUT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compter Fer à béton HA 12' })).toBeInTheDocument();
  }, 40000);

  it('abandonne avec un motif obligatoire', async () => {
    post.mockResolvedValue({ data: { data: { ...enCours(), status: 'CANCELLED' } } });
    monterDetail(EN_COURS);
    fireEvent.click(await screen.findByRole('button', { name: 'Abandonner l’inventaire' }, TIMEOUT));
    const fenetre = await screen.findByRole('dialog', {}, TIMEOUT);
    const ok = within(fenetre).getByRole('button', { name: 'Abandonner l’inventaire' });
    expect(ok).toBeDisabled();

    fireEvent.change(within(fenetre).getByLabelText('Motif'), { target: { value: 'Mauvais lieu choisi' } });
    fireEvent.click(ok);

    await waitFor(() => expect(post).toHaveBeenCalled(), TIMEOUT);
    expect(post.mock.calls[0]).toEqual([
      `/tenants/${TENANT}/finance/stock/counts/${EN_COURS}/cancel`,
      { reason: 'Mauvais lieu choisi' }
    ]);
  }, 40000);
});

// ===========================================================================
// 4. Le comptage clos : justifier, écarter (ecrans §7.5)
// ===========================================================================

describe('Le comptage clos (COUNTED)', () => {
  it('montre l’écart tel que le serveur le calcule, à justifier en « warning », jamais en rouge', async () => {
    monterDetail(CLOS);
    expect(await screen.findByText(`${MOINS}7 barre`, {}, TIMEOUT)).toBeInTheDocument();
    expect(screen.queryByText(`${MOINS}12 barre`)).not.toBeInTheDocument();
    const aJustifier = screen.getAllByText('Écart à justifier');
    // Seule la ligne du fer : la ligne d'avant le lot a un motif libre qui vaut justification.
    expect(aJustifier).toHaveLength(1);
    expect(screen.getByText(/Motif libre : Trois tôles/)).toBeInTheDocument();
    expect(document.querySelector('.ant-typography-danger')).toBeNull();
  }, 40000);

  it('justifie un écart : PUT …/justification avec le motif ; « Autre » sans précision reste fermé', async () => {
    put.mockResolvedValue({ data: { data: ligne('l-fer', FER) } });
    monterDetail(CLOS);
    fireEvent.click(await screen.findByRole('button', { name: 'Justifier' }, TIMEOUT));
    const fenetre = await screen.findByRole('dialog', {}, TIMEOUT);
    const ok = within(fenetre).getByRole('button', { name: 'Enregistrer le motif' });

    expect(within(fenetre).queryByRole('radio', { name: /Stock d’ouverture/ })).not.toBeInTheDocument();
    fireEvent.click(within(fenetre).getByRole('radio', { name: /Autre/ }));
    expect(ok).toBeDisabled();

    fireEvent.click(within(fenetre).getByRole('radio', { name: /Disparition non expliquée/ }));
    fireEvent.click(ok);

    await waitFor(() => expect(put).toHaveBeenCalled(), TIMEOUT);
    expect(put.mock.calls[0]).toEqual([
      `/tenants/${TENANT}/finance/stock/counts/${CLOS}/lines/${FER}/justification`,
      { reasonCode: 'UNEXPLAINED_DISAPPEARANCE' }
    ]);
  }, 40000);

  it('écarte une ligne avec un motif : POST …/set-aside', async () => {
    post.mockResolvedValue({ data: { data: clos() } });
    monterDetail(CLOS);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Écarter la ligne' }, TIMEOUT))[0]);
    const fenetre = await screen.findByRole('dialog', {}, TIMEOUT);
    fireEvent.change(within(fenetre).getByLabelText('Motif'), { target: { value: 'À recompter demain' } });
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Écarter la ligne' }));

    await waitFor(() => expect(post).toHaveBeenCalled(), TIMEOUT);
    expect(post.mock.calls[0]).toEqual([
      `/tenants/${TENANT}/finance/stock/counts/${CLOS}/lines/${FER}/set-aside`,
      { reason: 'À recompter demain' }
    ]);
  }, 40000);

  it('écarte tous les non comptés en une fois, et ferme la validation tant qu’il en reste', async () => {
    post.mockResolvedValue({ data: { data: clos() } });
    monterDetail(CLOS);
    expect(
      await screen.findByText(/1 article\(s\) non compté\(s\) à écarter avant la validation/, {}, TIMEOUT)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider l’inventaire' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Écarter tous les articles non comptés' }));
    const fenetre = await screen.findByRole('dialog', {}, TIMEOUT);
    fireEvent.change(within(fenetre).getByLabelText('Motif'), { target: { value: 'Inventaire tournant' } });
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Écarter les articles non comptés' }));

    await waitFor(() => expect(post).toHaveBeenCalled(), TIMEOUT);
    expect(post.mock.calls[0]).toEqual([
      `/tenants/${TENANT}/finance/stock/counts/${CLOS}/set-aside-uncounted`,
      { reason: 'Inventaire tournant' }
    ]);
  }, 40000);

  it('n’offre pas le procès-verbal avant la validation, et garde un vocabulaire neutre', async () => {
    monterDetail(CLOS);
    await screen.findByText(`${MOINS}7 barre`, {}, TIMEOUT);
    expect(screen.queryByRole('button', { name: /procès-verbal/ })).not.toBeInTheDocument();
    attendreVocabulaireNeutre();
  }, 40000);
});

// ===========================================================================
// 5. La validation (ecrans §7.6)
// ===========================================================================

describe('La validation', () => {
  it('poste un corps vide, et la confirmation dit que les mouvements postérieurs sont conservés', async () => {
    configurerGet({ liste: [closPret()] });
    post.mockResolvedValue({ data: { data: { ...closPret(), status: 'VALIDATED' } } });
    monterDetail(CLOS);
    fireEvent.click(await screen.findByRole('button', { name: 'Valider l’inventaire' }, TIMEOUT));

    expect(
      await screen.findByText(/Les mouvements enregistrés depuis le comptage sont conservés/, {}, TIMEOUT)
    ).toBeInTheDocument();
    expect(screen.queryByText(/écrasera/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la validation' }));

    await waitFor(() => expect(post).toHaveBeenCalled(), TIMEOUT);
    expect(post.mock.calls[0]).toEqual([`/tenants/${TENANT}/finance/stock/counts/${CLOS}/validate`, {}]);
  }, 40000);

  it('quatre yeux : un compteur sans dérogation voit l’alerte et un bouton fermé', async () => {
    configurerGet({ liste: [closPret({ validation: { callerIsCounter: true, selfValidationAllowed: false } })] });
    monterDetail(CLOS);
    expect(await screen.findByText('Vous avez compté des lignes de cet inventaire', {}, TIMEOUT)).toBeInTheDocument();
    expect(screen.getByText('Une autre personne habilitée de l’agence doit le valider.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider l’inventaire' })).toBeDisabled();
  }, 40000);

  it('dérogation permise : le bouton ouvre « Valider sans second regard » et envoie la raison', async () => {
    configurerGet({ liste: [closPret({ validation: { callerIsCounter: true, selfValidationAllowed: true } })] });
    post.mockResolvedValue({ data: { data: { ...closPret(), status: 'VALIDATED' } } });
    monterDetail(CLOS);
    fireEvent.click(await screen.findByRole('button', { name: 'Valider l’inventaire' }, TIMEOUT));
    const fenetre = await screen.findByRole('dialog', {}, TIMEOUT);
    expect(within(fenetre).getByText('Valider sans second regard')).toBeInTheDocument();
    fireEvent.change(within(fenetre).getByLabelText('Pourquoi validez-vous seul ?'), {
      target: { value: 'Je suis seul habilité ce mois-ci.' }
    });
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Valider l’inventaire' }));

    await waitFor(() => expect(post).toHaveBeenCalled(), TIMEOUT);
    expect(post.mock.calls[0][1]).toEqual({ selfValidationReason: 'Je suis seul habilité ce mois-ci.' });
  }, 40000);

  it('400 …REASON_REQUIRED ouvre la fenêtre de dérogation (rôle changé entre deux lectures)', async () => {
    configurerGet({ liste: [closPret()] });
    post.mockRejectedValueOnce({
      response: { status: 400, data: { code: 'STOCK_COUNT_SELF_VALIDATION_REASON_REQUIRED', message: 'Raison exigée' } }
    });
    monterDetail(CLOS);
    fireEvent.click(await screen.findByRole('button', { name: 'Valider l’inventaire' }, TIMEOUT));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer la validation' }, TIMEOUT));

    expect(await screen.findByLabelText('Pourquoi validez-vous seul ?', {}, TIMEOUT)).toBeInTheDocument();
  }, 40000);

  it('409 …NEGATIVE_AFTER_MOVEMENTS liste les articles avec « Écarter la ligne »', async () => {
    configurerGet({ liste: [closPret()] });
    post.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          code: 'STOCK_COUNT_NEGATIVE_AFTER_MOVEMENTS',
          message: 'Négatif',
          data: { items: [{ itemId: CIMENT, itemLabel: 'Ciment CPJ 42,5' }] }
        }
      }
    });
    monterDetail(CLOS);
    fireEvent.click(await screen.findByRole('button', { name: 'Valider l’inventaire' }, TIMEOUT));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer la validation' }, TIMEOUT));

    expect(await screen.findByText(/plus que ce qui a été compté : Ciment CPJ 42,5/, {}, TIMEOUT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Écarter la ligne Ciment CPJ 42,5' })).toBeInTheDocument();
  }, 40000);

  it('403 …SELF_VALIDATION_FORBIDDEN laisse une alerte persistante', async () => {
    configurerGet({ liste: [closPret()] });
    post.mockRejectedValueOnce({
      response: { status: 403, data: { code: 'STOCK_COUNT_SELF_VALIDATION_FORBIDDEN', message: 'Refusé' } }
    });
    monterDetail(CLOS);
    fireEvent.click(await screen.findByRole('button', { name: 'Valider l’inventaire' }, TIMEOUT));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer la validation' }, TIMEOUT));

    expect(
      await screen.findByText(/Vous avez compté cet inventaire : une autre personne habilitée/, {}, TIMEOUT)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider l’inventaire' })).toBeDisabled();
  }, 40000);
});

// ===========================================================================
// 6. L'inventaire validé (ecrans §7.7)
// ===========================================================================

describe('L’inventaire validé', () => {
  it('offre le procès-verbal, dit la validation sans second regard et la ligne comptée sans aveugle', async () => {
    configurerGet({
      liste: [valide({ selfValidated: true, selfValidationReason: 'Seul habilité en congé' })]
    });
    monterDetail(VALIDE);
    expect(
      await screen.findByRole('button', { name: /Télécharger le procès-verbal \(PDF\)/ }, TIMEOUT)
    ).toBeInTheDocument();
    expect(screen.getAllByText('Validé sans second regard').length).toBeGreaterThan(0);
    expect(screen.getByText(/Motif donné : « Seul habilité en congé »/)).toBeInTheDocument();
    expect(screen.getByText('Comptée par une personne qui voyait le stock')).toBeInTheDocument();
    expect(screen.getByText('Non mesuré')).toBeInTheDocument();
    expect(screen.getByText(/Cet inventaire ne s’annule pas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Valider l’inventaire' })).not.toBeInTheDocument();
    attendreVocabulaireNeutre();
  }, 40000);
});
