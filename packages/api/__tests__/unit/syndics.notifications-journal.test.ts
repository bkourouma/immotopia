/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BUG-2026-10-19-005 : aucune notification ne se perd. Sans envoi réel (SMTP
 * absent, e-mail désactivé, pas d'adresse), un appel de charges, une relance
 * et un reçu laissent une ligne persistante SKIPPED avec sa raison, via le
 * service central (`logNotificationDelivery`). Un envoi réel garde sa propre
 * ligne (journal de `emailService`) : pas de doublon.
 */
const mockPrisma = {
  chargeCall: { findUnique: jest.fn(), updateMany: jest.fn(async () => ({ count: 1 })) },
  paymentReminder: { findUnique: jest.fn() },
  lotOwnerProfile: { findMany: jest.fn(async () => [] as any[]) },
  crmContact: { findFirst: jest.fn() },
  syndicChargeReceipt: { updateMany: jest.fn(async () => ({ count: 1 })) }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const mockSendEmail = jest.fn(async (_args: any) => undefined);
const mockConfigured = jest.fn(() => true);
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (args: any) => mockSendEmail(args) },
  isEmailDeliveryConfigured: () => mockConfigured()
}));
const mockEmailConfig = jest.fn();
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...args: unknown[]) => mockEmailConfig(...args)
}));
const mockSendWhatsapp = jest.fn(async (_args: any) => false);
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: (args: any) => mockSendWhatsapp(args)
}));
const mockLogDelivery = jest.fn(async (_input: any) => undefined);
jest.mock('../../src/lib/notifications/log-delivery', () => ({
  logNotificationDelivery: (input: any) => mockLogDelivery(input)
}));

import { notifyChargeCall, notifyChargeCallReminder } from '../../src/lib/syndics/notifications';
import { sendReceiptEmail } from '../../src/lib/syndics/charge-receipt-delivery';

const owner = (email: string | null) => ({
  id: 'prop',
  firstName: 'Awa',
  lastName: 'Kone',
  legalName: null,
  email,
  whatsappNumber: null,
  phonePrimary: null
});

const call = (email: string | null) => ({
  id: 'cc1',
  syndicateId: 'syn1',
  lotId: 'lot1',
  lot: {
    lotNumber: 'A12',
    property: null,
    ownerContactId: 'prop',
    coownerId: null,
    owner: owner(email),
    coowner: null
  },
  period: '2026-10',
  amount: 50000,
  currency: 'XOF',
  dueDate: new Date('2026-10-31T00:00:00Z'),
  allocations: [],
  syndicate: { id: 'syn1', tenantId: 't1', name: 'Résidence Les Palmiers' }
});

/** Exécute le `run()` du dernier journal écrit pour lire le statut qu'il enregistre. */
async function lastOutcome() {
  const input = mockLogDelivery.mock.calls[mockLogDelivery.mock.calls.length - 1]![0];
  return { input, outcome: await input.run() };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfigured.mockReturnValue(true);
  mockEmailConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  mockSendWhatsapp.mockResolvedValue(false);
  mockPrisma.lotOwnerProfile.findMany.mockResolvedValue([]);
  mockPrisma.chargeCall.findUnique.mockResolvedValue(call('awa@x.ci'));
});

describe('appel de charges émis', () => {
  it('SMTP absent : ligne SKIPPED « canal indisponible », non rejouable, sans lien de paiement', async () => {
    mockConfigured.mockReturnValue(false);

    const result = await notifyChargeCall('cc1');

    expect(result.skipped).toBe('EMAIL_NOT_CONFIGURED');
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLogDelivery).toHaveBeenCalledTimes(1);
    const { input, outcome } = await lastOutcome();
    expect(input).toMatchObject({
      tenantId: 't1',
      key: 'CHARGE_CALL_ISSUED',
      channel: 'EMAIL',
      replayable: false,
      recipient: { contactId: 'prop' },
      relatedEntity: { type: 'ChargeCall', id: 'cc1' }
    });
    expect(input.body.length).toBeLessThan(200);
    expect(input.body).not.toMatch(/https?:|token/i);
    expect(outcome).toMatchObject({ status: 'SKIPPED' });
    expect(outcome.failureReason).toMatch(/Canal indisponible/);
  });

  it('e-mail désactivé par l’agence : SKIPPED avec sa raison', async () => {
    mockEmailConfig.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });
    await notifyChargeCall('cc1');
    const { outcome } = await lastOutcome();
    expect(outcome).toMatchObject({ status: 'SKIPPED' });
    expect(outcome.failureReason).toMatch(/désactivé/);
  });

  it('copropriétaire sans adresse : SKIPPED « aucune adresse », journalisé par contact', async () => {
    mockPrisma.chargeCall.findUnique.mockResolvedValue(call(null));
    await notifyChargeCall('cc1');
    const { input, outcome } = await lastOutcome();
    expect(input.recipient).toEqual({ contactId: 'prop' });
    expect(outcome.failureReason).toMatch(/Aucune adresse/);
  });

  it('envoi réel : le journal de l’e-mail suffit, aucune ligne en double', async () => {
    const result = await notifyChargeCall('cc1');
    expect(result).toEqual({ emailSent: true, whatsappSent: false });
    expect(mockLogDelivery).not.toHaveBeenCalled();
  });

  it('WhatsApp envoyé : sa propre ligne suffit', async () => {
    mockConfigured.mockReturnValue(false);
    mockSendWhatsapp.mockResolvedValue(true);
    await notifyChargeCall('cc1');
    expect(mockLogDelivery).not.toHaveBeenCalled();
  });

  it('échec d’envoi : le journal de l’e-mail porte FAILED, pas de ligne supplémentaire', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('boom'));
    const result = await notifyChargeCall('cc1');
    expect(result.skipped).toBe('SEND_FAILED');
    expect(mockLogDelivery).not.toHaveBeenCalled();
  });
});

describe('relance', () => {
  const reminder = (email: string | null) => ({ id: 'r1', reminderLevel: 1, chargeCall: call(email) });

  it('e-mail désactivé : SKIPPED, non rejouable, entité PaymentReminder', async () => {
    mockEmailConfig.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });
    mockPrisma.paymentReminder.findUnique.mockResolvedValue(reminder('awa@x.ci'));

    const result = await notifyChargeCallReminder('r1');

    expect(result).toMatchObject({ skipped: 'NOTIFICATION_DISABLED' });
    const { input, outcome } = await lastOutcome();
    expect(input).toMatchObject({
      key: 'CHARGE_CALL_REMINDER',
      replayable: false,
      relatedEntity: { type: 'PaymentReminder', id: 'r1' }
    });
    expect(outcome.status).toBe('SKIPPED');
  });

  it('sans adresse : SKIPPED ; avec envoi réel : aucune ligne en plus', async () => {
    mockPrisma.paymentReminder.findUnique.mockResolvedValue(reminder(null));
    await notifyChargeCallReminder('r1');
    expect(mockLogDelivery).toHaveBeenCalledTimes(1);

    mockLogDelivery.mockClear();
    mockPrisma.paymentReminder.findUnique.mockResolvedValue(reminder('awa@x.ci'));
    await notifyChargeCallReminder('r1');
    expect(mockLogDelivery).not.toHaveBeenCalled();
  });
});

describe('reçu', () => {
  const receipt: any = {
    id: 'rc1',
    tenantId: 't1',
    syndicateId: 'syn1',
    kind: 'PAYMENT_RECEIPT',
    contactId: 'prop',
    number: 'R-1',
    snapshot: {}
  };

  it('envoi automatique désactivé : SKIPPED journalisé', async () => {
    mockEmailConfig.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });
    const result = await sendReceiptEmail(receipt);
    expect(result).toEqual({ sent: false, reason: 'DISABLED' });
    const { input, outcome } = await lastOutcome();
    expect(input).toMatchObject({
      channel: 'EMAIL',
      replayable: false,
      relatedEntity: { type: 'ChargeReceipt', id: 'rc1' }
    });
    expect(outcome.status).toBe('SKIPPED');
  });

  it('contact sans e-mail : SKIPPED journalisé', async () => {
    mockPrisma.crmContact.findFirst.mockResolvedValue({ email: '  ' });
    const result = await sendReceiptEmail(receipt);
    expect(result).toEqual({ sent: false, reason: 'NO_EMAIL' });
    const { outcome } = await lastOutcome();
    expect(outcome.failureReason).toMatch(/Aucune adresse/);
  });
});
