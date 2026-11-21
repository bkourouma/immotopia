import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { Deposits } from '../../pages/rental/Deposits';

/**
 * Revue lot 3, dépôt de garantie : signes de l'historique, part bloquée,
 * état d'erreur. Seul `apiClient` est simulé.
 */

vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));
vi.mock('../../components/rental/DepositMovementForm', () => ({ DepositMovementForm: () => null }));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

const DEPOT = {
  id: 'dep-1',
  tenant_id: 'agence-1',
  lease_id: 'bail-1',
  currency: 'FCFA',
  target_amount: '500000',
  collected_amount: '500000',
  held_amount: '50000',
  refunded_amount: '0',
  forfeited_amount: '0',
  current_balance: 500000
};

const mouvement = (id: string, type: string, amount: string) => ({
  id,
  tenant_id: 'agence-1',
  deposit_id: 'dep-1',
  type,
  amount,
  currency: 'FCFA',
  created_at: '2026-11-09T10:00:00.000Z',
  note: `note${id}`
});

function monter() {
  return render(
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
}

function ligne(note: string): HTMLElement {
  return screen.getByText(note).closest('tr') as HTMLElement;
}

describe('Deposits — revue lot 3', () => {
  beforeEach(() => get.mockReset());

  it("l'historique signe chaque mouvement du côté du montant remboursable : libération +, blocage -", async () => {
    get.mockImplementation((url: string) =>
      String(url ?? '').includes('/movements')
        ? Promise.resolve({
            data: {
              success: true,
              data: [
                mouvement('c', 'COLLECT', '500000'),
                mouvement('h', 'HOLD', '50000'),
                mouvement('r', 'RELEASE', '20000'),
                mouvement('f', 'REFUND', '1000')
              ]
            }
          })
        : Promise.resolve({ data: { success: true, data: DEPOT } })
    );
    monter();

    await screen.findByText('notec', {}, { timeout: 5000 });
    expect(ligne('notec').textContent).toContain('+');
    expect(ligne('noteh').textContent).toContain('-');
    expect(ligne('noter').textContent).toContain('+');
    expect(ligne('noter').textContent).not.toContain('-');
    expect(ligne('notef').textContent).toContain('-');
  });

  it('affiche la part bloquée et le montant remboursable quand une retenue existe', async () => {
    get.mockImplementation((url: string) =>
      String(url ?? '').includes('/movements')
        ? Promise.resolve({ data: { success: true, data: [] } })
        : Promise.resolve({ data: { success: true, data: DEPOT } })
    );
    monter();

    expect(await screen.findByText('Bloqué', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Remboursable')).toBeInTheDocument();
    expect(screen.getByText(/450\s?000/)).toBeInTheDocument();
  });

  it('sans retenue, pas de ligne « Bloqué »', async () => {
    get.mockImplementation((url: string) =>
      String(url ?? '').includes('/movements')
        ? Promise.resolve({ data: { success: true, data: [] } })
        : Promise.resolve({ data: { success: true, data: { ...DEPOT, held_amount: '0' } } })
    );
    monter();

    await screen.findByText('Montant cible', {}, { timeout: 5000 });
    expect(screen.queryByText('Bloqué')).not.toBeInTheDocument();
  });

  it("une erreur de chargement n'affiche pas « Aucun dépôt de garantie configuré »", async () => {
    get.mockImplementation((url: string) =>
      String(url ?? '').endsWith('/deposit')
        ? Promise.reject({ response: { status: 500, data: { success: false, message: 'Erreur serveur de test' } } })
        : Promise.resolve({ data: { success: true, data: [] } })
    );
    monter();

    expect(await screen.findByText('Erreur serveur de test', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText('Aucun dépôt de garantie configuré pour ce bail')).not.toBeInTheDocument();
  });

  it('un 404 (pas de dépôt) affiche bien « Aucun dépôt de garantie configuré »', async () => {
    get.mockImplementation((url: string) =>
      String(url ?? '').endsWith('/deposit')
        ? Promise.reject({ response: { status: 404, data: { message: 'introuvable' } } })
        : Promise.resolve({ data: { success: true, data: [] } })
    );
    monter();

    expect(
      await screen.findByText('Aucun dépôt de garantie configuré pour ce bail', {}, { timeout: 5000 })
    ).toBeInTheDocument();
  });
});
