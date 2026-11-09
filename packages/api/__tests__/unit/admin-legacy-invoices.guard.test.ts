/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Routes admin historiques de factures : limitees aux factures PLATFORM
 * (jamais RENTAL) et, si fourni, a l'agence attendue. Faux Prisma, aucune base.
 */
const mockInvoices: Record<string, any>[] = [];
const mockFindFirst = jest.fn(
  async ({ where }: any) =>
    mockInvoices.find(
      i =>
        i.id === where.id &&
        (!where.kind || i.kind === where.kind) &&
        (!where.tenantId || i.tenantId === where.tenantId)
    ) ?? null
);
const mockUpdate = jest.fn(async ({ where, data }: any) => {
  const inv = mockInvoices.find(i => i.id === where.id)!;
  return { ...inv, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) };
});

const matchList = (i: Record<string, any>, where: any) =>
  i.tenantId === where.tenantId &&
  (!where.kind || i.kind === where.kind) &&
  (!where.status || i.status === where.status);
const mockFindMany = jest.fn(async ({ where }: any) => mockInvoices.filter(i => matchList(i, where)));
const mockCount = jest.fn(async ({ where }: any) => mockInvoices.filter(i => matchList(i, where)).length);

jest.mock('../../src/utils/database', () => ({
  prisma: {
    invoice: {
      findFirst: (...a: any[]) => (mockFindFirst as any)(...a),
      update: (...a: any[]) => (mockUpdate as any)(...a),
      findMany: (...a: any[]) => (mockFindMany as any)(...a),
      count: (...a: any[]) => (mockCount as any)(...a)
    }
  }
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  AuditActionKey: { INVOICE_MARKED_PAID: 'a', INVOICE_CANCELED: 'b', INVOICE_CREATED: 'c' }
}));

import { updateInvoice, markInvoiceAsPaid, getInvoiceById, listInvoices } from '../../src/services/invoice-service';
import {
  getInvoiceHandler,
  updateInvoiceHandler,
  markInvoicePaidHandler
} from '../../src/controllers/subscription-controller';
import { ConflictError, NotFoundError, ValidationError } from '../../src/middleware/error-middleware';
import { runWithLanguage } from '../../src/i18n';

const MSG = 'Facture introuvable.';

beforeEach(() => {
  mockInvoices.length = 0;
  mockInvoices.push(
    { id: 'rent', kind: 'RENTAL', tenantId: 't1', status: 'PENDING', paidAt: null },
    { id: 'plat', kind: 'PLATFORM', tenantId: 't1', status: 'PENDING', paidAt: null }
  );
  mockFindFirst.mockClear();
  mockUpdate.mockClear();
  mockFindMany.mockClear();
  mockCount.mockClear();
});

async function expectNotFound(p: Promise<unknown>) {
  const err: any = await p.then(
    () => null,
    e => e
  );
  expect(err).toBeInstanceOf(NotFoundError);
  expect(err.statusCode).toBe(404);
  expect(err.message).toBe(MSG);
  expect(mockUpdate).not.toHaveBeenCalled();
}

describe('garde des factures admin historiques', () => {
  it('refuse une facture RENTAL (update, mark-paid)', async () => {
    await expectNotFound(updateInvoice('rent', { status: 'PAID' as any }));
    await expectNotFound(markInvoiceAsPaid('rent'));
  });

  it('refuse une facture PLATFORM d une autre agence avec la meme NotFoundError', async () => {
    await expectNotFound(updateInvoice('plat', { status: 'PAID' as any }, undefined, 't2'));
    await expectNotFound(markInvoiceAsPaid('plat', undefined, undefined, 't2'));
  });

  it('getInvoiceById renvoie null pour RENTAL ou autre agence', async () => {
    expect(await getInvoiceById('rent')).toBeNull();
    expect(await getInvoiceById('plat', 't2')).toBeNull();
    expect(await getInvoiceById('plat', 't1')).toMatchObject({ id: 'plat' });
  });

  it('accepte une facture PLATFORM sans expectedTenantId et pose paidAt', async () => {
    const res: any = await markInvoiceAsPaid('plat');
    expect(res.status).toBe('PAID');
    expect(res.paidAt).toBeInstanceOf(Date);
  });

  it('accepte une facture PLATFORM avec le bon expectedTenantId', async () => {
    const res: any = await markInvoiceAsPaid('plat', undefined, undefined, 't1');
    expect(res.status).toBe('PAID');
  });

  it('la requete Prisma contient kind PLATFORM', async () => {
    await getInvoiceById('plat', 't1');
    await updateInvoice('plat', { notes: 'x' } as any);
    for (const call of mockFindFirst.mock.calls) {
      expect((call[0] as any).where.kind).toBe('PLATFORM');
    }
    expect((mockFindFirst.mock.calls[0][0] as any).where.tenantId).toBe('t1');
  });
});

describe('listInvoices (GET /admin/tenants/:tenantId/invoices)', () => {
  it('ne renvoie que les factures PLATFORM de l agence, jamais les loyers RENTAL', async () => {
    mockInvoices.push(
      { id: 'rent-2', kind: 'RENTAL', tenantId: 't1', status: 'PAID' },
      { id: 'plat-t2', kind: 'PLATFORM', tenantId: 't2', status: 'PENDING' }
    );
    const result = await listInvoices('t1');
    expect(result.invoices.map((i: any) => i.id)).toEqual(['plat']);
    expect(result.pagination.total).toBe(1);
    expect(mockFindMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', kind: 'PLATFORM' });
    expect(mockCount.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', kind: 'PLATFORM' });
  });

  it('le filtre de statut garde kind PLATFORM', async () => {
    mockInvoices.push({ id: 'rent-paid', kind: 'RENTAL', tenantId: 't1', status: 'PAID' });
    mockInvoices.push({ id: 'plat-paid', kind: 'PLATFORM', tenantId: 't1', status: 'PAID' });
    const result = await listInvoices('t1', { status: 'PAID' as any });
    expect(result.invoices.map((i: any) => i.id)).toEqual(['plat-paid']);
  });
});

describe('handlers', () => {
  const makeRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  it('markInvoicePaidHandler repond 404 pour une facture RENTAL', async () => {
    const res = makeRes();
    await markInvoicePaidHandler(
      { user: { userId: 'u' }, params: { invoiceId: 'rent' }, body: {}, query: {} } as any,
      res
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: MSG });
  });

  it('updateInvoiceHandler repond 404 pour une facture RENTAL', async () => {
    const res = makeRes();
    await updateInvoiceHandler(
      { user: { userId: 'u' }, params: { invoiceId: 'rent' }, body: { status: 'PAID' }, query: {} } as any,
      res
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: MSG });
  });

  // Le 404 ci-dessus passerait aussi avec l'ancien repli sur « introuvable » :
  // ces cas prouvent que le statut de l'AppError est relaye tel quel.
  it('markInvoicePaidHandler relaie le statut d une AppError 409 (ni 404 ni 400)', async () => {
    mockFindFirst.mockRejectedValueOnce(new ConflictError('Facture déjà réglée.'));
    const res = makeRes();
    await markInvoicePaidHandler(
      { user: { userId: 'u' }, params: { invoiceId: 'plat' }, body: {}, query: {} } as any,
      res
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Facture déjà réglée.' });
  });

  it('updateInvoiceHandler relaie le statut d une AppError 422 meme si le message contient « introuvable »', async () => {
    mockFindFirst.mockRejectedValueOnce(new ValidationError('Échéance introuvable dans le calendrier.'));
    const res = makeRes();
    await updateInvoiceHandler(
      { user: { userId: 'u' }, params: { invoiceId: 'plat' }, body: { status: 'PAID' }, query: {} } as any,
      res
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Échéance introuvable dans le calendrier.' });
  });

  it('une erreur non typee garde le repli historique (400)', async () => {
    mockFindFirst.mockRejectedValueOnce(new Error('panne'));
    const res = makeRes();
    await markInvoicePaidHandler(
      { user: { userId: 'u' }, params: { invoiceId: 'plat' }, body: {}, query: {} } as any,
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('getInvoiceHandler repond le meme 404 pour une facture RENTAL, inexistante ou d une autre agence', async () => {
    for (const [invoiceId, query] of [
      ['rent', {}],
      ['absente', {}],
      ['plat', { tenantId: 't2' }]
    ] as const) {
      const res = makeRes();
      await getInvoiceHandler({ user: { userId: 'u' }, params: { invoiceId }, query } as any, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: MSG });
    }
  });

  it('getInvoiceHandler renvoie une facture PLATFORM de l agence attendue', async () => {
    const res = makeRes();
    await getInvoiceHandler(
      { user: { userId: 'u' }, params: { invoiceId: 'plat' }, query: { tenantId: 't1' } } as any,
      res
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({ id: 'plat' }) });
  });

  it('le 404 du GET est traduit comme ceux de PATCH et mark-paid', async () => {
    const getRes = makeRes();
    const patchRes = makeRes();
    await runWithLanguage('en', async () => {
      await getInvoiceHandler({ user: { userId: 'u' }, params: { invoiceId: 'rent' }, query: {} } as any, getRes);
      await markInvoicePaidHandler(
        { user: { userId: 'u' }, params: { invoiceId: 'rent' }, body: {}, query: {} } as any,
        patchRes
      );
    });
    expect(getRes.json).toHaveBeenCalledWith({ success: false, message: 'Invoice not found.' });
    expect(patchRes.json).toHaveBeenCalledWith({ success: false, message: 'Invoice not found.' });
  });

  it('markInvoicePaidHandler transmet tenantId de la query', async () => {
    const res = makeRes();
    await markInvoicePaidHandler(
      { user: { userId: 'u' }, params: { invoiceId: 'plat' }, body: {}, query: { tenantId: 't2' } } as any,
      res
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
