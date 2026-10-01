import { describe, it, expect } from 'vitest';
import { defaultMenuMap, menuKeyFor } from '../../navigation/menu-catalog';
import { getPermissionLabelFr } from '../../constants/permissions-labels';

/** Entrée « Journaux d'audit » de la console plateforme (spec 023, phase 4) : réservée à `PLATFORM_AUDIT_VIEW`. */

const ENTRY = menuKeyFor('super-admin', 'administration', 'admin-audit');
const GROUP = menuKeyFor('super-admin', 'administration');

describe("menu « Journaux d'audit » de la plateforme", () => {
  it("n'apparaît que pour PLATFORM_AUDIT_VIEW", () => {
    const sans = defaultMenuMap('super-admin', new Set(['PLATFORM_TENANTS_VIEW', 'PLATFORM_TENANTS_EDIT']));
    const avec = defaultMenuMap('super-admin', new Set(['PLATFORM_AUDIT_VIEW']));

    expect(sans[ENTRY]).toBe(false);
    expect(avec[ENTRY]).toBe(true);
  });

  it("ne suffit pas d'exporter : PLATFORM_AUDIT_EXPORT seul n'ouvre pas l'entrée", () => {
    expect(defaultMenuMap('super-admin', new Set(['PLATFORM_AUDIT_EXPORT']))[ENTRY]).toBe(false);
  });

  it('ouvre le groupe Administration pour qui ne détient que PLATFORM_AUDIT_VIEW, sans les autres entrées', () => {
    const map = defaultMenuMap('super-admin', new Set(['PLATFORM_AUDIT_VIEW']));

    expect(map[GROUP]).toBe(true);
    expect(map[menuKeyFor('super-admin', 'administration', 'admin-tenants')]).toBe(false);
  });

  it('libelle les deux permissions', () => {
    expect(getPermissionLabelFr('PLATFORM_AUDIT_VIEW').label).toBe("Voir le journal d'audit de la plateforme");
    expect(getPermissionLabelFr('PLATFORM_AUDIT_EXPORT').label).toBe("Exporter le journal d'audit");
  });
});
