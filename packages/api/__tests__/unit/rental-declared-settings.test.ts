/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 049, lot 1 : réglages du paiement déclaré (`lib/rental/declared-payment/settings.ts`, contrat §1.2).
 */

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const ACTOR = 'user-1';

const store = { settings: [] as Row[], activeNumbers: 0, reads: 0 };

const mockPrisma: Row = {
  rentalDeclaredPaymentSettings: {
    findFirst: jest.fn(async ({ where }: Row) => store.settings.find(r => r.tenant_id === where.tenant_id) ?? null),
    upsert: jest.fn(async ({ where, create, update }: Row) => {
      const found = store.settings.find(r => r.tenant_id === where.tenant_id);
      if (found) Object.assign(found, update);
      else store.settings.push({ ...create });
    })
  },
  rentalReceivingNumber: { count: jest.fn(async () => store.activeNumbers) },
  rentalPaymentProofRead: { count: jest.fn(async () => store.reads) }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const auditEvents: Row[] = [];
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (entry: Row) => auditEvents.push(entry)
}));

let visionConfigured = false;
jest.mock('../../src/lib/payment-proof/vision', () => ({
  isPaymentProofVisionConfigured: () => visionConfigured
}));

import {
  getSettingsDto,
  loadDeclaredPaymentSettings,
  updateSettings
} from '../../src/lib/rental/declared-payment/settings';
import { AuditActionKey } from '../../src/types/audit-types';

beforeEach(() => {
  store.settings = [];
  store.activeNumbers = 0;
  store.reads = 0;
  visionConfigured = false;
  auditEvents.length = 0;
  jest.clearAllMocks();
});

describe('défauts sans ligne (H4)', () => {
  it('loadDeclaredPaymentSettings renvoie les défauts et n’écrit rien', async () => {
    expect(await loadDeclaredPaymentSettings(TENANT_A)).toEqual({
      enabled: true,
      proofRequired: false,
      aiPrefillEnabled: false,
      reviewAlertBusinessDays: 3,
      payerInstructions: null
    });
    expect(mockPrisma.rentalDeclaredPaymentSettings.upsert).not.toHaveBeenCalled();
  });

  it('GET : défauts, quota mensuel, usable faux sans numéro actif, rien écrit', async () => {
    expect(await getSettingsDto(TENANT_A)).toMatchObject({
      enabled: true,
      proofRequired: false,
      aiPrefillEnabled: false,
      reviewAlertBusinessDays: 3,
      aiPrefillAvailable: false,
      aiReadsThisMonth: 0,
      aiReadsMonthlyQuota: 300,
      usable: false
    });
    expect(store.settings).toHaveLength(0);
  });

  it('usable devient vrai avec un numéro actif ; faux si désactivé', async () => {
    store.activeNumbers = 1;
    expect((await getSettingsDto(TENANT_A)).usable).toBe(true);
    store.settings.push({ tenant_id: TENANT_A, enabled: false });
    expect((await getSettingsDto(TENANT_A)).usable).toBe(false);
  });

  it('expose le fournisseur de vision et les lectures du mois', async () => {
    visionConfigured = true;
    store.reads = 42;
    expect(await getSettingsDto(TENANT_A)).toMatchObject({ aiPrefillAvailable: true, aiReadsThisMonth: 42 });
  });
});

describe('PUT', () => {
  it('crée la ligne à la demande, journalise les valeurs changées et renvoie le DTO', async () => {
    const dto = await updateSettings(TENANT_A, ACTOR, { proofRequired: true, reviewAlertBusinessDays: 5 });
    expect(store.settings).toHaveLength(1);
    expect(store.settings[0]).toMatchObject({
      tenant_id: TENANT_A,
      proof_required: true,
      review_alert_business_days: 5,
      updated_by_id: ACTOR
    });
    expect(dto).toMatchObject({ proofRequired: true, reviewAlertBusinessDays: 5, enabled: true });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      actionKey: AuditActionKey.RENTAL_DECLARED_PAYMENT_SETTINGS_UPDATED,
      tenantId: TENANT_A,
      payload: { proofRequired: true, reviewAlertBusinessDays: 5 }
    });
  });

  it('modifie la ligne existante ; une valeur inchangée n’est pas journalisée', async () => {
    store.settings.push({ tenant_id: TENANT_A, enabled: true, proof_required: false, review_alert_business_days: 3 });
    await updateSettings(TENANT_A, ACTOR, { enabled: false });
    expect(store.settings[0].enabled).toBe(false);
    expect(auditEvents).toHaveLength(1);
    await updateSettings(TENANT_A, ACTOR, { enabled: false });
    expect(auditEvents).toHaveLength(1);
  });

  it('les consignes payeur ne passent jamais en clair dans l’audit', async () => {
    const dto = await updateSettings(TENANT_A, ACTOR, { payerInstructions: '  Écrire le nom du locataire  ' });
    expect(store.settings[0].payer_instructions).toBe('Écrire le nom du locataire');
    expect(dto.payerInstructions).toBe('Écrire le nom du locataire');
    expect(JSON.stringify(auditEvents[0].payload)).not.toContain('locataire');
    expect(auditEvents[0].payload).toMatchObject({ payerInstructionsLength: 26 });
  });

  it.each([
    [{ reviewAlertBusinessDays: 0 }],
    [{ reviewAlertBusinessDays: 16 }],
    [{ reviewAlertBusinessDays: 2.5 }],
    [{ enabled: 'oui' }],
    [{ inconnu: true }],
    [{}]
  ])('refuse un corps invalide %j (ZodError → 400)', async body => {
    await expect(updateSettings(TENANT_A, ACTOR, body)).rejects.toMatchObject({ name: 'ZodError' });
    expect(store.settings).toHaveLength(0);
  });
});
