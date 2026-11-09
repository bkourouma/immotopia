const declFindMany = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: { rentalPaymentDeclaration: { findMany: (...a: any[]) => declFindMany(...a) } }
}));

import {
  computeRentalAlerts,
  findProbableDuplicates,
  installmentRemainingDue,
  isProbableDuplicateOf,
  type DuplicateProbeRow
} from '../../src/lib/rental/declared-payment/declaration-alerts';

const now = new Date('2026-11-09T10:00:00Z'); // lundi

const installment = {
  amount_rent: 100000,
  amount_service: 5000,
  amount_other_fees: 0,
  penalty_amount: 0,
  amount_paid: 25000
};

const base = {
  id: 'd1',
  status: 'PENDING',
  created_at: new Date('2026-11-09T08:00:00Z'),
  amount: 80000,
  ai_edited_fields: [] as string[],
  receiving_phone: '+2250707070707',
  installment,
  proofRead: null
};

const ctx = { now, reviewAlertBusinessDays: 3 };

describe('alertes de déclaration locative (calculées à la lecture)', () => {
  it('reste dû = échéance moins le déjà payé', () => {
    expect(installmentRemainingDue(installment)).toBe(80000);
  });

  it('montant égal au dû, récent : aucune alerte', () => {
    expect(computeRentalAlerts(base, ctx)).toEqual([]);
  });

  it('montant différent du dû : AMOUNT_DIFFERS_FROM_DUE avec le dû', () => {
    expect(computeRentalAlerts({ ...base, amount: 50000 }, ctx)).toEqual([
      { kind: 'AMOUNT_DIFFERS_FROM_DUE', due: 80000 }
    ]);
  });

  it("sans échéance : pas d'alerte de montant", () => {
    expect(computeRentalAlerts({ ...base, amount: 1, installment: null }, ctx)).toEqual([]);
  });

  it('doublon probable fourni par le contexte', () => {
    expect(computeRentalAlerts(base, { ...ctx, duplicateOfId: 'd0' })).toEqual([
      { kind: 'DUPLICATE_SUSPECTED', otherDeclarationId: 'd0' }
    ]);
  });

  it('retard en jours ouvrés (lundi vers lundi suivant = 5)', () => {
    const old = { ...base, created_at: new Date('2026-11-02T08:00:00Z') };
    expect(computeRentalAlerts(old, ctx)).toEqual([{ kind: 'OVERDUE', businessDays: 5 }]);
    // vendredi -> lundi = 1 jour ouvré : sous le seuil de 3
    const friday = { ...base, created_at: new Date('2026-11-06T08:00:00Z') };
    expect(computeRentalAlerts(friday, ctx)).toEqual([]);
  });

  it('champs IA retouchés et destinataire différent, tous statuts', () => {
    const row = {
      ...base,
      status: 'APPROVED',
      amount: 1,
      ai_edited_fields: ['amount', 'reference', 'inconnu'],
      proofRead: { result: { recipientPhone: '0101010101' } }
    };
    expect(computeRentalAlerts(row, ctx)).toEqual([
      { kind: 'AI_FIELDS_EDITED', fields: ['amount', 'reference'] },
      { kind: 'RECIPIENT_MISMATCH', recipientPhone: expect.stringContaining('0101010101') }
    ]);
  });

  it("destinataire identique au numéro de réception : pas d'alerte", () => {
    const row = { ...base, proofRead: { result: { recipientPhone: '07 07 07 07 07' } } };
    expect(computeRentalAlerts(row, ctx)).toEqual([]);
  });

  it("lecture IA illisible : jamais d'exception", () => {
    expect(computeRentalAlerts({ ...base, proofRead: { result: "n'importe quoi" } }, ctx)).toEqual([]);
  });
});

/**
 * Doublon probable vu par le gestionnaire = règle de la création (contrat §1.3,
 * BUG-2026-11-09-PLC-001) : même bail, même échéance, même montant, même jour,
 * PENDING ou APPROVED, et seule la déclaration enregistrée APRÈS l'autre est signalée.
 */
describe('doublon probable (vue gestionnaire alignée sur la création)', () => {
  const probe = (id: string, over: Partial<DuplicateProbeRow> = {}): DuplicateProbeRow => ({
    id,
    status: 'PENDING',
    amount: 100000,
    payment_date: new Date('2026-11-09T09:00:00Z'),
    lease_id: 'lease-1',
    installment_id: 'inst-09',
    created_at: new Date('2026-11-09T09:05:00Z'),
    ...over
  });
  const first = probe('rj-01', { created_at: new Date('2026-11-09T09:05:00Z') });
  const second = probe('rj-02', { created_at: new Date('2026-11-09T09:06:00Z') });

  it('la seconde déclaration (même échéance, montant, jour) est signalée, pas la première', () => {
    expect(isProbableDuplicateOf(second, first)).toBe(true);
    expect(isProbableDuplicateOf(first, second)).toBe(false);
  });

  it('une déclaration ne se signale jamais elle-même', () => {
    expect(isProbableDuplicateOf(first, first)).toBe(false);
  });

  it('pas de signalement entre deux échéances différentes', () => {
    const autreEcheance = probe('cr-01', { installment_id: 'inst-10', created_at: new Date('2026-11-09T09:07:00Z') });
    expect(isProbableDuplicateOf(autreEcheance, first)).toBe(false);
  });

  it('ni autre bail, ni autre montant, ni autre jour, ni déclaration rejetée', () => {
    const later = new Date('2026-11-09T10:00:00Z');
    expect(isProbableDuplicateOf(probe('x', { created_at: later, lease_id: 'lease-2' }), first)).toBe(false);
    expect(isProbableDuplicateOf(probe('x', { created_at: later, amount: 99000 }), first)).toBe(false);
    expect(
      isProbableDuplicateOf(probe('x', { created_at: later, payment_date: new Date('2026-11-10T09:00:00Z') }), first)
    ).toBe(false);
    expect(isProbableDuplicateOf(probe('x', { created_at: later }), { ...first, status: 'REJECTED' })).toBe(false);
  });

  it('deux déclarations sans échéance du même bail restent comparables (comme à la création)', () => {
    const a = probe('a', { installment_id: null });
    const b = probe('b', { installment_id: null, created_at: new Date('2026-11-09T09:06:00Z') });
    expect(isProbableDuplicateOf(b, a)).toBe(true);
  });

  it('même heure de création : un seul des deux est signalé', () => {
    const a = probe('a');
    const b = probe('b');
    expect([isProbableDuplicateOf(a, b), isProbableDuplicateOf(b, a)].filter(Boolean)).toHaveLength(1);
  });

  it('findProbableDuplicates : requête bornée à l’agence, aux baux et aux jours, résultat asymétrique', async () => {
    const autreEcheance = probe('cr-01', { installment_id: 'inst-10', created_at: new Date('2026-11-09T09:07:00Z') });
    declFindMany.mockResolvedValueOnce([first, second, autreEcheance]);
    const result = await findProbableDuplicates('tenant-A', [first, second, autreEcheance]);
    expect(Array.from(result.entries())).toEqual([['rj-02', 'rj-01']]);
    const where = declFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tenant_id: 'tenant-A',
      status: { in: ['PENDING', 'APPROVED'] },
      lease_id: { in: ['lease-1'] }
    });
    expect(where.payment_date).toEqual({
      gte: new Date('2026-11-09T00:00:00Z'),
      lt: new Date('2026-11-10T00:00:00Z')
    });
  });

  it('findProbableDuplicates : aucune déclaration PENDING, aucune requête', async () => {
    declFindMany.mockClear();
    const result = await findProbableDuplicates('tenant-A', [{ ...first, status: 'APPROVED' }]);
    expect(result.size).toBe(0);
    expect(declFindMany).not.toHaveBeenCalled();
  });
});
