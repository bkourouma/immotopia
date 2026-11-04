/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * H39 / BUG-2026-11-04-059 : un bien n'a pas deux baux en cours sur la même période.
 * Le faux `tx` interprète le `where` réellement construit par le contrôle, sur des
 * baux en mémoire : c'est ce filtre qui est vérifié, pas un mock complaisant.
 */
import { assertNoLeaseOverlapTx } from '../../src/lib/lease-lifecycle/period-overlap';

type Lease = {
  id: string;
  tenant_id: string;
  property_id: string;
  status: string;
  start_date: Date;
  end_date: Date | null;
};

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function matches(lease: any, where: any): boolean {
  return Object.entries(where).every(([key, cond]: [string, any]) => {
    if (key === 'AND') return (cond as any[]).every(c => matches(lease, c));
    if (key === 'OR') return (cond as any[]).some(c => matches(lease, c));
    const value = lease[key];
    if (cond === null) return value === null;
    if (cond instanceof Date || typeof cond !== 'object') return value === cond;
    if ('in' in cond) return cond.in.includes(value);
    if ('not' in cond) return value !== cond.not;
    if ('lt' in cond) return value !== null && value < cond.lt;
    if ('gt' in cond) return value !== null && value > cond.gt;
    return true;
  });
}

const base: Lease = {
  id: 'L1',
  tenant_id: 'A',
  property_id: 'P1',
  status: 'ACTIVE',
  start_date: d('2026-01-01'),
  end_date: d('2026-12-31')
};

function fakeTx(leases: Lease[]) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    rentalLease: {
      findFirst: jest.fn(async ({ where }: any) => leases.find(l => matches(l, where)) ?? null)
    }
  } as any;
}

const controle = (tx: any, p: Partial<Parameters<typeof assertNoLeaseOverlapTx>[1]> = {}) =>
  assertNoLeaseOverlapTx(tx, {
    tenantId: 'A',
    propertyId: 'P1',
    startDate: d('2026-06-01'),
    endDate: null,
    ...p
  });

describe('assertNoLeaseOverlapTx', () => {
  it('refuse un bail qui chevauche un bail ACTIVE (409)', async () => {
    await expect(controle(fakeTx([base]))).rejects.toMatchObject({
      statusCode: 409,
      message: 'Ce bien a déjà un bail en cours sur cette période.'
    });
  });

  it('refuse aussi face à un bail SUSPENDED, et face à un bail sans fin', async () => {
    await expect(controle(fakeTx([{ ...base, status: 'SUSPENDED' }]))).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      controle(fakeTx([{ ...base, end_date: null }]), { startDate: d('2030-01-01'), endDate: d('2031-01-01') })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('accepte un bail qui commence après la fin du bail en cours', async () => {
    await expect(controle(fakeTx([base]), { startDate: d('2027-09-01') })).resolves.toBeUndefined();
  });

  it('accepte un bail qui commence le jour où l’autre finit, et un bail qui finit avant le début de l’autre', async () => {
    await expect(controle(fakeTx([base]), { startDate: d('2026-12-31') })).resolves.toBeUndefined();
    await expect(
      controle(fakeTx([base]), { startDate: d('2025-01-01'), endDate: d('2026-01-01') })
    ).resolves.toBeUndefined();
  });

  it('ignore le bail d’une autre agence et celui d’un autre bien', async () => {
    await expect(controle(fakeTx([{ ...base, tenant_id: 'B' }]))).resolves.toBeUndefined();
    await expect(controle(fakeTx([{ ...base, property_id: 'P2' }]))).resolves.toBeUndefined();
  });

  it.each(['ENDED', 'CANCELED', 'DRAFT'])('ignore un bail %s', async status => {
    await expect(controle(fakeTx([{ ...base, status }]))).resolves.toBeUndefined();
  });

  it('exclut le bail lui-même', async () => {
    await expect(controle(fakeTx([base]), { excludeLeaseId: 'L1' })).resolves.toBeUndefined();
  });

  it('verrouille la ligne du bien avant de lire', async () => {
    const tx = fakeTx([]);
    await controle(tx);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings] = tx.$queryRaw.mock.calls[0];
    expect(strings.join('?')).toContain('FOR UPDATE');
  });
});
