import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { SyndicMonthlyTracking } from '../../pages/syndics/SyndicMonthlyTracking';

/**
 * Suivi mensuel : recherche locale sur les lignes (n° de lot, copropriétaire,
 * statut sur au moins un mois) et pagination locale de 20 lots.
 */

const isDesktop = vi.hoisted(() => ({ value: true }));
const getMonthlyTracking = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: {},
    active: isDesktop.value ? 'lg' : 'xs',
    isMobile: !isDesktop.value,
    isTablet: false,
    isDesktop: isDesktop.value
  })
}));

vi.mock('../../services/syndic-lot-payment-service', async importActual => ({
  ...(await importActual<typeof import('../../services/syndic-lot-payment-service')>()),
  getMonthlyTracking: (...args: unknown[]) => getMonthlyTracking(...args)
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'tenant-1' } })
}));

const T = { timeout: 8000 };

type Status = 'NONE' | 'PAID' | 'PARTIAL' | 'DUE' | 'OVERDUE';

function lot(id: string, lotNumber: string, ownerName: string | null, first: Status = 'NONE') {
  return {
    lotId: id,
    lotNumber,
    ownerName,
    advance: 0,
    months: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      due: 0,
      paid: 0,
      status: (index === 0 ? first : 'NONE') as Status
    }))
  };
}

const reponse = (lots: unknown[]) => ({ year: 2026, currency: 'XOF', months: [], lots });

function renderPage() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/suivi-mensuel']}>
        <Routes>
          <Route path="/tenant/:tenantId/syndics/:syndicId/suivi-mensuel" element={<SyndicMonthlyTracking />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  isDesktop.value = true;
  getMonthlyTracking.mockReset();
});

describe('SyndicMonthlyTracking : recherche et pagination', () => {
  it('filtre les lignes à la saisie (n° de lot ou copropriétaire)', async () => {
    getMonthlyTracking.mockResolvedValue(
      reponse([lot('1', 'A-01', 'Awa Diop'), lot('2', 'B-02', 'Koffi Yao'), lot('3', 'C-03', null)])
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('A-01', undefined, T);
    expect(screen.getByText('B-02')).toBeTruthy();

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'koffi{enter}');

    await screen.findByText('B-02', undefined, T);
    expect(screen.queryByText('A-01')).toBeNull();
    expect(screen.queryByText('C-03')).toBeNull();
  });

  it('filtre par statut sur au moins un mois', async () => {
    getMonthlyTracking.mockResolvedValue(
      reponse([
        lot('1', 'A-01', 'Awa Diop', 'PAID'),
        lot('2', 'B-02', 'Koffi Yao', 'OVERDUE'),
        lot('3', 'C-03', 'Moi', 'NONE')
      ])
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('A-01', undefined, T);

    await user.click(within(screen.getByRole('search')).getByRole('combobox'));
    await user.click(await screen.findByTitle('En retard', undefined));

    await screen.findByText('B-02', undefined, T);
    expect(screen.queryByText('A-01')).toBeNull();
    expect(screen.queryByText('C-03')).toBeNull();
  });

  it('affiche « aucun résultat » avec un bouton pour effacer les critères', async () => {
    getMonthlyTracking.mockResolvedValue(reponse([lot('1', 'A-01', 'Awa Diop'), lot('2', 'B-02', 'Koffi Yao')]));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('A-01', undefined, T);

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'zzzz{enter}');

    const effacer = await screen.findAllByRole('button', { name: 'Effacer les critères' }, T);
    expect(screen.queryByText('A-01')).toBeNull();
    // La légende reste affichée : elle ne dépend pas de la liste filtrée.
    expect(screen.getByLabelText('Légende')).toBeTruthy();

    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('A-01', undefined, T)).toBeTruthy();
    expect(screen.getByText('B-02')).toBeTruthy();
  });

  it('pagine les lots par 20 sous la grille', async () => {
    const lots = Array.from({ length: 25 }, (_, index) =>
      lot(`l${index + 1}`, `LOT-${String(index + 1).padStart(2, '0')}`, 'Awa Diop')
    );
    getMonthlyTracking.mockResolvedValue(reponse(lots));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('LOT-01', undefined, T);
    expect(screen.getByText('LOT-20')).toBeTruthy();
    expect(screen.queryByText('LOT-21')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Page 2' }));

    await screen.findByText('LOT-21', undefined, T);
    expect(screen.getByText('LOT-25')).toBeTruthy();
    expect(screen.queryByText('LOT-01')).toBeNull();
  });

  it('sans lot : message d’absence de données, pas de barre de recherche', async () => {
    getMonthlyTracking.mockResolvedValue(reponse([]));
    renderPage();
    expect(await screen.findByText('Aucun lot pour cette copropriété.', undefined, T)).toBeTruthy();
    expect(screen.queryByRole('search')).toBeNull();
  });
});
