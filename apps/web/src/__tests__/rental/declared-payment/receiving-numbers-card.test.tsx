import React from 'react';
import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RentalReceivingNumberDto } from '../../../types/rental-declared-payment';

const listRentalReceivingNumbers = vi.fn();
const createRentalReceivingNumber = vi.fn();
const updateRentalReceivingNumber = vi.fn();
const deleteRentalReceivingNumber = vi.fn();
const useMyMenuAccess = vi.fn();

vi.mock('../../../services/rental-declared-payment-service', () => ({
  listRentalReceivingNumbers: (...a: unknown[]) => listRentalReceivingNumbers(...a),
  createRentalReceivingNumber: (...a: unknown[]) => createRentalReceivingNumber(...a),
  updateRentalReceivingNumber: (...a: unknown[]) => updateRentalReceivingNumber(...a),
  deleteRentalReceivingNumber: (...a: unknown[]) => deleteRentalReceivingNumber(...a)
}));

vi.mock('../../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: (...a: unknown[]) => useMyMenuAccess(...a)
}));

import { ReceivingNumbersCard } from '../../../components/rental/declared-payment/ReceivingNumbersCard';

const NUMBER: RentalReceivingNumberDto = {
  id: 'n1',
  operator: 'ORANGE',
  phone: '+2250707070707',
  label: 'Caisse principale',
  active: true,
  treasuryAccountId: 'acc1',
  treasuryAccountNumber: '5522',
  declarationsCount: 3,
  pendingDeclarations: 2,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z'
};

const renderCard = () =>
  render(
    <App>
      <ReceivingNumbersCard tenantId="t1" />
    </App>
  );

beforeEach(() => {
  vi.clearAllMocks();
  listRentalReceivingNumbers.mockResolvedValue([NUMBER]);
  useMyMenuAccess.mockReturnValue({ permissions: null, ready: true });
});

describe('ReceivingNumbersCard (locatif)', () => {
  it('affiche la liste des numéros', async () => {
    renderCard();
    expect(await screen.findByText('+225 07 07 07 07 07')).toBeInTheDocument();
    expect(screen.getByText('Orange Money')).toBeInTheDocument();
    expect(screen.getByText('Caisse principale')).toBeInTheDocument();
    expect(screen.getByText('Compte 5522')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('ajoute un numéro avec le bon corps', async () => {
    createRentalReceivingNumber.mockResolvedValue(NUMBER);
    renderCard();
    await screen.findByText('+225 07 07 07 07 07');
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un numéro/ }));
    const phone = await screen.findByLabelText('Numéro de téléphone');
    fireEvent.change(phone, { target: { value: '05 05 05 05 05' } });
    fireEvent.change(screen.getByLabelText('Libellé (facultatif)'), { target: { value: ' Agence nord ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(createRentalReceivingNumber).toHaveBeenCalledWith('t1', {
        operator: 'ORANGE',
        phone: '05 05 05 05 05',
        label: 'Agence nord',
        active: true
      })
    );
  });

  it('affiche le message de désactivation douce à la suppression', async () => {
    deleteRentalReceivingNumber.mockResolvedValue({ id: 'n1', deleted: false, deactivated: true });
    renderCard();
    await screen.findByText('+225 07 07 07 07 07');
    fireEvent.click(screen.getByRole('button', { name: /Supprimer/ }));
    const confirmButtons = await screen.findAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(deleteRentalReceivingNumber).toHaveBeenCalledWith('t1', 'n1'));
    expect(
      await screen.findByText('Numéro de réception désactivé car des déclarations y sont liées')
    ).toBeInTheDocument();
  });

  it('affiche le message de suppression définitive', async () => {
    deleteRentalReceivingNumber.mockResolvedValue({ id: 'n1', deleted: true, deactivated: false });
    renderCard();
    await screen.findByText('+225 07 07 07 07 07');
    fireEvent.click(screen.getByRole('button', { name: /Supprimer/ }));
    const confirmButtons = await screen.findAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    expect(await screen.findByText('Numéro de réception supprimé')).toBeInTheDocument();
  });

  it('masque tout bouton d’écriture sans RENTAL_PAYMENTS_ALLOCATE', async () => {
    useMyMenuAccess.mockReturnValue({ permissions: new Set(['RENTAL_PAYMENTS_VIEW']), ready: true });
    renderCard();
    await screen.findByText('+225 07 07 07 07 07');
    expect(screen.queryByRole('button', { name: /Ajouter un numéro/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Modifier/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('affiche une erreur discrète quand la lecture est refusée', async () => {
    listRentalReceivingNumbers.mockRejectedValue({ response: { data: { message: 'Accès refusé' } } });
    renderCard();
    expect(await screen.findByText('Accès refusé')).toBeInTheDocument();
  });
});
