import { computeRentalAlerts, installmentRemainingDue } from '../../src/lib/rental/declared-payment/declaration-alerts';

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
