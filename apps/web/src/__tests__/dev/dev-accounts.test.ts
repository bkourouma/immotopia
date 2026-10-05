import { describe, it, expect } from 'vitest';
import { DEV_TENANT_ACCOUNTS, PACK_EMAIL_DOMAIN, PACK_PASSWORD } from '../../dev/dev-accounts';

/**
 * Cohérence des comptes de démonstration du staging.
 *
 * Le contrat (douze agences de test, un administrateur chacune, mot de passe
 * commun) est partagé avec le seed du staging côté API : ce test échoue si
 * l'un des deux côtés dérive.
 */

const PACK_GROUPS = DEV_TENANT_ACCOUNTS.filter(group => group.id.startsWith('pack-'));
const LEGACY_GROUPS = DEV_TENANT_ACCOUNTS.filter(group => !group.id.startsWith('pack-'));

const PACKS: Array<[string, string, string, string]> = [
  ['agence', 'Pack Agence', 'Admin Test Agence', 'agence'],
  ['syndic', 'Pack Syndic', 'Admin Test Syndic', 'syndic'],
  ['promoteur', 'Pack Promoteur', 'Admin Test Promoteur', 'promoteur'],
  ['integre', 'Pack Opérateur intégré', 'Admin Test Intégré', 'integre'],
  ['patrimoine-essentiel', 'Pack Patrimoine Essentiel', 'Admin Test Patrimoine Essentiel', 'patrimoine-essentiel'],
  ['patrimoine-pro', 'Pack Patrimoine Pro', 'Admin Test Patrimoine Pro', 'patrimoine-pro']
];

describe('comptes de démonstration par pack', () => {
  it('expose douze groupes (6 packs x 6 mois / 3 ans), en tête, dans l’ordre attendu', () => {
    expect(PACK_GROUPS.map(group => group.id)).toEqual(
      PACKS.flatMap(([slug]) => [`pack-${slug}-6m`, `pack-${slug}-3a`])
    );
    expect(PACK_GROUPS).toHaveLength(12);
    expect(DEV_TENANT_ACCOUNTS.slice(0, 12)).toEqual(PACK_GROUPS);
    expect(PACK_GROUPS.map(group => group.label)).toEqual(
      PACKS.flatMap(([, label]) => [`${label} · 6 mois`, `${label} · 3 ans`])
    );
    expect(PACK_GROUPS.map(group => group.name)).toEqual(PACK_GROUPS.map(group => `Test — ${group.label}`));
  });

  it('donne un administrateur par agence de test, collaborateur, au mot de passe commun', () => {
    expect(PACK_PASSWORD).toBe('PackTest@2026');
    expect(PACK_EMAIL_DOMAIN).toBe('packs.immotopia.test');
    for (const group of PACK_GROUPS) {
      const extra = ['pack-promoteur-6m', 'pack-integre-6m'].includes(group.id) ? 3 : 0;
      expect(group.accounts).toHaveLength(1 + extra);
      const [admin] = group.accounts;
      expect(admin.password).toBe(PACK_PASSWORD);
      expect(admin.persona).toBe('Collaborateur');
      expect(admin.email.endsWith('@packs.immotopia.test')).toBe(true);
    }
    const emails = PACK_GROUPS.map(group => group.accounts[0].email);
    expect(new Set(emails).size).toBe(12);
  });

  it('respecte les adresses et noms du contrat avec l’API', () => {
    const rows = PACK_GROUPS.map(group => [group.accounts[0].fullName, group.accounts[0].email]);
    expect(rows).toEqual(
      PACKS.flatMap(([, , name, local]) => [
        [`${name} (6 mois)`, `${local}@packs.immotopia.test`],
        [`${name} (3 ans)`, `${local}-3ans@packs.immotopia.test`]
      ])
    );
  });

  it('ajoute les comptes de recette du stock et du chef de chantier WhatsApp aux agences 6 mois Promoteur et Intégré (contrat avec l’API)', () => {
    const emailsOf = (id: string) =>
      PACK_GROUPS.find(group => group.id === id)!
        .accounts.slice(1)
        .map(account => account.email);
    expect(emailsOf('pack-promoteur-6m')).toEqual([
      'magasinier-promoteur@packs.immotopia.test',
      'comptable-promoteur@packs.immotopia.test',
      'chef-promoteur@packs.immotopia.test'
    ]);
    expect(emailsOf('pack-integre-6m')).toEqual([
      'magasinier-integre@packs.immotopia.test',
      'responsable-integre@packs.immotopia.test',
      'chef-integre@packs.immotopia.test'
    ]);
    for (const account of PACK_GROUPS.flatMap(group => group.accounts)) {
      expect(account.password).toBe(PACK_PASSWORD);
    }
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
