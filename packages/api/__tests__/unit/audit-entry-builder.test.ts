import { buildAuditRow, redactAuditData, REDACTED } from '../../src/services/audit-entry-builder';
import { AuditActionKey } from '../../src/types/audit-types';
import { RequestContextData } from '../../src/utils/request-context';

jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

const ctx: RequestContextData = {
  ip: '10.0.0.1',
  userAgent: 'jest',
  requestId: 'req-1',
  actor: { userId: 'user-1', type: 'USER', tenantId: 'tenant-A', label: 'agent@agence.test' }
};

const base = { entityType: 'PROPERTY', entityId: 'p1' };

describe('buildAuditRow', () => {
  it('complète acteur, agence, requête et IP depuis le contexte', () => {
    const row = buildAuditRow({ ...base, actionKey: AuditActionKey.PROPERTY_CREATED }, ctx);
    expect(row).toMatchObject({
      actorUserId: 'user-1',
      tenantId: 'tenant-A',
      actorType: 'USER',
      actorLabel: 'agent@agence.test',
      requestId: 'req-1',
      ipAddress: '10.0.0.1',
      userAgent: 'jest',
      source: 'http',
      scope: 'TENANT',
      visibility: 'TENANT',
      category: 'DATA',
      outcome: 'SUCCESS'
    });
  });

  it('laisse toujours l’emporter la valeur fournie par l’appelant, y compris null', () => {
    const row = buildAuditRow(
      {
        ...base,
        actionKey: AuditActionKey.AUTH_LOGIN_FAILED,
        actorUserId: null,
        tenantId: null,
        outcome: 'FAILURE',
        actorType: 'SYSTEM',
        ipAddress: '1.2.3.4'
      },
      ctx
    );
    expect(row).toMatchObject({
      actorUserId: null,
      tenantId: null,
      outcome: 'FAILURE',
      actorType: 'SYSTEM',
      ipAddress: '1.2.3.4',
      scope: 'PLATFORM'
    });
  });

  it('ne laisse pas une visibilité TENANT à une ligne sans agence', () => {
    const row = buildAuditRow(
      { ...base, actionKey: AuditActionKey.PROPERTY_CREATED, tenantId: null, visibility: 'TENANT' },
      ctx
    );
    expect(row.tenantId).toBeNull();
    expect(row.visibility).toBe('PLATFORM_ONLY');
  });

  it('garde une action de plateforme hors de la vue agence, même rattachée à une agence', () => {
    const row = buildAuditRow({ ...base, actionKey: AuditActionKey.CAPACITY_OVERRIDE_GRANTED }, ctx);
    expect(row).toMatchObject({
      scope: 'TENANT',
      tenantId: 'tenant-A',
      visibility: 'PLATFORM_ONLY',
      category: 'BILLING'
    });
  });

  it('ferme par défaut une clé hors catalogue', () => {
    const row = buildAuditRow({ ...base, actionKey: 'CLE_INCONNUE' }, ctx);
    expect(row).toMatchObject({ visibility: 'PLATFORM_ONLY', category: 'DATA' });
  });

  it('fonctionne hors requête (job, script) : acteur système, pas de source http', () => {
    const row = buildAuditRow({ ...base, actionKey: AuditActionKey.LOT_REGISTRY_RECONCILED }, undefined);
    expect(row).toMatchObject({
      actorUserId: null,
      tenantId: null,
      actorType: 'SYSTEM',
      source: null,
      requestId: null,
      scope: 'PLATFORM'
    });
  });

  it('masque les secrets du payload et des changements', () => {
    const row = buildAuditRow(
      {
        ...base,
        actionKey: AuditActionKey.USER_UPDATED,
        payload: { email: 'a@b.c', passwordHash: 'x', nested: { refreshToken: 'y' } },
        changes: { password: { before: 'a', after: 'b' }, fullName: { before: 'A', after: 'B' } }
      },
      ctx
    );
    expect(row.payload).toEqual({ email: 'a@b.c', passwordHash: REDACTED, nested: { refreshToken: REDACTED } });
    expect(row.changes).toEqual({ password: REDACTED, fullName: { before: 'A', after: 'B' } });
  });
});

describe('redactAuditData', () => {
  it('ne masque pas des clés qui contiennent seulement des lettres de mots sensibles', () => {
    expect(redactAuditData({ footprint: 1, discard: 2, cardinality: 3 })).toEqual({
      footprint: 1,
      discard: 2,
      cardinality: 3
    });
  });

  it('masque camelCase, snake_case et mots composés', () => {
    const out = redactAuditData({ apiKey: 1, new_password: 2, accessToken: 3, cardNumber: 4, iban: 5 });
    expect(out).toEqual({
      apiKey: REDACTED,
      new_password: REDACTED,
      accessToken: REDACTED,
      cardNumber: REDACTED,
      iban: REDACTED
    });
  });

  it('masque aussi dans les tableaux et via les clés supplémentaires du catalogue', () => {
    expect(redactAuditData([{ secret: 1 }, { note: 'x', custom: 'y' }], ['custom'])).toEqual([
      { secret: REDACTED },
      { note: 'x', custom: REDACTED }
    ]);
  });

  it('borne la profondeur : une structure cyclique ne bloque pas l’écriture', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => redactAuditData(cyclic)).not.toThrow();
  });

  it('conserve les dates', () => {
    const d = new Date();
    expect(redactAuditData({ when: d })).toEqual({ when: d });
  });
});
