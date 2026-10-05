/**
 * Agences de test par pack (staging) : données et garde du seed
 * prisma/seeds/seed-pack-test-tenants.ts. Aucun accès base.
 */
import type { Request, Response } from 'express';
import { PACK, PARTICULIER_PACKS } from '../../src/lib/subscription/catalog';
import { loginSchema, validate } from '../../src/middleware/validation-middleware';
import {
  PACK_TEST_EMAIL_DOMAIN,
  PACK_TEST_MEMBERS,
  PACK_TEST_PASSWORD,
  PACK_TEST_TENANTS,
  PACK_TEST_WHATSAPP_OPTION_TENANTS,
  PACK_TEST_WHATSAPP_PHONE_PATTERN,
  PACK_TEST_WHATSAPP_REGISTRATIONS,
  STAGING_ORIGIN,
  checkPackTestTenantsGuard
} from '../../prisma/seeds/pack-test-tenants';

describe('données des agences de test par pack', () => {
  it('couvre exactement les 6 packs d’agence du catalogue, deux fois chacun (6 mois et 3 ans)', () => {
    // Les packs Particulier sont des espaces personnels (inscription libre), pas des agences à provisionner.
    const catalogPacks = Object.values(PACK)
      .filter(code => !PARTICULIER_PACKS.includes(code))
      .sort();
    expect([...new Set(PACK_TEST_TENANTS.map(t => t.pack))].sort()).toEqual(catalogPacks);
    expect(PACK_TEST_TENANTS).toHaveLength(12);
    for (const pack of catalogPacks) {
      expect(
        PACK_TEST_TENANTS.filter(t => t.pack === pack)
          .map(t => t.profile)
          .sort()
      ).toEqual(['3y', '6m']);
    }
    expect(catalogPacks).toHaveLength(6);
  });

  it('a des noms d’agence, noms et e-mails uniques', () => {
    for (const key of ['tenantName', 'adminName', 'adminEmail'] as const) {
      const values = PACK_TEST_TENANTS.map(t => t[key]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('place tous les e-mails sur le domaine .test réservé', () => {
    for (const t of PACK_TEST_TENANTS) {
      expect(t.adminEmail.endsWith(`@${PACK_TEST_EMAIL_DOMAIN}`)).toBe(true);
      expect(t.adminEmail).toBe(t.adminEmail.toLowerCase());
    }
  });

  it('crée un opérateur pour INTEGRE et une agence pour les autres packs', () => {
    for (const t of PACK_TEST_TENANTS) {
      expect(t.tenantType).toBe(t.pack === PACK.INTEGRE ? 'OPERATOR' : 'AGENCY');
    }
  });

  it('traverse la validation de la route de connexion inchangé (e-mail .test et mot de passe)', () => {
    for (const t of PACK_TEST_TENANTS) {
      const req = { body: { email: t.adminEmail, password: PACK_TEST_PASSWORD } } as Request;
      const next = jest.fn();
      validate(loginSchema)(req, {} as Response, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.body).toEqual({ email: t.adminEmail, password: PACK_TEST_PASSWORD });
    }
  });
});

describe('comptes de recette du contrôle du stock (lot 040)', () => {
  it('rattache chaque compte à une agence 6 mois Promoteur ou Opérateur intégré existante', () => {
    for (const member of PACK_TEST_MEMBERS) {
      const tenant = PACK_TEST_TENANTS.find(t => t.tenantName === member.tenantName);
      expect(tenant).toBeDefined();
      expect(tenant!.profile).toBe('6m');
      expect([PACK.PROMOTEUR, PACK.INTEGRE]).toContain(tenant!.pack);
    }
  });

  it('porte exactement les six comptes attendus (dont deux chefs de chantier du lot 041), au domaine .test', () => {
    expect(PACK_TEST_MEMBERS.map(m => `${m.email}:${m.roleKey}`).sort()).toEqual(
      [
        `chef-integre@${PACK_TEST_EMAIL_DOMAIN}:TENANT_SITE_MANAGER`,
        `chef-promoteur@${PACK_TEST_EMAIL_DOMAIN}:TENANT_SITE_MANAGER`,
        `comptable-promoteur@${PACK_TEST_EMAIL_DOMAIN}:TENANT_ACCOUNTANT`,
        `magasinier-integre@${PACK_TEST_EMAIL_DOMAIN}:TENANT_STOREKEEPER`,
        `magasinier-promoteur@${PACK_TEST_EMAIL_DOMAIN}:TENANT_STOREKEEPER`,
        `responsable-integre@${PACK_TEST_EMAIL_DOMAIN}:TENANT_ADMIN`
      ].sort()
    );
  });

  it('a des e-mails uniques, distincts de ceux des administrateurs, acceptés par la connexion', () => {
    const emails = [...PACK_TEST_MEMBERS.map(m => m.email), ...PACK_TEST_TENANTS.map(t => t.adminEmail)];
    expect(new Set(emails).size).toBe(emails.length);
    for (const member of PACK_TEST_MEMBERS) {
      const req = { body: { email: member.email, password: PACK_TEST_PASSWORD } } as Request;
      const next = jest.fn();
      validate(loginSchema)(req, {} as Response, next);
      expect(next).toHaveBeenCalledWith();
    }
  });
});

describe('inscriptions WhatsApp de recette (lot 041, plan §7.6)', () => {
  const PROMOTEUR_6M = PACK_TEST_TENANTS.find(t => t.pack === PACK.PROMOTEUR && t.profile === '6m')!.tenantName;
  const INTEGRE_6M = PACK_TEST_TENANTS.find(t => t.pack === PACK.INTEGRE && t.profile === '6m')!.tenantName;

  it('inscrit le chef de chantier de chacune des deux agences 6 mois, aux numéros fictifs attendus', () => {
    expect(PACK_TEST_WHATSAPP_REGISTRATIONS.map(r => `${r.tenantName}|${r.memberEmail}|${r.phoneE164}`).sort()).toEqual(
      [
        `${PROMOTEUR_6M}|chef-promoteur@${PACK_TEST_EMAIL_DOMAIN}|+2250100000101`,
        `${INTEGRE_6M}|chef-integre@${PACK_TEST_EMAIL_DOMAIN}|+2250100000102`
      ].sort()
    );
  });

  it('chaque inscription vise un Chef de chantier de la même agence', () => {
    for (const registration of PACK_TEST_WHATSAPP_REGISTRATIONS) {
      const member = PACK_TEST_MEMBERS.find(m => m.email === registration.memberEmail);
      expect(member).toBeDefined();
      expect(member!.roleKey).toBe('TENANT_SITE_MANAGER');
      expect(member!.tenantName).toBe(registration.tenantName);
    }
  });

  it('numéros dans la plage fictive de recette, distincts, jamais un vrai numéro', () => {
    const phones = PACK_TEST_WHATSAPP_REGISTRATIONS.map(r => r.phoneE164);
    expect(new Set(phones).size).toBe(phones.length);
    for (const phone of phones) expect(phone).toMatch(PACK_TEST_WHATSAPP_PHONE_PATTERN);
    expect(PACK_TEST_WHATSAPP_PHONE_PATTERN.test('+2250712345678')).toBe(false);
  });

  it('le bloc EXT_INVENTAIRE_WHATSAPP va au Promoteur seul (option absente sur l’Intégré)', () => {
    expect([...PACK_TEST_WHATSAPP_OPTION_TENANTS]).toEqual([PROMOTEUR_6M]);
    expect(PACK_TEST_WHATSAPP_OPTION_TENANTS).not.toContain(INTEGRE_6M);
  });
});

describe('garde du seed des agences de test', () => {
  const stagingOrigin = [STAGING_ORIGIN, STAGING_ORIGIN];

  it('refuse sans le drapeau, même sur le staging', () => {
    const r = checkPackTestTenantsGuard({ allowFlag: undefined, nodeEnv: 'production', origins: stagingOrigin });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('ALLOW_PACK_TEST_TENANTS=1');
    expect(checkPackTestTenantsGuard({ allowFlag: '0', nodeEnv: 'development', origins: [] }).ok).toBe(false);
  });

  it('refuse l’origine de production, drapeau posé, quel que soit NODE_ENV', () => {
    for (const nodeEnv of ['production', 'development']) {
      const r = checkPackTestTenantsGuard({
        allowFlag: '1',
        nodeEnv,
        origins: ['https://clients.immotopia.cloud', undefined]
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('clients.immotopia.cloud');
    }
  });

  it('refuse en production si une des deux origines n’est pas celle du staging', () => {
    expect(
      checkPackTestTenantsGuard({
        allowFlag: '1',
        nodeEnv: 'production',
        origins: [STAGING_ORIGIN, 'https://autre.exemple']
      }).ok
    ).toBe(false);
    expect(
      checkPackTestTenantsGuard({ allowFlag: '1', nodeEnv: 'production', origins: ['http://localhost:3000'] }).ok
    ).toBe(false);
    expect(checkPackTestTenantsGuard({ allowFlag: '1', nodeEnv: 'production', origins: [] }).ok).toBe(false);
  });

  it('accepte app.immotopia.cloud en production avec le drapeau', () => {
    expect(checkPackTestTenantsGuard({ allowFlag: '1', nodeEnv: 'production', origins: stagingOrigin }).ok).toBe(true);
    expect(
      checkPackTestTenantsGuard({ allowFlag: '1', nodeEnv: 'production', origins: [`${STAGING_ORIGIN}/`] }).ok
    ).toBe(true);
  });

  it('accepte hors production avec le seul drapeau', () => {
    expect(
      checkPackTestTenantsGuard({ allowFlag: '1', nodeEnv: 'development', origins: ['http://localhost:3000'] }).ok
    ).toBe(true);
    expect(checkPackTestTenantsGuard({ allowFlag: '1', nodeEnv: 'test', origins: [] }).ok).toBe(true);
  });
});
