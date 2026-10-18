/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 047, T042 : notifications du paiement déclaré
 * (`lib/syndics/declared-payment/notifications.ts`, contrats §3.4).
 * Prisma, les canaux, l'e-mail et les droits sont simulés ; le routage
 * (`planChannels`) et les gabarits sont les vrais.
 */

const warn = jest.fn();
const info = jest.fn();
const error = jest.fn();
jest.mock('../../src/utils/logger', () => ({
  logger: {
    warn: (...a: unknown[]) => warn(...a),
    info: (...a: unknown[]) => info(...a),
    error: (...a: unknown[]) => error(...a)
  }
}));

const declarationFindFirst = jest.fn();
const contactFindFirst = jest.fn();
const membershipFindMany = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: {
    syndicPaymentDeclaration: { findFirst: (...a: any[]) => declarationFindFirst(...a) },
    crmContact: { findFirst: (...a: any[]) => contactFindFirst(...a) },
    syndicate: { findFirst: async () => ({ name: 'Résidence Les Palmiers' }) },
    user: { findFirst: async () => ({ fullName: 'Marc <Gestionnaire>' }) },
    membership: { findMany: (...a: any[]) => membershipFindMany(...a) }
  }
}));

const permissions = new Map<string, boolean>();
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: async (userId: string, key: string, tenantId: string) => {
    expect(key).toBe('SYNDIC_EDIT');
    expect(tenantId).toBe('tenant-A');
    return permissions.get(userId) === true;
  }
}));

const sendEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...a: any[]) => sendEmail(...a) }
}));
const getEmailNotificationConfig = jest.fn();
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...a: any[]) => getEmailNotificationConfig(...a)
}));

const loadChannelConfigs = jest.fn();
const sendOnPlannedChannels = jest.fn();
jest.mock('../../src/lib/patrimoine/notification-channels', () => ({
  ...jest.requireActual('../../src/lib/patrimoine/notification-channels'),
  loadChannelConfigs: (...a: any[]) => loadChannelConfigs(...a),
  sendOnPlannedChannels: (...a: any[]) => sendOnPlannedChannels(...a)
}));

import {
  notifyDeclarationApproved,
  notifyDeclarationReceived,
  notifyDeclarationRejected,
  resolveDeclarationReviewers,
  sendReceivingNumberChangedAlert,
  sendCoOwnerDeclarationMessage,
  sendReviewSummary
} from '../../src/lib/syndics/declared-payment/notifications';

const declaration = (over: Record<string, unknown> = {}) => ({
  amount: 30000,
  acceptedAmount: null,
  acceptedPaidAt: null,
  paidAt: new Date('2026-10-17T14:32:00Z'),
  transactionReference: 'MP261017.1432.A12345',
  rejectReason: null,
  reviewNote: null,
  declaredByContactId: 'contact-1',
  syndicate: { name: 'Résidence Les Palmiers' },
  ...over
});

const contact = (over: Record<string, unknown> = {}) => ({
  id: 'contact-1',
  email: 'awa@example.test',
  consentEmail: true,
  whatsappNumber: null,
  phonePrimary: null,
  consentWhatsapp: null,
  preferredContactChannel: null,
  firstName: 'Awa',
  lastName: 'Kone',
  legalName: null,
  ...over
});

beforeEach(() => {
  jest.clearAllMocks();
  permissions.clear();
  declarationFindFirst.mockResolvedValue(declaration());
  contactFindFirst.mockResolvedValue(contact());
  loadChannelConfigs.mockResolvedValue({ EMAIL: { enabled: true }, WHATSAPP: { enabled: true } });
  sendOnPlannedChannels.mockResolvedValue({ sent: true, channel: 'EMAIL' });
  getEmailNotificationConfig.mockResolvedValue({ enabled: true, subjectOverride: null, bodyHtmlOverride: null });
  sendEmail.mockResolvedValue(undefined);
});

describe('sendCoOwnerDeclarationMessage', () => {
  it('accuse réception sur UN canal, avec les variables du contrat §3.4', async () => {
    const delivery = await sendCoOwnerDeclarationMessage('tenant-A', 'decl-1', 'RECEIVED');
    expect(delivery).toEqual({ sent: true, channel: 'EMAIL' });
    expect(declarationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'decl-1', tenantId: 'tenant-A' } })
    );
    expect(contactFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'contact-1', tenantId: 'tenant-A' } })
    );
    const [plan, args] = sendOnPlannedChannels.mock.calls[0];
    expect(plan.channels).toEqual(['EMAIL']);
    expect(args.targets).toEqual({
      email: 'SYNDIC_PAYMENT_DECLARATION_RECEIVED',
      whatsapp: 'SYNDIC_PAYMENT_DECLARATION_RECEIVED'
    });
    expect(args.variables).toMatchObject({
      ownerName: 'Awa Kone',
      syndicName: 'Résidence Les Palmiers',
      transactionReference: 'MP261017.1432.A12345',
      corrected: 'non'
    });
    expect(args.variables.amount).toContain('FCFA');
    expect(args.variables.paidAt).toContain('2026');
  });

  it('dit les variables dans la langue du copropriétaire : libellés, oui/non, dates et nombres', async () => {
    declarationFindFirst.mockResolvedValue(
      declaration({ acceptedAmount: 25000, rejectReason: 'WRONG_NUMBER', paidAt: new Date('2026-10-17T14:32:00Z') })
    );
    contactFindFirst.mockResolvedValue(contact({ preferredLanguage: 'en' }));
    await sendCoOwnerDeclarationMessage('tenant-A', 'decl-1', 'REJECTED');
    const english = sendOnPlannedChannels.mock.calls.at(-1)![1].variables;
    expect(english.rejectReasonLabel).toBe('Wrong receiving number');
    expect(english.corrected).toBe('yes');
    expect(english.paidAt).toContain('17/10/2026');
    expect(english.amount).toBe('30,000 FCFA');

    contactFindFirst.mockResolvedValue(contact({ preferredLanguage: 'fr' }));
    await sendCoOwnerDeclarationMessage('tenant-A', 'decl-1', 'REJECTED');
    const french = sendOnPlannedChannels.mock.calls.at(-1)![1].variables;
    expect(french.rejectReasonLabel).toBe('Numéro de réception erroné');
    expect(french.corrected).toBe('oui');
    expect(french.paidAt).toContain('17/10/2026');

    contactFindFirst.mockResolvedValue(contact({ preferredLanguage: null }));
    await sendCoOwnerDeclarationMessage('tenant-A', 'decl-1', 'REJECTED');
    expect(sendOnPlannedChannels.mock.calls.at(-1)![1].variables.corrected).toBe('oui');
  });

  it('annonce le montant retenu et signale une correction', async () => {
    declarationFindFirst.mockResolvedValue(declaration({ acceptedAmount: 25000, reviewNote: 'Montant corrigé.' }));
    await sendCoOwnerDeclarationMessage('tenant-A', 'decl-1', 'APPROVED');
    const [, args] = sendOnPlannedChannels.mock.calls[0];
    expect(args.targets.email).toBe('SYNDIC_PAYMENT_DECLARATION_APPROVED');
    expect(args.variables).toMatchObject({ corrected: 'oui', reviewNote: 'Montant corrigé.' });
    expect(args.variables.acceptedAmount).not.toBe(args.variables.amount);
  });

  it('rejette avec le libellé du motif et la note', async () => {
    declarationFindFirst.mockResolvedValue(declaration({ rejectReason: 'WRONG_NUMBER', reviewNote: 'Autre numéro.' }));
    await sendCoOwnerDeclarationMessage('tenant-A', 'decl-1', 'REJECTED');
    const [, args] = sendOnPlannedChannels.mock.calls[0];
    expect(args.targets.email).toBe('SYNDIC_PAYMENT_DECLARATION_REJECTED');
    expect(args.variables).toMatchObject({
      rejectReasonLabel: 'Numéro de réception erroné',
      reviewNote: 'Autre numéro.'
    });
  });

  it('préfère WhatsApp quand le contact le demande et y a consenti', async () => {
    contactFindFirst.mockResolvedValue(
      contact({ preferredContactChannel: 'WHATSAPP', consentWhatsapp: true, whatsappNumber: '+2250707070707' })
    );
    await sendCoOwnerDeclarationMessage('tenant-A', 'decl-1', 'RECEIVED');
    expect(sendOnPlannedChannels.mock.calls[0][0].channels).toEqual(['WHATSAPP', 'EMAIL']);
  });

  it('n’envoie rien sans consentement ni canal éligible', async () => {
    contactFindFirst.mockResolvedValue(contact({ consentEmail: false }));
    await expect(sendCoOwnerDeclarationMessage('tenant-A', 'decl-1', 'APPROVED')).resolves.toEqual({
      sent: false,
      channel: null,
      reason: 'NO_ELIGIBLE_CHANNEL'
    });
    expect(sendOnPlannedChannels).not.toHaveBeenCalled();
  });

  it('respecte la désactivation de l’événement par l’agence', async () => {
    loadChannelConfigs.mockResolvedValue({ EMAIL: { enabled: false }, WHATSAPP: { enabled: false } });
    const delivery = await sendCoOwnerDeclarationMessage('tenant-A', 'decl-1', 'RECEIVED');
    expect(delivery).toMatchObject({ sent: false, reason: 'EVENT_DISABLED' });
    expect(sendOnPlannedChannels).not.toHaveBeenCalled();
  });

  it('n’a personne à prévenir pour une déclaration saisie par le gestionnaire sans copropriétaire', async () => {
    declarationFindFirst.mockResolvedValue(declaration({ declaredByContactId: null }));
    const delivery = await sendCoOwnerDeclarationMessage('tenant-A', 'decl-1', 'APPROVED');
    expect(delivery).toMatchObject({ sent: false, reason: 'NO_ELIGIBLE_CHANNEL' });
    expect(contactFindFirst).not.toHaveBeenCalled();
  });

  it('ne lève jamais : une panne est journalisée et rendue en SEND_FAILED', async () => {
    declarationFindFirst.mockRejectedValue(new Error('base HS'));
    await expect(sendCoOwnerDeclarationMessage('tenant-A', 'decl-1', 'REJECTED')).resolves.toMatchObject({
      sent: false,
      reason: 'SEND_FAILED'
    });
    expect(error).toHaveBeenCalled();
  });

  it('une déclaration d’une autre agence est introuvable : aucun envoi', async () => {
    declarationFindFirst.mockResolvedValue(null);
    await expect(sendCoOwnerDeclarationMessage('tenant-B', 'decl-1', 'RECEIVED')).resolves.toMatchObject({
      sent: false
    });
    expect(sendOnPlannedChannels).not.toHaveBeenCalled();
  });
});

describe('notifyDeclaration* (forme du plan : synchrones, sans lever)', () => {
  it('ne lèvent jamais, même avec des documents absents, et n’envoient rien sous Jest', () => {
    expect(() => notifyDeclarationReceived('tenant-A', 'decl-1')).not.toThrow();
    expect(() => notifyDeclarationApproved('tenant-A', 'decl-1', [{ id: 'doc-1' } as never])).not.toThrow();
    expect(() => notifyDeclarationApproved('tenant-A', 'decl-1', undefined as never)).not.toThrow();
    expect(() => notifyDeclarationRejected('tenant-A', 'decl-1')).not.toThrow();
    expect(declarationFindFirst).not.toHaveBeenCalled();
    expect(sendOnPlannedChannels).not.toHaveBeenCalled();
  });
});

describe('gestionnaires', () => {
  const members = [
    { userId: 'u1', user: { email: 'a@agence.test', preferredLanguage: 'fr' } },
    { userId: 'u2', user: { email: 'b@agence.test', preferredLanguage: 'xx' } },
    { userId: 'u3', user: { email: '  ', preferredLanguage: 'fr' } },
    { userId: 'u4', user: { email: 'd@agence.test', preferredLanguage: 'en' } }
  ];

  beforeEach(() => {
    membershipFindMany.mockResolvedValue(members);
    permissions.set('u1', true);
    permissions.set('u2', false);
    permissions.set('u3', true);
    permissions.set('u4', true);
  });

  it('retient les membres actifs de l’agence qui détiennent SYNDIC_EDIT dans cette agence', async () => {
    const reviewers = await resolveDeclarationReviewers('tenant-A');
    expect(reviewers.map(reviewer => reviewer.email)).toEqual(['a@agence.test', 'd@agence.test']);
    expect(membershipFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-A', status: 'ACTIVE', user: { isActive: true } } })
    );
  });

  it('envoie un récapitulatif par gestionnaire, avec le lien de l’onglet Paiements, sans échapper deux fois', async () => {
    const delivered = await sendReviewSummary({
      tenantId: 'tenant-A',
      syndicateId: 'syndic-1',
      syndicName: 'Les <Palmiers>',
      pendingCount: 3,
      overdueCount: 1
    });
    expect(delivered).toBe(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail).toMatchObject({ to: 'a@agence.test', tenantId: 'tenant-A' });
    expect(mail.subject).toContain('Les <Palmiers>');
    expect(mail.html).toContain('Les &lt;Palmiers&gt;');
    expect(mail.html).toContain('<strong>3</strong>');
    expect(mail.html).toContain('/tenant/tenant-A/syndics/syndic-1/paiements-en-ligne');
    expect(mail.subject).not.toContain('/tenant/');
  });

  it('un échec d’envoi à un gestionnaire n’arrête pas les autres', async () => {
    sendEmail.mockRejectedValueOnce(new Error('SMTP'));
    const delivered = await sendReviewSummary({
      tenantId: 'tenant-A',
      syndicateId: 'syndic-1',
      syndicName: 'X',
      pendingCount: 1,
      overdueCount: 0
    });
    expect(delivered).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('n’envoie rien quand l’agence a désactivé l’événement, ni sans destinataire, et ne lève jamais', async () => {
    const params = { tenantId: 'tenant-A', syndicateId: 'syndic-1', syndicName: 'X', pendingCount: 1, overdueCount: 0 };
    getEmailNotificationConfig.mockResolvedValueOnce({ enabled: false });
    await expect(sendReviewSummary(params)).resolves.toBe(0);
    membershipFindMany.mockResolvedValueOnce([]);
    await expect(sendReviewSummary(params)).resolves.toBe(0);
    membershipFindMany.mockRejectedValueOnce(new Error('base HS'));
    await expect(sendReviewSummary(params)).resolves.toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('changement de numéro de réception : alerte aux autres gestionnaires', () => {
  const params = {
    tenantId: 'tenant-A',
    syndicateId: 'syndic-1',
    actorUserId: 'u1',
    previousPhoneMasked: '07 •• •• •• 07',
    newPhoneMasked: '05 •• •• •• 12'
  };

  beforeEach(() => {
    membershipFindMany.mockResolvedValue([
      { userId: 'u1', user: { email: 'auteur@agence.test', preferredLanguage: 'fr' } },
      { userId: 'u2', user: { email: 'collegue@agence.test', preferredLanguage: 'fr' } },
      { userId: 'u3', user: { email: 'sans-droit@agence.test', preferredLanguage: 'fr' } }
    ]);
    permissions.set('u1', true);
    permissions.set('u2', true);
    permissions.set('u3', false);
  });

  it('prévient les collègues SYNDIC_EDIT, jamais l’auteur du changement, avec les seuls numéros masqués', async () => {
    const delivered = await sendReceivingNumberChangedAlert(params);
    expect(delivered).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('collegue@agence.test');
    expect(mail.html).toContain('07 •• •• •• 07');
    expect(mail.html).toContain('05 •• •• •• 12');
    expect(mail.html).toContain('Marc &lt;Gestionnaire&gt;');
    expect(getEmailNotificationConfig).toHaveBeenCalledWith('tenant-A', 'SYNDIC_RECEIVING_NUMBER_CHANGED');
  });

  it('n’envoie rien si l’agence a désactivé l’événement, s’il n’y a personne d’autre, ou en cas de panne', async () => {
    getEmailNotificationConfig.mockResolvedValueOnce({ enabled: false });
    await expect(sendReceivingNumberChangedAlert(params)).resolves.toBe(0);
    permissions.set('u2', false);
    await expect(sendReceivingNumberChangedAlert(params)).resolves.toBe(0);
    membershipFindMany.mockRejectedValueOnce(new Error('base HS'));
    await expect(sendReceivingNumberChangedAlert(params)).resolves.toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
