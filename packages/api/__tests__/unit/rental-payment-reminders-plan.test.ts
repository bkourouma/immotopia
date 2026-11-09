/**
 * Lot 3 (049) : plan des relances de loyer. Fonction pure `computeReminderPlan`,
 * `planReminders` (chemin d'envoi) et `buildReminderPreview` (apercu), Prisma mocke.
 */
const mocks = {
  installmentFindMany: jest.fn(),
  leaseFindFirst: jest.fn(),
  propertyFindFirst: jest.fn(),
  clientFindMany: jest.fn(),
  contactFindMany: jest.fn(),
  reminderFindMany: jest.fn(),
  declarationFindMany: jest.fn(),
  checkoutFindMany: jest.fn(),
  loadChannelConfigs: jest.fn(),
  planChannels: jest.fn(),
  loadConfig: jest.fn()
};

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalInstallment: { findMany: (...a: any[]) => mocks.installmentFindMany(...a) },
    rentalLease: { findFirst: (...a: any[]) => mocks.leaseFindFirst(...a) },
    property: { findFirst: (...a: any[]) => mocks.propertyFindFirst(...a) },
    tenantClient: { findMany: (...a: any[]) => mocks.clientFindMany(...a) },
    crmContact: { findMany: (...a: any[]) => mocks.contactFindMany(...a) },
    rentalPaymentReminder: { findMany: (...a: any[]) => mocks.reminderFindMany(...a) },
    rentalPaymentDeclaration: { findMany: (...a: any[]) => mocks.declarationFindMany(...a) },
    onlinePaymentCheckout: { findMany: (...a: any[]) => mocks.checkoutFindMany(...a) }
  }
}));
jest.mock('../../src/lib/patrimoine/notification-channels', () => ({
  CHANNEL_RECIPIENT_SELECT: { id: true, email: true },
  loadChannelConfigs: (...a: any[]) => mocks.loadChannelConfigs(...a),
  planChannels: (...a: any[]) => mocks.planChannels(...a)
}));
jest.mock('../../src/lib/payment-gateway/config', () => ({
  loadConfig: (...a: any[]) => mocks.loadConfig(...a),
  isConfigUsable: (c: any) => Boolean(c && c.usable),
  paymentGatewaySimulatorAvailable: false
}));
jest.mock('../../src/lib/payment-gateway/checkout', () => ({
  resteDuEcheance: (i: any) => Number(i.amount_rent) - Number(i.amount_paid)
}));

import {
  buildReminderPreview,
  computeReminderPlan,
  MAX_PREVIEW_ITEMS,
  planReminders,
  type ReminderPlanFacts
} from '../../src/lib/rental/payment-reminders/plan';
import { NotFoundError } from '../../src/middleware/error-middleware';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 9, 12, 0, 0);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function facts(over: Partial<ReminderPlanFacts> = {}): ReminderPlanFacts {
  return {
    now: NOW,
    daysBefore: 0,
    dueDate: daysAgo(10),
    canceled: false,
    draftNotIssued: false,
    amountDue: 100000,
    leaseActive: true,
    hasCurrentTenant: true,
    hasContact: true,
    reminders: [],
    pendingDeclarations: [],
    onlineCheckouts: [],
    ...over
  };
}

describe('computeReminderPlan (fonction pure)', () => {
  it('echeance en retard sans historique : eligible, niveau 1, evenement OVERDUE', () => {
    const r = computeReminderPlan(facts());
    expect(r).toMatchObject({
      eligible: true,
      exclusions: [],
      nextLevel: 1,
      eventKey: 'INSTALLMENT_OVERDUE',
      daysLate: 10
    });
    expect(r.lastLevelSent).toBeNull();
    expect(r.lastSentAt).toBeNull();
  });

  it('avant echeance : evenement DUE_REMINDER et daysLate negatif', () => {
    const r = computeReminderPlan(facts({ dueDate: new Date(NOW.getTime() + 3 * DAY), daysBefore: 5 }));
    expect(r.eventKey).toBe('INSTALLMENT_DUE_REMINDER');
    expect(r.daysLate).toBe(-3);
    expect(r.eligible).toBe(true);
  });

  it('echeance du jour : DUE_REMINDER', () => {
    expect(computeReminderPlan(facts({ dueDate: NOW })).eventKey).toBe('INSTALLMENT_DUE_REMINDER');
  });

  it('ALREADY_PAID : solde ou annulee', () => {
    expect(computeReminderPlan(facts({ amountDue: 0 })).exclusions).toContain('ALREADY_PAID');
    expect(computeReminderPlan(facts({ canceled: true })).exclusions).toContain('ALREADY_PAID');
  });

  it('NOT_DUE_YET : hors fenetre ou brouillon a venir', () => {
    const future = new Date(NOW.getTime() + 10 * DAY);
    expect(computeReminderPlan(facts({ dueDate: future, daysBefore: 5 })).exclusions).toContain('NOT_DUE_YET');
    expect(computeReminderPlan(facts({ dueDate: future, daysBefore: 10 })).exclusions).not.toContain('NOT_DUE_YET');
    expect(computeReminderPlan(facts({ draftNotIssued: true })).exclusions).toContain('NOT_DUE_YET');
  });

  it('TOO_SOON a 6 jours, OK a 7 jours', () => {
    const at = (d: number) => facts({ reminders: [{ level: 1, status: 'SENT', sentAt: daysAgo(d) }] });
    expect(computeReminderPlan(at(6)).exclusions).toContain('TOO_SOON');
    const ok = computeReminderPlan(at(7));
    expect(ok.exclusions).not.toContain('TOO_SOON');
    expect(ok.nextLevel).toBe(2);
    expect(ok.lastLevelSent).toBe(1);
    expect(ok.lastSentAt).toBe(daysAgo(7).toISOString());
  });

  it('niveaux 1 -> 2 -> 3 puis MAX_LEVEL_REACHED', () => {
    const lvl = (level: number) => facts({ reminders: [{ level, status: 'SENT', sentAt: daysAgo(20) }] });
    expect(computeReminderPlan(lvl(1)).nextLevel).toBe(2);
    expect(computeReminderPlan(lvl(2)).nextLevel).toBe(3);
    const max = computeReminderPlan(lvl(3));
    expect(max.nextLevel).toBeNull();
    expect(max.exclusions).toContain('MAX_LEVEL_REACHED');
    expect(max.eligible).toBe(false);
  });

  it('les FAILED ne comptent ni pour le niveau ni pour espacement', () => {
    const r = computeReminderPlan(facts({ reminders: [{ level: 2, status: 'FAILED', sentAt: daysAgo(1) }] }));
    expect(r.eligible).toBe(true);
    expect(r.nextLevel).toBe(1);
    expect(r.lastLevelSent).toBeNull();
  });

  it('PENDING_DECLARATION : 6 jours bloque, 8 jours non', () => {
    expect(computeReminderPlan(facts({ pendingDeclarations: [{ createdAt: daysAgo(6) }] })).exclusions).toContain(
      'PENDING_DECLARATION'
    );
    expect(computeReminderPlan(facts({ pendingDeclarations: [{ createdAt: daysAgo(8) }] })).exclusions).not.toContain(
      'PENDING_DECLARATION'
    );
  });

  it('PENDING_ONLINE_ATTEMPT : PENDING 14 min bloque, 16 min non, REVIEW toujours', () => {
    const min = (m: number) => new Date(NOW.getTime() - m * 60 * 1000);
    const ex = (checkouts: ReminderPlanFacts['onlineCheckouts']) =>
      computeReminderPlan(facts({ onlineCheckouts: checkouts })).exclusions;
    expect(ex([{ status: 'PENDING', createdAt: min(14) }])).toContain('PENDING_ONLINE_ATTEMPT');
    expect(ex([{ status: 'PENDING', createdAt: min(16) }])).not.toContain('PENDING_ONLINE_ATTEMPT');
    expect(ex([{ status: 'REVIEW', createdAt: min(600) }])).toContain('PENDING_ONLINE_ATTEMPT');
  });

  it('LEASE_NOT_ACTIVE, NO_CURRENT_TENANT, NO_CONTACT_CHANNEL, EVENT_DISABLED', () => {
    expect(computeReminderPlan(facts({ leaseActive: false })).exclusions).toContain('LEASE_NOT_ACTIVE');
    const noTenant = computeReminderPlan(facts({ hasCurrentTenant: false, hasContact: false }));
    expect(noTenant.exclusions).toEqual(['NO_CURRENT_TENANT']);
    expect(computeReminderPlan(facts({ hasContact: false })).exclusions).toEqual(['NO_CONTACT_CHANNEL']);
    expect(computeReminderPlan(facts({ channelFailure: 'NO_ELIGIBLE_CHANNEL' })).exclusions).toEqual([
      'NO_CONTACT_CHANNEL'
    ]);
    expect(computeReminderPlan(facts({ channelFailure: 'EVENT_DISABLED' })).exclusions).toEqual(['EVENT_DISABLED']);
  });

  it('plusieurs exclusions cumulees', () => {
    const r = computeReminderPlan(facts({ amountDue: 0, leaseActive: false }));
    expect(r.exclusions).toEqual(expect.arrayContaining(['ALREADY_PAID', 'LEASE_NOT_ACTIVE']));
    expect(r.eligible).toBe(false);
  });
});

function row(id: string, over: any = {}) {
  return {
    id,
    lease_id: over.lease_id ?? 'lease-1',
    period_year: 2026,
    period_month: 9,
    due_date: over.due_date ?? daysAgo(10),
    status: over.status ?? 'OVERDUE',
    currency: 'FCFA',
    amount_rent: over.amount_rent ?? 100000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: over.amount_paid ?? 0,
    payments: [],
    tenant: { name: 'Agence Test' },
    lease: {
      status: over.leaseStatus ?? 'ACTIVE',
      lease_number: over.lease_number ?? 'BAIL-001',
      primary_renter_client_id: over.client ?? 'client-1',
      property: { title: over.title ?? 'Villa Cocody', address: '1 rue des Fleurs' }
    }
  };
}

function defaultMocks() {
  Object.values(mocks).forEach(m => m.mockReset());
  mocks.clientFindMany.mockResolvedValue([
    { id: 'client-1', user: { email: 'Awa@Example.com', fullName: 'Awa Compte' } },
    { id: 'client-2', user: { email: 'koffi@example.com', fullName: 'Koffi Compte' } }
  ]);
  const base = { whatsappNumber: null, phonePrimary: null, consentWhatsapp: null, preferredContactChannel: null };
  mocks.contactFindMany.mockResolvedValue([
    { id: 'c-1', email: 'awa@example.com', firstName: 'Awa', lastName: 'Traore', consentEmail: true, ...base },
    { id: 'c-2', email: 'koffi@example.com', firstName: 'Koffi', lastName: 'Yao', consentEmail: true, ...base }
  ]);
  mocks.reminderFindMany.mockResolvedValue([]);
  mocks.declarationFindMany.mockResolvedValue([]);
  mocks.checkoutFindMany.mockResolvedValue([]);
  mocks.loadChannelConfigs.mockResolvedValue({});
  mocks.planChannels.mockReturnValue({ channels: ['EMAIL'] });
  mocks.loadConfig.mockResolvedValue({ usable: true, mode: 'LIVE' });
  mocks.leaseFindFirst.mockResolvedValue({ id: 'lease-1' });
  mocks.propertyFindFirst.mockResolvedValue({ id: 'prop-1' });
}

describe('planReminders', () => {
  beforeEach(defaultMocks);

  it('id dune autre agence : NotFoundError', async () => {
    mocks.installmentFindMany.mockResolvedValue([row('a')]);
    await expect(planReminders('tenant-A', ['a', 'zzz'], { now: NOW })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('conserve ordre, filtre tout par tenant, une lecture de config par cle', async () => {
    mocks.installmentFindMany.mockResolvedValue([row('a'), row('b', { client: 'client-2' })]);
    const plans = await planReminders('tenant-A', ['b', 'a'], { now: NOW });
    expect(plans.map(p => p.item.installmentId)).toEqual(['b', 'a']);
    expect(plans[0]).toMatchObject({
      contactName: 'Koffi Yao',
      agencyName: 'Agence Test',
      leaseNumber: 'BAIL-001',
      usableChannels: ['EMAIL']
    });
    expect(plans[0].item).toMatchObject({
      eligible: true,
      channels: ['EMAIL'],
      paymentLinkIncluded: true,
      nextLevel: 1
    });

    expect(mocks.installmentFindMany.mock.calls[0][0].where.tenant_id).toBe('tenant-A');
    expect(mocks.clientFindMany.mock.calls[0][0].where.tenantId).toBe('tenant-A');
    expect(mocks.contactFindMany.mock.calls[0][0].where.tenantId).toBe('tenant-A');
    expect(mocks.reminderFindMany.mock.calls[0][0].where.tenant_id).toBe('tenant-A');
    expect(mocks.declarationFindMany.mock.calls[0][0].where.tenant_id).toBe('tenant-A');
    expect(mocks.checkoutFindMany.mock.calls[0][0].where.tenantId).toBe('tenant-A');
    expect(mocks.loadConfig).toHaveBeenCalledTimes(1);
    expect(mocks.loadChannelConfigs).toHaveBeenCalledTimes(1);
    expect(mocks.installmentFindMany).toHaveBeenCalledTimes(1);
  });

  it('bail non actif : LEASE_NOT_ACTIVE ; sans TenantClient : NO_CURRENT_TENANT', async () => {
    mocks.installmentFindMany.mockResolvedValue([
      row('a', { leaseStatus: 'ENDED' }),
      { ...row('b'), lease: { ...row('b').lease, primary_renter_client_id: null } }
    ]);
    const [a, b] = await planReminders('tenant-A', ['a', 'b'], { now: NOW });
    expect(a.item.exclusions).toContain('LEASE_NOT_ACTIVE');
    expect(b.item.exclusions).toContain('NO_CURRENT_TENANT');
    expect(b.item.tenantClientId).toBeNull();
    expect(b.item.channels).toEqual([]);
  });

  it('EVENT_DISABLED et NO_CONTACT_CHANNEL viennent de planChannels', async () => {
    mocks.installmentFindMany.mockResolvedValue([row('a')]);
    mocks.planChannels.mockReturnValue({ channels: [], reason: 'EVENT_DISABLED' });
    expect((await planReminders('tenant-A', ['a'], { now: NOW }))[0].item.exclusions).toEqual(['EVENT_DISABLED']);
    mocks.planChannels.mockReturnValue({ channels: [], reason: 'NO_ELIGIBLE_CHANNEL' });
    expect((await planReminders('tenant-A', ['a'], { now: NOW }))[0].item.exclusions).toEqual(['NO_CONTACT_CHANNEL']);
  });

  it('echeance annulee ou soldee : ALREADY_PAID ; brouillon a venir : NOT_DUE_YET', async () => {
    mocks.installmentFindMany.mockResolvedValue([
      row('a', { status: 'CANCELED' }),
      row('b', { amount_paid: 100000 }),
      row('c', { status: 'DRAFT', due_date: new Date(NOW.getTime() + 2 * DAY) })
    ]);
    const [a, b, c] = await planReminders('tenant-A', ['a', 'b', 'c'], { now: NOW });
    expect(a.item.exclusions).toContain('ALREADY_PAID');
    expect(b.item.exclusions).toContain('ALREADY_PAID');
    expect(c.item.exclusions).toContain('NOT_DUE_YET');
  });

  it('rattache les tentatives en ligne par installmentIds.includes', async () => {
    mocks.installmentFindMany.mockResolvedValue([row('a'), row('b')]);
    mocks.checkoutFindMany.mockResolvedValue([{ installmentIds: ['b'], status: 'REVIEW', createdAt: daysAgo(3) }]);
    const [a, b] = await planReminders('tenant-A', ['a', 'b'], { now: NOW });
    expect(a.item.exclusions).toEqual([]);
    expect(b.item.exclusions).toEqual(['PENDING_ONLINE_ATTEMPT']);
  });

  it('passerelle inutilisable : paymentLinkIncluded faux', async () => {
    mocks.installmentFindMany.mockResolvedValue([row('a')]);
    mocks.loadConfig.mockResolvedValue({ usable: true, mode: 'SIMULATOR' });
    expect((await planReminders('tenant-A', ['a'], { now: NOW }))[0].item.paymentLinkIncluded).toBe(false);
  });
});

describe('buildReminderPreview', () => {
  beforeEach(defaultMocks);

  it('groupes par bail, totaux, requete filtree par tenant et bail actif', async () => {
    mocks.installmentFindMany.mockResolvedValue([
      row('a', { due_date: daysAgo(40), amount_rent: 50000 }),
      row('b', { due_date: daysAgo(10), amount_rent: 70000 }),
      row('c', { lease_id: 'lease-2', client: 'client-2', lease_number: 'BAIL-002', amount_rent: 30000 })
    ]);
    mocks.reminderFindMany.mockResolvedValue([{ installment_id: 'c', level: 1, status: 'SENT', sent_at: daysAgo(2) }]);
    const preview = await buildReminderPreview('tenant-A', {}, NOW);

    const where = mocks.installmentFindMany.mock.calls[0][0].where;
    expect(where.tenant_id).toBe('tenant-A');
    expect(where.lease).toMatchObject({ tenant_id: 'tenant-A', status: 'ACTIVE' });
    expect(preview.groups).toHaveLength(2);
    expect(preview.groups[0]).toMatchObject({ leaseId: 'lease-1', totalDue: 120000 });
    expect(preview.groups[1].items[0].exclusions).toEqual(['TOO_SOON']);
    expect(preview.totals).toEqual({ eligible: 2, excluded: 1, amountDue: 120000 });
  });

  it('eligibleOnly retire les lignes exclues', async () => {
    mocks.installmentFindMany.mockResolvedValue([row('a'), row('c', { lease_id: 'lease-2', client: 'client-2' })]);
    mocks.reminderFindMany.mockResolvedValue([{ installment_id: 'c', level: 1, status: 'SENT', sent_at: daysAgo(2) }]);
    const preview = await buildReminderPreview('tenant-A', { eligibleOnly: true }, NOW);
    expect(preview.groups.flatMap(g => g.items.map(i => i.installmentId))).toEqual(['a']);
    expect(preview.totals.excluded).toBe(0);
  });

  it('ignore brouillons a venir, soldes et retard inferieur a minDaysLate', async () => {
    mocks.installmentFindMany.mockResolvedValue([
      row('draft', { status: 'DRAFT', due_date: new Date(NOW.getTime() + DAY) }),
      row('paid', { amount_paid: 100000 }),
      row('late2', { due_date: daysAgo(2) }),
      row('late20', { due_date: daysAgo(20) })
    ]);
    const preview = await buildReminderPreview('tenant-A', { daysBefore: 5, minDaysLate: 5 }, NOW);
    expect(preview.groups.flatMap(g => g.items.map(i => i.installmentId))).toEqual(['late20']);
  });

  it('search insensible a la casse (locataire, bail, bien)', async () => {
    mocks.installmentFindMany.mockResolvedValue([
      row('a', { title: 'Villa Cocody' }),
      row('c', { lease_id: 'lease-2', client: 'client-2', lease_number: 'BAIL-002', title: 'Studio Plateau' })
    ]);
    const byTenant = await buildReminderPreview('tenant-A', { search: 'KOFFI' }, NOW);
    expect(byTenant.groups.map(g => g.leaseId)).toEqual(['lease-2']);
    const byProperty = await buildReminderPreview('tenant-A', { search: 'cocody' }, NOW);
    expect(byProperty.groups.map(g => g.leaseId)).toEqual(['lease-1']);
    const byLease = await buildReminderPreview('tenant-A', { search: 'bail-002' }, NOW);
    expect(byLease.groups.map(g => g.leaseId)).toEqual(['lease-2']);
  });

  it('plafonne a MAX_PREVIEW_ITEMS', async () => {
    mocks.installmentFindMany.mockResolvedValue(
      Array.from({ length: MAX_PREVIEW_ITEMS + 20 }, (_, i) => row(`i-${i}`))
    );
    const preview = await buildReminderPreview('tenant-A', {}, NOW);
    expect(preview.groups.reduce((n, g) => n + g.items.length, 0)).toBe(MAX_PREVIEW_ITEMS);
  });

  it('installmentId : une seule ligne, exclusions hors fenetre incluses, eligibleOnly ignore', async () => {
    mocks.installmentFindMany.mockResolvedValue([row('a', { due_date: daysAgo(-60) })]);
    const preview = await buildReminderPreview(
      'tenant-A',
      { installmentId: 'a', eligibleOnly: true, minDaysLate: 30 },
      NOW
    );
    expect(preview.groups).toHaveLength(1);
    expect(preview.groups[0].items).toHaveLength(1);
    expect(preview.groups[0].items[0]).toMatchObject({ installmentId: 'a', eligible: false });
    expect(preview.groups[0].items[0].exclusions).toContain('NOT_DUE_YET');
    expect(preview.totals).toMatchObject({ eligible: 0, excluded: 1 });
    expect(mocks.installmentFindMany.mock.calls[0][0].where.tenant_id).toBe('tenant-A');
  });

  it('installmentId dune autre agence : NotFoundError', async () => {
    mocks.installmentFindMany.mockResolvedValue([]);
    await expect(buildReminderPreview('tenant-A', { installmentId: 'zzz' }, NOW)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('leaseId ou propertyId dune autre agence : NotFoundError', async () => {
    mocks.leaseFindFirst.mockResolvedValue(null);
    await expect(buildReminderPreview('tenant-A', { leaseId: 'x' }, NOW)).rejects.toBeInstanceOf(NotFoundError);
    expect(mocks.leaseFindFirst.mock.calls[0][0].where).toEqual({ id: 'x', tenant_id: 'tenant-A' });
    mocks.propertyFindFirst.mockResolvedValue(null);
    await expect(buildReminderPreview('tenant-A', { propertyId: 'p' }, NOW)).rejects.toBeInstanceOf(NotFoundError);
    expect(mocks.propertyFindFirst.mock.calls[0][0].where).toEqual({ id: 'p', tenantId: 'tenant-A' });
    expect(mocks.installmentFindMany).not.toHaveBeenCalled();
  });
});
