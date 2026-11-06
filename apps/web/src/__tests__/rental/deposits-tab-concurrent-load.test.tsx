import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { Deposits } from '../../pages/rental/Deposits';

/**
 * Onglet « Dépôt de garantie » d'un bail — BUG-2026-11-03-020.
 *
 * Sous `React.StrictMode` (serveur de développement, recette) l'effet de
 * chargement part deux fois : deux GET simultanés sur `/deposit`. Quand l'un
 * échoue (409 de la course de création côté API, désormais corrigée), l'écran
 * montrait À LA FOIS les données de l'autre réponse et le bandeau « Erreur ».
 * Seule la réponse de la lecture la plus récente doit compter.
 *
 * Seul `apiClient` est simulé : le vrai service `rental-service` tourne
 * par-dessus.
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../../components/rental/DepositMovementForm', () => ({ DepositMovementForm: () => null }));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

const DEPOT = {
  id: 'dep-1',
  tenant_id: 'agence-1',
  lease_id: 'bail-1',
  currency: 'FCFA',
  target_amount: 300000,
  collected_amount: 0,
  held_amount: 0,
  refunded_amount: 0,
  forfeited_amount: 0,
  current_balance: 0,
  movements: []
};

const CONFLIT = {
  response: { status: 409, data: { success: false, message: 'Cette ressource existe déjà.', code: 'CONFLICT' } }
};

/** Programme les réponses successives de `GET .../deposit` ; les mouvements restent vides. */
function programmerLectures(...lectures: Array<() => Promise<unknown>>) {
  let appel = 0;
  get.mockImplementation((url: string) => {
    if (url.includes('/movements')) return Promise.resolve({ data: { success: true, data: [] } });
    const lecture = lectures[Math.min(appel, lectures.length - 1)];
    appel += 1;
    return lecture();
  });
}

const depotOk = () => Promise.resolve({ data: { success: true, data: DEPOT } });
const conflit = () => Promise.reject(CONFLIT);

function monter(strict: boolean) {
  const arbre = (
    <MemoryRouter initialEntries={['/tenant/agence-1/rental/leases/bail-1']}>
      <Routes>
        <Route
          path="/tenant/:tenantId/rental/leases/:leaseId"
          element={
            <AntApp>
              <Deposits leaseId="bail-1" />
            </AntApp>
          }
        />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <React.StrictMode>{arbre}</React.StrictMode> : arbre);
}

function lecturesDepot() {
  return get.mock.calls.filter(([url]) => String(url).endsWith('/deposit'));
}

describe('Deposits — chargement concurrent du dépôt', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('sous StrictMode, une lecture en 409 suivie d une lecture réussie affiche le dépôt sans bandeau d erreur', async () => {
    programmerLectures(conflit, depotOk);

    monter(true);

    expect(await screen.findByText('Montant cible', {}, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => expect(lecturesDepot().length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText('Erreur')).not.toBeInTheDocument();
    expect(screen.queryByText('Cette ressource existe déjà.')).not.toBeInTheDocument();
  });

  it('sous StrictMode, deux lectures réussies (API corrigée) affichent le dépôt sans bandeau d erreur', async () => {
    programmerLectures(depotOk, depotOk);

    monter(true);

    expect(await screen.findByText('Montant cible', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText('Erreur')).not.toBeInTheDocument();
  });

  it('une vraie erreur de chargement reste affichée (le garde n avale pas la dernière réponse)', async () => {
    programmerLectures(() =>
      Promise.reject({ response: { status: 500, data: { success: false, message: 'Erreur serveur de test' } } })
    );

    monter(false);

    expect(await screen.findByText('Erreur serveur de test', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Erreur')).toBeInTheDocument();
    expect(screen.queryByText('Montant cible')).not.toBeInTheDocument();
  });

  it('hors StrictMode, un seul GET part et le dépôt s affiche', async () => {
    programmerLectures(depotOk);

    monter(false);

    expect(await screen.findByText('Montant cible', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(lecturesDepot()).toHaveLength(1);
    expect(screen.queryByText('Erreur')).not.toBeInTheDocument();
  });
});
