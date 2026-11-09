/**
 * Garde « déclaration en attente » du paiement en ligne locatif (contrat 049 §2.8 d) : test de
 * `assertNoPendingDeclaration` lui-même (jamais mocké ici), sur un magasin de déclarations en mémoire
 * qui applique réellement le filtre Prisma demandé (agence, bail, statut, fenêtre de 7 jours, échéance).
 */

type Row = Record<string, any>;

const store = { declarations: [] as Row[] };

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Row[]).some(sub => matches(row, sub));
    const value = row[key];
    if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('in' in condition) return condition.in.includes(value);
      if ('gte' in condition) return value >= condition.gte;
      return false;
    }
    return value === condition;
  });
}

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalPaymentDeclaration: {
      findFirst: jest.fn(async ({ where }: { where: Row }) => store.declarations.find(r => matches(r, where)) ?? null)
    }
  }
}));

import {
  assertNoPendingDeclaration,
  PENDING_DECLARATION_WINDOW_MS
} from '../../src/lib/rental/online-review/pending-declaration';

const NOW = new Date('2026-11-09T12:00:00.000Z');
const TENANT = 'tenant-a';
const LEASE = 'lease-1';
const INSTALLMENT = 'installment-1';

function declaration(overrides: Row = {}): Row {
  const row = {
    id: `decl-${store.declarations.length + 1}`,
    tenant_id: TENANT,
    lease_id: LEASE,
    installment_id: INSTALLMENT,
    status: 'PENDING',
    created_at: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    ...overrides
  };
  store.declarations.push(row);
  return row;
}

beforeEach(() => {
  store.declarations = [];
});

describe('assertNoPendingDeclaration', () => {
  it('sans déclaration : rien ne bloque', async () => {
    await expect(assertNoPendingDeclaration(TENANT, LEASE, [INSTALLMENT], NOW)).resolves.toBeUndefined();
  });

  it('409 sur une déclaration PENDING de moins de 7 jours couvrant l’échéance', async () => {
    declaration();
    await expect(assertNoPendingDeclaration(TENANT, LEASE, [INSTALLMENT], NOW)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT'
    });
  });

  it('409 aussi quand l’échéance n’est qu’une des échéances demandées', async () => {
    declaration();
    await expect(assertNoPendingDeclaration(TENANT, LEASE, ['autre', INSTALLMENT], NOW)).rejects.toMatchObject({
      statusCode: 409
    });
  });

  it('409 sur une déclaration sans échéance (elle couvre tout le bail)', async () => {
    declaration({ installment_id: null });
    await expect(assertNoPendingDeclaration(TENANT, LEASE, [INSTALLMENT], NOW)).rejects.toMatchObject({
      statusCode: 409
    });
  });

  it('pas de 409 au-delà de 7 jours', async () => {
    declaration({ created_at: new Date(NOW.getTime() - PENDING_DECLARATION_WINDOW_MS - 1000) });
    await expect(assertNoPendingDeclaration(TENANT, LEASE, [INSTALLMENT], NOW)).resolves.toBeUndefined();
  });

  it('409 encore juste en deçà de 7 jours', async () => {
    declaration({ created_at: new Date(NOW.getTime() - PENDING_DECLARATION_WINDOW_MS + 60_000) });
    await expect(assertNoPendingDeclaration(TENANT, LEASE, [INSTALLMENT], NOW)).rejects.toMatchObject({
      statusCode: 409
    });
  });

  it('une déclaration d’une autre agence est ignorée', async () => {
    declaration({ tenant_id: 'tenant-b' });
    await expect(assertNoPendingDeclaration(TENANT, LEASE, [INSTALLMENT], NOW)).resolves.toBeUndefined();
  });

  it('une déclaration d’un autre bail est ignorée', async () => {
    declaration({ lease_id: 'lease-2' });
    await expect(assertNoPendingDeclaration(TENANT, LEASE, [INSTALLMENT], NOW)).resolves.toBeUndefined();
  });

  it('une déclaration d’une autre échéance est ignorée', async () => {
    declaration({ installment_id: 'installment-2' });
    await expect(assertNoPendingDeclaration(TENANT, LEASE, [INSTALLMENT], NOW)).resolves.toBeUndefined();
  });

  it.each(['VALIDATED', 'REJECTED'])('une déclaration %s ne bloque pas', async status => {
    declaration({ status });
    await expect(assertNoPendingDeclaration(TENANT, LEASE, [INSTALLMENT], NOW)).resolves.toBeUndefined();
  });
});
