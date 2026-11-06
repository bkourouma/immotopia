import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';

/**
 * BUG-2026-11-04-052 : « Déclarer un paiement » gardait le montant d'une
 * échéance ouverte puis annulée. À la réouverture sans échéance, le formulaire
 * doit être vide.
 */

vi.mock('../../services/tenantPortalService', () => ({
  tenantPortalService: { declarePayment: vi.fn() }
}));

import PaymentDeclarationModal from '../../components/TenantPortal/PaymentDeclarationModal';

const DELAI = { timeout: 8000 };

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
    render(<Page />);
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
