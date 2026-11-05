/**
 * Listes Paiements et Déclarations de paiement : construction du `where`
 * (recherche, montants, méthode, dates) et validation des paramètres (400).
 */
const paymentFindMany = jest.fn();
const paymentCount = jest.fn();
const declFindMany = jest.fn();
const declCount = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalPayment: {
      findMany: (...a: unknown[]) => paymentFindMany(...a),
      count: (...a: unknown[]) => paymentCount(...a)
    },
    rentalPaymentDeclaration: {
      findMany: (...a: unknown[]) => declFindMany(...a),
      count: (...a: unknown[]) => declCount(...a)
    }
  }
}));

import { listPayments } from '../../src/services/rental-payment-service';
import { getPaymentDeclarations } from '../../src/services/rental-payment-declaration-service';
import {
  parsePaymentListExtras,
  parseDeclarationListExtras,
  applyPaymentListExtras
} from '../../src/lib/rental/payment-list-filters';
import { BadRequestError } from '../../src/middleware/error-middleware';

const contains = (value: string) => ({ contains: value, mode: 'insensitive' });

describe('listPayments : where', () => {
  beforeEach(() => {
    paymentFindMany.mockReset().mockResolvedValue([]);
    paymentCount.mockReset().mockResolvedValue(0);
  });
  const whereOf = () => paymentFindMany.mock.calls[0][0].where;

  it('sans filtre : seulement l agence', async () => {
    await listPayments('T1', {});
    expect(whereOf()).toEqual({ tenant_id: 'T1' });
  });

  it('recherche libre : référence, transaction, bail, bien, locataire, dans AND', async () => {
    await listPayments('T1', { search: 'diom', leaseId: 'L1' });
    const where = whereOf();
    expect(where.tenant_id).toBe('T1');
    expect(where.lease_id).toBe('L1');
    expect(where.AND).toHaveLength(1);
    const or = where.AND[0].OR;
    expect(or).toEqual(
      expect.arrayContaining([
        { psp_reference: contains('diom') },
        { psp_transaction_id: contains('diom') },
        { lease: { lease_number: contains('diom') } },
        { lease: { property: { title: contains('diom') } } },
        { lease: { primaryRenter: { user: { fullName: contains('diom') } } } },
        { renterClient: { user: { email: contains('diom') } } }
      ])
    );
    expect(where.OR).toBeUndefined();
  });

  it('une condition AND existante est conservée, jamais écrasée', () => {
    const where: any = { tenant_id: 'T1', AND: [{ status: 'SUCCESS' }] };
    applyPaymentListExtras(where, { search: 'x' });
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0]).toEqual({ status: 'SUCCESS' });
  });

  it('intervalle de montants (bornes incluses, une seule borne acceptée)', async () => {
    await listPayments('T1', { minAmount: 10, maxAmount: 50 });
    expect(whereOf().amount).toEqual({ gte: 10, lte: 50 });
    paymentFindMany.mockClear();
    await listPayments('T1', { maxAmount: 50 });
    expect(whereOf().amount).toEqual({ lte: 50 });
  });

  it('dates : début du jour et fin du jour inclusive', async () => {
    const extras = parsePaymentListExtras({ startDate: '2026-01-01', endDate: '2026-01-31' });
    await listPayments('T1', extras);
    expect(whereOf().created_at).toEqual({
      gte: new Date('2026-01-01T00:00:00.000Z'),
      lte: new Date('2026-01-31T23:59:59.999Z')
    });
  });
});

describe('parsePaymentListExtras', () => {
  it('ignore les valeurs vides et rend des bornes Date', () => {
    expect(parsePaymentListExtras({ search: '  ', startDate: '', minAmount: '' })).toEqual({});
    expect(parsePaymentListExtras({ search: ' Aya ', minAmount: '1000', endDate: '2026-02-28' })).toEqual({
      search: 'Aya',
      minAmount: 1000,
      endDate: new Date('2026-02-28T23:59:59.999Z')
    });
  });

  it('valeur invalide : 400, jamais un Invalid Date', () => {
    for (const query of [
      { startDate: 'hier' },
      { endDate: '2026-13-45' },
      { startDate: '2026-02-31' },
      { minAmount: 'abc' },
      { startDate: '2026-03-02', endDate: '2026-03-01' },
      { minAmount: '50', maxAmount: '10' },
      { search: ['a', 'b'] as unknown as string }
    ]) {
      expect(() => parsePaymentListExtras(query)).toThrow(BadRequestError);
    }
  });
});

describe('getPaymentDeclarations : where', () => {
  beforeEach(() => {
    declFindMany.mockReset().mockResolvedValue([]);
    declCount.mockReset().mockResolvedValue(0);
  });
  const whereOf = () => declFindMany.mock.calls[0][0].where;

  it('sans filtre : seulement l agence', async () => {
    await getPaymentDeclarations('T1', {});
    expect(whereOf()).toEqual({ tenant_id: 'T1' });
  });

  it('recherche : référence, bail, bien, déclarant ; méthode ; statut ; l agence reste dans le where', async () => {
    await getPaymentDeclarations('T1', { search: 'sotra', method: 'CASH' as any, status: 'PENDING' as any });
    const where = whereOf();
    expect(where.tenant_id).toBe('T1');
    expect(where.status).toBe('PENDING');
    expect(where.payment_method).toBe('CASH');
    expect(where.AND[0].OR).toEqual(
      expect.arrayContaining([
        { reference: contains('sotra') },
        { lease: { lease_number: contains('sotra') } },
        { lease: { property: { address: contains('sotra') } } },
        { declarer: { user: { fullName: contains('sotra') } } }
      ])
    );
  });

  it('dates de paiement : fin de jour incluse', async () => {
    await getPaymentDeclarations('T1', parseDeclarationListExtras({ startDate: '2026-05-01', endDate: '2026-05-31' }));
    expect(whereOf().payment_date).toEqual({
      gte: new Date('2026-05-01T00:00:00.000Z'),
      lte: new Date('2026-05-31T23:59:59.999Z')
    });
  });
});

describe('parseDeclarationListExtras', () => {
  it('accepte une méthode connue et ignore le vide', () => {
    expect(parseDeclarationListExtras({ method: 'MOBILE_MONEY', search: '' })).toEqual({ method: 'MOBILE_MONEY' });
    expect(parseDeclarationListExtras({})).toEqual({});
  });

  it('valeur invalide : 400', () => {
    expect(() => parseDeclarationListExtras({ method: 'BOGUS' })).toThrow(BadRequestError);
    expect(() => parseDeclarationListExtras({ startDate: '2026-02-31' })).toThrow(BadRequestError);
    expect(() => parseDeclarationListExtras({ endDate: 'x' })).toThrow(BadRequestError);
  });
});
