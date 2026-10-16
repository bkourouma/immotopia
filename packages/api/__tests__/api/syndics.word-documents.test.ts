/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Documents Word du syndic sur HTTP : avis d'appel de charges, quittance et
 * convocation à l'AG. Session, agence et permissions sont des passe-plats ;
 * la base est simulée en mémoire (filtres d'agence et de copropriété appliqués
 * comme le fait Prisma), et le rendu est le VRAI : modèle standard livré +
 * docxtemplater. On ouvre le .docx rendu et on lit word/document.xml.
 */

import express from 'express';
import request from 'supertest';
import PizZip from 'pizzip';

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));
jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));
jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  enforcePropertyTenantIsolation: (_req: any, _res: any, next: any) => next()
}));
jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requireAnyPropertyPermission: () => (_req: any, _res: any, next: any) => next(),
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));
jest.mock('../../src/middleware/rate-limit-middleware', () => {
  const pass = (_req: any, _res: any, next: any) => next();
  return {
    chargeCallNoticeRateLimiter: pass,
    chargeScheduleExecuteRateLimiter: pass,
    receiptPrintRateLimiter: pass,
    receiptResendRateLimiter: pass
  };
});
jest.mock('../../src/services/email-service', () => ({ emailService: { sendEmail: jest.fn() } }));
jest.mock('../../src/services/email-notification-config-service', () => ({ getEmailNotificationConfig: jest.fn() }));

const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const SYN_A = '11111111-1111-4111-8111-111111111111';
const SYN_B = '22222222-2222-4222-8222-222222222222';
const SYN_C = '33333333-3333-4333-8333-333333333333';
const LOT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CALL_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REC_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MEET_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const syndicates: Record<string, { tenantId: string }> = {
  [SYN_A]: { tenantId: TENANT },
  [SYN_B]: { tenantId: TENANT },
  [SYN_C]: { tenantId: OTHER_TENANT }
};

const contact = {
  firstName: 'Awa',
  lastName: 'Traoré',
  legalName: null,
  address: 'Plateau, Abidjan',
  email: 'awa@exemple.ci'
};
const lots = [
  {
    id: LOT_A,
    syndicateId: SYN_A,
    lotNumber: 'A12',
    lotType: 'APARTMENT',
    generalShares: 85,
    owner: contact,
    coowner: null,
    ownerProfiles: []
  },
  {
    id: LOT_B,
    syndicateId: SYN_B,
    lotNumber: 'B7',
    lotType: 'PARKING',
    generalShares: 10,
    owner: contact,
    coowner: null,
    ownerProfiles: []
  }
];
const calls = [
  {
    id: CALL_A,
    syndicateId: SYN_A,
    lotId: LOT_A,
    period: '3e trimestre 2026',
    periodStart: new Date('2026-07-01T00:00:00Z'),
    periodEnd: new Date('2026-09-30T00:00:00Z'),
    amount: 45000,
    currency: 'XOF',
    dueDate: new Date('2026-10-15T00:00:00Z'),
    createdAt: new Date('2026-09-20T10:00:00Z'),
    allocations: [{ amount: 5000, source: 'ADVANCE' }],
    lot: {
      lotNumber: 'A12',
      lotType: 'APARTMENT',
      owner: contact,
      coowner: null,
      property: { title: 'Résidence Les Flamboyants' }
    }
  }
];
const snapshot = {
  version: 1,
  kind: 'QUITTANCE',
  number: 'QCH-2026-0042',
  issuedAt: '2026-10-12T09:00:00.000Z',
  currency: 'XOF',
  amount: 45000,
  issuer: {
    key: 'AGENCY',
    kind: 'AGENCY',
    name: 'Cabinet Horizon',
    legalName: null,
    address: 'Cocody, Abidjan',
    phone: '+225 27 00 00 00',
    email: 'contact@horizon.ci',
    rccm: 'CI-ABJ-2020-B-1234',
    taxId: '2012345A'
  },
  syndicate: {
    name: 'Résidence Les Flamboyants',
    address: 'Riviera 3, Abidjan',
    registrationNo: 'IMM-2019-0042',
    cadastralReference: null
  },
  lot: { number: 'A12', type: 'Appartement', label: null },
  coowner: { name: 'Awa Traoré', address: 'Plateau, Abidjan' },
  call: {
    id: CALL_A,
    period: { label: '3e trimestre 2026', start: null, end: null },
    amount: 45000,
    dueDate: '2026-10-15'
  },
  settlements: [{ paidAt: '2026-10-12', method: 'VIREMENT', reference: 'TRX-889', amount: 45000, source: 'PAYMENT' }],
  settledAt: '2026-10-12',
  payment: null,
  allocations: [],
  outstandingAfter: 0,
  advance: 0,
  lotAdvanceBalance: 0,
  backfilled: false
};
const receipts = [
  {
    id: REC_A,
    tenantId: TENANT,
    syndicateId: SYN_A,
    lotId: LOT_A,
    contactId: null,
    kind: 'QUITTANCE',
    number: 'QCH-2026-0042',
    snapshot,
    filePath: null,
    emailedAt: null
  }
];
const meetings = [
  {
    id: MEET_A,
    syndicateId: SYN_A,
    type: 'ORDINARY',
    scheduledAt: new Date('2027-03-10T09:00:00Z'),
    location: 'Salle polyvalente',
    quorum: 50,
    agendaItems: [
      { orderIndex: 1, title: 'Approbation des comptes' },
      { orderIndex: 2, title: 'Vote du budget prévisionnel' }
    ],
    resolutions: []
  }
];

/** Filtres Prisma utilisés par les chargeurs : égalités simples et `syndicate: { tenantId }`. */
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'syndicate') return syndicates[row.syndicateId]?.tenantId === value.tenantId;
    if (value && typeof value === 'object') return true;
    return row[key] === value;
  });
}
const find =
  (rows: any[]) =>
  async ({ where }: any) =>
    rows.find(row => matches(row, where)) ?? null;

jest.mock('../../src/utils/database', () => ({
  prisma: {
    syndicate: { findFirst: jest.fn() },
    syndicateLot: { findFirst: jest.fn(), aggregate: jest.fn() },
    chargeCall: { findFirst: jest.fn() },
    syndicPaymentMethod: { findMany: jest.fn() },
    syndicChargeReceipt: { findFirst: jest.fn() },
    generalMeeting: { findFirst: jest.fn() }
  }
}));
jest.mock('../../src/lib/documents/document-branding', () => ({
  ...jest.requireActual('../../src/lib/documents/document-branding'),
  resolveDocumentBranding: jest.fn()
}));

import { prisma } from '../../src/utils/database';
import { resolveDocumentBranding } from '../../src/lib/documents/document-branding';
import chargeSchedulesRoutes from '../../src/routes/syndic-charge-schedules-routes';
import receiptsRoutes from '../../src/routes/syndic-receipts-routes';
import syndicRoutes from '../../src/routes/syndic-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const app = express();
app.use(express.json());
app.use('/api', chargeSchedulesRoutes);
app.use('/api', receiptsRoutes);
app.use('/api', syndicRoutes);
app.use(errorHandler);

const base = (tenant: string, syndic: string) => `/api/tenants/${tenant}/syndics/${syndic}`;

beforeEach(() => {
  jest.clearAllMocks();
  const db = prisma as any;
  db.syndicate.findFirst.mockImplementation(async ({ where }: any) =>
    syndicates[where.id]?.tenantId === where.tenantId ? { id: where.id } : null
  );
  db.syndicateLot.findFirst.mockImplementation(find(lots));
  db.syndicateLot.aggregate.mockResolvedValue({ _sum: { generalShares: 1000 } });
  db.chargeCall.findFirst.mockImplementation(find(calls));
  db.syndicPaymentMethod.findMany.mockResolvedValue([
    { type: 'BANK_TRANSFER', label: 'Compte syndic', provider: null, accountRef: 'CI000 0000' }
  ]);
  db.syndicChargeReceipt.findFirst.mockImplementation(find(receipts));
  db.generalMeeting.findFirst.mockImplementation(find(meetings));
  (resolveDocumentBranding as jest.Mock).mockResolvedValue({
    issuer: snapshot.issuer,
    issuerLogo: null,
    signature: null,
    stamp: null,
    syndicate: { ...snapshot.syndicate, logo: null },
    source: { issuerKey: 'AGENCY', logoKey: null, signatureKey: null, stampKey: null }
  });
});

/** Texte brut d'un .docx : corps, en-têtes et pieds de page. */
function docxText(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  return zip
    .file(/^word\/(document|header\d*|footer\d*)\.xml$/)
    .map(file => file.asText().replace(/<[^>]+>/g, ' '))
    .join(' ')
    .replace(/\s+/g, ' ');
}

const binary = (res: any) => res.body as Buffer;
const download = (url: string) =>
  request(app)
    .get(url)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });

function expectDocx(res: any, fileName: RegExp) {
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain(DOCX);
  expect(res.headers['content-disposition']).toMatch(/^attachment; filename\*=UTF-8''/);
  expect(decodeURIComponent(res.headers['content-disposition'].split("''")[1])).toMatch(fileName);
  expect(binary(res).subarray(0, 2).toString()).toBe('PK');
  expect(res.headers['content-disposition']).not.toMatch(/uploads|assets|[\\/]modeles/i);
}

describe('GET .../charges/:chargeId/avis.docx', () => {
  const url = `${base(TENANT, SYN_A)}/charges/${CALL_A}/avis.docx`;

  it('200 : Word rempli avec les vraies données, en-tête et pied de page', async () => {
    const res = await download(url);
    expectDocx(res, /^avis-appel-A12-3e-trimestre-2026\.docx$/);
    const text = docxText(binary(res));
    expect(text).toContain('Awa Traoré');
    expect(text).toContain('A12');
    expect(text).toContain('85 / 1000');
    expect(text).toContain('45 000');
    expect(text).toContain('FCFA');
    expect(text).toContain('quarante-cinq mille francs CFA');
    expect(text).toContain('15/10/2026');
    expect(text).toContain('3e trimestre 2026');
    expect(text).toContain('Compte syndic');
    expect(text).toContain('Cabinet Horizon');
    expect(text).toContain('Résidence Les Flamboyants');
    expect(text).not.toContain('{{');
  });

  it('404 : appel d’une autre agence, d’une autre copropriété ou identifiant invalide', async () => {
    expect((await request(app).get(`${base(OTHER_TENANT, SYN_A)}/charges/${CALL_A}/avis.docx`)).status).toBe(404);
    expect((await request(app).get(`${base(TENANT, SYN_B)}/charges/${CALL_A}/avis.docx`)).status).toBe(404);
    expect((await request(app).get(`${base(OTHER_TENANT, SYN_C)}/charges/${CALL_A}/avis.docx`)).status).toBe(404);
    expect((await request(app).get(`${base(TENANT, SYN_A)}/charges/pas-un-uuid/avis.docx`)).status).toBe(404);
  });
});

describe('GET .../quittances/:receiptId/fichier.docx', () => {
  const url = `${base(TENANT, SYN_A)}/quittances/${REC_A}/fichier.docx`;

  it('200 : Word depuis le snapshot figé', async () => {
    const res = await download(url);
    expectDocx(res, /^quittance-QCH-2026-0042\.docx$/);
    const text = docxText(binary(res));
    expect(text).toContain('Awa Traoré');
    expect(text).toContain('A12');
    expect(text).toContain('QCH-2026-0042');
    expect(text).toContain('45 000');
    expect(text).toContain('quarante-cinq mille francs CFA');
    expect(text).toContain('12/10/2026');
    expect(text).toContain('Virement');
    expect(text).toContain('TRX-889');
    expect(text).not.toContain('{{');
    // Jamais de relecture du lot vivant : les tantièmes ne figurent pas au snapshot.
    expect((prisma as any).syndicateLot.findFirst).not.toHaveBeenCalled();
  });

  it('404 : quittance d’une autre agence ou d’une autre copropriété', async () => {
    expect((await request(app).get(`${base(OTHER_TENANT, SYN_A)}/quittances/${REC_A}/fichier.docx`)).status).toBe(404);
    expect((await request(app).get(`${base(TENANT, SYN_B)}/quittances/${REC_A}/fichier.docx`)).status).toBe(404);
    expect((await request(app).get(`${base(TENANT, SYN_A)}/quittances/pas-un-uuid/fichier.docx`)).status).toBe(404);
  });
});

describe('GET .../assemblees/:meetingId/lots/:lotId/convocation.docx', () => {
  const url = `${base(TENANT, SYN_A)}/assemblees/${MEET_A}/lots/${LOT_A}/convocation.docx`;

  it('200 : convocation du lot avec ordre du jour, quorum et date limite', async () => {
    const res = await download(`${url}?dateLimitePouvoir=2027-03-05`);
    expectDocx(res, /^convocation-ag-A12\.docx$/);
    const text = docxText(binary(res));
    expect(text).toContain('Awa Traoré');
    expect(text).toContain('A12');
    expect(text).toContain('ordinaire');
    expect(text).toContain(new Date('2027-03-10T09:00:00Z').toLocaleDateString('fr-FR'));
    expect(text).toContain('Salle polyvalente');
    expect(text).toContain('1. Approbation des comptes');
    expect(text).toContain('2. Vote du budget prévisionnel');
    expect(text).toContain('05/03/2027');
    expect(text).toContain('quorum requis est de 50 %');
    expect(text).not.toContain('{{');
  });

  it('sans logo ni quorum, le document sort quand même', async () => {
    (meetings[0] as any).quorum = null;
    const res = await download(url);
    (meetings[0] as any).quorum = 50;
    expect(res.status).toBe(200);
    expect(docxText(binary(res))).not.toContain('{{');
  });

  it('400 sur une date limite invalide', async () => {
    expect((await request(app).get(`${url}?dateLimitePouvoir=2027-13-45`)).status).toBe(400);
    expect((await request(app).get(`${url}?autre=1`)).status).toBe(400);
  });

  it('404 : autre agence, autre copropriété, lot d’une autre copropriété, identifiants invalides', async () => {
    const path = (tenant: string, syndic: string, meeting = MEET_A, lot = LOT_A) =>
      `${base(tenant, syndic)}/assemblees/${meeting}/lots/${lot}/convocation.docx`;
    expect((await request(app).get(path(OTHER_TENANT, SYN_A))).status).toBe(404);
    expect((await request(app).get(path(TENANT, SYN_B))).status).toBe(404);
    expect((await request(app).get(path(TENANT, SYN_A, MEET_A, LOT_B))).status).toBe(404);
    expect((await request(app).get(path(TENANT, SYN_A, 'x'))).status).toBe(404);
    expect((await request(app).get(path(TENANT, SYN_A, MEET_A, 'x'))).status).toBe(404);
  });
});
