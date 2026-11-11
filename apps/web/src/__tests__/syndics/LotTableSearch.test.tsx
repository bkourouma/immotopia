import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { LotTable } from '../../components/syndics/LotTable';
import type { SyndicateLot } from '../../types/syndic-types';

/**
 * Tableau des lots : liste reçue en entier, recherche multicritères LOCALE
 * (champ libre, type, portail, occupé, actif) et pagination locale (20).
 */

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

function Url() {
  return <div data-testid="url">{decodeURIComponent(useLocation().search)}</div>;
}

function lot(overrides: Partial<SyndicateLot> & { id: string; lotNumber: string }): SyndicateLot {
  return {
    syndicateId: 'syndic-1',
    lotType: 'APARTMENT',
    generalShares: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  } as SyndicateLot;
}

const LOTS: SyndicateLot[] = [
  lot({
    id: 'l1',
    lotNumber: 'A-101',
    ownersLabel: 'Fabrice Aka',
    portalAccess: { status: 'ACTIVE', activeCount: 1, ownerCount: 1 },
    tenantAssignments: [
      {
        id: 'ta1',
        tenantId: 'c9',
        startDate: '2026-01-01',
        isActive: true,
        contact: { id: 'c9', firstName: 'Mariam', lastName: 'Touré' }
      }
    ]
  }),
  lot({
    id: 'l2',
    lotNumber: 'B-202',
    ownersLabel: 'Awa Koné',
    portalAccess: { status: 'NONE', activeCount: 0, ownerCount: 0 }
  }),
  lot({ id: 'l3', lotNumber: 'P-01', lotType: 'PARKING', ownersLabel: 'Awa Koné', generalShares: 0 })
];

const T = { timeout: 8000 };

function mount(lots: SyndicateLot[] = LOTS, search = '') {
  return render(
    <MemoryRouter initialEntries={[`/lots${search}`]}>
      <Url />
      <LotTable lots={lots} />
    </MemoryRouter>
  );
}

describe('LotTable : recherche multicritères locale', () => {
  it('le champ libre trouve un lot par son propriétaire, sans accent ni casse', async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.getByText('A-101')).toBeInTheDocument();
    expect(screen.getByText('B-202')).toBeInTheDocument();

    await user.type(
      within(screen.getByRole('search', { name: 'Rechercher dans les lots' })).getByRole('textbox'),
      'KONE'
    );
    await vi.waitFor(() => expect(screen.queryByText('A-101')).not.toBeInTheDocument(), T);
    expect(screen.getByText('B-202')).toBeInTheDocument();
    expect(screen.getByText('P-01')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('q=KONE');
  });

  it('le champ libre trouve un lot par son locataire', async () => {
    const user = userEvent.setup();
    mount();
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'toure');
    await vi.waitFor(() => expect(screen.queryByText('B-202')).not.toBeInTheDocument(), T);
    expect(screen.getByText('A-101')).toBeInTheDocument();
  });

  it('le critère « Type » filtre les lignes', () => {
    mount(LOTS, '?lotType=PARKING');
    expect(screen.getByText('P-01')).toBeInTheDocument();
    expect(screen.queryByText('A-101')).not.toBeInTheDocument();
    expect(screen.queryByText('B-202')).not.toBeInTheDocument();
  });

  it('le critère « Portail » filtre sur le statut d’accès', () => {
    mount(LOTS, '?portal=ACTIVE');
    expect(screen.getByText('A-101')).toBeInTheDocument();
    expect(screen.queryByText('B-202')).not.toBeInTheDocument();
    expect(screen.queryByText('P-01')).not.toBeInTheDocument();
  });

  it('le critère « Locataire » distingue lots occupés et non occupés', () => {
    const { unmount } = mount(LOTS, '?tenant=1');
    expect(screen.getByText('A-101')).toBeInTheDocument();
    expect(screen.queryByText('B-202')).not.toBeInTheDocument();
    unmount();

    mount(LOTS, '?tenant=0');
    expect(screen.queryByText('A-101')).not.toBeInTheDocument();
    expect(screen.getByText('B-202')).toBeInTheDocument();
  });

  it('le critère « Statut du lot » sépare actifs et inactifs (tantièmes à 0)', () => {
    mount(LOTS, '?active=0');
    expect(screen.getByText('P-01')).toBeInTheDocument();
    expect(screen.queryByText('A-101')).not.toBeInTheDocument();
  });

  it('aucun résultat : la barre propose d’effacer les critères', async () => {
    const user = userEvent.setup();
    mount(LOTS, '?lotType=CELLAR');
    expect(await screen.findByText('Aucun résultat', undefined, T)).toBeInTheDocument();
    const clear = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(clear[clear.length - 1]);
    expect(await screen.findByText('A-101', undefined, T)).toBeInTheDocument();
  });

  it('un préfixe d’URL isole la recherche du tableau', () => {
    render(
      <MemoryRouter initialEntries={['/fiche?lo.lotType=PARKING&lotType=APARTMENT']}>
        <LotTable lots={LOTS} paramPrefix="lo" ariaLabel="Rechercher dans les lots de la fiche" />
      </MemoryRouter>
    );
    expect(screen.getByRole('search', { name: 'Rechercher dans les lots de la fiche' })).toBeInTheDocument();
    expect(screen.getByText('P-01')).toBeInTheDocument();
    expect(screen.queryByText('A-101')).not.toBeInTheDocument();
  });

  it('sans lot : message « Aucun lot enregistré »', () => {
    mount([]);
    expect(screen.getByText('Aucun lot enregistré')).toBeInTheDocument();
  });

  it('pagine localement par 20', async () => {
    const many = Array.from({ length: 45 }, (_, index) =>
      lot({ id: `m${index}`, lotNumber: `L-${String(index + 1).padStart(3, '0')}` })
    );
    const user = userEvent.setup();
    mount(many);
    expect(screen.getByText('L-020')).toBeInTheDocument();
    expect(screen.queryByText('L-021')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(await screen.findByText('L-045', undefined, T)).toBeInTheDocument();
  });
});
