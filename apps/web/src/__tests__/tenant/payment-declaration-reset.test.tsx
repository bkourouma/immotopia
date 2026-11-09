import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { DELAI, avecClient } from './declared-payment-test-helpers';

/**
 * BUG-2026-11-04-052 : « Déclarer un paiement » gardait le montant d'une
 * échéance ouverte puis annulée. À la réouverture sans échéance, le formulaire
 * doit être vide.
 */

vi.mock('../../services/tenantPortalService', () => ({
  tenantPortalService: {
    declarePayment: vi.fn(),
    getLeases: vi.fn().mockResolvedValue({ data: { data: [] } })
  }
}));
vi.mock('../../services/tenant-portal-declared-payment-service', async importOriginal => {
  const original = await importOriginal<typeof import('../../services/tenant-portal-declared-payment-service')>();
  return {
    ...original,
    getDeclaredPaymentAvailability: vi.fn().mockResolvedValue({
      enabled: true,
      available: true,
      receivingNumbers: [{ id: 'rn1', operator: 'ORANGE', phone: '+2250707070707', label: null }],
      proofRequired: false,
      aiPrefillAvailable: false,
      maxAmount: 5000000,
      instructions: null
    }),
    readPaymentProof: vi.fn()
  };
});

import PaymentDeclarationModal from '../../components/TenantPortal/PaymentDeclarationModal';

function Page() {
  const [open, setOpen] = useState(false);
  const [echeance, setEcheance] = useState<{ balance: number; period: string } | null>(null);
  return (
    <AntApp>
      <button
        onClick={() => {
          setEcheance({ balance: 120000, period: '2026-10' });
          setOpen(true);
        }}
      >
        ouvrir-echeance
      </button>
      <button
        onClick={() => {
          setEcheance(null);
          setOpen(true);
        }}
      >
        ouvrir-libre
      </button>
      <PaymentDeclarationModal
        open={open}
        defaultAmount={echeance?.balance}
        installmentLabel={echeance?.period}
        onCancel={() => setOpen(false)}
        onSuccess={vi.fn()}
      />
    </AntApp>
  );
}

describe('Déclaration de paiement — réouverture', () => {
  it("repart d'un montant vide après une échéance annulée", async () => {
    render(avecClient(<Page />));
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByText('ouvrir-echeance'));
    const champ = (await screen.findAllByRole('spinbutton', {}, DELAI))[0] as HTMLInputElement;
    await waitFor(() => expect(champ.value).not.toBe(''), DELAI);

    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    await user.click(screen.getByText('ouvrir-libre'));
    await waitFor(() => {
      const champs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
      expect(champs).toHaveLength(1);
      expect(champs[0].value).toBe('');
    }, DELAI);
  });
});
