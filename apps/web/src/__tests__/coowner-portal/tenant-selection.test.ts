import { describe, it, expect } from 'vitest';
import { isPortalClientType, selectTenants } from '../../utils/tenant-selection';

/**
 * Un compte créé par l'invitation au portail copropriétaire n'a qu'un
 * rattachement `CO_OWNER` : il doit être retenu comme client de portail
 * (sinon la coquille ne lui trouve aucun persona) et proposé au sélecteur
 * d'agence.
 */
describe('sélection de l’agence d’un copropriétaire', () => {
  const agence = (id: string) => ({ id, name: `Agence ${id}`, slug: id });

  it('reconnaît CO_OWNER comme type de client de portail, pas BUYER', () => {
    expect(isPortalClientType('CO_OWNER')).toBe(true);
    expect(isPortalClientType('OWNER')).toBe(true);
    expect(isPortalClientType('RENTER')).toBe(true);
    expect(isPortalClientType('BUYER')).toBe(false);
  });

  it('retient le rattachement CO_OWNER et le propose au sélecteur', () => {
    const selection = selectTenants(
      [],
      [
        { id: 'tc-1', clientType: 'CO_OWNER', tenant: agence('a') },
        { id: 'tc-2', clientType: 'CO_OWNER', tenant: agence('b') }
      ],
      'b'
    );

    expect(selection.tenantClient).toMatchObject({ id: 'tc-2', clientType: 'CO_OWNER', tenantId: 'b' });
    expect(selection.availableTenants.map(tenant => tenant.id)).toEqual(['a', 'b']);
  });
});
