/**
 * Newsletter : inscription publique, confirmation et désinscription.
 *
 * BUG-2026-09-29-013 : une liste créée sans double opt-in envoyait quand même
 * un e-mail de confirmation, et un second clic sur le lien de confirmation
 * affichait « lien invalide » pour une inscription pourtant confirmée.
 */

const mockPrisma = {
  newsletterList: { findFirst: jest.fn() },
  newsletterSubscriber: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn()
  },
  newsletterCampaignRecipient: { findFirst: jest.fn() }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
const mockSendEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({ emailService: { sendEmail: mockSendEmail } }));
jest.mock('../../src/services/newsletter-campaign.service', () => ({ resolveRecipients: jest.fn() }));

import {
  confirmSubscription,
  subscribePublic,
  unsubscribeByToken
} from '../../src/services/newsletter-subscriber.service';

const list = (doubleOptIn: boolean) => ({
  id: 'list-1',
  tenantId: 'tenant-1',
  type: 'MANUAL',
  doubleOptIn,
  publicSubscribeToken: 'lst_abc'
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.newsletterSubscriber.findUnique.mockResolvedValue(null);
  mockPrisma.newsletterSubscriber.create.mockResolvedValue({});
  mockPrisma.newsletterSubscriber.update.mockResolvedValue({});
  mockSendEmail.mockResolvedValue(undefined);
});

describe('subscribePublic', () => {
  it('active tout de suite l’abonné quand la liste est sans double opt-in, sans e-mail de confirmation', async () => {
    mockPrisma.newsletterList.findFirst.mockResolvedValue(list(false));

    const result = await subscribePublic({ listToken: 'lst_abc', email: 'Abonne@Example.test', name: 'Abonné Test' });

    expect(result.success).toBe(true);
    expect(result.pendingConfirmation).toBeFalsy();
    const data = mockPrisma.newsletterSubscriber.create.mock.calls[0][0].data;
    expect(data.status).toBe('ACTIVE');
    expect(data.email).toBe('abonne@example.test');
    expect(data.confirmedAt).toBeInstanceOf(Date);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('garde le double opt-in par défaut : en attente et e-mail de confirmation', async () => {
    mockPrisma.newsletterList.findFirst.mockResolvedValue(list(true));

    const result = await subscribePublic({ listToken: 'lst_abc', email: 'abonne@example.test' });

    expect(result.pendingConfirmation).toBe(true);
    expect(mockPrisma.newsletterSubscriber.create.mock.calls[0][0].data.status).toBe('PENDING_CONFIRMATION');
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('ré-inscrit un ancien désabonné par e-mail de confirmation, même sans double opt-in', async () => {
    mockPrisma.newsletterList.findFirst.mockResolvedValue(list(false));
    mockPrisma.newsletterSubscriber.findUnique.mockResolvedValue({
      id: 'sub-1',
      status: 'UNSUBSCRIBED',
      name: null
    });

    const result = await subscribePublic({ listToken: 'lst_abc', email: 'abonne@example.test' });

    expect(result.pendingConfirmation).toBe(true);
    expect(mockPrisma.newsletterSubscriber.update.mock.calls[0][0].data.status).toBe('PENDING_CONFIRMATION');
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});

describe('confirmSubscription', () => {
  it('garde le jeton après confirmation : un second clic répond « déjà inscrit », pas « invalide »', async () => {
    mockPrisma.newsletterSubscriber.findFirst.mockResolvedValueOnce({
      id: 'sub-1',
      status: 'PENDING_CONFIRMATION',
      confirmationTokenExpiresAt: null
    });
    const first = await confirmSubscription('tok');
    expect(first).toEqual({ success: true, alreadyActive: false });
    expect(mockPrisma.newsletterSubscriber.update.mock.calls[0][0].data).not.toHaveProperty('confirmationToken');

    mockPrisma.newsletterSubscriber.findFirst.mockResolvedValueOnce({ id: 'sub-1', status: 'ACTIVE' });
    const second = await confirmSubscription('tok');
    expect(second).toEqual({ success: true, alreadyActive: true });
  });

  it('ne réactive pas un abonné qui s’est désabonné entre-temps', async () => {
    mockPrisma.newsletterSubscriber.findFirst.mockResolvedValue({
      id: 'sub-1',
      status: 'UNSUBSCRIBED',
      confirmationTokenExpiresAt: null
    });

    const result = await confirmSubscription('tok');

    expect(result.success).toBe(false);
    expect(mockPrisma.newsletterSubscriber.update).not.toHaveBeenCalled();
  });
});

describe('unsubscribeByToken', () => {
  it('désabonne l’abonné rattaché au jeton du destinataire', async () => {
    mockPrisma.newsletterCampaignRecipient.findFirst.mockResolvedValue({
      tenantId: 'tenant-1',
      subscriberId: 'sub-1',
      subscriber: { email: 'abonne@example.test' }
    });

    const result = await unsubscribeByToken('valid-token');

    expect(result).toEqual({ success: true });
    const call = mockPrisma.newsletterSubscriber.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'sub-1', tenantId: 'tenant-1' });
    expect(call.data.status).toBe('UNSUBSCRIBED');
  });

  it('refuse un jeton inconnu', async () => {
    mockPrisma.newsletterCampaignRecipient.findFirst.mockResolvedValue(null);
    expect(await unsubscribeByToken('nope')).toEqual({ success: false });
  });
});

describe('subscribePublic — sécurité', () => {
  it('ne réactive jamais un abonné désabonné sans confirmation par e-mail, même sans double opt-in', async () => {
    mockPrisma.newsletterList.findFirst.mockResolvedValue(list(false));
    mockPrisma.newsletterSubscriber.findUnique.mockResolvedValue({
      id: 'sub-1',
      status: 'UNSUBSCRIBED',
      name: 'Victime'
    });

    const result = await subscribePublic({ listToken: 'lst_abc', email: 'victime@example.test' });

    expect(result.pendingConfirmation).toBe(true);
    const data = mockPrisma.newsletterSubscriber.update.mock.calls[0][0].data;
    expect(data.status).toBe('PENDING_CONFIRMATION');
    expect(data.confirmationToken).toEqual(expect.any(String));
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0].to).toBe('victime@example.test');
  });

  it('rejette < et > dans le nom saisi publiquement', async () => {
    mockPrisma.newsletterList.findFirst.mockResolvedValue(list(true));

    const result = await subscribePublic({
      listToken: 'lst_abc',
      email: 'x@example.test',
      name: '<a href="https://evil.test">cliquez</a>'
    });

    expect(result.success).toBe(false);
    expect(mockPrisma.newsletterSubscriber.create).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('échappe le prénom dans l’e-mail de confirmation', async () => {
    mockPrisma.newsletterList.findFirst.mockResolvedValue(list(true));

    await subscribePublic({ listToken: 'lst_abc', email: 'x@example.test', name: "O'Neil & Fils" });

    const html: string = mockSendEmail.mock.calls[0][0].html;
    expect(html).toContain('O&#39;Neil');
    expect(html).not.toContain('& Fils');
  });
});
