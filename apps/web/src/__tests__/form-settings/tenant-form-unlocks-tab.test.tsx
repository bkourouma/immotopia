import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { TenantFormUnlocksTab } from '../../components/admin/tenant-detail/TenantFormUnlocksTab';

const getFormUnlocks = vi.fn();
const setFormUnlock = vi.fn();

vi.mock('../../services/form-settings-service', () => ({
  getFormUnlocks: (...a: unknown[]) => getFormUnlocks(...a),
  setFormUnlock: (...a: unknown[]) => setFormUnlock(...a)
}));

const entry = (fieldKey: string, unlocked: boolean) => ({
  formKey: 'syndic.declared-payment-manager',
  formLabel: 'Paiement déclaré (gestionnaire)',
  module: 'syndic',
  fieldKey,
  fieldLabel: `Champ ${fieldKey}`,
  consequence: 'Conséquence',
  unlocked
});

function renderTab() {
  return render(
    <AntApp>
      <TenantFormUnlocksTab tenantId="t1" />
    </AntApp>
  );
}

async function openForm() {
  const module = await screen.findByText(/syndic/i);
  fireEvent.click(module);
  fireEvent.click(await screen.findByText('Paiement déclaré (gestionnaire)'));
}

describe('TenantFormUnlocksTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFormUnlocks.mockResolvedValue([entry('a', false), entry('b', true)]);
    setFormUnlock.mockResolvedValue(undefined);
  });

  it("charge les déverrouillages de l'agence", async () => {
    renderTab();
    await waitFor(() => expect(getFormUnlocks).toHaveBeenCalledWith('t1'));
  });

  it('déverrouille un champ sans confirmation', async () => {
    renderTab();
    await openForm();
    fireEvent.click(await screen.findByRole('switch', { name: /Champ a/ }));
    await waitFor(() =>
      expect(setFormUnlock).toHaveBeenCalledWith('t1', {
        formKey: 'syndic.declared-payment-manager',
        fieldKey: 'a',
        unlocked: true
      })
    );
  });

  it('demande confirmation avant de verrouiller', async () => {
    renderTab();
    await openForm();
    fireEvent.click(await screen.findByRole('switch', { name: /Champ b/ }));
    expect(await screen.findByText(/comportement par défaut/)).toBeInTheDocument();
    expect(setFormUnlock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Verrouiller' }));
    await waitFor(() =>
      expect(setFormUnlock).toHaveBeenCalledWith('t1', {
        formKey: 'syndic.declared-payment-manager',
        fieldKey: 'b',
        unlocked: false
      })
    );
  });
});
