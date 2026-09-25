import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Le tableau de bord des chantiers, depuis la RÉPONSE HTTP jusqu'aux lignes
 * affichées — sans doublure de service entre les deux.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi ce fichier existe, à côté de `tableau-de-bord.test.tsx`
 * ---------------------------------------------------------------------------
 *
 * Le 19 septembre 2026, le contrôleur renvoyait le tableau de bord à plat —
 * `{ success, data: [...], currency }` — alors que le contrat
 * (`specs/018-finance-budget-pilotage/contracts/openapi.yaml`,
 * `SitesDashboardResponseWrapper`) place `rows` ET `currency` DANS `data`.
 * Le service web lisait `response.data.data` en l'annonçant `SitesDashboard`,
 * et l'écran faisait `data?.rows ?? []` : sur un tableau, `.rows` vaut
 * `undefined`, donc l'écran restait vide malgré un HTTP 200 plein.
 *
 * **Rien ne pouvait le voir.** `tableau-de-bord.test.tsx` remplace
 * `finance-lot3-service` par une doublure : il injecte déjà un
 * `{ rows, currency }` bien formé, donc il vérifie l'écran en supposant juste
 * l'étape même qui était fausse. Et le seul cas non simulé — la table
 * `construction_sites` vide — rendait « Aucune donnée », ce qui ressemblait
 * trait pour trait au comportement correct.
 *
 * Ce fichier ferme cette frontière : il simule le transport (`utils/api-client`)
 * et laisse tourner le VRAI service, le vrai typage et le vrai écran. Le corps
 * de réponse ci-dessous est celui du contrat, et il n'est jamais vide — un jeu
 * d'essai vide ne prouverait rien ici, c'est précisément ce qui masquait le
 * défaut.
 *
 * `__tests__/finance/corps-des-requetes.test.ts` épingle l'autre moitié : ce
 * que le web ENVOIE. Les deux se répondent.
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
import { TableauDeBordChantiers } from '../../pages/finance/TableauDeBordChantiers';
import { getSitesDashboard } from '../../services/finance-lot3-service';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'agence-1';

/**
 * Le corps EXACT que sert `getSitesDashboardHandler`, enveloppe comprise.
 *
 * Deux chantiers, pas un : une ligne unique laisserait passer un écran qui
 * n'afficherait que la première.
 */
function corpsDeReponse() {
  return {
    success: true,
    data: {
      rows: [
        {
          siteId: 'chantier-1',
          siteLabel: 'Villa duplex — Kipé Centre',
          zone: 'Kipé, Ratoma',
          status: 'IN_PROGRESS',
          initialBudget: 25_500_000,
          revisedBudget: 26_700_000,
          engagedAmount: 21_600_000,
          actualCost: 19_500_000,
          progressPercent: 70,
          variance: 5_100_000,
          variancePercent: 19,
          openAlert: null,
          currency: 'XOF'
        },
        {
          siteId: 'chantier-2',
          siteLabel: 'Extension villa — Lambanyi',
          zone: 'Lambanyi, Ratoma',
          status: 'IN_PROGRESS',
          initialBudget: 8_000_000,
          revisedBudget: 8_000_000,
          engagedAmount: 9_200_000,
          actualCost: 9_000_000,
          progressPercent: 95,
          variance: -1_200_000,
          variancePercent: -15,
          openAlert: null,
          currency: 'XOF'
        }
      ],
      currency: 'XOF'
    }
  };
}

function monter(url = `/tenant/${TENANT}/finance/tableau-de-bord-chantiers`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/tableau-de-bord-chantiers" element={<TableauDeBordChantiers />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: corpsDeReponse() });
});

describe('Tableau de bord — du corps de réponse HTTP aux lignes affichées', () => {
  it('rend une ligne par chantier à partir de la réponse réelle du serveur', async () => {
    monter();

    // La garantie centrale : le tableau n'est PAS vide. Avec l'enveloppe à
    // plat d'avant, `data.rows` valait `undefined` et cette attente échouait,
    // tandis que « Aucune donnée » s'affichait sous un HTTP 200 parfaitement
    // valide.
    expect(await screen.findByText('Villa duplex — Kipé Centre', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Extension villa — Lambanyi')).toBeInTheDocument();
    expect(screen.queryByText('Aucune donnée')).not.toBeInTheDocument();
  });

  it('achemine les montants et le code couleur de bout en bout, sans les recalculer', async () => {
    monter();

    await screen.findByText('Villa duplex — Kipé Centre', {}, { timeout: 8000 });

    expect(screen.getByText(/26\s700\s000\sFCFA/)).toBeInTheDocument();
    expect(screen.getByText(/21\s600\s000\sFCFA/)).toBeInTheDocument();
    // Un écart de chaque signe : les deux lignes traversent bien la chaîne.
    expect(screen.getByText('Dans le budget')).toBeInTheDocument();
    expect(screen.getByText('Dépassement')).toBeInTheDocument();
  });

  it('interroge la bonne adresse, et ne lit la devise que dans `data`', async () => {
    const resultat = await getSitesDashboard(TENANT);

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get.mock.calls[0][0]).toContain(`/tenants/${TENANT}/finance/sites/dashboard`);

    // Le service rend l'objet du contrat, pas le tableau nu : `rows` est un
    // tableau et `currency` se lit à côté de lui, à l'intérieur de `data`.
    expect(Array.isArray(resultat.rows)).toBe(true);
    expect(resultat.rows).toHaveLength(2);
    expect(resultat.currency).toBe('XOF');
  });
});
