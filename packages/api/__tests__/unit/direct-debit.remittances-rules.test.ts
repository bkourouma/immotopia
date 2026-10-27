/**
 * Remises de prélèvement : règles pures (spec 042, P2, data-model §7.2 et §7.4).
 * Jours ouvrés, date de collecte, sélection des échéances (D6) et fichier GENERIC_CSV.
 * Aucune base ni horloge réelle : tout est injecté.
 */
import {
  checkCollectionDate,
  formatFrenchDate,
  parseIsoDate,
  prenotificationDeadline,
  subtractBusinessDays,
  toIsoDate,
  todayUtc
} from '../../src/lib/direct-debit/business-days';
import {
  evaluateMandate,
  remainingDue,
  roundMoney,
  type SelectionInstallment,
  type SelectionMandate
} from '../../src/lib/direct-debit/remittance-selection';
import { getFileAdapter } from '../../src/lib/direct-debit/file-formats';
import { formatCsvAmount, operationLabel } from '../../src/lib/direct-debit/file-formats/generic-csv';

const d = (iso: string) => parseIsoDate(iso) as Date;

describe('jours ouvrés et date de prénotification', () => {
  it('reconnaît une date civile et refuse les dates impossibles', () => {
    expect(toIsoDate(d('2026-10-16'))).toBe('2026-10-16');
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('16/10/2026')).toBeNull();
    expect(formatFrenchDate(d('2026-10-05'))).toBe('05/10/2026');
  });

  it('todayUtc donne minuit UTC de la date UTC de l horloge injectée', () => {
    expect(toIsoDate(todayUtc(new Date('2026-10-16T23:59:59Z')))).toBe('2026-10-16');
    expect(todayUtc(new Date('2026-10-16T23:59:59Z')).getUTCHours()).toBe(0);
  });

  it('recule en ne comptant que du lundi au vendredi', () => {
    // 2026-10-26 est un lundi : 5 jours ouvrés avant = lundi 19.
    expect(toIsoDate(subtractBusinessDays(d('2026-10-26'), 5))).toBe('2026-10-19');
    // Un week-end ne compte pas : lundi 19 moins 1 jour ouvré = vendredi 16.
    expect(toIsoDate(subtractBusinessDays(d('2026-10-19'), 1))).toBe('2026-10-16');
    expect(toIsoDate(subtractBusinessDays(d('2026-10-24'), 1))).toBe('2026-10-23');
  });

  it('0 jour de prénotification : la date limite est la date de collecte elle-même', () => {
    expect(toIsoDate(prenotificationDeadline(d('2026-10-24'), 0))).toBe('2026-10-24');
    expect(toIsoDate(prenotificationDeadline(d('2026-10-26'), 0))).toBe('2026-10-26');
  });

  it('refuse une date trop proche et donne la première date possible', () => {
    const today = d('2026-10-16'); // vendredi
    expect(checkCollectionDate(d('2026-10-23'), 5, today)).toEqual({ ok: true });
    const tooClose = checkCollectionDate(d('2026-10-20'), 5, today);
    expect(tooClose.ok).toBe(false);
    expect(tooClose.ok === false && toIsoDate(tooClose.firstPossible)).toBe('2026-10-23');
  });

  it('exige une date strictement postérieure à aujourd hui, même sans délai', () => {
    const today = d('2026-10-16');
    const sameDay = checkCollectionDate(d('2026-10-16'), 0, today);
    expect(sameDay.ok).toBe(false);
    expect(sameDay.ok === false && toIsoDate(sameDay.firstPossible)).toBe('2026-10-17');
    expect(checkCollectionDate(d('2026-10-17'), 0, today)).toEqual({ ok: true });
  });
});

const mandate = (over: Partial<SelectionMandate> = {}): SelectionMandate => ({
  maxAmount: null,
  collectionDay: null,
  leaseStatus: 'ACTIVE',
  ...over
});
const installment = (over: Partial<SelectionInstallment> = {}): SelectionInstallment => ({
  status: 'DUE',
  amountRent: 150000,
  amountService: 10000,
  amountOtherFees: 5000,
  amountPaid: 0,
  ...over
});
const evaluate = (over: {
  mandate?: SelectionMandate;
  installment?: SelectionInstallment | null;
  day?: number;
  already?: boolean;
}) =>
  evaluateMandate({
    mandate: over.mandate ?? mandate(),
    creditorCollectionDay: 5,
    collectionDayOfMonth: over.day ?? 26,
    installment: over.installment === undefined ? installment() : over.installment,
    alreadyInRemittance: over.already ?? false
  });

describe('sélection des échéances (D6)', () => {
  it('prélève le reste dû hors pénalités', () => {
    expect(remainingDue(installment())).toBe(165000);
    expect(evaluate({})).toEqual({ kind: 'SELECTED', amount: 165000, remainingDue: 165000, capped: false });
  });

  it('un paiement partiel réduit le reste dû', () => {
    expect(evaluate({ installment: installment({ status: 'PARTIAL', amountPaid: 60000 }) })).toEqual({
      kind: 'SELECTED',
      amount: 105000,
      remainingDue: 105000,
      capped: false
    });
  });

  it('applique le plafond du mandat et le signale', () => {
    expect(evaluate({ mandate: mandate({ maxAmount: 100000 }) })).toEqual({
      kind: 'SELECTED',
      amount: 100000,
      remainingDue: 165000,
      capped: true
    });
    expect(evaluate({ mandate: mandate({ maxAmount: 165000 }) })).toMatchObject({ capped: false, amount: 165000 });
    expect(evaluate({ mandate: mandate({ maxAmount: 500000 }) })).toMatchObject({ capped: false, amount: 165000 });
  });

  it('écarte avec le bon motif', () => {
    const skipped = (reason: string) => ({ kind: 'SKIPPED', reason });
    expect(evaluate({ installment: null })).toEqual(skipped('NO_INSTALLMENT'));
    expect(evaluate({ installment: installment({ status: 'PAID' }) })).toEqual(skipped('NOTHING_DUE'));
    expect(evaluate({ installment: installment({ status: 'CANCELED' }) })).toEqual(skipped('NOTHING_DUE'));
    expect(evaluate({ installment: installment({ status: 'PARTIAL', amountPaid: 165000 }) })).toEqual(
      skipped('NOTHING_DUE')
    );
    expect(evaluate({ mandate: mandate({ leaseStatus: 'SUSPENDED' }) })).toEqual(skipped('LEASE_NOT_ACTIVE'));
    expect(evaluate({ mandate: mandate({ leaseStatus: null }) })).toEqual(skipped('LEASE_NOT_ACTIVE'));
    expect(evaluate({ already: true })).toEqual(skipped('ALREADY_IN_REMITTANCE'));
  });

  it('un jour de collecte plus tard dans le mois attend une remise plus tardive', () => {
    const later = { kind: 'SKIPPED', reason: 'COLLECTION_DAY_LATER' };
    expect(evaluate({ mandate: mandate({ collectionDay: 28 }), day: 26 })).toEqual(later);
    expect(evaluate({ mandate: mandate({ collectionDay: 28 }), day: 28 }).kind).toBe('SELECTED');
    // Sans jour propre au mandat, celui du créancier (5) s applique.
    expect(evaluate({ day: 4 })).toEqual(later);
    expect(evaluate({ day: 5 }).kind).toBe('SELECTED');
  });

  it('arrondit au centime', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(remainingDue(installment({ amountRent: 100.1, amountService: 0.2, amountOtherFees: 0 }))).toBe(100.3);
  });
});

describe('fichier GENERIC_CSV', () => {
  const adapter = getFileAdapter('GENERIC_CSV');
  const line = (over: Record<string, unknown> = {}) => ({
    reference: 'PRL-2026-0001-001',
    mandateReference: 'MDT-2026-0001',
    mandateSignedAt: d('2026-09-01'),
    holderName: 'Awa Traoré',
    iban: 'CI93CI0080111301134291200589',
    amount: 150000,
    leaseNumber: 'Bail é-12',
    periodYear: 2026,
    periodMonth: 10,
    ...over
  });
  const input = (lines: ReturnType<typeof line>[]) => ({
    reference: 'PRL-2026-0001',
    creditorIdentifier: 'CI-EMET-001',
    creditorLabel: 'Compte loyers',
    collectionDate: d('2026-10-26'),
    lines
  });

  it('produit l en-tête, un BOM UTF-8, le séparateur ; et des fins de ligne CRLF', () => {
    const buffer = adapter.build(input([line(), line({ reference: 'PRL-2026-0001-002', amount: 150000.5 })]));
    expect([...buffer.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const head =
      'reference_remise;numero_emetteur;creancier;date_echeance;reference_operation;reference_mandat;date_signature_mandat;titulaire;iban;montant;devise;libelle';
    const common = 'PRL-2026-0001;CI-EMET-001;Compte loyers;2026-10-26';
    const mandate = 'MDT-2026-0001;2026-09-01;Awa Traoré;CI93CI0080111301134291200589';
    expect(buffer.toString('utf8')).toBe(
      [
        '﻿' + head,
        `${common};PRL-2026-0001-001;${mandate};150000;XOF;LOYER 10/2026 BAIL E-12`,
        `${common};PRL-2026-0001-002;${mandate};150000.50;XOF;LOYER 10/2026 BAIL E-12`
      ].join('\r\n')
    );
    expect(adapter.contentType).toBe('text/csv; charset=utf-8');
    expect(adapter.fileExtension).toBe('csv');
  });

  it('neutralise une formule dans le titulaire', () => {
    const text = adapter.build(input([line({ holderName: '=HYPERLINK(1)' })])).toString('utf8');
    expect(text).toContain(";'=HYPERLINK(1);");
    expect(text).not.toContain(';=HYPERLINK(1);');
  });

  it('formate le montant et le libellé ASCII', () => {
    expect(formatCsvAmount(150000)).toBe('150000');
    expect(formatCsvAmount(150000.5)).toBe('150000.50');
    expect(formatCsvAmount(99.999)).toBe('100');
    expect(operationLabel(3, 2026, 'Appartement Cocody — n°7')).toBe('LOYER 03/2026 APPARTEMENT COCODY N 7');
  });
});
