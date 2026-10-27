/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 047, T018 : réglages du paiement déclaré
 * (`lib/syndics/declared-payment/settings.ts`, contrats §1.5 et §2.1).
 */

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const SYNDIC_A = '11111111-1111-4111-8111-111111111111';
const SYNDIC_B = '33333333-3333-4333-8333-333333333333';

const store = { syndicates: [] as Row[], settings: [] as Row[], numbers: [] as Row[], reads: [] as Row[] };

const mockPrisma: Row = {
  syndicate: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.syndicates.find(r => r.id === where.id && r.tenantId === where.tenantId) ?? null
    )
  },
  syndicDeclaredPaymentSettings: {
    findFirst: jest.fn(
      async ({ where }: Row) =>
        store.settings.find(r => r.tenantId === where.tenantId && r.syndicateId === where.syndicateId) ?? null
    ),
    upsert: jest.fn(async ({ where, create, update }: Row) => {
      const found = store.settings.find(r => r.syndicateId === where.syndicateId);
      if (found) return Object.assign(found, update);
      const row = {
        enabled: false,
        reviewAlertBusinessDays: 3,
        proofRequired: false,
        payerInstructions: null,
        aiPrefillEnabled: false,
        ...create
      };
      store.settings.push(row);
      return row;
    })
  },
  syndicReceivingNumber: {
    count: jest.fn(
      async ({ where }: Row) =>
        store.numbers.filter(
          r => r.tenantId === where.tenantId && r.syndicateId === where.syndicateId && r.isActive === where.isActive
        ).length
    ),
    findMany: jest.fn(async ({ where }: Row) =>
      store.numbers.filter(
        r => r.tenantId === where.tenantId && r.syndicateId === where.syndicateId && r.isActive === where.isActive
      )
    )
  },
  syndicPaymentProofRead: {
    count: jest.fn(
      async ({ where }: Row) =>
        store.reads.filter(r => r.tenantId === where.tenantId && r.createdAt >= where.createdAt.gte).length
    )
  }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const auditEvents: Row[] = [];
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (entry: Row) => auditEvents.push(entry)
}));

const featureAllowed = jest.fn();
jest.mock('../../src/lib/syndics/online-payment/feature-gate', () => ({
  isSyndicOnlinePaymentAllowed: (...args: unknown[]) => featureAllowed(...args)
}));

import {
  assertSyndicFeatureForDeclared,
  getDeclaredPaymentAvailability,
  getDeclaredPaymentRules,
  getDeclaredPaymentSettings,
  updateDeclaredPaymentSettings
} from '../../src/lib/syndics/declared-payment/settings';
import { AuditActionKey } from '../../src/types/audit-types';

const activeNumber = {
  id: 'n1',
  tenantId: TENANT_A,
  syndicateId: SYNDIC_A,
  isActive: true,
  sortOrder: 0,
  createdAt: new Date()
};
const params = (body: unknown) => ({ tenantId: TENANT_A, syndicateId: SYNDIC_A, actorUserId: 'u1', body });

beforeEach(() => {
  store.syndicates = [
    { id: SYNDIC_A, tenantId: TENANT_A },
    { id: SYNDIC_B, tenantId: TENANT_B }
  ];
  store.settings = [];
  store.numbers = [];
  store.reads = [];
  auditEvents.length = 0;
  featureAllowed.mockReset();
  featureAllowed.mockResolvedValue(true);
  mockPrisma.syndicDeclaredPaymentSettings.upsert.mockClear();
});

describe('valeurs par défaut', () => {
  it("sont renvoyées sans ligne et rien n'est écrit", async () => {
    await expect(getDeclaredPaymentRules(mockPrisma as any, TENANT_A, SYNDIC_A)).resolves.toEqual({
      enabled: false,
      reviewAlertBusinessDays: 3,
      proofRequired: false,
      payerInstructions: null,
      aiPrefillEnabled: false
    });
    const settings = await getDeclaredPaymentSettings(TENANT_A, SYNDIC_A);
    expect(settings).toMatchObject({
      syndicateId: SYNDIC_A,
      enabled: false,
      aiPrefillAvailable: false,
      aiReadsThisMonth: 0,
      aiReadsMonthlyQuota: 300,
      usable: false
    });
    expect(mockPrisma.syndicDeclaredPaymentSettings.upsert).not.toHaveBeenCalled();
  });

  it("répond 404 pour une copropriété d'une autre agence", async () => {
    await expect(getDeclaredPaymentSettings(TENANT_A, SYNDIC_B)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('updateDeclaredPaymentSettings', () => {
  it('crée la ligne, journalise les valeurs et seulement la longueur de la consigne', async () => {
    const result = await updateDeclaredPaymentSettings(
      params({ enabled: true, reviewAlertBusinessDays: 5, payerInstructions: 'Payez au 07 07 07 07 12' })
    );
    expect(result).toMatchObject({
      enabled: true,
      reviewAlertBusinessDays: 5,
      payerInstructions: 'Payez au 07 07 07 07 12'
    });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].actionKey).toBe(AuditActionKey.SYNDIC_DECLARED_PAYMENT_SETTINGS_UPDATED);
    expect(auditEvents[0].payload).toMatchObject({
      enabled: true,
      reviewAlertBusinessDays: 5,
      payerInstructionsLength: 23
    });
    expect(JSON.stringify(auditEvents[0])).not.toContain('Payez');
  });

  it('met à jour une ligne existante sans toucher aux champs absents', async () => {
    await updateDeclaredPaymentSettings(params({ enabled: true, proofRequired: true }));
    const result = await updateDeclaredPaymentSettings(
      params({ reviewAlertBusinessDays: 15, payerInstructions: null })
    );
    expect(result).toMatchObject({
      enabled: true,
      proofRequired: true,
      reviewAlertBusinessDays: 15,
      payerInstructions: null
    });
  });

  it('rejette un champ inconnu', async () => {
    await expect(updateDeclaredPaymentSettings(params({ enabled: true, aiQuota: 1 }))).rejects.toMatchObject({
      name: 'ZodError'
    });
    expect(mockPrisma.syndicDeclaredPaymentSettings.upsert).not.toHaveBeenCalled();
  });

  it.each([[16], [0], [2.5], ['3']])('rejette un délai de relance de %p', async days => {
    await expect(updateDeclaredPaymentSettings(params({ reviewAlertBusinessDays: days }))).rejects.toMatchObject({
      name: 'ZodError'
    });
  });

  it('rejette une consigne de plus de 500 caractères', async () => {
    await expect(updateDeclaredPaymentSettings(params({ payerInstructions: 'x'.repeat(501) }))).rejects.toMatchObject({
      name: 'ZodError'
    });
    await expect(updateDeclaredPaymentSettings(params({ payerInstructions: 'x'.repeat(500) }))).resolves.toBeDefined();
  });

  it("répond 404 pour une copropriété d'une autre agence", async () => {
    await expect(
      updateDeclaredPaymentSettings({ ...params({ enabled: true }), syndicateId: SYNDIC_B })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('usable et lectures IA', () => {
  it('exige le réglage activé ET au moins un numéro actif', async () => {
    await updateDeclaredPaymentSettings(params({ enabled: true }));
    expect((await getDeclaredPaymentSettings(TENANT_A, SYNDIC_A)).usable).toBe(false);
    store.numbers.push(activeNumber);
    expect((await getDeclaredPaymentSettings(TENANT_A, SYNDIC_A)).usable).toBe(true);
    await updateDeclaredPaymentSettings(params({ enabled: false }));
    expect((await getDeclaredPaymentSettings(TENANT_A, SYNDIC_A)).usable).toBe(false);
  });

  it("compte les lectures IA de l'agence ce mois-ci (UTC) seulement", async () => {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    store.reads.push(
      { tenantId: TENANT_A, createdAt: now },
      { tenantId: TENANT_A, createdAt: startOfMonth },
      { tenantId: TENANT_A, createdAt: new Date(startOfMonth.getTime() - 1) },
      { tenantId: TENANT_B, createdAt: now }
    );
    expect((await getDeclaredPaymentSettings(TENANT_A, SYNDIC_A)).aiReadsThisMonth).toBe(2);
  });
});

describe('getDeclaredPaymentAvailability', () => {
  it('est disponible quand activé, avec un numéro actif et le droit SYNDIC', async () => {
    await updateDeclaredPaymentSettings(params({ enabled: true }));
    store.numbers.push(activeNumber);
    const result = await getDeclaredPaymentAvailability(TENANT_A, SYNDIC_A);
    expect(result.available).toBe(true);
    expect(result.receivingNumbers.map(n => n.id)).toEqual(['n1']);
  });

  it.each([
    ['réglage désactivé', { enabled: false }, true, true],
    ['aucun numéro actif', { enabled: true }, false, true],
    ['droit SYNDIC refusé', { enabled: true }, true, false]
  ])('est indisponible : %s', async (_label, body, withNumber, allowed) => {
    await updateDeclaredPaymentSettings(params(body));
    if (withNumber) store.numbers.push(activeNumber);
    featureAllowed.mockResolvedValue(allowed);
    expect((await getDeclaredPaymentAvailability(TENANT_A, SYNDIC_A)).available).toBe(false);
  });

  it('assertSyndicFeatureForDeclared lève 403 SYNDIC_FEATURE_DENIED sans le droit', async () => {
    featureAllowed.mockResolvedValue(false);
    await expect(assertSyndicFeatureForDeclared(TENANT_A)).rejects.toMatchObject({
      statusCode: 403,
      code: 'SYNDIC_FEATURE_DENIED'
    });
    featureAllowed.mockResolvedValue(true);
    await expect(assertSyndicFeatureForDeclared(TENANT_A)).resolves.toBeUndefined();
  });
});
