import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NAVIGATION } from '../../navigation/model';
import type { NavGroup } from '../../navigation/model';
import { useFilteredNavigation } from '../../hooks/useMenuAccess';

/**
 * Navigation filtrée par permission (BUG-2026-09-28-006).
 *
 * Les jeux de permissions reprennent les rôles seedés
 * (`packages/api/prisma/seeds/rbac-seed.ts`, `finance-permissions-seed.ts`).
 */
const nav = NAVIGATION.collaborateur;

const AGENT = new Set([
  'TENANT_SETTINGS_VIEW',
  'USERS_VIEW',
  'PROPERTIES_VIEW',
  'PROPERTIES_CREATE',
  'PROPERTIES_EDIT',
  'PROPERTIES_VISITS_SCHEDULE',
  'CRM_CONTACTS_VIEW',
  'CRM_DEALS_VIEW',
  'CRM_ACTIVITIES_VIEW',
  'CRM_APPOINTMENTS_VIEW',
  'MAINTENANCE_TENANT',
  'COMMUNICATION_VIEW'
]);

const ACCOUNTANT = new Set([
  'BILLING_VIEW',
  'FINANCE_ACCOUNTS_READ',
  'FINANCE_REPORTS_READ',
  'FINANCE_DOCUMENTS_CREATE'
]);

const MANAGER = new Set([
  'TENANT_SETTINGS_VIEW',
  'USERS_VIEW',
  'USERS_EDIT',
  'PROPERTIES_VIEW',
  'RENTAL_LEASES_VIEW',
  'RENTAL_INSTALLMENTS_VIEW',
  'RENTAL_PAYMENTS_VIEW',
  'FINANCE_ACCOUNTS_READ',
  'FINANCE_REPORTS_READ'
]);

function visible(permissions: Set<string> | null): NavGroup[] {
  const { result } = renderHook(() => useFilteredNavigation(nav, new Set(), null, permissions));
  return result.current!.tree;
}

const keys = (tree: NavGroup[]) => tree.map(g => g.key);
const leafKeys = (tree: NavGroup[]) => tree.flatMap(g => (g.children ?? []).map(c => c.key));
const FINANCE_GROUPS = nav.tree.filter(g => g.section === 'finance').map(g => g.key);

describe('navigation filtrée par permission', () => {
  it('administrateur (permissions null) : tout le menu, inchangé', () => {
    const { result } = renderHook(() => useFilteredNavigation(nav, new Set(), null, null));
    expect(result.current).toBe(nav);
    expect(keys(visible(null))).toEqual(keys(nav.tree));
  });

  it('Agent : ni Finance, ni Baux, ni Encaisser, ni Invitations', () => {
    const tree = visible(AGENT);
    for (const gone of [...FINANCE_GROUPS, 'baux', 'encaisser']) {
      expect(keys(tree)).not.toContain(gone);
    }
    expect(leafKeys(tree)).not.toContain('agence-invitations');
    // Ce que son rôle permet reste visible.
    expect(keys(tree)).toEqual(expect.arrayContaining(['accueil', 'biens', 'crm', 'agence']));
    expect(leafKeys(tree)).toEqual(expect.arrayContaining(['agence-collaborators', 'agence-settings']));
  });

  it('Agent : les onglets du bas suivent (Baux et Encaisser retirés)', () => {
    const { result } = renderHook(() => useFilteredNavigation(nav, new Set(), null, AGENT));
    const tabs = result.current!.tabs.map(t => t.key);
    expect(tabs).not.toContain('tab-baux');
    expect(tabs).not.toContain('tab-encaisser');
    expect(tabs).toContain('tab-plus');
  });

  it('Comptable : voit les espaces Finance, pas les baux ni les invitations', () => {
    const tree = visible(ACCOUNTANT);
    for (const group of FINANCE_GROUPS) {
      expect(keys(tree)).toContain(group);
    }
    expect(keys(tree)).not.toContain('baux');
    expect(leafKeys(tree)).not.toContain('agence-invitations');
    expect(leafKeys(tree)).toContain('finance-comptabilite');
  });

  it('Gestionnaire : Finance en lecture, sans la file de validation ; Baux et Encaisser visibles', () => {
    const tree = visible(MANAGER);
    expect(keys(tree)).toEqual(expect.arrayContaining([...FINANCE_GROUPS, 'baux', 'encaisser']));
    expect(leafKeys(tree)).not.toContain('finance-validation');
  });

  it('un groupe dont la première feuille est masquée pointe vers une feuille restante', () => {
    const only = new Set(['FINANCE_REPORTS_READ']);
    const compta = visible(only).find(g => g.key === 'finance-caisse-compta')!;
    expect(compta.children!.map(c => c.key)).toEqual(['finance-comptabilite']);
    expect(compta.href).toBe('/tenant/:tenantId/finance/comptabilite');
  });

  it('un rôle sans aucune permission ne garde que les entrées sans exigence', () => {
    const tree = visible(new Set());
    expect(keys(tree)).toContain('accueil');
    expect(keys(tree)).not.toContain('baux');
    expect(keys(tree).filter(k => FINANCE_GROUPS.includes(k))).toEqual([]);
  });

  it('les personas de portail ne sont jamais filtrés par permission', () => {
    const owner = NAVIGATION.proprietaire;
    const { result } = renderHook(() => useFilteredNavigation(owner, new Set(), null, new Set()));
    expect(result.current).toBe(owner);
  });
});
