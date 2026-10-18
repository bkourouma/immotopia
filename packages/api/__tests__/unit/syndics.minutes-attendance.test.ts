/**
 * Recette AG du 17/10 : le compte rendu Word doit porter la feuille de presence
 * et la ligne « Lots presents ou representes » par les TROIS chemins (modele de
 * l'agence, modele standard, texte brut), le quorum au format francais, et
 * reprendre les titres des resolutions quand l'ordre du jour est vide.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import PizZip from 'pizzip';

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

const mockDirs = { write: '', shipped: '' };
jest.mock('../../src/utils/assets-paths', () => ({
  getTemplatesWriteDir: () => mockDirs.write,
  getShippedTemplatesDir: () => mockDirs.shipped
}));

const mockStandard = { fail: false };
jest.mock('../../src/lib/documents/docx-standard-templates', () => {
  const actual = jest.requireActual('../../src/lib/documents/docx-standard-templates');
  return {
    ...actual,
    loadStandardTemplate: (key: string) => {
      if (mockStandard.fail) return Promise.reject(new Error('modele standard indisponible'));
      return actual.loadStandardTemplate(key);
    }
  };
});

import { buildMeetingMinutesDocx } from '../../src/lib/syndics/minutes-generator';

const NBSP = ' ';

const meeting = {
  id: 'abcdef12-0000-0000-0000-000000000000',
  type: 'ORDINARY',
  scheduledAt: new Date('2026-10-17T09:00:00Z'),
  location: 'Salle polyvalente',
  quorum: 16.2,
  syndicate: {
    name: 'Residence Test',
    address: 'Riviera 3',
    tenantId: 'tenant-cr',
    lots: [
      { id: 'l1', lotNumber: '001', generalShares: 48, voters: [{ firstName: 'Awa', lastName: 'Traore' }] },
      { id: 'l2', lotNumber: '002', generalShares: 34, voters: [{ firstName: 'Jean', lastName: 'Kouadio' }] },
      { id: 'l3', lotNumber: '003', generalShares: 41, voters: [{ firstName: 'Fatou', lastName: 'Diallo' }] }
    ]
  },
  attendances: [
    { lotId: 'l2', status: 'PRESENT', mode: 'IN_PERSON' },
    { lotId: 'l3', status: 'PRESENT', mode: 'ONLINE' }
  ],
  agendaItems: [],
  resolutions: [
    { title: 'Approbation des comptes', result: 'APPROVED', votesFor: 2, votesAgainst: 0, votesAbstain: 0 },
    { title: 'Budget previsionnel', result: 'REJECTED', votesFor: 0, votesAgainst: 2, votesAbstain: 0 }
  ],
  proxies: []
};

const textOf = (buffer: Buffer): string =>
  new PizZip(buffer)
    .file('word/document.xml')!
    .asText()
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&');

/** Ancien modele d'agence : aucune balise de presence. */
function agencyTemplate(): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      '<w:p><w:r><w:t>PV de {{SYNDICATE_NAME}}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Quorum : {{MEETING_QUORUM}}</w:t></w:r></w:p>' +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>'
  );
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}

beforeAll(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-ag-'));
  mockDirs.write = root;
  mockDirs.shipped = path.join(root, 'absent');
  const dir = path.join(root, 'tenants', 'tenant-cr');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'compte-rendu-TEMPLATE.docx'), agencyTemplate());
});

afterEach(() => {
  mockStandard.fail = false;
});

function expectAttendanceAndQuorum(text: string) {
  expect(text).toContain('FEUILLE DE PRÉSENCE');
  expect(text).toContain('Lots présents ou représentés : 2 sur 3');
  expect(text).toContain('Jean Kouadio');
  expect(text).toContain('Fatou Diallo');
  expect(text).toMatch(/En salle/);
  expect(text).toMatch(/En ligne/);
  expect(text).toContain(`16,2${NBSP}%`);
  expect(text).not.toContain('16.2%');
}

describe("compte rendu d'AG : feuille de presence sur les trois chemins", () => {
  it('modele standard : feuille de presence, lots presents, quorum francais, resolutions en ordre du jour', async () => {
    const text = textOf(await buildMeetingMinutesDocx(meeting as never, 'sans-modele'));
    expectAttendanceAndQuorum(text);
    expect(text).not.toContain('Aucun point d’ordre du jour renseigné');
    expect(text).toContain('1. Approbation des comptes');
    expect(text).toContain('2. Budget previsionnel');
    expect(text).not.toMatch(/\{\{|LOGO_/);
  });

  it("modele de l'agence sans balise de presence : la feuille est ajoutee", async () => {
    const text = textOf(await buildMeetingMinutesDocx(meeting as never));
    expect(text).toContain('PV de Residence Test');
    expectAttendanceAndQuorum(text);
  });

  it('texte brut : feuille de presence, quorum francais, resolutions en ordre du jour', async () => {
    mockStandard.fail = true;
    const text = textOf(await buildMeetingMinutesDocx(meeting as never, 'sans-modele'));
    expectAttendanceAndQuorum(text);
    expect(text).not.toContain('Aucun point d’ordre du jour renseigné');
    expect(text).toContain('1. Approbation des comptes');
  });

  it('le quorum garde un format francais pour un entier ou une valeur decimale Prisma', async () => {
    const text = textOf(await buildMeetingMinutesDocx({ ...meeting, quorum: 60 } as never, 'sans-modele'));
    expect(text).toContain(`60${NBSP}%`);
    const decimal = { toString: () => '16.20' };
    const text2 = textOf(await buildMeetingMinutesDocx({ ...meeting, quorum: decimal } as never, 'sans-modele'));
    expect(text2).toContain(`16,2${NBSP}%`);
  });

  it('le bloc des signatures reste avec la synthese (keepNext, pas de saut de page)', async () => {
    const xml = new PizZip(await buildMeetingMinutesDocx(meeting as never, 'sans-modele'))
      .file('word/document.xml')!
      .asText();
    const paragraphOf = (needle: string) => {
      const at = xml.indexOf(needle);
      expect(at).toBeGreaterThan(-1);
      return xml.slice(xml.lastIndexOf('<w:p>', at), at);
    };
    expect(paragraphOf('Les échanges ci-dessus')).toContain('<w:keepNext/>');
    expect(paragraphOf('Le Président de séance')).toContain('<w:keepNext/>');
    expect(xml).not.toContain('w:type="page"');
  });
});
