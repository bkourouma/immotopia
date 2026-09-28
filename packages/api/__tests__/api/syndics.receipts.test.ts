/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot S3 — routes des reçus et quittances (`routes/syndic-receipts-routes.ts`),
 * sur HTTP. Session, agence et permissions sont des passe-plats ; seul le
 * module de domaine est simulé (sa logique est testée dans
 * `unit/syndics.charge-receipts.test.ts`).
 */

import express from 'express';
import request from 'supertest';
import { findDiskPathLeaks } from '../helpers/disk-path-leaks';

let mockNextUser = 1;
jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    // Un utilisateur par requete, sauf en-tete explicite : les limiteurs
    // (par utilisateur et agence) ne se declenchent que dans leur test.
    req.user = { userId: req.headers['x-test-user'] ?? `user-${mockNextUser++}`, globalRole: 'USER' };
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

const mockList = jest.fn();
const mockListLot = jest.fn();
const mockFile = jest.fn();
const mockResend = jest.fn();
const mockPrint = jest.fn();
const mockBackfill = jest.fn();
jest.mock('../../src/lib/syndics/charge-receipt-queries', () => ({
  listSyndicateReceipts: (...args: any[]) => mockList(...args),
  listLotReceipts: (...args: any[]) => mockListLot(...args),
  getReceiptFile: (...args: any[]) => mockFile(...args),
  resendReceiptEmail: (...args: any[]) => mockResend(...args),
  printReceipts: (...args: any[]) => mockPrint(...args),
  backfillMissingQuittances: (...args: any[]) => mockBackfill(...args)
}));

import receiptsRoutes from '../../src/routes/syndic-receipts-routes';
import { errorHandler, NotFoundError, ValidationError } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use('/api', receiptsRoutes);
app.use(errorHandler);

const TENANT = 'tenant-1';
const SYNDIC = '11111111-1111-4111-8111-111111111111';
const LOT = '22222222-2222-4222-8222-222222222222';
const RECEIPT = '33333333-3333-4333-8333-333333333333';
const BASE = `/api/tenants/${TENANT}/syndics/${SYNDIC}`;

const view = {
  id: RECEIPT,
  kind: 'QUITTANCE',
  number: 'Q-2026-000001',
  lotId: LOT,
  lotNumber: 'A-01',
  contactId: 'contact-1',
  coownerName: 'Awa Kone',
  chargeCallId: '44444444-4444-4444-8444-444444444444',
  chargePaymentId: null,
  periodLabel: '2026-01',
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  amount: 10000,
  currency: 'XOF',
  issuedAt: '2026-02-01T10:00:00.000Z',
  emailedAt: null,
  emailError: null,
  backfilled: false
};
const page = { items: [view], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } };

beforeEach(() => jest.clearAllMocks());

describe('GET .../quittances', () => {
  it('200 avec la liste, filtres convertis, sans chemin disque', async () => {
    mockList.mockResolvedValue(page);
    const response = await request(app).get(
      `${BASE}/quittances?kind=QUITTANCE&lotId=${LOT}&contactId=contact-1&from=2026-01-01&to=2026-03-31&page=2&limit=10`
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: page });
    expect(findDiskPathLeaks(response.body)).toEqual([]);
    expect(mockList).toHaveBeenCalledWith(TENANT, SYNDIC, {
      kind: 'QUITTANCE',
      lotId: LOT,
      contactId: 'contact-1',
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-03-31T00:00:00.000Z'),
      page: 2,
      limit: 10
    });
  });

  it('400 sur un filtre invalide', async () => {
    for (const query of [
      'kind=AUTRE',
      'lotId=pas-un-uuid',
      'from=2026-02-30',
      'from=2026-03-01&to=2026-01-01',
      'limit=500',
      'contactId=../x'
    ]) {
      const response = await request(app).get(`${BASE}/quittances?${query}`);
      expect(response.status).toBe(400);
    }
    expect(mockList).not.toHaveBeenCalled();
  });

  it('404 quand la copropriete n est pas un UUID, sans appeler le service', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT}/syndics/pas-une-copro/quittances`);
    expect(response.status).toBe(404);
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('GET .../lots/:lotId/quittances', () => {
  it('200 via le service du lot ; 404 relaye', async () => {
    mockListLot.mockResolvedValue(page);
    const ok = await request(app).get(`${BASE}/lots/${LOT}/quittances`);
    expect(ok.status).toBe(200);
    expect(mockListLot).toHaveBeenCalledWith(TENANT, SYNDIC, LOT, { page: 1, limit: 20 });

    mockListLot.mockRejectedValue(new NotFoundError('Lot introuvable ou inaccessible pour cette copropriete.'));
    expect((await request(app).get(`${BASE}/lots/${LOT}/quittances`)).status).toBe(404);
  });
});

describe('GET .../quittances/:receiptId/fichier', () => {
  it('sert le PDF avec le numero comme nom de fichier', async () => {
    mockFile.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.7 test'),
      fileName: 'Quittance Q-2026-000001.pdf',
      mimeType: 'application/pdf'
    });
    const response = await request(app).get(`${BASE}/quittances/${RECEIPT}/fichier`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe("attachment; filename*=UTF-8''Quittance%20Q-2026-000001.pdf");
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(mockFile).toHaveBeenCalledWith(TENANT, SYNDIC, RECEIPT);
  });

  it('404 pour un document d une autre copropriete ou agence (service), ou un identifiant invalide', async () => {
    mockFile.mockRejectedValue(new NotFoundError('Document introuvable.'));
    expect((await request(app).get(`${BASE}/quittances/${RECEIPT}/fichier`)).status).toBe(404);
    expect((await request(app).get(`${BASE}/quittances/pas-un-id/fichier`)).status).toBe(404);
  });
});

describe('POST .../quittances/:receiptId/envoi', () => {
  it('200 avec le resultat ; 422 sans adresse', async () => {
    mockResend.mockResolvedValue({
      id: RECEIPT,
      number: 'Q-2026-000001',
      sent: true,
      emailedAt: '2026-02-01T10:00:00.000Z'
    });
    const ok = await request(app).post(`${BASE}/quittances/${RECEIPT}/envoi`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.sent).toBe(true);

    mockResend.mockRejectedValue(new ValidationError("Le copropriétaire de ce lot n'a pas d'adresse e-mail."));
    expect((await request(app).post(`${BASE}/quittances/${RECEIPT}/envoi`)).status).toBe(422);
  });
});

describe('GET .../quittances/impression', () => {
  it('PDF avec les parametres convertis (defauts QUITTANCE, 2 x 2)', async () => {
    mockPrint.mockResolvedValue(Buffer.from('%PDF-1.7 grille'));
    const response = await request(app).get(`${BASE}/quittances/impression?from=2026-01-01&to=2026-03-31`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toContain('Quittances%202026-01-01%20au%202026-03-31.pdf');
    expect(mockPrint).toHaveBeenCalledWith(TENANT, SYNDIC, {
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-03-31T00:00:00.000Z'),
      kind: 'QUITTANCE',
      cols: 2,
      rows: 2
    });
  });

  it('400 : colonnes ou lignes hors bornes, periode manquante ou inversee', async () => {
    for (const query of [
      'from=2026-01-01&to=2026-03-31&cols=0',
      'from=2026-01-01&to=2026-03-31&cols=4',
      'from=2026-01-01&to=2026-03-31&rows=5',
      'from=2026-01-01&to=2026-03-31&rows=1.5',
      'to=2026-03-31',
      'from=2026-04-01&to=2026-03-31',
      'from=2026-01-01&to=2026-03-31&kind=TOUT'
    ]) {
      const response = await request(app).get(`${BASE}/quittances/impression?${query}`);
      expect(response.status).toBe(400);
    }
    expect(mockPrint).not.toHaveBeenCalled();
  });

  it('422 relaye (plafond, aucun document)', async () => {
    mockPrint.mockRejectedValue(
      new ValidationError(
        'Trop de documents pour une seule impression (500 au plus) : réduisez la période ou choisissez un copropriétaire.'
      )
    );
    const response = await request(app).get(
      `${BASE}/quittances/impression?from=2026-01-01&to=2026-12-31&cols=3&rows=4&kind=ALL`
    );
    expect(response.status).toBe(422);
  });
});

describe('POST .../quittances/generer-manquantes', () => {
  it('200 avec { created, skipped } ; transmet l utilisateur', async () => {
    mockBackfill.mockResolvedValue({ created: 3, skipped: 1 });
    const response = await request(app).post(`${BASE}/quittances/generer-manquantes`).set('x-test-user', 'user-1');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { created: 3, skipped: 1 } });
    expect(mockBackfill).toHaveBeenCalledWith(TENANT, SYNDIC, 'user-1');
  });
});

describe('limiteurs par utilisateur et agence', () => {
  it('impression : 5 par minute, puis 429 ; un autre utilisateur garde son budget', async () => {
    mockPrint.mockResolvedValue(Buffer.from('%PDF-1.7'));
    const url = `${BASE}/quittances/impression?from=2026-01-01&to=2026-03-31`;
    for (let index = 0; index < 5; index += 1) {
      expect((await request(app).get(url).set('x-test-user', 'imprimeur')).status).toBe(200);
    }
    const limited = await request(app).get(url).set('x-test-user', 'imprimeur');
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
    expect((await request(app).get(url).set('x-test-user', 'autre')).status).toBe(200);
    expect(mockPrint).toHaveBeenCalledTimes(6);
  });

  it('renvoi : 30 par heure, puis 429 ; transmet l utilisateur au service', async () => {
    mockResend.mockResolvedValue({ id: RECEIPT, number: 'Q-2026-000001', sent: true, emailedAt: null });
    for (let index = 0; index < 30; index += 1) {
      expect(
        (await request(app).post(`${BASE}/quittances/${RECEIPT}/envoi`).set('x-test-user', 'relanceur')).status
      ).toBe(200);
    }
    expect(
      (await request(app).post(`${BASE}/quittances/${RECEIPT}/envoi`).set('x-test-user', 'relanceur')).status
    ).toBe(429);
    expect(mockResend).toHaveBeenLastCalledWith(TENANT, SYNDIC, RECEIPT, 'relanceur');
  });

  it('renvoi : 429 (deja envoye) et 409 (rattrape, coproprietaire change) relayes', async () => {
    const { AppError, ConflictError } = jest.requireActual('../../src/middleware/error-middleware');
    mockResend.mockRejectedValueOnce(new AppError("Ce document vient d'être envoyé.", 429, 'EMAIL_RECENTLY_SENT'));
    const recent = await request(app).post(`${BASE}/quittances/${RECEIPT}/envoi`);
    expect(recent.status).toBe(429);
    expect(recent.body.code).toBe('EMAIL_RECENTLY_SENT');
    mockResend.mockRejectedValueOnce(new ConflictError('Copropriétaire changé.'));
    expect((await request(app).post(`${BASE}/quittances/${RECEIPT}/envoi`)).status).toBe(409);
  });
});
