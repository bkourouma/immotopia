import express from 'express';
import request from 'supertest';

/**
 * Tests des points d'entrée du journal, du terrain et du carnet des preneurs —
 * lot 040, territoire API-3 (`routes/finance-stock-journal-routes.ts`).
 *
 * Les middlewares d'authentification et de tenant sont des passe-plats ; les
 * gardes `STOCK_*` sont des doublures qui refusent (403) quand l'en-tête
 * `x-deny` nomme leur permission : chaque route est ainsi éprouvée contre SA
 * garde. Les services sont des espions Jest : on vérifie ce que le contrôleur
 * leur transmet (tenant de l'URL, contexte de l'appelant, filtres validés) et
 * l'enveloppe rendue (`data`, `meta`), pas la logique métier, couverte par les
 * tests unitaires.
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

function guard(permission: string) {
  return (req: any, res: any, next: any) => {
    const denied = String(req.headers['x-deny'] ?? '').split(',');
    if (denied.includes(permission)) {
      res.status(403).json({ success: false, message: 'Permission refusée', code: 'FORBIDDEN', permission });
      return;
    }
    next();
  };
}

jest.mock('../../src/middleware/stock-rbac-middleware', () => ({
  requireStockView: guard('STOCK_VIEW'),
  requireStockValuesView: guard('STOCK_VALUES_VIEW'),
  requireStockTakersManage: guard('STOCK_TAKERS_MANAGE')
}));

const CTX = {
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

const resolveStockCallerContext = jest.fn(async () => CTX);
jest.mock('../../src/lib/finance/stock-controles', () => ({
  resolveStockCallerContext: (...args: any[]) => (resolveStockCallerContext as any)(...args)
}));

const listStockMovementsPage = jest.fn();
const exportStockMovementsCsv = jest.fn();
const listStockMovementAuthors = jest.fn();
jest.mock('../../src/lib/finance/stock-journal', () => ({
  listStockMovementsPage: (...args: any[]) => listStockMovementsPage(...args),
  exportStockMovementsCsv: (...args: any[]) => exportStockMovementsCsv(...args),
  listStockMovementAuthors: (...args: any[]) => listStockMovementAuthors(...args)
}));

const getStockFieldContext = jest.fn();
const searchReceivableInvoices = jest.fn();
const getInvoiceReceipts = jest.fn();
jest.mock('../../src/lib/finance/stock-terrain', () => ({
  getStockFieldContext: (...args: any[]) => getStockFieldContext(...args),
  searchReceivableInvoices: (...args: any[]) => searchReceivableInvoices(...args),
  getInvoiceReceipts: (...args: any[]) => getInvoiceReceipts(...args)
}));

const listStockTakers = jest.fn();
const createStockTakerTx = jest.fn();
const updateStockTakerTx = jest.fn();
jest.mock('../../src/lib/finance/stock-preneurs', () => ({
  listStockTakers: (...args: any[]) => listStockTakers(...args),
  createStockTakerTx: (...args: any[]) => createStockTakerTx(...args),
  updateStockTakerTx: (...args: any[]) => updateStockTakerTx(...args)
}));

const logAuditEvent = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...args: any[]) => logAuditEvent(...args)
}));

jest.mock('../../src/utils/database', () => ({
  prisma: { $transaction: (callback: any) => callback({}) }
}));

import { AppError, errorHandler } from '../../src/middleware/error-middleware';
import financeStockJournalRoutes from '../../src/routes/finance-stock-journal-routes';

const TENANT_A = 'tenant-A';
const SITE_A = '44444444-4444-4444-8444-444444444444';
const SLIP_A = '55555555-5555-4555-8555-555555555555';
const INVOICE_A = '66666666-6666-4666-8666-666666666666';
const TAKER_A = '77777777-7777-4777-8777-777777777777';
const EMPLOYEE_A = '88888888-8888-4888-8888-888888888888';
const CONTRACTOR_A = '99999999-9999-4999-8999-999999999999';

const META = { valuesVisible: false, blindLocationIds: [] };

const app = express();
app.use(express.json());
app.use('/api', financeStockJournalRoutes);
app.use(errorHandler);

const base = `/api/tenants/${TENANT_A}/finance`;

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /stock/movements
// ---------------------------------------------------------------------------

describe('GET /stock/movements', () => {
  it('rend la page et son meta, avec le contexte de l’appelant et la taille par défaut (50)', async () => {
    listStockMovementsPage.mockResolvedValue({ movements: [{ id: 'm-1' }], meta: { ...META, nextCursor: 'abc' } });

    const res = await request(app).get(`${base}/stock/movements`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ id: 'm-1' }], meta: { ...META, nextCursor: 'abc' } });
    expect(resolveStockCallerContext).toHaveBeenCalledWith('user-1', TENANT_A);
    expect(listStockMovementsPage).toHaveBeenCalledWith(TENANT_A, CTX, expect.any(Object), {
      cursor: undefined,
      limit: 50
    });
  });

  it('transmet les filtres du contrat : nature (six valeurs), bon, chantier, période, curseur, limite', async () => {
    listStockMovementsPage.mockResolvedValue({ movements: [], meta: META });

    await request(app).get(
      `${base}/stock/movements?type=SCRAP&siteId=${SITE_A}&slipId=${SLIP_A}&from=2026-03-01&to=2026-03-31&cursor=xyz&limit=200`
    );

    expect(listStockMovementsPage).toHaveBeenCalledWith(
      TENANT_A,
      CTX,
      expect.objectContaining({
        type: 'SCRAP',
        siteId: SITE_A,
        slipId: SLIP_A,
        from: new Date('2026-03-01'),
        to: new Date('2026-03-31')
      }),
      { cursor: 'xyz', limit: 200 }
    );
  });

  it('refuse une nature inconnue, une limite hors bornes et un paramètre inconnu (400)', async () => {
    for (const query of ['type=SORTIE', 'limit=0', 'limit=201', 'offset=10']) {
      const res = await request(app).get(`${base}/stock/movements?${query}`);
      expect(res.status).toBe(400);
    }
    expect(listStockMovementsPage).not.toHaveBeenCalled();
  });

  it('relaie le 403 STOCK_VALUE_FIELD_FORBIDDEN du service pour un filtre par personne', async () => {
    listStockMovementsPage.mockRejectedValue(
      new AppError('Le filtre par personne est réservé.', 403, 'STOCK_VALUE_FIELD_FORBIDDEN')
    );
    const res = await request(app).get(`${base}/stock/movements?requestedBy=Camara`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('STOCK_VALUE_FIELD_FORBIDDEN');
  });

  it('passe sur STOCK_VIEW (et non plus FINANCE_ACCOUNTS_READ)', async () => {
    const res = await request(app).get(`${base}/stock/movements`).set('x-deny', 'STOCK_VIEW');
    expect(res.status).toBe(403);
    expect(listStockMovementsPage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /stock/movements/export.csv et /authors
// ---------------------------------------------------------------------------

describe('GET /stock/movements/export.csv', () => {
  it('rend un fichier CSV en pièce jointe, mêmes filtres, sans curseur', async () => {
    exportStockMovementsCsv.mockResolvedValue('﻿Date du mouvement;Saisi le\r\n');

    const res = await request(app).get(`${base}/stock/movements/export.csv?type=ISSUE`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="journal-stock-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(exportStockMovementsCsv).toHaveBeenCalledWith(TENANT_A, CTX, expect.objectContaining({ type: 'ISSUE' }));
  });

  it('refuse un curseur sur l’export (400) : l’export ne se pagine pas', async () => {
    const res = await request(app).get(`${base}/stock/movements/export.csv?cursor=abc`);
    expect(res.status).toBe(400);
    expect(exportStockMovementsCsv).not.toHaveBeenCalled();
  });

  it('relaie 422 STOCK_EXPORT_TOO_LARGE', async () => {
    exportStockMovementsCsv.mockRejectedValue(new AppError('Trop de lignes.', 422, 'STOCK_EXPORT_TOO_LARGE'));
    const res = await request(app).get(`${base}/stock/movements/export.csv`);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('STOCK_EXPORT_TOO_LARGE');
  });

  it('le segment fixe n’est pas avalé par une route paramétrée', async () => {
    exportStockMovementsCsv.mockResolvedValue('x');
    listStockMovementAuthors.mockResolvedValue([]);
    expect((await request(app).get(`${base}/stock/movements/export.csv`)).status).toBe(200);
    expect((await request(app).get(`${base}/stock/movements/authors`)).status).toBe(200);
  });
});

describe('GET /stock/movements/authors', () => {
  it('rend les auteurs, réservé à STOCK_VALUES_VIEW', async () => {
    listStockMovementAuthors.mockResolvedValue([{ userId: 'u-1', label: 'Aïssatou Barry' }]);
    const ok = await request(app).get(`${base}/stock/movements/authors`);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual([{ userId: 'u-1', label: 'Aïssatou Barry' }]);

    const denied = await request(app).get(`${base}/stock/movements/authors`).set('x-deny', 'STOCK_VALUES_VIEW');
    expect(denied.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

describe('GET /stock/field-context', () => {
  it('rend le contexte et son meta, sous STOCK_VIEW', async () => {
    getStockFieldContext.mockResolvedValue({ context: { locations: [] }, meta: META });

    const res = await request(app).get(`${base}/stock/field-context`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { locations: [] }, meta: META });
    expect(getStockFieldContext).toHaveBeenCalledWith(TENANT_A, CTX);

    const denied = await request(app).get(`${base}/stock/field-context`).set('x-deny', 'STOCK_VIEW');
    expect(denied.status).toBe(403);
  });
});

describe('GET /stock/receivable-invoices', () => {
  it('transmet la recherche, le curseur et 20 par défaut ; refuse plus de 50', async () => {
    searchReceivableInvoices.mockResolvedValue({ invoices: [], meta: { ...META, nextCursor: null } });

    const res = await request(app).get(`${base}/stock/receivable-invoices?search=FAC&cursor=abc`);
    expect(res.status).toBe(200);
    expect(res.body.meta.nextCursor).toBeNull();
    expect(searchReceivableInvoices).toHaveBeenCalledWith(TENANT_A, CTX, { search: 'FAC', cursor: 'abc', limit: 20 });

    expect((await request(app).get(`${base}/stock/receivable-invoices?limit=51`)).status).toBe(400);
  });
});

describe('GET /stock/supplier-invoices/:invoiceId/receipts', () => {
  it('rend l’historique de la facture du chemin', async () => {
    getInvoiceReceipts.mockResolvedValue({ view: { invoice: { id: INVOICE_A } }, meta: META });
    const res = await request(app).get(`${base}/stock/supplier-invoices/${INVOICE_A}/receipts`);
    expect(res.status).toBe(200);
    expect(res.body.data.invoice.id).toBe(INVOICE_A);
    expect(getInvoiceReceipts).toHaveBeenCalledWith(TENANT_A, CTX, INVOICE_A);
  });

  it('refuse un identifiant qui n’a pas la forme d’un UUID (400)', async () => {
    const res = await request(app).get(`${base}/stock/supplier-invoices/pas-un-uuid/receipts`);
    expect(res.status).toBe(400);
    expect(getInvoiceReceipts).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Carnet des preneurs (B2)
// ---------------------------------------------------------------------------

const TAKER_VIEW = {
  id: TAKER_A,
  label: 'Koné Ibrahim — Équipe maçonnerie',
  fullName: 'Koné Ibrahim',
  teamOrCompany: 'Équipe maçonnerie',
  phone: '07 00 00 00',
  employeeId: null,
  contractorId: null,
  linkedPersonLabel: null,
  isActive: true,
  createdAt: '2026-03-01T00:00:00.000Z'
};

describe('GET /stock/takers', () => {
  it('liste le carnet sous STOCK_VIEW ; onlyActive=false se transmet tel quel', async () => {
    listStockTakers.mockResolvedValue([TAKER_VIEW]);
    const res = await request(app).get(`${base}/stock/takers?onlyActive=false&search=kon`);
    expect(res.status).toBe(200);
    expect(listStockTakers).toHaveBeenCalledWith(TENANT_A, CTX, { onlyActive: false, search: 'kon' });
  });
});

describe('POST /stock/takers', () => {
  it('transmet les cinq champs du contrat, l’auteur, puis écrit STOCK_TAKER_CREATED après la transaction', async () => {
    createStockTakerTx.mockResolvedValue({
      taker: TAKER_VIEW,
      changes: {},
      snapshot: {
        fullName: 'Koné Ibrahim',
        teamOrCompany: 'Équipe maçonnerie',
        phone: '07 00 00 00',
        employeeId: EMPLOYEE_A,
        contractorId: null,
        isActive: true
      }
    });

    const res = await request(app).post(`${base}/stock/takers`).send({
      fullName: 'Koné Ibrahim',
      teamOrCompany: 'Équipe maçonnerie',
      phone: '07 00 00 00',
      employeeId: EMPLOYEE_A
    });

    expect(res.status).toBe(201);
    expect(createStockTakerTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      {
        fullName: 'Koné Ibrahim',
        teamOrCompany: 'Équipe maçonnerie',
        phone: '07 00 00 00',
        employeeId: EMPLOYEE_A,
        contractorId: null,
        createdByUserId: 'user-1'
      },
      CTX
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'STOCK_TAKER_CREATED',
        entityType: 'StockTaker',
        entityId: TAKER_A,
        tenantId: TENANT_A
      })
    );
  });

  it('refuse un corps qui lie à la fois un employé et un tâcheron, un nom trop court, un champ inconnu (400)', async () => {
    for (const body of [
      { fullName: 'Koné Ibrahim', employeeId: EMPLOYEE_A, contractorId: CONTRACTOR_A },
      { fullName: 'K' },
      { fullName: 'Koné Ibrahim', idCardNumber: 'CI-123' },
      { fullName: 'Koné Ibrahim', tenantId: TENANT_A }
    ]) {
      const res = await request(app).post(`${base}/stock/takers`).send(body);
      expect(res.status).toBe(400);
    }
    expect(createStockTakerTx).not.toHaveBeenCalled();
  });

  it('relaie 409 STOCK_TAKER_DUPLICATE avec data.existingTakerId', async () => {
    createStockTakerTx.mockRejectedValue(
      new AppError('Doublon.', 409, 'STOCK_TAKER_DUPLICATE', undefined, { existingTakerId: TAKER_A })
    );
    const res = await request(app).post(`${base}/stock/takers`).send({ fullName: 'Koné Ibrahim' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STOCK_TAKER_DUPLICATE');
    expect(res.body.data).toEqual({ existingTakerId: TAKER_A });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('exige STOCK_TAKERS_MANAGE', async () => {
    const res = await request(app)
      .post(`${base}/stock/takers`)
      .set('x-deny', 'STOCK_TAKERS_MANAGE')
      .send({ fullName: 'Koné Ibrahim' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /stock/takers/:takerId', () => {
  it('ne transmet QUE les clés présentes ; phone: null efface le numéro ; audit avec changes', async () => {
    updateStockTakerTx.mockResolvedValue({
      taker: { ...TAKER_VIEW, phone: null },
      changes: { phone: { before: '07 00 00 00', after: null } },
      snapshot: { fullName: 'Koné Ibrahim', isActive: true }
    });

    const res = await request(app).patch(`${base}/stock/takers/${TAKER_A}`).send({ phone: null });

    expect(res.status).toBe(200);
    expect(updateStockTakerTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, TAKER_A, { phone: null }, CTX);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'STOCK_TAKER_UPDATED',
        changes: { phone: { before: '07 00 00 00', after: null } }
      })
    );
  });

  it('une correction sans effet n’écrit aucun audit', async () => {
    updateStockTakerTx.mockResolvedValue({ taker: TAKER_VIEW, changes: {}, snapshot: {} });
    await request(app).patch(`${base}/stock/takers/${TAKER_A}`).send({ isActive: true });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('refuse un corps vide et un identifiant mal formé (400)', async () => {
    expect((await request(app).patch(`${base}/stock/takers/${TAKER_A}`).send({})).status).toBe(400);
    expect((await request(app).patch(`${base}/stock/takers/pas-un-uuid`).send({ isActive: false })).status).toBe(400);
    expect(updateStockTakerTx).not.toHaveBeenCalled();
  });
});
