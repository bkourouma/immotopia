import { BadRequestError } from '../../src/middleware/error-middleware';
import { parseBooleanParam, parseEnumParam, parseIntParam, parseNumberParam } from '../../src/utils/query-params';

const STATUS = { PENDING: 'PENDING', PAID: 'PAID' } as const;

describe('parseEnumParam', () => {
  it("renvoie la valeur d'un enum Prisma", () => {
    expect(parseEnumParam('PAID', STATUS, 'status')).toBe('PAID');
  });

  it('accepte une liste de valeurs', () => {
    expect(parseEnumParam('a', ['a', 'b'] as const, 'kind')).toBe('a');
  });

  it.each([undefined, null, ''])('valeur absente %p : undefined', raw => {
    expect(parseEnumParam(raw, STATUS, 'status')).toBeUndefined();
  });

  it('refuse une valeur inconnue avec un 400 nommant le champ', () => {
    try {
      parseEnumParam('NOPE', STATUS, 'status');
      throw new Error('attendu : BadRequestError');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as BadRequestError).statusCode).toBe(400);
      expect((error as BadRequestError).errors?.[0].field).toBe('status');
    }
  });

  it('refuse un tableau et un objet (?status=A&status=B, ?status[x]=1)', () => {
    expect(() => parseEnumParam(['PAID', 'PENDING'], STATUS, 'status')).toThrow(BadRequestError);
    expect(() => parseEnumParam({ x: '1' }, STATUS, 'status')).toThrow(BadRequestError);
  });

  it('refuse une clé du prototype (constructor)', () => {
    expect(() => parseEnumParam('constructor', STATUS, 'status')).toThrow(BadRequestError);
  });
});

describe('parseIntParam', () => {
  it('lit un entier décimal', () => {
    expect(parseIntParam('12', 'year')).toBe(12);
    expect(parseIntParam('-3', 'delta')).toBe(-3);
  });

  it.each(['abc', '12abc', '1.5', '1e3', 'NaN', 'Infinity', '99999999999999999999'])('refuse %p', raw => {
    expect(() => parseIntParam(raw, 'n')).toThrow(BadRequestError);
  });

  it('absent ou vide : undefined', () => {
    expect(parseIntParam(undefined, 'n')).toBeUndefined();
    expect(parseIntParam('', 'n')).toBeUndefined();
  });

  it('applique les bornes incluses', () => {
    expect(parseIntParam('1', 'month', { min: 1, max: 12 })).toBe(1);
    expect(parseIntParam('12', 'month', { min: 1, max: 12 })).toBe(12);
    expect(() => parseIntParam('0', 'month', { min: 1, max: 12 })).toThrow(BadRequestError);
    expect(() => parseIntParam('13', 'month', { min: 1, max: 12 })).toThrow(BadRequestError);
  });

  it('refuse un tableau', () => {
    expect(() => parseIntParam(['1', '2'], 'n')).toThrow(BadRequestError);
  });
});

describe('parseNumberParam', () => {
  it('lit un décimal', () => {
    expect(parseNumberParam('12.5', 'amount')).toBe(12.5);
    expect(parseNumberParam('7', 'amount')).toBe(7);
  });

  it.each(['abc', '1,5', '1e3', '.5', 'Infinity'])('refuse %p', raw => {
    expect(() => parseNumberParam(raw, 'amount')).toThrow(BadRequestError);
  });

  it('applique les bornes', () => {
    expect(() => parseNumberParam('-1', 'amount', { min: 0 })).toThrow(BadRequestError);
  });
});

describe('parseBooleanParam', () => {
  it('lit true/false et 1/0', () => {
    expect(parseBooleanParam('true', 'f')).toBe(true);
    expect(parseBooleanParam('FALSE', 'f')).toBe(false);
    expect(parseBooleanParam('1', 'f')).toBe(true);
    expect(parseBooleanParam('0', 'f')).toBe(false);
  });

  it('refuse le reste, absent : undefined', () => {
    expect(() => parseBooleanParam('oui', 'f')).toThrow(BadRequestError);
    expect(parseBooleanParam(undefined, 'f')).toBeUndefined();
  });
});
