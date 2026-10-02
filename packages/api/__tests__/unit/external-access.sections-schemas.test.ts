/**
 * lib/external-access — rubriques par défaut, schémas zod, statut d'un grant.
 * Modules purs : aucune base, aucun mock.
 */

import {
  DEFAULT_SECTIONS_BY_TYPE,
  EXTERNAL_ACCESS_SECTIONS,
  defaultSectionsFor,
  normalizeSections
} from '../../src/lib/external-access/sections';
import {
  accessLogQuerySchema,
  createGrantSchema,
  sendLinkSchema,
  updateGrantSchema
} from '../../src/lib/external-access/schemas';
import { grantStatus } from '../../src/lib/external-access/service';

// `service` importe Prisma : on l'isole de toute connexion réelle.
jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

const DAY = 24 * 60 * 60 * 1000;
const FUTURE = () => new Date(Date.now() + 40 * DAY).toISOString();

const valid = () => ({
  type: 'NOTARY',
  recipientName: 'Maître Koné',
  recipientEmail: ' Notaire@Example.TEST ',
  propertyIds: ['p1', 'p1', 'p2']
});

describe('rubriques par défaut', () => {
  it('banquier, expert-comptable et notaire : exactement les ouvertures convenues, rien d’autre', () => {
    expect(defaultSectionsFor('BANKER')).toEqual(['VALUATIONS', 'YIELD_RATIOS', 'LOANS']);
    expect(defaultSectionsFor('ACCOUNTANT')).toEqual(['EXPENSES', 'RENTS', 'LOANS']);
    expect(defaultSectionsFor('NOTARY')).toEqual(['TITLES_OWNERSHIP', 'DOCUMENTS', 'VALUATIONS']);
  });

  it('chaque défaut ne contient que des rubriques connues, sans doublon', () => {
    for (const sections of Object.values(DEFAULT_SECTIONS_BY_TYPE)) {
      expect(new Set(sections).size).toBe(sections.length);
      for (const section of sections) expect(EXTERNAL_ACCESS_SECTIONS).toContain(section);
    }
  });

  it('un défaut modifié par l’appelant ne change pas la constante partagée', () => {
    const sections = defaultSectionsFor('BANKER');
    sections.push('RENTS');
    expect(defaultSectionsFor('BANKER')).toEqual(['VALUATIONS', 'YIELD_RATIOS', 'LOANS']);
  });

  it('normalizeSections dédoublonne et ordonne selon le catalogue', () => {
    expect(normalizeSections(['LOANS', 'VALUATIONS', 'LOANS'])).toEqual(['VALUATIONS', 'LOANS']);
  });
});

describe('createGrantSchema', () => {
  it('accepte une saisie valide, normalise l’e-mail et dédoublonne les biens', () => {
    const parsed = createGrantSchema.parse({ ...valid(), expiresAt: FUTURE(), linkTtlDays: 7, sendEmail: false });
    expect(parsed.recipientEmail).toBe('notaire@example.test');
    expect(parsed.propertyIds).toEqual(['p1', 'p2']);
    expect(parsed.entityIds).toEqual([]);
    expect(parsed.documentIds).toEqual([]);
    expect(parsed.expiresAt).toBeInstanceOf(Date);
    expect(parsed.sections).toBeUndefined();
  });

  it('accepte une expiration nulle (accès permanent)', () => {
    expect(createGrantSchema.parse({ ...valid(), expiresAt: null }).expiresAt).toBeNull();
  });

  it.each([
    ['sections vides', { sections: [] }],
    ['rubrique inconnue', { sections: ['EVERYTHING'] }],
    ['type inconnu', { type: 'LAWYER' }],
    ['e-mail invalide', { recipientEmail: 'pas-un-email' }],
    ['e-mail vide', { recipientEmail: '' }],
    ['nom vide', { recipientName: '   ' }],
    ['expiration passée', { expiresAt: new Date(Date.now() - DAY).toISOString() }],
    ['expiration illisible', { expiresAt: 'demain' }],
    ['champ inattendu', { tenantId: 'autre-agence' }],
    ['champ inattendu (propriétaire du grant)', { createdByUserId: 'u1' }],
    ['trop de biens', { propertyIds: Array.from({ length: 201 }, (_, i) => `p${i}`) }],
    ['identifiant de bien vide', { propertyIds: [''] }],
    ['identifiant de bien démesuré', { propertyIds: ['x'.repeat(65)] }],
    ['entité qui n’est pas un uuid', { entityIds: ['pas-un-uuid'] }],
    ['trop d’entités', { entityIds: Array.from({ length: 51 }, () => '3f2b8c0e-7a41-4d5c-9b6e-2f1a8d7c4e90') }],
    ['durée de lien nulle', { linkTtlDays: 0 }],
    ['durée de lien au-delà du maximum d’environnement', { linkTtlDays: 10_000 }],
    ['durée de lien fractionnaire', { linkTtlDays: 1.5 }],
    ['sendEmail non booléen', { sendEmail: 'oui' }]
  ])('refuse : %s', (_label, patch) => {
    expect(createGrantSchema.safeParse({ ...valid(), ...patch }).success).toBe(false);
  });

  it('refuse un corps qui n’est pas un objet', () => {
    expect(createGrantSchema.safeParse(null).success).toBe(false);
    expect(createGrantSchema.safeParse('x').success).toBe(false);
  });
});

describe('updateGrantSchema', () => {
  it('refuse un corps vide', () => {
    expect(updateGrantSchema.safeParse({}).success).toBe(false);
  });

  it('accepte un sous-ensemble de champs et une expiration nulle', () => {
    expect(updateGrantSchema.parse({ expiresAt: null }).expiresAt).toBeNull();
    expect(updateGrantSchema.parse({ sections: ['LOANS'] }).sections).toEqual(['LOANS']);
    expect(updateGrantSchema.parse({ recipientEmail: 'A@B.CO' }).recipientEmail).toBe('a@b.co');
  });

  it.each([
    ['sections vides', { sections: [] }],
    ['expiration passée', { expiresAt: new Date(Date.now() - 1000).toISOString() }],
    ['champ non modifiable', { type: 'BANKER' }],
    ['champ non modifiable (agence)', { tenantId: 'x' }]
  ])('refuse : %s', (_label, body) => {
    expect(updateGrantSchema.safeParse(body).success).toBe(false);
  });
});

describe('autres schémas', () => {
  it('sendLinkSchema : bornes de durée et champs stricts', () => {
    expect(sendLinkSchema.parse({})).toEqual({});
    expect(sendLinkSchema.parse({ linkTtlDays: 14, revokePreviousLinks: true, sendEmail: false })).toEqual({
      linkTtlDays: 14,
      revokePreviousLinks: true,
      sendEmail: false
    });
    expect(sendLinkSchema.safeParse({ linkTtlDays: 400 }).success).toBe(false);
    expect(sendLinkSchema.safeParse({ token: 'x' }).success).toBe(false);
  });

  it('accessLogQuerySchema : limite entre 1 et 100', () => {
    expect(accessLogQuerySchema.parse({}).limit).toBeUndefined();
    expect(accessLogQuerySchema.parse({ limit: '25' }).limit).toBe(25);
    expect(accessLogQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(accessLogQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });
});

describe('grantStatus', () => {
  const now = new Date('2026-10-01T12:00:00.000Z');
  it('REVOKED prime sur tout', () => {
    expect(grantStatus({ revokedAt: new Date(), expiresAt: null }, now)).toBe('REVOKED');
    expect(grantStatus({ revokedAt: new Date(), expiresAt: new Date(now.getTime() - DAY) }, now)).toBe('REVOKED');
  });
  it('EXPIRED quand l’expiration est atteinte', () => {
    expect(grantStatus({ revokedAt: null, expiresAt: new Date(now.getTime() - 1) }, now)).toBe('EXPIRED');
    expect(grantStatus({ revokedAt: null, expiresAt: new Date(now.getTime()) }, now)).toBe('EXPIRED');
  });
  it('EXPIRING sous 7 jours, ACTIVE au-delà et pour un accès permanent', () => {
    expect(grantStatus({ revokedAt: null, expiresAt: new Date(now.getTime() + 6 * DAY) }, now)).toBe('EXPIRING');
    expect(grantStatus({ revokedAt: null, expiresAt: new Date(now.getTime() + 7 * DAY) }, now)).toBe('EXPIRING');
    expect(grantStatus({ revokedAt: null, expiresAt: new Date(now.getTime() + 8 * DAY) }, now)).toBe('ACTIVE');
    expect(grantStatus({ revokedAt: null, expiresAt: null }, now)).toBe('ACTIVE');
  });
});
