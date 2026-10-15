/**
 * Lot M6 : destinataire de la relance (copropriétaire réel du lot) et lien de
 * paiement facultatif dans l'avis d'appel et la relance (variable `paymentUrl`
 * / bloc `paymentBlock`).
 */
const mockPrisma = {
  chargeCall: { findUnique: jest.fn(), updateMany: jest.fn(async () => ({ count: 1 })) },
  paymentReminder: { findUnique: jest.fn() },
  lotOwnerProfile: { findMany: jest.fn(async () => [] as any[]) }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const mockSendEmail = jest.fn(async (_args: any) => undefined);
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (args: any) => mockSendEmail(args) },
  isEmailDeliveryConfigured: () => true
}));
const mockEmailConfig = jest.fn();
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...args: unknown[]) => mockEmailConfig(...args)
}));
const mockSendWhatsapp = jest.fn(async (_args: any) => true);
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: (args: any) => mockSendWhatsapp(args)
}));

import {
  notifyChargeCall,
  notifyChargeCallReminder,
  resolveChargeCallRecipient
} from '../../src/lib/syndics/notifications';
import { resolveChargeCallPaymentUrl } from '../../src/lib/syndics/charge-call-payment-url';

const contact = (id: string, email: string | null = `${id}@x.ci`) => ({
  id,
  firstName: id,
  lastName: 'Nom',
  legalName: null,
  email,
  whatsappNumber: null,
  phonePrimary: '0102030405'
});

const baseCall = (lot: Record<string, unknown>) => ({
  id: 'cc1',
  syndicateId: 'syn1',
  lotId: 'lot1',
  period: '2026-10',
  amount: 50000,
  currency: 'XOF',
  dueDate: new Date('2026-10-31T00:00:00Z'),
  allocations: [],
  syndicate: { id: 'syn1', tenantId: 't1', name: 'Résidence Les Palmiers' },
  lot: { lotNumber: 'A12', property: null, ownerContactId: null, coownerId: null, owner: null, coowner: null, ...lot }
});

const lastEmail = () =>
  mockSendEmail.mock.calls[mockSendEmail.mock.calls.length - 1]![0] as { html: string; to: string };
const lastWhatsapp = () =>
  mockSendWhatsapp.mock.calls[0]![0] as { variables: Record<string, string>; contactId?: string };

beforeEach(() => {
  jest.clearAllMocks();
  mockEmailConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  mockPrisma.lotOwnerProfile.findMany.mockResolvedValue([]);
});

describe('resolveChargeCallRecipient', () => {
  it('privilégie ownerContactId, à défaut coownerId', () => {
    const owner = contact('prop');
    const coowner = contact('copro');
    expect(resolveChargeCallRecipient({ ownerContactId: 'a', owner, coownerId: 'b', coowner })).toBe(owner);
    expect(resolveChargeCallRecipient({ ownerContactId: null, owner: null, coownerId: 'b', coowner })).toBe(coowner);
    expect(resolveChargeCallRecipient({ ownerContactId: null, coownerId: null })).toBeNull();
    expect(resolveChargeCallRecipient(null)).toBeNull();
  });
});

describe('resolveChargeCallPaymentUrl (défaut)', () => {
  it('ne renvoie aucun lien tant que le paiement en ligne n’est pas branché', async () => {
    await expect(
      resolveChargeCallPaymentUrl({ tenantId: 't1', syndicateId: 's', lotId: 'l', chargeCallIds: ['c'] })
    ).resolves.toBeNull();
  });
});

describe('notifyChargeCallReminder : destinataire', () => {
  const reminder = (lot: Record<string, unknown>) => ({
    id: 'r1',
    reminderLevel: 1,
    chargeCall: baseCall(lot)
  });

  it('relance le copropriétaire réel (coownerId) quand ownerContactId est vide', async () => {
    mockPrisma.paymentReminder.findUnique.mockResolvedValue(
      reminder({ coownerId: 'copro', coowner: contact('copro') })
    );

    const result = await notifyChargeCallReminder('r1');

    expect(result).toEqual({ emailSent: true, whatsappSent: true });
    expect(lastEmail().to).toBe('copro@x.ci');
    expect(lastWhatsapp().contactId).toBe('copro');
  });

  it('ne relance personne si le lot n’a ni propriétaire ni copropriétaire', async () => {
    mockPrisma.paymentReminder.findUnique.mockResolvedValue(reminder({}));

    const result = await notifyChargeCallReminder('r1');

    expect(result).toMatchObject({ skipped: 'NO_OWNER_CONTACT' });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockSendWhatsapp).not.toHaveBeenCalled();
  });

  it('ne relance pas un contact qui n’est plus copropriétaire actuel du lot', async () => {
    mockPrisma.paymentReminder.findUnique.mockResolvedValue(
      reminder({ ownerContactId: 'ancien', owner: contact('ancien') })
    );
    mockPrisma.lotOwnerProfile.findMany.mockResolvedValue([{ contactId: 'nouveau', ownedUntil: null }]);

    const result = await notifyChargeCallReminder('r1');

    expect(result).toMatchObject({ skipped: 'OWNER_NOT_CURRENT' });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe('lien de paiement : relance', () => {
  const reminder = () => ({
    id: 'r1',
    reminderLevel: 2,
    chargeCall: baseCall({ ownerContactId: 'prop', owner: contact('prop') })
  });

  it('sans lien : aucun bloc dans l’e-mail ni dans WhatsApp', async () => {
    mockPrisma.paymentReminder.findUnique.mockResolvedValue(reminder());

    await notifyChargeCallReminder('r1');

    expect(lastEmail().html).not.toContain('Payer en ligne');
    expect(lastEmail().html).not.toMatch(/<p\b[^>]*>\s*<\/p>/);
    expect(lastWhatsapp().variables.paymentUrl).toBe('');
    expect(lastWhatsapp().variables.paymentBlock).toBe('');
  });

  it('avec lien : bloc « Payer en ligne » avec l’URL échappée dans l’e-mail, brute dans WhatsApp', async () => {
    mockPrisma.paymentReminder.findUnique.mockResolvedValue(reminder());
    const resolvePaymentUrl = jest.fn(async () => 'https://app.immotopia.test/pay?token=abc&x=<1>');

    await notifyChargeCallReminder('r1', { resolvePaymentUrl });

    expect(resolvePaymentUrl).toHaveBeenCalledWith({
      tenantId: 't1',
      syndicateId: 'syn1',
      lotId: 'lot1',
      chargeCallIds: ['cc1']
    });
    expect(lastEmail().html).toContain('Payer en ligne : https://app.immotopia.test/pay?token=abc&amp;x=&lt;1&gt;');
    expect(lastEmail().html).not.toContain('x=<1>');
    const vars = lastWhatsapp().variables;
    expect(vars.paymentUrl).toBe('https://app.immotopia.test/pay?token=abc&x=<1>');
    expect(vars.paymentBlock).toBe('\n\nPayer en ligne : https://app.immotopia.test/pay?token=abc&x=<1>');
  });
});

describe('lien de paiement : avis d’appel', () => {
  const call = () => baseCall({ ownerContactId: 'prop', owner: contact('prop') });

  it('sans lien : le message part sans bloc', async () => {
    mockPrisma.chargeCall.findUnique.mockResolvedValue(call());

    const result = await notifyChargeCall('cc1');

    expect(result).toEqual({ emailSent: true, whatsappSent: true });
    expect(lastEmail().html).not.toContain('Payer en ligne');
    expect(lastWhatsapp().variables.paymentBlock).toBe('');
  });

  it('avec lien : bloc présent dans l’e-mail et WhatsApp', async () => {
    mockPrisma.chargeCall.findUnique.mockResolvedValue(call());

    await notifyChargeCall('cc1', { resolvePaymentUrl: async () => 'https://app.immotopia.test/pay/xyz' });

    expect(lastEmail().html).toContain('Payer en ligne : https://app.immotopia.test/pay/xyz');
    expect(lastWhatsapp().variables.paymentBlock).toContain('Payer en ligne : https://app.immotopia.test/pay/xyz');
  });

  it('un résolveur qui échoue ou renvoie une valeur invalide n’empêche pas l’envoi', async () => {
    mockPrisma.chargeCall.findUnique.mockResolvedValue(call());

    const failing = await notifyChargeCall('cc1', {
      resolvePaymentUrl: async () => {
        throw new Error('boom');
      }
    });
    expect(failing).toEqual({ emailSent: true, whatsappSent: true });
    expect(lastEmail().html).not.toContain('Payer en ligne');

    await notifyChargeCall('cc1', { resolvePaymentUrl: async () => 'javascript:alert(1)' });
    expect(lastEmail().html).not.toContain('javascript:');
  });

  it('un gabarit personnalisé sans paymentBlock reste intact (variable inconnue = vide)', async () => {
    mockPrisma.chargeCall.findUnique.mockResolvedValue(call());
    mockEmailConfig.mockResolvedValue({
      enabled: true,
      subjectOverride: 'Avis {{period}}',
      bodyHtmlOverride: '<p>Bonjour {{ownerName}}, {{inconnue}}</p><p></p>'
    });

    await notifyChargeCall('cc1');
    expect(lastEmail().html).toBe('<p>Bonjour prop Nom, </p><p></p>');

    await notifyChargeCall('cc1', { resolvePaymentUrl: async () => 'https://app.immotopia.test/pay/xyz' });
    expect(lastEmail().html).toBe('<p>Bonjour prop Nom, </p><p></p>');
  });
});
