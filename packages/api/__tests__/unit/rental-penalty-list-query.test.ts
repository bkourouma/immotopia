import express from 'express';
import request from 'supertest';

const listPenalties = jest.fn();
jest.mock('../../src/services/rental-penalty-service', () => ({
  listPenalties: (...args: unknown[]) => listPenalties(...args)
}));
jest.mock('../../src/jobs/penalty-calculation-job', () => ({ triggerPenaltyCalculation: jest.fn() }));

import { listPenaltiesHandler } from '../../src/controllers/rental-penalty-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.get(
  '/tenants/:tenantId/rental/penalties',
  (req, _res, next) => {
    req.tenantContext = { tenantId: req.params.tenantId } as typeof req.tenantContext;
    next();
  },
  listPenaltiesHandler
);
app.use(errorHandler);

beforeEach(() => {
  listPenalties.mockReset();
  listPenalties.mockResolvedValue({ items: [{ id: 'penalty-page-2' }], total: 25 });
});

it('transmet les filtres et renvoie le total avant pagination', async () => {
  const response = await request(app).get(
    '/tenants/agency-a/rental/penalties?search=%25&page=2&limit=20&adjusted=false&maxAmount=0'
  );
  expect(response.status).toBe(200);
  expect(listPenalties).toHaveBeenCalledWith(
    'agency-a',
    expect.objectContaining({
      search: '%',
      page: 2,
      limit: 20,
      adjusted: false,
      maxAmount: 0
    })
  );
  expect(response.body.pagination).toEqual({ page: 2, limit: 20, total: 25, totalPages: 2 });
});

it('refuse une limite excessive avant toute lecture', async () => {
  const response = await request(app).get('/tenants/agency-a/rental/penalties?limit=101');
  expect(response.status).toBe(400);
  expect(listPenalties).not.toHaveBeenCalled();
});
