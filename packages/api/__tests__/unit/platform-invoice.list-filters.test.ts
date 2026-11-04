/**
 * Liste des factures PLATFORM d'une agence : recherche libre, statut(s), nature(s),
 * période d'émission, montant. Toujours sous le tenantId, jamais de brouillon côté agence.
 */

const invoiceFindMany = jest.fn();
const invoiceCount = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    invoice: {
      findMany: (...a: unknown[]) => invoiceFindMany(...a),
      count: (...a: unknown[]) => invoiceCount(...a)
    }
  }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));

import express from 'express';
import request from 'supertest';
import { listPlatformInvoices } from '../../src/services/platform-invoice-service';
import { errorHandler } from '../../src/middleware/error-middleware';
import { adminListInvoicesHandler, tenantListInvoicesHandler } from '../../src/controllers/platform-invoice-controller';

beforeEach(() => {
  invoiceFindMany.mockReset().mockResolvedValue([]);
  invoiceCount.mockReset().mockResolvedValue(0);
});

const whereOf = () => invoiceFindMany.mock.calls[0][0].where;

describe('listPlatformInvoices : filtres', () => {
  it("sans filtre : la facture de l'agence, brouillons exclus côté agence", async () => {
    await listPlatformInvoices('t1');
    expect(whereOf()).toEqual({ tenantId: 't1', kind: 'PLATFORM', status: { not: 'DRAFT' } });
  });

  it('recherche libre sur le numéro et la référence de paiement', async () => {
    await listPlatformInvoices('t1', { includeDrafts: true, search: ' IMT-2026 ' });
    const contains = { contains: 'IMT-2026', mode: 'insensitive' };
    expect(whereOf()).toEqual({
      tenantId: 't1',
      kind: 'PLATFORM',
      OR: [{ invoiceNumber: contains }, { paymentReference: contains }]
    });
  });

  it('plusieurs statuts, natures, période et montants se combinent (ET)', async () => {
    await listPlatformInvoices('t1', {
      includeDrafts: true,
      status: ['ISSUED', 'PAID'] as never,
      nature: ['OVERAGE'] as never,
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-01-31T23:59:59.999Z'),
      minAmount: 1000,
      maxAmount: 50000
    });
    expect(whereOf()).toMatchObject({
      tenantId: 't1',
      status: { in: ['ISSUED', 'PAID'] },
      billingNature: { in: ['OVERAGE'] },
      issueDate: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-01-31T23:59:59.999Z') },
      amountTotal: { gte: 1000, lte: 50000 }
    });
  });

  it('un statut seul reste un égal ; BROUILLON demandé côté agence ne renvoie rien', async () => {
    await listPlatformInvoices('t1', { includeDrafts: true, status: 'PAID' as never });
    expect(whereOf().status).toBe('PAID');

    invoiceFindMany.mockClear();
    await listPlatformInvoices('t1', { status: 'DRAFT' as never });
    expect(whereOf()).toMatchObject({ id: '__none__', status: { not: 'DRAFT' } });
  });

  it('un montant négatif (avoir) est un filtre valide, un paramètre vide est ignoré', async () => {
    const app2 = express();
    app2.get('/admin/:tenantId', adminListInvoicesHandler);
    app2.use(errorHandler);
    const res = await request(app2).get('/admin/t1?minAmount=-500&maxAmount=&search=&from=');
    expect(res.status).toBe(200);
    expect(whereOf().amountTotal).toEqual({ gte: -500 });
    expect(whereOf().OR).toBeUndefined();
  });

  it('un montant minimal de 0 est un filtre valide', async () => {
    await listPlatformInvoices('t1', { includeDrafts: true, minAmount: 0 });
    expect(whereOf().amountTotal).toEqual({ gte: 0 });
  });
});

describe('GET platform-invoices : paramètres', () => {
  const app = express();
  app.get('/admin/:tenantId', adminListInvoicesHandler);
  app.get('/tenant/:tenantId', tenantListInvoicesHandler);
  app.use(errorHandler);

  it('lit les filtres de la requête (virgules, jours, montants)', async () => {
    const res = await request(app).get(
      '/admin/t1?status=ISSUED,PAID&nature=PERIOD&search=imt&from=2026-01-01&to=2026-01-31&minAmount=10&maxAmount=20'
    );
    expect(res.status).toBe(200);
    expect(whereOf()).toMatchObject({
      tenantId: 't1',
      status: { in: ['ISSUED', 'PAID'] },
      billingNature: { in: ['PERIOD'] },
      issueDate: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-01-31T23:59:59.999Z') },
      amountTotal: { gte: 10, lte: 20 }
    });
  });

  it("la route de l'agence garde le filtre sans brouillon et le tenantId de l'URL", async () => {
    const res = await request(app).get('/tenant/t9?search=imt');
    expect(res.status).toBe(200);
    expect(whereOf()).toMatchObject({ tenantId: 't9', status: { not: 'DRAFT' } });
  });

  it.each([
    '?status=NOPE',
    '?status=ISSUED,NOPE',
    '?nature=NOPE',
    '?from=hier',
    '?to=2026-13-45x',
    '?minAmount=abc',
    '?from=2026-02-31',
    '?to=2026-13-45',
    '?minAmount=Infinity',
    `?search=${'x'.repeat(121)}`
  ])('valeur invalide refusée en 400 : %s', async query => {
    const res = await request(app).get(`/admin/t1${query}`);
    expect(res.status).toBe(400);
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });
});
