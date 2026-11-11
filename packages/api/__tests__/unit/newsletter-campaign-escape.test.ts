/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SUR-07 : les valeurs de l'abonne (prenom, nom, e-mail) substituees dans le
 * HTML d'une campagne sont echappees ; le lien de desinscription (URL
 * construite cote serveur) reste intact.
 */
// jsdom/dompurify sont ESM-only : faux minimaux (le texte WhatsApp n'est pas l'objet de ce test).
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

const campaignUpdate = jest.fn(async () => ({}));
const recipientCreate = jest.fn(async () => ({}));
const campaign: any = {
  id: 'c1',
  tenantId: 't1',
  listId: 'l1',
  status: 'DRAFT',
  subject: 'Bonjour {{prenom}}',
  bodyHtml:
    '<html><body><p>Bonjour {{prenom}} {{nom}} ({{email}})</p><a href="{{lien_desinscription}}">Se desabonner</a></body></html>',
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
    newsletterSubscriber: {
      findMany: jest.fn(async () => [
        { id: 's1', email: 'a"><script>x</script>@b.com', name: '<img src=x onerror=alert(1)> D&D', status: 'ACTIVE' }
      ])
    },
    crmContact: { findMany: jest.fn(async () => []) },
    newsletterCampaignRecipient: { create: (...a: any[]) => (recipientCreate as any)(...a) }
  }
}));

const sendEmailMock = jest.fn(async (..._args: any[]) => undefined);
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: (...a: any[]) => sendEmailMock(...a) }
}));
jest.mock('../../src/services/providers/whatsapp.provider', () => ({
  configureWhatsAppProvider: () => false,
  getConfiguredWhatsAppProvider: () => null,
  sendText: jest.fn()
}));

import {
  escapeHtml,
  getPreviewHtml,
  replaceVariablesInHtml,
  sendCampaign
} from '../../src/services/newsletter-campaign.service';

describe('SUR-07 : variables de campagne echappees dans le HTML', () => {
  beforeEach(() => sendEmailMock.mockClear());

  it('escapeHtml echappe & < > " \'', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    );
  });

  it("sendCampaign : aucune balise injectee par le prenom ou l'e-mail, lien de desinscription intact", async () => {
    await sendCampaign('t1', 'c1');

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html, subject } = sendEmailMock.mock.calls[0]![0] as { html: string; subject: string };

    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Bonjour &lt;img');
    expect(html).toContain('onerror=alert(1)&gt; D&amp;D');
    expect(html).toContain('a&quot;&gt;&lt;script&gt;x&lt;/script&gt;@b.com');
    expect(html).toContain('D&amp;D');

    // lien de desinscription : URL serveur, ni echappee ni doublement echappee
    const href = /<a href="([^"]+)">Se desabonner<\/a>/.exec(html)?.[1];
    expect(href).toMatch(/\/newsletter\/unsubscribe\?token=[0-9a-f]{64}$/);
    expect(href).not.toContain('&amp;');

    // l'objet est du texte brut : non echappe
    expect(subject).toBe('Bonjour <img');
  });

  it("replaceVariablesInHtml : le lien de desinscription n'est pas echappe, les autres valeurs le sont", () => {
    const out = replaceVariablesInHtml('{{prenom}}|{{lien_desinscription}}', {
      prenom: '<b>"x"</b>',
      lien_desinscription: 'https://app.test/newsletter/unsubscribe?token=abc&x=1'
    });
    expect(out).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;|https://app.test/newsletter/unsubscribe?token=abc&x=1');
  });

  it("getPreviewHtml : substitution via le meme chemin d'echappement", async () => {
    const preview = await getPreviewHtml('t1', 'c1');
    expect(preview.html).toContain('Bonjour Prénom Nom (exemple@test.com)');
  });
});
