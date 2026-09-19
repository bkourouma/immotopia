import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StockInventaire } from '../../pages/finance/StockInventaire';
import type {
  StockBalanceRef,
  StockCount,
  StockCountLine,
  StockItemRef,
  StockLocationRef,
  StockTransfer
} from '../../types/finance-stock-inventaire-types';

/**
 * Transferts et inventaire physique — lot 5, troisième sous-lot (PRD E9,
 * besoins S4 et S6 ; contrat gelé
 * `packages/api/src/lib/finance/types-lot5-inventaire.ts`).
 *
 * Comme `cloture-chantier.test.tsx`, ce fichier monte l'écran par-dessus un
 * `apiClient` simulé — **jamais le service doublé**. Les garanties d'adresse et
 * de corps valent donc pour ce que l'écran envoie réellement, geste par geste,
 * et non pour ce qu'un mock du service aurait laissé passer sans le voir.
 *
 * Les six garanties qui comptent plus que les autres :
 *
 * 1. **Un transfert n'impute rien, et l'écran le dit.** C'est le piège du
 *    sous-lot : livrer sur un chantier *ressemble* à une dépense, et quelqu'un
 *    qui le croirait se tromperait sur ses chiffres.
 * 2. **`expectedQuantity` ne part jamais dans le corps d'une ligne.** Le
 *    serveur la lit et la fige (principe P-4) ; son schéma est `.strict()` et
 *    la refuserait en 400.
 * 3. **L'écart vient du serveur.** Les fixtures portent volontairement une
 *    `variance` qu'aucune soustraction ne produit : un écran qui recalculerait
 *    tomberait ici.
 * 4. **Un écart sans motif ne se valide pas** (besoin S6), et l'écran le dit
 *    AVANT l'envoi en nommant les lignes fautives.
 * 5. **Une quantité n'est pas un montant** : quatre décimales, et un quart de
 *    mètre cube ne s'affiche pas « 0 ».
 * 6. **Aucun « débit » ni « crédit »** (principe P-1), balayé sur le rendu.
 *
 * `useBreakpoint` est figé en desktop pour un `<ConfirmAction>` déterministe
 * (`Popconfirm`), comme dans `cloture-chantier.test.tsx`.
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
const del = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'agence-1';
const MAGASIN = 'lieu-magasin-01';
const DEPOT = 'lieu-nongo-02';
const CIMENT = 'article-ciment-01';
const FER = 'article-fer-02';
const SABLE = 'article-sable-03';
const BROUILLON = 'comptage-brouillon-01';
const VALIDE = 'comptage-valide-02';

/** Le signe moins typographique de `formatVariance`, jamais le trait d'union. */
const MOINS = '−';

const ARTICLES: StockItemRef[] = [
  { id: CIMENT, reference: 'CIM-42', label: 'Ciment CPJ 42,5', unit: 'sac', isActive: true },
  { id: FER, reference: 'FER-12', label: 'Fer à béton HA 12', unit: 'barre', isActive: true },
  { id: SABLE, reference: 'SAB-00', label: 'Sable lavé', unit: 'm³', isActive: true }
];

const LIEUX: StockLocationRef[] = [
  { id: MAGASIN, kind: 'WAREHOUSE', label: 'Magasin central de Kipé', siteId: null, siteLabel: null, isActive: true },
  {
    id: DEPOT,
    kind: 'SITE',
    label: 'Dépôt de la Villa de Nongo',
    siteId: 'chantier-nongo',
    siteLabel: 'Villa de Nongo',
    isActive: true
  }
];

/** Le sable porte un quart de mètre cube : la quantité qui s'afficherait « 0 ». */
const SOLDES: StockBalanceRef[] = [
  {
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    quantity: 420,
    value: 33_600_000,
    averageUnitCost: 80_000,
    currency: 'GNF'
  },
  {
    itemId: SABLE,
    itemReference: 'SAB-00',
    itemLabel: 'Sable lavé',
    itemUnit: 'm³',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    quantity: 0.25,
    value: 75_000,
    averageUnitCost: 300_000,
    currency: 'GNF'
  }
];

function ligne(partiel: Partial<StockCountLine> & Pick<StockCountLine, 'id' | 'itemId'>): StockCountLine {
  return {
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    expectedQuantity: 0,
    countedQuantity: 0,
    variance: 0,
    reason: null,
    ...partiel
  };
}

/**
 * Comptage en BROUILLON.
 *
 * Trois lignes, et des `variance` volontairement INCOHÉRENTES avec la
 * soustraction : 188 − 200 ne fait pas −7. Un écran qui recalculerait au lieu
 * d'afficher ce que le serveur envoie tomberait ici.
 */
function brouillon(overrides: Partial<StockCount> = {}): StockCount {
  return {
    id: BROUILLON,
    tenantId: TENANT,
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    countedAt: '2026-09-18T00:00:00.000Z',
    status: 'DRAFT',
    lines: [
      // Conforme : aucun écart, aucun motif à donner.
      ligne({ id: 'l-ciment', itemId: CIMENT, expectedQuantity: 420, countedQuantity: 420, variance: 0 }),
      // Il manque, et c'est justifié.
      ligne({
        id: 'l-fer',
        itemId: FER,
        itemReference: 'FER-12',
        itemLabel: 'Fer à béton HA 12',
        itemUnit: 'barre',
        expectedQuantity: 200,
        countedQuantity: 188,
        variance: -7,
        reason: 'Vol constaté sur le dépôt.'
      }),
      // Écart SANS motif : c'est lui qui bloque la validation (besoin S6), et
      // c'est le quart de mètre cube qui ne doit pas s'afficher « 0 ».
      ligne({
        id: 'l-sable',
        itemId: SABLE,
        itemReference: 'SAB-00',
        itemLabel: 'Sable lavé',
        itemUnit: 'm³',
        expectedQuantity: 12.5,
        countedQuantity: 12.25,
        variance: -0.25,
        reason: null
      })
    ],
    varianceCount: 2,
    varianceValue: -565_000,
    currency: 'GNF',
    createdByLabel: 'Mariama Diallo',
    validatedAt: null,
    ...overrides
  };
}

/** Le même comptage, mais tous les écarts justifiés : la validation est possible. */
function brouillonJustifie(): StockCount {
  const base = brouillon();
  return {
    ...base,
    lines: base.lines.map(l => (l.variance === 0 ? l : { ...l, reason: l.reason ?? 'Casse au déchargement.' }))
  };
}

function valide(): StockCount {
  return brouillon({
    id: VALIDE,
    locationId: DEPOT,
    locationLabel: 'Dépôt de la Villa de Nongo',
    status: 'VALIDATED',
    validatedAt: '2026-09-01T09:15:00.000Z',
    lines: [
      ligne({
        id: 'l-valide',
        itemId: CIMENT,
        expectedQuantity: 80,
        countedQuantity: 75,
        variance: -5,
        reason: 'Casse au déchargement.'
      })
    ],
    varianceCount: 1,
    varianceValue: -400_000
  });
}

const TRANSFERT: StockTransfer = {
  transferGroupId: 'transfert-01',
  movements: [
    {
      id: 'm-out',
      type: 'TRANSFER_OUT',
      itemId: CIMENT,
      itemReference: 'CIM-42',
      itemLabel: 'Ciment CPJ 42,5',
      itemUnit: 'sac',
      locationId: MAGASIN,
      locationLabel: 'Magasin central de Kipé',
      movementDate: '2026-09-19T00:00:00.000Z',
      quantity: 50,
      isDecrease: true,
      unitCost: 80_000,
      totalValue: 4_000_000,
      currency: 'GNF',
      quantityAfter: 370,
      valueAfter: 29_600_000
    },
    {
      id: 'm-in',
      type: 'TRANSFER_IN',
      itemId: CIMENT,
      itemReference: 'CIM-42',
      itemLabel: 'Ciment CPJ 42,5',
      itemUnit: 'sac',
      locationId: DEPOT,
      locationLabel: 'Dépôt de la Villa de Nongo',
      movementDate: '2026-09-19T00:00:00.000Z',
      quantity: 50,
      isDecrease: false,
      unitCost: 80_000,
      totalValue: 4_000_000,
      currency: 'GNF',
      quantityAfter: 125,
      valueAfter: 10_000_000
    }
  ],
  fromLocationLabel: 'Magasin central de Kipé',
  toLocationLabel: 'Dépôt de la Villa de Nongo',
  quantity: 50,
  value: 4_000_000,
  currency: 'GNF'
};

/** Nettoie casse et accents, pour une vérification insensible aux deux. */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function configurerGet(options: { comptages?: StockCount[]; detail?: StockCount } = {}) {
  const liste = options.comptages ?? [brouillon(), valide()];
  const detail = options.detail ?? liste[0];

  get.mockImplementation(async (url: string) => {
    if (/\/stock\/items(\?|$)/.test(url)) return { data: { data: ARTICLES } };
    if (/\/stock\/locations(\?|$)/.test(url)) return { data: { data: LIEUX } };
    if (/\/stock\/balances(\?|$)/.test(url)) return { data: { data: SOLDES } };
    if (/\/stock\/counts\/[^/?]+$/.test(url)) return { data: { data: detail } };
    if (/\/stock\/counts(\?|$)/.test(url)) return { data: { data: liste } };
    return { data: { data: null } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  configurerGet();
  post.mockResolvedValue({ data: { data: TRANSFERT } });
  put.mockResolvedValue({ data: { data: brouillon() } });
  del.mockResolvedValue({ data: { data: brouillon() } });
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

/**
 * Ouvre une liste déroulante AntD et choisit l'option dont le texte est donné.
 *
 * La recherche est confinée au panneau de CE sélecteur : rc-select duplique le
 * libellé d'une option dans l'élément de sélection et dans son miroir
 * d'accessibilité, et deux sélecteurs de cet écran partagent la même liste de
 * lieux. Un `findByText` global en trouverait trois.
 */
async function choisir(etiquette: RegExp, texteOption: RegExp) {
  const select = await screen.findByLabelText(etiquette, {}, { timeout: 8000 });
  fireEvent.mouseDown(select);

  const option = await waitFor(
    () => {
      const liste = document.getElementById(`${select.id}_list`);
      const panneau = liste?.closest('.ant-select-dropdown');
      const items = Array.from(panneau?.querySelectorAll('.ant-select-item-option') ?? []);
      const trouve = items.find(item => texteOption.test(item.textContent ?? ''));
      if (!trouve) throw new Error(`Option introuvable pour ${String(texteOption)}`);
      return trouve as HTMLElement;
    },
    { timeout: 8000 }
  );

  fireEvent.click(option);
}

/** Passe à l'onglet de l'inventaire physique. */
async function ongletInventaire() {
  fireEvent.click(await screen.findByRole('tab', { name: 'Inventaire physique' }, { timeout: 8000 }));
}

/** Ouvre le comptage en brouillon depuis la liste. */
async function ouvrirBrouillon() {
  await ongletInventaire();
  fireEvent.click((await screen.findAllByRole('button', { name: 'Poursuivre le comptage' }, { timeout: 8000 }))[0]);
  return screen.findByText(/Comptage de « Magasin central de Kipé »/, {}, { timeout: 8000 });
}

// ===========================================================================
// 1. Le piège du sous-lot : un transfert n'impute rien
// ===========================================================================

describe('Un transfert n’impute rien, et l’écran le dit', () => {
  it('l’annonce avant le formulaire, en nommant la sortie comme seule imputation', async () => {
    monter();

    expect(
      await screen.findByText(/Un transfert n’impute rien : ce n’est pas une dépense/, {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByText(/le coût du chantier ne bouge pas/i)).toBeInTheDocument();
    expect(screen.getByText(/Seule la sortie de stock impute un chantier/i)).toBeInTheDocument();
  });

  it('présente la valeur d’un transfert comme DÉPLACÉE, jamais comme une charge', async () => {
    monter();

    await choisir(/Lieu d’origine/, /Magasin central de Kipé \(Magasin\)/);
    await choisir(/Lieu d’arrivée/, /Dépôt de la Villa de Nongo \(Lieu de chantier\)/);
    await choisir(/Article transféré/, /CIM-42/);
    fireEvent.change(screen.getByLabelText('Quantité'), { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le transfert' }));

    expect(await screen.findByText('Valeur déplacée', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/Ce n’est pas une dépense, et aucun chantier n’a été imputé/)).toBeInTheDocument();
    // Les deux moitiés du transfert, et l'invariant qu'elles portent.
    expect(screen.getByText(/La somme des valeurs des deux lieux ne bouge pas/)).toBeInTheDocument();
  }, 40000);
});

// ===========================================================================
// 2. Le corps du transfert
// ===========================================================================

describe('Le transfert', () => {
  it('poste cinq champs et rien d’autre : ni agence, ni prix, ni chantier', async () => {
    monter();

    await choisir(/Lieu d’origine/, /Magasin central de Kipé \(Magasin\)/);
    await choisir(/Lieu d’arrivée/, /Dépôt de la Villa de Nongo \(Lieu de chantier\)/);
    await choisir(/Article transféré/, /CIM-42/);
    fireEvent.change(screen.getByLabelText('Quantité'), { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le transfert' }));

    await waitFor(() => expect(post).toHaveBeenCalled(), { timeout: 8000 });
    const [adresse, corps] = post.mock.calls[post.mock.calls.length - 1] as [string, Record<string, unknown>];

    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/transfers`);
    expect(Object.keys(corps).sort()).toEqual(['fromLocationId', 'itemId', 'quantity', 'toLocationId', 'transferDate']);
    expect(corps.fromLocationId).toBe(MAGASIN);
    expect(corps.toLocationId).toBe(DEPOT);
    expect(corps.itemId).toBe(CIMENT);
    expect(corps.quantity).toBe(50);
    expect(String(corps.transferDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // L'agence est dans le CHEMIN. Le prix ne se saisit pas — la valeur part au
    // coût moyen du lieu d'origine. Et aucun chantier : un transfert n'impute rien.
    expect(corps).not.toHaveProperty('tenantId');
    expect(corps).not.toHaveProperty('unitCost');
    expect(corps).not.toHaveProperty('siteId');
    expect(corps).not.toHaveProperty('costCategoryId');
  }, 40000);

  it('annonce ce qu’il reste au lieu d’origine avec ses décimales, pas « 0 »', async () => {
    monter();

    await choisir(/Lieu d’origine/, /Magasin central de Kipé \(Magasin\)/);
    await choisir(/Article transféré/, /SAB-00/);

    // Un quart de mètre cube. `formatMoney` afficherait « 0 ».
    expect(await screen.findByText('0,25 m³', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/c’est le serveur qui refuse une quantité supérieure au stock/)).toBeInTheDocument();
  }, 40000);

  it('refuse les deux mêmes lieux avant l’envoi, en disant pourquoi', async () => {
    monter();

    await choisir(/Lieu d’origine/, /Magasin central de Kipé \(Magasin\)/);
    await choisir(/Lieu d’arrivée/, /Magasin central de Kipé \(Magasin\)/);
    await choisir(/Article transféré/, /CIM-42/);
    fireEvent.change(screen.getByLabelText('Quantité'), { target: { value: '5' } });

    expect(
      await screen.findByText(/Le lieu d’origine et le lieu d’arrivée sont les mêmes/, {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer le transfert' })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  }, 40000);

  it('prévient quand la quantité dépasse le stock, sans se substituer au serveur', async () => {
    monter();

    await choisir(/Lieu d’origine/, /Magasin central de Kipé \(Magasin\)/);
    await choisir(/Lieu d’arrivée/, /Dépôt de la Villa de Nongo \(Lieu de chantier\)/);
    await choisir(/Article transféré/, /SAB-00/);
    fireEvent.change(screen.getByLabelText('Quantité'), { target: { value: '9' } });

    expect(
      await screen.findByText(/La quantité dépasse ce qu’il reste au lieu d’origine/, {}, { timeout: 8000 })
    ).toBeInTheDocument();
    // L'écran prévient, il n'interdit pas : la liste des soldes peut être en
    // retard d'un mouvement, et c'est le serveur qui refuse.
    expect(screen.getByRole('button', { name: 'Enregistrer le transfert' })).not.toBeDisabled();
  }, 40000);
});

// ===========================================================================
// 3. L'inventaire — la liste et l'ouverture
// ===========================================================================

describe('L’inventaire', () => {
  it('liste les comptages avec leur état et le nombre de lignes en écart', async () => {
    monter();
    await ongletInventaire();

    expect(await screen.findByText('Brouillon', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Validé')).toBeInTheDocument();
  }, 40000);

  it('ouvre un comptage : le corps porte le lieu et la date, jamais l’agence', async () => {
    post.mockResolvedValue({ data: { data: brouillon() } });
    monter();
    await ongletInventaire();

    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir un comptage' }, { timeout: 8000 }));
    await choisir(/Lieu à compter/, /Magasin central de Kipé \(Magasin\)/);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le comptage' }));

    await waitFor(() => expect(post).toHaveBeenCalled(), { timeout: 8000 });
    const [adresse, corps] = post.mock.calls[post.mock.calls.length - 1] as [string, Record<string, unknown>];

    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/counts`);
    expect(Object.keys(corps).sort()).toEqual(['countedAt', 'locationId']);
    expect(corps.locationId).toBe(MAGASIN);
    expect(corps).not.toHaveProperty('tenantId');
  }, 40000);
});

// ===========================================================================
// 4. La saisie d'une ligne — l'attendu ne se saisit jamais
// ===========================================================================

describe('La saisie d’une ligne de comptage', () => {
  it('n’offre aucun champ « quantité attendue », et le dit', async () => {
    await (monter(), ouvrirBrouillon());

    expect(await screen.findByLabelText('Article compté', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByLabelText('Quantité comptée')).toBeInTheDocument();
    // Le motif est facultatif à la saisie, exigé à la validation.
    expect(screen.getByLabelText(/Motif de l’écart/)).toBeInTheDocument();
    // Et surtout : aucun champ d'attendu.
    expect(screen.queryByLabelText(/Quantité attendue/i)).not.toBeInTheDocument();
    expect(screen.getByText(/La quantité attendue ne se saisit pas/)).toBeInTheDocument();
  }, 40000);

  it('poste l’article, la quantité comptée et le motif — jamais `expectedQuantity`', async () => {
    monter();
    await ouvrirBrouillon();

    await choisir(/Article compté/, /FER-12/);
    fireEvent.change(screen.getByLabelText('Quantité comptée'), { target: { value: '188' } });
    fireEvent.change(screen.getByLabelText(/Motif de l’écart/), { target: { value: '  Vol constaté  ' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le comptage' }));

    await waitFor(() => expect(put).toHaveBeenCalled(), { timeout: 8000 });
    const [adresse, corps] = put.mock.calls[put.mock.calls.length - 1] as [string, Record<string, unknown>];

    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/counts/${BROUILLON}/lines`);
    expect(Object.keys(corps).sort()).toEqual(['countedQuantity', 'itemId', 'reason']);
    expect(corps.itemId).toBe(FER);
    expect(corps.countedQuantity).toBe(188);
    expect(corps.reason).toBe('Vol constaté');
    // Le cœur de ce sous-lot : le serveur lit l'attendu et le fige. L'envoyer
    // vaudrait un 400 (`setStockCountLineSchema` est `.strict()`), et le
    // laisser entrer permettrait de fabriquer un écart nul.
    expect(corps).not.toHaveProperty('expectedQuantity');
    expect(corps).not.toHaveProperty('variance');
    expect(corps).not.toHaveProperty('varianceValue');
    // `countId` est dans le chemin, l'agence aussi.
    expect(corps).not.toHaveProperty('countId');
    expect(corps).not.toHaveProperty('tenantId');
  }, 40000);

  it('omet le motif quand il est vide, plutôt que d’envoyer une chaîne vide', async () => {
    monter();
    await ouvrirBrouillon();

    await choisir(/Article compté/, /CIM-42/);
    fireEvent.change(screen.getByLabelText('Quantité comptée'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/Motif de l’écart/), { target: { value: '   ' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le comptage' }));

    await waitFor(() => expect(put).toHaveBeenCalled(), { timeout: 8000 });
    const [, corps] = put.mock.calls[put.mock.calls.length - 1] as [string, Record<string, unknown>];

    // Un motif en blancs n'est pas un motif : l'absence efface, la chaîne vide
    // enregistrerait un motif que la validation laisserait passer.
    expect(Object.keys(corps).sort()).toEqual(['countedQuantity', 'itemId']);
    // Le ZÉRO est un résultat de comptage : « on a regardé, il n'y a rien ».
    expect(corps.countedQuantity).toBe(0);
  }, 40000);

  it('retire une ligne sans corps : les deux identifiants sont dans le chemin', async () => {
    monter();
    await ouvrirBrouillon();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Retirer' }, { timeout: 8000 }))[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer le retrait' }, { timeout: 8000 }));

    await waitFor(() => expect(del).toHaveBeenCalled(), { timeout: 8000 });
    expect(del).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/counts/${BROUILLON}/lines/${CIMENT}`);
    expect(del.mock.calls[0]).toHaveLength(1);
  }, 40000);
});

// ===========================================================================
// 5. L'écart vient du serveur, et les quantités ont quatre décimales
// ===========================================================================

describe('L’écart et les quantités', () => {
  it('affiche l’écart TEL QUE le serveur l’a calculé, sans refaire la soustraction', async () => {
    monter();
    await ouvrirBrouillon();

    // 188 − 200 ferait −12. Le serveur dit −7 : c'est lui qui fait autorité.
    expect(await screen.findByText(`${MOINS}7 barre`, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(`${MOINS}12 barre`)).not.toBeInTheDocument();
  }, 40000);

  it('rend un quart de mètre cube « 0,25 », jamais « 0 »', async () => {
    monter();
    await ouvrirBrouillon();

    expect(await screen.findByText(`${MOINS}0,25 m³`, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('12,25 m³')).toBeInTheDocument();
  }, 40000);

  it('nomme l’attendu pour ce qu’il est : ce que le système DISAIT, figé au comptage', async () => {
    monter();
    await ouvrirBrouillon();

    expect(await screen.findAllByText('Ce que le système disait', {}, { timeout: 8000 })).not.toHaveLength(0);
  }, 40000);
});

// ===========================================================================
// 6. Valider : besoin S6, irréversibilité, écrasement
// ===========================================================================

describe('La validation d’un inventaire', () => {
  it('est impossible tant qu’un écart n’a pas de motif, et les lignes fautives sont nommées', async () => {
    monter();
    await ouvrirBrouillon();

    expect(
      await screen.findByText(/1 ligne en écart reste sans motif : la validation est impossible/, {}, { timeout: 8000 })
    ).toBeInTheDocument();
    // La ligne fautive est nommée, pas seulement comptée.
    expect(screen.getAllByText(/SAB-00 — Sable lavé/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Valider l’inventaire' })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  }, 40000);

  it('poste un corps VIDE quand tous les écarts sont justifiés', async () => {
    configurerGet({ comptages: [brouillonJustifie()], detail: brouillonJustifie() });
    post.mockResolvedValue({ data: { data: { ...brouillonJustifie(), status: 'VALIDATED' } } });
    monter();
    await ouvrirBrouillon();

    fireEvent.click(await screen.findByRole('button', { name: 'Valider l’inventaire' }, { timeout: 8000 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer la validation' }, { timeout: 8000 }));

    await waitFor(() => expect(post).toHaveBeenCalled(), { timeout: 8000 });
    const [adresse, corps] = post.mock.calls[post.mock.calls.length - 1] as [string, Record<string, unknown>];

    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/counts/${BROUILLON}/validate`);
    expect(corps).toEqual({});
    // L'auteur vient du jeton, jamais du corps : un corps qui le porterait
    // permettrait de valider une perte au nom de quelqu'un d'autre.
    expect(corps).not.toHaveProperty('validatedByUserId');
    expect(corps).not.toHaveProperty('countId');
  }, 40000);

  it('dit, dans la confirmation, que c’est irréversible et que le comptage écrase ce qui a bougé', async () => {
    configurerGet({ comptages: [brouillonJustifie()], detail: brouillonJustifie() });
    monter();
    await ouvrirBrouillon();

    fireEvent.click(await screen.findByRole('button', { name: 'Valider l’inventaire' }, { timeout: 8000 }));

    expect(await screen.findByText(/Cette opération est irréversible/, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/l’ajustement écrasera ce mouvement/)).toBeInTheDocument();
    expect(screen.getByText(/se corrige par un second comptage/)).toBeInTheDocument();
  }, 40000);

  it('n’offre AUCUN bouton d’annulation sur un inventaire validé', async () => {
    configurerGet({ comptages: [valide()], detail: valide() });
    monter();
    await ongletInventaire();

    fireEvent.click(await screen.findByRole('button', { name: 'Consulter' }, { timeout: 8000 }));
    await screen.findByText(/Comptage de « Dépôt de la Villa de Nongo »/, {}, { timeout: 8000 });

    expect(screen.getByText(/Cet inventaire ne s’annule pas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Valider l’inventaire' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Annuler l’inventaire/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enregistrer le comptage/ })).not.toBeInTheDocument();
  }, 40000);
});

// ===========================================================================
// 7. Navigation et vocabulaire
// ===========================================================================

describe('Navigation et vocabulaire', () => {
  it('lit `tenantId` dans le CHEMIN, pas en paramètre de requête', async () => {
    monter();
    await ongletInventaire();

    await screen.findByText('Brouillon', {}, { timeout: 8000 });
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/counts`);
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/items?onlyActive=true`);
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/locations?onlyActive=true`);
    // Aucun appel ne passe l'agence en requête.
    for (const [url] of get.mock.calls as [string][]) {
      expect(url).not.toMatch(/[?&]tenantId=/);
    }
  }, 40000);

  it('n’affiche jamais « débit » ni « crédit », onglet du transfert', async () => {
    monter();

    await screen.findByText(/Un transfert n’impute rien/, {}, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  }, 40000);

  it('n’affiche jamais « débit » ni « crédit », comptage ouvert et validation annoncée', async () => {
    monter();
    await ouvrirBrouillon();

    await screen.findByText(/1 ligne en écart reste sans motif/, {}, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  }, 40000);
});
