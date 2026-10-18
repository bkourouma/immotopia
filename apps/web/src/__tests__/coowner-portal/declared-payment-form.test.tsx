import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { DeclarationForm } from '../../components/coowner-portal/declared-payment/DeclarationForm';
import type {
  CoOwnerChargeCall,
  CoOwnerDeclaration,
  CoOwnerDeclaredAvailability,
  PaymentProofReading
} from '../../services/coowner-portal-service';

/**
 * Formulaire « J'ai payé par mobile money » (spec 047, contrat §2) : parts et
 * lots, appels visés, référence normalisée, capture, lecture IA et erreurs
 * serveur. Le service est le module réel, seules les deux fonctions réseau
 * exercées ici sont remplacées (Vitest refuse un export non déclaré).
 */

const createDeclaration = vi.fn();
const readPaymentProof = vi.fn();

vi.mock('../../services/coowner-portal-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/coowner-portal-service')>(
    '../../services/coowner-portal-service'
  );
  return {
    ...actual,
    createDeclaration: (...a: unknown[]) => createDeclaration(...a),
    readPaymentProof: (...a: unknown[]) => readPaymentProof(...a)
  };
});

const feedbackSuccess = vi.fn();
vi.mock('../../lib/feedback', () => ({
  feedback: { success: (...a: unknown[]) => feedbackSuccess(...a), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const WAIT = { timeout: 8000 };
const SYNDICATE = { id: 's1', name: 'Résidence Les Acacias' };
const LOT_A = { id: 'lot-1', lotNumber: 'A1' };
const LOT_B = { id: 'lot-2', lotNumber: 'B2' };

function availability(overrides: Partial<CoOwnerDeclaredAvailability> = {}): CoOwnerDeclaredAvailability {
  return {
    syndicateId: 's1',
    available: true,
    receivingNumbers: [
      {
        id: 'num-1',
        operator: 'ORANGE',
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

function reading(overrides: Partial<PaymentProofReading> = {}): PaymentProofReading {
  return {
    readId: 'read-1',
    quality: 'OK',
    operator: 'ORANGE',
    amount: 45000,
    paidAt: dayjs().subtract(2, 'hour').format(),
    transactionReference: 'mp 2610 abcd',
    payerPhone: '0505050505',
    recipientPhone: '+2250707070707',
    recipientName: null,
    confidence: {},
    warnings: [],
    matchedReceivingNumberId: 'num-1',
    ...overrides
  };
}

const DECLARATION = { id: 'decl-1', status: 'PENDING' } as unknown as CoOwnerDeclaration;
const onClose = vi.fn();
const onSubmitted = vi.fn();

interface MountOptions {
  lots?: Array<{ id: string; lotNumber: string }>;
  calls?: CoOwnerChargeCall[];
  availability?: Partial<CoOwnerDeclaredAvailability>;
  defaultPayerPhone?: string;
}

function mountForm(options: MountOptions = {}) {
  return render(
    <DeclarationForm
      open
      onClose={onClose}
      onSubmitted={onSubmitted}
      syndicate={SYNDICATE}
      availability={availability(options.availability)}
      lots={options.lots ?? [LOT_A]}
      calls={options.calls ?? [call()]}
      defaultPayerPhone={options.defaultPayerPhone ?? '0606060606'}
    />
  );
}

/** Remplace la valeur d'un champ texte (contourne le caret du formateur de nombres). */
function setValue(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function setPaidAt(user: ReturnType<typeof userEvent.setup>, when = dayjs().subtract(1, 'hour')) {
  const input = screen.getByLabelText('Date et heure du transfert');
  await user.click(input);
  await user.type(input, `${when.format('DD/MM/YYYY HH:mm')}{Enter}`);
}

async function fillCommon(user: ReturnType<typeof userEvent.setup>, amount = '45000', reference = 'om 23 ab') {
  setValue(/Montant envoyé/, amount);
  await setPaidAt(user);
  const ref = screen.getByLabelText('Référence de la transaction');
  await user.type(ref, reference);
}

function submitButton() {
  // Regex : Ant Design garde l'icône de chargement (aria-label « loading ») dans le bouton pendant son
  // animation de sortie, ce qui préfixe le nom accessible tant que jsdom n'a pas fini la transition.
  return screen.getByRole('button', { name: /Envoyer la déclaration/ });
}

function proofFile(name = 'sms.png', type = 'image/png', size = 2048) {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  createDeclaration.mockResolvedValue(DECLARATION);
});

describe('DeclarationForm — un seul lot', () => {
  it('envoie la déclaration avec la part égale au montant et la référence normalisée', async () => {
    const user = userEvent.setup();
    mountForm();

    await fillCommon(user);
    expect(screen.getByText('Référence enregistrée : OM23AB')).toBeInTheDocument();
    await user.click(submitButton());

    await waitFor(() => expect(createDeclaration).toHaveBeenCalledTimes(1), WAIT);
    const [input, file] = createDeclaration.mock.calls[0];
    expect(input).toMatchObject({
      syndicId: 's1',
      receivingNumberId: 'num-1',
      payerPhone: '0606060606',
      amount: 45000,
      transactionReference: 'OM23AB',
      lines: [{ lotId: 'lot-1', amount: 45000, chargeCallIds: [] }]
    });
    expect(input.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(input).not.toHaveProperty('comment');
    expect(input).not.toHaveProperty('proofReadId');
    expect(file).toBeNull();
    expect(feedbackSuccess).toHaveBeenCalledWith(expect.stringContaining('Déclaration envoyée au syndic'));
    expect(onSubmitted).toHaveBeenCalledWith(DECLARATION);
    expect(onClose).toHaveBeenCalled();
  }, 30000);

  it('refuse une référence trop courte et un envoi vide, sans appeler le service', async () => {
    const user = userEvent.setup();
    mountForm();

    await user.type(screen.getByLabelText('Référence de la transaction'), 'ab');
    await user.click(submitButton());

    expect(
      await screen.findByText('La référence doit comporter 4 à 40 caractères : lettres, chiffres, tiret ou point.')
    ).toBeInTheDocument();
    expect(createDeclaration).not.toHaveBeenCalled();
  }, 30000);

  it('transmet les appels cochés, sinon une liste vide', async () => {
    const user = userEvent.setup();
    mountForm({
      calls: [
        call(),
        call({ id: 'call-2', period: '2026-T2', outstanding: 50000 }),
        call({ id: 'call-3', outstanding: 0 })
      ]
    });

    expect(
      screen.getByText('Aucun appel coché : le paiement sera affecté aux appels les plus anciens, puis en avance.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/2026-T1.*échéance/)).toBeInTheDocument();
    expect(screen.getAllByText(/échéance/)).toHaveLength(2);

    await user.click(screen.getByRole('checkbox', { name: /2026-T2/ }));
    expect(screen.getByText(/Total du reste dû des appels cochés/)).toBeInTheDocument();

    await fillCommon(user);
    await user.click(submitButton());

    await waitFor(() => expect(createDeclaration).toHaveBeenCalled(), WAIT);
    expect(createDeclaration.mock.calls[0][0].lines).toEqual([
      { lotId: 'lot-1', amount: 45000, chargeCallIds: ['call-2'] }
    ]);
  }, 30000);

  it('signale un lot sans appel ouvert et un appel déjà déclaré', () => {
    mountForm({
      calls: [call({ pendingDeclaration: { declarationId: 'd0', createdAt: '2026-10-16T10:00:00Z' } })]
    });
    expect(screen.getByText('Déjà déclaré, en vérification')).toBeInTheDocument();
  });

  it.each(['IN_PROGRESS', 'REVIEW'] as const)(
    'désactive un appel dont le paiement en ligne est %s et explique pourquoi',
    status => {
      mountForm({ calls: [call({ onlineCheckout: status, onlineCheckoutCode: 'PAY-1' })] });
      expect(screen.getByRole('checkbox', { name: /2026-T1/ })).toBeDisabled();
      expect(screen.getByText(/Paiement en ligne en cours ou en vérification/)).toBeInTheDocument();
    }
  );

  it('indique qu’un lot sans appel ouvert deviendra une avance', () => {
    mountForm({ calls: [] });
    expect(screen.getByText('Aucun appel ouvert sur ce lot : le paiement deviendra une avance.')).toBeInTheDocument();
  });
});

describe('DeclarationForm — plusieurs lots', () => {
  const twoLotCalls = () => [
    call(),
    call({ id: 'call-b', period: '2026-T9', lot: { id: 'lot-2', lotNumber: 'B2', lotType: 'PARKING' } })
  ];

  it('refuse la déclaration quand la somme des parts diffère du montant', async () => {
    const user = userEvent.setup();
    mountForm({ lots: [LOT_A, LOT_B], calls: twoLotCalls() });

    await user.click(screen.getByRole('checkbox', { name: /Lot A1/ }));
    await user.click(screen.getByRole('checkbox', { name: /Lot B2/ }));
    await fillCommon(user, '45000');
    setValue('Part du lot A1', '30000');
    setValue('Part du lot B2', '10000');

    expect(screen.getByText('La somme des parts doit être égale au montant envoyé.')).toBeInTheDocument();
    expect(screen.getByTestId('declaration-shares-summary').textContent).toMatch(/40.000 FCFA.*45.000 FCFA/);
    expect(screen.getByText(/Écart restant : 5.000 FCFA/)).toBeInTheDocument();

    await user.click(submitButton());
    expect(createDeclaration).not.toHaveBeenCalled();
  }, 30000);

  it('envoie une ligne par lot quand la somme des parts égale le montant', async () => {
    const user = userEvent.setup();
    mountForm({ lots: [LOT_A, LOT_B], calls: twoLotCalls() });

    await user.click(screen.getByRole('checkbox', { name: /Lot A1/ }));
    await user.click(screen.getByRole('checkbox', { name: /Lot B2/ }));
    await fillCommon(user, '45000');
    setValue('Part du lot A1', '30000');
    setValue('Part du lot B2', '15000');
    await user.click(screen.getByRole('checkbox', { name: /2026-T1/ }));
    await user.click(submitButton());

    await waitFor(() => expect(createDeclaration).toHaveBeenCalled(), WAIT);
    expect(createDeclaration.mock.calls[0][0].lines).toEqual([
      { lotId: 'lot-1', amount: 30000, chargeCallIds: ['call-1'] },
      { lotId: 'lot-2', amount: 15000, chargeCallIds: [] }
    ]);
  }, 30000);

  it('bloque les lots au-delà de la limite du contrat', () => {
    const lots = Array.from({ length: 11 }, (_, i) => ({ id: `lot-${i}`, lotNumber: `L${i}` }));
    mountForm({ lots, calls: [] });

    for (let i = 0; i < 10; i += 1) fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`Lot L${i}$`) }));

    expect(screen.getByRole('checkbox', { name: /Lot L10$/ })).toBeDisabled();
  }, 90000);
});

describe('DeclarationForm — capture', () => {
  it('refuse un fichier d’un type non accepté et d’une taille excessive', async () => {
    const user = userEvent.setup({ applyAccept: false });
    mountForm();
    const input = screen.getByTestId('declaration-proof-input');

    await user.upload(input, proofFile('virus.exe', 'application/x-msdownload'));
    expect(await screen.findByText('La capture doit être une image JPEG, PNG, WebP ou un PDF.')).toBeInTheDocument();

    await user.upload(input, proofFile('gros.png', 'image/png', 6 * 1024 * 1024));
    expect(await screen.findByText('La capture ne doit pas dépasser 5 Mo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Joindre une capture' })).toBeInTheDocument();
  });

  it('exige la capture quand la copropriété l’impose', async () => {
    const user = userEvent.setup();
    mountForm({ availability: { proofRequired: true } });

    await fillCommon(user);
    await user.click(submitButton());

    expect(await screen.findByText('La capture est obligatoire pour cette copropriété.')).toBeInTheDocument();
    expect(createDeclaration).not.toHaveBeenCalled();
  }, 30000);

  it('envoie le fichier tel quel quand il n’y a pas de lecture automatique', async () => {
    const user = userEvent.setup();
    mountForm();
    const file = proofFile();

    await user.upload(screen.getByTestId('declaration-proof-input'), file);
    expect(screen.getByText(/sms\.png/)).toBeInTheDocument();
    await fillCommon(user);
    await user.click(submitButton());

    await waitFor(() => expect(createDeclaration).toHaveBeenCalled(), WAIT);
    expect(readPaymentProof).not.toHaveBeenCalled();
    expect(createDeclaration.mock.calls[0][1]).toBe(file);
  }, 30000);
});

describe('DeclarationForm — lecture automatique', () => {
  const ai = { availability: { aiPrefillAvailable: true } };

  it('préremplit les champs lus, retire la mention d’un champ retouché et envoie proofReadId sans fichier', async () => {
    const user = userEvent.setup();
    readPaymentProof.mockResolvedValue(reading());
    mountForm(ai);

    await user.upload(screen.getByTestId('declaration-proof-input'), proofFile());

    await waitFor(() => expect(screen.getByLabelText(/Montant envoyé/)).toHaveValue('45 000'), WAIT);
    expect(readPaymentProof).toHaveBeenCalledWith('s1', expect.any(File));
    expect(screen.getByLabelText('Référence de la transaction')).toHaveValue('MP2610ABCD');
    expect(screen.getByLabelText('Numéro qui a payé')).toHaveValue('0505050505');
    for (const field of ['amount', 'paidAt', 'reference', 'payerPhone']) {
      expect(
        within(screen.getByTestId(`ai-hint-${field}`)).getByText('Lu automatiquement, vérifiez')
      ).toBeInTheDocument();
    }

    setValue(/Montant envoyé/, '46000');
    expect(screen.queryByTestId('ai-hint-amount')).not.toBeInTheDocument();
    expect(screen.getByTestId('ai-hint-reference')).toBeInTheDocument();

    await user.click(submitButton());
    await waitFor(() => expect(createDeclaration).toHaveBeenCalled(), WAIT);
    const [input, file] = createDeclaration.mock.calls[0];
    expect(input).toMatchObject({ proofReadId: 'read-1', amount: 46000, transactionReference: 'MP2610ABCD' });
    expect(file).toBeNull();
  }, 30000);

  it('n’écrase jamais une saisie humaine', async () => {
    const user = userEvent.setup();
    readPaymentProof.mockResolvedValue(reading());
    mountForm(ai);
    setValue(/Montant envoyé/, '12000');

    await user.upload(screen.getByTestId('declaration-proof-input'), proofFile());
    await waitFor(() => expect(screen.getByLabelText('Numéro qui a payé')).toHaveValue('0505050505'), WAIT);

    expect(screen.getByLabelText(/Montant envoyé/)).toHaveValue('12 000');
    expect(screen.queryByTestId('ai-hint-amount')).not.toBeInTheDocument();
  }, 30000);

  it('affiche l’avertissement de numéro de réception inconnu', async () => {
    const user = userEvent.setup();
    readPaymentProof.mockResolvedValue(reading({ warnings: ['RECIPIENT_NOT_A_RECEIVING_NUMBER'] }));
    mountForm(ai);

    await user.upload(screen.getByTestId('declaration-proof-input'), proofFile());

    expect(
      await screen.findByText(
        'La capture montre un autre numéro de réception que ceux de la copropriété. Vérifiez le numéro choisi.',
        {},
        WAIT
      )
    ).toBeInTheDocument();
  });

  it('ne préremplit rien quand la capture est illisible mais retient la lecture', async () => {
    const user = userEvent.setup();
    readPaymentProof.mockResolvedValue(reading({ quality: 'UNREADABLE', amount: null, readId: 'read-9' }));
    mountForm(ai);

    await user.upload(screen.getByTestId('declaration-proof-input'), proofFile());

    expect(await screen.findByText(/n'a pas pu être lue comme une preuve de paiement/, {}, WAIT)).toBeInTheDocument();
    expect(screen.getByLabelText(/Montant envoyé/)).toHaveValue('');
    expect(screen.queryByTestId('ai-hint-amount')).not.toBeInTheDocument();
  });

  it('reste utilisable quand la lecture échoue : le fichier est envoyé avec la déclaration', async () => {
    const user = userEvent.setup();
    readPaymentProof.mockRejectedValue({
      response: { status: 409, data: { success: false, message: 'Indisponible', code: 'PROOF_READ_UNAVAILABLE' } }
    });
    mountForm(ai);
    const file = proofFile();

    await user.upload(screen.getByTestId('declaration-proof-input'), file);
    expect(
      await screen.findByText("La lecture automatique n'a pas abouti, remplissez les champs.", {}, WAIT)
    ).toBeInTheDocument();

    await fillCommon(user);
    await user.click(submitButton());
    await waitFor(() => expect(createDeclaration).toHaveBeenCalled(), WAIT);
    const [input, sent] = createDeclaration.mock.calls[0];
    expect(input).not.toHaveProperty('proofReadId');
    expect(sent).toBe(file);
  }, 30000);
});

describe('DeclarationForm — erreurs serveur', () => {
  it('affiche la référence déjà utilisée sous le champ et dans l’alerte', async () => {
    const user = userEvent.setup();
    const message = 'Cette référence a déjà été déclarée.';
    createDeclaration.mockRejectedValue({
      response: { status: 409, data: { success: false, message, code: 'DECLARATION_REFERENCE_USED' } }
    });
    mountForm();

    await fillCommon(user);
    await user.click(submitButton());

    await waitFor(() => expect(screen.getAllByText(message)).toHaveLength(2), WAIT);
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  }, 30000);

  it('oublie la lecture expirée et renvoie le fichier au prochain essai', async () => {
    const user = userEvent.setup();
    readPaymentProof.mockResolvedValue(reading());
    createDeclaration.mockRejectedValueOnce({
      response: { status: 409, data: { success: false, message: 'Lecture inconnue', code: 'PROOF_READ_INVALID' } }
    });
    mountForm({ availability: { aiPrefillAvailable: true } });
    const file = proofFile();

    await user.upload(screen.getByTestId('declaration-proof-input'), file);
    await waitFor(() => expect(screen.getByLabelText(/Montant envoyé/)).toHaveValue('45 000'), WAIT);
    await user.click(submitButton());
    expect(
      await screen.findByText('La lecture de la capture a expiré : envoyez de nouveau la déclaration.', {}, WAIT)
    ).toBeInTheDocument();

    // Le bouton est réactivé dans le même rendu que l'alerte : on attend seulement qu'il ne soit plus désactivé.
    await waitFor(() => expect(submitButton()).toBeEnabled(), WAIT);
    await user.click(submitButton());
    await waitFor(() => expect(createDeclaration).toHaveBeenCalledTimes(2), WAIT);
    expect(createDeclaration.mock.calls[1][0]).not.toHaveProperty('proofReadId');
    expect(createDeclaration.mock.calls[1][1]).toBe(file);
  }, 30000);
});
