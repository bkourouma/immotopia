import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * getOwnerClients : lecture pure de la liste des clients OWNER. Aucune écriture
 * (le rattrapage `sync-owners` n'est plus déclenché à l'ouverture d'un
 * formulaire) — BUG-2026-09-28-019 et correctif de sécurité.
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
  it('ne garde que les propriétaires et ne déclenche aucune écriture', async () => {
    const owners = await getOwnerClients('agence-1');
    expect(post).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith('/tenants/agence-1/clients');
    expect(owners.map(o => o.id)).toEqual(['c1']);
  });
});
