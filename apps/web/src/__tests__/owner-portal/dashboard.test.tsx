import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../../pages/OwnerPortal/Dashboard';

/**
 * Tableau de bord propriétaire : en-tête commun, revenus en tête, et un échec de
 * chargement qui propose « Réessayer » au lieu d'une alerte sans issue.
 */

const getDashboard = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'xs', isMobile: true, isTablet: false, isDesktop: false })
}));
vi.mock('../../services/ownerPortalService', () => ({
  ownerPortalService: { getDashboard: (...args: unknown[]) => getDashboard(...args) }
}));

const DONNEES = {
  portfolioSummary: { total: 3, rented: 2, available: 1, inMaintenance: 0 },
  revenueMetrics: { currentMonth: 450000, currentYear: 3600000, lastMonth: 400000, lastYear: 0 },
  occupancyRate: 66.7,
  upcomingPayments: [],
  recentPayments: [],
  recentTickets: []
};

const T = { timeout: 8000 };

function renderPage() {
  return render(
    <AntApp>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  getDashboard.mockReset();
});

describe('Tableau de bord propriétaire', () => {
  it('affiche le titre de page et les revenus avant le patrimoine', async () => {
    getDashboard.mockResolvedValue({ data: { success: true, data: DONNEES } });
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' }, T)).toBeInTheDocument();
    const revenus = screen.getByText('Revenus ce mois');
    const biens = screen.getByText('Total propriétés');
    // Les revenus précèdent le décompte des biens dans l'ordre de lecture.
    expect(revenus.compareDocumentPosition(biens) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Aucune échéance à venir')).toBeInTheDocument();
  });

  it('propose de réessayer quand le chargement échoue, puis affiche les données', async () => {
    const user = userEvent.setup();
    getDashboard.mockRejectedValueOnce({ response: { data: { message: 'Service indisponible' } } });
    getDashboard.mockResolvedValue({ data: { success: true, data: DONNEES } });
    renderPage();
    expect(await screen.findByText('Service indisponible', undefined, T)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Revenus ce mois', undefined, T)).toBeInTheDocument();
    expect(getDashboard).toHaveBeenCalledTimes(2);
  });
});
