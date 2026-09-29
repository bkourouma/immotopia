/**
 * Montee de palier de l'espace particulier (lot 4D) : regles du service de
 * demarrage, application au reglement (idempotence, eligibilite), corps strict
 * du controleur et liste blanche des cibles. Prisma, le paiement et la
 * facturation sont remplaces ; le parcours reel (base + simulateur) est couvert
 * par __tests__/integration/isolation.test.ts.
 */

const mockPrisma: Record<string, any> = {
  tenant: { findUnique: jest.fn() },
  subscription: { findUnique: jest.fn(), update: jest.fn() },
  subscriptionItem: { findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
  invoice: { findFirst: jest.fn(), update: jest.fn() },
  invoiceLine: { findMany: jest.fn(), updateMany: jest.fn() },
  $queryRaw: jest.fn(async () => []),
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => mockPrisma[prop as string] })
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/platform-payment-service', () => ({
  getPlatformPaymentAvailability: jest.fn(() => ({ available: true, mode: 'SIMULATOR' })),
  startInvoiceCheckout: jest.fn()
}));
jest.mock('../../src/services/platform-invoice-service', () => ({ generateUpgradeInvoiceTx: jest.fn() }));
jest.mock('../../src/services/subscription-v2-service', () => ({
  loadCatalogItem: jest.fn(),
  syncTenantModulesTx: jest.fn(async () => ({ enabled: [], disabled: [] })),
  invalidateEntitlements: jest.fn()
}));

import { AppError } from '../../src/middleware/error-middleware';
import { logAuditEvent } from '../../src/services/audit-service';
import { getPlatformPaymentAvailability, startInvoiceCheckout } from '../../src/services/platform-payment-service';
import { generateUpgradeInvoiceTx } from '../../src/services/platform-invoice-service';
import { loadCatalogItem, syncTenantModulesTx } from '../../src/services/subscription-v2-service';
import { startSubscriptionUpgrade } from '../../src/services/subscription-upgrade/upgrade-service';
import { applyUpgradeForInvoiceTx } from '../../src/services/subscription-upgrade/apply-upgrade';
import {
  UPGRADE_TARGETS,
  buildUpgradeLineMetadata,
  isUpgradeTarget,
  readUpgradeTarget
} from '../../src/services/subscription-upgrade/constants';
import { classifyTenantRoute } from '../../src/lib/subscription/route-features';
import { upgradeBodySchema } from '../../src/controllers/subscription-upgrade-controller';

const audit = logAuditEvent as jest.Mock;
const checkout = startInvoiceCheckout as jest.Mock;
const generate = generateUpgradeInvoiceTx as jest.Mock;
const availability = getPlatformPaymentAvailability as jest.Mock;
const catalog = loadCatalogItem as jest.Mock;

const TENANT = 'tenant-p';
const USER = 'user-p';
const NOW = new Date('2026-10-05T10:00:00.000Z');

function freePacks() {
  mockPrisma.subscriptionItem.findMany.mockResolvedValue([{ catalogItem: { code: 'PARTICULIER_GRATUIT' } }]);
}

beforeEach(() => {
  jest.clearAllMocks();
  availability.mockReturnValue({ available: true, mode: 'SIMULATOR' });
  mockPrisma.tenant.findUnique.mockResolvedValue({ type: 'PARTICULIER', contactPhone: '+2250102030405' });
  mockPrisma.subscription.findUnique.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE' });
  freePacks();
  catalog.mockResolvedValue({ id: 'cat-plus', name: 'Particulier Plus', monthlyPrice: 2900, isSellable: true });
  generate.mockResolvedValue({ invoice: { id: 'inv-up' }, created: true });
  checkout.mockResolvedValue({ codePaiement: 'IMP-abc', checkoutUrl: 'http://sim/IMP-abc' });
});

describe('constantes : cible en liste blanche fermée', () => {
  it('seul PARTICULIER_PLUS est une cible', () => {
    expect([...UPGRADE_TARGETS]).toEqual(['PARTICULIER_PLUS']);
    expect(isUpgradeTarget('PARTICULIER_PLUS')).toBe(true);
    for (const bad of [
      'AGENCE',
      'PARTICULIER_GRATUIT',
      '',
      null,
      undefined,
      42,
      { toString: () => 'PARTICULIER_PLUS' }
    ]) {
      expect(isUpgradeTarget(bad)).toBe(false);
    }
  });

  it("le marqueur de ligne se relit ; une cible hors liste ou une ligne ordinaire n'est pas une facture d'upgrade", () => {
    expect(readUpgradeTarget(buildUpgradeLineMetadata('PARTICULIER_PLUS'))).toBe('PARTICULIER_PLUS');
    expect(readUpgradeTarget({ source: 'SUBSCRIPTION_UPGRADE', upgradeTo: 'AGENCE' })).toBeNull();
    expect(readUpgradeTarget({ source: 'GENERATED', code: 'PARTICULIER_PLUS' })).toBeNull();
    expect(readUpgradeTarget(null)).toBeNull();
    expect(readUpgradeTarget(['SUBSCRIPTION_UPGRADE'])).toBeNull();
  });
});

describe('corps de la route : .strict() et liste blanche', () => {
  it('accepte { target: PARTICULIER_PLUS } seulement', () => {
    expect(upgradeBodySchema.parse({ target: 'PARTICULIER_PLUS' })).toEqual({ target: 'PARTICULIER_PLUS' });
    expect(() => upgradeBodySchema.parse({})).toThrow();
    expect(() => upgradeBodySchema.parse({ target: 'AGENCE' })).toThrow();
    expect(() => upgradeBodySchema.parse({ target: 'PARTICULIER_GRATUIT' })).toThrow();
    expect(() => upgradeBodySchema.parse({ target: 'PARTICULIER_PLUS', tenantId: 'autre' })).toThrow();
    expect(() => upgradeBodySchema.parse({ target: 'PARTICULIER_PLUS', amount: 1 })).toThrow();
  });
});

describe('lecture seule', () => {
  it("la route d'upgrade est exemptée (comme les routes de paiement de facture) : on peut payer pour sortir de la lecture seule", () => {
    expect(classifyTenantRoute('/subscription/upgrade')).toBe('EXEMPT');
    expect(classifyTenantRoute('/subscription/invoices/abc/checkout')).toBe('EXEMPT');
  });
});

describe('startSubscriptionUpgrade', () => {
  it('201 : facture du prix du catalogue, paiement via startInvoiceCheckout, audit sans téléphone', async () => {
    const result = await startSubscriptionUpgrade(TENANT, 'PARTICULIER_PLUS', USER);
    expect(result).toEqual({ invoiceId: 'inv-up', checkoutUrl: 'http://sim/IMP-abc', code: 'IMP-abc' });
    expect(generate).toHaveBeenCalledWith(
      mockPrisma,
      TENANT,
      expect.objectContaining({
        subscriptionId: 'sub-1',
        target: 'PARTICULIER_PLUS',
        catalogItemId: 'cat-plus',
        monthlyPrice: 2900
      })
    );
    expect(checkout).toHaveBeenCalledWith(TENANT, 'inv-up', USER);
    const event = audit.mock.calls.map(c => c[0]).find(e => e.actionKey === 'SUBSCRIPTION_UPGRADE_STARTED');
    expect(event).toMatchObject({ tenantId: TENANT, actorUserId: USER, entityId: 'inv-up' });
    expect(JSON.stringify(event.payload)).not.toMatch(/\+225|phone|amount|2900/i);
  });

  it("ne modifie ni l'abonnement ni ses éléments (aucun changement de droits avant le paiement)", async () => {
    await startSubscriptionUpgrade(TENANT, 'PARTICULIER_PLUS', USER);
    expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    expect(mockPrisma.subscriptionItem.update).not.toHaveBeenCalled();
    expect(mockPrisma.subscriptionItem.create).not.toHaveBeenCalled();
  });

  it("403 pour un tenant qui n'est pas un espace personnel, sans rien créer", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ type: 'AGENCY', contactPhone: '+2250102030405' });
    await expect(startSubscriptionUpgrade(TENANT, 'PARTICULIER_PLUS', USER)).rejects.toMatchObject({ statusCode: 403 });
    expect(generate).not.toHaveBeenCalled();
    expect(checkout).not.toHaveBeenCalled();
  });

  it("403 quand le pack n'est pas le palier gratuit (autre pack, abonnement non actif)", async () => {
    mockPrisma.subscriptionItem.findMany.mockResolvedValue([{ catalogItem: { code: 'AGENCE' } }]);
    await expect(startSubscriptionUpgrade(TENANT, 'PARTICULIER_PLUS', USER)).rejects.toMatchObject({ statusCode: 403 });
    freePacks();
    mockPrisma.subscription.findUnique.mockResolvedValue({ id: 'sub-1', status: 'PAST_DUE' });
    await expect(startSubscriptionUpgrade(TENANT, 'PARTICULIER_PLUS', USER)).rejects.toMatchObject({ statusCode: 403 });
    expect(generate).not.toHaveBeenCalled();
  });

  it('409 ALREADY_ON_TARGET quand le pack payant est déjà en place', async () => {
    mockPrisma.subscriptionItem.findMany.mockResolvedValue([{ catalogItem: { code: 'PARTICULIER_PLUS' } }]);
    await expect(startSubscriptionUpgrade(TENANT, 'PARTICULIER_PLUS', USER)).rejects.toMatchObject({
      statusCode: 409,
      code: 'ALREADY_ON_TARGET'
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([null, '', '   '])('422 PHONE_REQUIRED pour un téléphone %p, avant toute facture', async phone => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ type: 'PARTICULIER', contactPhone: phone });
    await expect(startSubscriptionUpgrade(TENANT, 'PARTICULIER_PLUS', USER)).rejects.toMatchObject({
      statusCode: 422,
      code: 'PHONE_REQUIRED'
    });
    expect(generate).not.toHaveBeenCalled();
    expect(checkout).not.toHaveBeenCalled();
  });

  it('503 quand les paiements sont indisponibles, avant toute facture', async () => {
    availability.mockReturnValue({ available: false, mode: 'LIVE' });
    await expect(startSubscriptionUpgrade(TENANT, 'PARTICULIER_PLUS', USER)).rejects.toMatchObject({ statusCode: 503 });
    expect(generate).not.toHaveBeenCalled();
  });

  it('409 PAYMENT_IN_PROGRESS avec les données de reprise du paiement en cours', async () => {
    checkout.mockRejectedValue(
      new AppError('Un paiement en ligne est déjà en cours pour cette facture.', 409, 'CONFLICT', undefined, {
        codePaiement: 'IMP-old',
        checkoutUrl: 'http://sim/IMP-old'
      })
    );
    await expect(startSubscriptionUpgrade(TENANT, 'PARTICULIER_PLUS', USER)).rejects.toMatchObject({
      statusCode: 409,
      code: 'PAYMENT_IN_PROGRESS',
      data: { codePaiement: 'IMP-old', checkoutUrl: 'http://sim/IMP-old', invoiceId: 'inv-up' }
    });
    expect(audit).not.toHaveBeenCalled();
  });

  it('une autre erreur de paiement (409 sans reprise, 502) remonte inchangée', async () => {
    const boom = new AppError('Cette facture est déjà réglée.', 409, 'CONFLICT');
    checkout.mockRejectedValue(boom);
    await expect(startSubscriptionUpgrade(TENANT, 'PARTICULIER_PLUS', USER)).rejects.toBe(boom);
  });

  it('cible hors liste : refusée par le service lui-même (défense en profondeur)', async () => {
    await expect(startSubscriptionUpgrade(TENANT, 'AGENCE' as never, USER)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
  });
});

describe('applyUpgradeForInvoiceTx', () => {
  const input = { tenantId: TENANT, invoiceId: 'inv-up', actorUserId: USER, now: NOW };
  const marker = { id: 'l1', metadata: buildUpgradeLineMetadata('PARTICULIER_PLUS') };

  beforeEach(() => {
    mockPrisma.invoiceLine.findMany.mockResolvedValue([marker]);
    mockPrisma.invoice.findFirst.mockResolvedValue({ subscriptionId: 'sub-1' });
    mockPrisma.subscription.findUnique.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE' });
    mockPrisma.tenant.findUnique.mockResolvedValue({ type: 'PARTICULIER' });
    mockPrisma.subscriptionItem.findMany.mockResolvedValue([
      { id: 'item-free', catalogItem: { code: 'PARTICULIER_GRATUIT' } }
    ]);
    mockPrisma.subscriptionItem.create.mockResolvedValue({ id: 'item-plus' });
    catalog.mockResolvedValue({ id: 'cat-plus', monthlyPrice: 2900 });
  });

  it("facture ordinaire (sans marqueur) : aucun effet, aucune lecture de l'abonnement", async () => {
    mockPrisma.invoiceLine.findMany.mockResolvedValue([{ id: 'l', metadata: { source: 'GENERATED', code: 'AGENCE' } }]);
    expect(await applyUpgradeForInvoiceTx(mockPrisma as never, input)).toEqual({ applied: false, target: null });
    expect(mockPrisma.subscription.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.subscriptionItem.create).not.toHaveBeenCalled();
  });

  it("passe du gratuit au payant : élément gratuit terminé, payant au prix du catalogue, période d'un mois depuis le paiement", async () => {
    const result = await applyUpgradeForInvoiceTx(mockPrisma as never, input);
    expect(result).toMatchObject({ applied: true, target: 'PARTICULIER_PLUS' });
    expect(mockPrisma.subscriptionItem.update).toHaveBeenCalledWith({
      where: { id: 'item-free', tenantId: TENANT },
      data: expect.objectContaining({ status: 'ENDED', endsAt: NOW, endReason: 'UPGRADE' })
    });
    const periodEnd = new Date('2026-11-05T10:00:00.000Z');
    expect(mockPrisma.subscriptionItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT,
        catalogItemId: 'cat-plus',
        unitMonthlyPrice: 2900,
        status: 'ACTIVE',
        startsAt: NOW,
        replacesItemId: 'item-free',
        billedThrough: periodEnd
      })
    });
    expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1', tenantId: TENANT },
      data: expect.objectContaining({
        billingCycle: 'MONTHLY',
        status: 'ACTIVE',
        currentPeriodStart: NOW,
        currentPeriodEnd: periodEnd,
        nextBillingAt: periodEnd,
        pastDueAt: null
      })
    });
    expect(syncTenantModulesTx).toHaveBeenCalledTimes(1);
    // Le verrou de ligne de l'abonnement est pris avant l'écriture.
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('idempotent : déjà sur la cible, rien ne change', async () => {
    mockPrisma.subscriptionItem.findMany.mockResolvedValue([
      { id: 'item-plus', catalogItem: { code: 'PARTICULIER_PLUS' } }
    ]);
    const result = await applyUpgradeForInvoiceTx(mockPrisma as never, input);
    expect(result).toMatchObject({ applied: false, reason: 'ALREADY_ON_TARGET' });
    expect(mockPrisma.subscriptionItem.update).not.toHaveBeenCalled();
    expect(mockPrisma.subscriptionItem.create).not.toHaveBeenCalled();
    expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
  });

  it.each([
    ['tenant agence', () => mockPrisma.tenant.findUnique.mockResolvedValue({ type: 'AGENCY' })],
    [
      'abonnement PAST_DUE',
      () => mockPrisma.subscription.findUnique.mockResolvedValue({ id: 'sub-1', status: 'PAST_DUE' })
    ],
    [
      'abonnement TRIALING',
      () => mockPrisma.subscription.findUnique.mockResolvedValue({ id: 'sub-1', status: 'TRIALING' })
    ],
    [
      'facture d’un autre abonnement',
      () => mockPrisma.invoice.findFirst.mockResolvedValue({ subscriptionId: 'autre' })
    ],
    ['facture introuvable', () => mockPrisma.invoice.findFirst.mockResolvedValue(null)],
    [
      'pack autre que le gratuit',
      () => mockPrisma.subscriptionItem.findMany.mockResolvedValue([{ id: 'x', catalogItem: { code: 'AGENCE' } }])
    ]
  ])('%s : aucun changement de pack', async (_name, arrange) => {
    arrange();
    const result = await applyUpgradeForInvoiceTx(mockPrisma as never, input);
    expect(result.applied).toBe(false);
    expect(mockPrisma.subscriptionItem.create).not.toHaveBeenCalled();
    expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
  });
});
