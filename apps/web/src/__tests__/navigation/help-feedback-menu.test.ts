import { describe, it, expect } from 'vitest';
import { getNavigation } from '../../navigation/model';
import { defaultMenuMap, menuKeyFor } from '../../navigation/menu-catalog';

/**
 * Entrées « Avis sur l'aide » : plateforme (PLATFORM_TENANTS_VIEW, comme l'API) et agence (TENANT_AUDIT_VIEW).
 */

const PLATFORM_ENTRY = menuKeyFor('super-admin', 'administration', 'admin-help-feedback');
const AGENCY_ENTRY = menuKeyFor('collaborateur', 'agence', 'agence-help-feedback');

describe("menu « Avis sur l'aide »", () => {
  it('existe côté plateforme, après « Assistant IA »', () => {
    const admin = getNavigation()['super-admin'].tree.find(group => group.key === 'administration');
    const keys = admin?.children?.map(child => child.key) ?? [];
    const entry = admin?.children?.find(child => child.key === 'admin-help-feedback');

    expect(entry?.href).toBe('/admin/help-feedback');
    expect(entry?.label).toBe("Avis sur l'aide");
    expect(keys.indexOf('admin-help-feedback')).toBe(keys.indexOf('admin-ai-settings') + 1);
  });

  it('existe dans le groupe Agence, vers la route d’agence', () => {
    const agence = getNavigation().collaborateur.tree.find(group => group.key === 'agence');
    const entry = agence?.children?.find(child => child.key === 'agence-help-feedback');

    expect(entry?.href).toBe('/tenant/:tenantId/admin/help-feedback');
    expect(entry?.label).toBe("Avis sur l'aide");
  });

  it('plateforme : exige PLATFORM_TENANTS_VIEW', () => {
    expect(defaultMenuMap('super-admin', new Set(['PLATFORM_AUDIT_VIEW']))[PLATFORM_ENTRY]).toBe(false);
    expect(defaultMenuMap('super-admin', new Set(['PLATFORM_TENANTS_VIEW']))[PLATFORM_ENTRY]).toBe(true);
  });

  it('agence : exige TENANT_AUDIT_VIEW', () => {
    const sans = defaultMenuMap('collaborateur', new Set(['USERS_VIEW', 'TENANT_SETTINGS_VIEW']));
    const avec = defaultMenuMap('collaborateur', new Set(['TENANT_AUDIT_VIEW']));

    expect(sans[AGENCY_ENTRY]).toBe(false);
    expect(avec[AGENCY_ENTRY]).toBe(true);
  });
});
