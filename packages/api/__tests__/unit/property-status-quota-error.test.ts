/**
 * BUG-2026-09-30-054 : la remise en service d'un bien a 100/100 (politique
 * BLOCK) repondait 400 sans code ni detail ; le controleur avalait toute
 * erreur. Une erreur typee (QuotaExceededError, 409) doit atteindre
 * errorHandler telle quelle, comme a la creation.
 */

const updatePropertyStatus = jest.fn();

jest.mock('../../src/services/property-status-service', () => ({
  updatePropertyStatus: (...a: any[]) => updatePropertyStatus(...a),
  getStatusHistory: jest.fn()
}));

import { updateStatusHandler } from '../../src/controllers/property-status-controller';
import { QuotaExceededError } from '../../src/middleware/error-middleware';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const req: any = {
  params: { id: 'p1', tenantId: 't1' },
  user: { userId: 'u1' },
  body: { status: 'AVAILABLE' }
};

beforeEach(() => jest.clearAllMocks());

describe('updateStatusHandler : refus de quota', () => {
  it('transmet QuotaExceededError (409, detail) a errorHandler au lieu d’un 400 nu', async () => {
    const quota = new QuotaExceededError({ capacityKey: 'BIENS_DETENUS', limit: 100, used: 100, requested: 1 });
    updatePropertyStatus.mockRejectedValue(quota);
    const res = mockRes();
    const next = jest.fn();
    await updateStatusHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(quota);
    expect(quota).toMatchObject({ statusCode: 409, code: 'QUOTA_EXCEEDED' });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('une transition invalide reste un 400', async () => {
    updatePropertyStatus.mockRejectedValue(new Error('Transition interdite'));
    const res = mockRes();
    const next = jest.fn();
    await updateStatusHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
