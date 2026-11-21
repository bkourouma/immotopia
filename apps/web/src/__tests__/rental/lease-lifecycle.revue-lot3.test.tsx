import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { LeaseLifecyclePanel } from '../../components/rental/LeaseLifecyclePanel';

/**
 * Panneau « Vie du bail » — revue fonctionnelle (lot 3) :
 *  - un bail annulé ne se révise, ne se renouvelle et ne se résilie plus (l'API répond 409) ;
 *  - les montants du bandeau sont dans la devise du bail, pas en FCFA par défaut.
 */

const getLeaseEvents = vi.fn();

vi.mock('../../services/lease-lifecycle-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/lease-lifecycle-service')>();
  return {
    ...actual,
    getLeaseEvents: (...a: unknown[]) => getLeaseEvents(...a),
    getFinalSettlement: vi.fn()
  };
});

function lease(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ACTIVE',
    startDate: '2025-01-01',
    endDate: '2027-08-31',
    currency: 'FCFA',
    rentAmount: 150000,
    serviceChargeAmount: 10000,
    moveOutDate: null,
    terminated: false,
    ...overrides
  };
}

function mount() {
  return render(
    <AntApp>
      <LeaseLifecyclePanel tenantId="agence-1" leaseId="bail-1" />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Vie du bail — bail annulé', () => {
  it('désactive révision, renouvellement et résiliation, mais pas l’avenant', async () => {
    getLeaseEvents.mockResolvedValue({ events: [], lease: lease({ status: 'CANCELED' }) });
    mount();
    const reviser = (await screen.findByRole('button', { name: /Réviser le loyer/ })) as HTMLButtonElement;
    expect(reviser.disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Renouveler/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Résilier le bail/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Enregistrer un avenant/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('laisse les actions actives sur un bail actif', async () => {
    getLeaseEvents.mockResolvedValue({ events: [], lease: lease() });
    mount();
    const reviser = (await screen.findByRole('button', { name: /Réviser le loyer/ })) as HTMLButtonElement;
    expect(reviser.disabled).toBe(false);
  });
});

describe('Vie du bail — devise du bail', () => {
  it('affiche loyer et charges dans la devise du bail, décimales comprises', async () => {
    getLeaseEvents.mockResolvedValue({
      events: [],
      lease: lease({ currency: 'EUR', rentAmount: 1250.5, serviceChargeAmount: 80 })
    });
    mount();
    expect(await screen.findByText(/1\s250,50\s*EUR/)).toBeTruthy();
    expect(screen.queryByText(/FCFA/)).toBeNull();
  });
});
