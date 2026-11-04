import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import dayjs from 'dayjs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Comptabilite } from '../../pages/finance/Comptabilite';
import { AccountingFrame, accountingQueryKey } from '../../pages/finance/comptabilite/shared';
import type { SyncMeta } from '../../services/accounting-exports-service';

/**
 * Comptabilité de l'agence, lot C : la route `/finance/comptabilite` ne fait
 * plus que rediriger les anciens liens `?tab=` vers les sous-pages, et le
 * cadre commun (`pages/finance/comptabilite/shared/`) porte la période, la
 * synchronisation et la mention de devise. Le contenu des sous-pages est
 * testé dans `comptabilite-*.test.tsx`.
 *
 * Le mock du service couvre CHAQUE export utilisé par le cadre : Vitest
 * refuse tout import qu'un `vi.mock` ne déclare pas (AGENTS.md).
 */

const syncAccounting = vi.fn();
const getAccountingMeta = vi.fn();
const downloadAccountingExport = vi.fn();

vi.mock('../../services/accounting-exports-service', () => ({
  syncAccounting: (...a: unknown[]) => syncAccounting(...a),
  getAccountingMeta: (...a: unknown[]) => getAccountingMeta(...a),
  downloadAccountingExport: (...a: unknown[]) => downloadAccountingExport(...a)
}));

// La boucle d'interrogation est observée, pas exécutée : on la déclenche à la main.
const polling = vi.hoisted(() => ({
  calls: [] as Array<{ task: () => Promise<unknown>; options: { enabled?: boolean; intervalMs?: number } }>
}));
vi.mock('../../hooks/useVisiblePolling', () => ({
  useVisiblePolling: (task: () => Promise<unknown>, options: { enabled?: boolean; intervalMs?: number }) => {
    polling.calls.push({ task, options });
    return { refresh: () => undefined };
  }
}));

const TENANT = 't1';

function Lieu() {
  const location = useLocation();
  return <div data-testid="lieu">{`${location.pathname}${location.search}`}</div>;
}

function renderApp(initial: string, element: React.ReactElement, queryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/comptabilite" element={<Comptabilite />} />
            <Route path="/tenant/:tenantId/finance/comptabilite/:sousPage" element={element} />
          </Routes>
          <Lieu />
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const base = `/tenant/${TENANT}/finance/comptabilite`;

describe('Comptabilité — redirection des anciennes adresses', () => {
  const lieu = () => screen.getByTestId('lieu').textContent;

  it('envoie /finance/comptabilite vers le journal', async () => {
    renderApp(base, <div>page</div>);
    await waitFor(() => expect(lieu()).toBe(`${base}/journal`));
  });

  it('?tab=grand-livre&account=411 → /grand-livre?account=411', async () => {
    renderApp(`${base}?tab=grand-livre&account=411`, <div>page</div>);
    await waitFor(() => expect(lieu()).toBe(`${base}/grand-livre?account=411`));
  });

  it('?tab=balance-generale → /balance', async () => {
    renderApp(`${base}?tab=balance-generale`, <div>page</div>);
    await waitFor(() => expect(lieu()).toBe(`${base}/balance`));
  });

  it('?tab=mandants&date-mandants=… → /mandants avec le paramètre', async () => {
    renderApp(`${base}?tab=mandants&date-mandants=2026-06-30`, <div>page</div>);
    await waitFor(() => expect(lieu()).toBe(`${base}/mandants?date-mandants=2026-06-30`));
  });

  it('conserve la période et les autres filtres, et retire seulement tab', async () => {
    renderApp(`${base}?from=2026-01-01&tab=journal&to=2026-03-31&journal=OP-CASH`, <div>page</div>);
    await waitFor(() => expect(lieu()).toBe(`${base}/journal?from=2026-01-01&to=2026-03-31&journal=OP-CASH`));
  });

  it('un onglet inconnu retombe sur le journal', async () => {
    renderApp(`${base}?tab=n-importe-quoi&from=2026-01-01`, <div>page</div>);
    await waitFor(() => expect(lieu()).toBe(`${base}/journal?from=2026-01-01`));
  });
});

describe('Comptabilité — cadre commun', () => {
  const lieu = () => screen.getByTestId('lieu').textContent;

  const cadre = (sync: SyncMeta | undefined) => (
    <AccountingFrame sync={sync}>
      <div>contenu de la page</div>
    </AccountingFrame>
  );

  beforeEach(() => {
    syncAccounting.mockReset();
    syncAccounting.mockResolvedValue({ status: 'idle', lastSyncedAt: '2026-10-01T09:30:00.000Z' });
    getAccountingMeta.mockReset();
    downloadAccountingExport.mockReset();
    polling.calls.length = 0;
  });

  it('affiche la note, les enfants et la mention de devise', () => {
    renderApp(`${base}/journal`, cadre({ status: 'idle', lastSyncedAt: null }));
    expect(screen.getByText(/Comptabilité opérationnelle de l'agence/)).toBeInTheDocument();
    expect(screen.getByText('contenu de la page')).toBeInTheDocument();
    expect(screen.getByText('Tous les montants sont en FCFA.')).toBeInTheDocument();
  });

  it('montre le bandeau et programme une relecture toutes les 3 s tant que la synchro tourne', () => {
    renderApp(`${base}/journal`, cadre({ status: 'running', lastSyncedAt: null }));
    expect(screen.getByText('Mise à jour des écritures en cours…')).toBeInTheDocument();
    const dernier = polling.calls[polling.calls.length - 1];
    expect(dernier.options).toMatchObject({ enabled: true, intervalMs: 3000 });
  });

  it('relit les requêtes comptables actives (pas la première fois, déjà à jour)', async () => {
    const queryClient = new QueryClient();
    const invalider = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    renderApp(`${base}/journal`, cadre({ status: 'running', lastSyncedAt: null }), queryClient);
    const { task } = polling.calls[polling.calls.length - 1];

    await task();
    expect(invalider).not.toHaveBeenCalled();
    await task();
    expect(invalider).toHaveBeenCalledTimes(1);

    const { predicate } = invalider.mock.calls[0][0] as {
      predicate: (q: { queryKey: readonly unknown[] }) => boolean;
    };
    expect(predicate({ queryKey: accountingQueryKey('journal', TENANT, { page: 2 }) })).toBe(true);
    expect(predicate({ queryKey: accountingQueryKey('journal', 'autre-agence') })).toBe(false);
    expect(predicate({ queryKey: ['properties', TENANT, null] })).toBe(false);
  });

  it('sans synchronisation en cours : ni bandeau, ni relecture', () => {
    renderApp(`${base}/journal`, cadre({ status: 'idle', lastSyncedAt: null }));
    expect(screen.queryByText('Mise à jour des écritures en cours…')).not.toBeInTheDocument();
    expect(polling.calls[polling.calls.length - 1].options.enabled).toBe(false);
  });

  it('indique l’heure de la dernière mise à jour', () => {
    const iso = '2026-10-01T09:30:00.000Z';
    renderApp(`${base}/journal`, cadre({ status: 'idle', lastSyncedAt: iso }));
    expect(screen.getByText(`Mis à jour à ${dayjs(iso).format('HH:mm')}`)).toBeInTheDocument();
  });

  it('signale l’échec de la dernière mise à jour', () => {
    renderApp(`${base}/journal`, cadre({ status: 'error', lastSyncedAt: null }));
    expect(screen.getByText('La dernière mise à jour des écritures a échoué.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Actualiser les écritures/ })).toBeInTheDocument();
  });

  it('« Actualiser les écritures » lance la synchronisation de l’agence', async () => {
    renderApp(`${base}/journal`, cadre({ status: 'idle', lastSyncedAt: null }));
    await userEvent.click(screen.getByRole('button', { name: /Actualiser les écritures/ }));
    await waitFor(() => expect(syncAccounting).toHaveBeenCalledWith(TENANT));
  });

  it('un échec de la synchronisation manuelle affiche un message d’erreur', async () => {
    syncAccounting.mockRejectedValue(new Error('boom'));
    renderApp(`${base}/journal`, cadre({ status: 'idle', lastSyncedAt: null }));
    await userEvent.click(screen.getByRole('button', { name: /Actualiser les écritures/ }));
    expect(await screen.findByText('La mise à jour des écritures a échoué.')).toBeInTheDocument();
  });

  it('« Année précédente » pose la période de l’année civile précédente', async () => {
    renderApp(`${base}/journal?page=3&journal=OP-CASH`, cadre(undefined));
    const annee = dayjs().subtract(1, 'year').year();
    await userEvent.click(screen.getByRole('button', { name: 'Année précédente' }));
    await waitFor(() => expect(lieu()).toContain(`from=${annee}-01-01`));
    expect(lieu()).toContain(`to=${annee}-12-31`);
    // La page repart de 1 (paramètre retiré), les autres filtres restent.
    expect(lieu()).not.toContain('page=');
    expect(lieu()).toContain('journal=OP-CASH');
  });

  it('« Mois précédent » pose le mois civil précédent', async () => {
    renderApp(`${base}/journal`, cadre(undefined));
    const precedent = dayjs().subtract(1, 'month');
    await userEvent.click(screen.getByRole('button', { name: 'Mois précédent' }));
    await waitFor(() => expect(lieu()).toContain(`from=${precedent.startOf('month').format('YYYY-MM-DD')}`));
    expect(lieu()).toContain(`to=${precedent.endOf('month').format('YYYY-MM-DD')}`);
  });
});
