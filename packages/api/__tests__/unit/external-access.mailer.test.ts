/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/external-access/mailer — envoi du lien d'un accès tiers par e-mail.
 * Aucun envoi réel : `emailService` est simulé ; la configuration d'agence
 * (événement désactivé, gabarit personnalisé) l'est aussi.
 */

const sendEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...a: any[]) => sendEmail(...a) }
}));

const getEmailNotificationConfig = jest.fn();
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...a: any[]) => getEmailNotificationConfig(...a)
}));

// `notification-channels` importe aussi le service WhatsApp : on le coupe de tout transport.
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({ sendWhatsappNotification: jest.fn() }));
jest.mock('../../src/services/whatsapp-notification-config-service', () => ({
  getWhatsappNotificationConfig: jest.fn()
}));

const loggerCalls: unknown[][] = [];
jest.mock('../../src/utils/logger', () => {
  const record = (...a: unknown[]) => {
    loggerCalls.push(a);
  };
  return { logger: { info: record, warn: record, error: record, debug: record } };
});

import { externalAccessTypeLabel, sendExternalAccessLinkEmail } from '../../src/lib/external-access/mailer';

const TOKEN = 'JETON-' + 'x'.repeat(37);
const URL = `https://app.example.test/acces-partage#${TOKEN}`;

const args = (overrides: Record<string, unknown> = {}) => ({
  tenantId: 'tenant-a',
  agencyName: 'Agence <Alpha>',
  recipientName: 'Maître <b>Koné</b>',
  recipientEmail: 'notaire@example.test',
  type: 'NOTARY' as const,
  accessUrl: URL,
  linkExpiresAt: new Date('2026-10-20T10:00:00.000Z'),
  ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
  loggerCalls.length = 0;
  sendEmail.mockReset().mockResolvedValue(undefined);
  getEmailNotificationConfig
    .mockReset()
    .mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
});

describe('sendExternalAccessLinkEmail', () => {
  it('envoie au destinataire du grant : URL dans le corps, jamais dans le sujet', async () => {
    const result = await sendExternalAccessLinkEmail(args());

    expect(result).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('notaire@example.test');
    expect(mail.tenantId).toBe('tenant-a');
    expect(mail.subject).toContain('Agence <Alpha>');
    expect(mail.subject).not.toContain(TOKEN);
    expect(mail.subject).not.toContain('acces-partage');
    expect(mail.html).toContain(`href="${URL}"`);
    expect(mail.html).toContain('Notaire');
    expect(mail.html).toContain('20/10/2026');
    expect(getEmailNotificationConfig).toHaveBeenCalledWith('tenant-a', 'EXTERNAL_ACCESS_LINK_SENT');
  });

  it('échappe les valeurs saisies dans le corps HTML (nom du bénéficiaire, agence)', async () => {
    await sendExternalAccessLinkEmail(args());
    const html = sendEmail.mock.calls[0][0].html as string;
    expect(html).not.toContain('<b>Koné</b>');
    expect(html).toContain('&lt;b&gt;Koné&lt;/b&gt;');
    expect(html).toContain('Agence &lt;Alpha&gt;');
  });

  it('événement désactivé par l’agence : rien n’est envoyé', async () => {
    getEmailNotificationConfig.mockResolvedValue({ enabled: false, subjectOverride: null, bodyHtmlOverride: null });
    await expect(sendExternalAccessLinkEmail(args())).resolves.toEqual({ sent: false, reason: 'EVENT_DISABLED' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('un sujet personnalisé qui réclame {{accessUrl}} ne reçoit jamais l’URL', async () => {
    getEmailNotificationConfig.mockResolvedValue({
      enabled: true,
      subjectOverride: 'Votre accès {{accessUrl}}',
      bodyHtmlOverride: '<p><a href="{{accessUrl}}">Ouvrir</a></p>'
    });
    await sendExternalAccessLinkEmail(args());
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.subject).toBe('Votre accès ');
    expect(mail.html).toContain(URL);
  });

  it('un échec du transport ne lève pas, et ne journalise ni l’adresse, ni l’URL, ni le message du transport', async () => {
    sendEmail.mockRejectedValue(new Error(`SMTP refuse notaire@example.test ${URL}`));
    const result = await sendExternalAccessLinkEmail(args());

    expect(result).toEqual({ sent: false, reason: 'SEND_FAILED' });
    const logged = JSON.stringify(loggerCalls);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain('notaire@example.test');
    expect(logged).not.toContain('SMTP refuse');
    expect(logged).toContain('tenant-a');
  });

  it('une panne de lecture de la configuration est traitée comme un échec d’envoi, sans fuite', async () => {
    getEmailNotificationConfig.mockRejectedValue(new Error('base indisponible'));
    await expect(sendExternalAccessLinkEmail(args())).resolves.toEqual({ sent: false, reason: 'SEND_FAILED' });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('externalAccessTypeLabel', () => {
  it('un libellé par type de tiers', () => {
    expect(externalAccessTypeLabel('NOTARY')).toBe('Notaire');
    expect(externalAccessTypeLabel('ACCOUNTANT')).toBe('Expert-comptable');
    expect(externalAccessTypeLabel('BANKER')).toBe('Banquier');
  });
});
