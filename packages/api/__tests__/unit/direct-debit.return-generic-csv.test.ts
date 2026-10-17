import { BadRequestError } from '../../src/middleware/error-middleware';
import { genericCsvReturnAdapter } from '../../src/lib/direct-debit/return-formats/generic-csv';
import { getReturnAdapter } from '../../src/lib/direct-debit/return-formats';
import { RETURN_FILE_MAX_BYTES, RETURN_FILE_MAX_ROWS } from '../../src/lib/direct-debit/return-formats/types';

const HEADER = 'reference_operation;statut;date;montant;code_rejet;motif';
const REF = 'PRL-2026-0001-001';

const parse = (content: string | Buffer) =>
  genericCsvReturnAdapter.parse(typeof content === 'string' ? Buffer.from(content, 'utf8') : content);

describe('retour banque GENERIC_CSV (data-model 8.5)', () => {
  it('est enregistré sous GENERIC_CSV', () => {
    expect(getReturnAdapter('GENERIC_CSV')).toBe(genericCsvReturnAdapter);
  });

  it('lit un règlement et un rejet complets', () => {
    const result = parse(
      [
        HEADER,
        `${REF};REGLE;2026-10-05;150000;;`,
        'PRL-2026-0001-002;REJETE;2026-10-06;85000.50;AC04;Compte clôturé'
      ].join('\n')
    );
    expect(result.errors).toEqual([]);
    expect(result.records).toEqual([
      {
        row: 2,
        operationReference: REF,
        outcome: 'SETTLED',
        date: '2026-10-05',
        amount: 150000,
        rejectionCode: null,
        rejectionReason: null
      },
      {
        row: 3,
        operationReference: 'PRL-2026-0001-002',
        outcome: 'REJECTED',
        date: '2026-10-06',
        amount: 85000.5,
        rejectionCode: 'AC04',
        rejectionReason: 'Compte clôturé'
      }
    ]);
  });

  it('accepte le BOM UTF-8', () => {
    const buffer = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(`${HEADER}\n${REF};OK;2026-10-05;100\n`, 'utf8')
    ]);
    const result = parse(buffer);
    expect(result.errors).toEqual([]);
    expect(result.records).toHaveLength(1);
  });

  it("accepte la virgule comme séparateur quand l'en-tête l'emploie", () => {
    const result = parse(`reference_operation,statut,date,montant\n${REF},OK,2026-10-05,"1234,50"\n`);
    expect(result.errors).toEqual([]);
    expect(result.records[0].amount).toBe(1234.5);
  });

  it('gère CRLF et LF mélangés, et ignore les lignes vides', () => {
    const result = parse(`${HEADER}\r\n\r\n${REF};OK;2026-10-05;100\n\n   \nPRL-2026-0001-002;KO;2026-10-05;100\r\n`);
    expect(result.errors).toEqual([]);
    expect(result.records.map(r => [r.row, r.outcome])).toEqual([
      [3, 'SETTLED'],
      [6, 'REJECTED']
    ]);
  });

  it('lit un champ cité avec séparateur, guillemet doublé et saut de ligne', () => {
    const result = parse(
      `${HEADER}\n${REF};REJETE;2026-10-05;100;AC04;"Compte; clos\nle ""15"" octobre"\nPRL-2026-0001-002;OK;2026-10-05;100\n`
    );
    expect(result.errors).toEqual([]);
    expect(result.records[0].rejectionReason).toBe('Compte; clos le "15" octobre');
    // La ligne physique tient compte du saut de ligne dans le champ cité.
    expect(result.records[1].row).toBe(4);
  });

  it("accepte des colonnes dans le désordre, des accents et des espaces dans l'en-tête", () => {
    const result = parse(
      ['Montant; Référence Opération ;DATE;Statut;Motif;Code Rejet', `1 500;${REF};2026-10-05;réglé;;`].join('\n')
    );
    expect(result.errors).toEqual([]);
    expect(result.records).toEqual([
      expect.objectContaining({ operationReference: REF, outcome: 'SETTLED', amount: 1500 })
    ]);
  });

  it('accepte les colonnes facultatives absentes', () => {
    const result = parse(`reference_operation;statut;date;montant\n${REF};PAYÉ;2026-10-05;10\n`);
    expect(result.errors).toEqual([]);
    expect(result.records[0]).toMatchObject({ rejectionCode: null, rejectionReason: null });
  });

  it.each([
    ['REGLE', 'SETTLED'],
    ['RÉGLÉ', 'SETTLED'],
    ['reglee', 'SETTLED'],
    ['Payé', 'SETTLED'],
    ['PAYE', 'SETTLED'],
    ['ok', 'SETTLED'],
    ['REJETE', 'REJECTED'],
    ['Rejeté', 'REJECTED'],
    ['REJET', 'REJECTED'],
    ['ko', 'REJECTED']
  ])('statut %s -> %s', (status, outcome) => {
    const result = parse(`${HEADER}\n${REF};${status};2026-10-05;10\n`);
    expect(result.errors).toEqual([]);
    expect(result.records[0].outcome).toBe(outcome);
  });

  it('normalise la référence (espaces, minuscules) et refuse les autres formes', () => {
    const ok = parse(`${HEADER}\n  prl-2026-0001-001  ;OK;2026-10-05;10\n`);
    expect(ok.records[0].operationReference).toBe(REF);

    const bad = parse(`${HEADER}\nPRL-26-1-1;OK;2026-10-05;10\n;OK;2026-10-05;10\n`);
    expect(bad.records).toEqual([]);
    expect(bad.errors.map(e => e.row)).toEqual([2, 3]);
  });

  it('convertit JJ/MM/AAAA et refuse les dates impossibles', () => {
    const ok = parse(`${HEADER}\n${REF};OK;05/10/2026;10\n`);
    expect(ok.records[0].date).toBe('2026-10-05');

    const bad = parse(
      [HEADER, `${REF};OK;2026-02-30;10`, `${REF};OK;31/04/2026;10`, `${REF};OK;2026/10/05;10`, `${REF};OK;;10`].join(
        '\n'
      )
    );
    expect(bad.records).toEqual([]);
    expect(bad.errors.map(e => e.row)).toEqual([2, 3, 4, 5]);
  });

  it.each([
    ['1 234,50', 1234.5],
    ['1 234,5', 1234.5],
    ['1 234.05', 1234.05],
    ['100', 100],
    ['0,01', 0.01]
  ])('montant %j -> %d', (raw, expected) => {
    const result = parse(`${HEADER}\n${REF};OK;2026-10-05;"${raw}"\n`);
    expect(result.errors).toEqual([]);
    expect(result.records[0].amount).toBe(expected);
  });

  it.each(['0', '0,00', '-10', '10,123', 'abc', '', '1,234,5', '12 3a'])('montant %j refusé', raw => {
    const result = parse(`${HEADER}\n${REF};OK;2026-10-05;"${raw}"\n`);
    expect(result.records).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
  });

  it('nettoie et tronque le code de rejet, nettoie le motif', () => {
    const longCode = 'A'.repeat(30);
    const longReason = 'x'.repeat(600);
    const result = parse(
      `${HEADER}\n${REF};KO;2026-10-05;10;"ac 04/é!";"a\u0001b\tc"\nPRL-2026-0001-002;KO;2026-10-05;10;${longCode};${longReason}\nPRL-2026-0001-003;KO;2026-10-05;10;"/ !";"  "\n`
    );
    expect(result.errors).toEqual([]);
    expect(result.records[0].rejectionCode).toBe('ac04');
    expect(result.records[0].rejectionReason).toBe('a b c');
    expect(result.records[1].rejectionCode).toBe('A'.repeat(20));
    expect(result.records[1].rejectionReason).toHaveLength(500);
    expect(result.records[2].rejectionCode).toBeNull();
    expect(result.records[2].rejectionReason).toBeNull();
  });

  it('une ligne fautive au milieu est signalée, les autres sont lues', () => {
    const result = parse(
      [
        HEADER,
        `${REF};OK;2026-10-05;10`,
        'PRL-2026-0001-002;PEUTETRE;2026-10-05;10',
        'PRL-2026-0001-003;OK;2026-10-05;10'
      ].join('\n')
    );
    expect(result.records.map(r => r.row)).toEqual([2, 4]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
    // Le message ne reprend jamais la valeur fautive.
    expect(result.errors[0].message).not.toContain('PEUTETRE');
    expect(result.errors[0].message).not.toBe('');
  });

  it('signale un guillemet non refermé sans lever', () => {
    const result = parse(`${HEADER}\n${REF};OK;2026-10-05;10\nPRL-2026-0001-002;KO;2026-10-05;10;"X;abc\n`);
    expect(result.records).toHaveLength(1);
    expect(result.errors).toEqual([expect.objectContaining({ row: 3 })]);
  });

  it.each([
    ['fichier vide', ''],
    ['lignes vides seulement', '\n\n  \n'],
    ['en-tête absent (données directement)', `${REF};OK;2026-10-05;10\n`],
    ['colonne obligatoire manquante', 'reference_operation;statut;date\nPRL-2026-0001-001;OK;2026-10-05\n']
  ])('%s : aucun enregistrement, une erreur globale à la ligne 1', (_name, content) => {
    const result = parse(content);
    expect(result.records).toEqual([]);
    expect(result.errors).toEqual([expect.objectContaining({ row: 1 })]);
  });

  it('refuse un fichier trop gros', () => {
    expect(() => parse(Buffer.alloc(RETURN_FILE_MAX_BYTES + 1, 'a'))).toThrow(BadRequestError);
  });

  it('accepte exactement le maximum de lignes et refuse une ligne de plus', () => {
    const line = `${REF};OK;2026-10-05;10`;
    const build = (count: number) => [HEADER, ...Array(count).fill(line)].join('\n');

    const atLimit = parse(build(RETURN_FILE_MAX_ROWS));
    expect(atLimit.records).toHaveLength(RETURN_FILE_MAX_ROWS);

    expect(() => parse(build(RETURN_FILE_MAX_ROWS + 1))).toThrow(BadRequestError);
  });

  it('refuse un contenu binaire', () => {
    expect(() => parse(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x01]))).toThrow(BadRequestError);
    // UTF-8 invalide (fichier en Windows-1252, par exemple).
    expect(() => parse(Buffer.from([0x72, 0xe9, 0x67, 0x6c, 0xe9]))).toThrow(BadRequestError);
  });
});
