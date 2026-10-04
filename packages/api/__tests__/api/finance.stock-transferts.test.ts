import express from 'express';
import request from 'supertest';

/**
 * Tests du point d'entrée du transfert entre lieux — extrait par les
 * fondations du lot 040, étendu par le territoire API-1 (demandeur et motif,
 * garde STOCK_TRANSFER, idempotence, `meta`).
 *
 * Même dispositif que `finance.stock-mouvements.test.ts` : passe-plats
 * d'authentification et d'agence, gardes `STOCK_*` espionnes, domaine et
 * contexte de l'appelant simulés. La logique métier est couverte par
 * `__tests__/unit/finance.stock-transferts.test.ts`.
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

const guardsHit: string[] = [];
const deniedPermissions = new Set<string>();

jest.mock('../../src/middleware/stock-rbac-middleware', () => {
  const guard = (permission: string) => (_req: any, res: any, next: any) => {
    guardsHit.push(permission);
    if (deniedPermissions.has(permission)) {
      res.status(403).json({ success: false, message: 'Permission refusée.', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
  return {
    requireStockView: guard('STOCK_VIEW'),
    requireStockValuesView: guard('STOCK_VALUES_VIEW'),
    requireStockReceive: guard('STOCK_RECEIVE'),
    requireStockIssue: guard('STOCK_ISSUE'),
    requireStockTransfer: guard('STOCK_TRANSFER'),
    requireStockCount: guard('STOCK_COUNT'),
    requireStockTakersManage: guard('STOCK_TAKERS_MANAGE'),
    requireStockCountValidate: guard('STOCK_COUNT_VALIDATE'),
    requireStockDispose: guard('STOCK_DISPOSE'),
    requireStockAlertsView: guard('STOCK_ALERTS_VIEW'),
    requireStockCountOrValidate: guard('STOCK_COUNT|STOCK_COUNT_VALIDATE'),
    requireStockAttachmentDeposit: guard('STOCK_ATTACHMENT_DEPOSIT')
  };
});

const CALLER = {
  userId: 'user-1',
  valuesVisible: false,
  canValidateCount: false,
  canReceive: true,
  canIssue: true,
  canTransfer: true,
  canCount: true,
  canDispose: false,
  canManageTakers: true,
  canViewAlerts: false,
  canManageSettings: false
};
const resolveStockCallerContext = jest.fn();

jest.mock('../../src/lib/finance/stock-controles', () => ({
  resolveStockCallerContext: (...args: any[]) => resolveStockCallerContext(...args)
}));

const recordStockTransfer = jest.fn();

jest.mock('../../src/lib/finance/stock-transferts', () => ({
  recordStockTransfer: (...args: any[]) => recordStockTransfer(...args)
}));

jest.mock('../../src/lib/finance/stock-mouvements', () => ({}));

import { AppError, errorHandler } from '../../src/middleware/error-middleware';
import financeStockTransfertsRoutes from '../../src/routes/finance-stock-transferts-routes';

const TENANT_A = 'tenant-A';
const FROM_A = '11111111-1111-4111-8111-111111111111';
const TO_A = '22222222-2222-4222-8222-222222222222';
const ITEM_A = '33333333-3333-4333-8333-333333333333';
const TAKER_A = '44444444-4444-4444-8444-444444444444';
const REQUEST_A = '55555555-5555-4555-8555-555555555555';
const META = { valuesVisible: true, blindLocationIds: [] };

const app = express();
app.use(express.json());
app.use('/api', financeStockTransfertsRoutes);
app.use(errorHandler);

const corpsValide = {
  fromLocationId: FROM_A,
  toLocationId: TO_A,
  itemId: ITEM_A,
  quantity: 20,
  transferDate: '2026-10-02',
  reasonCode: 'SITE_SUPPLY',
  takerId: TAKER_A,
  clientRequestId: REQUEST_A
};

function transferResponse(status: 200 | 201 = 201) {
  return {
    status,
    data: {
      transferGroupId: 'groupe',
      movements: [{ isDecrease: true }, { isDecrease: false }],
      fromLocationLabel: 'Magasin central',
      toLocationLabel: 'Lieu du chantier',
      quantity: 20,
      value: 100_000,
      currency: 'XOF'
    },
    meta: META
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  guardsHit.length = 0;
  deniedPermissions.clear();
  resolveStockCallerContext.mockResolvedValue(CALLER);
});

describe('POST /tenants/:tenantId/finance/stock/transfers', () => {
  it('garde STOCK_TRANSFER ; corps exact transmis ; renvoie les DEUX moitiés et meta', async () => {
    recordStockTransfer.mockResolvedValue(transferResponse());
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/transfers`).send(corpsValide);
    expect(res.status).toBe(201);
    expect(res.body.data.movements).toHaveLength(2);
    expect(res.body.meta).toEqual(META);
    expect(guardsHit).toEqual(['STOCK_TRANSFER']);
    const [tenantId, ctx, input] = recordStockTransfer.mock.calls[0];
    expect([tenantId, ctx]).toEqual([TENANT_A, CALLER]);
    expect(input).toEqual({ ...corpsValide, transferDate: new Date('2026-10-02') });
  });

  it('répond 200 pour un rejeu idempotent', async () => {
    recordStockTransfer.mockResolvedValue(transferResponse(200));
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/transfers`).send(corpsValide);
    expect(res.status).toBe(200);
  });

  it('accepte un demandeur en texte et une précision de motif ; quantité à quatre décimales', async () => {
    recordStockTransfer.mockResolvedValue(transferResponse());
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/transfers`)
      .send({
        ...corpsValide,
        takerId: undefined,
        requestedBy: 'Camara',
        reasonCode: 'OTHER',
        reason: 'Prêt',
        quantity: 0.2525
      });
    expect(res.status).toBe(201);
    expect(recordStockTransfer.mock.calls[0][2]).toMatchObject({
      requestedBy: 'Camara',
      reasonCode: 'OTHER',
      reason: 'Prêt',
      quantity: 0.2525
    });
  });

  it('REFUSE un prix, un chantier, le tenantId, une quantité nulle, un motif hors liste, une précision trop longue', async () => {
    const corps = [
      { ...corpsValide, unitCost: 5000 },
      { ...corpsValide, siteId: TO_A },
      { ...corpsValide, tenantId: TENANT_A },
      { ...corpsValide, quantity: 0 },
      { ...corpsValide, reasonCode: 'PERDU' },
      { ...corpsValide, reason: 'x'.repeat(501) }
    ];
    for (const body of corps) {
      expect((await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/transfers`).send(body)).status).toBe(400);
    }
    expect(recordStockTransfer).not.toHaveBeenCalled();
  });

  it('laisse remonter 400 STOCK_REQUESTER_REQUIRED, 400 STOCK_REASON_REQUIRED et 409 STOCK_SITE_CLOSED du domaine', async () => {
    for (const [status, code] of [
      [400, 'STOCK_REQUESTER_REQUIRED'],
      [400, 'STOCK_REASON_REQUIRED'],
      [409, 'STOCK_SITE_CLOSED']
    ] as const) {
      recordStockTransfer.mockRejectedValueOnce(new AppError('Refus du domaine.', status, code));
      const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/transfers`).send(corpsValide);
      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
    }
  });

  it('sans STOCK_TRANSFER : 403', async () => {
    deniedPermissions.add('STOCK_TRANSFER');
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/transfers`).send(corpsValide);
    expect(res.status).toBe(403);
    expect(recordStockTransfer).not.toHaveBeenCalled();
  });

  it('ne renvoie AUCUN libellé comptable (principe P-1)', async () => {
    recordStockTransfer.mockResolvedValue(transferResponse());
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/transfers`).send(corpsValide);
    expect(JSON.stringify(res.body)).not.toMatch(/débit|crédit|debit|credit/i);
  });
});
