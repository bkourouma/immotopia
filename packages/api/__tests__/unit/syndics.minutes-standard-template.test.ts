/**
 * Compte rendu d'AG sans modele d'agence : le modele standard (en-tete, logos,
 * pied de page) remplace le texte brut. Un logo present est injecte, un logo
 * absent disparait sans laisser de marqueur.
 */
import PizZip from 'pizzip';

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { buildMeetingMinutesDocx } from '../../src/lib/syndics/minutes-generator';
import type { DocumentBranding } from '../../src/lib/documents/document-branding';

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const meeting = {
  id: 'abcdef12-0000-0000-0000-000000000000',
  type: 'ORDINARY',
  scheduledAt: new Date('2026-03-10T09:00:00Z'),
  location: 'Salle polyvalente',
  quorum: 60,
  syndicate: { name: 'Résidence Les Flamboyants', address: 'Riviera 3', tenantId: 'tenant-sans-modele' },
  agendaItems: [
    { orderIndex: 1, title: 'Approbation des comptes', discussions: ['Comptes présentés'] },
    { orderIndex: 2, title: 'Budget', discussions: [] }
  ],
  resolutions: [{ title: 'Budget prévisionnel', result: 'APPROVED', votesFor: 5, votesAgainst: 0, votesAbstain: 1 }],
  proxies: []
};

const branding = (withLogos: boolean): DocumentBranding => ({
  issuer: {
    kind: 'AGENCY',
    name: 'Cabinet Horizon',
    legalName: null,
    address: 'Cocody',
    phone: null,
    email: null,
    rccm: null,
    taxId: null
  },
  issuerLogo: withLogos ? { bytes: PNG_1X1, format: 'png' } : null,
  signature: null,
  stamp: null,
  syndicate: {
    name: 'Résidence Les Flamboyants',
    address: 'Riviera 3',
    registrationNo: 'IMM-001',
    cadastralReference: null,
    logo: withLogos ? { bytes: PNG_1X1, format: 'png' } : null
  }
});

const textOf = (zip: PizZip, part: string): string =>
  zip
    .file(part)!
    .asText()
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '');

describe("compte rendu d'AG : modele standard", () => {
  it('utilise le modele standard avec en-tete et pied, sans balise non resolue', async () => {
    const zip = new PizZip(await buildMeetingMinutesDocx(meeting as never, undefined, branding(false)));

    const header = textOf(zip, 'word/header1.xml');
    expect(header).toContain('Cabinet Horizon');
    expect(header).toContain('Résidence Les Flamboyants');
    expect(textOf(zip, 'word/footer1.xml')).toContain('Cabinet Horizon');

    const body = textOf(zip, 'word/document.xml');
    expect(body).toContain('COMPTE RENDU D’ASSEMBLÉE GÉNÉRALE');
    expect(body).toContain('AG-ABCDEF12');
    expect(body).toContain('IMM-001');
    expect(body).toContain('1. Approbation des comptes');
    expect(body).toContain('Comptes présentés');
    expect(body).toContain('Votes : pour 5, contre 0, abstention 1');

    for (const part of ['word/document.xml', 'word/header1.xml', 'word/footer1.xml']) {
      const text = textOf(zip, part);
      expect(text).not.toContain('{{');
      expect(text).not.toMatch(/LOGO_|@@/);
    }
  });

  it("injecte le logo de l'emetteur et celui de la copropriete", async () => {
    const zip = new PizZip(await buildMeetingMinutesDocx(meeting as never, undefined, branding(true)));

    expect(zip.file('word/media/logo_emetteur.png')).not.toBeNull();
    expect(zip.file('word/media/logo_copropriete.png')).not.toBeNull();
    expect(
      zip
        .file('word/header1.xml')!
        .asText()
        .match(/<w:drawing>/g)
    ).toHaveLength(2);
  });

  it('sans identite ni logo : le document sort quand meme, sans marqueur visible', async () => {
    const zip = new PizZip(await buildMeetingMinutesDocx(meeting as never));

    expect(zip.file(/^word\/media\//)).toHaveLength(0);
    expect(zip.file('word/header1.xml')!.asText()).not.toMatch(/LOGO_|@@|\{\{/);
    expect(textOf(zip, 'word/document.xml')).toContain('Résidence Les Flamboyants');
  });
});
