/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contrat 049 §1.6 : champ additif `pendingDeclaration` sur les échéances du portail
 * locataire (la déclaration PENDING la plus récente de chaque échéance, sinon null).
 */
const installmentFindMany = jest.fn();
const installmentCount = jest.fn();
const declarationFindMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalInstallment: {
      findMany: (...a: unknown[]) => installmentFindMany(...a),
      count: (...a: unknown[]) => installmentCount(...a)
    },
    rentalPaymentDeclaration: { findMany: (...a: unknown[]) => declarationFindMany(...a) }
  }
}));

import { TenantPortalService } from '../../src/services/tenant-portal-service';

const service = new TenantPortalService();

const installment = (id: string) => ({
  id,
  lease_id: 'L1',
  tenant_id: 'T1',
  status: 'DUE',
  period_year: 2026,
  period_month: 11,
  due_date: new Date('2026-11-05T00:00:00Z'),
  amount_rent: 100000,
  amount_service: 0,
  amount_other_fees: 0,
  penalty_amount: 0,
  amount_paid: 0,
  items: [],
  lease: { lease_number: 'B-1' },
  payments: []
});

beforeEach(() => {
  installmentFindMany.mockReset();
  installmentCount.mockReset().mockResolvedValue(2);
  declarationFindMany.mockReset().mockResolvedValue([]);
});

describe('getInstallments : pendingDeclaration', () => {
  it('porte la déclaration en attente de l échéance, null pour les autres', async () => {
    installmentFindMany.mockResolvedValue([installment('I1'), installment('I2')]);
    declarationFindMany.mockResolvedValue([
      {
        id: 'D2',
        installment_id: 'I1',
        amount: 100000,
        created_at: new Date('2026-11-04T10:00:00Z'),
        reference: 'MP123456'
      },
      {
        id: 'D1',
        installment_id: 'I1',
        amount: 50000,
        created_at: new Date('2026-11-03T10:00:00Z'),
        reference: null
      }
    ]);

    const result = await service.getInstallments('TC1', 'L1', 'T1');
    const byId = new Map<string, any>(result.installments.map((i: any) => [i.id, i]));

    expect(byId.get('I1').pendingDeclaration).toEqual({
      id: 'D2',
      amount: 100000,
      declaredAt: '2026-11-04T10:00:00.000Z',
      reference: 'MP123456'
    });
    expect(byId.get('I2').pendingDeclaration).toBeNull();
  });

  it('ne lit que les déclarations PENDING des échéances de la page, dans l agence de la session', async () => {
    installmentFindMany.mockResolvedValue([installment('I1'), installment('I2')]);
    await service.getInstallments('TC1', 'L1', 'T1');
    const where = declarationFindMany.mock.calls[0][0].where;
    expect(where).toEqual({ tenant_id: 'T1', status: 'PENDING', installment_id: { in: ['I1', 'I2'] } });
  });

  it('sans échéance : aucune lecture de déclaration', async () => {
    installmentFindMany.mockResolvedValue([]);
    installmentCount.mockResolvedValue(0);
    const result = await service.getInstallments('TC1', 'L1', 'T1');
    expect(declarationFindMany).not.toHaveBeenCalled();
    expect(result.installments).toEqual([]);
  });
});
