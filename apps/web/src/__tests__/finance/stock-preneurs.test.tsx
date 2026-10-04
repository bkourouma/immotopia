import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StockPreneurs } from '../../pages/finance/StockPreneurs';
import type { StockAbilities, StockFieldContext, StockTakerView } from '../../types/finance-stock-controle-types';

/**
 * E4 — Carnet des preneurs (lot 040, ecrans §9, §11.1, §11.3).
 *
 * Mock à la frontière réseau : `apiClient` doublé, vrai service, vrai écran,
 * vrai formulaire du socle (`StockTakerForm`).
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

function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toLowerCase();
}

function preneur(over: Partial<StockTakerView> = {}): StockTakerView {
  return {
    id: 'preneur-kone',
    label: 'Koné Ibrahim — Équipe maçonnerie',
    fullName: 'Koné Ibrahim',
    teamOrCompany: 'Équipe maçonnerie',
    phone: '+225 07 00 00 00 01',
    employeeId: null,
    contractorId: null,
    linkedPersonLabel: null,
    isActive: true,
    createdAt: '2026-09-02T08:00:00.000Z',
    ...over
  };
}

const YAO = preneur({
  id: 'preneur-yao',
  label: 'Yao Serge — Électricité Yao',
  fullName: 'Yao Serge',
  teamOrCompany: 'Électricité Yao',
  phone: null
});

function droits(over: Partial<StockAbilities> = {}): StockAbilities {
  return {
    canReceive: true,
    canIssue: true,
    canTransfer: true,
    canCount: true,
    canValidateCount: false,
    canDispose: false,
    canManageTakers: true,
    valuesVisible: false,
    canViewAlerts: false,
    canManageSettings: false,
    ...over
  };
}

function contexte(abilities: StockAbilities): StockFieldContext {
  return {
    locations: [],
    sites: [],
    costCategories: [],
    items: [],
    takers: [],
    receivableInvoices: [],
    reasonCodes: { count: [], scrap: [], supplierReturn: [], transfer: [] },
    settings: { requireTaker: false, backdatingLimitDays: 7 },
    abilities,
    people: []
  };
}

let abilities: StockAbilities;
let carnet: StockTakerView[];

function poser(options: { abilities?: StockAbilities; carnet?: StockTakerView[] } = {}) {
  abilities = options.abilities ?? droits();
  carnet = options.carnet ?? [preneur(), YAO];
  get.mockImplementation(async (url: string) => {
    if (/\/finance\/stock\/field-context(\?|$)/.test(url)) {
      return {
        data: { success: true, data: contexte(abilities), meta: { valuesVisible: false, blindLocationIds: [] } }
      };
    }
    if (/\/finance\/stock\/takers(\?|$)/.test(url)) {
      // Sans le droit, le serveur ne rend pas les numéros (spec B2-R6).
      const liste = abilities.canManageTakers ? carnet : carnet.map(taker => ({ ...taker, phone: null }));
      return { data: { success: true, data: liste } };
    }
    throw new Error(`GET inattendu : ${url}`);
  });
}

function appelsCarnet(): string[] {
  return get.mock.calls.map(call => String(call[0])).filter(url => /\/stock\/takers/.test(url));
}

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[`/tenant/${TENANT}/finance/stock/preneurs`]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/stock/preneurs" element={<StockPreneurs />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function ligneDe(nom: string): HTMLElement {
  const cellule = screen.getByText(nom);
  return cellule.closest('tr') as HTMLElement;
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  poser();
});

describe('Carnet des preneurs — la liste', () => {
  it('liste le carnet, cherche, et montre les désactivés sur demande', async () => {
    const user = userEvent.setup();
    monter();
    expect(await screen.findByText('Koné Ibrahim', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Yao Serge')).toBeInTheDocument();
    expect(appelsCarnet()[0]).toBe(`/tenants/${TENANT}/finance/stock/takers`);

    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un nom ou une équipe' }), 'Kon{Enter}');
    await waitFor(() => expect(appelsCarnet().some(url => url.includes('search=Kon'))).toBe(true));

    await user.click(screen.getByRole('checkbox', { name: 'Afficher les preneurs désactivés' }));
    await waitFor(() => expect(appelsCarnet().some(url => url.includes('onlyActive=false'))).toBe(true));
  }, 30000);

  it('affiche toujours l’encadré sur les données personnelles', async () => {
    monter();
    await screen.findByText('Koné Ibrahim', {}, { timeout: 8000 });
    expect(screen.getByText(/Informez les personnes concernées/)).toBeInTheDocument();
  }, 15000);

  it('carnet vide : invite à ajouter les chefs d’équipe et les tâcherons', async () => {
    poser({ carnet: [] });
    monter();
    expect(
      await screen.findByText(/Le carnet est vide\. Ajoutez les chefs d’équipe et les tâcherons/, {}, { timeout: 8000 })
    ).toBeInTheDocument();
  }, 15000);
});

describe('Carnet des preneurs — les écritures', () => {
  it('ajoute un preneur avec les cinq champs du contrat, rien d’autre', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ data: { success: true, data: preneur({ id: 'nouveau', fullName: 'Bamba Ali' }) } });
    monter();
    await screen.findByText('Koné Ibrahim', {}, { timeout: 8000 });

    await user.click(screen.getByRole('button', { name: /Ajouter un preneur/ }));
    const fenetre = await screen.findByRole('dialog');
    await user.type(within(fenetre).getByLabelText('Nom complet'), 'Bamba Ali');
    await user.type(within(fenetre).getByLabelText(/Équipe ou entreprise/), 'Plomberie');
    await user.click(within(fenetre).getByRole('button', { name: 'Ajouter le preneur' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [adresse, corps] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/takers`);
    expect(corps).toEqual({
      fullName: 'Bamba Ali',
      teamOrCompany: 'Plomberie',
      phone: null,
      employeeId: null,
      contractorId: null
    });
    expect(Object.keys(corps)).not.toContain('tenantId');
  }, 30000);

  it('409 STOCK_TAKER_DUPLICATE : propose le preneur existant et restreint le carnet à lui', async () => {
    const user = userEvent.setup();
    post.mockRejectedValue(
      Object.assign(new Error('doublon'), {
        response: {
          status: 409,
          data: {
            success: false,
            code: 'STOCK_TAKER_DUPLICATE',
            message: 'Doublon',
            data: { existingTakerId: 'preneur-yao' }
          }
        }
      })
    );
    monter();
    await screen.findByText('Koné Ibrahim', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: /Ajouter un preneur/ }));
    const fenetre = await screen.findByRole('dialog');
    await user.type(within(fenetre).getByLabelText('Nom complet'), 'Yao Serge');
    await user.click(within(fenetre).getByRole('button', { name: 'Ajouter le preneur' }));

    const choisir = await within(fenetre).findByRole('button', { name: 'Choisir ce preneur' });
    await user.click(choisir);
    await waitFor(() => expect(screen.queryByText('Koné Ibrahim')).not.toBeInTheDocument());
    expect(screen.getByText('Yao Serge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Afficher tout le carnet' })).toBeInTheDocument();
  }, 30000);

  it('désactive après confirmation : PATCH { isActive: false }', async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue({ data: { success: true, data: preneur({ isActive: false }) } });
    monter();
    await screen.findByText('Koné Ibrahim', {}, { timeout: 8000 });

    await user.click(within(ligneDe('Koné Ibrahim')).getByRole('button', { name: 'Désactiver' }));
    const fenetre = await screen.findByRole('dialog');
    expect(within(fenetre).getAllByText('Désactiver Koné Ibrahim ?').length).toBeGreaterThan(0);
    expect(
      within(fenetre).getByText('Il ne pourra plus être choisi pour une sortie. Ses sorties passées restent à son nom.')
    ).toBeInTheDocument();
    await user.click(within(fenetre).getByRole('button', { name: 'Désactiver' }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][0]).toBe(`/tenants/${TENANT}/finance/stock/takers/preneur-kone`);
    expect(patch.mock.calls[0][1]).toEqual({ isActive: false });
  }, 30000);

  it('« Effacer le téléphone » : PATCH { phone: null }, proposé seulement s’il y a un numéro', async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue({ data: { success: true, data: preneur({ phone: null }) } });
    monter();
    await screen.findByText('Koné Ibrahim', {}, { timeout: 8000 });
    expect(within(ligneDe('Yao Serge')).queryByRole('button', { name: 'Effacer le téléphone' })).toBeNull();

    await user.click(within(ligneDe('Koné Ibrahim')).getByRole('button', { name: 'Effacer le téléphone' }));
    const fenetre = await screen.findByRole('dialog');
    await user.click(within(fenetre).getByRole('button', { name: 'Effacer le téléphone' }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][1]).toEqual({ phone: null });
  }, 30000);

  it('corrige en n’envoyant que les champs modifiés', async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue({ data: { success: true, data: preneur({ teamOrCompany: 'Gros œuvre' }) } });
    monter();
    await screen.findByText('Koné Ibrahim', {}, { timeout: 8000 });

    await user.click(within(ligneDe('Koné Ibrahim')).getByRole('button', { name: 'Corriger' }));
    const fenetre = await screen.findByRole('dialog');
    const equipe = within(fenetre).getByLabelText(/Équipe ou entreprise/);
    await user.clear(equipe);
    await user.type(equipe, 'Gros œuvre');
    await user.click(within(fenetre).getByRole('button', { name: 'Enregistrer la correction' }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][1]).toEqual({ teamOrCompany: 'Gros œuvre' });
  }, 30000);
});

describe('Carnet des preneurs — sans le droit de le tenir', () => {
  it('aucun bouton d’écriture, et pas de colonne Téléphone', async () => {
    poser({ abilities: droits({ canManageTakers: false }) });
    monter();
    await screen.findByText('Koné Ibrahim', {}, { timeout: 8000 });

    expect(screen.queryByRole('button', { name: /Ajouter un preneur/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Corriger' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Désactiver' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Effacer le téléphone' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Téléphone' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Nom' })).toBeInTheDocument();
  }, 15000);

  it('vocabulaire : aucun mot interdit', async () => {
    monter();
    await screen.findByText('Koné Ibrahim', {}, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bvols?\b|\bvoleurs?\b|\bfraud|\bdetourn/);
  }, 15000);
});
