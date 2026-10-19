import { describe, it, expect } from 'vitest';
import { getNavigation } from '../../navigation/model';
import { defaultMenuMap, menuKeyFor, requirementsFor } from '../../navigation/menu-catalog';

/** Entrées du lot 3 : notifications, messagerie, journaux (agence et plateforme). */

describe('menus notifications et messagerie', () => {
  const collaborateur = getNavigation().collaborateur.tree;

  it('Notifications et Messagerie sont ouvertes à tout collaborateur, sans permission', () => {
    const map = defaultMenuMap('collaborateur', new Set());

    expect(collaborateur.find(group => group.key === 'notifications')?.href).toBe('/notifications');
    expect(collaborateur.find(group => group.key === 'messagerie')?.href).toBe('/messages');
    expect(map[menuKeyFor('collaborateur', 'notifications')]).toBe(true);
    expect(map[menuKeyFor('collaborateur', 'messagerie')]).toBe(true);
  });

  it("le journal des notifications de l'agence exige TENANT_NOTIFICATIONS_ADMIN", () => {
    const agence = collaborateur.find(group => group.key === 'agence');
    const entry = agence?.children?.find(child => child.key === 'agence-notifications');
    const key = menuKeyFor('collaborateur', 'agence', 'agence-notifications');

    expect(entry?.href).toBe('/tenant/:tenantId/notifications-journal');
    expect(defaultMenuMap('collaborateur', new Set(['USERS_VIEW']))[key]).toBe(false);
    expect(defaultMenuMap('collaborateur', new Set(['TENANT_NOTIFICATIONS_ADMIN']))[key]).toBe(true);
  });

  it('le journal de la plateforme est dans Administration, à côté des journaux d’audit', () => {
    const administration = getNavigation()['super-admin'].tree.find(group => group.key === 'administration');
    const keys = administration?.children?.map(child => child.key) ?? [];

    expect(keys.indexOf('admin-notifications')).toBe(keys.indexOf('admin-audit') + 1);
    expect(administration?.children?.find(child => child.key === 'admin-notifications')?.href).toBe(
      '/admin/notifications'
    );
  });
});

describe('menus de portail : notifications et messagerie', () => {
  it.each([
    ['proprietaire', 'plus', 'owner-notifications', 'owner-messagerie'],
    ['locataire', 'plus', 'tenant-notifications', 'tenant-messagerie'],
    ['coproprietaire', 'plus', 'coprop-notifications', 'coprop-messagerie']
  ] as const)('%s : entrées sans permission d’agence', (persona, group, notifKey, msgKey) => {
    const children = getNavigation()[persona].tree.find(g => g.key === group)?.children ?? [];
    expect(children.find(c => c.key === notifKey)?.href).toBe('/notifications');
    expect(children.find(c => c.key === msgKey)?.href).toBe('/messages');
    expect(requirementsFor(notifKey)).toEqual([]);
    expect(requirementsFor(msgKey)).toEqual([]);
  });
});
