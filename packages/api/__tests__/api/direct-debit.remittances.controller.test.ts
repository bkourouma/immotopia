import express from 'express';
import request from 'supertest';

/**
 * Contrôleur des remises de prélèvement (spec 042, P2) : codes HTTP et en-têtes.
 *
 * Le service (`lib/direct-debit/remittances`) est simulé : le test vérifie ce que
 * le contrôleur lui transmet (agence, acteur, corps validé) et ce qu'il répond.
 * Les gardes d'accès sont posées par `routes-inventory.test.ts` ; ici un
 * passe-plat pose `req.user` et `req.tenantContext`.
 */

const mockService = {
  listRemittances: jest.fn(),
  createRemittance: jest.fn(),
  getRemittance: jest.fn(),
  refreshRemittance: jest.fn(),
  cancelRemittanceLine: jest.fn(),
  validateRemittance: jest.fn(),
  resendPrenotifications: jest.fn(),
  exportRemittance: jest.fn(),
  submitRemittance: jest.fn(),
  cancelRemittance: jest.fn()
};
jest.mock('../../src/lib/direct-debit/remittances', () => ({
  listRemittances: (...args: unknown[]) => mockService.listRemittances(...args),
  createRemittance: (...args: unknown[]) => mockService.createRemittance(...args),
  getRemittance: (...args: unknown[]) => mockService.getRemittance(...args),
  refreshRemittance: (...args: unknown[]) => mockService.refreshRemittance(...args),
  cancelRemittanceLine: (...args: unknown[]) => mockService.cancelRemittanceLine(...args),
  validateRemittance: (...args: unknown[]) => mockService.validateRemittance(...args),
  resendPrenotifications: (...args: unknown[]) => mockService.resendPrenotifications(...args),
  exportRemittance: (...args: unknown[]) => mockService.exportRemittance(...args),
  submitRemittance: (...args: unknown[]) => mockService.submitRemittance(...args),
  cancelRemittance: (...args: unknown[]) => mockService.cancelRemittance(...args)
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import {
  createRemittanceHandler,
  exportRemittanceHandler,
  listRemittancesHandler,
  validateRemittanceHandler
} from '../../src/controllers/direct-debit-remittance-controller';

const TENANT = 'tenant-a';
const CREDITOR = '11111111-1111-4111-8111-111111111111';
const REMITTANCE = '22222222-2222-4222-8222-222222222222';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, {
      user: { userId: 'user-1', globalRole: 'USER' },
      tenantContext: { tenantId: TENANT, isCollaborator: true, isClient: false }
    });
    next();
  });
  app.get('/remittances', listRemittancesHandler);
  app.post('/remittances', createRemittanceHandler);
  app.post('/remittances/:remittanceId/validate', validateRemittanceHandler);
  app.post('/remittances/:remittanceId/export', exportRemittanceHandler);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('remises / contrôleur', () => {
  it('répond 201 à la création et transmet agence, acteur et corps validé', async () => {
    mockService.createRemittance.mockResolvedValue({
      remittance: { id: REMITTANCE, reference: 'PRL-2026-0001', status: 'DRAFT' },
      skipped: []
    });
    const response = await request(buildApp())
      .post('/remittances')
      .send({ creditorId: CREDITOR, collectionDate: '2026-10-26', notes: '  octobre  ' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: { remittance: { id: REMITTANCE, reference: 'PRL-2026-0001', status: 'DRAFT' }, skipped: [] }
    });
    const [tenantId, input, actor] = mockService.createRemittance.mock.calls[0];
    expect(tenantId).toBe(TENANT);
    expect(actor).toBe('user-1');
    expect(input.creditorId).toBe(CREDITOR);
    expect(input.notes).toBe('octobre');
    expect(input.collectionDate).toEqual(new Date('2026-10-26T00:00:00Z'));
  });

  it('refuse un champ inconnu et une date impossible, sans appeler le service', async () => {
    const unknown = await request(buildApp())
      .post('/remittances')
      .send({ creditorId: CREDITOR, collectionDate: '2026-10-26', tenantId: 'tenant-b' });
    expect(unknown.status).toBe(400);
    const badDate = await request(buildApp())
      .post('/remittances')
      .send({ creditorId: CREDITOR, collectionDate: '2026-02-30' });
    expect(badDate.status).toBe(400);
    expect(mockService.createRemittance).not.toHaveBeenCalled();
  });

  it('plafonne la pagination de la liste', async () => {
    mockService.listRemittances.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    expect((await request(buildApp()).get('/remittances?page=10001')).status).toBe(400);
    const ok = await request(buildApp()).get('/remittances?page=10000');
    expect(ok.status).toBe(200);
    expect(mockService.listRemittances.mock.calls[0][1]).toMatchObject({ page: 10000, pageSize: 20 });
  });

  it('répond tout de suite à la validation avec la remise et le résumé courant', async () => {
    const summary = { pending: 2, sent: 0, noEmail: 0, disabled: 0, failed: 0 };
    mockService.validateRemittance.mockResolvedValue({
      remittance: { id: REMITTANCE, status: 'VALIDATED', prenotificationSummary: summary },
      prenotifications: summary
    });
    const response = await request(buildApp()).post(`/remittances/${REMITTANCE}/validate`);
    expect(response.status).toBe(200);
    expect(response.body.data.prenotifications).toEqual(summary);
    expect(mockService.validateRemittance).toHaveBeenCalledWith(TENANT, REMITTANCE, 'user-1');
  });

  it('un identifiant qui n est pas un UUID est une remise introuvable', async () => {
    const response = await request(buildApp()).post('/remittances/pas-un-uuid/validate');
    expect(response.status).toBe(404);
    expect(mockService.validateRemittance).not.toHaveBeenCalled();
  });

  it('sert le fichier en pièce jointe CSV UTF-8, sans cache', async () => {
    const bom = String.fromCharCode(0xfeff);
    const content = Buffer.from([`${bom}reference_remise;iban`, 'PRL-2026-0001;CI93', ''].join('\r\n'), 'utf8');
    mockService.exportRemittance.mockResolvedValue({
      buffer: content,
      fileName: 'PRL-2026-0001.csv',
      contentType: 'text/csv; charset=utf-8'
    });
    const response = await request(buildApp())
      .post(`/remittances/${REMITTANCE}/export`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toBe('attachment; filename="PRL-2026-0001.csv"');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-length']).toBe(String(content.length));
    expect((response.body as Buffer).equals(content)).toBe(true);
    expect(mockService.exportRemittance).toHaveBeenCalledWith(TENANT, REMITTANCE, 'user-1');
  });
});
