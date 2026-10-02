import { describe, it, expect } from 'vitest';
import { DEV_TENANT_ACCOUNTS, PACK_EMAIL_DOMAIN, PACK_PASSWORD } from '../../dev/dev-accounts';

/**
 * Cohérence des comptes de démonstration du staging.
 *
 * Le contrat (six agences de test, un administrateur chacune, mot de passe
 * commun) est partagé avec le seed du staging côté API : ce test échoue si
 * l'un des deux côtés dérive.
 */

const PACK_GROUPS = DEV_TENANT_ACCOUNTS.filter(group => group.id.startsWith('pack-'));
const LEGACY_GROUPS = DEV_TENANT_ACCOUNTS.filter(group => !group.id.startsWith('pack-'));

describe('comptes de démonstration par pack', () => {
  it('expose les six packs, en tête, dans l’ordre attendu', () => {
    expect(PACK_GROUPS.map(group => group.id)).toEqual([
      'pack-agence',
      'pack-syndic',
      'pack-promoteur',
      'pack-integre',
      'pack-patrimoine-essentiel',
      'pack-patrimoine-pro'
    ]);
    expect(DEV_TENANT_ACCOUNTS.slice(0, 6)).toEqual(PACK_GROUPS);
    expect(PACK_GROUPS.map(group => group.label)).toEqual([
      'Pack Agence',
      'Pack Syndic',
      'Pack Promoteur',
      'Pack Opérateur intégré',
      'Pack Patrimoine Essentiel',
      'Pack Patrimoine Pro'
    ]);
    expect(PACK_GROUPS.map(group => group.name)).toEqual(PACK_GROUPS.map(group => `Test — ${group.label}`));
  });

  it('donne un administrateur par agence de test, collaborateur, au mot de passe commun', () => {
    expect(PACK_PASSWORD).toBe('PackTest@2026');
    expect(PACK_EMAIL_DOMAIN).toBe('packs.immotopia.test');
    for (const group of PACK_GROUPS) {
      expect(group.accounts).toHaveLength(1);
      const [admin] = group.accounts;
      expect(admin.password).toBe(PACK_PASSWORD);
      expect(admin.persona).toBe('Collaborateur');
      expect(admin.email.endsWith('@packs.immotopia.test')).toBe(true);
    }
  });

  it('respecte les adresses et noms du contrat avec l’API', () => {
    const rows = PACK_GROUPS.map(group => [group.accounts[0].fullName, group.accounts[0].email]);
    expect(rows).toEqual([
      ['Admin Test Agence', 'agence@packs.immotopia.test'],
      ['Admin Test Syndic', 'syndic@packs.immotopia.test'],
      ['Admin Test Promoteur', 'promoteur@packs.immotopia.test'],
      ['Admin Test Intégré', 'integre@packs.immotopia.test'],
      ['Admin Test Patrimoine Essentiel', 'patrimoine-essentiel@packs.immotopia.test'],
      ['Admin Test Patrimoine Pro', 'patrimoine-pro@packs.immotopia.test']
    ]);
  });

  it('garde les comptes historiques, sans doublon d’adresse ni d’identifiant', () => {
    expect(LEGACY_GROUPS.map(group => group.id)).toContain('platform');
    const emails = DEV_TENANT_ACCOUNTS.flatMap(group => group.accounts.map(account => account.email.toLowerCase()));
    expect(new Set(emails).size).toBe(emails.length);
    const ids = DEV_TENANT_ACCOUNTS.map(group => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of LEGACY_GROUPS) {
      for (const account of group.accounts) {
        expect(account.email.endsWith(`@${PACK_EMAIL_DOMAIN}`)).toBe(false);
      }
    }
  });
});
