import express from 'express';
import request from 'supertest';

const listPayments = jest.fn();
jest.mock('../../src/services/syndic-payment-read-service', () => ({
  listSyndicPaymentAllocations: (...args: unknown[]) => listPayments(...args)
}));

import { listSyndicPaymentsHandler } from '../../src/controllers/syndic-payment-read-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.get('/tenants/:tenantId/syndics/:syndicId/paiements', listSyndicPaymentsHandler);
app.use(errorHandler);

beforeEach(() => {
  listPayments.mockReset().mockResolvedValue({ items: [], total: 125, methods: ['VIREMENT', 'CHEQUE'] });
});

describe('lecture paginée des paiements affectés', () => {
  it('transmet les filtres, le tri, la page et renvoie le total filtré', async () => {
    const response = await request(app).get(
      '/tenants/tenant-a/syndics/syndic-a/paiements?page=2&limit=20&search=Awa&method=VIREMENT&paidFrom=2026-01-01&paidTo=2026-01-31&amountMin=100&amountMax=500&sort=amount:desc'
    );
    expect(response.status).toBe(200);
    expect(listPayments).toHaveBeenCalledWith('tenant-a', 'syndic-a', {
      page: 2,
      limit: 20,
      search: 'Awa',
      method: 'VIREMENT',
      paidFrom: '2026-01-01',
      paidTo: '2026-01-31',
      amountMin: 100,
      amountMax: 500,
      sort: 'amount:desc'
    });
    expect(response.body.pagination).toEqual({ page: 2, limit: 20, total: 125, totalPages: 7 });
    expect(response.body.methods).toEqual(['VIREMENT', 'CHEQUE']);
  });

  it.each([
    'limit=101',
    'page=0',
    'paidFrom=2026-02-31',
    'paidFrom=2026-02-02&paidTo=2026-01-01',
    'amountMin=500&amountMax=100',
    'sort=owner:desc'
  ])('rejette le filtre invalide %s avant lecture', async query => {
    const response = await request(app).get(`/tenants/tenant-a/syndics/syndic-a/paiements?${query}`);
    expect(response.status).toBe(400);
    expect(listPayments).not.toHaveBeenCalled();
  });
});
