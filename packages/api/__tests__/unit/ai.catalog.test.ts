/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Plan V2, étape 3 — catalogue de la passerelle IA.
 *
 * Régénère le catalogue EN MÉMOIRE depuis la pile Express réelle (aucune base,
 * aucune requête : seule la pile est lue, comme `routes-inventory.test.ts`) et
 * le compare au fichier commité. Garde-fous : aucune suppression, aucune route
 * hors périmètre, aucune route d'agence oubliée.
 */
import '../helpers/app-shims';
import { readFileSync } from 'fs';
import { join } from 'path';
import { collectRoutes, installMountPathRecorder } from '../../src/lib/ai/gateway/route-walker';

// Avant l'import de l'app : voir route-walker.ts.
installMountPathRecorder();

import app from '../../src/app';
import {
  buildCatalog,
  isDestructive,
  isSensitivePath,
  isTenantScoped,
  serializeCatalog,
  EXCLUDED_ABSOLUTE_PREFIXES
} from '../../src/lib/ai/gateway/catalog-builder';

const CATALOG_FILE = join(__dirname, '../../src/lib/ai/gateway/catalog.generated.json');
const routes = collectRoutes(app);
const built = buildCatalog(routes);

describe('catalogue de la passerelle IA', () => {
  it('est à jour : identique à ce que produit la pile Express réelle', () => {
    // Contenu comparé, pas le texte : Prettier (lint-staged) reformate le JSON commité.
    const committed = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'));
    const fresh = JSON.parse(serializeCatalog(built.entries));
    const hint = 'Catalogue périmé : lancer npm run ai:catalog (dans packages/api)';
    if (JSON.stringify(committed) !== JSON.stringify(fresh)) {
      const ids = new Set(committed.entries.map((entry: { id: string }) => entry.id));
      const added = built.entries.filter(entry => !ids.has(entry.id)).map(entry => entry.id);
      // eslint-disable-next-line no-console
      console.error(
        `${hint}. Routes absentes du catalogue : ${added.slice(0, 20).join(' | ') || '(aucune : une garde ou un nom a changé)'}`
      );
    }
    expect({ hint, upToDate: JSON.stringify(committed) === JSON.stringify(fresh) }).toEqual({ hint, upToDate: true });
  });

  it('a bien découvert des routes d’agence de toutes méthodes de lecture et d’écriture', () => {
    expect(built.entries.length).toBeGreaterThan(300);
    const methods = new Set(built.entries.map(entry => entry.method));
    expect([...methods].sort()).toEqual(['GET', 'PATCH', 'POST', 'PUT']);
  });

  it('ne contient AUCUNE route DELETE ni destructrice (/delete /remove /destroy /purge)', () => {
    const offenders = built.entries.filter(
      entry => isDestructive(entry.method, entry.path) || (entry.method as string) === 'DELETE'
    );
    expect(offenders.map(entry => entry.id)).toEqual([]);
    // Elles existent bel et bien dans l'app : le garde-fou ne tourne pas à vide.
    const inApp = routes.filter(route => isTenantScoped(route) && isDestructive(route.method, route.path));
    expect(inApp.length).toBeGreaterThan(10);
    expect(built.excludedDestructive.length).toBe(new Set(inApp.map(route => `${route.method} ${route.path}`)).size);
    expect(built.excludedDestructive.every(entry => entry.destructive === true)).toBe(true);
    // Écriture destructrice déguisée en POST : repérée et exclue.
    expect(built.excludedDestructive.map(entry => entry.id)).toContain(
      'POST /api/tenants/:tenantId/maintenance/admin/vendors/:vendorId/delete'
    );
    expect(built.entries.some(entry => /\/(delete|remove|destroy|purge)$/i.test(entry.path))).toBe(false);
  });

  it('ne contient aucune route /auth, /admin, /platform, /portal, /ai, webhook', () => {
    for (const entry of built.entries) {
      expect(EXCLUDED_ABSOLUTE_PREFIXES.some(prefix => entry.path.startsWith(prefix))).toBe(false);
      expect(entry.path.startsWith('/api/tenants/:tenantId/ai')).toBe(false);
      expect(/webhook/i.test(entry.path)).toBe(false);
      expect(entry.path.startsWith('/api/tenants/:tenantId')).toBe(true);
    }
  });

  it('toute route d’agence non DELETE, non destructrice, non exclue a une entrée', () => {
    const ids = new Set(built.entries.map(entry => entry.id));
    const missing: string[] = [];
    for (const route of routes) {
      if (!isTenantScoped(route)) continue;
      if (isDestructive(route.method, route.path)) continue;
      if (!['GET', 'POST', 'PUT', 'PATCH'].includes(route.method)) continue;
      if (/webhook/i.test(route.path) || route.path.startsWith('/api/tenants/:tenantId/ai')) continue;
      if (!ids.has(`${route.method} ${route.path}`)) missing.push(`${route.method} ${route.path}`);
    }
    expect(missing).toEqual([]);
  });

  it('ids uniques et stables (METHOD /chemin), :tenantId exclu des paramètres à fournir', () => {
    expect(new Set(built.entries.map(entry => entry.id)).size).toBe(built.entries.length);
    for (const entry of built.entries) {
      expect(entry.id).toBe(`${entry.method} ${entry.path}`);
      expect(entry.pathParams).not.toContain('tenantId');
      expect(entry.module.length).toBeGreaterThan(0);
      expect(entry.summary.length).toBeGreaterThan(0);
    }
  });

  it('lit les permissions exposées par les gardes (permissionKey, any, all) ou null', () => {
    const suppliers = built.entries.find(
      entry => entry.path === '/api/tenants/:tenantId/finance/suppliers' && entry.method === 'GET'
    );
    expect(suppliers?.permissions?.length).toBeGreaterThan(0);
    expect(built.entries.some(entry => entry.permissions === null)).toBe(true);
    expect(built.entries.some(entry => entry.anyOfPermissions !== null)).toBe(true);
  });

  it('marque sensibles les chemins évoquant un secret, pas la caisse', () => {
    const sensitive = built.entries.filter(entry => entry.sensitive).map(entry => entry.id);
    expect(sensitive).toContain('GET /api/tenants/:tenantId/settings/payment-gateway');
    expect(sensitive).toContain('GET /api/tenants/:tenantId/invitations');
    expect(built.entries.filter(entry => entry.path.includes('cash-sessions')).every(entry => !entry.sensitive)).toBe(
      true
    );
    expect(isSensitivePath('/api/tenants/:tenantId/x/api-key')).toBe(true);
    expect(isSensitivePath('/api/tenants/:tenantId/auth/session')).toBe(true);
    expect(isSensitivePath('/api/tenants/:tenantId/cash-sessions')).toBe(false);
    expect(isSensitivePath('/api/tenants/:tenantId/contacts/:tokenId')).toBe(false);
  });
});
