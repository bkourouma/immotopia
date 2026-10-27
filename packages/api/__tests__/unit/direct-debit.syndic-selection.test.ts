/**
 * Sélection des appels de charges à prélever — spec 042, P4 (data-model §9.3).
 *
 * Règles pures (`evaluateLotMandate`) puis chargement (`evaluateSyndicCandidates`)
 * avec un faux client : les requêtes doivent être filtrées par agence ET par syndicat.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  collectableCalls,
  evaluateLotMandate,
  evaluateSyndicCandidates,
  sameCallSet,
  type SelectionCall
} from '../../src/lib/direct-debit/syndic/selection';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const COLLECTION = day('2026-11-05');

const call = (id: string, over: Partial<SelectionCall> = {}): SelectionCall => ({
  id,
  amount: 50000,
  paid: 0,
  dueDate: day('2026-10-01'),
  createdAt: new Date('2026-09-20T08:00:00Z'),
  ...over
});

const evaluate = (calls: SelectionCall[], over: Record<string, unknown> = {}) =>
  evaluateLotMandate({
    mandate: { maxAmount: null, collectionDay: null },
    creditorCollectionDay: 5,
    collectionDate: COLLECTION,
    calls,
    alreadyInRemittance: false,
    ...over
  } as any);

describe('syndic / sélection — règles pures', () => {
  it('prend les appels échus non soldés, le plus ancien d abord (échéance, création, identifiant)', () => {
    const result = evaluate([
      call('c', { dueDate: day('2026-10-15') }),
      call('b', { dueDate: day('2026-10-01'), createdAt: new Date('2026-09-25T08:00:00Z') }),
      call('a', { dueDate: day('2026-10-01'), createdAt: new Date('2026-09-25T08:00:00Z') }),
      call('z', { dueDate: day('2026-09-01') })
    ]);
    expect(result).toMatchObject({ kind: 'SELECTED', amount: 200000, remainingDue: 200000, capped: false });
    expect((result as any).chargeCallIds).toEqual(['z', 'a', 'b', 'c']);
  });

  it('ignore les appels non échus à la date de collecte, nuls ou déjà soldés', () => {
    const calls = [
      call('futur', { dueDate: day('2026-11-06') }),
      call('nul', { amount: 0 }),
      call('solde', { amount: 40000, paid: 40000 }),
      call('ok', { dueDate: day('2026-11-05') })
    ];
    expect(collectableCalls(calls, COLLECTION).map(item => item.id)).toEqual(['ok']);
  });

  it('un appel dû le jour même de la collecte, à n importe quelle heure, est échu', () => {
    const late = new Date('2026-11-05T23:30:00Z');
    expect(collectableCalls([call('soir', { dueDate: late })], COLLECTION)).toHaveLength(1);
  });

  it('le reste dû tient compte de l avance déjà imputée aux appels (paid) et des règlements partiels', () => {
    const result = evaluate([call('a', { amount: 60000, paid: 25000 }), call('b', { amount: 30000, paid: 30000 })]);
    expect(result).toMatchObject({ kind: 'SELECTED', amount: 35000, remainingDue: 35000 });
    expect((result as any).chargeCallIds).toEqual(['a']);
  });

  it('plafonne par le mandat, en gardant le reste dû complet et tous les appels', () => {
    const result = evaluate([call('a'), call('b')], { mandate: { maxAmount: 70000, collectionDay: null } });
    expect(result).toMatchObject({ kind: 'SELECTED', amount: 70000, remainingDue: 100000, capped: true });
    expect((result as any).chargeCallIds).toEqual(['a', 'b']);
  });

  it('un plafond supérieur au reste dû ne plafonne pas', () => {
    const result = evaluate([call('a')], { mandate: { maxAmount: 80000, collectionDay: null } });
    expect(result).toMatchObject({ kind: 'SELECTED', amount: 50000, capped: false });
  });

  it('motifs de non-sélection, dans l ordre : jour de collecte, rien à devoir, déjà en remise', () => {
    expect(evaluate([call('a')], { mandate: { maxAmount: null, collectionDay: 20 } })).toEqual({
      kind: 'SKIPPED',
      reason: 'COLLECTION_DAY_LATER'
    });
    expect(evaluate([call('a', { paid: 50000 })])).toEqual({ kind: 'SKIPPED', reason: 'NOTHING_DUE' });
    expect(evaluate([])).toEqual({ kind: 'SKIPPED', reason: 'NOTHING_DUE' });
    expect(evaluate([call('a')], { alreadyInRemittance: true })).toEqual({
      kind: 'SKIPPED',
      reason: 'ALREADY_IN_REMITTANCE'
    });
    // Rien à devoir l emporte sur « déjà en remise ».
    expect(evaluate([], { alreadyInRemittance: true })).toEqual({ kind: 'SKIPPED', reason: 'NOTHING_DUE' });
    // Le jour de collecte propre au mandat l emporte sur celui du créancier.
    expect(
      evaluate([call('a')], { mandate: { maxAmount: null, collectionDay: 5 }, creditorCollectionDay: 28 })
    ).toMatchObject({
      kind: 'SELECTED'
    });
  });

  it('compare deux ensembles d appels sans tenir compte de l ordre', () => {
    expect(sameCallSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameCallSet(['a', 'b'], ['a'])).toBe(false);
    expect(sameCallSet(['a'], ['b'])).toBe(false);
  });
});

describe('syndic / sélection — chargement', () => {
  const TENANT = 'tenant-a';
  const SYNDIC = 'syndic-1';

  function fakeDb(over: Record<string, unknown> = {}) {
    const mandates = [
      {
        id: 'm1',
        status: 'ACTIVE',
        year: 2026,
        sequence: 1,
        lotId: 'lot-1',
        debtorContactId: 'ct-1',
        maxAmount: null,
        collectionDay: null,
        lot: { id: 'lot-1', lotNumber: 'A12' },
        debtorContact: { id: 'ct-1', contactType: 'PERSON', firstName: 'Awa', lastName: 'Traoré', legalName: null }
      },
      {
        id: 'm2',
        status: 'ACTIVE',
        year: 2026,
        sequence: 2,
        lotId: 'lot-2',
        debtorContactId: 'ct-2',
        maxAmount: 30000,
        collectionDay: null,
        lot: { id: 'lot-2', lotNumber: 'B03' },
        debtorContact: { id: 'ct-2', contactType: 'PERSON', firstName: 'Koffi', lastName: 'Yao', legalName: null }
      },
      {
        id: 'm3',
        status: 'ACTIVE',
        year: 2026,
        sequence: 3,
        lotId: 'lot-3',
        debtorContactId: 'ct-3',
        maxAmount: null,
        collectionDay: null,
        lot: { id: 'lot-3', lotNumber: 'C01' },
        debtorContact: { id: 'ct-3', contactType: 'COMPANY', firstName: null, lastName: null, legalName: 'SCI Soleil' }
      },
      {
        id: 'm4',
        status: 'SUSPENDED',
        year: 2026,
        sequence: 4,
        lotId: 'lot-4',
        debtorContactId: 'ct-4',
        maxAmount: null,
        collectionDay: null,
        lot: { id: 'lot-4', lotNumber: 'D07' },
        debtorContact: null
      }
    ];
    const calls = [
      { id: 'c1', lotId: 'lot-1', amount: 50000, dueDate: day('2026-10-01'), createdAt: new Date('2026-09-01') },
      { id: 'c2', lotId: 'lot-1', amount: 50000, dueDate: day('2026-11-01'), createdAt: new Date('2026-09-02') },
      { id: 'c3', lotId: 'lot-2', amount: 80000, dueDate: day('2026-10-01'), createdAt: new Date('2026-09-01') },
      { id: 'c4', lotId: 'lot-3', amount: 20000, dueDate: day('2026-10-01'), createdAt: new Date('2026-09-01') }
    ];
    return {
      directDebitMandate: { findMany: jest.fn(async (..._args: any[]) => mandates) },
      chargeCall: { findMany: jest.fn(async (..._args: any[]) => calls) },
      // c1 payé pour 10 000 (dont de l avance imputée) ; c4 soldé.
      chargePaymentAllocation: {
        findMany: jest.fn(async (..._args: any[]) => [
          { chargeCallId: 'c1', amount: 6000 },
          { chargeCallId: 'c1', amount: 4000 },
          { chargeCallId: 'c4', amount: 20000 }
        ])
      },
      directDebitRemittanceLine: { findMany: jest.fn(async (..._args: any[]) => [{ lotId: 'lot-2' }]) },
      ...over
    };
  }

  it('évalue chaque mandat : montant, appels figés, plafond, soldé, déjà en remise, mandat non actif', async () => {
    const db = fakeDb();
    const result = await evaluateSyndicCandidates(
      db as any,
      TENANT,
      SYNDIC,
      { id: 'cr-1', collectionDay: 5 },
      COLLECTION,
      null
    );

    const byMandate = Object.fromEntries(result.map(candidate => [candidate.mandateId, candidate]));
    expect(byMandate.m1).toMatchObject({
      lotId: 'lot-1',
      lotNumber: 'A12',
      debtorContactId: 'ct-1',
      debtorName: 'Awa Traoré',
      mandateReference: 'MDT-2026-0001',
      // c1 : 40 000 restants (10 000 déjà imputés) ; c2 échu le 01/11 : 50 000.
      chargeCallIds: ['c1', 'c2'],
      result: { kind: 'SELECTED', amount: 90000, remainingDue: 90000, capped: false }
    });
    expect(byMandate.m1.leaseId).toBeNull();
    expect(byMandate.m1.installmentId).toBeNull();
    // Lot 2 a déjà une ligne vivante : écarté.
    expect(byMandate.m2.result).toEqual({ kind: 'SKIPPED', reason: 'ALREADY_IN_REMITTANCE' });
    // Lot 3 : appel soldé.
    expect(byMandate.m3.result).toEqual({ kind: 'SKIPPED', reason: 'NOTHING_DUE' });
    expect(byMandate.m3.debtorName).toBe('SCI Soleil');
    // Mandat suspendu : jamais de ligne.
    expect(byMandate.m4.result).toEqual({ kind: 'SKIPPED', reason: 'MANDATE_NOT_ACTIVE' });
    expect(byMandate.m4.chargeCallIds).toEqual([]);
  });

  it('filtre toutes les lectures par agence et par syndicat', async () => {
    const db = fakeDb();
    await evaluateSyndicCandidates(db as any, TENANT, SYNDIC, { id: 'cr-1', collectionDay: 5 }, COLLECTION, 'rem-own');

    expect((db.directDebitMandate.findMany.mock.calls[0] as any[])[0].where).toMatchObject({
      tenantId: TENANT,
      scope: 'SYNDIC_LOT',
      syndicateId: SYNDIC,
      creditorId: 'cr-1'
    });
    const callsWhere = (db.chargeCall.findMany.mock.calls[0] as any[])[0].where;
    expect(callsWhere).toMatchObject({ syndicateId: SYNDIC, syndicate: { tenantId: TENANT }, amount: { gt: 0 } });
    // Seuls les lots des mandats ACTIFS sont lus.
    expect(callsWhere.lotId.in.sort()).toEqual(['lot-1', 'lot-2', 'lot-3']);
    const linesWhere = (db.directDebitRemittanceLine.findMany.mock.calls[0] as any[])[0].where;
    expect(linesWhere).toMatchObject({ tenantId: TENANT, status: 'PENDING', remittanceId: { not: 'rem-own' } });
  });

  it('ne lit ni appel ni ligne quand aucun mandat n est actif, et rien sans mandat', async () => {
    const db = fakeDb({ directDebitMandate: { findMany: jest.fn(async () => []) } });
    expect(
      await evaluateSyndicCandidates(db as any, TENANT, SYNDIC, { id: 'cr-1', collectionDay: 5 }, COLLECTION, null)
    ).toEqual([]);
    expect(db.chargeCall.findMany).not.toHaveBeenCalled();
  });
});
