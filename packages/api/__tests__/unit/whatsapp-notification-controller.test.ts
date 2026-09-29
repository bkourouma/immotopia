/**
 * Notifications WhatsApp : « tester l'envoi », invitation groupe en masse et
 * message groupé.
 *
 * BUG-2026-09-29-011/012 : quand le fournisseur (ou la destination du groupe)
 * n'est pas configuré, l'utilisateur voyait un nom de variable d'environnement
 * (« WHATSAPP_GROUP_BROADCAST_TO non configure ») ; l'invitation en masse
 * partait en boucle et comptait autant d'échecs que de contacts.
 */

import type { Request, Response } from 'express';

const mockConfigure = jest.fn();
const mockSendText = jest.fn();
const mockInviteAll = jest.fn();
const mockBroadcast = jest.fn();

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/whatsapp-notification-config-service', () => ({
  listWhatsappNotificationConfigs: jest.fn(),
  updateWhatsappNotificationConfig: jest.fn(),
  resetWhatsappNotificationConfig: jest.fn()
}));
jest.mock('../../src/services/providers/whatsapp.provider', () => ({
  configureWhatsAppProvider: (...a: unknown[]) => mockConfigure(...a),
  getConfiguredWhatsAppProvider: jest.fn(() => 'wasender'),
  sendText: (...a: unknown[]) => mockSendText(...a)
}));
jest.mock('../../src/services/whatsapp-group-automation-service', () => ({
  sendGroupInviteToEligibleContacts: (...a: unknown[]) => mockInviteAll(...a)
}));
jest.mock('../../src/services/whatsapp-group-broadcast-service', () => ({
  sendManualGroupBroadcast: (...a: unknown[]) => mockBroadcast(...a)
}));

import {
  sendGroupBroadcastHandler,
  sendGroupInviteToAllHandler,
  testSendHandler
} from '../../src/controllers/whatsapp-notification-config-controller';
import { BadRequestError } from '../../src/middleware/error-middleware';

function mockRes() {
  const res = { statusCode: 200, body: undefined as unknown } as Response & { statusCode: number; body: unknown };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as never;
  res.json = jest.fn((payload: unknown) => {
    res.body = payload;
    return res;
  }) as never;
  return res;
}

const req = (body: Record<string, unknown> = {}) => ({ params: { tenantId: 'tenant-1' }, body }) as unknown as Request;

beforeEach(() => {
  jest.clearAllMocks();
  mockConfigure.mockReturnValue(true);
  mockSendText.mockResolvedValue({ messageId: 'm1' });
  mockInviteAll.mockResolvedValue({ totalEligible: 2, processed: 2, sent: 2, skipped: 0, failed: 0 });
});

describe('test-send', () => {
  it('répond en français, sans nom de variable d’environnement, quand le fournisseur n’est pas configuré', async () => {
    mockConfigure.mockReturnValue(false);
    const res = mockRes();

    await testSendHandler(req({ to: '0700000000', message: 'Essai' }), res);

    expect(res.statusCode).toBe(400);
    const message = (res.body as { message: string }).message;
    expect(message).toMatch(/pas configuré/);
    expect(message).not.toMatch(/WASENDER|TWILIO|WHATSAPP_/);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it('envoie le message quand le fournisseur est configuré', async () => {
    const res = mockRes();
    await testSendHandler(req({ to: '0700000000', message: 'Essai' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });

  it('refuse un numéro ou un message vide avec des messages accentués', async () => {
    const noNumber = mockRes();
    await testSendHandler(req({ message: 'x' }), noNumber);
    expect((noNumber.body as { message: string }).message).toBe('Numéro requis.');

    const noMessage = mockRes();
    await testSendHandler(req({ to: '0700000000' }), noMessage);
    expect((noMessage.body as { message: string }).message).toBe('Message requis.');
  });
});

describe('group-invite/send-all', () => {
  it('refuse en amont quand le fournisseur n’est pas configuré, sans lancer la boucle d’envoi', async () => {
    mockConfigure.mockReturnValue(false);
    const res = mockRes();

    await sendGroupInviteToAllHandler(req({}), res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { message: string }).message).toMatch(/pas configuré/);
    expect(mockInviteAll).not.toHaveBeenCalled();
  });

  it('lance l’envoi en masse quand tout est configuré', async () => {
    const res = mockRes();
    await sendGroupInviteToAllHandler(req({}), res);
    expect(mockInviteAll).toHaveBeenCalledTimes(1);
    expect((res.body as { data: { sent: number } }).data.sent).toBe(2);
  });
});

describe('group-broadcast/send', () => {
  it('relaie en 400 le refus typé du service, avec un message qui ne cite aucune variable', async () => {
    mockBroadcast.mockRejectedValue(
      new BadRequestError("L'envoi groupé WhatsApp n'est pas configuré pour cette agence.")
    );
    const res = mockRes();

    await sendGroupBroadcastHandler(req({ message: 'Bonjour' }), res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { message: string }).message).toBe(
      "L'envoi groupé WhatsApp n'est pas configuré pour cette agence."
    );
  });
});
