import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChargeCallTable } from '../../components/syndics/ChargeCallTable';
import { ChargeCall } from '../../types/syndic-types';

/**
 * `<ChargeCallTable>` sous 992 px : les appels s'affichent en cartes (une action visible, le reste
 * derrière « Autres actions ») au lieu d'un tableau à défilement horizontal.
 */

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'xs', isMobile: true, isTablet: false, isDesktop: false })
}));

// Le bouton « Exporter » a ses propres tests.
vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

const CHARGE = {
  id: 'charge-1',
  syndicateId: 'syndic-1',
  lotId: 'lot-1',
  period: '2026-10',
  amount: 100000,
  currency: 'XOF',
  dueDate: '2020-10-16T00:00:00.000Z',
  status: 'PENDING',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z'
} as ChargeCall;

const PAGINATION = { page: 1, limit: 20, total: 1, onChange: vi.fn() };

describe('<ChargeCallTable> — cartes mobiles', () => {
  it('affiche une carte par appel avec son statut en toutes lettres', () => {
    render(<ChargeCallTable items={[CHARGE]} pagination={PAGINATION} />);

    expect(screen.getByRole('list', { name: 'Appels de charges' })).toBeInTheDocument();
    expect(screen.getByText('2026-10')).toBeInTheDocument();
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it("garde « Enregistrer un paiement » visible et appelle le callback avec l'appel", () => {
    const onRecordPayment = vi.fn();
    render(<ChargeCallTable items={[CHARGE]} pagination={PAGINATION} onRecordPayment={onRecordPayment} />);

    fireEvent.click(screen.getByRole('button', { name: /Enregistrer un paiement/ }));

    expect(onRecordPayment).toHaveBeenCalledWith(CHARGE);
  });

  it("n'offre plus le paiement sur un appel soldé", () => {
    const solde = { ...CHARGE, status: 'PAID' } as ChargeCall;
    render(<ChargeCallTable items={[solde]} pagination={PAGINATION} onRecordPayment={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Enregistrer un paiement/ })).not.toBeInTheDocument();
  });

  it('range les autres actions derrière « Autres actions »', () => {
    render(<ChargeCallTable items={[CHARGE]} pagination={PAGINATION} onDownloadNotice={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Autres actions' })).toBeInTheDocument();
  });

  it('dit que la liste est vide et indique comment créer un appel', () => {
    render(<ChargeCallTable items={[]} pagination={{ ...PAGINATION, total: 0 }} />);

    expect(screen.getByText(/créez le premier avec « Nouvel appel de charges »/)).toBeInTheDocument();
  });
});
