import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { DELAI, avecClient, remplirOperateurEtReference } from './declared-payment-test-helpers';

/**
 * BUG-2026-11-04-043 : dans la déclaration de paiement du portail locataire,
 * « -1 », « 1e9 » et « 0,01 » devenaient 1, 19 et 1 en silence, puis étaient
 * enregistrés. Un montant invalide est désormais refusé avec un message, et la
 * virgule décimale est comprise. Spec 049 : l'API attend un montant entier en
 * FCFA, une décimale est donc refusée avec un message (jamais arrondie).
 */

const declarePayment = vi.fn();
vi.mock('../../services/tenantPortalService', () => ({
  tenantPortalService: {
    declarePayment: (...a: unknown[]) => declarePayment(...a),
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

function monter() {
  return render(
    avecClient(
      <AntApp>
        <PaymentDeclarationModal open onCancel={vi.fn()} onSuccess={vi.fn()} />
      </AntApp>
    )
  );
}

async function declarer(saisie: string, complet = false) {
  monter();
  const user = userEvent.setup({ delay: null });
  const champ = (await screen.findAllByRole('spinbutton', {}, DELAI))[0];
  if (complet) await remplirOperateurEtReference(user);
  await user.type(champ, saisie);
  await user.click(screen.getByRole('button', { name: 'Déclarer le paiement' }));
  return champ as HTMLInputElement;
}

beforeEach(() => {
  declarePayment.mockReset();
  declarePayment.mockResolvedValue({ data: { data: {} } });
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

  it('lit « 1500,5 » comme 1 500,50 et le refuse : seul un montant entier est accepté', async () => {
    await declarer('1500,5', true);
    expect(await screen.findByText('Saisissez un montant entier en FCFA.', {}, DELAI)).toBeInTheDocument();
    expect(declarePayment).not.toHaveBeenCalled();
  });

  it('lit « 0,01 » comme 0,01 (et non 1) et le refuse comme décimal', async () => {
    await declarer('0,01', true);
    expect(await screen.findByText('Saisissez un montant entier en FCFA.', {}, DELAI)).toBeInTheDocument();
    expect(declarePayment).not.toHaveBeenCalled();
  });

  it('refuse un montant au-dessus du plafond de la déclaration', async () => {
    await declarer('6000000', true);
    expect(await screen.findByText(/ne peut pas dépasser/, {}, DELAI)).toBeInTheDocument();
    expect(declarePayment).not.toHaveBeenCalled();
  });

  it('envoie un montant entier valide tel quel', async () => {
    await declarer('1500', true);
    await waitFor(() => expect(declarePayment).toHaveBeenCalled(), DELAI);
    expect((declarePayment.mock.calls[0][0] as FormData).get('amount')).toBe('1500');
  });
});
