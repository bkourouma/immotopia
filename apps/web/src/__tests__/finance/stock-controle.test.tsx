import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StockControle } from '../../pages/finance/StockControle';
import type {
  StockAbilities,
  StockAlertView,
  StockControlsSettings,
  StockFieldContext,
  StockIndicatorRow,
  StockIndicatorsView
} from '../../types/finance-stock-controle-types';

/**
 * E5 — Contrôle du stock (lot 040, ecrans §8, §11.1, §11.3).
 *
 * Mock à la frontière réseau : `apiClient` est doublé, le vrai service et le
 * vrai écran tournent par-dessus. Ce qui est vérifié est donc ce que l'écran
 * envoie réellement sur le fil.
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
const patch = apiClient.patch as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'agence-1';
const CHANTIER = 'chantier-riviera';

function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toLowerCase();
}

const MOTS_INTERDITS = /\bvols?\b|\bvoleurs?\b|\bfraud|\bdetourn/;

// ---------------------------------------------------------------------------
// Jeux d'essai
// ---------------------------------------------------------------------------

function droits(over: Partial<StockAbilities> = {}): StockAbilities {
  return {
    canReceive: true,
    canIssue: true,
    canTransfer: true,
    canCount: true,
    canValidateCount: true,
    canDispose: true,
    canManageTakers: true,
    valuesVisible: true,
    canViewAlerts: true,
    canManageSettings: true,
    ...over
  };
}

function contexte(abilities: StockAbilities): StockFieldContext {
  return {
    locations: [
      {
        id: 'lieu-magasin-01',
        tenantId: TENANT,
        kind: 'WAREHOUSE',
        label: 'Magasin central',
        siteId: null,
        siteLabel: null,
        isActive: true,
        countInProgress: null,
        siteClosed: false,
        openingCountSuggested: false,
        toRecount: []
      }
    ],
    sites: [
      {
        id: CHANTIER,
        name: 'Villa de la Riviera',
        status: 'IN_PROGRESS',
        closed: false,
        stockEnabled: true,
        locationId: null
      }
    ],
    costCategories: [
      { id: 'poste-gros-oeuvre', label: 'Gros œuvre' },
      { id: 'poste-couverture', label: 'Couverture' }
    ],
    items: [],
    takers: [],
    receivableInvoices: [],
    reasonCodes: { count: [], scrap: [], supplierReturn: [], transfer: [] },
    settings: { requireTaker: false, backdatingLimitDays: 7 },
    abilities,
    people: []
  };
}

function alerte(over: Partial<StockAlertView> = {}): StockAlertView {
  return {
    id: 'alerte-01',
    kind: 'LARGE_ISSUE',
    severity: 'WARNING',
    status: 'OPEN',
    title: 'Sortie importante',
    message: 'Le bon de sortie BS-2026-00057 atteint 640 000 FCFA.',
    amount: 640000,
    threshold: 500000,
    currency: 'FCFA',
    site: { id: CHANTIER, name: 'Villa de la Riviera' },
    location: { id: 'lieu-magasin-01', label: 'Magasin central' },
    subjectType: 'StockSlip',
    subjectId: 'bon-57',
    subjectLabel: 'BS-2026-00057',
    mode: 'SINGLE',
    raisedAt: '2026-10-01T09:40:00.000Z',
    acknowledgedAt: null,
    acknowledgedByLabel: null,
    acknowledgeNote: null,
    ...over
  };
}

function ligne(month: string, over: Partial<StockIndicatorRow> = {}): StockIndicatorRow {
  return {
    month,
    countsValidated: 2,
    countsWithoutFrozenValues: 0,
    countedValue: 3_400_000,
    varianceValueGross: 142_000,
    setAsideVarianceValue: 0,
    varianceRate: 0.042,
    uncountedLines: 1,
    blindLineShare: 0.9,
    issuesCount: 18,
    issuesWithTaker: 15,
    takerShare: 0.5,
    countsValidatedByOther: 2,
    otherValidatorShare: 1,
    scrapValue: 36_000,
    scrapShare: 0.011,
    movementsCount: 64,
    averageEntryLagDays: 0.6,
    sameDayShare: 0.78,
    ...over
  };
}

function reglages(over: Partial<StockControlsSettings> = {}): StockControlsSettings {
  return {
    backdatingLimitDays: 7,
    requireTaker: false,
    issueAlertAmount: 500000,
    countVarianceAlertAmount: 100000,
    countVarianceAlertPercent: 5,
    cashMaterialAlertAmount: null,
    materialCostCategoryIds: [],
    effectiveMaterialCostCategoryIds: ['poste-gros-oeuvre'],
    updatedAt: '2026-09-20T10:00:00.000Z',
    updatedByLabel: 'Awa Traoré',
    ...over
  };
}

interface Monde {
  abilities: StockAbilities;
  alertes: StockAlertView[] | (() => never);
  indicateurs: StockIndicatorsView;
  reglages: StockControlsSettings;
}

let monde: Monde;

function poserMonde(over: Partial<Monde> = {}) {
  monde = {
    abilities: droits(),
    alertes: [alerte()],
    indicateurs: { from: '2026-05', to: '2026-10', rows: [], totals: [ligne('2026-09'), ligne('2026-10')] },
    reglages: reglages(),
    ...over
  };
  get.mockImplementation(async (url: string) => {
    if (/\/finance\/stock\/field-context(\?|$)/.test(url)) {
      return {
        data: {
          success: true,
          data: contexte(monde.abilities),
          meta: { valuesVisible: monde.abilities.valuesVisible, blindLocationIds: [] }
        }
      };
    }
    if (/\/finance\/stock\/alerts(\?|$)/.test(url)) {
      const liste = typeof monde.alertes === 'function' ? monde.alertes() : monde.alertes;
      return {
        data: {
          success: true,
          data: liste,
          meta: { valuesVisible: monde.abilities.valuesVisible, blindLocationIds: [], nextCursor: null }
        }
      };
    }
    if (/\/finance\/stock\/indicators(\?|$)/.test(url)) {
      return { data: { success: true, data: monde.indicateurs } };
    }
    if (/\/finance\/stock\/settings\/controls(\?|$)/.test(url)) {
      return { data: { success: true, data: monde.reglages } };
    }
    throw new Error(`GET inattendu : ${url}`);
  });
}

function appelsGet(motif: RegExp): string[] {
  return get.mock.calls.map(call => String(call[0])).filter(url => motif.test(url));
}

function monter(chemin = `/tenant/${TENANT}/finance/stock/controle`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[chemin]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/stock/controle" element={<StockControle />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function erreurHttp(status: number, code: string, message = 'Refusé') {
  return Object.assign(new Error(message), { response: { status, data: { success: false, code, message } } });
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  poserMonde();
});

// ---------------------------------------------------------------------------
// Alertes
// ---------------------------------------------------------------------------

describe('Contrôle — onglet Alertes', () => {
  it('liste les alertes « À traiter » par défaut, titre et message tels que le serveur les rend', async () => {
    monter();
    expect(await screen.findByText('Sortie importante', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Le bon de sortie BS-2026-00057 atteint 640 000 FCFA.')).toBeInTheDocument();
    const urls = appelsGet(/\/stock\/alerts/);
    expect(urls[0]).toContain('status=OPEN');
    expect(urls[0]).toContain('limit=50');
  }, 15000);

  it('« Marquer comme traitée » poste la note puis recharge la liste', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ data: { success: true, data: alerte({ status: 'ACKNOWLEDGED' }) } });
    monter();
    await screen.findByText('Sortie importante', {}, { timeout: 8000 });
    const avant = appelsGet(/\/stock\/alerts/).length;

    await user.click(screen.getByRole('button', { name: 'Marquer comme traitée' }));
    const fenetre = await screen.findByRole('dialog');
    expect(
      within(fenetre).getByText('Elle quittera la file « À traiter » et restera consultable.')
    ).toBeInTheDocument();
    await user.type(within(fenetre).getByLabelText('Note (facultative)'), 'Vu');
    await user.click(within(fenetre).getByRole('button', { name: 'Marquer comme traitée' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [adresse, corps] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/alerts/alerte-01/acknowledge`);
    expect(corps).toEqual({ note: 'Vu' });
    await waitFor(() => expect(appelsGet(/\/stock\/alerts/).length).toBeGreaterThan(avant));
  }, 40000);

  it('sans note : le corps est vide', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ data: { success: true, data: alerte({ status: 'ACKNOWLEDGED' }) } });
    monter();
    await screen.findByText('Sortie importante', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Marquer comme traitée' }));
    const fenetre = await screen.findByRole('dialog');
    await user.click(within(fenetre).getByRole('button', { name: 'Marquer comme traitée' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toEqual({});
  }, 40000);

  it('409 STOCK_ALERT_ALREADY_ACKNOWLEDGED : le message dédié, puis la liste rechargée', async () => {
    const user = userEvent.setup();
    post.mockRejectedValue(erreurHttp(409, 'STOCK_ALERT_ALREADY_ACKNOWLEDGED'));
    monter();
    await screen.findByText('Sortie importante', {}, { timeout: 8000 });
    const avant = appelsGet(/\/stock\/alerts/).length;
    await user.click(screen.getByRole('button', { name: 'Marquer comme traitée' }));
    const fenetre = await screen.findByRole('dialog');
    await user.click(within(fenetre).getByRole('button', { name: 'Marquer comme traitée' }));
    expect(await screen.findByText('Cette alerte a déjà été traitée.')).toBeInTheDocument();
    await waitFor(() => expect(appelsGet(/\/stock\/alerts/).length).toBeGreaterThan(avant));
  }, 40000);

  it('?alerte=<id> met la ligne en évidence', async () => {
    poserMonde({ alertes: [alerte(), alerte({ id: 'alerte-02', title: 'Rebut important', kind: 'LARGE_SCRAP' })] });
    monter(`/tenant/${TENANT}/finance/stock/controle?alerte=alerte-02`);
    await screen.findByText('Rebut important', {}, { timeout: 8000 });
    const marquee = document.querySelector('[aria-current="true"]');
    expect(marquee).not.toBeNull();
    expect(marquee?.textContent).toContain('Rebut important');
    expect(marquee?.textContent).not.toContain('Sortie importante');
  }, 15000);

  it('?alerte=<id> absente de la file « À traiter » : la liste passe à « Toutes »', async () => {
    monter(`/tenant/${TENANT}/finance/stock/controle?alerte=alerte-ancienne`);
    await screen.findByText('Sortie importante', {}, { timeout: 8000 });
    await waitFor(() => expect(appelsGet(/\/stock\/alerts/).some(url => !url.includes('status='))).toBe(true));
  }, 15000);

  it('rec040-05 : ?alerte=<id> introuvable partout (autre agence) — « Cette alerte est introuvable. », pas un problème de filtre', async () => {
    poserMonde({ alertes: [] });
    monter(`/tenant/${TENANT}/finance/stock/controle?alerte=alerte-autre-agence`);
    expect(await screen.findByText('Cette alerte est introuvable.', {}, { timeout: 8000 })).toBeInTheDocument();
    // La liste a bien été élargie à « Toutes » avant de conclure.
    expect(appelsGet(/\/stock\/alerts/).some(url => !url.includes('status='))).toBe(true);
    expect(screen.queryByText('Aucune alerte pour ces filtres.')).toBeNull();
    expect(screen.queryByText('Aucune alerte à traiter.')).toBeNull();
  }, 15000);

  it('rec040-05 : une alerte trouvée dans « Toutes » ne se dit pas introuvable', async () => {
    poserMonde({ alertes: [alerte({ id: 'alerte-traitee', status: 'ACKNOWLEDGED', title: 'Rebut ancien' })] });
    monter(`/tenant/${TENANT}/finance/stock/controle?alerte=alerte-traitee`);
    await screen.findByText('Rebut ancien', {}, { timeout: 8000 });
    expect(screen.queryByText('Cette alerte est introuvable.')).toBeNull();
  }, 15000);

  it('mène chaque objet à son écran : bon, inventaire, fiche du chantier pour une pièce de caisse', async () => {
    poserMonde({
      alertes: [
        alerte(),
        alerte({
          id: 'alerte-02',
          kind: 'COUNT_VARIANCE',
          title: 'Écart d’inventaire',
          subjectType: 'StockCount',
          subjectId: 'inventaire-01',
          subjectLabel: 'Inventaire du 28/09/2026'
        }),
        alerte({
          id: 'alerte-03',
          kind: 'CASH_MATERIAL_PURCHASE',
          title: 'Achat de matériaux en espèces',
          subjectType: 'CashVoucher',
          subjectId: 'piece-12',
          subjectLabel: 'Pièce de caisse PC-0012'
        })
      ]
    });
    monter();
    expect(await screen.findByRole('link', { name: 'BS-2026-00057' }, { timeout: 8000 })).toHaveAttribute(
      'href',
      `/tenant/${TENANT}/finance/stock?bon=bon-57`
    );
    expect(screen.getByRole('link', { name: 'Inventaire du 28/09/2026' })).toHaveAttribute(
      'href',
      `/tenant/${TENANT}/finance/stock/inventaire?inventaire=inventaire-01`
    );
    expect(screen.getByRole('link', { name: 'Pièce de caisse PC-0012' })).toHaveAttribute(
      'href',
      `/tenant/${TENANT}/finance/chantiers/${CHANTIER}`
    );
  }, 15000);

  it('affiche les natures de la révision 2 et la pastille « Cumul du mois »', async () => {
    poserMonde({
      alertes: [
        alerte({
          id: 'a1',
          kind: 'COUNT_LINE_SET_ASIDE',
          title: 'Lignes d’inventaire écartées',
          subjectType: 'StockCount'
        }),
        alerte({ id: 'a2', kind: 'COUNT_CANCELLED', title: 'Inventaire abandonné', subjectType: 'StockCount' }),
        alerte({ id: 'a3', kind: 'LARGE_SCRAP', title: 'Rebuts du mois', mode: 'MONTHLY_CUMUL' })
      ]
    });
    monter();
    expect(await screen.findByText('Lignes d’inventaire écartées', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Inventaire abandonné')).toBeInTheDocument();
    expect(screen.getByText('Cumul du mois')).toBeInTheDocument();
  }, 15000);

  it('403 sur les alertes : état « réservées aux responsables du stock »', async () => {
    poserMonde({
      alertes: () => {
        throw erreurHttp(403, 'FORBIDDEN');
      }
    });
    monter();
    expect(
      await screen.findByText('Les alertes du stock sont réservées aux responsables du stock.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
  }, 15000);

  it('file vide : « Aucune alerte à traiter. »', async () => {
    poserMonde({ alertes: [] });
    monter();
    expect(await screen.findByText('Aucune alerte à traiter.', {}, { timeout: 8000 })).toBeInTheDocument();
  }, 15000);
});

// ---------------------------------------------------------------------------
// Accès
// ---------------------------------------------------------------------------

describe('Contrôle — accès selon le rôle', () => {
  it('magasinier (ni alertes ni valeurs) : état réservé, sans appeler les alertes', async () => {
    poserMonde({ abilities: droits({ canViewAlerts: false, valuesVisible: false, canManageSettings: false }) });
    monter();
    expect(
      await screen.findByText('Cet écran est réservé aux responsables du stock.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aller à l’écran Magasin' })).toBeInTheDocument();
    expect(appelsGet(/\/stock\/alerts/)).toEqual([]);
    expect(appelsGet(/\/stock\/indicators/)).toEqual([]);
  }, 15000);

  it('sans valeurs : ni onglet Indicateurs ni onglet Réglages', async () => {
    poserMonde({ abilities: droits({ valuesVisible: false }) });
    monter();
    await screen.findByText('Sortie importante', {}, { timeout: 8000 });
    const onglets = screen.getAllByRole('tab').map(onglet => onglet.textContent);
    expect(onglets).toEqual(['Alertes']);
  }, 15000);

  it('sans alertes mais avec les valeurs : Indicateurs par défaut, aucun appel aux alertes', async () => {
    poserMonde({ abilities: droits({ canViewAlerts: false }) });
    monter();
    expect(await screen.findByText('Par mois', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(onglet => onglet.textContent)).toEqual([
      'Indicateurs',
      'Réglages de contrôle'
    ]);
    expect(appelsGet(/\/stock\/alerts/)).toEqual([]);
  }, 15000);
});

// ---------------------------------------------------------------------------
// Indicateurs
// ---------------------------------------------------------------------------

describe('Contrôle — onglet Indicateurs', () => {
  it('affiche le taux tel quel en pourcentage, « — » quand il est nul, et la note des valeurs non figées', async () => {
    poserMonde({
      indicateurs: {
        from: '2026-05',
        to: '2026-10',
        rows: [],
        totals: [
          ligne('2026-09', { varianceRate: 0.042, countsWithoutFrozenValues: 2 }),
          ligne('2026-10', { varianceRate: null, countsValidated: 0, countsValidatedByOther: 0 })
        ]
      }
    });
    monter(`/tenant/${TENANT}/finance/stock/controle?onglet=indicateurs`);
    expect(await screen.findByText('Aucun inventaire validé ce mois-ci.', {}, { timeout: 8000 })).toBeInTheDocument();
    // Le dernier mois n'a pas d'inventaire validé : la carte dit « — », jamais 0 %.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    // Septembre, dans le tableau par mois : 0,042 rendu « 4,2 % ».
    expect(screen.getAllByText(/4,2\s%/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 inventaire\(s\) validé\(s\) avant la mise en place/)).toBeInTheDocument();
    expect(
      screen.getByText('Ces indicateurs portent sur des lieux et des mois, jamais sur des personnes.')
    ).toBeInTheDocument();
    // Aucun nom de personne dans l'onglet.
    expect(document.body.textContent).not.toContain('Awa Traoré');
    const urls = appelsGet(/\/stock\/indicators/);
    expect(urls[0]).toMatch(/from=\d{4}-\d{2}&to=\d{4}-\d{2}/);
  }, 15000);

  it('rec040-04 : des inventaires validés sur une valeur comptée nulle — « non calculable », jamais « aucun inventaire »', async () => {
    poserMonde({
      indicateurs: {
        from: '2026-05',
        to: '2026-10',
        rows: [],
        totals: [
          ligne('2026-10', {
            countsValidated: 5,
            countsValidatedByOther: 1,
            countedValue: 0,
            varianceValueGross: 0,
            varianceRate: null
          })
        ]
      }
    });
    monter(`/tenant/${TENANT}/finance/stock/controle?onglet=indicateurs`);
    expect(
      await screen.findByText('Taux non calculable : valeur comptée nulle.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.queryByText('Aucun inventaire validé ce mois-ci.')).toBeNull();
  }, 15000);

  it('rec040-04 : des inventaires tous validés avant le suivi des valeurs — taux non calculable, et dit pourquoi', async () => {
    poserMonde({
      indicateurs: {
        from: '2026-05',
        to: '2026-10',
        rows: [],
        totals: [
          ligne('2026-10', { countsValidated: 3, countsWithoutFrozenValues: 3, countedValue: 0, varianceRate: null })
        ]
      }
    });
    monter(`/tenant/${TENANT}/finance/stock/controle?onglet=indicateurs`);
    expect(
      await screen.findByText(
        'Taux non calculable : inventaires validés avant le suivi des valeurs.',
        {},
        { timeout: 8000 }
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('Aucun inventaire validé ce mois-ci.')).toBeNull();
  }, 15000);

  it('ferme « Afficher » au-delà de 24 mois', async () => {
    const user = userEvent.setup();
    monter(`/tenant/${TENANT}/finance/stock/controle?onglet=indicateurs`);
    await screen.findByText('Par mois', {}, { timeout: 8000 });
    expect(screen.getByRole('button', { name: 'Afficher' })).toBeEnabled();

    const champs = document.querySelectorAll<HTMLInputElement>('.ant-picker-range input');
    expect(champs.length).toBe(2);
    await user.click(champs[0]);
    await user.clear(champs[0]);
    await user.type(champs[0], '2023-01{Enter}');
    await user.click(champs[1]);
    await user.clear(champs[1]);
    await user.type(champs[1], '2026-10{Enter}');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Afficher' })).toBeDisabled());
    expect(screen.getByText('24 mois au plus.')).toBeInTheDocument();
  }, 40000);
});

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

describe('Contrôle — onglet Réglages de contrôle', () => {
  it('n’envoie que les champs modifiés ; « Désactiver » envoie null', async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue({
      data: { success: true, data: reglages({ backdatingLimitDays: 3, issueAlertAmount: null }) }
    });
    monter(`/tenant/${TENANT}/finance/stock/controle?onglet=reglages`);
    const borne = await screen.findByLabelText('Antériorité maximale d’une date de mouvement', {}, { timeout: 8000 });
    await user.clear(borne);
    await user.type(borne, '3');

    const desactiver = screen.getAllByRole('checkbox', { name: 'Désactiver cette alerte' });
    // Ordre : sortie importante, écart en montant, écart en taux, espèces.
    await user.click(desactiver[0]);

    await user.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const [adresse, corps] = patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/settings/controls`);
    expect(corps).toEqual({ backdatingLimitDays: 3, issueAlertAmount: null });
    expect(await screen.findByText('Réglages enregistrés.')).toBeInTheDocument();
  }, 40000);

  it('403 à l’enregistrement : le formulaire passe en lecture seule', async () => {
    const user = userEvent.setup();
    patch.mockRejectedValue(erreurHttp(403, 'FORBIDDEN'));
    monter(`/tenant/${TENANT}/finance/stock/controle?onglet=reglages`);
    const borne = await screen.findByLabelText('Antériorité maximale d’une date de mouvement', {}, { timeout: 8000 });
    await user.clear(borne);
    await user.type(borne, '4');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));

    await waitFor(() =>
      expect(
        screen.getAllByText('Seule une personne qui peut paramétrer la finance de l’agence peut modifier ces réglages.')
          .length
      ).toBeGreaterThan(0)
    );
    expect(screen.getByLabelText('Antériorité maximale d’une date de mouvement')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer les réglages' })).not.toBeInTheDocument();
  }, 40000);

  it('sans canManageSettings : lecture seule d’emblée, aucun bouton d’enregistrement', async () => {
    poserMonde({ abilities: droits({ canManageSettings: false }) });
    monter(`/tenant/${TENANT}/finance/stock/controle?onglet=reglages`);
    const borne = await screen.findByLabelText('Antériorité maximale d’une date de mouvement', {}, { timeout: 8000 });
    expect(borne).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer les réglages' })).not.toBeInTheDocument();
    expect(screen.getByText(/Modifié le .* par Awa Traoré\./)).toBeInTheDocument();
  }, 15000);

  const SEUIL_POSITIF = "Un seuil d'alerte doit être supérieur à zéro. Laissez-le vide pour désactiver l'alerte.";

  it('un seuil à zéro est refusé dans le formulaire : message sous le champ, rien n’est envoyé', async () => {
    const user = userEvent.setup();
    monter(`/tenant/${TENANT}/finance/stock/controle?onglet=reglages`);
    const sortie = await screen.findByLabelText('Sortie importante', {}, { timeout: 8000 });
    expect(
      screen.getByText(
        'Un seuil saisi doit être supérieur à zéro. Un seuil laissé vide désactive son alerte, comme la case « Désactiver cette alerte ».'
      )
    ).toBeInTheDocument();

    await user.clear(sortie);
    await user.type(sortie, '0');

    expect(await screen.findByText(SEUIL_POSITIF)).toBeInTheDocument();
    expect(sortie).toHaveAttribute('aria-invalid', 'true');
    const enregistrer = screen.getByRole('button', { name: 'Enregistrer les réglages' });
    expect(enregistrer).toBeDisabled();
    await user.click(enregistrer);
    expect(patch).not.toHaveBeenCalled();

    // Le pourcentage obéit à la même règle.
    const taux = screen.getByLabelText('Écart d’inventaire — taux');
    await user.clear(taux);
    await user.type(taux, '0');
    await waitFor(() => expect(screen.getAllByText(SEUIL_POSITIF)).toHaveLength(2));
    expect(taux).toHaveAttribute('aria-invalid', 'true');
  }, 40000);

  it('un seuil laissé vide désactive son alerte : null est envoyé', async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue({
      data: { success: true, data: reglages({ countVarianceAlertPercent: null }) }
    });
    monter(`/tenant/${TENANT}/finance/stock/controle?onglet=reglages`);
    const taux = await screen.findByLabelText('Écart d’inventaire — taux', {}, { timeout: 8000 });
    await user.clear(taux);

    expect(screen.queryByText(SEUIL_POSITIF)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const [, corps] = patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(corps).toEqual({ countVarianceAlertPercent: null });
  }, 40000);

  it('refus 400 du serveur : sa raison s’affiche sous le seuil visé, pas « données invalides »', async () => {
    const user = userEvent.setup();
    patch.mockRejectedValue(
      Object.assign(new Error('Refusé'), {
        response: {
          status: 400,
          data: {
            success: false,
            code: 'VALIDATION_ERROR',
            message: 'Les données fournies sont invalides.',
            errors: [{ field: 'issueAlertAmount', message: SEUIL_POSITIF }]
          }
        }
      })
    );
    monter(`/tenant/${TENANT}/finance/stock/controle?onglet=reglages`);
    const borne = await screen.findByLabelText('Antériorité maximale d’une date de mouvement', {}, { timeout: 8000 });
    await user.clear(borne);
    await user.type(borne, '3');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    // Sous le champ, et dans le message d'erreur.
    await waitFor(() => expect(screen.getAllByText(SEUIL_POSITIF).length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText('Les données fournies sont invalides.')).not.toBeInTheDocument();
    const sortie = screen.getByLabelText('Sortie importante');
    expect(sortie).toHaveAttribute('aria-invalid', 'true');
    // Le formulaire reste modifiable : ce n'est pas un refus de droit.
    expect(borne).not.toBeDisabled();
    // Le nom porte encore « loading » le temps que l'icône de chargement s'efface.
    expect(screen.getByRole('button', { name: /Enregistrer les réglages/ })).toBeInTheDocument();

    // Retoucher le seuil efface le refus du serveur.
    await user.clear(sortie);
    await user.type(sortie, '250000');
    await waitFor(() => expect(sortie).not.toHaveAttribute('aria-invalid'));
  }, 40000);

  it('postes « matériaux » vides : les postes retenus faute de choix sont nommés', async () => {
    monter(`/tenant/${TENANT}/finance/stock/controle?onglet=reglages`);
    expect(
      await screen.findByText(
        'Postes retenus faute de choix : Gros œuvre (postes proposés par vos articles).',
        {},
        { timeout: 8000 }
      )
    ).toBeInTheDocument();
  }, 15000);
});

// ---------------------------------------------------------------------------
// Vocabulaire (D2)
// ---------------------------------------------------------------------------

describe('Contrôle — vocabulaire', () => {
  it('aucun mot interdit dans les trois onglets', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('Sortie importante', {}, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(MOTS_INTERDITS);

    await user.click(screen.getByRole('tab', { name: 'Indicateurs' }));
    await screen.findByText('Par mois', {}, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(MOTS_INTERDITS);

    await user.click(screen.getByRole('tab', { name: 'Réglages de contrôle' }));
    await screen.findByLabelText('Antériorité maximale d’une date de mouvement', {}, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(MOTS_INTERDITS);
  }, 25000);
});
