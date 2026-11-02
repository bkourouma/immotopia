import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CoOwnerChargeCalls from '../../pages/CoOwnerPortal/ChargeCalls';
import { OnlinePaymentReturn } from '../../pages/CoOwnerPortal/OnlinePaymentReturn';
import type {
  CoOwnerChargeCall,
  CoOwnerOnlineCheckout,
  CoOwnerOnlinePaymentAvailability
} from '../../services/coowner-portal-service';

/**
 * Portail copropriétaire — paiement en ligne des appels de charges (spec 042,
 * contrat §2) : bouton absent sans configuration, sélection d'un seul lot,
 * démarrage avec redirection gardée, reprise sur 409, bandeau de retour.
 * Le mock reprend le module réel et ne remplace que les quatre fonctions
 * réseau exercées ici (Vitest refuse un export non déclaré).
 */

const listMyChargeCalls = vi.fn();
const getOnlinePaymentAvailability = vi.fn();
const startOnlinePayment = vi.fn();
const getOnlinePayment = vi.fn();
const getDeclaredAvailability = vi.fn();

vi.mock('../../services/coowner-portal-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/coowner-portal-service')>(
    '../../services/coowner-portal-service'
  );
  return {
    ...actual,
    listMyChargeCalls: (...a: unknown[]) => listMyChargeCalls(...a),
    getOnlinePaymentAvailability: (...a: unknown[]) => getOnlinePaymentAvailability(...a),
    startOnlinePayment: (...a: unknown[]) => startOnlinePayment(...a),
    getOnlinePayment: (...a: unknown[]) => getOnlinePayment(...a),
    getDeclaredAvailability: (...a: unknown[]) => getDeclaredAvailability(...a)
  };
});

// jsdom rend `window.location.assign` non configurable : la redirection passe
// par un module dédié, remplacé ici.
const redirectMock = vi.fn();
vi.mock('../../utils/external-redirect', () => ({
  redirectToExternalUrl: (url: string) => redirectMock(url)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const WAIT = { timeout: 8000 };
const CODE = 'IMS-abcdefghij0123456789';
const CHECKOUT_URL = 'https://pay.example.com/checkout/abc';

function call(overrides: Partial<CoOwnerChargeCall> = {}): CoOwnerChargeCall {
  return {
    id: 'call-1',
    period: '2026-T1',
    amount: 100000,
    paid: 0,
    outstanding: 100000,
    currency: 'XOF',
    dueDate: '2026-01-10T00:00:00.000Z',
    status: 'OVERDUE',
    lot: { id: 'lot-1', lotNumber: 'A1', lotType: 'APARTMENT' },
    syndicate: 'Résidence Les Acacias',
    syndicateId: 's1',
    onlinePayable: true,
    onlineCheckout: 'NONE',
    onlineCheckoutCode: null,
    ...overrides
  };
}

function availability(
  overrides: Partial<CoOwnerOnlinePaymentAvailability['syndicates'][number]> = {}
): CoOwnerOnlinePaymentAvailability {
  return {
    syndicates: [
      {
        syndicateId: 's1',
        name: 'Résidence Les Acacias',
        available: true,
        unavailableReason: null,
        mode: 'LIVE',
        simulated: false,
        feesPaidBy: 'CLIENT',
        ...overrides
      }
    ],
    paymentMethods: ['WAVE', 'ORANGE_MONEY']
  };
}

function checkout(overrides: Partial<CoOwnerOnlineCheckout> = {}): CoOwnerOnlineCheckout {
  return {
    codePaiement: CODE,
    status: 'PENDING',
    underReview: false,
    amount: 100000,
    currency: 'XOF',
    chargeCallIds: ['call-1'],
    periods: ['2026-T1'],
    checkoutUrl: CHECKOUT_URL,
    reused: false,
    lot: { id: 'lot-1', lotNumber: 'A1' },
    syndicate: { id: 's1', name: 'Résidence Les Acacias' },
    mode: 'LIVE',
    feesPaidBy: 'CLIENT',
    documents: [],
    createdAt: '2026-10-15T09:00:00.000Z',
    completedAt: null,
    ...overrides
  };
}

function mountPage(path = '/copropriete/appels') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/copropriete/appels" element={<CoOwnerChargeCalls />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const twoCallsSameLot = () => [
  call(),
  call({ id: 'call-2', period: '2026-T2', amount: 50000, outstanding: 50000, status: 'PENDING' })
];

beforeEach(() => {
  vi.clearAllMocks();
  getOnlinePaymentAvailability.mockResolvedValue(availability());
  // Spec 047 : jamais le vrai réseau ; paiement déclaré fermé par défaut.
  getDeclaredAvailability.mockRejectedValue(new Error('indisponible'));
});

describe('Appels de charges — paiement en ligne', () => {
  it("n'affiche aucun bouton « Payer » quand la copropriété n'est pas configurée, avec un texte neutre", async () => {
    listMyChargeCalls.mockResolvedValue([call({ onlinePayable: false })]);
    getOnlinePaymentAvailability.mockResolvedValue(
      availability({ available: false, unavailableReason: 'NOT_CONFIGURED', mode: null })
    );

    mountPage();

    expect(await screen.findByText(/pas encore ouvert pour votre copropriété/, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Payer en ligne/ })).not.toBeInTheDocument();
  });

  it("n'affiche aucun bouton « Payer en ligne » si la disponibilité est en erreur", async () => {
    listMyChargeCalls.mockResolvedValue([call()]);
    getOnlinePaymentAvailability.mockRejectedValue({ response: { status: 403 } });

    mountPage();

    await screen.findByText('Mes appels de charges', {}, WAIT);
    expect(screen.queryByRole('button', { name: /Payer en ligne/ })).not.toBeInTheDocument();
  });

  it('pose un bouton « Payer en ligne » sur chaque appel payable, sans colonne de sélection', async () => {
    listMyChargeCalls.mockResolvedValue([
      ...twoCallsSameLot(),
      call({ id: 'call-3', period: '2026-T3', lot: { id: 'lot-2', lotNumber: 'B2', lotType: 'PARKING' } }),
      call({ id: 'call-4', period: '2026-T4', onlineCheckout: 'IN_PROGRESS' }),
      call({ id: 'call-5', period: '2026-T5', onlinePayable: false, status: 'PAID', paid: 100000, outstanding: 0 })
    ]);
    mountPage();

    expect(await screen.findByRole('button', { name: 'Payer en ligne : 2026-T1' }, WAIT)).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Payer en ligne : 2026-T2' })).toBeEnabled();
    // Autre lot : payable lui aussi, chaque appel se règle seul.
    expect(screen.getByRole('button', { name: 'Payer en ligne : 2026-T3' })).toBeEnabled();
    // Appel déjà engagé ou soldé : pas de bouton.
    expect(screen.getByText('Paiement en cours')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Payer en ligne : 2026-T4' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Payer en ligne : 2026-T5' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Payer' })).not.toBeInTheDocument();
  });

  it('affiche dans la colonne « Lot » le seul numéro du lot, sans le nom de la copropriété', async () => {
    listMyChargeCalls.mockResolvedValue([call()]);
    mountPage();

    const row = (await screen.findByText('2026-T1', {}, WAIT)).closest('tr') as HTMLElement;
    expect(within(row).getByText('A1')).toBeInTheDocument();
    expect(within(row).queryByText(/Résidence Les Acacias/)).not.toBeInTheDocument();
  });

  it("n'affiche aucun bandeau d'explication (mode démonstration, frais, moyens de paiement) au-dessus du tableau", async () => {
    listMyChargeCalls.mockResolvedValue([call()]);
    getOnlinePaymentAvailability.mockResolvedValue(availability({ mode: 'SIMULATOR', simulated: true }));
    mountPage();

    await screen.findByRole('button', { name: 'Payer en ligne : 2026-T1' }, WAIT);
    expect(screen.queryByText('Mode démonstration')).not.toBeInTheDocument();
    expect(screen.queryByText(/Cliquez sur « Payer en ligne »/)).not.toBeInTheDocument();
    expect(screen.queryByText(/frais du service de paiement/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Moyens de paiement/)).not.toBeInTheDocument();
  });

  it('reprend un paiement en cours depuis la liste grâce à son code', async () => {
    listMyChargeCalls.mockResolvedValue([call({ onlineCheckout: 'IN_PROGRESS', onlineCheckoutCode: CODE })]);
    getOnlinePayment.mockResolvedValue(checkout());
    mountPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Reprendre le paiement' }, WAIT));

    await waitFor(() => expect(redirectMock).toHaveBeenCalledWith(CHECKOUT_URL));
    expect(getOnlinePayment).toHaveBeenCalledWith(CODE);
  });

  it('ne propose pas la reprise d’un paiement en cours d’un autre compte (pas de code)', async () => {
    listMyChargeCalls.mockResolvedValue([call({ onlineCheckout: 'IN_PROGRESS', onlineCheckoutCode: null })]);
    mountPage();

    expect(await screen.findByText('Paiement en cours', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reprendre le paiement' })).not.toBeInTheDocument();
  });

  it('refuse une URL non sûre à la reprise : aucune redirection', async () => {
    listMyChargeCalls.mockResolvedValue([call({ onlineCheckout: 'IN_PROGRESS', onlineCheckoutCode: CODE })]);
    getOnlinePayment.mockResolvedValue(checkout({ checkoutUrl: 'javascript:alert(1)' }));
    mountPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Reprendre le paiement' }, WAIT));

    await waitFor(() => expect(getOnlinePayment).toHaveBeenCalled());
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('règle l’appel de la ligne seul puis redirige vers la page du fournisseur', async () => {
    listMyChargeCalls.mockResolvedValue(twoCallsSameLot());
    startOnlinePayment.mockResolvedValue(checkout({ chargeCallIds: ['call-2'] }));
    mountPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Payer en ligne : 2026-T2' }, WAIT));

    await waitFor(() => expect(redirectMock).toHaveBeenCalledWith(CHECKOUT_URL));
    expect(startOnlinePayment).toHaveBeenCalledWith({ lotId: 'lot-1', chargeCallIds: ['call-2'] });
  });

  it("refuse une URL de fournisseur non sûre : aucune redirection, un message d'erreur", async () => {
    listMyChargeCalls.mockResolvedValue([call()]);
    startOnlinePayment.mockResolvedValue(checkout({ checkoutUrl: 'javascript:alert(1)' }));
    mountPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Payer en ligne : 2026-T1' }, WAIT));

    expect(await screen.findByText("Le paiement en ligne n'a pas pu être initié.", {}, WAIT)).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('propose de reprendre la page du fournisseur sur un 409 « déjà en cours »', async () => {
    listMyChargeCalls.mockResolvedValue([call()]);
    startOnlinePayment.mockRejectedValue({
      response: {
        status: 409,
        data: {
          success: false,
          code: 'ONLINE_PAYMENT_IN_PROGRESS',
          message: 'Un paiement en ligne est déjà en cours.',
          data: { codePaiement: CODE, checkoutUrl: CHECKOUT_URL }
        }
      }
    });
    mountPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Payer en ligne : 2026-T1' }, WAIT));

    expect(await screen.findByText('Un paiement en ligne est déjà en cours.', {}, WAIT)).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reprendre le paiement' }));
    expect(redirectMock).toHaveBeenCalledWith(CHECKOUT_URL);
  });

  it('affiche le message du 409 « en vérification » sans proposer de reprise', async () => {
    listMyChargeCalls.mockResolvedValue([call()]);
    startOnlinePayment.mockRejectedValue({
      response: {
        status: 409,
        data: { success: false, code: 'ONLINE_PAYMENT_UNDER_REVIEW', message: 'Paiement à vérifier par le syndic.' }
      }
    });
    mountPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Payer en ligne : 2026-T1' }, WAIT));

    expect(await screen.findByText('Paiement à vérifier par le syndic.', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reprendre le paiement' })).not.toBeInTheDocument();
  });

  it("ignore un paramètre ?paiement= qui n'a pas la forme d'un code", async () => {
    listMyChargeCalls.mockResolvedValue([call()]);
    mountPage('/copropriete/appels?paiement=n-importe-quoi');

    await screen.findByText('Mes appels de charges', {}, WAIT);
    expect(getOnlinePayment).not.toHaveBeenCalled();
  });

  it('affiche le bandeau de retour de la page, interroge le statut serveur et rafraîchit la liste', async () => {
    listMyChargeCalls.mockResolvedValue([call()]);
    getOnlinePayment.mockResolvedValue(
      checkout({ status: 'SUCCESS', documents: [{ id: 'd1', kind: 'RECEIPT', number: 'REC-2026-0042' }] })
    );
    mountPage(`/copropriete/appels?paiement=${CODE}`);

    expect(await screen.findByText('Paiement confirmé.', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText(/REC-2026-0042/)).toBeInTheDocument();
    expect(getOnlinePayment).toHaveBeenCalledWith(CODE);
    await waitFor(() => expect(listMyChargeCalls.mock.calls.length).toBeGreaterThan(1));
  });
});

describe('OnlinePaymentReturn — états du bandeau', () => {
  function mountReturn(props: Partial<React.ComponentProps<typeof OnlinePaymentReturn>> = {}) {
    const onSettled = vi.fn();
    render(<OnlinePaymentReturn codePaiement={CODE} onSettled={onSettled} intervalMs={10} maxMs={80} {...props} />);
    return onSettled;
  }

  it('payé : numéro du reçu', async () => {
    getOnlinePayment.mockResolvedValue(
      checkout({
        status: 'SUCCESS',
        documents: [
          { id: 'd1', kind: 'RECEIPT', number: 'REC-1' },
          { id: 'd2', kind: 'QUITTANCE', number: 'QUI-2' }
        ]
      })
    );
    const onSettled = mountReturn();

    expect(await screen.findByText('Paiement confirmé.', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText(/REC-1, QUI-2/)).toBeInTheDocument();
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
  });

  it('échoué', async () => {
    getOnlinePayment.mockResolvedValue(checkout({ status: 'FAILED' }));
    const onSettled = mountReturn();

    expect(await screen.findByText('Le paiement a échoué.', {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
  });

  it('annulé', async () => {
    getOnlinePayment.mockResolvedValue(checkout({ status: 'CANCELED' }));
    mountReturn();

    expect(await screen.findByText(/Le paiement a été annulé/, {}, WAIT)).toBeInTheDocument();
  });

  it('en vérification par le syndic : arrêt de l’interrogation', async () => {
    getOnlinePayment.mockResolvedValue(checkout({ status: 'PENDING', underReview: true }));
    const onSettled = mountReturn();

    expect(await screen.findByText(/en cours de vérification par le syndic/, {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    const calls = getOnlinePayment.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(getOnlinePayment.mock.calls.length).toBe(calls);
  });

  it("continue d'interroger tant que le paiement est en attente, puis affiche le résultat", async () => {
    getOnlinePayment
      .mockResolvedValueOnce(checkout())
      .mockResolvedValueOnce(checkout())
      .mockResolvedValue(checkout({ status: 'SUCCESS' }));
    const onSettled = mountReturn({ maxMs: 5000 });

    expect(await screen.findByText('Paiement confirmé.', {}, WAIT)).toBeInTheDocument();
    expect(getOnlinePayment.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('expiré : le délai de suivi s’écoule sans confirmation', async () => {
    getOnlinePayment.mockResolvedValue(checkout());
    const onSettled = mountReturn({ maxMs: 40 });

    expect(await screen.findByText('La confirmation prend plus de temps que prévu.', {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
  });

  it('introuvable : un 404 ne révèle rien', async () => {
    getOnlinePayment.mockRejectedValue({ response: { status: 404 } });
    const onSettled = mountReturn();

    expect(await screen.findByText('Paiement introuvable.', {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
  });

  it('panne réseau : message d’erreur, pas de bouclage', async () => {
    getOnlinePayment.mockRejectedValue(new Error('réseau'));
    mountReturn();

    expect(await screen.findByText('Impossible de vérifier ce paiement.', {}, WAIT)).toBeInTheDocument();
    expect(getOnlinePayment).toHaveBeenCalledTimes(1);
  });
});
