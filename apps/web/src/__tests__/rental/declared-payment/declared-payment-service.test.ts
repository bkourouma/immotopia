import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/api-client', () => ({ default: { get: (...a: unknown[]) => get(...a) } }));

import { getRentalDeclaration } from '../../../services/rental-declared-payment-service';

describe('getRentalDeclaration', () => {
  beforeEach(() => get.mockReset());

  it('lit le DTO camelCase dans `view` de la réponse { ...ligne, view }', async () => {
    const view = { id: 'd1', alerts: [], declaredBy: { name: 'Awa' } };
    get.mockResolvedValue({ data: { success: true, data: { id: 'd1', payment_date: 'x', view } } });
    expect(await getRentalDeclaration('t1', 'd1')).toBe(view);
  });

  it('sans `view`, renvoie la donnée telle quelle', async () => {
    const dto = { id: 'd1', alerts: [] };
    get.mockResolvedValue({ data: { success: true, data: dto } });
    expect(await getRentalDeclaration('t1', 'd1')).toBe(dto);
  });
});
