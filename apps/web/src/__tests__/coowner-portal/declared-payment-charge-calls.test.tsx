import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CoOwnerChargeCalls from '../../pages/CoOwnerPortal/ChargeCalls';
import { isCallSelectable } from '../../pages/CoOwnerPortal/ChargeCallsTable';
import type {
  CoOwnerChargeCall,
  CoOwnerDeclaredAvailability,
  CoOwnerLot,
  CoOwnerOnlinePaymentAvailability
} from '../../services/coowner-portal-service';

/**
 * Spec 047 — « Mes appels de charges » : numéros de réception, bouton
 * « J'ai payé par mobile money », état « Paiement déclaré, en vérification »
 * et case de paiement en ligne grisée. Le formulaire est remplacé par un stub
 * qui expose ce que la page lui passe.
 */

const listMyChargeCalls = vi.fn();
const getOnlinePaymentAvailability = vi.fn();
const getDeclaredAvailability = vi.fn();
const listMyLots = vi.fn();

vi.mock('../../services/coowner-portal-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/coowner-portal-service')>(
    '../../services/coowner-portal-service'
  );
  return {
    ...actual,
    listMyChargeCalls: (...a: unknown[]) => listMyChargeCalls(...a),
    getOnlinePaymentAvailability: (...a: unknown[]) => getOnlinePaymentAvailability(...a),
    getDeclaredAvailability: (...a: unknown[]) => getDeclaredAvailability(...a),
    listMyLots: (...a: unknown[]) => listMyLots(...a)
  };
});

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../components/coowner-portal/declared-payment/DeclarationForm', () => ({
  DeclarationForm: (props: {
    open: boolean;
    syndicate: { id: string; name: string };
    lots: Array<{ id: string; lotNumber: string }>;
    calls: unknown[];
    defaultPayerPhone?: string;
    onClose: () => void;
    onSubmitted: (declaration: unknown) => void;
  }) =>
    props.open ? (
      <div data-testid="declaration-form">
        <span data-testid="form-syndicate">{props.syndicate.id}</span>
        <span data-testid="form-lots">{props.lots.map(lot => lot.lotNumber).join(',')}</span>
        <span data-testid="form-calls">{props.calls.length}</span>
        <span data-testid="form-phone">{props.defaultPayerPhone ?? ''}</span>
        <button
          type="button"
          onClick={() => props.onSubmitted({ id: 'decl-1', payerPhone: '+2250707070707', syndicate: props.syndicate })}
        >
          envoyer-stub
        </button>
      </div>
    ) : null,
  default: () => null
}));

const WAIT = { timeout: 8000 };
const PHONE_KEY = 'coowner-portal:payer-phone';
const MOBILE_BUTTON = /J'ai payé par mobile money/;

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
    onlinePayable: false,
    onlineCheckout: 'NONE',
    onlineCheckoutCode: null,
    ...overrides
  };
}

function declared(overrides: Partial<CoOwnerDeclaredAvailability> = {}): CoOwnerDeclaredAvailability {
  return {
    syndicateId: 's1',
    available: true,
    receivingNumbers: [
      {
        id: 'rn-1',
        operator: 'WAVE',
        phoneNumber: '+2250707070707',
        holderName: 'Syndic Acacias',
        label: null,
        isActive: true,
        sortOrder: 0
      }
    ],
    payerInstructions: null,
    proofRequired: false,
    aiPrefillAvailable: false,
    maxAmount: 5000000,
    ...overrides
  };
}

function lot(id: string, lotNumber: string, syndicateId: string): CoOwnerLot {
  return {
    id,
    lotNumber,
    lotType: 'APARTMENT',
    generalShares: 10,
    specialShares: null,
    ownershipPercentage: 10,
    syndicate: { id: syndicateId, name: `Copro ${syndicateId}`, address: '' },
    balance: null
  } as CoOwnerLot;
}

function onlineAvailability(available: boolean): CoOwnerOnlinePaymentAvailability {
  return {
    syndicates: [
      {
        syndicateId: 's1',
        name: 'Résidence Les Acacias',
        available,
        unavailableReason: available ? null : 'NOT_CONFIGURED',
        mode: available ? 'LIVE' : null,
        simulated: false,
        feesPaidBy: 'CLIENT'
      }
    ],
    paymentMethods: ['WAVE']
  };
}

function resetMocks() {
  vi.clearAllMocks();
  listMyChargeCalls.mockResolvedValue([call()]);
  getOnlinePaymentAvailability.mockResolvedValue(onlineAvailability(false));
  getDeclaredAvailability.mockResolvedValue(declared());
  listMyLots.mockResolvedValue([lot('lot-1', 'A1', 's1')]);
}

function mountPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/copropriete/appels']}>
        <Routes>
          <Route path="/copropriete/appels" element={<CoOwnerChargeCalls />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  try {
    window.localStorage.removeItem(PHONE_KEY);
  } catch {
    // ignoré
  }
  resetMocks();
});

describe('Appels de charges — paiement mobile money déclaré', () => {
  const closedCases: Array<[string, () => void]> = [
    ['la disponibilité est fausse', () => getDeclaredAvailability.mockResolvedValue(declared({ available: false }))],
    ['la requête échoue', () => getDeclaredAvailability.mockRejectedValue(new Error('403'))],
    ['aucun numéro actif', () => getDeclaredAvailability.mockResolvedValue(declared({ receivingNumbers: [] }))]
  ];

  it.each(closedCases)('ne propose rien quand %s', async (_label, setup) => {
    setup();
    mountPage();
    expect(await screen.findByText('2026-T1', {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(getDeclaredAvailability).toHaveBeenCalledWith('s1'));
    expect(screen.queryByRole('button', { name: MOBILE_BUTTON })).not.toBeInTheDocument();
    expect(screen.queryByText(/Numéros pour payer par mobile money/)).not.toBeInTheDocument();
  });

  it('affiche les numéros et le bouton, et le clic ouvre le formulaire de la bonne copropriété', async () => {
    listMyLots.mockResolvedValue([lot('lot-1', 'A1', 's1'), lot('lot-9', 'Z9', 's2')]);
    const user = userEvent.setup();
    mountPage();

    const button = await screen.findByRole('button', { name: MOBILE_BUTTON }, WAIT);
    expect(screen.getByText(/Numéros pour payer par mobile money/)).toBeInTheDocument();
    expect(screen.getByText(/Syndic Acacias/)).toBeInTheDocument();
    expect(screen.queryByTestId('declaration-form')).not.toBeInTheDocument();

    await user.click(button);

    expect(await screen.findByTestId('declaration-form')).toBeInTheDocument();
    expect(screen.getByTestId('form-syndicate')).toHaveTextContent('s1');
    expect(screen.getByTestId('form-lots')).toHaveTextContent('A1');
    expect(screen.getByTestId('form-lots')).not.toHaveTextContent('Z9');
    expect(screen.getByTestId('form-calls')).toHaveTextContent('1');
  });

  it('masque le bouton si les lots ne se chargent pas', async () => {
    listMyLots.mockRejectedValue(new Error('500'));
    mountPage();
    expect(await screen.findByText('2026-T1', {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(listMyLots).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: MOBILE_BUTTON })).not.toBeInTheDocument();
  });

  it('transmet le dernier numéro payeur mémorisé, le mémorise après l’envoi et recharge les appels', async () => {
    window.localStorage.setItem(PHONE_KEY, '+2250101010101');
    const user = userEvent.setup();
    mountPage();

    await user.click(await screen.findByRole('button', { name: MOBILE_BUTTON }, WAIT));
    expect(await screen.findByTestId('form-phone')).toHaveTextContent('+2250101010101');

    const before = listMyChargeCalls.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'envoyer-stub' }));

    await waitFor(() => expect(listMyChargeCalls.mock.calls.length).toBeGreaterThan(before), WAIT);
    expect(window.localStorage.getItem(PHONE_KEY)).toBe('+2250707070707');
    await waitFor(() => expect(screen.queryByTestId('declaration-form')).not.toBeInTheDocument());
  });

  it('marque l’appel déclaré, grise sa case et laisse son reste dû inchangé', async () => {
    getOnlinePaymentAvailability.mockResolvedValue(onlineAvailability(true));
    listMyChargeCalls.mockResolvedValue([
      call({
        pendingDeclaration: { declarationId: 'decl-1', createdAt: '2026-10-15T09:00:00.000Z' },
        outstanding: 100000,
        onlinePayable: false
      }),
      call({ id: 'call-2', period: '2026-T2', amount: 50000, outstanding: 50000, onlinePayable: true })
    ]);
    mountPage();

    const row = (await screen.findByText('2026-T1', {}, WAIT)).closest('tr') as HTMLElement;
    expect(within(row).getByText('Paiement déclaré, en vérification')).toBeInTheDocument();
    const box = within(row).getByRole('checkbox');
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleName(/paiement en ligne indisponible/);
    expect(row.textContent).toMatch(/100\s?000/);

    const otherRow = screen.getByText('2026-T2').closest('tr') as HTMLElement;
    expect(within(otherRow).getByRole('checkbox')).toBeEnabled();
    expect(within(otherRow).queryByText('Paiement déclaré, en vérification')).not.toBeInTheDocument();
  });

  it('masque la phrase « règlement en ligne pas encore ouvert » quand la déclaration est disponible', async () => {
    mountPage();
    await screen.findByRole('button', { name: MOBILE_BUTTON }, WAIT);
    expect(screen.queryByText(/pas encore ouvert pour votre copropriété/)).not.toBeInTheDocument();
  });

  it('garde cette phrase quand rien n’est ouvert', async () => {
    getDeclaredAvailability.mockResolvedValue(declared({ available: false }));
    mountPage();
    expect(await screen.findByText(/pas encore ouvert pour votre copropriété/, {}, WAIT)).toBeInTheDocument();
  });
});

describe('isCallSelectable — déclaration en attente', () => {
  it('refuse un appel qui a une déclaration en attente, même payable en ligne', () => {
    const pending = call({
      onlinePayable: true,
      pendingDeclaration: { declarationId: 'd', createdAt: '2026-10-15T09:00:00.000Z' }
    });
    expect(isCallSelectable(pending, [])).toBe(false);
    expect(isCallSelectable(call({ onlinePayable: true }), [])).toBe(true);
  });
});
