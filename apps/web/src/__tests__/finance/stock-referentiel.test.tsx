import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockReferentiel from '../../pages/finance/StockReferentiel';
import type { StockItem, StockLocation, StockSettings } from '../../types/finance-stock-referentiel-types';

/**
 * Paramétrage du stock — lot 5, premier sous-lot (PRD E9, besoins S1, S4, S5 ;
 * contrat gelé `packages/api/src/lib/finance/types-lot5-referentiel.ts`).
 *
 * Comme aux sous-lots précédents, l'écran est monté par-dessus un `apiClient`
 * simulé — **jamais un service doublé** — pour que ce qui est vérifié ici soit
 * ce que l'écran envoie réellement sur le fil, et non ce qu'un mock de service
 * aurait laissé passer sans le voir. Les corps de création sont épinglés une
 * seconde fois, au plus près de la frontière réseau, dans
 * `__tests__/finance/corps-des-requetes.test.ts`.
 *
 * ---------------------------------------------------------------------------
 * Ce que ce fichier garantit avant tout
 * ---------------------------------------------------------------------------
 *
 * 1. **Le poste d'un article est présenté comme une PROPOSITION**, jamais comme
 *    une autorité : « poste proposé à la sortie », et la phrase qui dit qu'il
 *    restera modifiable au moment de sortir la marchandise.
 * 2. **Changer l'unité avertit AVANT d'envoyer**, et bloque tant que
 *    l'avertissement n'est pas acquitté. Le domaine, lui, laisse faire.
 * 3. **Le sélecteur de chantier n'existe que pour un lieu de chantier**, et
 *    `siteId` ne part jamais dans le corps d'un magasin.
 * 4. **Ni la nature ni le chantier d'un lieu ne se corrigent**, et la référence
 *    d'un article non plus.
 * 5. **Aucun bouton de suppression** : aucune route ne supprime.
 * 6. **Le motif est exigé** pour arrêter la méthode de valorisation, et la
 *    décision en vigueur montre sa date et son motif.
 * 7. **Jamais « débit » ni « crédit » à l'écran** (principe P-1 du PRD).
 * 8. **Les corps de création sont exacts** : aucun identifiant du chemin
 *    répété, aucun champ que le schéma `.strict()` du serveur refuserait.
 * 9. **Les refus du serveur sont relayés tels quels.**
 *
 * `useBreakpoint` est figé en desktop par défaut, pour un `<ConfirmAction>`
 * déterministe (`Popconfirm`), comme dans `__tests__/finance/tacherons.test.tsx`.
 * Deux cas le basculent en mobile — la désactivation depuis une carte, qui
 * n'existe que là.
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

/**
 * La largeur est un état du test, pas une constante : sous 992 px,
 * `<DataView>` rend des cartes et non un tableau, et la colonne « Actions »
 * disparaît avec lui. C'est le seul moyen de vérifier qu'une désactivation
 * reste atteignable là-bas — et rien ne la remplace, puisque aucune route ne
 * supprime.
 */
const ecran = vi.hoisted(() => ({ mobile: false }));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: {},
    active: ecran.mobile ? 'xs' : 'lg',
    isMobile: ecran.mobile,
    isTablet: false,
    isDesktop: !ecran.mobile
  })
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const put = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const patch = apiClient.patch as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'agence-1';
const CIMENT = 'article-ciment-01';
const MAGASIN = 'lieu-magasin-01';
const CHANTIER_NONGO = 'chantier-nongo';
const CHANTIER_KIPE = 'chantier-kipe';
const POSTE_GROS_OEUVRE = '3f1b1c2a-0000-4000-8000-000000000001';

/** L'adresse et le corps du dernier appel, pour se lire d'un coup d'œil. */
function dernierAppel(mockFn: ReturnType<typeof vi.fn>): { adresse: string; corps: Record<string, unknown> } {
  const [adresse, corps] = mockFn.mock.calls[mockFn.mock.calls.length - 1] as [string, Record<string, unknown>];
  return { adresse, corps };
}

/**
 * Nettoie casse, accents et apostrophes, pour une vérification insensible aux
 * trois. L'apostrophe compte : les messages du serveur emploient la
 * typographique (`’`) et l'écran la droite (`'`), et une assertion qui
 * distinguerait les deux échouerait sur une différence que personne ne voit.
 */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toLowerCase();
}

// ---------------------------------------------------------------------------
// Jeux d'essai
// ---------------------------------------------------------------------------

/** Un article avec un poste PROPOSÉ — celui qui ne doit jamais se lire comme une autorité. */
function ciment(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: CIMENT,
    tenantId: TENANT,
    reference: 'CIM-42',
    label: 'Ciment CPJ 42,5',
    unit: 'sac',
    category: 'Gros œuvre',
    defaultCostCategoryId: POSTE_GROS_OEUVRE,
    defaultCostCategoryLabel: 'Gros œuvre',
    isActive: true,
    ...overrides
  };
}

/** Sans poste proposé, et sans famille : un cas NORMAL, pas une donnée manquante. */
function sable(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: 'article-sable-03',
    tenantId: TENANT,
    reference: 'SAB-00',
    label: 'Sable lavé',
    unit: 'm³',
    category: null,
    defaultCostCategoryId: null,
    defaultCostCategoryLabel: null,
    isActive: true,
    ...overrides
  };
}

function magasin(overrides: Partial<StockLocation> = {}): StockLocation {
  return {
    id: MAGASIN,
    tenantId: TENANT,
    kind: 'WAREHOUSE',
    label: 'Magasin central de Kipé',
    siteId: null,
    siteLabel: null,
    isActive: true,
    ...overrides
  };
}

function depotNongo(overrides: Partial<StockLocation> = {}): StockLocation {
  return {
    id: 'lieu-nongo-02',
    tenantId: TENANT,
    kind: 'SITE',
    label: 'Dépôt de la Villa de Nongo',
    siteId: CHANTIER_NONGO,
    siteLabel: 'Villa de Nongo',
    isActive: true,
    ...overrides
  };
}

/** Une décision arrêtée, datée et motivée — ce que le besoin S5 demande. */
function decisionArretee(overrides: Partial<StockSettings> = {}): StockSettings {
  return {
    tenantId: TENANT,
    valuationMethod: 'WEIGHTED_AVERAGE',
    decidedAt: '2026-03-12T10:30:00.000Z',
    decisionNote: 'Décision du comité de gestion du 12 mars 2026.',
    ...overrides
  };
}

/** Route les GET par motif d'URL, comme le ferait le vrai serveur. */
function configurerGet(
  options: {
    articles?: StockItem[];
    lieux?: StockLocation[];
    reglages?: StockSettings;
  } = {}
) {
  const articles = options.articles ?? [ciment(), sable()];
  const lieux = options.lieux ?? [magasin(), depotNongo()];
  const reglages = options.reglages ?? decisionArretee();

  get.mockImplementation(async (url: string) => {
    if (/\/finance\/stock\/settings(\?|$)/.test(url)) {
      return { data: { data: reglages } };
    }
    if (/\/finance\/stock\/items(\?|$)/.test(url)) {
      return { data: { data: articles } };
    }
    if (/\/finance\/stock\/items\/[^/?]+$/.test(url)) {
      return { data: { data: articles[0] } };
    }
    if (/\/finance\/stock\/locations(\?|$)/.test(url)) {
      return { data: { data: lieux } };
    }
    if (/\/finance\/cost-categories(\?|$)/.test(url)) {
      return {
        data: {
          data: [
            { id: POSTE_GROS_OEUVRE, label: 'Gros œuvre', position: 1, isActive: true },
            { id: '3f1b1c2a-0000-4000-8000-000000000002', label: 'Couverture', position: 2, isActive: true }
          ]
        }
      };
    }
    if (/\/finance\/sites(\?|$)/.test(url)) {
      return {
        data: {
          data: [
            { id: CHANTIER_NONGO, name: 'Villa de Nongo', status: 'IN_PROGRESS', currency: 'XOF' },
            { id: CHANTIER_KIPE, name: 'Résidence de Kipé', status: 'IN_PROGRESS', currency: 'XOF' }
          ]
        }
      };
    }
    return { data: { data: null } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ecran.mobile = false;
  configurerGet();
  post.mockResolvedValue({ data: { data: ciment() } });
  patch.mockResolvedValue({ data: { data: ciment() } });
  put.mockResolvedValue({ data: { data: decisionArretee() } });
});

function monter(url = `/tenant/${TENANT}/finance/stock/parametrage`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/stock/parametrage" element={<StockReferentiel />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

/** Ouvre l'onglet des lieux et attend qu'il soit rendu. */
async function ouvrirOngletLieux(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Lieux de stockage' }));
  await screen.findByText('Magasin central de Kipé', {}, { timeout: 8000 });
}

/** Ouvre l'onglet de la méthode et attend qu'il soit rendu. */
async function ouvrirOngletMethode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Méthode de valorisation' }));
  await screen.findByText('La décision en vigueur', {}, { timeout: 8000 });
}

// ---------------------------------------------------------------------------
// 1. Le poste d'un article est une PROPOSITION
// ---------------------------------------------------------------------------

describe('Le poste d’un article est une PROPOSITION, jamais une autorité', () => {
  it('la colonne se nomme « poste proposé à la sortie », jamais « poste de dépense »', async () => {
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });

    expect(screen.getAllByText('Poste proposé à la sortie').length).toBeGreaterThanOrEqual(1);
    // Le poste d'un ARTICLE ne s'écrit jamais « poste de dépense » tout court :
    // ce nom laisserait croire à un choix déjà fait, que personne ne
    // revérifierait à la sortie.
    expect(screen.queryByText('Poste de dépense')).not.toBeInTheDocument();
    // Le NOM du poste est montré, jamais son identifiant (colonnes « Famille »
    // et « Poste proposé à la sortie » portent toutes deux « Gros œuvre »).
    const ligne = screen.getByText('CIM-42').closest('tr') as HTMLElement;
    expect(within(ligne).getAllByText('Gros œuvre').length).toBeGreaterThanOrEqual(1);
  }, 15000);

  it('dit que le poste restera modifiable au moment de sortir la marchandise', async () => {
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });

    const texte = normaliser(document.body.textContent ?? '');
    expect(texte).toContain('proposition');
    expect(texte).toContain('restera modifiable');
    expect(texte).toContain('au moment de sortir la marchandise');
  }, 15000);

  it('un article sans poste proposé le dit comme un cas normal, pas comme un vide', async () => {
    monter();

    const ligne = (await screen.findByText('SAB-00', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    expect(within(ligne).getByText('Aucun poste proposé')).toBeInTheDocument();
    expect(within(ligne).getByText('Non renseignée')).toBeInTheDocument();
  }, 15000);

  it('le formulaire d’enregistrement nomme le champ « poste proposé » et répète qu’il n’a aucune autorité', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Nouvel article/ })[0]);

    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByLabelText('Poste proposé à la sortie (facultatif)')).toBeInTheDocument();
    const texte = normaliser(dialogue.textContent ?? '');
    expect(texte).toContain('pre-selectionne');
    expect(texte).toContain('restera modifiable');
    expect(texte).toContain('laisser vide est un cas normal');
  }, 20000);
});

// ---------------------------------------------------------------------------
// 2. Changer l'unité avertit AVANT d'envoyer
// ---------------------------------------------------------------------------

describe('Changer l’unité d’un article avertit AVANT d’envoyer', () => {
  it('affiche l’avertissement dès que l’unité change, et bloque tant qu’il n’est pas acquitté', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    const ligne = screen.getByText('CIM-42').closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Corriger' }));

    const dialogue = await screen.findByRole('dialog');
    const unite = within(dialogue).getByLabelText('Unité');
    await user.clear(unite);
    await user.type(unite, 'tonne');

    // L'avertissement que le domaine ne donnera jamais : il laisse faire.
    expect(await within(dialogue).findByText(/ne reconvertit aucune quantité déjà enregistrée/i)).toBeInTheDocument();
    const texte = normaliser(dialogue.textContent ?? '');
    expect(texte).toContain('les mouvements passes garderont leur nombre');

    // Bloqué tant que l'avertissement n'est pas acquitté.
    const valider = screen.getByRole('button', { name: 'Enregistrer la correction' });
    expect(valider).toBeDisabled();
    expect(patch).not.toHaveBeenCalled();
  }, 30000);

  it('envoie la seule unité une fois l’avertissement acquitté, sans répéter l’identifiant du chemin', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    const ligne = screen.getByText('CIM-42').closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Corriger' }));

    const dialogue = await screen.findByRole('dialog');
    const unite = within(dialogue).getByLabelText('Unité');
    await user.clear(unite);
    await user.type(unite, 'tonne');

    await user.click(
      await within(dialogue).findByRole('checkbox', {
        name: /les quantités déjà enregistrées ne seront pas reconverties/i
      })
    );

    const valider = screen.getByRole('button', { name: 'Enregistrer la correction' });
    await waitFor(() => expect(valider).not.toBeDisabled());
    await user.click(valider);

    await waitFor(() => expect(patch).toHaveBeenCalled());
    const { adresse, corps } = dernierAppel(patch);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/items/${CIMENT}`);
    // Seul ce qui a changé voyage : le serveur refuse un corps vide, et
    // `reference` n'est pas corrigeable.
    expect(corps).toEqual({ unit: 'tonne' });
    expect(corps).not.toHaveProperty('reference');
    expect(corps).not.toHaveProperty('itemId');
    expect(corps).not.toHaveProperty('tenantId');
  }, 30000);

  it('un champ momentanément vide n’est pas un changement d’unité', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    const ligne = screen.getByText('CIM-42').closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Corriger' }));

    const dialogue = await screen.findByRole('dialog');
    await user.clear(within(dialogue).getByLabelText('Unité'));

    // Vider le champ pour le retaper n'est pas un changement d'unité :
    // l'avertissement « de « sac » en «  » » ne voudrait rien dire, et userait
    // le seul avertissement sérieux de cet écran.
    expect(within(dialogue).queryByText(/ne reconvertit aucune quantité/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer la correction' })).toBeDisabled();
  }, 30000);

  it('aucun avertissement, et aucune case à cocher, quand l’unité ne bouge pas', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    const ligne = screen.getByText('CIM-42').closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Corriger' }));

    const dialogue = await screen.findByRole('dialog');
    const designation = within(dialogue).getByLabelText('Désignation');
    await user.clear(designation);
    await user.type(designation, 'Ciment CPJ 32,5');

    expect(within(dialogue).queryByText(/ne reconvertit aucune quantité/i)).not.toBeInTheDocument();
    expect(within(dialogue).queryByRole('checkbox')).not.toBeInTheDocument();

    const valider = screen.getByRole('button', { name: 'Enregistrer la correction' });
    await waitFor(() => expect(valider).not.toBeDisabled());
    await user.click(valider);

    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(dernierAppel(patch).corps).toEqual({ label: 'Ciment CPJ 32,5' });
  }, 30000);
});

// ---------------------------------------------------------------------------
// 3. Le chantier n'existe que pour un lieu de chantier
// ---------------------------------------------------------------------------

describe('Le sélecteur de chantier n’existe que pour un lieu de chantier', () => {
  it('un magasin ne montre aucun chantier, et son corps n’en porte aucun', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockResolvedValue({ data: { data: magasin({ label: 'Magasin de Matoto' }) } });
    monter();

    await ouvrirOngletLieux(user);
    await user.click(screen.getAllByRole('button', { name: /Nouveau lieu de stockage/ })[0]);

    const dialogue = await screen.findByRole('dialog');
    // Aucun sélecteur de chantier : le serveur refuse `siteId` pour un
    // magasin, plutôt que de l'ignorer.
    expect(within(dialogue).queryByLabelText('Chantier')).not.toBeInTheDocument();

    await user.type(within(dialogue).getByLabelText('Libellé'), 'Magasin de Matoto');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le lieu' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const { adresse, corps } = dernierAppel(post);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/locations`);
    expect(corps).toEqual({ kind: 'WAREHOUSE', label: 'Magasin de Matoto' });
    expect(corps).not.toHaveProperty('siteId');
    expect(corps).not.toHaveProperty('tenantId');
  }, 30000);

  it('un lieu de chantier exige son chantier, et l’envoie dans le corps', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockResolvedValue({ data: { data: depotNongo({ label: 'Dépôt de Kipé', siteId: CHANTIER_KIPE }) } });
    monter();

    await ouvrirOngletLieux(user);
    await user.click(screen.getAllByRole('button', { name: /Nouveau lieu de stockage/ })[0]);

    const dialogue = await screen.findByRole('dialog');
    await user.click(within(dialogue).getByRole('radio', { name: 'Lieu de chantier' }));

    const chantier = await within(dialogue).findByLabelText('Chantier');
    expect(chantier).toBeInTheDocument();

    await user.type(within(dialogue).getByLabelText('Libellé'), 'Dépôt de Kipé');
    fireEvent.mouseDown(chantier);
    fireEvent.click(await screen.findByText('Résidence de Kipé', { selector: '.ant-select-item-option-content' }));

    const valider = screen.getByRole('button', { name: 'Enregistrer le lieu' });
    await waitFor(() => expect(valider).not.toBeDisabled());
    await user.click(valider);

    await waitFor(() => expect(post).toHaveBeenCalled());
    const { adresse, corps } = dernierAppel(post);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/locations`);
    expect(corps).toEqual({ kind: 'SITE', label: 'Dépôt de Kipé', siteId: CHANTIER_KIPE });
  }, 30000);

  it('avertit qu’un chantier n’a qu’un seul lieu quand celui choisi en a déjà un', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await ouvrirOngletLieux(user);
    await user.click(screen.getAllByRole('button', { name: /Nouveau lieu de stockage/ })[0]);

    const dialogue = await screen.findByRole('dialog');
    await user.click(within(dialogue).getByRole('radio', { name: 'Lieu de chantier' }));
    await user.type(within(dialogue).getByLabelText('Libellé'), 'Second dépôt de Nongo');

    fireEvent.mouseDown(await within(dialogue).findByLabelText('Chantier'));
    fireEvent.click(await screen.findByText('Villa de Nongo', { selector: '.ant-select-item-option-content' }));

    // Averti sans être bloqué : la liste affichée peut être filtrée, et le
    // serveur reste la seule autorité.
    await waitFor(() => expect(normaliser(dialogue.textContent ?? '')).toContain("dispose deja d'un lieu de stockage"));
    expect(screen.getByRole('button', { name: 'Enregistrer le lieu' })).not.toBeDisabled();
  }, 30000);

  it('repasser en magasin oublie le chantier : il ne part jamais dans le corps d’un magasin', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockResolvedValue({ data: { data: magasin({ label: 'Magasin de Matoto' }) } });
    monter();

    await ouvrirOngletLieux(user);
    await user.click(screen.getAllByRole('button', { name: /Nouveau lieu de stockage/ })[0]);

    const dialogue = await screen.findByRole('dialog');
    await user.click(within(dialogue).getByRole('radio', { name: 'Lieu de chantier' }));
    fireEvent.mouseDown(await within(dialogue).findByLabelText('Chantier'));
    fireEvent.click(await screen.findByText('Résidence de Kipé', { selector: '.ant-select-item-option-content' }));

    // Retour en magasin : le chantier disparaît de l'écran ET du corps.
    await user.click(within(dialogue).getByRole('radio', { name: 'Magasin' }));
    await waitFor(() => expect(within(dialogue).queryByLabelText('Chantier')).not.toBeInTheDocument());

    await user.type(within(dialogue).getByLabelText('Libellé'), 'Magasin de Matoto');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le lieu' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(dernierAppel(post).corps).toEqual({ kind: 'WAREHOUSE', label: 'Magasin de Matoto' });
  }, 30000);
});

// ---------------------------------------------------------------------------
// 4. Ce qui ne se corrige pas n'est pas proposé
// ---------------------------------------------------------------------------

describe('Ce qui ne se corrige pas n’est pas proposé', () => {
  it('la référence d’un article est montrée, jamais modifiable, et la raison est dite', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    const ligne = screen.getByText('CIM-42').closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Corriger' }));

    const dialogue = await screen.findByRole('dialog');
    // Aucun champ « Référence » : elle n'est pas corrigeable, et le serveur la
    // refuserait en 400 (`.strict()`).
    expect(within(dialogue).queryByLabelText('Référence')).not.toBeInTheDocument();
    expect(normaliser(dialogue.textContent ?? '')).toContain('elle ne se corrige pas');
    expect(within(dialogue).getAllByText(/CIM-42/).length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('n’envoie jamais un corps vide : rien à corriger, rien à enregistrer', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    const ligne = screen.getByText('CIM-42').closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Corriger' }));

    await screen.findByRole('dialog');
    // Le serveur refuse « Aucune correction fournie. » : l'écran ne propose
    // même pas d'envoyer tant que rien n'a bougé.
    expect(screen.getByRole('button', { name: 'Enregistrer la correction' })).toBeDisabled();
    expect(patch).not.toHaveBeenCalled();
  }, 30000);

  it('vider la famille l’EFFACE (`null`), et ne touche à rien d’autre', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    const ligne = screen.getByText('CIM-42').closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Corriger' }));

    const dialogue = await screen.findByRole('dialog');
    await user.clear(within(dialogue).getByLabelText('Famille (facultatif)'));

    const valider = screen.getByRole('button', { name: 'Enregistrer la correction' });
    await waitFor(() => expect(valider).not.toBeDisabled());
    await user.click(valider);

    await waitFor(() => expect(patch).toHaveBeenCalled());
    // `null` veut dire « efface », une clé absente veut dire « ne touche
    // pas » : la distinction du contrôleur serveur est tenue jusqu'ici.
    expect(dernierAppel(patch).corps).toEqual({ category: null });
  }, 30000);

  it('la correction d’un lieu ne propose ni nature ni chantier, et le dit', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await ouvrirOngletLieux(user);
    const ligne = screen.getByText('Dépôt de la Villa de Nongo').closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Corriger le libellé' }));

    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByLabelText('Libellé')).toBeInTheDocument();
    expect(within(dialogue).queryByLabelText('Chantier')).not.toBeInTheDocument();
    expect(within(dialogue).queryByRole('radio')).not.toBeInTheDocument();

    const texte = normaliser(dialogue.textContent ?? '');
    expect(texte).toContain('ni la nature ni le chantier');
  }, 30000);

  it('la correction d’un lieu n’envoie que le libellé', async () => {
    const user = userEvent.setup({ delay: null });
    patch.mockResolvedValue({ data: { data: magasin({ label: 'Magasin central de Kipé (bâtiment B)' }) } });
    monter();

    await ouvrirOngletLieux(user);
    const ligne = screen.getByText('Magasin central de Kipé').closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Corriger le libellé' }));

    const dialogue = await screen.findByRole('dialog');
    const libelle = within(dialogue).getByLabelText('Libellé');
    await user.clear(libelle);
    await user.type(libelle, 'Magasin central de Kipé (bâtiment B)');

    const valider = screen.getByRole('button', { name: 'Enregistrer le libellé' });
    await waitFor(() => expect(valider).not.toBeDisabled());
    await user.click(valider);

    await waitFor(() => expect(patch).toHaveBeenCalled());
    const { adresse, corps } = dernierAppel(patch);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/locations/${MAGASIN}`);
    expect(corps).toEqual({ label: 'Magasin central de Kipé (bâtiment B)' });
    expect(corps).not.toHaveProperty('kind');
    expect(corps).not.toHaveProperty('siteId');
    expect(corps).not.toHaveProperty('locationId');
  }, 30000);
});

// ---------------------------------------------------------------------------
// 5. Aucune suppression, nulle part
// ---------------------------------------------------------------------------

describe('Aucun bouton de suppression : désactiver n’est pas supprimer', () => {
  it('ni les articles ni les lieux n’offrent de supprimer', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    expect(screen.queryAllByRole('button', { name: /supprim/i })).toHaveLength(0);

    await ouvrirOngletLieux(user);
    expect(screen.queryAllByRole('button', { name: /supprim/i })).toHaveLength(0);

    // Et c'est écrit, plutôt que seulement absent.
    const texte = normaliser(document.body.textContent ?? '');
    expect(texte).toContain("desactiver n'est pas supprimer");
  }, 30000);

  it('désactiver un article passe par `isActive`, jamais par une suppression', async () => {
    const user = userEvent.setup({ delay: null });
    patch.mockResolvedValue({ data: { data: ciment({ isActive: false }) } });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    const ligne = screen.getByText('CIM-42').closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Désactiver' }));

    // L'avertissement dit ce que la désactivation garde — et il est distinct de
    // la même phrase déjà écrite sous la liste.
    expect(await screen.findByText(/Désactiver l['’]article « CIM-42 »/)).toBeInTheDocument();
    expect(screen.getAllByText(/garde son stock et son historique/i).length).toBeGreaterThanOrEqual(2);
    expect(patch).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirmer la désactivation' }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    const { adresse, corps } = dernierAppel(patch);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/items/${CIMENT}`);
    expect(corps).toEqual({ isActive: false });
    expect(apiClient.delete).not.toHaveBeenCalled();
  }, 30000);

  it('sous 992 px, la désactivation reste atteignable sur la carte — rien ne la remplace', async () => {
    ecran.mobile = true;
    const user = userEvent.setup({ delay: null });
    patch.mockResolvedValue({ data: { data: ciment({ isActive: false }) } });
    monter();

    const carte = await screen.findByRole('article', { name: 'CIM-42' }, { timeout: 8000 });
    // La colonne « Actions » du tableau n'existe pas ici : sans action
    // secondaire, un article ne pourrait plus être désactivé du tout.
    await user.click(within(carte).getByRole('button', { name: 'Autres actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Désactiver' }));

    expect((await screen.findAllByText(/Désactiver l['’]article « CIM-42 »/)).length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByRole('button', { name: 'Confirmer la désactivation' }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(dernierAppel(patch).corps).toEqual({ isActive: false });
    expect(screen.queryAllByRole('menuitem', { name: /supprim/i })).toHaveLength(0);
  }, 30000);

  it('sous 992 px, un lieu se désactive aussi depuis sa carte', async () => {
    ecran.mobile = true;
    const user = userEvent.setup({ delay: null });
    patch.mockResolvedValue({ data: { data: magasin({ isActive: false }) } });
    monter();

    await user.click(screen.getByRole('tab', { name: 'Lieux de stockage' }));
    const carte = await screen.findByRole('article', { name: 'Magasin central de Kipé' }, { timeout: 8000 });

    await user.click(within(carte).getByRole('button', { name: 'Autres actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Désactiver' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmer la désactivation' }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    const { adresse, corps } = dernierAppel(patch);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/locations/${MAGASIN}`);
    expect(corps).toEqual({ isActive: false });
  }, 30000);

  it('un article désactivé se réactive, et reste visible dans la liste', async () => {
    const user = userEvent.setup({ delay: null });
    configurerGet({ articles: [ciment({ isActive: false })] });
    patch.mockResolvedValue({ data: { data: ciment() } });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    const ligne = screen.getByText('CIM-42').closest('tr') as HTMLElement;
    expect(within(ligne).getByText('Inactif')).toBeInTheDocument();

    await user.click(within(ligne).getByRole('button', { name: 'Réactiver' }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(dernierAppel(patch).corps).toEqual({ isActive: true });
  }, 30000);
});

// ---------------------------------------------------------------------------
// 6. La méthode de valorisation : une décision, datée et motivée
// ---------------------------------------------------------------------------

describe('La méthode de valorisation enregistre une DÉCISION', () => {
  it('montre la décision en vigueur avec sa date et son motif', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    await ouvrirOngletMethode(user);

    expect(screen.getAllByText('Coût moyen pondéré').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/12\/03\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Décision du comité de gestion du 12 mars 2026/)).toBeInTheDocument();
  }, 30000);

  it('dit en clair qu’aucune décision n’a été arrêtée quand le motif est nul', async () => {
    const user = userEvent.setup({ delay: null });
    configurerGet({ reglages: decisionArretee({ decisionNote: null }) });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    await ouvrirOngletMethode(user);

    expect(screen.getByText(/Aucune décision n'a encore été arrêtée/i)).toBeInTheDocument();
    expect(normaliser(document.body.textContent ?? '')).toContain("s'applique par defaut");
  }, 30000);

  it('exige le motif avant d’enregistrer la décision, et le dit avant l’envoi', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    await ouvrirOngletMethode(user);

    expect(screen.getByText(/Le motif est obligatoire/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer la décision' })).toBeDisabled();
    expect(put).not.toHaveBeenCalled();
  }, 30000);

  it('envoie la méthode ET son motif ensemble, sans identifiant d’agence dans le corps', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    await ouvrirOngletMethode(user);

    await user.type(
      screen.getByLabelText('Motif de la décision'),
      '  Décision du comité de gestion du 2 avril 2026.  '
    );

    const valider = screen.getByRole('button', { name: 'Enregistrer la décision' });
    await waitFor(() => expect(valider).not.toBeDisabled());
    await user.click(valider);

    await waitFor(() => expect(put).toHaveBeenCalled());
    const { adresse, corps } = dernierAppel(put);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/settings`);
    expect(corps).toEqual({
      valuationMethod: 'WEIGHTED_AVERAGE',
      // Le motif est `trim()` : ce qui est enregistré est exactement ce qui
      // sera relu.
      decisionNote: 'Décision du comité de gestion du 2 avril 2026.'
    });
    expect(corps).not.toHaveProperty('tenantId');
    expect(corps).not.toHaveProperty('decidedAt');
  }, 30000);

  it('ne propose aucune autre méthode : le geste enregistre la décision, pas un choix', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    await ouvrirOngletMethode(user);

    // Aucune liste déroulante de méthode : une seule existe, et le laisser
    // croire serait mentir. Le panneau visible ne porte aucun sélecteur.
    const panneau = screen.getByRole('tabpanel');
    expect(within(panneau).queryAllByRole('combobox')).toHaveLength(0);
    expect(within(panneau).queryAllByRole('radio')).toHaveLength(0);
    expect(normaliser(document.body.textContent ?? '')).toContain("une seule methode existe aujourd'hui");
  }, 30000);
});

// ---------------------------------------------------------------------------
// 7. Les corps de création, épinglés
// ---------------------------------------------------------------------------

describe('Les corps de création n’emportent que ce que le schéma `.strict()` accepte', () => {
  it('enregistre un article avec les trois champs obligatoires, et rien d’autre', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Nouvel article/ })[0]);

    const dialogue = await screen.findByRole('dialog');
    await user.type(within(dialogue).getByLabelText('Référence'), 'FER-12');
    await user.type(within(dialogue).getByLabelText('Désignation'), 'Fer à béton HA 12');
    await user.type(within(dialogue).getByLabelText('Unité'), 'barre');

    await user.click(screen.getByRole('button', { name: "Enregistrer l'article" }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const { adresse, corps } = dernierAppel(post);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/items`);
    // Ni `category` ni `defaultCostCategoryId` en chaîne vide : le serveur les
    // refuserait en 400 (`.min(1)`, `.uuid()`).
    expect(corps).toEqual({ reference: 'FER-12', label: 'Fer à béton HA 12', unit: 'barre' });
    expect(corps).not.toHaveProperty('category');
    expect(corps).not.toHaveProperty('defaultCostCategoryId');
    expect(corps).not.toHaveProperty('tenantId');
    expect(corps).not.toHaveProperty('isActive');
  }, 30000);

  it('emporte la famille et le poste proposé quand ils sont renseignés', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Nouvel article/ })[0]);

    const dialogue = await screen.findByRole('dialog');
    await user.type(within(dialogue).getByLabelText('Référence'), 'FER-12');
    await user.type(within(dialogue).getByLabelText('Désignation'), 'Fer à béton HA 12');
    await user.type(within(dialogue).getByLabelText('Unité'), 'barre');
    await user.type(within(dialogue).getByLabelText('Famille (facultatif)'), 'Gros œuvre');

    fireEvent.mouseDown(within(dialogue).getByLabelText('Poste proposé à la sortie (facultatif)'));
    fireEvent.click(await screen.findByText('Gros œuvre', { selector: '.ant-select-item-option-content' }));

    await user.click(screen.getByRole('button', { name: "Enregistrer l'article" }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const { corps } = dernierAppel(post);
    expect(Object.keys(corps).sort()).toEqual(['category', 'defaultCostCategoryId', 'label', 'reference', 'unit']);
    expect(corps.defaultCostCategoryId).toBe(POSTE_GROS_OEUVRE);
  }, 30000);

  it('les filtres des deux listes partent en requête, jamais dans le chemin', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    // Sans filtre, aucun paramètre de requête.
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/items`);
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/locations`);

    await user.click(screen.getByRole('checkbox', { name: /Articles actifs uniquement/ }));
    await waitFor(() => expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/items?onlyActive=true`));

    await user.type(screen.getByLabelText('Rechercher un article'), 'ciment');
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/items?onlyActive=true&search=ciment`)
    );
  }, 30000);

  it('le filtre de nature des lieux part en requête, et se retire', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await ouvrirOngletLieux(user);
    fireEvent.mouseDown(screen.getByLabelText('Nature'));
    fireEvent.click(await screen.findByText('Lieu de chantier', { selector: '.ant-select-item-option-content' }));

    await waitFor(() => expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/locations?kind=SITE`));
  }, 30000);
});

// ---------------------------------------------------------------------------
// 8. Les refus du serveur, relayés tels quels
// ---------------------------------------------------------------------------

describe('Les refus du serveur sont relayés tels quels', () => {
  it('référence déjà prise : le message du serveur, pas un message inventé', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockRejectedValue({
      response: { data: { message: 'Un article porte déjà la référence « CIM-42 ».' } }
    });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Nouvel article/ })[0]);

    const dialogue = await screen.findByRole('dialog');
    await user.type(within(dialogue).getByLabelText('Référence'), 'CIM-42');
    await user.type(within(dialogue).getByLabelText('Désignation'), 'Ciment');
    await user.type(within(dialogue).getByLabelText('Unité'), 'sac');
    await user.click(screen.getByRole('button', { name: "Enregistrer l'article" }));

    expect(
      await screen.findByText('Un article porte déjà la référence « CIM-42 ».', {}, { timeout: 8000 })
    ).toBeInTheDocument();
  }, 30000);

  it('poste désactivé : le serveur reste la seule autorité', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockRejectedValue({ response: { data: { message: 'Ce poste est désactivé.' } } });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Nouvel article/ })[0]);

    const dialogue = await screen.findByRole('dialog');
    await user.type(within(dialogue).getByLabelText('Référence'), 'FER-12');
    await user.type(within(dialogue).getByLabelText('Désignation'), 'Fer à béton HA 12');
    await user.type(within(dialogue).getByLabelText('Unité'), 'barre');
    fireEvent.mouseDown(within(dialogue).getByLabelText('Poste proposé à la sortie (facultatif)'));
    fireEvent.click(await screen.findByText('Couverture', { selector: '.ant-select-item-option-content' }));
    await user.click(screen.getByRole('button', { name: "Enregistrer l'article" }));

    expect(await screen.findByText('Ce poste est désactivé.', {}, { timeout: 8000 })).toBeInTheDocument();
  }, 30000);

  it('second lieu pour le même chantier : le refus du serveur est affiché tel quel', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockRejectedValue({
      response: { data: { message: 'Ce chantier dispose déjà d’un lieu de stockage.' } }
    });
    monter();

    await ouvrirOngletLieux(user);
    await user.click(screen.getAllByRole('button', { name: /Nouveau lieu de stockage/ })[0]);

    const dialogue = await screen.findByRole('dialog');
    await user.click(within(dialogue).getByRole('radio', { name: 'Lieu de chantier' }));
    await user.type(within(dialogue).getByLabelText('Libellé'), 'Second dépôt de Nongo');
    fireEvent.mouseDown(await within(dialogue).findByLabelText('Chantier'));
    fireEvent.click(await screen.findByText('Villa de Nongo', { selector: '.ant-select-item-option-content' }));

    const valider = screen.getByRole('button', { name: 'Enregistrer le lieu' });
    await waitFor(() => expect(valider).not.toBeDisabled());
    await user.click(valider);

    expect(
      await screen.findByText('Ce chantier dispose déjà d’un lieu de stockage.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
  }, 30000);

  it('affiche un état d’erreur avec un moyen de réessayer quand les listes tombent', async () => {
    get.mockImplementation(async () => {
      throw new Error('panne');
    });
    monter();

    expect(await screen.findByText('Impossible de charger les articles.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Réessayer' }).length).toBeGreaterThanOrEqual(1);
  }, 15000);
});

// ---------------------------------------------------------------------------
// 9. Vocabulaire (P-1 du PRD)
// ---------------------------------------------------------------------------

describe('Vocabulaire (P-1 du PRD)', () => {
  it('aucun onglet n’affiche « débit » ni « crédit »', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    await ouvrirOngletLieux(user);
    await ouvrirOngletMethode(user);

    const texte = normaliser(document.body.textContent ?? '');
    expect(texte).not.toMatch(/\bdebit/);
    expect(texte).not.toMatch(/\bcredit/);
  }, 30000);

  it('les formulaires non plus, articles comme lieux', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Nouvel article/ })[0]);
    await screen.findByLabelText('Référence');

    let texte = normaliser(document.body.textContent ?? '');
    expect(texte).not.toMatch(/\bdebit/);
    expect(texte).not.toMatch(/\bcredit/);

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await ouvrirOngletLieux(user);
    await user.click(screen.getAllByRole('button', { name: /Nouveau lieu de stockage/ })[0]);
    await screen.findByLabelText('Libellé');

    texte = normaliser(document.body.textContent ?? '');
    expect(texte).not.toMatch(/\bdebit/);
    expect(texte).not.toMatch(/\bcredit/);
  }, 30000);

  it('n’affiche jamais les identifiants, seulement les noms', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    expect(screen.queryByText(CIMENT)).not.toBeInTheDocument();
    expect(screen.queryByText(POSTE_GROS_OEUVRE)).not.toBeInTheDocument();

    await ouvrirOngletLieux(user);
    expect(screen.queryByText(MAGASIN)).not.toBeInTheDocument();
    expect(screen.queryByText(CHANTIER_NONGO)).not.toBeInTheDocument();
    // Le nom du chantier, lui, est bien là.
    expect(screen.getAllByText('Villa de Nongo').length).toBeGreaterThanOrEqual(1);
  }, 30000);
});
