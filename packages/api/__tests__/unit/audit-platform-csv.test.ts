import {
  platformAuditCsvHead,
  platformAuditCsvLine,
  PLATFORM_AUDIT_CSV_HEADER
} from '../../src/lib/audit/platform-audit-csv';
import type { PlatformAuditLogDto } from '../../src/services/audit-platform-read-service';

const base: PlatformAuditLogDto = {
  id: 'a1',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  action: 'PROPERTY_CREATED',
  category: 'DATA',
  outcome: 'SUCCESS',
  scope: 'TENANT',
  visibility: 'TENANT',
  actorType: 'USER',
  resourceType: 'PROPERTY',
  resourceId: 'p1'
};

describe('CSV du journal d’audit de la plateforme', () => {
  it('commence par le BOM UTF-8 et un en-tête de la bonne largeur', () => {
    const head = platformAuditCsvHead();
    expect(head.charCodeAt(0)).toBe(0xfeff);
    expect(head.trimEnd().split(',')).toHaveLength(PLATFORM_AUDIT_CSV_HEADER.length);
  });

  it('écrit une ligne de même largeur que l’en-tête', () => {
    const line = platformAuditCsvLine({
      ...base,
      tenant: { id: 't1', name: 'Agence A' },
      tenantId: 't1',
      user: { id: 'u1', email: 'a@b.test', fullName: 'Awa Koné' },
      details: { title: 'T' },
      changes: { price: { before: 1, after: 2 } },
      requestId: 'req-1',
      ipAddress: '1.2.3.4'
    });
    // Les cellules JSON contiennent des virgules : on compte via un découpage CSV simple.
    expect(
      line.startsWith(
        '2026-10-01T10:00:00.000Z,Agence A,t1,Awa Koné,USER,PROPERTY_CREATED,DATA,SUCCESS,TENANT,TENANT,PROPERTY,p1'
      )
    ).toBe(true);
    expect(line).toContain('"{""title"":""T""}"');
  });

  it('l’acteur : nom, sinon e-mail, sinon libellé figé, sinon vide', () => {
    const cell = (log: Partial<PlatformAuditLogDto>) => platformAuditCsvLine({ ...base, ...log }).split(',')[3];
    expect(cell({ user: { id: 'u', email: 'a@b.test', fullName: 'Awa' } })).toBe('Awa');
    expect(cell({ user: { id: 'u', email: 'a@b.test', fullName: null } })).toBe('a@b.test');
    expect(cell({ actorLabel: 'ancien@compte.test' })).toBe('ancien@compte.test');
    expect(cell({})).toBe('');
  });

  it('neutralise l’injection de formule d’un tableur dans une cellule saisie par un utilisateur', () => {
    const line = platformAuditCsvLine({ ...base, resourceLabel: '=HYPERLINK("http://evil","x")', actorLabel: '@cmd' });
    expect(line).toContain("'=HYPERLINK");
    expect(line).toContain("'@cmd");
  });

  it('tronque un JSON démesuré', () => {
    const line = platformAuditCsvLine({ ...base, details: { blob: 'x'.repeat(20_000) } });
    expect(line.length).toBeLessThan(6000);
    expect(line).toContain('…');
  });
});
