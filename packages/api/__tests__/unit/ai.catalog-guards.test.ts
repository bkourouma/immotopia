/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Catalogue de la passerelle IA : gardes posées au niveau du routeur.
 *
 * Les routeurs newsletter, notifications WhatsApp et e-mail ne posent que `requireTenantCollaborator` (un type de
 * rôle). Le catalogue leur impose donc, côté assistant, la permission de l'espace Communication ; et toute écriture
 * sans permission connue est refusée (fail closed), jamais « visible par défaut ».
 */
import '../helpers/app-shims';
import { collectRoutes, installMountPathRecorder } from '../../src/lib/ai/gateway/route-walker';

// Avant l'import de l'app : voir route-walker.ts.
installMountPathRecorder();

import app from '../../src/app';
import { buildCatalog, COMMUNICATION_PERMISSION_FLOOR } from '../../src/lib/ai/gateway/catalog-builder';
import { writeSensitivity } from '../../src/lib/ai/gateway/path-rules';
import {
  findWritableEntry,
  getCatalogEntries,
  isPermittedByCatalog,
  searchCapabilities
} from '../../src/lib/ai/gateway/catalog';

/** Écritures sans permission connue admises dans le catalogue : aucune, à justifier une par une si besoin. */
const WRITE_WITHOUT_PERMISSION_ALLOWLIST: ReadonlySet<string> = new Set();

const COMMUNICATION_MODULES = [...COMMUNICATION_PERMISSION_FLOOR.keys()];
const communicationEntries = () => getCatalogEntries().filter(e => COMMUNICATION_MODULES.includes(e.module));
const communicationWrites = () => communicationEntries().filter(e => e.method !== 'GET');

const ONLY_PROPERTIES_VIEW = new Set(['PROPERTIES_VIEW']);
const COMMUNICATION_ROLE = new Set(['PROPERTIES_VIEW', 'COMMUNICATION_VIEW']);

const visibleIds = (permissions: ReadonlySet<string>, kind: 'read' | 'write') =>
  new Set(
    COMMUNICATION_MODULES.flatMap(module => searchCapabilities({ module, kind, permissions }).entries.map(e => e.id))
  );

describe('catalogue IA — gardes de routeur', () => {
  it('aucune écriture du catalogue n’est sans permission connue (hors liste blanche justifiée)', () => {
    const offenders = getCatalogEntries()
      .filter(e => e.method !== 'GET' && !e.permissions && !e.anyOfPermissions)
      .map(e => e.id)
      .filter(id => !WRITE_WITHOUT_PERMISSION_ALLOWLIST.has(id));
    expect(offenders).toEqual([]);
  });

  it('les routes de communication existent bien, écritures d’envoi comprises', () => {
    const ids = communicationWrites().map(e => e.id);
    expect(ids.length).toBeGreaterThanOrEqual(19);
    for (const suffix of ['whatsapp-notifications/test-send', 'whatsapp-notifications/group-broadcast/send']) {
      expect(ids).toContain(`POST /api/tenants/:tenantId/${suffix}`);
    }
    expect(ids).toContain('POST /api/tenants/:tenantId/newsletter/campaigns/:campaignId/send');
    for (const entry of communicationEntries()) expect(entry.permissions).toEqual(['COMMUNICATION_VIEW']);
  });

  it('un utilisateur qui n’a que PROPERTIES_VIEW ne les voit ni en lecture ni en écriture, et ne peut pas les planifier', () => {
    expect(visibleIds(ONLY_PROPERTIES_VIEW, 'write').size).toBe(0);
    expect(visibleIds(ONLY_PROPERTIES_VIEW, 'read').size).toBe(0);
    for (const entry of communicationEntries()) {
      expect(isPermittedByCatalog(entry, ONLY_PROPERTIES_VIEW)).toBe(false);
    }
  });

  it('le rôle prévu (COMMUNICATION_VIEW) les voit toutes', () => {
    const writes = visibleIds(COMMUNICATION_ROLE, 'write');
    for (const entry of communicationWrites()) {
      expect(findWritableEntry(entry.id)).toBeDefined();
      expect(writes.has(entry.id)).toBe(true);
    }
    const reads = visibleIds(COMMUNICATION_ROLE, 'read');
    for (const entry of communicationEntries().filter(e => e.method === 'GET' && !e.sensitive)) {
      expect(reads.has(entry.id)).toBe(true);
    }
  });

  it('findWritableEntry refuse une écriture sans permission connue (fail closed)', () => {
    expect(findWritableEntry('PATCH /api/tenants/:tenantId/client-details')).toBeUndefined();
  });

  it('le générateur écarte PATCH client-details et les deux écritures de la boîte de notifications (libre-service, aucune permission) et ne laisse aucune écriture sans info', () => {
    const built = buildCatalog(collectRoutes(app));
    // client-details : libre-service du portail. `notifications/:id/read` et `notifications/read-all` : simple
    // appartenance (l'utilisateur marque SES notifications lues), aucune permission : fail closed.
    expect(built.excludedUnguardedWrites.map(e => e.id).sort()).toEqual(
      [
        'PATCH /api/tenants/:tenantId/client-details',
        'POST /api/tenants/:tenantId/notifications/:id/read',
        'POST /api/tenants/:tenantId/notifications/read-all'
      ].sort()
    );
    expect(built.entries.filter(e => e.method !== 'GET' && !e.permissions && !e.anyOfPermissions)).toEqual([]);
  });

  it('la messagerie privée sort entièrement du catalogue (lecture comme écriture)', () => {
    // Messages privés : contenu rédigé par des clients (vecteur d'injection) et envoi au nom de l'utilisateur
    // interdit à l'assistant.
    const built = buildCatalog(collectRoutes(app));
    const isMessaging = (e: { path: string }) => e.path.startsWith('/api/tenants/:tenantId/messages');
    expect(built.entries.filter(isMessaging)).toEqual([]);
    expect(getCatalogEntries().filter(isMessaging)).toEqual([]);
    expect(findWritableEntry('POST /api/tenants/:tenantId/messages/conversations/:id/messages')).toBeUndefined();
  });

  it('le renvoi d’une notification (envoi sortant vers des clients) est une écriture sensible : mot de confirmation exigé', () => {
    const resend = 'POST /api/tenants/:tenantId/admin/notifications/:id/resend';
    expect(findWritableEntry(resend)).toBeDefined();
    expect(writeSensitivity('/api/tenants/:tenantId/admin/notifications/:id/resend')?.category).toBe('sending');
  });
});
