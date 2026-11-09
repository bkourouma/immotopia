/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * updateSubscription : le changement de cycle est refuse (409), billingAnchorDay
 * est preserve. createSubscription : fin de periode en UTC avec la regle de fin
 * de mois et ancre memorisee. Faux Prisma, aucune base.
 */
const mockFindUnique = jest.fn();
const mockCreate = jest.fn(async ({ data }: any) => ({ id: 's1', ...data }));
const mockTenantFind = jest.fn(async () => ({ id: 't1' }));
const mockUpdate = jest.fn(async ({ data }: any) => ({ id: 's1', ...data }));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    tenant: { findUnique: (...a: any[]) => (mockTenantFind as any)(...a) },
    subscription: {
      create: (...a: any[]) => (mockCreate as any)(...a),
      findUnique: (...a: any[]) => (mockFindUnique as any)(...a),
      update: (...a: any[]) => (mockUpdate as any)(...a)
    }
  }
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  recordAuditEvent: jest.fn(),
  AuditActionKey: { SUBSCRIPTION_UPDATED: 'u', SUBSCRIPTION_CREATED: 'c', SUBSCRIPTION_CANCELED: 'x' }
}));

import { createSubscription, updateSubscription } from '../../src/services/subscription-service';
import { updateSubscriptionHandler } from '../../src/controllers/subscription-controller';
import { ConflictError } from '../../src/middleware/error-middleware';

const base = (over: any = {}) => ({
  id: 's1',
  tenantId: 't1',
  planKey: 'STARTER',
  billingCycle: 'MONTHLY',
  status: 'ACTIVE',
  currentPeriodStart: new Date('2026-01-01'),
  currentPeriodEnd: new Date('2026-02-01'),
  canceledAt: null,
  metadata: {},
  ...over
});

beforeEach(() => {
  mockFindUnique.mockReset().mockResolvedValue(base());
  mockUpdate.mockClear();
  mockCreate.mockClear();
});

describe('billingAnchorDay reserve (injection par un admin)', () => {
  it('ignore billingAnchorDay saisi a la creation', async () => {
    mockFindUnique.mockResolvedValue(null);
    await createSubscription({
      tenantId: 't1',
      planKey: 'PRO',
      billingCycle: 'MONTHLY',
      // Jour <= 28 : aucune ancre calculee, le test ne depend pas de la date du jour.
      startAt: new Date('2027-01-15T00:00:00.000Z'),
      metadata: { billingAnchorDay: 1, foo: 'bar' }
    } as any);
    expect(mockCreate.mock.calls[0][0].data.metadata).toEqual({ foo: 'bar' });
  });

  it('une valeur saisie ne remplace jamais l’ancre calculee (31/01 -> 31)', async () => {
    mockFindUnique.mockResolvedValue(null);
    await createSubscription({
      tenantId: 't1',
      planKey: 'PRO',
      billingCycle: 'MONTHLY',
      startAt: new Date('2027-01-31T00:00:00.000Z'),
      metadata: { billingAnchorDay: 5, foo: 'bar' }
    } as any);
    expect(mockCreate.mock.calls[0][0].data.metadata).toEqual({ foo: 'bar', billingAnchorDay: 31 });
  });

  it('ignore billingAnchorDay saisi a la mise a jour sans ancre existante', async () => {
    await updateSubscription('t1', { metadata: { billingAnchorDay: 1, foo: 'bar' } } as any);
    expect(mockUpdate.mock.calls[0][0].data.metadata).toEqual({ foo: 'bar' });
  });

  it("conserve l'ancre existante malgre une valeur saisie differente", async () => {
    mockFindUnique.mockResolvedValue(base({ metadata: { billingAnchorDay: 31 } }));
    await updateSubscription('t1', { metadata: { billingAnchorDay: 1, foo: 'bar' } } as any);
    expect(mockUpdate.mock.calls[0][0].data.metadata).toEqual({ foo: 'bar', billingAnchorDay: 31 });
  });
});

describe('updateSubscription - cycle', () => {
  it('rejette un cycle different en ConflictError 409 sans ecrire', async () => {
    const err: any = await updateSubscription('t1', { billingCycle: 'ANNUAL' } as any).catch(e => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('Le cycle de facturation (mensuel/annuel) ne peut pas être modifié par cette route.');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('accepte un cycle identique sans toucher a la periode ni au cycle', async () => {
    await updateSubscription('t1', { billingCycle: 'MONTHLY' } as any);
    const data = mockUpdate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('currentPeriodEnd');
    expect(data).not.toHaveProperty('billingCycle');
  });

  it('accepte status, planKey, cancelAt seuls', async () => {
    const cancelAt = new Date('2026-06-01');
    await updateSubscription('t1', { status: 'PAST_DUE', planKey: 'PRO', cancelAt } as any);
    const data = mockUpdate.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'PAST_DUE', planKey: 'PRO', cancelAt });
  });
});

describe('updateSubscription - metadata', () => {
  it('conserve billingAnchorDay existant', async () => {
    mockFindUnique.mockResolvedValue(base({ metadata: { billingAnchorDay: 15, old: 1 } }));
    await updateSubscription('t1', { metadata: { foo: 'bar' } } as any);
    expect(mockUpdate.mock.calls[0][0].data.metadata).toEqual({ foo: 'bar', billingAnchorDay: 15 });
  });

  it('comportement actuel sans billingAnchorDay', async () => {
    await updateSubscription('t1', { metadata: { foo: 'bar' } } as any);
    expect(mockUpdate.mock.calls[0][0].data.metadata).toEqual({ foo: 'bar' });
  });
});

describe('createSubscription - fin de periode (UTC, fin de mois)', () => {
  const create = async (over: any) => {
    mockFindUnique.mockResolvedValue(null);
    await createSubscription({ tenantId: 't1', planKey: 'PRO', billingCycle: 'MONTHLY', ...over } as any);
    return mockCreate.mock.calls[0][0].data;
  };
  const iso = (date: Date) => date.toISOString();

  it('31/01 -> 28/02 (et non 03/03), ancre 31 memorisee', async () => {
    const data = await create({ startAt: new Date('2027-01-31T00:00:00.000Z') });
    expect(iso(data.currentPeriodStart)).toBe('2027-01-31T00:00:00.000Z');
    expect(iso(data.currentPeriodEnd)).toBe('2027-02-28T00:00:00.000Z');
    expect(data.metadata).toEqual({ billingAnchorDay: 31 });
  });

  it('dates recues en chaines ISO (controleur) : 31/03 23:30 UTC -> 30/04 23:30 UTC, ancre 31', async () => {
    const data = await create({ startAt: '2027-03-31T23:30:00.000Z', metadata: { foo: 'bar' } });
    expect(data.startAt).toBeInstanceOf(Date);
    expect(iso(data.currentPeriodEnd)).toBe('2027-04-30T23:30:00.000Z');
    expect(data.metadata).toEqual({ foo: 'bar', billingAnchorDay: 31 });
  });

  it('annuel 29/02/2028 -> 28/02/2029, ancre 29', async () => {
    const data = await create({ billingCycle: 'ANNUAL', currentPeriodStart: '2028-02-29T00:00:00.000Z' });
    expect(iso(data.currentPeriodEnd)).toBe('2029-02-28T00:00:00.000Z');
    expect(data.metadata).toEqual({ billingAnchorDay: 29 });
  });

  it('jour <= 28 : meme resultat qu’avant, aucune ancre', async () => {
    const data = await create({ startAt: new Date('2027-01-15T10:00:00.000Z') });
    expect(iso(data.currentPeriodEnd)).toBe('2027-02-15T10:00:00.000Z');
    expect(data.metadata).toEqual({});
  });

  it('fin saisie hors cycle calendaire : conservee telle quelle, aucune ancre', async () => {
    const data = await create({
      currentPeriodStart: '2027-01-31T00:00:00.000Z',
      currentPeriodEnd: '2027-02-15T00:00:00.000Z'
    });
    expect(iso(data.currentPeriodEnd)).toBe('2027-02-15T00:00:00.000Z');
    expect(data.metadata).toEqual({});
  });

  it('fin saisie egale au cycle calendaire : ancre memorisee', async () => {
    const data = await create({
      currentPeriodStart: '2027-01-31T00:00:00.000Z',
      currentPeriodEnd: '2027-02-28T00:00:00.000Z'
    });
    expect(data.metadata).toEqual({ billingAnchorDay: 31 });
  });
});

describe('updateSubscriptionHandler', () => {
  it('repond 409 (et non 400) pour un changement de cycle', async () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    await updateSubscriptionHandler(
      { user: { userId: 'u' }, params: { tenantId: 't1' }, body: { billingCycle: 'ANNUAL' } } as any,
      res
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Le cycle de facturation (mensuel/annuel) ne peut pas être modifié par cette route.'
    });
  });
});
