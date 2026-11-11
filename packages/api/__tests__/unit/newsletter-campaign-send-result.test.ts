/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * FRI-08 (suite) : `emailService.sendEmail` renvoie `{ sent: false, reason }`
 * pour une adresse refusee au lieu d'avaler l'erreur. La campagne doit compter
 * ce destinataire en ECHEC (sans interrompre la boucle) et ne pas finir SENT
 * quand aucun e-mail n'est parti.
 */
jest.mock('jsdom', () => ({
  JSDOM: class {
    window: any;
    constructor(html: string) {
      this.window = {
        document: { querySelectorAll: () => [], body: { textContent: String(html).replace(/<[^>]*>/g, '') } }
      };
    }
  }
}));
jest.mock('dompurify', () => require('./../helpers/dompurify-jest-shim.js'));

const campaignUpdate = jest.fn(async (..._a: any[]) => ({}));
const recipientCreate = jest.fn(async (..._a: any[]) => ({}));
let subscribers: any[] = [];
const campaign: any = {
  id: 'c1',
  tenantId: 't1',
  listId: 'l1',
  status: 'DRAFT',
  subject: 'Bonjour',
  bodyHtml: '<html><body><p>Salut</p><a href="{{lien_desinscription}}">Se desabonner</a></body></html>',
  list: { id: 'l1' },
  template: null
};

jest.mock('../../src/utils/database', () => ({
  prisma: {
    newsletterCampaign: {
      findFirst: jest.fn(async () => campaign),
      update: (...a: any[]) => (campaignUpdate as any)(...a)
    },
    newsletterList: { findFirst: jest.fn(async () => ({ id: 'l1', tenantId: 't1', type: 'MANUAL' })) },
    newsletterSubscriber: { findMany: jest.fn(async () => subscribers) },
    crmContact: { findMany: jest.fn(async () => []) },
    newsletterCampaignRecipient: { create: (...a: any[]) => (recipientCreate as any)(...a) }
  }
}));

const sendEmailMock = jest.fn(async (..._args: any[]): Promise<any> => ({ sent: true }));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...a: any[]) => sendEmailMock(...a) }
}));
jest.mock('../../src/services/providers/whatsapp.provider', () => ({
  configureWhatsAppProvider: () => false,
  getConfiguredWhatsAppProvider: () => null,
  sendText: jest.fn()
}));

import { sendCampaign } from '../../src/services/newsletter-campaign.service';

const sub = (id: string, email: string) => ({ id, email, name: `Nom ${id}`, status: 'ACTIVE' });
const BAD = 'bad@b.com';

describe('sendCampaign : resultat explicite de sendEmail', () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    campaignUpdate.mockClear();
    recipientCreate.mockClear();
    // Simule le service reel : adresse refusee => { sent: false }, sans lever.
    sendEmailMock.mockImplementation(async (o: any) =>
      o.to === BAD ? { sent: false, reason: 'INVALID_RECIPIENT' } : { sent: true }
    );
  });

  const statuses = () => recipientCreate.mock.calls.map(c => ({ email: c[0].data.email, status: c[0].data.status }));
  const finalStatus = () => (campaignUpdate.mock.calls.at(-1)![0] as any).data.status;

  it('une adresse invalide parmi des valides : comptee en echec, les autres envoyes, boucle non interrompue', async () => {
    subscribers = [sub('s1', 'a@b.com'), sub('s2', BAD), sub('s3', 'c@d.com')];
    await sendCampaign('t1', 'c1');

    expect(sendEmailMock).toHaveBeenCalledTimes(3);
    expect(statuses()).toEqual([
      { email: 'a@b.com', status: 'SENT' },
      { email: BAD, status: 'FAILED' },
      { email: 'c@d.com', status: 'SENT' }
    ]);
    const failed = recipientCreate.mock.calls.find(c => c[0].data.email === BAD)![0].data;
    expect(failed.failureReason).toContain('INVALID_RECIPIENT');
    expect(finalStatus()).toBe('SENT');
  });

  it('tous les destinataires invalides : la campagne finit FAILED, pas SENT vide', async () => {
    subscribers = [sub('s1', BAD), sub('s2', BAD)];
    await sendCampaign('t1', 'c1');

    expect(statuses().every(s => s.status === 'FAILED')).toBe(true);
    expect(statuses()).toHaveLength(2);
    expect(finalStatus()).toBe('FAILED');
  });
});
