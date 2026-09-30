/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SECURITY.md §7 : le `html` d'un gabarit de newsletter est assaini à la
 * création et à la mise à jour. `jsdom`/`dompurify` (ESM-only) ne se chargent
 * pas sous Jest : l'assainisseur est remplacé par un espion qui retire les
 * scripts, ce qui prouve que le service le traverse avant d'écrire en base.
 */
const mockPrisma: Record<string, any> = {
  newsletterTemplate: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  newsletterCampaign: { findFirst: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
const mockSanitize = jest.fn((html: string) => html.replace(/<script.*?<\/script>/gi, ''));
jest.mock('../../src/utils/sanitize-html', () => ({ sanitizeHtml: (h: string) => mockSanitize(h) }));

import { createTemplate, updateTemplate } from '../../src/services/newsletter-template.service';

const EVIL =
  '<p>Bonjour</p><script>alert(1)</script><img src=x onerror=alert(2)><a href="javascript:alert(3)">x</a>{{contenu}}';

describe('gabarits de newsletter assainis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.newsletterTemplate.findUnique.mockResolvedValue(null);
    mockPrisma.newsletterTemplate.create.mockImplementation(async ({ data }: any) => data);
    mockPrisma.newsletterTemplate.update.mockImplementation(async ({ data }: any) => data);
  });

  it('createTemplate', async () => {
    const r: any = await createTemplate('t1', { name: 'n', html: EVIL });
    expect(mockSanitize).toHaveBeenCalledWith(EVIL);
    expect(r.html).not.toContain('<script');
    expect(r.html).toContain('{{contenu}}');
  });

  it('updateTemplate', async () => {
    mockPrisma.newsletterTemplate.findFirst.mockResolvedValue({ id: 'x', name: 'n' });
    const r: any = await updateTemplate('t1', 'x', { html: EVIL });
    expect(mockSanitize).toHaveBeenCalledWith(EVIL);
    expect(r.html).not.toContain('<script');
  });
});
