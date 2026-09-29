import { describe, it, expect } from 'vitest';
import { findLeaseOwnerContactId } from './lease-owner-match';

const contacts = [
  { id: 'agent', email: 'test.agent.oi@recette.test' },
  { id: 'owner', email: 'proprio@exemple.ci', emailSecondary: 'autre@exemple.ci' }
];

describe('findLeaseOwnerContactId', () => {
  it('ne retient pas un contact du même domaine dont le nom ressemble (BUG-021)', () => {
    const property = { ownershipType: 'CLIENT', owner: { email: 'awa.konate@recette.test' } };
    expect(findLeaseOwnerContactId(property, contacts)).toBeNull();
  });

  it("laisse vide un bien de l'agence même si un propriétaire est affiché", () => {
    const property = { ownershipType: 'TENANT', owner: { email: 'proprio@exemple.ci' } };
    expect(findLeaseOwnerContactId(property, contacts)).toBeNull();
  });

  it("retient le contact à l'e-mail exact, principal ou secondaire, sans casse", () => {
    expect(
      findLeaseOwnerContactId({ ownershipType: 'CLIENT', owner: { email: ' Proprio@Exemple.ci ' } }, contacts)
    ).toBe('owner');
    expect(findLeaseOwnerContactId({ ownershipType: 'CLIENT', owner: { email: 'autre@exemple.ci' } }, contacts)).toBe(
      'owner'
    );
  });

  it('renvoie null sans propriétaire', () => {
    expect(findLeaseOwnerContactId({ ownershipType: 'CLIENT' }, contacts)).toBeNull();
    expect(findLeaseOwnerContactId(undefined, contacts)).toBeNull();
  });
});
