import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * getOwnerClients : rattrapage (POST) puis liste des seuls clients OWNER ; un
 * échec du rattrapage ne masque pas la liste (BUG-2026-09-28-019).
 */

const get = vi.fn();
const post = vi.fn();
vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) }
}));

import { getOwnerClients } from '../../services/tenant-service';

const CLIENTS = [
  { id: 'c1', clientType: 'OWNER', user: { fullName: 'Kouassi' } },
  { id: 'c2', clientType: 'RENTER', user: { fullName: 'Locataire' } }
];

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: { success: true, data: CLIENTS } });
});

describe('getOwnerClients', () => {
  it('rattrape d’abord, puis ne garde que les propriétaires', async () => {
    post.mockResolvedValue({ data: { success: true, data: { examined: 1, created: 1 } } });
    const owners = await getOwnerClients('agence-1');
    expect(post).toHaveBeenCalledWith('/tenants/agence-1/clients/sync-owners');
    expect(post.mock.invocationCallOrder[0]).toBeLessThan(get.mock.invocationCallOrder[0]);
    expect(owners.map(o => o.id)).toEqual(['c1']);
  });

  it('liste quand même si le rattrapage échoue', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    post.mockRejectedValue(new Error('403'));
    const owners = await getOwnerClients('agence-1');
    expect(owners.map(o => o.id)).toEqual(['c1']);
  });
});
