/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BUG-2026-10-19-004 : une programmation « Par tantièmes » (montant fixe)
 * excluait les parkings, contrairement à l'appel direct « Tous les lots ».
 * `includeAnnexLots` (défaut vrai) aligne la programmation sur l'appel direct ;
 * faux conserve le calcul historique (lots principaux seulement).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: jest.fn(async () => undefined) },
  isEmailDeliveryConfigured: () => true
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest.fn(async () => ({ enabled: true, subjectOverride: null, bodyHtmlOverride: null }))
}));
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: jest.fn(async () => false)
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), flushAuditQueue: jest.fn() }));

import {
  createChargeSchedule,
  previewChargeSchedule,
  updateChargeSchedule
} from '../../src/lib/syndics/charge-schedules';
import { createChargeScheduleSchema, updateChargeScheduleSchema } from '../../src/lib/syndics/charge-schedule-schemas';
import type { CreateChargeScheduleInput } from '../../src/lib/syndics/charge-schedule-schemas';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT = 'tenant-a';
const SYNDIC = id(1);
const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const NOW = d('2026-10-19');

type LotSeed = [lotNumber: string, lotType: string, shares: number];

function seed(lots: LotSeed[]) {
  mockPrisma.reset();
  mockPrisma.syndicate.rows.push({
    id: SYNDIC,
    tenantId: TENANT,
    name: 'Residence',
    status: 'ACTIVE',
    lotTypeRates: null
  });
  lots.forEach(([lotNumber, lotType, shares], index) =>
    mockPrisma.syndicateLot.rows.push({
      id: id(10 + index),
      syndicateId: SYNDIC,
      lotNumber,
      lotType,
      generalShares: shares,
      syndicate: { tenantId: TENANT }
    })
  );
}

// Cas de la recette : A1 100, A2 200, C1 300 (commercial), P1 400 (parking).
const RECIPE: LotSeed[] = [
  ['A1', 'APARTMENT', 100],
  ['A2', 'APARTMENT', 200],
  ['C1', 'COMMERCIAL', 300],
  ['P1', 'PARKING', 400]
];

function input(overrides: Partial<CreateChargeScheduleInput> = {}): CreateChargeScheduleInput {
  return {
    label: 'Charges',
    frequency: 'MONTHLY',
    issueDay: 1,
    dueOffsetDays: 15,
    amountSource: 'FIXED',
    fixedAmount: 1_000_000,
    startDate: d('2026-10-01'),
    ...overrides
  };
}

async function previewAmounts(overrides: Partial<CreateChargeScheduleInput> = {}) {
  const schedule = await createChargeSchedule(TENANT, SYNDIC, input(overrides), null, NOW);
  const preview = await previewChargeSchedule(TENANT, SYNDIC, schedule.id, NOW, 1);
  const period = preview.periods[0];
  return {
    schedule,
    period,
    byLot: Object.fromEntries(period.lots.map(lot => [lot.lotNumber, lot.amount])),
    total: period.lots.reduce((sum, lot) => sum + lot.amount, 0)
  };
}

describe('programmation par tantièmes : lots annexes', () => {
  it('création sans le champ : vrai, parking inclus comme l appel direct', async () => {
    seed(RECIPE);
    const { schedule, byLot, total } = await previewAmounts();
    expect(schedule.includeAnnexLots).toBe(true);
    expect(mockPrisma.syndicChargeSchedule.rows[0].includeAnnexLots).toBe(true);
    expect(byLot).toEqual({ A1: 100_000, A2: 200_000, C1: 300_000, P1: 400_000 });
    expect(total).toBe(1_000_000);
  });

  it('faux : calcul historique, parking exclu', async () => {
    seed(RECIPE);
    const { schedule, byLot, total } = await previewAmounts({ includeAnnexLots: false });
    expect(schedule.includeAnnexLots).toBe(false);
    expect(byLot).toEqual({ A1: 166_666.66, A2: 333_333.33, C1: 500_000.01 });
    expect(Math.round(total * 100) / 100).toBe(1_000_000);
  });

  it('vrai : caves incluses, lot à 0 tantième exclu, somme exacte', async () => {
    seed([
      ['A1', 'APARTMENT', 1],
      ['A2', 'APARTMENT', 1],
      ['K1', 'CELLAR', 1],
      ['O1', 'OTHER', 0]
    ]);
    const { byLot, total } = await previewAmounts({ fixedAmount: 1000 });
    expect(Object.keys(byLot).sort()).toEqual(['A1', 'A2', 'K1']);
    expect(byLot.K1).toBe(334); // le dernier lot absorbe le reste
    expect(total).toBe(1000);
  });

  it('vrai : aucun tantième nulle part, la période est en échec explicite', async () => {
    seed([['A1', 'APARTMENT', 0]]);
    const { period } = await previewAmounts();
    expect(period.error).toBeTruthy();
    expect(period.lots).toEqual([]);
  });

  it('EQUAL : le champ est ignoré', async () => {
    seed(RECIPE);
    const { byLot } = await previewAmounts({ allocationMethod: 'EQUAL', includeAnnexLots: false });
    expect(byLot).toEqual({ A1: 250_000, A2: 250_000, C1: 250_000, P1: 250_000 });
  });

  it('modification : le champ change l aperçu, absent il est conservé', async () => {
    seed(RECIPE);
    const created = await createChargeSchedule(TENANT, SYNDIC, input(), null, NOW);
    const updated = await updateChargeSchedule(TENANT, SYNDIC, created.id, { includeAnnexLots: false }, NOW);
    expect(updated.includeAnnexLots).toBe(false);
    const preview = await previewChargeSchedule(TENANT, SYNDIC, created.id, NOW, 1);
    expect(preview.periods[0].lots.map(lot => lot.lotNumber)).toEqual(['A1', 'A2', 'C1']);
    const renamed = await updateChargeSchedule(TENANT, SYNDIC, created.id, { label: 'Autre' }, NOW);
    expect(renamed.includeAnnexLots).toBe(false);
  });

  it('une programmation d une autre agence reste introuvable', async () => {
    seed(RECIPE);
    const created = await createChargeSchedule(TENANT, SYNDIC, input(), null, NOW);
    await expect(
      updateChargeSchedule('tenant-b', SYNDIC, created.id, { includeAnnexLots: false }, NOW)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('schémas zod et migration', () => {
  const body = {
    label: 'x',
    frequency: 'MONTHLY',
    issueDay: 1,
    dueOffsetDays: 5,
    amountSource: 'FIXED',
    fixedAmount: 10,
    startDate: '2026-10-01'
  };

  it('création : booléen facultatif, refuse un non-booléen', () => {
    expect(createChargeScheduleSchema.safeParse(body).success).toBe(true);
    expect(createChargeScheduleSchema.safeParse({ ...body, includeAnnexLots: false }).success).toBe(true);
    expect(createChargeScheduleSchema.safeParse({ ...body, includeAnnexLots: 'non' }).success).toBe(false);
  });

  it('modification : accepte includeAnnexLots seul', () => {
    expect(updateChargeScheduleSchema.safeParse({ includeAnnexLots: true }).success).toBe(true);
  });

  it('migration : colonne ajoutée, existant mis à faux', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        'prisma',
        'migrations',
        '20261020090000_syndic_programmation_lots_annexes',
        'migration.sql'
      ),
      'utf8'
    );
    expect(sql).toContain(
      'ALTER TABLE "syndic_charge_schedules" ADD COLUMN "include_annex_lots" BOOLEAN NOT NULL DEFAULT true;'
    );
    expect(sql).toContain('UPDATE "syndic_charge_schedules" SET "include_annex_lots" = false;');
    expect(sql).not.toMatch(/DROP|DELETE/i);
  });

  it('schema.prisma : champ mappé avec défaut vrai', () => {
    const schema = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
    expect(schema).toMatch(/includeAnnexLots\s+Boolean\s+@default\(true\)\s+@map\("include_annex_lots"\)/);
  });
});
