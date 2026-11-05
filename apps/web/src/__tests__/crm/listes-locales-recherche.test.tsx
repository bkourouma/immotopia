import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { TeamPerformanceTable } from '../../components/crm/dashboard/team/TeamPerformanceTable';
import { SavedSearchesList } from '../../components/crm/SavedSearchesList';

/**
 * Petites listes du CRM reçues en entier (lot DIV-A) : performance de l'équipe
 * et recherches sauvegardées. La barre n'apparaît qu'au-delà de 10 lignes
 * (en dessous, c'est un récapitulatif) ; recherche et pagination en local.
 */

const getSavedSearches = vi.fn();

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/contact-search.service', () => ({
  default: {
    getSavedSearches: (...a: unknown[]) => getSavedSearches(...a),
    deleteSavedSearch: vi.fn()
  }
}));

const T = { timeout: 8000 };

function membre(index: number) {
  return {
    userId: `u${index}`,
    userName: `Membre ${String(index).padStart(2, '0')}`,
    userEmail: `membre${index}@agence.ci`,
    activitiesCount: 10 + index,
    wonDealsCount: 30 - index,
    conversionRate: 15,
    avgResponseTimeHours: 2
  };
}

function equipe(n: number) {
  return {
    members: Array.from({ length: n }, (_, i) => membre(i + 1)),
    totalActivities: 100,
    totalWonDeals: 50,
    avgResponseTimeHours: 2
  };
}

function mount(element: React.ReactElement) {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/agence-1/crm/dashboard']}>
        <Routes>
          <Route path="/tenant/:tenantId/crm/dashboard" element={element} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Performance de l’équipe — recherche locale', () => {
  it('en dessous de 11 membres : pas de barre, c’est un récapitulatif', () => {
    mount(<TeamPerformanceTable data={equipe(5) as never} />);
    expect(screen.getByText('Membre 01')).toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });

  it('au-delà : barre, recherche par nom, rang conservé, pagination de 20', async () => {
    const user = userEvent.setup();
    mount(<TeamPerformanceTable data={equipe(25) as never} />);

    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByText('Membre 20')).toBeInTheDocument();
    expect(screen.queryByText('Membre 21')).not.toBeInTheDocument();

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'Membre 07');

    expect(await screen.findByText('1 résultat', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('Membre 20')).not.toBeInTheDocument();
    // Le rang reste celui du classement complet (7e).
    expect(screen.getByText('#7')).toBeInTheDocument();
  });
});

describe('Recherches sauvegardées — recherche locale', () => {
  const recherche = (n: number) => ({
    id: `s${n}`,
    name: `Recherche ${String(n).padStart(2, '0')}`,
    description: n === 12 ? 'Prospects Cocody' : null,
    filters: {},
    scope: 'PERSONAL',
    useCount: 1,
    lastUsedAt: null
  });

  it('quelques recherches : pas de barre', async () => {
    getSavedSearches.mockResolvedValue([recherche(1), recherche(2)]);
    mount(<SavedSearchesList onSelectSearch={vi.fn()} />);
    expect(await screen.findByText('Recherche 01', undefined, T)).toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });

  it('plus de dix recherches : barre, recherche sur le nom ou la description, pagination locale', async () => {
    const user = userEvent.setup();
    getSavedSearches.mockResolvedValue(Array.from({ length: 14 }, (_, i) => recherche(i + 1)));
    mount(<SavedSearchesList onSelectSearch={vi.fn()} />);

    expect(await screen.findByText('Recherche 01', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('Recherche 11')).not.toBeInTheDocument();

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'cocody');

    expect(await screen.findByText('1 résultat', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('Recherche 12')).toBeInTheDocument();
    expect(screen.queryByText('Recherche 01')).not.toBeInTheDocument();
  });
});
