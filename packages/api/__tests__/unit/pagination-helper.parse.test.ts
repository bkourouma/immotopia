import { parsePagination } from '../../src/utils/pagination-helper';

describe('parsePagination', () => {
  it('applique les valeurs par défaut quand rien n’est fourni', () => {
    expect(parsePagination({}, { defaultPage: 1, defaultLimit: 20 })).toEqual({ page: 1, limit: 20 });
    expect(parsePagination(undefined)).toEqual({ page: undefined, limit: undefined });
  });

  it('refuse (400) une limit au-delà du plafond au lieu de la tronquer', () => {
    expect(() => parsePagination({ limit: '100000' }, { defaultPage: 1, defaultLimit: 20 })).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
    expect(() => parsePagination({ limit: '500' }, { defaultPage: 1, defaultLimit: 20, maxLimit: 200 })).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it.each(['1e29', '100000000000000000000000000000', '9007199254740993', '100001'])(
    'refuse une page aberrante %j (400)',
    value => {
      expect(() => parsePagination({ page: value })).toThrow(expect.objectContaining({ statusCode: 400 }));
    }
  );

  it('lit des entiers positifs ; limit 500 et 1000 acceptés tels quels', () => {
    expect(parsePagination({ limit: '500' }, { defaultPage: 1, defaultLimit: 20 }).limit).toBe(500);
    expect(parsePagination({ limit: '1000' }, { defaultPage: 1, defaultLimit: 20 }).limit).toBe(1000);
  });

  it('lit des entiers positifs', () => {
    expect(parsePagination({ page: '3', limit: '50' }, { defaultPage: 1, defaultLimit: 20 })).toEqual({
      page: 3,
      limit: 50
    });
  });

  it.each(['abc', '0', '-2', '1.5', '1e3', ' '])('rejette %j avec une BadRequestError', value => {
    expect(() => parsePagination({ page: value })).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => parsePagination({ limit: value })).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});
