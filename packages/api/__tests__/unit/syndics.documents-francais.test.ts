/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Documents officiels du syndic (PV d'AG, convocation) : toujours en français,
 * quelle que soit la langue de l'interface ; feuille de présence (lot
 * représenté, émargement ABSENT).
 */
import PizZip from 'pizzip';
import { currentLanguage, runInFrench, runWithLanguage, t } from '../../src/i18n';
import {
  buildAttendanceSheet,
  buildMeetingMinutesDocx,
  formatMeetingType
} from '../../src/lib/syndics/minutes-generator';
import { buildConvocationContext, type PartyFacts } from '../../src/lib/syndics/word-documents';

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/services/email-service', () => ({ emailService: { sendEmail: jest.fn() } }));
jest.mock('../../src/services/email-notification-config-service', () => ({ getEmailNotificationConfig: jest.fn() }));

const extractText = (buffer: Buffer): string =>
  new PizZip(buffer)
    .file('word/document.xml')!
    .asText()
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '');

const branding: any = {
  issuer: {
    kind: 'AGENCY',
    name: 'Cabinet Horizon',
    legalName: null,
    address: 'Cocody, Abidjan',
    phone: null,
    email: null,
    rccm: null,
    taxId: null
  },
  issuerLogo: null,
  signature: null,
  stamp: null,
  syndicate: {
    name: 'Résidence Les Flamboyants',
    address: null,
    registrationNo: null,
    cadastralReference: null,
    logo: null
  }
};
const party: PartyFacts = {
  name: 'Awa Traoré',
  address: 'Plateau',
  email: 'a@x.ci',
  lotNumber: 'A12',
  lotType: 'Appartement',
  shares: '85',
  totalShares: '1000'
};

const lots = [
  { id: 'l1', lotNumber: '1', generalShares: 100, voters: [{ firstName: 'Awa', lastName: 'Traoré' }] },
  { id: 'l2', lotNumber: '2', generalShares: 200, voters: [{ firstName: 'Kofi', lastName: 'Mensah' }] },
  { id: 'l3', lotNumber: '3', generalShares: 300, voters: [{ firstName: 'Mariam', lastName: 'Sy' }] },
  { id: 'l4', lotNumber: '4', generalShares: 400, voters: [{ firstName: 'Paul', lastName: 'Yao' }] }
];

const meeting: any = {
  id: 'm1',
  type: 'ORDINARY',
  scheduledAt: new Date('2026-02-20T09:00:00Z'),
  startTime: new Date('2026-02-20T09:00:00Z'),
  location: 'Salle',
  quorum: 50,
  syndicate: { name: 'Résidence', address: 'Abidjan', tenantId: 'tenant-sans-modele', lots },
  agendaItems: [],
  resolutions: [
    { title: 'Budget', majorityRule: 'ARTICLE_24', result: 'APPROVED', votes: [{ lotId: 'l3' }, { lotId: 'l4' }] }
  ],
  attendances: [
    { lotId: 'l1', status: 'REPRESENTED', mode: 'IN_PERSON', representedByName: 'Dupont' },
    { lotId: 'l2', status: 'PRESENT', mode: 'ONLINE' },
    { lotId: 'l3', status: 'ABSENT', mode: 'IN_PERSON' }
  ]
};

describe('runInFrench', () => {
  it.each(['en', 'ar'] as const)('retombe sur le français quand la langue ambiante est %s', async language => {
    await runWithLanguage(language, async () => {
      expect(currentLanguage()).toBe(language);
      await runInFrench(async () => {
        await Promise.resolve();
        expect(currentLanguage()).toBe('fr');
        expect(t('Ordinaire')).toBe('Ordinaire');
      });
      expect(currentLanguage()).toBe(language);
    });
  });
});

describe('documents officiels en français', () => {
  const run = (language: 'en' | 'ar') =>
    runWithLanguage(language, () =>
      runInFrench(async () => {
        const text = extractText(await buildMeetingMinutesDocx(meeting));
        const ctx: any = buildConvocationContext({
          meeting: {
            id: 'e'.repeat(8),
            type: 'ORDINARY',
            scheduledAt: new Date(2027, 2, 10, 9, 0),
            location: null,
            quorum: null,
            points: []
          },
          branding,
          party
        });
        return { text, ctx };
      })
    );

  it.each(['en', 'ar'] as const)('PV et convocation sans clé %s', async language => {
    const { text, ctx } = await run(language);
    expect(ctx.ASSEMBLEE_TYPE).toBe('ordinaire');
    expect(ctx.ASSEMBLEE_LIEU).toBe('À préciser');
    expect(text).toContain('Type : Ordinaire');
    expect(text).toContain('En ligne');
    expect(text).toContain('Représenté (par Dupont)');
    for (const wrong of ['ordinary', 'Ordinary', 'In the room', 'Online', 'Represented']) {
      expect(text).not.toContain(wrong);
    }
  });

  it('sans l’aide, la langue anglaise fuit (garde-fou du test)', () => {
    runWithLanguage('en', () => {
      expect(formatMeetingType('ORDINARY')).not.toBe('Ordinaire');
    });
  });
});

describe('feuille de présence', () => {
  it('lot représenté : mode « Représenté (par X) », statut « Représenté(e) »', () => {
    const row = buildAttendanceSheet(meeting).rows.find(r => r.lot === '1')!;
    expect(row.mode).toBe('Représenté (par Dupont)');
    expect(row.status).toBe('Représenté(e)');
  });

  it('lot représenté sans nom : « Non renseigné »', () => {
    const m = { ...meeting, attendances: [{ lotId: 'l1', status: 'REPRESENTED', mode: 'IN_PERSON' }] };
    expect(buildAttendanceSheet(m).rows[0].mode).toBe('Représenté (par Non renseigné)');
  });

  it('lot présent : mode En ligne / En salle conservé', () => {
    const m = {
      ...meeting,
      attendances: [
        { lotId: 'l2', status: 'PRESENT', mode: 'ONLINE' },
        { lotId: 'l1', status: 'PRESENT', mode: 'IN_PERSON' }
      ]
    };
    const rows = buildAttendanceSheet(m).rows;
    expect(rows.find(r => r.lot === '2')!.mode).toBe('En ligne');
    expect(rows.find(r => r.lot === '1')!.mode).toBe('En salle');
  });

  it('émargé ABSENT ayant voté : absent, non compté ; sans émargement ayant voté : présent', () => {
    const sheet = buildAttendanceSheet(meeting);
    const l3 = sheet.rows.find(r => r.lot === '3')!;
    const l4 = sheet.rows.find(r => r.lot === '4')!;
    expect(l3.status).toBe('Absent(e)');
    expect(l3.mode).toBe('-');
    expect(l4.status).toBe('Présent(e)');
    // l1 (100) + l2 (200) + l4 (400) = 700 sur 1000 ; l3 exclu
    expect(sheet.summary).toContain('3 sur 4');
    expect(sheet.summary).toContain('700 tantièmes sur 1');
  });
});
