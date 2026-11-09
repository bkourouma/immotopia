/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Fin de mois a la creation d'un espace (createTenantCoreTx) : un abonnement
 * cree ACTIF memorise son jour d'ancrage (> 28) dans `metadata.billingAnchorDay`,
 * sinon un 31/01 deriverait au 28 au premier renouvellement. L'essai n'en pose
 * pas (son ancre est la fin d'essai). Faux client de transaction, aucune base ;
 * le renouvellement est rejoue avec les fonctions pures qu'utilisent la tache
 * horaire et le reglement (resolveBillingAnchorDay + addBillingPeriod).
 */

jest.mock('../../src/lib/finance/accounting', () => ({
  ensureOperationalChartOfAccountsTx: jest.fn(async () => new Map()),
  ensureOperationalJournalTx: jest.fn(async () => 'journal-1')
}));
jest.mock('../../src/lib/treasury/accounts', () => ({ ensureDefaultTreasuryAccountTx: jest.fn(async () => ({})) }));
jest.mock('../../src/lib/finance/stock-referentiel', () => ({ ensureStockSettingsTx: jest.fn(async () => ({})) }));
jest.mock('../../src/lib/owner-account/accounts', () => ({ ensureRentalAccountsTx: jest.fn(async () => ({})) }));
jest.mock('../../src/services/email-service', () => ({ emailService: { sendInviteEmail: jest.fn() } }));
jest.mock('../../src/services/tenant-service', () => ({ generateSlugFromName: (name: string) => name.toLowerCase() }));
jest.mock('../../src/lib/patrimoine/personal-permissions', () => ({
  ensurePersonalSpaceOwnerRole: jest.fn(),
  grantPersonalSpaceOwnerRole: jest.fn()
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  AuditActionKey: {}
}));
jest.mock('../../src/services/invitation-service', () => ({
  createInvitationRecordTx: jest.fn(),
  buildInvitationAcceptUrl: jest.fn(),
  resolveRoleLabels: jest.fn()
}));
// Le catalogue et le rattachement des extensions ne portent pas la logique testee ici.
jest.mock('../../src/services/subscription-v2-service', () => ({
  loadCatalogByCodes: jest.fn(async () => new Map()),
  planInitialItems: jest.fn(() => [
    {
      catalog: { id: 'cat-1', code: 'PARTICULIER_GRATUIT', kind: 'PACK', modules: ['MODULE_PATRIMOINE'] },
      quantity: 1,
      unitMonthlyPrice: 0,
      unitSetupPrice: 0
    }
  ]),
  linkExtensionsToPacksTx: jest.fn(async () => 0)
}));
jest.mock('../../src/utils/database', () => ({ prisma: {} }));

import { createTenantCoreTx } from '../../src/services/tenant-provisioning-service';
import { BILLING_ANCHOR_METADATA_KEY, addBillingPeriod, resolveBillingAnchorDay } from '../../src/lib/subscription';

type Row = Record<string, any>;

function fakeTx() {
  const created: Row = {};
  const tx: Row = {
    tenant: { create: jest.fn(async ({ data }: Row) => ({ id: 'tenant-1', ...data })) },
    tenantModule: { createMany: jest.fn(async ({ data }: Row) => ({ count: data.length })) },
    subscription: {
      create: jest.fn(async ({ data }: Row) => {
        created.subscription = { id: 'sub-1', ...data };
        return created.subscription;
      })
    },
    subscriptionItem: { createMany: jest.fn(async ({ data }: Row) => ({ count: data.length })) },
    agencyFinanceSettings: { create: jest.fn(async () => ({})) },
    role: { findFirst: jest.fn(async () => ({ id: 'role-admin' })) }
  };
  return { tx, created };
}

async function provisionAt(iso: string, options: { billingCycle?: 'MONTHLY' | 'ANNUAL'; trial?: boolean } = {}) {
  jest.setSystemTime(new Date(iso));
  const { tx, created } = fakeTx();
  await createTenantCoreTx(tx as never, {
    name: 'Espace',
    type: 'PARTICULIER' as never,
    slug: 'espace',
    requested: [{ code: 'PARTICULIER_GRATUIT', quantity: 1 }],
    planKey: null,
    billingCycle: (options.billingCycle ?? 'MONTHLY') as never,
    subscription: { status: options.trial ? 'TRIALING' : 'ACTIVE' },
    actorUserId: 'user-1'
  });
  return created.subscription as Row;
}

/** Renouvellement tel que le font la tache horaire et le reglement : depuis la fin, a l'ancre resolue. */
function renew(sub: Row): Row {
  const boundary: Date = sub.currentPeriodEnd;
  const anchor = resolveBillingAnchorDay(sub.metadata, boundary);
  return {
    ...sub,
    currentPeriodStart: boundary,
    currentPeriodEnd: addBillingPeriod(boundary, sub.billingCycle, anchor)
  };
}

const iso = (date: Date) => date.toISOString();

beforeAll(() => {
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout']
  });
});
afterAll(() => {
  jest.useRealTimers();
});

describe('createTenantCoreTx : ancre de fin de mois a la creation (ACTIVE)', () => {
  it('cree le 31/01 : fin 28/02, ancre 31 memorisee, puis 31/03 (aucune derive au 28)', async () => {
    const sub = await provisionAt('2027-01-31T10:00:00.000Z');
    expect(iso(sub.currentPeriodStart)).toBe('2027-01-31T10:00:00.000Z');
    expect(iso(sub.currentPeriodEnd)).toBe('2027-02-28T10:00:00.000Z');
    expect(sub.metadata).toEqual({ [BILLING_ANCHOR_METADATA_KEY]: 31 });
    const second = renew(sub);
    expect(iso(second.currentPeriodEnd)).toBe('2027-03-31T10:00:00.000Z');
    expect(iso(renew(second).currentPeriodEnd)).toBe('2027-04-30T10:00:00.000Z');
  });

  it('cree le 31/03 : fin 30/04 avec l’ancre 31 (et non 30), puis 31/05', async () => {
    const sub = await provisionAt('2027-03-31T08:00:00.000Z');
    expect(iso(sub.currentPeriodEnd)).toBe('2027-04-30T08:00:00.000Z');
    expect(sub.metadata).toEqual({ [BILLING_ANCHOR_METADATA_KEY]: 31 });
    expect(iso(renew(sub).currentPeriodEnd)).toBe('2027-05-31T08:00:00.000Z');
  });

  it('cree le 30/01 : ancre 30, fin 28/02 puis 30/03', async () => {
    const sub = await provisionAt('2027-01-30T00:00:00.000Z');
    expect(sub.metadata).toEqual({ [BILLING_ANCHOR_METADATA_KEY]: 30 });
    expect(iso(sub.currentPeriodEnd)).toBe('2027-02-28T00:00:00.000Z');
    expect(iso(renew(sub).currentPeriodEnd)).toBe('2027-03-30T00:00:00.000Z');
  });

  it('jour <= 28 : aucune cle metadata ecrite, renouvellements au meme jour', async () => {
    const sub = await provisionAt('2027-01-28T09:00:00.000Z');
    expect(sub).not.toHaveProperty('metadata');
    expect(iso(sub.currentPeriodEnd)).toBe('2027-02-28T09:00:00.000Z');
    expect(iso(renew(sub).currentPeriodEnd)).toBe('2027-03-28T09:00:00.000Z');

    const mid = await provisionAt('2027-01-15T09:00:00.000Z');
    expect(mid).not.toHaveProperty('metadata');
    expect(iso(mid.currentPeriodEnd)).toBe('2027-02-15T09:00:00.000Z');
  });

  it('annuel cree le 29/02/2028 : 28/02/2029, 28/02/2030, 28/02/2031 puis 29/02/2032', async () => {
    let sub = await provisionAt('2028-02-29T00:00:00.000Z', { billingCycle: 'ANNUAL' });
    expect(sub.metadata).toEqual({ [BILLING_ANCHOR_METADATA_KEY]: 29 });
    const ends: string[] = [iso(sub.currentPeriodEnd)];
    for (let i = 0; i < 3; i++) {
      sub = renew(sub);
      ends.push(iso(sub.currentPeriodEnd));
    }
    expect(ends).toEqual([
      '2029-02-28T00:00:00.000Z',
      '2030-02-28T00:00:00.000Z',
      '2031-02-28T00:00:00.000Z',
      '2032-02-29T00:00:00.000Z'
    ]);
  });

  it('jour UTC, pas local : 31/01 a 23:30 UTC reste un 31', async () => {
    const sub = await provisionAt('2027-01-31T23:30:00.000Z');
    expect(sub.metadata).toEqual({ [BILLING_ANCHOR_METADATA_KEY]: 31 });
    expect(iso(sub.currentPeriodEnd)).toBe('2027-02-28T23:30:00.000Z');
  });
});

describe('createTenantCoreTx : essai', () => {
  it('essai cree le 31/01 : aucune ancre (la fin d’essai donnera l’ancre au renouvellement)', async () => {
    const sub = await provisionAt('2027-01-31T10:00:00.000Z', { trial: true });
    expect(sub.status).toBe('TRIALING');
    expect(sub).not.toHaveProperty('metadata');
    expect(sub.trialEndsAt).toEqual(sub.currentPeriodEnd);
  });
});
