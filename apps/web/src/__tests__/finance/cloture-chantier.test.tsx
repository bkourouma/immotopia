import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClotureChantier } from '../../pages/finance/ClotureChantier';
import type {
  SiteClosure,
  SiteClosureBlocker,
  SiteCostBreakdown,
  SiteLot
} from '../../types/finance-site-closing-types';

/**
 * Lots, coût de revient et clôture d'un chantier — lot 4, sixième et dernier
 * sous-lot (PRD E6, besoins P16 et P17 ; contrat gelé
 * `packages/api/src/lib/finance/types-lot4-closing.ts`).
 *
 * Comme `associations.test.tsx`, ce fichier monte l'écran par-dessus un
 * `apiClient` simulé — **jamais le service doublé**. Les garanties d'adresse et
 * de corps valent donc pour ce que l'écran envoie réellement, geste par geste,
 * et non pour ce qu'un mock du service aurait laissé passer sans le voir.
 *
 * Les quatre garanties qui comptent plus que les autres :
 *
 * 1. **Estimation contre définitif.** Un chantier ouvert et un chantier clos
 *    affichent deux mentions DIFFÉRENTES sur la nature du coût de revient.
 *    Quelqu'un qui fixe un prix de vente sur une estimation en la croyant
 *    définitive perd de l'argent.
 * 2. **Les bloqueurs se lisent avant d'essayer**, avec leur nombre, et le
 *    geste de clôture est désactivé tant qu'il en reste.
 * 3. **La réouverture refusée est EXPLIQUÉE**, pas seulement grisée.
 * 4. **Aucun montant, aucun pourcentage n'est calculé ici** : les fixtures
 *    portent volontairement des valeurs qu'aucune formule ne produirait, et
 *    l'écran les affiche telles quelles.
 *
 * `useBreakpoint` est figé en desktop pour un `<ConfirmAction>` déterministe
 * (`Popconfirm`), comme dans `associations.test.tsx`.
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
const patch = apiClient.patch as unknown as ReturnType<typeof vi.fn>;
const del = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'agence-1';
const SITE = 'chantier-1';

function lot(partiel: Partial<SiteLot> & Pick<SiteLot, 'id' | 'name'>): SiteLot {
  return {
    siteId: SITE,
    surfaceArea: null,
    manualSharePercent: null,
    sharePercent: 0,
    costPrice: 0,
    currency: 'XOF',
    propertyId: null,
    propertyLabel: null,
    ...partiel
  };
}

/**
 * Chantier OUVERT par défaut.
 *
 * Les chiffres sont volontairement INCOHÉRENTS avec toute formule : 40 % de
 * 100 000 000 ne fait pas 51 000 000. Un écran qui recalculerait au lieu
 * d'afficher ce que le serveur envoie tomberait ici.
 */
function repartition(overrides: Partial<SiteCostBreakdown> = {}): SiteCostBreakdown {
  return {
    siteId: SITE,
    siteLabel: 'Résidence de la Riviera',
    isClosed: false,
    totalCost: 100_000_000,
    allocationMethod: 'SURFACE',
    lots: [
      lot({ id: 'lot-1', name: 'Villa A1', surfaceArea: 240, sharePercent: 40, costPrice: 51_000_000 }),
      lot({ id: 'lot-2', name: 'Villa A2', surfaceArea: 210, sharePercent: 35, costPrice: 29_000_000 }),
      lot({ id: 'lot-3', name: 'Villa A3', surfaceArea: 150, sharePercent: 25, costPrice: 20_000_000 })
    ],
    unallocatedCost: 0,
    currency: 'XOF',
    ...overrides
  };
}

function repartitionClose(overrides: Partial<SiteCostBreakdown> = {}): SiteCostBreakdown {
  return repartition({ isClosed: true, ...overrides });
}

function cloture(overrides: Partial<SiteClosure> = {}): SiteClosure {
  return {
    siteId: SITE,
    siteLabel: 'Résidence de la Riviera',
    closedAt: '2026-09-19T10:00:00.000Z',
    closedByLabel: 'Aminata Yao',
    finalCost: 100_000_000,
    currency: 'XOF',
    lots: repartition().lots,
    ...overrides
  };
}

/** Nettoie casse et accents, pour une vérification insensible aux deux. */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function configurerGet(options: { repartition?: SiteCostBreakdown; bloqueurs?: SiteClosureBlocker[] } = {}) {
  const uneRepartition = options.repartition ?? repartition();
  const desBloqueurs = options.bloqueurs ?? [];

  get.mockImplementation(async (url: string) => {
    if (/\/cost-breakdown$/.test(url)) {
      return { data: { data: uneRepartition } };
    }
    if (/\/closure-blockers$/.test(url)) {
      return { data: { data: desBloqueurs } };
    }
    if (/\/lots$/.test(url)) {
      return { data: { data: uneRepartition.lots } };
    }
    return { data: { data: null } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  configurerGet();
  post.mockResolvedValue({ data: { data: cloture() } });
  put.mockResolvedValue({ data: { data: repartition().lots } });
  patch.mockResolvedValue({ data: { data: repartition().lots[0] } });
  del.mockResolvedValue({ data: { data: { id: 'lot-1' } } });
});

function monter(url = `/tenant/${TENANT}/finance/chantiers/${SITE}/cloture`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/chantiers/:siteId/cloture" element={<ClotureChantier />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------

describe('Estimation ou définitif — la mention qui évite de vendre au mauvais prix', () => {
  it('sur un chantier OUVERT, dit que les coûts de revient sont une estimation qui bougera', async () => {
    monter();

    expect(
      await screen.findByText(/les coûts de revient ci-dessous sont une estimation/i, {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByText(/ne fixez aucun prix de vente/i)).toBeInTheDocument();
    // La mention du chantier clos ne doit surtout pas apparaître en même temps.
    expect(screen.queryByText(/sont définitifs/i)).not.toBeInTheDocument();
  });

  it('sur un chantier CLOS, dit que les coûts de revient sont définitifs et ne bougeront plus', async () => {
    configurerGet({ repartition: repartitionClose() });
    monter();

    expect(await screen.findByText(/sont définitifs/i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/ces montants ne bougeront plus/i)).toBeInTheDocument();
    expect(screen.queryByText(/sont une estimation/i)).not.toBeInTheDocument();
  });

  it('nomme la source du coût qui sert de base : courant si ouvert, figé si clos', async () => {
    monter();
    expect(await screen.findByText(/coût réel à l'instant de la lecture/i, {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('coût figé quand le chantier est clos', async () => {
    configurerGet({ repartition: repartitionClose() });
    monter();
    expect(await screen.findByText(/coût figé à la clôture/i, {}, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('Aucun montant ni pourcentage calculé côté écran', () => {
  it('affiche les parts et les coûts de revient tels que le serveur les envoie', async () => {
    monter();

    await screen.findByText('Villa A1', {}, { timeout: 8000 });
    // 51 000 000 n'est pas 40 % de 100 000 000 : ces valeurs ne peuvent venir
    // que du serveur.
    expect(screen.getByText(/51\s000\s000/)).toBeInTheDocument();
    expect(screen.getByText(/29\s000\s000/)).toBeInTheDocument();
    expect(screen.getByText('40 %')).toBeInTheDocument();
    expect(screen.getByText('35 %')).toBeInTheDocument();
  });

  it('montre ce qui n’est réparti sur aucun lot, et le dit quand un chantier coûte sans produire de lot', async () => {
    configurerGet({
      repartition: repartition({ lots: [], unallocatedCost: 100_000_000, allocationMethod: null })
    });
    monter();

    expect(await screen.findByText('Non réparti', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/aucun lot ne porte ce coût/i)).toBeInTheDocument();
    expect(screen.getByText('Ce chantier ne produit encore aucun lot.')).toBeInTheDocument();
  });

  it("dit ce qu'implique l'absence de clé de répartition, plutôt que d'afficher des parts à zéro sans explication", async () => {
    configurerGet({ repartition: repartition({ allocationMethod: null }) });
    monter();

    expect(await screen.findByText('Aucune clé posée', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/la part de chaque lot vaut zéro/i)).toBeInTheDocument();
  });

  it('ne montre jamais les identifiants, seulement les libellés', async () => {
    configurerGet({
      repartition: repartitionClose({
        lots: [
          lot({
            id: 'lot-1',
            name: 'Villa A1',
            sharePercent: 100,
            costPrice: 100_000_000,
            propertyId: 'bien-42',
            propertyLabel: 'VIL-2026-014'
          })
        ]
      })
    });
    monter();

    await screen.findByText('Villa A1', {}, { timeout: 8000 });
    expect(screen.getByText('VIL-2026-014')).toBeInTheDocument();
    expect(screen.queryByText('bien-42')).not.toBeInTheDocument();
    expect(screen.queryByText('lot-1')).not.toBeInTheDocument();
  });
});

describe('Les bloqueurs se lisent AVANT d’essayer', () => {
  const BLOQUEURS: SiteClosureBlocker[] = [
    {
      message:
        'Une facture fournisseur en brouillon vise encore ce chantier : validez-la ou supprimez-la avant de clôturer.',
      count: 1
    },
    {
      message:
        '3 pièces de caisse en brouillon visent encore ce chantier : validez-les ou supprimez-les avant de clôturer.',
      count: 3
    }
  ];

  it('les liste tels quels, avec leur nombre, et désactive la clôture', async () => {
    configurerGet({ bloqueurs: BLOQUEURS });
    monter();

    expect(await screen.findByText(BLOQUEURS[0].message, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(BLOQUEURS[1].message)).toBeInTheDocument();
    // Deux raisons, quatre pièces concernées : les deux nombres sont annoncés.
    expect(screen.getByText(/2 raisons empêchent de clôturer/i)).toBeInTheDocument();
    expect(screen.getByText(/4 pièces concernées/i)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Clôturer le chantier' })).toBeDisabled();
  });

  it("n'appelle jamais le serveur tant qu'un bloqueur subsiste", async () => {
    const user = userEvent.setup({ delay: null });
    configurerGet({ bloqueurs: BLOQUEURS });
    monter();

    const bouton = await screen.findByRole('button', { name: 'Clôturer le chantier' }, { timeout: 8000 });
    await user.click(bouton);

    expect(post).not.toHaveBeenCalled();
  }, 15000);

  it('dit explicitement que rien ne bloque quand la liste est vide', async () => {
    monter();

    expect(await screen.findByText(/rien n'empêche de clôturer/i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clôturer le chantier' })).not.toBeDisabled();
  });
});

describe('Clôture et réouverture — le corps est VIDE, et c’est une exigence', () => {
  it('clôture après confirmation, avec un corps vide : l’auteur vient du jeton', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await user.click(await screen.findByRole('button', { name: 'Clôturer le chantier' }, { timeout: 8000 }));

    expect(await screen.findByText(/le coût du chantier sera figé/i)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirmer la clôture' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/close`, {}));
    // Rien d'autre que l'objet vide : un corps qui porterait l'auteur
    // permettrait de clôturer au nom de quelqu'un d'autre.
    const [, corps] = post.mock.calls[post.mock.calls.length - 1] as [string, Record<string, unknown>];
    expect(Object.keys(corps)).toEqual([]);
  }, 15000);

  it('rouvre un chantier clos dont aucun lot n’a basculé, avec un corps vide', async () => {
    const user = userEvent.setup({ delay: null });
    configurerGet({ repartition: repartitionClose() });
    monter();

    await user.click(await screen.findByRole('button', { name: 'Rouvrir le chantier' }, { timeout: 8000 }));
    await user.click(await screen.findByRole('button', { name: 'Confirmer la réouverture' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/reopen`, {}));
    const [, corps] = post.mock.calls[post.mock.calls.length - 1] as [string, Record<string, unknown>];
    expect(Object.keys(corps)).toEqual([]);
  }, 15000);

  it('EXPLIQUE pourquoi la réouverture est refusée dès qu’un lot a basculé, au lieu de griser sans raison', async () => {
    configurerGet({
      repartition: repartitionClose({
        lots: [
          lot({
            id: 'lot-1',
            name: 'Villa A1',
            sharePercent: 100,
            costPrice: 100_000_000,
            propertyId: 'bien-42',
            propertyLabel: 'VIL-2026-014'
          })
        ]
      })
    });
    monter();

    expect(
      await screen.findByText(/ne peut plus être rouvert : un lot a basculé au patrimoine/i, {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByText(/valeur d'acquisition vient du coût de revient figé/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rouvrir le chantier' })).toBeDisabled();
  });

  it('un chantier clos n’offre plus d’ajouter un lot, et dit pourquoi', async () => {
    configurerGet({ repartition: repartitionClose() });
    monter();

    await screen.findByText(/sont définitifs/i, {}, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: 'Ajouter le lot' })).not.toBeInTheDocument();
    expect(screen.getByText(/on ne peut plus y ajouter de lot/i)).toBeInTheDocument();
  });
});

describe('Les lots — création, correction, suppression', () => {
  it('ajoute un lot : le corps ne porte ni `siteId` ni les champs laissés vides', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockResolvedValue({ data: { data: repartition().lots[0] } });
    monter();

    await screen.findByText('Ajouter un lot', {}, { timeout: 8000 });
    await user.type(screen.getByLabelText('Nom du lot'), 'Villa A4');
    await user.type(screen.getByLabelText('Surface (m²)'), '180');

    await user.click(screen.getByRole('button', { name: 'Ajouter le lot' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/lots`, {
        name: 'Villa A4',
        surfaceArea: 180
      })
    );
    const [, corps] = post.mock.calls[post.mock.calls.length - 1] as [string, Record<string, unknown>];
    expect(corps).not.toHaveProperty('siteId');
    expect(corps).not.toHaveProperty('manualSharePercent');
  }, 15000);

  it('corrige un lot : le corps ne porte ni `siteId` ni `lotId`', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    const ligne = (await screen.findByText('Villa A1', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Corriger' }));

    const champ = await screen.findByLabelText('Nom du lot', { selector: '#correction-nom' });
    await user.clear(champ);
    await user.type(champ, 'Villa A1 bis');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la correction' }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/lots/lot-1`, {
        name: 'Villa A1 bis',
        surfaceArea: 240,
        manualSharePercent: null
      })
    );
    const [, corps] = patch.mock.calls[patch.mock.calls.length - 1] as [string, Record<string, unknown>];
    expect(corps).not.toHaveProperty('siteId');
    expect(corps).not.toHaveProperty('lotId');
  }, 20000);

  it('avertit avant de supprimer un lot, puis n’appelle le serveur qu’après confirmation', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    const ligne = (await screen.findByText('Villa A1', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Supprimer' }));

    expect(await screen.findByText(/sera recalculé/i)).toBeInTheDocument();
    expect(del).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/lots/lot-1`));
  }, 15000);

  it('fige la correction et la suppression dès qu’UN lot du chantier a basculé, et le dit', async () => {
    configurerGet({
      repartition: repartitionClose({
        lots: [
          lot({
            id: 'lot-1',
            name: 'Villa A1',
            sharePercent: 60,
            costPrice: 60_000_000,
            propertyId: 'bien-42',
            propertyLabel: 'VIL-2026-014'
          }),
          lot({ id: 'lot-2', name: 'Villa A2', sharePercent: 40, costPrice: 40_000_000 })
        ]
      })
    });
    monter();

    await screen.findByText('Villa A1', {}, { timeout: 8000 });
    expect(screen.getByText(/la répartition de ce chantier est figée/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corriger' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Appliquer la clé' })).toBeDisabled();
  });
});

describe('La clé de répartition', () => {
  it('pose la clé avec un corps qui ne porte que `method`', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    const select = await screen.findByLabelText('Clé de répartition', {}, { timeout: 8000 });
    fireEvent.mouseDown(select);
    fireEvent.click(await screen.findByText('Parts égales'));

    await user.click(screen.getByRole('button', { name: 'Appliquer la clé' }));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/lot-allocation-method`, {
        method: 'EQUAL'
      })
    );
    const [, corps] = put.mock.calls[put.mock.calls.length - 1] as [string, Record<string, unknown>];
    expect(corps).not.toHaveProperty('siteId');
  }, 15000);

  it('montre la somme des quotes-parts saisies en direct, et dit ce qui manque', async () => {
    configurerGet({
      repartition: repartition({
        allocationMethod: 'MANUAL',
        lots: [
          lot({ id: 'lot-1', name: 'Villa A1', manualSharePercent: 60, sharePercent: 60, costPrice: 60_000_000 }),
          lot({ id: 'lot-2', name: 'Villa A2', manualSharePercent: 30, sharePercent: 30, costPrice: 40_000_000 })
        ]
      })
    });
    monter();

    expect(
      await screen.findByText(/somme des quotes-parts saisies : 90 %/i, {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByText(/il manque 10 % pour atteindre cent/i)).toBeInTheDocument();
  });

  it('ne bloque pas la saisie d’un lot isolé qui ne mène pas à cent : le serveur n’exige les cent qu’à la pose de la clé', async () => {
    const user = userEvent.setup({ delay: null });
    configurerGet({
      repartition: repartition({
        allocationMethod: 'MANUAL',
        lots: [lot({ id: 'lot-1', name: 'Villa A1', manualSharePercent: 60, sharePercent: 60, costPrice: 60_000_000 })]
      })
    });
    monter();

    await screen.findByText('Ajouter un lot', {}, { timeout: 8000 });
    await user.type(screen.getByLabelText('Nom du lot'), 'Villa A2');
    await user.type(screen.getByLabelText('Quote-part (%)'), '15');

    // Le total vaudrait 75 % : le bouton reste utilisable.
    expect(await screen.findByText(/somme des quotes-parts saisies : 75 %/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter le lot' })).not.toBeDisabled();
  }, 15000);
});

describe('La bascule au patrimoine', () => {
  const REPARTITION_A_BASCULER = repartitionClose({
    lots: [lot({ id: 'lot-1', name: 'Villa A1', sharePercent: 100, costPrice: 74_560_000 })]
  });

  async function ouvrirLaBascule(user: ReturnType<typeof userEvent.setup>) {
    configurerGet({ repartition: REPARTITION_A_BASCULER });
    monter();
    const ligne = (await screen.findByText('Villa A1', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Basculer au patrimoine' }));
    await screen.findByLabelText('Référence interne du bien', {}, { timeout: 8000 });
  }

  it('présente le type de bien et le mode de détention en LISTE DE CHOIX, avec des libellés français', async () => {
    const user = userEvent.setup({ delay: null });
    await ouvrirLaBascule(user);

    const selectType = screen.getByLabelText('Type de bien');
    fireEvent.mouseDown(selectType);
    // Des libellés français, jamais les valeurs brutes de l'énumération.
    expect((await screen.findAllByText('Maison / Villa')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Terrain').length).toBeGreaterThanOrEqual(1);
    // Une liste de choix, jamais un champ libre : un champ libre laisserait
    // taper n'importe quoi, et le serveur répondrait 400 sur l'énumération.
    expect(selectType).toHaveAttribute('role', 'combobox');
    // Ce que l'utilisateur LIT est le libellé français, jamais la valeur brute
    // de l'énumération (rc-select ne la garde que dans son miroir
    // d'accessibilité, hors du flux visible).
    const optionsVisibles = Array.from(document.querySelectorAll('.ant-select-item-option-content')).map(
      noeud => noeud.textContent
    );
    expect(optionsVisibles).toContain('Maison / Villa');
    expect(optionsVisibles).not.toContain('MAISON_VILLA');

    const selectDetention = screen.getByLabelText('Mode de détention');
    fireEvent.mouseDown(selectDetention);
    expect((await screen.findAllByText("Propriété de l'agence")).length).toBeGreaterThanOrEqual(1);
    expect(selectDetention).toHaveAttribute('role', 'combobox');
  }, 15000);

  it('crée le bien avec les sept champs SAISIS, et ni `siteId` ni `lotId` ni `acquisitionCost` dans le corps', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockResolvedValue({
      data: {
        data: {
          lotId: 'lot-1',
          lotName: 'Villa A1',
          propertyId: 'bien-neuf',
          propertyInternalReference: 'VIL-2026-014',
          acquisitionCost: 74_560_000,
          acquisitionDate: '2026-09-19T00:00:00.000Z',
          currency: 'XOF'
        }
      }
    });
    await ouvrirLaBascule(user);

    await user.type(screen.getByLabelText('Référence interne du bien'), 'VIL-2026-014');
    await user.type(screen.getByLabelText('Titre du bien'), 'Villa A1 — Riviera');
    await user.type(screen.getByLabelText('Adresse du bien'), 'Quartier Riviera, Cocody');

    fireEvent.mouseDown(screen.getByLabelText('Type de bien'));
    fireEvent.click((await screen.findAllByText('Maison / Villa'))[0]);
    fireEvent.mouseDown(screen.getByLabelText('Mode de détention'));
    fireEvent.click((await screen.findAllByText("Propriété de l'agence"))[0]);

    const bouton = await screen.findByRole('button', { name: 'Créer le bien au patrimoine' });
    await waitFor(() => expect(bouton).not.toBeDisabled());
    await user.click(bouton);

    // La confirmation dit ce qu'elle crée ET avec quelle valeur d'acquisition.
    expect((await screen.findAllByText(/irréversible/i)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/74\s560\s000/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/VIL-2026-014/).length).toBeGreaterThanOrEqual(1);
    expect(post).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirmer la création du bien' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [adresse, corps] = post.mock.calls[post.mock.calls.length - 1] as [string, Record<string, unknown>];
    expect(adresse).toBe(`/tenants/${TENANT}/finance/sites/${SITE}/lots/lot-1/capitalize`);
    expect(Object.keys(corps).sort()).toEqual([
      'acquisitionDate',
      'address',
      'description',
      'internalReference',
      'ownershipType',
      'propertyType',
      'title'
    ]);
    expect(corps.propertyType).toBe('MAISON_VILLA');
    expect(corps.ownershipType).toBe('TENANT');
    expect(corps).not.toHaveProperty('siteId');
    expect(corps).not.toHaveProperty('lotId');
    expect(corps).not.toHaveProperty('acquisitionCost');
  }, 30000);

  it("ne propose pas la bascule sur un chantier OUVERT : le coût n'y est qu'une estimation", async () => {
    monter();

    await screen.findByText('Villa A1', {}, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: 'Basculer au patrimoine' })).not.toBeInTheDocument();
  });

  it('un lot déjà basculé ne se bascule pas une seconde fois', async () => {
    configurerGet({
      repartition: repartitionClose({
        lots: [
          lot({
            id: 'lot-1',
            name: 'Villa A1',
            sharePercent: 100,
            costPrice: 100_000_000,
            propertyId: 'bien-42',
            propertyLabel: 'VIL-2026-014'
          })
        ]
      })
    });
    monter();

    await screen.findByText('Villa A1', {}, { timeout: 8000 });
    expect(screen.getByText('Basculé au patrimoine')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Basculer au patrimoine' })).not.toBeInTheDocument();
  });
});

describe('Navigation et états', () => {
  it('lit `tenantId` et `siteId` dans le CHEMIN, pas en paramètre de requête', async () => {
    monter();

    await screen.findByText('Villa A1', {}, { timeout: 8000 });
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/cost-breakdown`);
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/closure-blockers`);
  });

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    get.mockImplementation(async () => {
      throw new Error('panne');
    });
    monter();

    expect(
      await screen.findByText('Impossible de charger le coût de revient de ce chantier.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});

describe('Vocabulaire (P-1 du PRD)', () => {
  it('l’écran n’affiche jamais « débit » ni « crédit », chantier ouvert', async () => {
    monter();

    await screen.findByText('Villa A1', {}, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  });

  it('l’écran n’affiche jamais « débit » ni « crédit », chantier clos et formulaire de bascule ouvert', async () => {
    const user = userEvent.setup({ delay: null });
    configurerGet({
      repartition: repartitionClose({
        lots: [lot({ id: 'lot-1', name: 'Villa A1', sharePercent: 100, costPrice: 100_000_000 })]
      })
    });
    monter();

    const ligne = (await screen.findByText('Villa A1', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Basculer au patrimoine' }));
    await screen.findByLabelText('Référence interne du bien', {}, { timeout: 8000 });

    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  }, 15000);
});
