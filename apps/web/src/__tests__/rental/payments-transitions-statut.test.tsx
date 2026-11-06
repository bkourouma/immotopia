import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { PaymentDetailPage } from '../../pages/rental/PaymentDetailPage';
import { statutsAtteignables } from '../../lib/rental-payment-status';

/**
 * Détail d'un paiement — le sélecteur de statut ne propose que des
 * changements que l'API accepte.
 *
 * L'API refuse tout autre changement par un 409 (« Un paiement « X » ne peut
 * pas passer à « Y » »). Les proposer à l'écran, c'est inviter à l'échec :
 * depuis « Remboursé » il n'y a plus aucune issue, et un paiement encaissé ne
 * revient jamais « En attente ».
 */

const getPayment = vi.fn();

vi.mock('../../services/rental-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/rental-service')>();
  return {
    ...actual,
    getPayment: (...a: unknown[]) => getPayment(...a),
    updatePaymentStatus: vi.fn(),
    allocatePayment: vi.fn()
  };
});

vi.mock('../../components/rental/AllocatePaymentForm', () => ({
  AllocatePaymentForm: () => <div>formulaire d’affectation</div>
}));

let permissionsDetenues: Set<string> | null = null;
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set<string>(), permissions: permissionsDetenues })
}));

const DELAI = { timeout: 8000 };

function paiement(status: string) {
  return {
    id: 'pay-1',
    tenant_id: 'agence-1',
    lease_id: 'bail-1',
    amount: 300_000,
    currency: 'XOF',
    method: 'CASH',
    status,
    initiated_at: '2026-05-06T09:30:00.000Z',
    succeeded_at: null,
    allocations: [],
    depositMovements: [],
    created_at: '',
    updated_at: ''
  };
}

async function monter(status: string) {
  getPayment.mockResolvedValue({ success: true, data: paiement(status) });
  render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/agence-1/rental/payments/pay-1']}>
        <Routes>
          <Route path="/tenant/:tenantId/rental/payments/:paymentId" element={<PaymentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
  await screen.findByText('Détails du paiement', {}, DELAI);
}

/** Libellés des options du sélecteur de statut une fois ouvert. */
async function optionsProposees(): Promise<string[]> {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  await waitFor(() => expect(document.querySelector('.ant-select-item-option')).not.toBeNull(), DELAI);
  return Array.from(document.querySelectorAll('.ant-select-item-option-content')).map(o => o.textContent ?? '');
}

beforeEach(() => {
  vi.clearAllMocks();
  permissionsDetenues = null;
});

describe('statutsAtteignables', () => {
  it('reprend exactement les changements permis par l’API', () => {
    expect(statutsAtteignables('PENDING')).toEqual(['SUCCESS', 'FAILED', 'CANCELED']);
    expect(statutsAtteignables('SUCCESS')).toEqual(['CANCELED', 'FAILED']);
    expect(statutsAtteignables('FAILED')).toEqual(['SUCCESS']);
    expect(statutsAtteignables('CANCELED')).toEqual(['SUCCESS']);
    expect(statutsAtteignables('PARTIALLY_REFUNDED')).toEqual(['REFUNDED', 'CANCELED']);
    expect(statutsAtteignables('REFUNDED')).toEqual([]);
    expect(statutsAtteignables('INCONNU')).toEqual([]);
  });
});

describe('Détail d’un paiement — statuts proposés', () => {
  it('« En attente » : réussi, échoué ou annulé', async () => {
    await monter('PENDING');
    expect(await optionsProposees()).toEqual(['En attente', 'Réussi', 'Échoué', 'Annulé']);
  });

  it('« Réussi » : jamais de retour à « En attente »', async () => {
    await monter('SUCCESS');
    const options = await optionsProposees();
    expect(options).not.toContain('En attente');
    expect(options).toEqual(['Réussi', 'Annulé', 'Échoué']);
  });

  it('« Annulé » : seulement la réactivation en « Réussi »', async () => {
    await monter('CANCELED');
    expect(await optionsProposees()).toEqual(['Annulé', 'Réussi']);
  });

  it('« Échoué » : seulement la réactivation en « Réussi »', async () => {
    await monter('FAILED');
    expect(await optionsProposees()).toEqual(['Échoué', 'Réussi']);
  });

  it('« Partiellement remboursé » : remboursé ou annulé', async () => {
    await monter('PARTIALLY_REFUNDED');
    expect(await optionsProposees()).toEqual(['Partiellement remboursé', 'Remboursé', 'Annulé']);
  });

  it('« Remboursé » est définitif : le sélecteur affiche le statut mais n’offre aucune issue', async () => {
    await monter('REFUNDED');
    const selecteur = screen.getByRole('combobox');
    expect(selecteur).toBeDisabled();
    // Le statut courant reste lisible dans le sélecteur, avec son libellé et non son code.
    expect(document.querySelector('.ant-select-content')?.textContent).toContain('Remboursé');
    expect(document.querySelector('.ant-select-content')?.textContent).not.toContain('REFUNDED');
  });

  it('sans le droit d’affecter, le sélecteur reste désactivé', async () => {
    permissionsDetenues = new Set(['RENTAL_PAYMENTS_VIEW']);
    await monter('PENDING');
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});

describe('Détail d’un paiement — montant disponible (BUG-2026-11-04-040)', () => {
  /** Valeur affichée en face du libellé « Montant disponible » du cadre financier. */
  const montantDisponible = () =>
    screen.getByText('Montant disponible').closest('.ant-descriptions-row')?.textContent ?? '';

  it('un paiement annulé n’a rien de disponible', async () => {
    await monter('CANCELED');
    // Le libellé et la valeur sont collés (« Montant disponible0 F CFA ») : pas de frontière de mot.
    expect(montantDisponible()).toMatch(/(^|\D)0(\D|$)/);
    expect(montantDisponible()).not.toMatch(/300\D000/);
  });

  it('un paiement échoué n’a rien de disponible', async () => {
    await monter('FAILED');
    expect(montantDisponible()).toMatch(/(^|\D)0(\D|$)/);
    expect(montantDisponible()).not.toMatch(/300\D000/);
  });

  it('un paiement réussi non affecté garde tout son montant disponible', async () => {
    await monter('SUCCESS');
    expect(montantDisponible()).toMatch(/300\D000/);
  });
});
