/**
 * Listes (champ additif `view`, filtre `flagged`, tri), pending-count et
 * `pendingDeclaration` des échéances.
 */
const declFindMany = jest.fn();
const declCount = jest.fn();
const settingsFind = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalPaymentDeclaration: {
      findMany: (...a: any[]) => declFindMany(...a),
      count: (...a: any[]) => declCount(...a)
    },
    rentalDeclaredPaymentSettings: { findFirst: (...a: any[]) => settingsFind(...a) },
    rentalPayment: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) }
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/rental-installment-service', () => ({}));
jest.mock('../../src/services/rental-payment-service', () => ({}));
jest.mock('../../src/lib/treasury/accounts', () => ({}));
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({}));

import { getPaymentDeclarations } from '../../src/services/rental-payment-declaration-service';
import {
  getPendingCount,
  pendingDeclarationsByInstallment
} from '../../src/lib/rental/declared-payment/declaration-queries';

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  tenant_id: 'tenant-A',
  lease_id: 'lease-1',
  declared_by: 'client-1',
  declared_by_user_id: null,
  status: 'PENDING',
  amount: 100000,
  accepted_amount: null,
  payment_date: new Date('2026-11-08T10:00:00Z'),
  mobile_operator: 'ORANGE',
  transaction_phone: null,
  reference: 'MP123456',
  reference_normalized: 'MP123456',
  proof_file_url: null,
  ai_prefilled: false,
  ai_edited_fields: [],
  receiving_phone: null,
  receiving_number_id: null,
  notes: null,
  review_notes: null,
  correction_note: null,
  reject_reason: null,
  reviewed_at: null,
  created_at: new Date(),
  lease: { lease_number: 'B-1' },
  installment: null,
  declarer: { id: 'client-1', user: { fullName: 'Awa Traoré' } },
  receivingNumber: null,
  reviewer: null,
  proofRead: null,
  ...over
});

beforeEach(() => {
  jest.clearAllMocks();
  settingsFind.mockResolvedValue(null); // défauts : seuil de 3 jours ouvrés
});

describe('liste des déclarations', () => {
  it('chaque élément garde ses champs snake_case et gagne `view`', async () => {
    // 1er findMany : la page ; 2e : relecture pour les DTO.
    declFindMany.mockResolvedValueOnce([row('d1')]).mockResolvedValueOnce([row('d1')]);
    declCount.mockResolvedValue(1);
    const res = await getPaymentDeclarations('tenant-A', { status: 'PENDING' as any }, { page: 1, limit: 20 });
    expect(res.declarations[0]).toMatchObject({ id: 'd1', lease_id: 'lease-1', amount: 100000 });
    expect(res.declarations[0].view).toMatchObject({
      id: 'd1',
      leaseNumber: 'B-1',
      amount: 100000,
      declaredBy: { type: 'TENANT', clientId: 'client-1', name: 'Awa Traoré' },
      alerts: []
    });
    // PENDING : les plus anciennes d'abord
    expect(declFindMany.mock.calls[0][0].orderBy).toEqual({ created_at: 'asc' });
    expect(declFindMany.mock.calls[0][0].where).toMatchObject({ tenant_id: 'tenant-A', status: 'PENDING' });
  });

  it("autres statuts : les plus récentes d'abord ; filtre numéro de réception", async () => {
    declFindMany.mockResolvedValue([]);
    declCount.mockResolvedValue(0);
    await getPaymentDeclarations('tenant-A', { status: 'APPROVED' as any, receivingNumberId: 'rn-1' });
    expect(declFindMany.mock.calls[0][0].orderBy).toEqual({ created_at: 'desc' });
    expect(declFindMany.mock.calls[0][0].where).toMatchObject({ receiving_number_id: 'rn-1' });
  });

  it('flagged : seules les déclarations avec une alerte, filtrées avant la pagination', async () => {
    const old = new Date('2026-11-02T08:00:00Z'); // en retard
    declFindMany
      .mockResolvedValueOnce([{ id: 'd-ok' }, { id: 'd-late' }]) // candidats
      .mockResolvedValueOnce([row('d-ok'), row('d-late', { created_at: old })]) // DTO des candidats
      .mockResolvedValueOnce([row('d-late', { created_at: old })]) // page
      .mockResolvedValueOnce([row('d-late', { created_at: old })]); // DTO de la page
    declCount.mockResolvedValue(1);
    const res = await getPaymentDeclarations('tenant-A', { flagged: true });
    const pageWhere = declFindMany.mock.calls[2][0].where;
    expect(pageWhere.status).toBe('PENDING');
    expect(pageWhere.id).toEqual({ in: ['d-late'] });
    expect(res.declarations).toHaveLength(1);
    expect(res.declarations[0].view.overdue).toBe(true);
    expect(res.declarations[0].view.alerts.map((a: any) => a.kind)).toContain('OVERDUE');
  });
});

describe('pending-count', () => {
  it('aucune déclaration en attente : 0 / 0 sans autre requête', async () => {
    declCount.mockResolvedValue(0);
    expect(await getPendingCount('tenant-A')).toEqual({ pending: 0, overdue: 0 });
    expect(declFindMany).not.toHaveBeenCalled();
  });

  it('compte les en-attente et celles en retard (jours ouvrés), de la seule agence', async () => {
    declCount.mockResolvedValue(3);
    declFindMany.mockResolvedValue([
      { created_at: new Date('2026-11-02T08:00:00Z') },
      { created_at: new Date('2026-11-03T08:00:00Z') },
      { created_at: new Date('2026-11-09T08:00:00Z') }
    ]);
    const result = await getPendingCount('tenant-A', new Date('2026-11-09T10:00:00Z'));
    expect(result).toEqual({ pending: 3, overdue: 2 });
    expect(declCount.mock.calls[0][0].where).toEqual({ tenant_id: 'tenant-A', status: 'PENDING' });
  });
});

describe('pendingDeclaration des échéances', () => {
  it('la plus ancienne PENDING de chaque échéance, null sinon', async () => {
    declFindMany.mockResolvedValue([
      { id: 'a', installment_id: 'i1', amount: 50000, reference: 'R1', created_at: new Date('2026-11-01T00:00:00Z') },
      { id: 'b', installment_id: 'i1', amount: 60000, reference: 'R2', created_at: new Date('2026-11-02T00:00:00Z') }
    ]);
    const map = await pendingDeclarationsByInstallment('tenant-A', ['i1', 'i2']);
    expect(map.get('i1')).toEqual({
      id: 'a',
      amount: 50000,
      declaredAt: '2026-11-01T00:00:00.000Z',
      reference: 'R1'
    });
    expect(map.has('i2')).toBe(false);
    expect(declFindMany.mock.calls[0][0].where).toMatchObject({ tenant_id: 'tenant-A', status: 'PENDING' });
  });
});
