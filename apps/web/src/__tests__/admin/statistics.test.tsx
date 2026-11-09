import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Statistics } from '../../pages/admin/Statistics';
import type { GlobalStatistics } from '../../services/statistics-service';

/**
 * Page Statistiques globales : la carte Abonnements lit
 * `subscriptionsByStatus` (reponse reelle de GET /admin/statistics).
 * Le service est mocke en entier.
 */

const getGlobalStatistics = vi.fn();
const getTenantActivityStats = vi.fn();

vi.mock('../../services/statistics-service', () => ({
  getGlobalStatistics: (...a: unknown[]) => getGlobalStatistics(...a),
  getTenantActivityStats: (...a: unknown[]) => getTenantActivityStats(...a)
}));

function makeStats(overrides: Partial<GlobalStatistics['subscriptionsByStatus']> = {}): GlobalStatistics {
  return {
    totalTenants: 10,
    activeTenants: 7,
    suspendedTenants: 1,
    pendingTenants: 2,
    totalCollaborators: 25,
    activeCollaborators: 20,
    totalSubscriptions: 5,
    subscriptionsByPlan: { BASIC: 1, PRO: 2, ELITE: 0 },
    subscriptionsByStatus: { TRIALING: 0, ACTIVE: 3, PAST_DUE: 0, CANCELED: 0, SUSPENDED: 0, ...overrides },
    moduleActivations: { MODULE_AGENCY: 4, MODULE_SYNDIC: 2 },
    recentActivity: { tenantsCreatedLast30Days: 1, lastLoginDate: null }
  };
}

describe('Statistics (admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche le nombre reel d\'abonnements actifs, sans "undefined"', async () => {
    getGlobalStatistics.mockResolvedValue({ success: true, data: makeStats() });
    const { container } = render(<Statistics />);

    expect(await screen.findByText('3 actifs')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/undefined/);
    expect(screen.queryByText(/annulés/)).not.toBeInTheDocument();
  });

  it('affiche les abonnements annulés quand il y en a', async () => {
    getGlobalStatistics.mockResolvedValue({ success: true, data: makeStats({ CANCELED: 2, TRIALING: 1 }) });
    const { container } = render(<Statistics />);

    expect(await screen.findByText('2 annulés')).toBeInTheDocument();
    expect(screen.getByText('1 en essai')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/undefined/);
  });
});
