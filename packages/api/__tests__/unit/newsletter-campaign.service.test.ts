/**
 * Newsletter : rendu d'une campagne avec modèle, envoi et liste vide.
 *
 * Défaut d'origine (BUG-2026-09-29-016) : les variables du modèle
 * ({{prenom}}, {{lien_desinscription}}…) étaient vidées avant la
 * personnalisation par destinataire, d'où « Bonjour , » et un lien
 * « Se désabonner » vide dans l'e-mail reçu.
 */

// jsdom est ESM-only et Jest ne sait pas le charger : un faux minimal suffit ici
// (le texte WhatsApp n'est pas l'objet de ces tests).
jest.mock('jsdom', () => ({
  JSDOM: class {
    window: unknown;
    constructor(html = '') {
      const text = String(html).replace(/<[^>]+>/g, '');
      this.window = { document: { querySelectorAll: () => [], body: { textContent: text } } };
    }
  }
}));
jest.mock('dompurify', () => ({ __esModule: true, default: () => ({ sanitize: (html: string) => html }) }));

const mockPrisma = {
  newsletterCampaign: { findFirst: jest.fn(), update: jest.fn() },
  newsletterList: { findFirst: jest.fn() },
  newsletterSubscriber: { findMany: jest.fn() },
  newsletterCampaignRecipient: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  crmContact: { findMany: jest.fn() }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
const mockSendEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({ emailService: { sendEmail: mockSendEmail } }));
jest.mock('../../src/services/providers/whatsapp.provider', () => ({
  configureWhatsAppProvider: jest.fn(() => false),
  getConfiguredWhatsAppProvider: jest.fn(() => null),
  sendText: jest.fn()
}));

import {
  getCampaign,
  getCampaignRecipients,
  getPreviewHtml,
  sendCampaign
} from '../../src/services/newsletter-campaign.service';

const TEMPLATE_HTML =
  '<div><p>Bonjour {{prenom}},</p><div>{{contenu}}</div><p><a href="{{lien_desinscription}}">Se désabonner</a></p></div>';

const baseCampaign = {
  id: 'camp-1',
  tenantId: 'tenant-1',
  listId: 'list-1',
  subject: 'Actualités pour {{prenom}}',
  bodyHtml: '<p>Contenu de la campagne {{lien_desinscription}}</p>',
  status: 'DRAFT',
  list: { id: 'list-1', name: 'Newsletter', type: 'MANUAL' },
  template: { id: 'tpl-1', html: TEMPLATE_HTML }
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.newsletterCampaign.findFirst.mockResolvedValue(baseCampaign);
  mockPrisma.newsletterList.findFirst.mockResolvedValue({ id: 'list-1', tenantId: 'tenant-1', type: 'MANUAL' });
  mockPrisma.newsletterSubscriber.findMany.mockResolvedValue([
    { id: 'sub-1', email: 'mariam@example.test', name: 'Mariam Koné', status: 'ACTIVE' }
  ]);
  mockPrisma.crmContact.findMany.mockResolvedValue([]);
  mockPrisma.newsletterCampaign.update.mockResolvedValue({});
  mockPrisma.newsletterCampaignRecipient.create.mockResolvedValue({});
  mockSendEmail.mockResolvedValue(undefined);
});

describe('sendCampaign avec un modèle', () => {
  it('remplace les variables du modèle et pose un lien de désinscription propre au destinataire', async () => {
    await sendCampaign('tenant-1', 'camp-1');

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const { html, subject } = mockSendEmail.mock.calls[0][0];
    expect(subject).toBe('Actualités pour Mariam');
    expect(html).toContain('Bonjour Mariam,');
    expect(html).toContain('Contenu de la campagne');
    expect(html).not.toContain('href=""');
    expect(html).not.toContain('{{');

    const stored = mockPrisma.newsletterCampaignRecipient.create.mock.calls[0][0].data;
    expect(stored.status).toBe('SENT');
    const links = [...html.matchAll(/\/newsletter\/unsubscribe\?token=([a-f0-9]+)/g)].map(m => m[1]);
    // Le lien du modèle ET celui du corps portent le jeton enregistré pour ce destinataire.
    expect(links).toHaveLength(2);
    expect(links.every(token => token === stored.unsubscribeToken)).toBe(true);
  });
});

describe('getPreviewHtml avec un modèle', () => {
  it('montre des valeurs d’exemple pour les variables du modèle', async () => {
    const preview = await getPreviewHtml('tenant-1', 'camp-1');

    expect(preview.subject).toBe('Actualités pour Prénom');
    expect(preview.html).toContain('Bonjour Prénom,');
    expect(preview.html).toContain('Contenu de la campagne');
    expect(preview.html).not.toContain('href=""');
    expect(preview.html).toContain('/newsletter/unsubscribe?token=preview');
  });
});

describe('sendCampaign vers une liste sans abonné actif', () => {
  it('refuse en amont avec un message clair et laisse la campagne en brouillon', async () => {
    mockPrisma.newsletterSubscriber.findMany.mockResolvedValue([]);

    await expect(sendCampaign('tenant-1', 'camp-1')).rejects.toThrow(/aucun abonné actif/i);

    expect(mockPrisma.newsletterCampaign.update).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe('getCampaignRecipients', () => {
  it('ne renvoie que ce que l’écran affiche : jamais les jetons de désinscription ni d’ouverture', async () => {
    mockPrisma.newsletterCampaignRecipient.findMany.mockResolvedValue([]);
    mockPrisma.newsletterCampaignRecipient.count.mockResolvedValue(0);

    await getCampaignRecipients('tenant-1', 'camp-1', {});

    const query = mockPrisma.newsletterCampaignRecipient.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ campaignId: 'camp-1', tenantId: 'tenant-1' });
    expect(Object.keys(query.select).sort()).toEqual(['email', 'failureReason', 'id', 'openedAt', 'sentAt', 'status']);
  });
});

describe('sendCampaign — variables échappées', () => {
  it('échappe le nom du destinataire dans le HTML et garde le sujet en texte brut', async () => {
    mockPrisma.newsletterSubscriber.findMany.mockResolvedValue([
      { id: 'sub-1', email: 'x@example.test', name: '<img src=x onerror=alert(1)> Koné', status: 'ACTIVE' }
    ]);
    mockPrisma.newsletterCampaign.findFirst.mockResolvedValue({
      ...baseCampaign,
      subject: 'Bonjour {{prenom}}'
    });

    await sendCampaign('tenant-1', 'camp-1');

    const { html, subject } = mockSendEmail.mock.calls[0][0];
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it('ne range pas dans la campagne le HTML du premier destinataire (jetons de désinscription/ouverture)', async () => {
    await sendCampaign('tenant-1', 'camp-1');

    const sent = mockSendEmail.mock.calls[0][0].html as string;
    const token = /unsubscribe\?token=([a-f0-9]+)/.exec(sent)![1];
    const stored = mockPrisma.newsletterCampaign.update.mock.calls
      .map(c => c[0].data.renderedHtml)
      .filter(Boolean)
      .join('');
    expect(stored).not.toContain(token);
    expect(stored).not.toContain('track/open');
  });
});

describe('getCampaign', () => {
  it('ne renvoie pas renderedHtml (jetons du premier destinataire)', async () => {
    mockPrisma.newsletterCampaign.findFirst.mockResolvedValue({
      ...baseCampaign,
      renderedHtml: '<a href="/newsletter/unsubscribe?token=secret">x</a>'
    });
    mockPrisma.newsletterCampaignRecipient.count.mockResolvedValue(0);

    const campaign = await getCampaign('tenant-1', 'camp-1');

    expect(campaign).not.toHaveProperty('renderedHtml');
    expect(JSON.stringify(campaign)).not.toContain('secret');
  });
});
