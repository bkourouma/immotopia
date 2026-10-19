/**
 * Branchement du journal des notifications (menu lot 3) sur les envois
 * existants : e-mail, WhatsApp, SMS de signature.
 *
 * Aucune base ni réseau : `prisma` est un double en mémoire, le transport SMTP
 * et le fournisseur WhatsApp sont des mocks.
 */
const mockEvents: string[] = [];
const mockCreate = jest.fn();
const mockDeliveryUpdate = jest.fn();
const mockNotifUpdate = jest.fn();
const mockSendMail = jest.fn();
const mockSendText = jest.fn();
const mockSmsSend = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null) },
    crmContact: {
      findFirst: jest.fn(async () => ({
        firstName: 'Awa',
        lastName: 'Kone',
        legalName: null,
        email: 'awa@x.test',
        phonePrimary: '+2250102030405',
        whatsappNumber: null,
        consentWhatsapp: true
      }))
    },
    tenant: { findUnique: jest.fn(async () => ({ name: 'Agence Test', contactEmail: null })) },
    userNotification: {
      create: (...args: unknown[]) => mockCreate(...args),
      updateMany: (...args: unknown[]) => mockNotifUpdate(...args)
    },
    notificationDelivery: { updateMany: (...args: unknown[]) => mockDeliveryUpdate(...args) }
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/whatsapp-notification-config-service', () => ({
  getWhatsappNotificationConfig: jest.fn(async () => ({ enabled: true, contentSid: null, bodyOverride: null }))
}));
jest.mock('../../src/services/providers/whatsapp.provider', () => ({
  configureWhatsAppProvider: jest.fn(() => true),
  getConfiguredWhatsAppProvider: jest.fn(() => 'wasender'),
  supportsTemplateMessages: jest.fn(() => false),
  sendTemplate: jest.fn(),
  sendText: (...args: unknown[]) => mockSendText(...args)
}));
jest.mock('../../src/lib/sms', () => ({
  getSmsTransport: () => ({ send: (...args: unknown[]) => mockSmsSend(...args) })
}));
jest.mock('../../src/lib/signature/sms-guard', () => ({
  isAllowedSmsDialCode: jest.fn(() => true),
  contactOwnsPhone: jest.fn(async () => true),
  hasSmsBudget: jest.fn(async () => true)
}));

import { emailService } from '../../src/services/email-service';
import { sendWhatsappNotification } from '../../src/services/whatsapp-notification-send-service';
import { createInternalProvider } from '../../src/lib/signature/provider/internal';

const TENANT = 'tenant-1';
const OTP = '482913';
const SECRET_LINK = 'https://app.test/sign/SECRET-TOKEN-xyz';

function createdData(): Record<string, any> {
  return mockCreate.mock.calls[0][0].data;
}

beforeAll(() => {
  process.env.ENABLE_EMAILS = '1';
  (emailService as any).transporter = { sendMail: (...args: unknown[]) => mockSendMail(...args) };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockEvents.length = 0;
  mockCreate.mockImplementation(async () => {
    mockEvents.push('create');
    return { id: 'n1', deliveries: [{ id: 'd1' }] };
  });
  mockDeliveryUpdate.mockResolvedValue({ count: 1 });
  mockNotifUpdate.mockResolvedValue({ count: 1 });
  mockSendMail.mockImplementation(async () => {
    mockEvents.push('send');
    return { messageId: 'm1' };
  });
  mockSendText.mockResolvedValue(undefined);
  mockSmsSend.mockResolvedValue({ ok: true, providerMessageId: 'sms-1' });
});

describe('sendEmail avec journal', () => {
  it('écrit la ligne avant l’envoi puis met le statut à jour', async () => {
    await emailService.sendEmail({
      to: 'locataire@x.test',
      subject: 'Paiement approuvé',
      html: '<p>Bonjour <strong>Awa</strong></p><style>p{color:red}</style>',
      tenantId: TENANT,
      journal: { key: 'PAYMENT_APPROVED_TENANT', relatedEntity: { type: 'RentalLease', id: 'l1' } }
    });
    expect(mockEvents).toEqual(['create', 'send']);
    const data = createdData();
    expect(data).toMatchObject({
      tenantId: TENANT,
      key: 'PAYMENT_APPROVED_TENANT',
      title: 'Paiement approuvé',
      status: 'PENDING',
      relatedEntityType: 'RentalLease',
      relatedEntityId: 'l1'
    });
    // Defaut inverse : jamais le texte de l'e-mail, seulement le sujet et une mention fixe.
    expect(data.body).toContain('Message envoyé par e-mail.');
    expect(data.body).not.toContain('Awa');
    expect(data.deliveries.create[0].resendPayload).toEqual({ replayable: false });
    expect(data.deliveries.create[0]).toMatchObject({ channel: 'EMAIL', target: 'locataire@x.test' });
    expect(mockDeliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) })
    );
  });

  it('sans corps explicite : corps générique, jamais le texte de l’e-mail, livraison non rejouable', async () => {
    await emailService.sendEmail({
      to: 'a@x.test',
      subject: 'S',
      text: 'x'.repeat(5000),
      tenantId: TENANT,
      journal: { key: 'K' }
    });
    const data = createdData();
    expect(data.body).toContain('Message envoyé par e-mail.');
    expect(data.deliveries.create[0].resendPayload).toEqual({ replayable: false });
  });

  it('replayable: true explicite : la livraison reste rejouable', async () => {
    await emailService.sendEmail({
      to: 'a@x.test',
      subject: 'S',
      text: 'x',
      tenantId: TENANT,
      journal: { key: 'K', body: 'Message envoyé.', replayable: true }
    });
    expect(createdData().deliveries.create[0].resendPayload).toBeUndefined();
  });

  it('un corps de journal explicite remplace le texte de l’e-mail', async () => {
    await emailService.sendEmail({
      to: 'a@x.test',
      subject: 'S',
      text: `Lien ${SECRET_LINK}`,
      tenantId: TENANT,
      journal: { key: 'K', body: 'Message envoyé.' }
    });
    expect(createdData().body).toBe('Message envoyé.');
    // Un corps explicite ne rend PAS la livraison rejouable : seul `replayable: true` l'autorise.
    expect(createdData().deliveries.create[0].resendPayload).toEqual({ replayable: false });
    expect(JSON.stringify(mockCreate.mock.calls)).not.toContain('SECRET-TOKEN');
  });

  it('prélèvements (redactRecipient) : adresse masquée dans le journal, livraison non rejouable', async () => {
    await emailService.sendEmail({
      to: 'debiteur@exemple.ci',
      subject: 'S',
      text: 't',
      tenantId: TENANT,
      redactRecipient: true,
      journal: { key: 'DIRECT_DEBIT_REJECTED' }
    });
    const data = createdData();
    expect(data.deliveries.create[0]).toMatchObject({
      target: 'd***@exemple.ci',
      resendPayload: { replayable: false }
    });
    expect(data.recipientLabel).toBe('d***@exemple.ci');
    expect(JSON.stringify(mockCreate.mock.calls)).not.toContain('debiteur@');
  });

  it('sans journal, aucun appel au journal', async () => {
    await emailService.sendEmail({ to: 'a@x.test', subject: 'S', text: 't', tenantId: TENANT });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockDeliveryUpdate).not.toHaveBeenCalled();
  });

  it('sans agence identifiable, l’e-mail part sans ligne de journal', async () => {
    await emailService.sendEmail({ to: 'a@x.test', subject: 'S', text: 't', journal: { key: 'K' } });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('échec du transport : même exception, delivery FAILED', async () => {
    const failure = new Error('SMTP 554 refus');
    mockSendMail.mockRejectedValueOnce(failure);
    await expect(
      emailService.sendEmail({ to: 'a@x.test', subject: 'S', text: 't', tenantId: TENANT, journal: { key: 'K' } })
    ).rejects.toBe(failure);
    expect(mockDeliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', failureReason: 'Error' })
      })
    );
  });

  it('échec de la journalisation : l’e-mail part quand même, sans exception', async () => {
    mockCreate.mockRejectedValueOnce(new Error('db down'));
    await expect(
      emailService.sendEmail({ to: 'a@x.test', subject: 'S', text: 't', tenantId: TENANT, journal: { key: 'K' } })
    ).resolves.toBeUndefined();
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it('méthode métier : clé du catalogue, pas de lien secret dans le journal', async () => {
    await emailService.sendDirectDebitRejected(
      'debiteur@x.test',
      {
        debtorName: 'Awa',
        agencyName: 'Agence',
        mandateReference: 'M-1',
        ibanMasked: '****1234',
        amount: '100',
        collectionDate: '01/01/2027',
        reason: 'Solde insuffisant',
        rejectFee: '',
        suspensionNotice: '',
        leaseNumber: 'B1'
      } as any,
      { tenantId: TENANT, journal: { relatedEntity: { type: 'DirectDebit', id: 'x1' } } }
    );
    expect(createdData()).toMatchObject({
      key: 'DIRECT_DEBIT_REJECTED',
      relatedEntityType: 'DirectDebit',
      relatedEntityId: 'x1'
    });
  });

  it('e-mails d’authentification : jamais de journal', async () => {
    await emailService.sendVerificationEmail('u@x.test', 'tok-verif-123');
    await emailService.sendPasswordResetEmail('u@x.test', 'tok-reset-456');
    await emailService.sendInviteEmail('u@x.test', 'tok-invite-789', 'Agence', ['Administrateur'], new Date(), TENANT);
    expect(mockSendMail).toHaveBeenCalledTimes(3);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('WhatsApp', () => {
  it('retourne true et journalise l’envoi réel (rejouable)', async () => {
    const sent = await sendWhatsappNotification({
      tenantId: TENANT,
      notificationKey: 'PAYMENT_APPROVED_TENANT',
      contactId: 'c1',
      variables: { tenantName: 'Awa', agencyName: 'Agence' },
      journal: { relatedEntity: { type: 'RentalLease', id: 'l1' } }
    });
    expect(sent).toBe(true);
    expect(mockSendText).toHaveBeenCalledTimes(1);
    const data = createdData();
    expect(data).toMatchObject({ key: 'PAYMENT_APPROVED_TENANT', relatedEntityType: 'RentalLease' });
    expect(data.deliveries.create[0]).toMatchObject({
      channel: 'WHATSAPP',
      resendPayload: {
        whatsapp: { notificationKey: 'PAYMENT_APPROVED_TENANT' },
        contactId: 'c1'
      }
    });
    expect(mockDeliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) })
    );
  });

  it('retourne false quand le fournisseur échoue, delivery FAILED', async () => {
    mockSendText.mockRejectedValueOnce(new Error('provider down'));
    const sent = await sendWhatsappNotification({
      tenantId: TENANT,
      notificationKey: 'PAYMENT_APPROVED_TENANT',
      contactId: 'c1',
      variables: { tenantName: 'Awa' }
    });
    expect(sent).toBe(false);
    expect(mockDeliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
    );
  });

  it('une variable de lien ou de jeton n’est jamais gardée pour le renvoi, ni le message rendu', async () => {
    const sent = await sendWhatsappNotification({
      tenantId: TENANT,
      notificationKey: 'PAYMENT_APPROVED_TENANT',
      to: '+2250102030405',
      variables: { tenantName: 'Awa', paymentUrl: SECRET_LINK }
    });
    expect(sent).toBe(true);
    const serialized = JSON.stringify(mockCreate.mock.calls);
    expect(serialized).not.toContain('SECRET-TOKEN');
    // Le drapeau seul est garde : le renvoi explique son refus, sans aucune variable en base.
    expect(createdData().deliveries.create[0].resendPayload).toEqual({ replayable: false });
  });

  it.each([
    ['une URL sous un nom anodin', { tenantName: 'Awa', agencyName: 'voir https://acces.test/x' }],
    ['un jeton long sous un nom anodin', { tenantName: 'Awa', agencyName: 'abcdEFGH1234abcdEFGH1234_x-9' }],
    ["un jeton long au milieu d'une phrase", { tenantName: 'Awa', agencyName: 'ref abcdEFGH1234abcdEFGH1234abcd ok' }]
  ])("VALEUR sensible (%s) : rien n'est garde pour le renvoi", async (_label, variables) => {
    await sendWhatsappNotification({
      tenantId: TENANT,
      notificationKey: 'PAYMENT_APPROVED_TENANT',
      to: '+2250102030405',
      variables
    });
    expect(createdData().deliveries.create[0].resendPayload).toEqual({ replayable: false });
  });

  it('des valeurs ordinaires restent rejouables (nom, montant, reference courte)', async () => {
    await sendWhatsappNotification({
      tenantId: TENANT,
      notificationKey: 'PAYMENT_APPROVED_TENANT',
      to: '+2250102030405',
      variables: { tenantName: 'Awa Kone', agencyName: 'Agence Plateau' }
    });
    expect(createdData().deliveries.create[0].resendPayload).toMatchObject({
      whatsapp: { notificationKey: 'PAYMENT_APPROVED_TENANT' }
    });
  });

  it('une variable HORS gabarit (liste blanche) rend l’envoi non rejouable', async () => {
    await sendWhatsappNotification({
      tenantId: TENANT,
      notificationKey: 'PAYMENT_APPROVED_TENANT',
      to: '+2250102030405',
      variables: { tenantName: 'Awa', inconnue: 'ok' }
    });
    expect(createdData().deliveries.create[0].resendPayload).toEqual({ replayable: false });
  });

  it('skipJournal : aucun appel au journal (notify() écrit déjà sa ligne)', async () => {
    const sent = await sendWhatsappNotification({
      tenantId: TENANT,
      notificationKey: 'PAYMENT_APPROVED_TENANT',
      to: '+2250102030405',
      variables: { tenantName: 'Awa' },
      skipJournal: true
    });
    expect(sent).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('une journalisation en échec ne change pas le retour', async () => {
    mockCreate.mockRejectedValueOnce(new Error('db down'));
    const sent = await sendWhatsappNotification({
      tenantId: TENANT,
      notificationKey: 'PAYMENT_APPROVED_TENANT',
      to: '+2250102030405',
      variables: { tenantName: 'Awa' }
    });
    expect(sent).toBe(true);
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });
});

describe('Signature : jamais de code ni de lien en base de journal', () => {
  const provider = createInternalProvider();

  it('SMS : corps générique, le code n’apparaît dans aucun champ journalisé', async () => {
    const result = await provider.deliver({
      tenantId: TENANT,
      channel: 'SMS',
      to: '+2250102030405',
      contactId: 'c1',
      subject: '',
      text: `Code Agence : ${OTP} (valable 10 min). ${SECRET_LINK}`
    });
    expect(result).toEqual({ ok: true });
    expect(mockSmsSend).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining(OTP) }));
    const serialized = JSON.stringify([...mockCreate.mock.calls, ...mockDeliveryUpdate.mock.calls]);
    expect(serialized).not.toContain(OTP);
    expect(serialized).not.toContain('SECRET-TOKEN');
    expect(createdData()).toMatchObject({ key: 'SIGNATURE_MESSAGE' });
    expect(createdData().deliveries.create[0]).toMatchObject({ channel: 'SMS' });
  });

  it('SMS : échec du transport rendu comme avant et noté FAILED', async () => {
    mockSmsSend.mockResolvedValueOnce({ ok: false, reason: 'SEND_FAILED' });
    const result = await provider.deliver({
      tenantId: TENANT,
      channel: 'SMS',
      to: '+2250102030405',
      contactId: 'c1',
      subject: '',
      text: `Code ${OTP}`
    });
    expect(result).toEqual({ ok: false, reason: 'SEND_FAILED' });
    expect(mockDeliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
    );
  });

  it('SMS : canal désactivé, rendu DISABLED comme avant et noté SKIPPED', async () => {
    mockSmsSend.mockResolvedValueOnce({ ok: false, reason: 'DISABLED' });
    const result = await provider.deliver({
      tenantId: TENANT,
      channel: 'SMS',
      to: '+2250102030405',
      contactId: 'c1',
      subject: '',
      text: `Code ${OTP}`
    });
    expect(result).toEqual({ ok: false, reason: 'DISABLED' });
    expect(mockDeliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SKIPPED' }) })
    );
  });

  it('e-mail de signature : livraison marquée non rejouable (corps générique)', async () => {
    await provider.deliver({
      tenantId: TENANT,
      channel: 'EMAIL',
      to: 'signataire@x.test',
      contactId: 'c1',
      subject: 'Votre code de signature',
      text: `Code ${OTP}`
    });
    expect(createdData().deliveries.create[0].resendPayload).toEqual({ replayable: false });
  });

  it('WhatsApp de signature : livraison marquée non rejouable', async () => {
    await provider.deliver({
      tenantId: TENANT,
      channel: 'WHATSAPP',
      to: '+2250102030405',
      contactId: 'c1',
      subject: '',
      text: `Code ${OTP}`
    });
    expect(createdData().deliveries.create[0].resendPayload).toEqual({ replayable: false });
  });

  it('e-mail de signature : corps générique, ni code ni lien en base', async () => {
    const result = await provider.deliver({
      tenantId: TENANT,
      channel: 'EMAIL',
      to: 'signataire@x.test',
      contactId: 'c1',
      subject: 'Votre code de signature',
      text: `Code ${OTP} ${SECRET_LINK}`,
      html: `<p>Code ${OTP} <a href="${SECRET_LINK}">lien</a></p>`
    });
    expect(result).toEqual({ ok: true });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify([...mockCreate.mock.calls, ...mockDeliveryUpdate.mock.calls]);
    expect(serialized).not.toContain(OTP);
    expect(serialized).not.toContain('SECRET-TOKEN');
    expect(createdData()).toMatchObject({ key: 'SIGNATURE_MESSAGE', title: 'Message de signature électronique' });
  });
});
