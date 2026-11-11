/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Montee de palier (applyUpgradeForInvoiceTx) et ancre de fin de mois : la
 * periode repart de la date du paiement, donc l'ancre memorisee est remplacee
 * par ce jour (> 28) ou supprimee. Une ancre perimee (31, posee par le palier
 * gratuit renouvele d'office) donnerait sinon une periode de 51 jours
 * (10/04 -> 31/05). Faux client de transaction, aucune base ; le renouvellement
 * est rejoue avec les fonctions pures de la tache horaire et du reglement.
 */

const mockTx: Record<string, any> = {
  tenant: { findUnique: jest.fn() },
  subscription: { findUnique: jest.fn(), update: jest.fn() },
  subscriptionItem: { findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
  invoice: { findFirst: jest.fn(), update: jest.fn() },
  invoiceLine: { findMany: jest.fn(), updateMany: jest.fn() },
  $queryRaw: jest.fn(async () => [])
};

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/services/subscription-v2-service', () => ({
  loadCatalogItem: jest.fn(async () => ({ id: 'cat-plus', monthlyPrice: 2900 })),
  syncTenantModulesTx: jest.fn(async () => ({ enabled: [], disabled: [] }))
}));

import { applyUpgradeForInvoiceTx } from '../../src/services/subscription-upgrade/apply-upgrade';
import { buildUpgradeLineMetadata } from '../../src/services/subscription-upgrade/constants';
import { addBillingPeriod, resolveBillingAnchorDay } from '../../src/lib/subscription';

const TENANT = 'tenant-p';

function seed(metadata: unknown) {
  jest.clearAllMocks();
  mockTx.invoiceLine.findMany.mockResolvedValue([
    { id: 'l1', metadata: buildUpgradeLineMetadata('PARTICULIER_PLUS'), unitPrice: 2900 }
  ]);
  mockTx.invoice.findFirst.mockResolvedValue({ subscriptionId: 'sub-1' });
  mockTx.subscription.findUnique.mockResolvedValue({
    id: 'sub-1',
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    metadata
  });
  mockTx.tenant.findUnique.mockResolvedValue({ type: 'PARTICULIER' });
  mockTx.subscriptionItem.findMany.mockResolvedValue([
    { id: 'item-free', catalogItem: { code: 'PARTICULIER_GRATUIT' } }
  ]);
  mockTx.subscriptionItem.create.mockResolvedValue({ id: 'item-plus' });
}

async function upgradeAt(iso: string, metadata: unknown) {
  seed(metadata);
  const now = new Date(iso);
  const result = await applyUpgradeForInvoiceTx(mockTx as never, {
    tenantId: TENANT,
    invoiceId: 'inv-up',
    actorUserId: 'user-p',
    now
  });
  expect(result.applied).toBe(true);
  const data = mockTx.subscription.update.mock.calls[0][0].data;
  // Metadata effectivement en base apres la mise a jour (inchange si non ecrit).
  const storedMetadata = 'metadata' in data ? data.metadata : metadata;
  return { data, storedMetadata };
}

/** Renouvellement suivant, comme la tache horaire et le reglement. */
function nextEnd(boundary: Date, metadata: unknown) {
  return addBillingPeriod(boundary, 'MONTHLY', resolveBillingAnchorDay(metadata, boundary));
}

const iso = (date: Date) => date.toISOString();

describe('applyUpgradeForInvoiceTx : ancre remise a la date du paiement', () => {
  it('ancre perimee 31, montee le 10/03 : fin 10/04 puis 10/05 (cle supprimee, autres cles conservees)', async () => {
    const { data, storedMetadata } = await upgradeAt('2027-03-10T09:00:00.000Z', {
      billingAnchorDay: 31,
      setupWaived: true
    });
    expect(iso(data.currentPeriodStart)).toBe('2027-03-10T09:00:00.000Z');
    expect(iso(data.currentPeriodEnd)).toBe('2027-04-10T09:00:00.000Z');
    expect(data.metadata).toEqual({ setupWaived: true });
    expect(iso(nextEnd(data.currentPeriodEnd, storedMetadata))).toBe('2027-05-10T09:00:00.000Z');
  });

  it('ancre perimee 31, montee le 30/03 : ancre 30, fin 30/04 puis 30/05', async () => {
    const { data, storedMetadata } = await upgradeAt('2027-03-30T09:00:00.000Z', { billingAnchorDay: 31 });
    expect(data.metadata).toEqual({ billingAnchorDay: 30 });
    expect(iso(data.currentPeriodEnd)).toBe('2027-04-30T09:00:00.000Z');
    expect(iso(nextEnd(data.currentPeriodEnd, storedMetadata))).toBe('2027-05-30T09:00:00.000Z');
  });

  it('sans ancre, montee le 31/01 : ancre 31 posee, fin 28/02 puis 31/03', async () => {
    const { data, storedMetadata } = await upgradeAt('2027-01-31T09:00:00.000Z', { note: 'x' });
    expect(data.metadata).toEqual({ note: 'x', billingAnchorDay: 31 });
    expect(iso(data.currentPeriodEnd)).toBe('2027-02-28T09:00:00.000Z');
    expect(iso(nextEnd(data.currentPeriodEnd, storedMetadata))).toBe('2027-03-31T09:00:00.000Z');
  });

  it('ancre 31 deja juste (montee le 31/03) : metadata non reecrit', async () => {
    const { data } = await upgradeAt('2027-03-31T09:00:00.000Z', { billingAnchorDay: 31 });
    expect(data).not.toHaveProperty('metadata');
    expect(iso(data.currentPeriodEnd)).toBe('2027-04-30T09:00:00.000Z');
  });

  it('sans ancre et jour <= 28 : metadata non touche (y compris null)', async () => {
    const { data, storedMetadata } = await upgradeAt('2027-03-10T09:00:00.000Z', null);
    expect(data).not.toHaveProperty('metadata');
    expect(iso(nextEnd(data.currentPeriodEnd, storedMetadata))).toBe('2027-05-10T09:00:00.000Z');
  });
});
