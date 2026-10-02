import { describe, it, expect } from 'vitest';
import { getNavigation } from '../../navigation/model';
import { defaultMenuMap, menuKeyFor } from '../../navigation/menu-catalog';
import { getPermissionLabelFr } from '../../constants/permissions-labels';

/**
 * Entrée « Journal d'activité » du groupe Agence (spec 023, phase 2) : visible
 * seulement pour la permission `TENANT_AUDIT_VIEW`.
 */

const ENTRY = menuKeyFor('collaborateur', 'agence', 'agence-activity');
const GROUP = menuKeyFor('collaborateur', 'agence');

describe("menu « Journal d'activité »", () => {
  it('existe dans le groupe Agence, vers la route de la page', () => {
    const agence = getNavigation().collaborateur.tree.find(group => group.key === 'agence');
    const entry = agence?.children?.find(child => child.key === 'agence-activity');

    expect(entry?.href).toBe('/tenant/:tenantId/activity');
    expect(entry?.label).toBe("Journal d'activité");
  });

  it("n'apparaît que pour TENANT_AUDIT_VIEW", () => {
    const sans = defaultMenuMap('collaborateur', new Set(['USERS_VIEW', 'TENANT_SETTINGS_VIEW']));
    const avec = defaultMenuMap('collaborateur', new Set(['TENANT_AUDIT_VIEW']));

    expect(sans[ENTRY]).toBe(false);
    expect(avec[ENTRY]).toBe(true);
  });

  it('ouvre le groupe Agence pour qui ne détient que TENANT_AUDIT_VIEW, sans ouvrir les autres entrées', () => {
    const map = defaultMenuMap('collaborateur', new Set(['TENANT_AUDIT_VIEW']));

    expect(map[GROUP]).toBe(true);
    expect(map[menuKeyFor('collaborateur', 'agence', 'agence-settings')]).toBe(false);
    expect(map[menuKeyFor('collaborateur', 'agence', 'agence-collaborators')]).toBe(false);
  });

  it('ferme le groupe et l’entrée à un rôle sans aucune de ces permissions', () => {
    const map = defaultMenuMap('collaborateur', new Set(['PROPERTIES_VIEW']));

    expect(map[GROUP]).toBe(false);
    expect(map[ENTRY]).toBe(false);
  });

  it('libelle la permission', () => {
    expect(getPermissionLabelFr('TENANT_AUDIT_VIEW').label).toBe("Voir le journal d'activité");
  });
});
