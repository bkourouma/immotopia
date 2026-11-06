import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';

/**
 * BUG-2026-11-04-043 : dans la déclaration de paiement du portail locataire,
 * « -1 », « 1e9 » et « 0,01 » devenaient 1, 19 et 1 en silence, puis étaient
 * enregistrés. Un montant invalide est désormais refusé avec un message, et la
 * virgule décimale est comprise.
 */

const declarePayment = vi.fn();
vi.mock('../../services/tenantPortalService', () => ({
  tenantPortalService: { declarePayment: (...a: unknown[]) => declarePayment(...a) }
}));

import PaymentDeclarationModal from '../../components/TenantPortal/PaymentDeclarationModal';

const DELAI = { timeout: 8000 };

function monter() {
  return render(
    <AntApp>
      <PaymentDeclarationModal open onCancel={vi.fn()} onSuccess={vi.fn()} />
    </AntApp>
  );
}

async function declarer(saisie: string) {
  monter();
  const user = userEvent.setup({ delay: null });
  const champ = (await screen.findAllByRole('spinbutton', {}, DELAI))[0];
  await user.type(champ, saisie);
  await user.click(screen.getByRole('button', { name: 'Déclarer le paiement' }));
  return champ as HTMLInputElement;
}

beforeEach(() => {
  declarePayment.mockReset();
  declarePayment.mockResolvedValue({});
});

describe('Déclaration de paiement — montant', () => {
  it('refuse « -1 » avec un message, sans rien envoyer', async () => {
    await declarer('-1');
    expect(await screen.findByText('Le montant doit être positif', {}, DELAI)).toBeInTheDocument();
    expect(declarePayment).not.toHaveBeenCalled();
  });

  it('refuse « 1e9 » : la lettre est rejetée avec un message, rien n’est envoyé', async () => {
    await declarer('1e9');
    expect(await screen.findByText(/ne doit contenir que des chiffres/, {}, DELAI)).toBeInTheDocument();
    expect(declarePayment).not.toHaveBeenCalled();
  });

  it('lit « 1500,5 » comme 1 500,50 et l’envoie tel quel', async () => {
    await declarer('1500,5');
    await waitFor(() => expect(declarePayment).toHaveBeenCalled(), DELAI);
    const formData = declarePayment.mock.calls[0][0] as FormData;
    expect(formData.get('amount')).toBe('1500.5');
  });

  it('lit « 0,01 » comme 0,01 (et non 1)', async () => {
    await declarer('0,01');
    await waitFor(() => expect(declarePayment).toHaveBeenCalled(), DELAI);
    expect((declarePayment.mock.calls[0][0] as FormData).get('amount')).toBe('0.01');
  });
});
