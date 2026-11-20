/**
 * Revue locative (lot 6, H3) : un montant retenu décimal est refusé en
 * FCFA/XOF/XAF (400) et accepté dans une devise à sous-unité.
 */
const findFirst = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: { rentalPenalty: { findFirst: (...a: any[]) => findFirst(...a) }, $transaction: jest.fn() }
}));

import { updatePenalty } from '../../src/services/rental-penalty-service';
import { BadRequestError } from '../../src/middleware/error-middleware';
import { prisma } from '../../src/utils/database';

describe('updatePenalty : décimales selon la devise', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(['FCFA', 'XOF', 'XAF'])('refuse un montant retenu décimal en %s', async currency => {
    findFirst.mockResolvedValue({ id: 'p1', installment: { currency } });
    await expect(updatePenalty('t1', 'p1', 1500.5, 'Geste', 'u1')).rejects.toBeInstanceOf(BadRequestError);
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
  });

  it('en EUR, le montant décimal passe la garde (la transaction est tentée)', async () => {
    findFirst.mockResolvedValue({ id: 'p1', override_reason: null, installment: { currency: 'EUR' } });
    (prisma as any).$transaction.mockRejectedValue(new Error('stop'));
    await expect(updatePenalty('t1', 'p1', 1500.5, 'Geste', 'u1')).rejects.toThrow('stop');
    expect((prisma as any).$transaction).toHaveBeenCalled();
  });
});
