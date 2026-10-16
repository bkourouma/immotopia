import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { GatewayConfigCard } from '../../../components/syndics/online-payment/GatewayConfigCard';
import { ReviewDecisionModal } from '../../../components/syndics/online-payment/ReviewDecisionModal';
import { PayoutsPanel } from '../../../components/syndics/online-payment/PayoutsPanel';
import type { SyndicOnlineCheckoutRow } from '../../../services/syndic-online-payment-service';

/**
 * Écrans gestionnaire du paiement mobile des charges (spec 042, M5).
 * Le service est mocké en entier : chaque export utilisé par les composants
 * doit figurer ci-dessous, Vitest refusant tout import non déclaré.
 */

const getSyndicGatewaySettings = vi.fn();
const updateSyndicGatewaySettings = vi.fn();
const testSyndicGatewayConnection = vi.fn();
const getSyndicProviderBalance = vi.fn();
const decideSyndicOnlineCheckout = vi.fn();
const listSyndicGatewayPayouts = vi.fn();
const recordSyndicGatewayPayout = vi.fn();

vi.mock('../../../services/syndic-online-payment-service', () => ({
  getSyndicGatewaySettings: (...a: unknown[]) => getSyndicGatewaySettings(...a),
  updateSyndicGatewaySettings: (...a: unknown[]) => updateSyndicGatewaySettings(...a),
  testSyndicGatewayConnection: (...a: unknown[]) => testSyndicGatewayConnection(...a),
  getSyndicProviderBalance: (...a: unknown[]) => getSyndicProviderBalance(...a),
  decideSyndicOnlineCheckout: (...a: unknown[]) => decideSyndicOnlineCheckout(...a),
  listSyndicGatewayPayouts: (...a: unknown[]) => listSyndicGatewayPayouts(...a),
  recordSyndicGatewayPayout: (...a: unknown[]) => recordSyndicGatewayPayout(...a)
}));

const SETTINGS = {
  syndicateId: 's1',
  provider: 'PAYSECUREHUB' as const,
  mode: 'SIMULATOR' as const,
  isActive: false,
  merchantId: 'MARCHAND-1',
  apiKeyConfigured: true,
  apiKeyLast4: '1234',
  usable: false,
  callbackUrl: 'https://api.example.com/api/payment-gateway/paysecurehub/ipn',
  simulatorAvailable: true,
  encryptionAvailable: true,
  lastTest: null,
  agencyFeesPaidBy: 'CLIENT' as const,
  collectionAccount: { accountNumber: '5525' as const, exists: true, balance: 150000 },
  updatedAt: null
};

function review(kind: SyndicOnlineCheckoutRow['reviewKind'], lateSuccess = false): SyndicOnlineCheckoutRow {
  return {
    id: 'co-1',
    codePaiement: 'IMS-ABCDEFGHIJ0123456789',
    status: 'REVIEW',
    origin: 'PORTAL',
    mode: 'LIVE',
    amount: 50000,
    receivedAmount: 45000,
    currency: 'XOF',
    lot: { id: 'lot-1', lotNumber: 'A12' },
    payer: { contactId: 'c1', name: 'Awa Koné' },
    chargeCalls: [{ id: 'cc-1', period: 'T3 2026' }],
    providerServiceName: 'Wave',
    providerTransactionId: 'TX-1',
    providerFees: null,
    failureMessage: null,
    reviewKind: kind,
    reviewReason: 'Montant différent',
    resolution: null,
    resolutionNote: null,
    resolvedAt: null,
    resolvedByName: null,
    chargePaymentId: kind === 'CONTRARY_STATE' && !lateSuccess ? 'pay-1' : null,
    lastCheckedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    completedAt: null
  };
}

function wrap(node: React.ReactNode) {
  return render(<AntApp>{node}</AntApp>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSyndicProviderBalance.mockResolvedValue({ available: false, balance: null, message: 'Mode simulateur' });
});

describe('GatewayConfigCard', () => {
  it('ne préremplit jamais la clé et affiche seulement ses 4 derniers caractères', async () => {
    getSyndicGatewaySettings.mockResolvedValue(SETTINGS);
    wrap(<GatewayConfigCard tenantId="t1" syndicId="s1" canEditSettings />);

    const field = (await screen.findByPlaceholderText('•••• 1234')) as HTMLInputElement;
    expect(field.value).toBe('');
    expect(field.disabled).toBe(true);
  });

  it("n'envoie pas la clé tant qu'elle n'est pas remplacée", async () => {
    getSyndicGatewaySettings.mockResolvedValue(SETTINGS);
    updateSyndicGatewaySettings.mockResolvedValue(SETTINGS);
    wrap(<GatewayConfigCard tenantId="t1" syndicId="s1" canEditSettings />);

    await screen.findByPlaceholderText('•••• 1234');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateSyndicGatewaySettings).toHaveBeenCalled());
    const [tenantId, syndicId, payload] = updateSyndicGatewaySettings.mock.calls[0];
    expect([tenantId, syndicId]).toEqual(['t1', 's1']);
    expect(payload).not.toHaveProperty('apiKey');
    expect(payload).toMatchObject({ mode: 'SIMULATOR', isActive: false, merchantId: 'MARCHAND-1' });
  });

  it('envoie la nouvelle clé après « Remplacer la clé »', async () => {
    getSyndicGatewaySettings.mockResolvedValue(SETTINGS);
    updateSyndicGatewaySettings.mockResolvedValue(SETTINGS);
    wrap(<GatewayConfigCard tenantId="t1" syndicId="s1" canEditSettings />);

    await screen.findByPlaceholderText('•••• 1234');
    fireEvent.click(screen.getByRole('button', { name: 'Remplacer la clé' }));
    const field = screen.getByPlaceholderText('•••• 1234') as HTMLInputElement;
    expect(field.disabled).toBe(false);
    fireEvent.change(field, { target: { value: 'nouvelle-cle-secrete' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateSyndicGatewaySettings).toHaveBeenCalled());
    expect(updateSyndicGatewaySettings.mock.calls[0][2]).toMatchObject({ apiKey: 'nouvelle-cle-secrete' });
  });

  it('affiche le message du serveur quand des paiements en cours bloquent le changement', async () => {
    getSyndicGatewaySettings.mockResolvedValue(SETTINGS);
    updateSyndicGatewaySettings.mockRejectedValue({
      response: { status: 409, data: { code: 'GATEWAY_CHECKOUTS_PENDING', message: 'Un paiement est en cours.' } }
    });
    wrap(<GatewayConfigCard tenantId="t1" syndicId="s1" canEditSettings />);

    await screen.findByPlaceholderText('•••• 1234');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Un paiement est en cours.')).toBeTruthy();
  });
});

describe('ReviewDecisionModal', () => {
  it('désactive « Accepter » pour une transaction dupliquée', async () => {
    wrap(
      <ReviewDecisionModal
        tenantId="t1"
        syndicId="s1"
        checkout={review('DUPLICATE_TRANSACTION')}
        onClose={vi.fn()}
        onDecided={vi.fn()}
      />
    );
    const accept = (await screen.findByLabelText(/^Accepter/)) as HTMLInputElement;
    const reject = screen.getByLabelText(/^Refuser/) as HTMLInputElement;
    expect(accept.disabled).toBe(true);
    expect(reject.disabled).toBe(false);
  });

  it('désactive « Refuser » pour un état contraire déjà encaissé', async () => {
    wrap(
      <ReviewDecisionModal
        tenantId="t1"
        syndicId="s1"
        checkout={review('CONTRARY_STATE')}
        onClose={vi.fn()}
        onDecided={vi.fn()}
      />
    );
    const reject = (await screen.findByLabelText(/^Refuser/)) as HTMLInputElement;
    expect(reject.disabled).toBe(true);
    expect((screen.getByLabelText(/^Accepter/) as HTMLInputElement).disabled).toBe(false);
  });

  it('propose accepter (encaisser) et refuser pour un succès tardif sans encaissement', async () => {
    wrap(
      <ReviewDecisionModal
        tenantId="t1"
        syndicId="s1"
        checkout={review('CONTRARY_STATE', true)}
        onClose={vi.fn()}
        onDecided={vi.fn()}
      />
    );
    const accept = (await screen.findByLabelText(/^Accepter/)) as HTMLInputElement;
    const reject = screen.getByLabelText(/^Refuser/) as HTMLInputElement;
    expect(accept.disabled).toBe(false);
    expect(reject.disabled).toBe(false);
    expect(screen.getByText('Succès du fournisseur après expiration de la tentative')).toBeTruthy();

    fireEvent.click(accept);
    expect(screen.getByText(/enregistrer l’encaissement du montant reçu/)).toBeTruthy();
    expect(screen.getByLabelText('Date d’encaissement')).toBeTruthy();
    // Le fournisseur a rapporté un montant (45 000) : aucun avertissement sur le montant demandé.
    expect(screen.queryByText(/sera enregistré/)).toBeNull();
  });

  it.each([
    ['CONTRARY_STATE' as const, true],
    ['AMOUNT_MISMATCH' as const, false]
  ])(
    'prévient que le montant demandé sera enregistré quand le fournisseur n’a rapporté aucun montant (%s)',
    async (kind, lateSuccess) => {
      wrap(
        <ReviewDecisionModal
          tenantId="t1"
          syndicId="s1"
          checkout={{ ...review(kind, lateSuccess), receivedAmount: null }}
          onClose={vi.fn()}
          onDecided={vi.fn()}
        />
      );
      expect(await screen.findByText('Non rapporté')).toBeTruthy();
      // Rien n'est encaissé tant que « Accepter » n'est pas choisi.
      expect(screen.queryByText(/sera enregistré/)).toBeNull();

      fireEvent.click(screen.getByLabelText(/^Accepter/));
      const warning = screen.getByText(/le montant demandé .* sera enregistré/);
      expect(warning.textContent).toContain('Montant non rapporté par le fournisseur');
      expect(warning.textContent).toContain('50');
      expect(warning.textContent).toContain('FCFA');

      fireEvent.click(screen.getByLabelText(/^Refuser/));
      expect(screen.queryByText(/sera enregistré/)).toBeNull();
    }
  );

  it('n’avertit pas du montant demandé quand l’encaissement est déjà enregistré (clôture du suivi)', async () => {
    wrap(
      <ReviewDecisionModal
        tenantId="t1"
        syndicId="s1"
        checkout={{ ...review('CONTRARY_STATE'), receivedAmount: null }}
        onClose={vi.fn()}
        onDecided={vi.fn()}
      />
    );
    fireEvent.click(await screen.findByLabelText(/^Accepter/));
    expect(screen.queryByText(/sera enregistré/)).toBeNull();
  });

  it('clôt seulement le suivi quand l’état contraire a déjà été encaissé', async () => {
    wrap(
      <ReviewDecisionModal
        tenantId="t1"
        syndicId="s1"
        checkout={review('CONTRARY_STATE')}
        onClose={vi.fn()}
        onDecided={vi.fn()}
      />
    );
    fireEvent.click(await screen.findByLabelText(/^Accepter/));
    expect(screen.getByText(/l’encaissement est déjà enregistré, clore le suivi/)).toBeTruthy();
    expect(screen.queryByLabelText('Date d’encaissement')).toBeNull();
  });

  it('exige une note, envoie la décision et rappelle que refuser ne rembourse pas', async () => {
    decideSyndicOnlineCheckout.mockResolvedValue({
      checkout: { ...review('AMOUNT_MISMATCH'), status: 'FAILED' },
      payment: null
    });
    const onDecided = vi.fn();
    wrap(
      <ReviewDecisionModal
        tenantId="t1"
        syndicId="s1"
        checkout={review('AMOUNT_MISMATCH')}
        onClose={vi.fn()}
        onDecided={onDecided}
      />
    );

    fireEvent.click(await screen.findByLabelText(/^Refuser/));
    expect(screen.getByText('Refuser ne rembourse pas le payeur')).toBeTruthy();

    const ok = screen.getByRole('button', { name: 'Enregistrer la décision' }) as HTMLButtonElement;
    expect(ok.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Note (obligatoire)'), { target: { value: '  Montant incohérent  ' } });
    await waitFor(() => expect(ok.disabled).toBe(false));
    fireEvent.click(ok);

    await waitFor(() => expect(decideSyndicOnlineCheckout).toHaveBeenCalled());
    expect(decideSyndicOnlineCheckout).toHaveBeenCalledWith('t1', 's1', 'co-1', {
      decision: 'REJECT',
      note: 'Montant incohérent'
    });
    await waitFor(() => expect(onDecided).toHaveBeenCalled());
  });
});

describe('PayoutsPanel', () => {
  it('enregistre un reversement avec référence, montant plafonné au solde du 5525', async () => {
    listSyndicGatewayPayouts.mockResolvedValue({ items: [] });
    recordSyndicGatewayPayout.mockResolvedValue({
      entryId: 'e1',
      reference: 'VIR-1',
      amount: 100000,
      date: '2026-10-15',
      collectionBalanceAfter: 50000
    });
    const onRecorded = vi.fn();
    wrap(<PayoutsPanel tenantId="t1" syndicId="s1" collectionBalance={150000} onRecorded={onRecorded} canEdit />);

    await screen.findByText('Aucun reversement enregistré');
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer un reversement/ }));

    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.change(within(dialog).getByLabelText('Référence du virement'), { target: { value: 'VIR-1' } });
    // Au-delà du solde, le champ plafonne ou le bouton reste inactif : aucun appel ne part.
    fireEvent.change(within(dialog).getByLabelText('Montant reversé'), { target: { value: '200000' } });
    fireEvent.blur(within(dialog).getByLabelText('Montant reversé'));
    expect(recordSyndicGatewayPayout).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Montant reversé'), { target: { value: '100000' } });
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);

    await waitFor(() => expect(recordSyndicGatewayPayout).toHaveBeenCalled());
    const [, , body] = recordSyndicGatewayPayout.mock.calls[0];
    expect(body).toMatchObject({ amount: 100000, reference: 'VIR-1', note: null });
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
  });
});
