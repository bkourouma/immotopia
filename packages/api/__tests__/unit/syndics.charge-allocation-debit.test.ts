/**
 * consumeAdvancesForDebitTx : un debit de compte consomme d'abord l'avance du lot
 * (FIFO sur `unallocatedAmount`), sans creer d'affectation.
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));

import { consumeAdvancesForDebitTx } from '../../src/lib/syndics/charge-allocation';

type Row = { id: string; paidAt: Date; createdAt: Date; unallocatedAmount: number };

function makeTx(rows: Row[]) {
  const update = jest.fn(async ({ where, data }: any) => {
    const row = rows.find(r => r.id === where.id)!;
    row.unallocatedAmount = Number(data.unallocatedAmount);
    return row;
  });
  const findMany = jest.fn(async ({ where }: any) =>
    rows
      .filter(r => r.unallocatedAmount > where.unallocatedAmount.gt)
      .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime())
      .map(r => ({ ...r }))
  );
  const create = jest.fn();
  const tx: any = { chargePayment: { findMany, update }, chargePaymentAllocation: { create, createMany: create } };
  return { tx, update, create, rows };
}

const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const total = (rows: Row[]) => rows.reduce((s, r) => s + r.unallocatedAmount, 0);

describe('consumeAdvancesForDebitTx', () => {
  it('debit inferieur a l avance : la reste diminue', async () => {
    const { tx, rows, create } = makeTx([{ id: 'p1', paidAt: day(1), createdAt: day(1), unallocatedAmount: 8000 }]);
    const consumed = await consumeAdvancesForDebitTx(tx, 'lot-1', 100000);
    expect(consumed).toBe(100000);
    expect(total(rows)).toBe(7000);
    expect(create).not.toHaveBeenCalled();
  });

  it('avance repartie sur deux paiements : consommation FIFO', async () => {
    const { tx, rows } = makeTx([
      { id: 'p2', paidAt: day(5), createdAt: day(5), unallocatedAmount: 5000 },
      { id: 'p1', paidAt: day(1), createdAt: day(1), unallocatedAmount: 3000 }
    ]);
    const consumed = await consumeAdvancesForDebitTx(tx, 'lot-1', 400000);
    expect(consumed).toBe(400000);
    expect(rows.find(r => r.id === 'p1')!.unallocatedAmount).toBe(0);
    expect(rows.find(r => r.id === 'p2')!.unallocatedAmount).toBe(4000);
  });

  it('debit superieur a l avance : avance a 0, retour = avance', async () => {
    const { tx, rows } = makeTx([
      { id: 'p1', paidAt: day(1), createdAt: day(1), unallocatedAmount: 3000 },
      { id: 'p2', paidAt: day(2), createdAt: day(2), unallocatedAmount: 5000 }
    ]);
    const consumed = await consumeAdvancesForDebitTx(tx, 'lot-1', 5000000);
    expect(consumed).toBe(800000);
    expect(total(rows)).toBe(0);
  });

  it('debit nul ou negatif, ou pas d avance : rien', async () => {
    const { tx, update, rows } = makeTx([{ id: 'p1', paidAt: day(1), createdAt: day(1), unallocatedAmount: 3000 }]);
    expect(await consumeAdvancesForDebitTx(tx, 'lot-1', 0)).toBe(0);
    expect(await consumeAdvancesForDebitTx(tx, 'lot-1', -500)).toBe(0);
    expect(update).not.toHaveBeenCalled();
    expect(total(rows)).toBe(3000);
    const empty = makeTx([]);
    expect(await consumeAdvancesForDebitTx(empty.tx, 'lot-1', 1000)).toBe(0);
    expect(empty.update).not.toHaveBeenCalled();
  });

  it('un paiement sans avance est ignore', async () => {
    const { tx, update } = makeTx([
      { id: 'p0', paidAt: day(1), createdAt: day(1), unallocatedAmount: 0 },
      { id: 'p1', paidAt: day(2), createdAt: day(2), unallocatedAmount: 2000 }
    ]);
    expect(await consumeAdvancesForDebitTx(tx, 'lot-1', 50000)).toBe(50000);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].where.id).toBe('p1');
  });
});
