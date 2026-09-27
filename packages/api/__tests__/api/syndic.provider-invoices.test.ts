/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import request from 'supertest';

/**
 * Lot S6 — points d'entree HTTP des factures de prestataires.
 *
 * Gardes remplacees par des passe-plats, domaine (`lib/syndics/provider-invoices.ts`)
 * simule : on verifie ce que fait le routeur/controleur — validation, 404 sur
 * un identifiant qui n'est pas un UUID, agence transmise au domaine, fichier
 * multipart remis au domaine, envoi prive de la piece — et rien d'autre.
 */

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

jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next(),
  requireAnyPropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));

const service = {
  attachProviderInvoiceFile: jest.fn(),
  cancelProviderInvoice: jest.fn(),
  cancelProviderPayment: jest.fn(),
  createProviderInvoice: jest.fn(),
  getProviderInvoice: jest.fn(),
  getProviderInvoiceFile: jest.fn(),
  listFundMovements: jest.fn(),
  listProviderBalances: jest.fn(),
  listProviderInvoices: jest.fn(),
  payProviderInvoice: jest.fn(),
  removeProviderInvoiceAttachment: jest.fn(),
  updateProviderInvoice: jest.fn()
};

jest.mock('../../src/lib/syndics/provider-invoices', () => ({
  attachProviderInvoiceFile: (...args: any[]) => service.attachProviderInvoiceFile(...args),
  cancelProviderInvoice: (...args: any[]) => service.cancelProviderInvoice(...args),
  cancelProviderPayment: (...args: any[]) => service.cancelProviderPayment(...args),
  createProviderInvoice: (...args: any[]) => service.createProviderInvoice(...args),
  getProviderInvoice: (...args: any[]) => service.getProviderInvoice(...args),
  getProviderInvoiceFile: (...args: any[]) => service.getProviderInvoiceFile(...args),
  listFundMovements: (...args: any[]) => service.listFundMovements(...args),
  listProviderBalances: (...args: any[]) => service.listProviderBalances(...args),
  listProviderInvoices: (...args: any[]) => service.listProviderInvoices(...args),
  payProviderInvoice: (...args: any[]) => service.payProviderInvoice(...args),
  removeProviderInvoiceAttachment: (...args: any[]) => service.removeProviderInvoiceAttachment(...args),
  updateProviderInvoice: (...args: any[]) => service.updateProviderInvoice(...args)
}));

import routes from '../../src/routes/syndic-provider-invoice-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use('/api', routes);
app.use(errorHandler);

const SYND = '11111111-1111-4111-8111-111111111111';
const INVOICE = '22222222-2222-4222-8222-222222222222';
const PROVIDER = '33333333-3333-4333-8333-333333333333';
const BASE = `/api/tenants/tenant-a/syndics/${SYND}`;

beforeEach(() => jest.clearAllMocks());

describe('routes des factures de prestataires', () => {
  it('cree une facture en JSON et transmet agence, copropriete et auteur', async () => {
    service.createProviderInvoice.mockResolvedValue({
      invoice: { id: INVOICE },
      incidentImputation: { linked: false }
    });
    const res = await request(app).post(`${BASE}/factures-prestataires`).send({
      providerId: PROVIDER,
      number: 'F-1',
      label: 'Entretien',
      invoiceDate: '2026-09-01',
      amountHT: 1000
    });
    expect(res.status).toBe(201);
    expect(service.createProviderInvoice).toHaveBeenCalledWith(
      'tenant-a',
      SYND,
      expect.objectContaining({ providerId: PROVIDER, amountHT: 1000, vatAmount: 0, expenseKind: 'CURRENT' }),
      'user-1',
      undefined
    );
  });

  it('cree une facture en multipart avec sa piece jointe', async () => {
    service.createProviderInvoice.mockResolvedValue({ invoice: { id: INVOICE } });
    const res = await request(app)
      .post(`${BASE}/factures-prestataires`)
      .field('providerId', PROVIDER)
      .field('number', 'F-2')
      .field('label', 'Travaux')
      .field('invoiceDate', '2026-09-01')
      .field('amountHT', '2500')
      .field('vatAmount', '450')
      .attach('file', Buffer.from('%PDF-1.4 test'), 'facture.pdf');
    expect(res.status).toBe(201);
    const [, , input, , file] = service.createProviderInvoice.mock.calls[0];
    expect(input).toMatchObject({ amountHT: 2500, vatAmount: 450 });
    expect(file.originalname).toBe('facture.pdf');
    expect(Buffer.isBuffer(file.buffer)).toBe(true);
  });

  it('refuse un corps invalide (400) sans appeler le domaine', async () => {
    const res = await request(app).post(`${BASE}/factures-prestataires`).send({ providerId: 'x' });
    expect(res.status).toBe(400);
    expect(service.createProviderInvoice).not.toHaveBeenCalled();
  });

  it('repond 404 a un identifiant qui n est pas un UUID', async () => {
    const res = await request(app).get(`${BASE}/factures-prestataires/pas-un-uuid`);
    expect(res.status).toBe(404);
    expect(service.getProviderInvoice).not.toHaveBeenCalled();
  });

  it('enregistre un paiement', async () => {
    service.payProviderInvoice.mockResolvedValue({ fundBalanceNegative: true });
    const res = await request(app)
      .post(`${BASE}/factures-prestataires/${INVOICE}/paiements`)
      .send({ amount: 500, paidAt: '2026-09-10', method: 'CASH' });
    expect(res.status).toBe(201);
    expect(res.body.data.fundBalanceNegative).toBe(true);
    expect(service.payProviderInvoice).toHaveBeenCalledWith(
      'tenant-a',
      SYND,
      INVOICE,
      expect.objectContaining({ amount: 500, method: 'CASH' }),
      'user-1'
    );
  });

  it('exige un motif pour annuler', async () => {
    const res = await request(app).post(`${BASE}/factures-prestataires/${INVOICE}/annulation`).send({});
    expect(res.status).toBe(400);
    expect(service.cancelProviderInvoice).not.toHaveBeenCalled();
  });

  it('sert la piece en prive, sans cache', async () => {
    service.getProviderInvoiceFile.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.4'),
      fileName: 'facture.pdf',
      mimeType: 'application/pdf'
    });
    const res = await request(app).get(`${BASE}/factures-prestataires/${INVOICE}/fichier`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('soldes par prestataire et mouvements d un fonds', async () => {
    service.listProviderBalances.mockResolvedValue([]);
    service.listFundMovements.mockResolvedValue({ items: [] });
    expect((await request(app).get(`${BASE}/prestataires/soldes`)).status).toBe(200);
    const fund = '44444444-4444-4444-8444-444444444444';
    expect((await request(app).get(`${BASE}/fonds/${fund}/mouvements?limit=10`)).status).toBe(200);
    expect(service.listFundMovements).toHaveBeenCalledWith('tenant-a', SYND, fund, { page: 1, limit: 10 });
  });
});
