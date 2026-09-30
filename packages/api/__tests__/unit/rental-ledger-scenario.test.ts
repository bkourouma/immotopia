/**
 * BUG-2026-09-30-058 : comptabilité du compte locataire.
 *
 * Scénario chiffré du bus : bail à 450 000 + 30 000 de charges, trois échéances
 * de 480 000 (juillet, août, septembre), 480 000 encaissés sur juillet, 300 000
 * sur août, pénalité d'août de 9 000.
 *
 * Règle : chaque échéance exigible (émise, en retard, réglée) est débitée UNE
 * fois ; chaque encaissement crédite le compte UNE fois (net) ; rejouer un
 * événement n'écrit rien de plus. Solde attendu : 669 000 dus.
 */

type Row = Record<string, any>;

// Grand livre en mémoire : l'idempotence est celle du vrai, la clé
// (sourceType, sourceId, type).
const movements: Row[] = [];

const appendThirdPartyMovementTx = jest.fn(async (_tx: any, params: Row) => {
  const existing = movements.find(
    m => m.sourceType === params.sourceType && m.sourceId === params.sourceId && m.type === params.type
  );
  if (existing) return existing;
  const created = { id: `mv-${movements.length + 1}`, billed: 0, settled: 0, ...params };
  movements.push(created);
  return created;
});

jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: (...args: any[]) => (appendThirdPartyMovementTx as any)(...args),
  getOrCreateTenantAccountTx: jest.fn(async () => ({ id: 'acc-1', label: 'Compte', balance: 0 }))
}));

const tx: Row = {
  rentalLease: { findFirst: jest.fn(async () => ({ primary_renter_client_id: 'client-1' })) }
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: () => undefined })
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

import { inscrireEcheanceFactureeTx } from '../../src/services/rental-installment-service';
import { inscrireAllocationTx, inscrireReliquatTx } from '../../src/services/rental-payment-service';

const TENANT = 'tenant-1';

function echeance(mois: number, status: string): Row {
  return {
    id: `inst-${mois}`,
    lease_id: 'lease-1',
    status,
    due_date: new Date(2026, mois - 1, 5),
    period_year: 2026,
    period_month: mois,
    amount_rent: 450000,
    amount_service: 30000,
    amount_other_fees: 0
  };
}

const solde = () =>
  movements.reduce((s, m) => s + Number(m.billed ?? 0), 0) - movements.reduce((s, m) => s + Number(m.settled ?? 0), 0);

async function encaisser(paymentId: string, allocationId: string, montant: number, echeanceRow: Row) {
  // Encaissement : avance reçue en entier, puis affectation à l'échéance.
  await inscrireReliquatTx(tx as any, {
    tenantId: TENANT,
    accountId: 'acc-1',
    payment: { id: paymentId, amount: montant, method: 'CASH', lease_id: 'lease-1' },
    dejaAffecte: 0
  });
  await inscrireEcheanceFactureeTx(tx as any, TENANT, echeanceRow as any);
  await inscrireAllocationTx(tx as any, {
    tenantId: TENANT,
    accountId: 'acc-1',
    allocationId,
    montant,
    moyen: 'especes',
    periode: 'juillet 2026',
    leaseId: 'lease-1',
    avanceDejaCreditee: true
  });
}

beforeEach(() => {
  movements.length = 0;
  jest.clearAllMocks();
});

describe('compte du locataire — scénario du bus (669 000 dus)', () => {
  it('débite les échéances exigibles, crédite chaque encaissement une fois : solde 669 000', async () => {
    const juillet = echeance(7, 'PAID');
    const aout = echeance(8, 'PARTIAL');
    const septembre = echeance(9, 'OVERDUE');

    await encaisser('pay-1', 'alloc-1', 480000, juillet);
    await encaisser('pay-2', 'alloc-2', 300000, aout);
    await inscrireEcheanceFactureeTx(tx as any, TENANT, septembre as any);
    // Pénalité d'août (posée par le calcul des pénalités).
    await appendThirdPartyMovementTx(tx, {
      accountId: 'acc-1',
      tenantId: TENANT,
      type: 'PENALTY',
      billed: 9000,
      sourceType: 'RENTAL_PENALTY',
      sourceId: 'pen-1'
    });

    const debitsEcheances = movements.filter(m => m.type === 'INSTALLMENT');
    expect(debitsEcheances).toHaveLength(3);
    expect(debitsEcheances.reduce((s, m) => s + m.billed, 0)).toBe(1440000);
    // Chaque encaissement : l'avance reçue est reprise, il ne reste qu'UN crédit net.
    const creditNet = (id: string) =>
      movements
        .filter(m => [id, `alloc-${id.slice(-1)}`].includes(m.sourceId))
        .reduce((s, m) => s + m.settled - m.billed, 0);
    expect(creditNet('pay-1')).toBe(480000);
    expect(creditNet('pay-2')).toBe(300000);
    expect(solde()).toBe(669000);
  });

  it('une échéance Brouillon n’est pas débitée tant qu’elle n’est pas émise', async () => {
    await inscrireEcheanceFactureeTx(tx as any, TENANT, echeance(10, 'DRAFT') as any);
    expect(movements).toHaveLength(0);
  });

  it('rejouer les encaissements et les débits ne double rien', async () => {
    const juillet = echeance(7, 'PAID');
    await encaisser('pay-1', 'alloc-1', 480000, juillet);
    const avant = movements.length;
    const soldeAvant = solde();

    await encaisser('pay-1', 'alloc-1', 480000, juillet);
    await inscrireEcheanceFactureeTx(tx as any, TENANT, juillet as any);

    expect(movements).toHaveLength(avant);
    expect(solde()).toBe(soldeAvant);
  });
});
