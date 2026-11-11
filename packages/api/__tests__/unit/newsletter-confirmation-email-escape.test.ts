/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contre-audit PAY M1 : l'e-mail public de confirmation d'inscription
 * reprenait le prénom saisi sans échappement (`<p>Bonjour ${prenom},</p>`),
 * soit un hameçonnage envoyé depuis le domaine de l'agence. Toute valeur
 * injectée dans le gabarit est désormais échappée.
 */
import './../helpers/app-shims';

const sendEmail = jest.fn(async () => ({ sent: true }));
const subscriberCreate = jest.fn(async ({ data }: any) => ({ id: 's1', ...data }));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    newsletterList: {
      findFirst: jest.fn(async () => ({ id: 'l1', tenantId: 't1', type: 'MANUAL', publicSubscribeToken: 'tok' }))
    },
    newsletterSubscriber: {
      findUnique: jest.fn(async () => null),
      create: (...a: any[]) => (subscriberCreate as any)(...a)
    }
  }
}));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...a: any[]) => (sendEmail as any)(...a) }
}));

import { subscribePublic } from '../../src/services/newsletter-subscriber.service';

const sentHtml = (): string => (sendEmail.mock.calls[0] as any)[0].html;

beforeEach(() => {
  sendEmail.mockClear();
  subscriberCreate.mockClear();
});

describe('subscribePublic — e-mail de confirmation échappé', () => {
  it('un prénom porteur de balisage arrive échappé, jamais en HTML', async () => {
    await subscribePublic({
      listToken: 'tok',
      email: 'victime@example.com',
      name: '<b>Urgent</b><a/href="https://evil.example">ici</a> Doe'
    });

    const html = sentHtml();
    expect(html).not.toContain('<b>Urgent');
    expect(html).not.toContain('href="https://evil.example"');
    expect(html).toContain(
      'Bonjour &lt;b&gt;Urgent&lt;/b&gt;&lt;a/href=&quot;https://evil.example&quot;&gt;ici&lt;/a&gt;,'
    );
  });

  it('un prénom ordinaire reste lisible ; sans nom, formule par défaut', async () => {
    await subscribePublic({ listToken: 'tok', email: 'zoe@example.com', name: "Zoé N'Guessan" });
    expect(sentHtml()).toContain('Bonjour Zoé,');

    sendEmail.mockClear();
    await subscribePublic({ listToken: 'tok', email: 'anonyme@example.com' });
    expect(sentHtml()).toContain('Bonjour Cher abonné,');
  });

  it('le lien de confirmation porte un jeton hexadécimal, sans guillemet ni balise', async () => {
    await subscribePublic({ listToken: 'tok', email: 'jean@example.com', name: 'Jean' });
    expect(sentHtml()).toMatch(/href="[^"<>]*\/newsletter\/confirm\?token=[0-9a-f]{64}"/);
  });
});
