import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChargeCallTable } from '../../components/syndics/ChargeCallTable';
import { ChargeCall } from '../../types/syndic-types';

/**
 * `<ChargeCallTable>` — colonne « Actions » : paiement (déjà couvert
 * ailleurs) et, depuis le lot S4, le bouton « Avis d'appel (PDF) ». Rendu réel
 * (pas de mock antd) : la table est petite, le rendu est rapide.
 */

const CHARGE: ChargeCall = {
  id: 'charge-1',
  syndicateId: 'syndic-1',
  lotId: 'lot-1',
  period: '2026-10',
  amount: 100000,
  currency: 'XOF',
  dueDate: '2026-10-16T00:00:00.000Z',
  status: 'PENDING',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z'
} as ChargeCall;

describe('<ChargeCallTable> — bouton avis d’appel (lot S4)', () => {
  it("n'affiche pas la colonne Actions sans callback", () => {
    render(<ChargeCallTable items={[CHARGE]} />);
    expect(screen.queryByText("Avis d'appel (PDF)")).not.toBeInTheDocument();
  });

  it("affiche le bouton et appelle onDownloadNotice avec l'appel concerné", () => {
    const onDownloadNotice = vi.fn();
    render(<ChargeCallTable items={[CHARGE]} onDownloadNotice={onDownloadNotice} />);

    const button = screen.getByRole('button', { name: /Avis d'appel \(PDF\)/ });
    fireEvent.click(button);

    expect(onDownloadNotice).toHaveBeenCalledWith(CHARGE);
  });

  it('affiche les deux actions côte à côte quand les deux callbacks sont fournis', () => {
    const onRecordPayment = vi.fn();
    const onDownloadNotice = vi.fn();
    render(<ChargeCallTable items={[CHARGE]} onRecordPayment={onRecordPayment} onDownloadNotice={onDownloadNotice} />);

    expect(screen.getByRole('button', { name: 'Enregistrer un paiement' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Avis d'appel \(PDF\)/ })).toBeInTheDocument();
  });
});
