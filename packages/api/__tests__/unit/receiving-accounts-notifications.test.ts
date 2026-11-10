/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 048, lot Q : l'alerte RECEIVING_ACCOUNT_CHANGED est une alerte de sécurité, toujours envoyée.
 * La configuration des notifications (modifiable par tout collaborateur) ne peut ni la couper ni
 * réécrire son sujet ou son corps. On teste la fonction qui décide et construit l'envoi.
 */

const sendEmail = jest.fn(async (..._args: any[]) => undefined);
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...a: any[]) => sendEmail(...a) }
}));

const getConfig = jest.fn(async (..._args: any[]) => ({
  enabled: false,
  subjectOverride: 'SUJET DÉTOURNÉ',
  bodyHtmlOverride: '<p>CORPS DÉTOURNÉ</p>'
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...a: any[]) => getConfig(...a)
}));

jest.mock('../../src/services/permission-service', () => ({
  hasPermission: jest.fn(async (userId: string) => userId !== 'simple-collaborateur')
}));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const mockPrisma: Record<string, any> = {
  membership: {
    findMany: jest.fn(async () => [
      { userId: 'admin-1', user: { email: 'admin1@agence.test', preferredLanguage: 'fr' } },
      { userId: 'admin-2', user: { email: 'admin2@agence.test', preferredLanguage: 'en' } },
      { userId: 'simple-collaborateur', user: { email: 'collab@agence.test', preferredLanguage: 'fr' } },
      { userId: 'sans-mail', user: { email: '  ', preferredLanguage: 'fr' } }
    ])
  },
  user: { findFirst: jest.fn(async () => ({ fullName: 'Awa Koné' })) },
  syndicate: { findFirst: jest.fn(async () => null) }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import { holderSentence, sendReceivingAccountChangedAlert } from '../../src/lib/receiving-accounts/notifications';

const alert = {
  tenantId: 'tenant-a',
  actorUserId: 'admin-1',
  scope: 'AGENCY' as const,
  syndicateId: null,
  institution: 'Wave <b>',
  changes: ['ALIAS_CHANGED' as const, 'REACTIVATED' as const],
  previousAlias: 'ancien',
  newAlias: 'nouveau',
  hadQr: false,
  hasQr: true,
  previousHolderName: 'Agence Soleil',
  newHolderName: 'Autre'
};

beforeEach(() => {
  sendEmail.mockClear();
  getConfig.mockClear();
});

describe('alerte de changement de compte de réception', () => {
  it('part même si la configuration la désactive et la surcharge, avec le gabarit par défaut', async () => {
    const delivered = await sendReceivingAccountChangedAlert(alert);
    expect(delivered).toBe(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    for (const [options] of sendEmail.mock.calls) {
      expect(options.subject).not.toContain('DÉTOURNÉ');
      expect(options.html).not.toContain('DÉTOURNÉ');
      expect(options.html).toContain('Compte de réception modifié');
      expect(options.html).toContain('Wave &lt;b&gt;');
      expect(options.html).toContain('nouveau');
      expect(options.journal.key).toBe('RECEIVING_ACCOUNT_CHANGED');
    }
    expect(sendEmail.mock.calls.map(([o]) => o.to).sort()).toEqual(['admin1@agence.test', 'admin2@agence.test']);
  });

  it('ne lit même pas la configuration des notifications', async () => {
    await sendReceivingAccountChangedAlert(alert);
    expect(getConfig).not.toHaveBeenCalled();
  });

  /** Corps envoyé à l'administrateur francophone. */
  async function frenchBody(overrides: Record<string, unknown>): Promise<string> {
    sendEmail.mockClear();
    await sendReceivingAccountChangedAlert({ ...alert, ...overrides } as any);
    const call = sendEmail.mock.calls.find(([options]) => options.to === 'admin1@agence.test');
    return call?.[0].html as string;
  }

  it('création : la ligne « Titulaire » donne le nouveau titulaire seul, jamais « aucun devient aucun »', async () => {
    const html = await frenchBody({
      changes: ['CREATED'],
      previousAlias: null,
      newAlias: 'nouveau',
      previousHolderName: null,
      newHolderName: 'Agence Soleil'
    });
    expect(html).toContain('Titulaire : Agence Soleil.');
    expect(html).not.toMatch(/Titulaire : aucun|devient Agence Soleil/);
  });

  it('modification du titulaire : ancien et nouveau ; titulaire inchangé : nommé une fois', async () => {
    const changed = await frenchBody({ changes: ['HOLDER_CHANGED'] });
    expect(changed).toContain('Titulaire : Agence Soleil devient Autre.');
    const unchanged = await frenchBody({
      changes: ['ALIAS_CHANGED'],
      previousHolderName: 'Agence Soleil',
      newHolderName: 'Agence Soleil'
    });
    expect(unchanged).toContain('Titulaire : Agence Soleil.');
    expect(unchanged).not.toContain('Agence Soleil devient');
  });

  it('suppression : le titulaire supprimé seul', async () => {
    const html = await frenchBody({
      changes: ['DELETED'],
      newAlias: null,
      hasQr: false,
      previousHolderName: 'Agence Soleil',
      newHolderName: null
    });
    expect(html).toContain('Titulaire : Agence Soleil.');
    expect(html).not.toContain('Titulaire : aucun');
    expect(html).toContain('compte supprimé');
  });

  it('aucun titulaire connu : pas de ligne « Titulaire » ; le titulaire est échappé', async () => {
    const none = await frenchBody({ previousHolderName: undefined, newHolderName: undefined });
    expect(none).not.toContain('Titulaire');
    expect(holderSentence(null, '  ')).toBe('');
    const escaped = await frenchBody({ previousHolderName: null, newHolderName: '<script>x</script>' });
    expect(escaped).toContain('Titulaire : &lt;script&gt;x&lt;/script&gt;.');
  });

  it('la ligne « Titulaire » suit la langue de l’administrateur', async () => {
    sendEmail.mockClear();
    await sendReceivingAccountChangedAlert(alert);
    const english = sendEmail.mock.calls.find(([options]) => options.to === 'admin2@agence.test')?.[0].html as string;
    expect(english).toContain('Holder: Agence Soleil becomes Autre.');
  });

  it('une panne d’e-mail n’empêche pas les autres envois et ne lève pas', async () => {
    sendEmail.mockRejectedValueOnce(new Error('SMTP down'));
    await expect(sendReceivingAccountChangedAlert(alert)).resolves.toBe(1);
  });
});
