/**
 * `lib/patrimoine/notification-channels.ts` — routeur de canaux (lot A3).
 *
 * Tout est mocké à la frontière (config des notifications, envoi d'e-mail,
 * envoi WhatsApp) : aucun message réel, aucun appel réseau, aucune base.
 */

const getEmailNotificationConfig = jest.fn();
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...a: any[]) => getEmailNotificationConfig(...a)
}));

const getWhatsappNotificationConfig = jest.fn();
jest.mock('../../src/services/whatsapp-notification-config-service', () => ({
  getWhatsappNotificationConfig: (...a: any[]) => getWhatsappNotificationConfig(...a)
}));

const sendEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...a: any[]) => sendEmail(...a) }
}));

const sendWhatsappNotification = jest.fn();
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: (...a: any[]) => sendWhatsappNotification(...a)
}));

import {
  candidateChannels,
  deliverOnBestChannel,
  loadChannelConfigs,
  planChannels,
  type ChannelConfigs,
  type ChannelRecipient,
  type ChannelTargets
} from '../../src/lib/patrimoine/notification-channels';

const TENANT = 'tenant-1';
const TARGETS: ChannelTargets = { email: 'OWNER_MONTHLY_REPORT_SENT', whatsapp: 'OWNER_MONTHLY_REPORT_SENT' };
const ENABLED: ChannelConfigs = {
  EMAIL: { enabled: true, subjectOverride: null, bodyHtmlOverride: null },
  WHATSAPP: { enabled: true, bodyOverride: null, contentSid: null, contentVariablesJson: null }
};

function recipient(overrides: Partial<ChannelRecipient> = {}): ChannelRecipient {
  return {
    contactId: 'contact-1',
    email: 'owner@example.com',
    consentEmail: true,
    whatsappNumber: '+2250700000000',
    phonePrimary: null,
    consentWhatsapp: true,
    preferredContactChannel: null,
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  sendEmail.mockResolvedValue(undefined);
  sendWhatsappNotification.mockResolvedValue(true);
});

describe('candidateChannels', () => {
  it('sans préférence : e-mail puis WhatsApp', () => {
    expect(candidateChannels(null)).toEqual(['EMAIL', 'WHATSAPP']);
  });

  it('préférence WhatsApp : WhatsApp en premier, repli e-mail', () => {
    expect(candidateChannels('WHATSAPP')).toEqual(['WHATSAPP', 'EMAIL']);
  });

  it('préférence e-mail : e-mail en premier', () => {
    expect(candidateChannels('EMAIL')).toEqual(['EMAIL', 'WHATSAPP']);
  });

  it.each(['SMS', 'CALL'])('préférence %s : ignorée aujourd’hui (ordre par défaut)', preferred => {
    expect(candidateChannels(preferred)).toEqual(['EMAIL', 'WHATSAPP']);
  });
});

describe('planChannels', () => {
  it('préféré WhatsApp et éligible : WhatsApp d’abord, e-mail en repli', () => {
    const plan = planChannels(recipient({ preferredContactChannel: 'WHATSAPP' }), ENABLED, TARGETS);
    expect(plan.channels).toEqual(['WHATSAPP', 'EMAIL']);
  });

  it('WhatsApp préféré mais sans consentement : e-mail seul', () => {
    const plan = planChannels(
      recipient({ preferredContactChannel: 'WHATSAPP', consentWhatsapp: false }),
      ENABLED,
      TARGETS
    );
    expect(plan.channels).toEqual(['EMAIL']);
  });

  it('consentement WhatsApp non renseigné (null) : non éligible', () => {
    const plan = planChannels(recipient({ consentWhatsapp: null }), ENABLED, TARGETS);
    expect(plan.channels).toEqual(['EMAIL']);
  });

  it('numéro WhatsApp vide : repli sur phonePrimary, sinon non éligible', () => {
    expect(
      planChannels(recipient({ whatsappNumber: '  ', phonePrimary: '0700000000' }), ENABLED, TARGETS).channels
    ).toContain('WHATSAPP');
    expect(planChannels(recipient({ whatsappNumber: '  ', phonePrimary: null }), ENABLED, TARGETS).channels).toEqual([
      'EMAIL'
    ]);
  });

  it('e-mail sans consentement ou vide : non éligible', () => {
    expect(planChannels(recipient({ consentEmail: false }), ENABLED, TARGETS).channels).toEqual(['WHATSAPP']);
    expect(planChannels(recipient({ email: '  ' }), ENABLED, TARGETS).channels).toEqual(['WHATSAPP']);
  });

  it('configuration désactivée par canal : le canal coupé est écarté', () => {
    const configs: ChannelConfigs = { ...ENABLED, EMAIL: { ...ENABLED.EMAIL!, enabled: false } };
    expect(planChannels(recipient(), configs, TARGETS).channels).toEqual(['WHATSAPP']);
  });

  it('tous les canaux utilisables coupés par l’agence : EVENT_DISABLED', () => {
    const configs: ChannelConfigs = {
      EMAIL: { ...ENABLED.EMAIL!, enabled: false },
      WHATSAPP: { ...ENABLED.WHATSAPP!, enabled: false }
    };
    expect(planChannels(recipient(), configs, TARGETS)).toEqual({ channels: [], reason: 'EVENT_DISABLED' });
  });

  it('aucun consentement ni adresse : NO_ELIGIBLE_CHANNEL', () => {
    const plan = planChannels(recipient({ consentEmail: false, consentWhatsapp: false }), ENABLED, TARGETS);
    expect(plan).toEqual({ channels: [], reason: 'NO_ELIGIBLE_CHANNEL' });
  });

  it('canal sans clé d’événement dans le message : jamais tenté', () => {
    const plan = planChannels(recipient(), ENABLED, { email: 'OWNER_MONTHLY_REPORT_SENT' });
    expect(plan.channels).toEqual(['EMAIL']);
  });
});

describe('deliverOnBestChannel', () => {
  const variables = { ownerName: 'Awa <b>Koné</b>', period: '2026-09', reportUrl: 'https://x.test/r/abc?a=1&b=2' };
  const args = (r: ChannelRecipient, configs: ChannelConfigs = ENABLED) => ({
    tenantId: TENANT,
    recipient: r,
    configs,
    targets: TARGETS,
    variables
  });

  it('préféré WhatsApp éligible : WhatsApp seul (contactId transmis, pas de to), aucun e-mail', async () => {
    const result = await deliverOnBestChannel(args(recipient({ preferredContactChannel: 'WHATSAPP' })));

    expect(result).toEqual({ sent: true, channel: 'WHATSAPP' });
    expect(sendWhatsappNotification).toHaveBeenCalledTimes(1);
    const call = sendWhatsappNotification.mock.calls[0][0];
    expect(call).toMatchObject({
      tenantId: TENANT,
      notificationKey: 'OWNER_MONTHLY_REPORT_SENT',
      contactId: 'contact-1',
      variables
    });
    expect(call).not.toHaveProperty('to');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('WhatsApp préféré sans consentement : repli e-mail', async () => {
    const result = await deliverOnBestChannel(
      args(recipient({ preferredContactChannel: 'WHATSAPP', consentWhatsapp: false }))
    );

    expect(result).toEqual({ sent: true, channel: 'EMAIL' });
    expect(sendWhatsappNotification).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('e-mail préféré : e-mail seul, un seul message part', async () => {
    const result = await deliverOnBestChannel(args(recipient({ preferredContactChannel: 'EMAIL' })));

    expect(result).toEqual({ sent: true, channel: 'EMAIL' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendWhatsappNotification).not.toHaveBeenCalled();
  });

  it('e-mail : valeurs échappées dans le corps HTML, texte brut dans le sujet', async () => {
    await deliverOnBestChannel(args(recipient({ preferredContactChannel: 'EMAIL' })));

    const mail = sendEmail.mock.calls[0][0];
    expect(mail).toMatchObject({ to: 'owner@example.com', tenantId: TENANT });
    expect(mail.html).not.toContain('<b>');
    expect(mail.html).toContain('Awa &lt;b&gt;Koné&lt;/b&gt;');
    expect(mail.html).toContain('https://x.test/r/abc?a=1&amp;b=2');
    expect(mail.subject).toContain('2026-09');
  });

  it('échec du premier canal : repli sur le suivant, un seul message reçu', async () => {
    sendWhatsappNotification.mockResolvedValue(false);

    const result = await deliverOnBestChannel(args(recipient({ preferredContactChannel: 'WHATSAPP' })));

    expect(result).toEqual({ sent: true, channel: 'EMAIL' });
    expect(sendWhatsappNotification).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('échec de tous les canaux : SEND_FAILED, jamais d’exception', async () => {
    sendWhatsappNotification.mockResolvedValue(false);
    sendEmail.mockRejectedValue(new Error('SMTP indisponible'));

    const result = await deliverOnBestChannel(args(recipient({ preferredContactChannel: 'WHATSAPP' })));

    expect(result).toEqual({ sent: false, channel: null, reason: 'SEND_FAILED' });
  });

  it('aucun canal éligible : raison explicite, rien d’envoyé', async () => {
    const result = await deliverOnBestChannel(
      args(recipient({ consentEmail: false, consentWhatsapp: false, preferredContactChannel: 'SMS' }))
    );

    expect(result).toEqual({ sent: false, channel: null, reason: 'NO_ELIGIBLE_CHANNEL' });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendWhatsappNotification).not.toHaveBeenCalled();
  });

  it('préférence SMS ou CALL ignorée : e-mail d’abord', async () => {
    const result = await deliverOnBestChannel(args(recipient({ preferredContactChannel: 'SMS' })));
    expect(result.channel).toBe('EMAIL');
  });

  it('utilise le sujet et le corps personnalisés par l’agence', async () => {
    const configs: ChannelConfigs = {
      ...ENABLED,
      EMAIL: { enabled: true, subjectOverride: 'Rapport {{period}}', bodyHtmlOverride: '<p>{{ownerName}}</p>' }
    };
    await deliverOnBestChannel(args(recipient({ preferredContactChannel: 'EMAIL' }), configs));

    expect(sendEmail.mock.calls[0][0].subject).toBe('Rapport 2026-09');
    expect(sendEmail.mock.calls[0][0].html).toBe('<p>Awa &lt;b&gt;Koné&lt;/b&gt;</p>');
  });
});

describe('loadChannelConfigs', () => {
  it('ne lit que les canaux prévus par le message', async () => {
    getEmailNotificationConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });

    const configs = await loadChannelConfigs(TENANT, { email: 'OWNER_MONTHLY_REPORT_SENT' });

    expect(Object.keys(configs)).toEqual(['EMAIL']);
    expect(getWhatsappNotificationConfig).not.toHaveBeenCalled();
  });
});

describe('sujet d’e-mail et variables d’URL', () => {
  it('un subjectOverride contenant {{paymentUrl}} / {{reportUrl}} n’injecte pas l’URL dans le sujet, le corps la contient', async () => {
    const url = 'https://app.test/payer#tok_SECRET';
    const configs: ChannelConfigs = {
      EMAIL: {
        enabled: true,
        subjectOverride: 'Loyer {{period}} {{paymentUrl}} {{reportUrl}}',
        bodyHtmlOverride: '<a href="{{paymentUrl}}">Payer</a> {{period}}'
      }
    };

    await deliverOnBestChannel({
      tenantId: TENANT,
      recipient: recipient(),
      configs,
      targets: { email: 'OWNER_MONTHLY_REPORT_SENT' },
      variables: { period: '10/2026', paymentUrl: url, reportUrl: url }
    });

    const mail = sendEmail.mock.calls[0][0];
    expect(mail.subject).toBe('Loyer 10/2026  ');
    expect(mail.subject).not.toContain('tok_SECRET');
    expect(mail.html).toContain(url);
  });
});
