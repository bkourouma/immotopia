/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Portail locataire, dépôt de garantie : l'historique des mouvements ne porte
 * jamais l'agent qui les a saisis (id, e-mail, nom). Prisma est simulé.
 */
const prismaMock: any = {
  rentalLease: { findFirst: jest.fn(async () => null) }
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/lib/maintenance/portal-visibility', () => ({
  findTenantPortalTicket: jest.fn(),
  resolveTenantPortalCrmContactId: jest.fn(),
  tenantPortalTicketFilter: jest.fn().mockResolvedValue({})
}));
const getDeposit = jest.fn();
const listDepositMovements = jest.fn();
jest.mock('../../src/services/rental-deposit-service', () => ({
  getDeposit: (...a: any[]) => getDeposit(...a),
  listDepositMovements: (...a: any[]) => listDepositMovements(...a)
}));

import { TenantPortalService } from '../../src/services/tenant-portal-service';

const service = new TenantPortalService();

describe('getDepositInfo — mouvements', () => {
  it("ne renvoie ni l'id, ni l'e-mail, ni le nom de l'agent (createdBy)", async () => {
    getDeposit.mockResolvedValue({
      id: 'dep-1',
      target_amount: 300000,
      collected_amount: 300000,
      held_amount: 0,
      refunded_amount: 0,
      forfeited_amount: 0,
      currency: 'FCFA',
      lease: { id: null, lease_number: 'BAIL-1' }
    });
    listDepositMovements.mockResolvedValue([
      {
        id: 'mv-1',
        type: 'COLLECT',
        amount: 300000,
        currency: 'FCFA',
        note: null,
        created_at: new Date('2026-04-01'),
        payment: { id: 'pay-1', method: 'CASH', amount: 300000, succeeded_at: new Date('2026-04-01') },
        installment: null,
        createdBy: { id: 'agent-1', email: 'agent@agence.test', fullName: 'Agent Secret' }
      }
    ]);

    const data = await service.getDepositInfo('tc-1', 'lease-1', 'tenant-1');

    expect(data.movements).toHaveLength(1);
    expect(data.movements[0]).toMatchObject({ id: 'mv-1', type: 'COLLECT', amount: 300000 });
    expect(data.movements[0]).not.toHaveProperty('createdBy');
    expect(JSON.stringify(data)).not.toContain('agent@agence.test');
    expect(JSON.stringify(data)).not.toContain('Agent Secret');
  });
});
