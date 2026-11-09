import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { DELAI, avecClient, remplirOperateurEtReference } from './declared-payment-test-helpers';

/**
 * Déclaration de paiement du portail locataire, ouverte SANS échéance :
 * - plusieurs baux actifs : un sélecteur de bail obligatoire, `leaseId` envoyé ;
 * - un seul bail : aucun changement ;
 * - le refus d'un caractère dit comment s'en sortir (effacer le montant).
 */

const declarePayment = vi.fn();
const getLeases = vi.fn();
vi.mock('../../services/tenantPortalService', () => ({
  tenantPortalService: {
    declarePayment: (...a: unknown[]) => declarePayment(...a),
    getLeases: (...a: unknown[]) => getLeases(...a)
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

const BAUX = [
  { id: 'bail-1', leaseNumber: 'BAIL-001', propertyAddress: 'Cocody' },
  { id: 'bail-2', leaseNumber: 'BAIL-002', propertyAddress: 'Marcory' }
];

function monter(props: Partial<React.ComponentProps<typeof PaymentDeclarationModal>> = {}) {
  return render(
    avecClient(
      <AntApp>
        <PaymentDeclarationModal open onCancel={vi.fn()} onSuccess={vi.fn()} {...props} />
      </AntApp>
    )
  );
}

beforeEach(() => {
  declarePayment.mockReset();
  declarePayment.mockResolvedValue({ data: { data: {} } });
  getLeases.mockReset();
});

describe('Déclaration de paiement — choix du bail', () => {
  it('plusieurs baux, sans échéance : bail obligatoire, leaseId envoyé', async () => {
    getLeases.mockResolvedValue({ data: { data: BAUX } });
    monter();
    const user = userEvent.setup({ delay: null });
    const champ = (await screen.findAllByRole('spinbutton', {}, DELAI))[0];
    await screen.findByText('Bail concerné', {}, DELAI);
    await remplirOperateurEtReference(user);
    await user.type(champ, '150000');

    await user.click(screen.getByRole('button', { name: 'Déclarer le paiement' }));
    expect(await screen.findByText('Le bail concerné est requis', {}, DELAI)).toBeInTheDocument();
    expect(declarePayment).not.toHaveBeenCalled();

    await user.click(screen.getByRole('combobox', { name: /Bail concerné/ }));
    await user.click(await screen.findByText('BAIL-002 — Marcory', {}, DELAI));
    await user.click(screen.getByRole('button', { name: 'Déclarer le paiement' }));

    await waitFor(() => expect(declarePayment).toHaveBeenCalled(), DELAI);
    expect(declarePayment.mock.calls[0][1]).toBe('bail-2');
  });

  it('un seul bail : pas de sélecteur, pas de leaseId', async () => {
    getLeases.mockResolvedValue({ data: { data: [BAUX[0]] } });
    monter();
    const user = userEvent.setup({ delay: null });
    const champ = (await screen.findAllByRole('spinbutton', {}, DELAI))[0];
    await waitFor(() => expect(getLeases).toHaveBeenCalled(), DELAI);
    expect(screen.queryByText('Bail concerné')).toBeNull();
    await remplirOperateurEtReference(user);
    await user.type(champ, '1000');
    await user.click(screen.getByRole('button', { name: 'Déclarer le paiement' }));
    await waitFor(() => expect(declarePayment).toHaveBeenCalled(), DELAI);
    expect(declarePayment.mock.calls[0][1]).toBeUndefined();
  });

  it('avec une échéance : aucun sélecteur et aucune lecture des baux', async () => {
    getLeases.mockResolvedValue({ data: { data: BAUX } });
    monter({ installmentId: 'ech-1', defaultAmount: 5000 });
    await screen.findAllByRole('spinbutton', {}, DELAI);
    expect(getLeases).not.toHaveBeenCalled();
    expect(screen.queryByText('Bail concerné')).toBeNull();
  });
});

describe('Déclaration de paiement — caractère refusé', () => {
  it('le message dit d’effacer le montant puis de le ressaisir', async () => {
    getLeases.mockResolvedValue({ data: { data: [] } });
    monter();
    const user = userEvent.setup({ delay: null });
    const champ = (await screen.findAllByRole('spinbutton', {}, DELAI))[0];
    await user.type(champ, '1e9');
    expect(await screen.findByText(/effacez le montant puis saisissez-le de nouveau/, {}, DELAI)).toBeInTheDocument();
  });
});
