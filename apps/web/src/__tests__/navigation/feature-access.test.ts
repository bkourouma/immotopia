import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NAVIGATION } from '../../navigation/model';
import { applyFeatureAccess, applyOwnAssetsOnly, featureAccessFromModules } from '../../navigation/feature-access';
import { catalogForPersona } from '../../navigation/menu-catalog';
import { useFilteredNavigation } from '../../hooks/useMenuAccess';

/** Menu et abonnement (vague 2, lot A). */
const nav = NAVIGATION.collaborateur;
const keys = (tree: { key: string }[]) => tree.map(g => g.key);

describe('featureAccessFromModules', () => {
  it('une fonctionnalité est ouverte si un de ses modules est complet', () => {
    const access = featureAccessFromModules({ MODULE_SYNDIC: 'FULL' });
    expect(access.CORE).toBe('FULL');
    expect(access.SYNDIC).toBe('FULL');
    expect(access.RENTAL).toBe('NONE');
    expect(access.CONSTRUCTION).toBe('NONE');
  });

  it('module retiré : ses fonctionnalités passent en lecture seule, sauf si un autre module les porte', () => {
    const access = featureAccessFromModules({ MODULE_AGENCY: 'FULL', MODULE_PROMOTER: 'READ_ONLY' });
    expect(access.CONSTRUCTION).toBe('READ_ONLY');
    expect(access.CRM).toBe('FULL');
  });
});

describe('navigation filtrée par l’abonnement', () => {
  it('agence Syndic seule : ni baux, ni chantiers, ni ventes ; syndic et socle présents', () => {
    const { result } = renderHook(() =>
      useFilteredNavigation(nav, new Set(), featureAccessFromModules({ MODULE_SYNDIC: 'FULL' }))
    );
    const tree = result.current!.tree;
    expect(keys(tree)).toContain('syndic');
    expect(keys(tree)).toContain('biens');
    for (const gone of [
      'baux',
      'encaisser',
      'finance-chantiers-stock',
      'finance-main-oeuvre',
      'ventes',
      'patrimoine'
    ]) {
      expect(keys(tree)).not.toContain(gone);
    }
    // Le groupe CRM garde les contacts (socle) et pointe vers eux.
    const crm = tree.find(g => g.key === 'crm')!;
    expect(crm.children!.map(c => c.key)).toEqual(['crm-contacts']);
    expect(crm.href).toBe('/tenant/:tenantId/crm/contacts');
    // Onglets du bas : Baux et Encaisser suivent l'arbre.
    expect(result.current!.tabs.map(t => t.key)).toEqual(['tab-accueil', 'tab-biens', 'tab-plus']);
  });

  it('module retiré : entrée conservée, marquée lecture seule', () => {
    const access = featureAccessFromModules({ MODULE_AGENCY: 'FULL', MODULE_SYNDIC: 'READ_ONLY' });
    const syndic = applyFeatureAccess(
      nav.tree.find(g => g.key === 'syndic')!,
      access
    )!;
    expect(syndic.readOnly).toBe(true);
    expect(syndic.children!.every(c => c.readOnly)).toBe(true);
  });

  it('sans droits connus (null) : navigation inchangée', () => {
    const { result } = renderHook(() => useFilteredNavigation(nav, new Set(), null));
    expect(result.current).toBe(nav);
  });

  it('barrière « détenu en propre » (pack Patrimoine seul) : retire mandat/relevés/comptes propriétaires', () => {
    const access = featureAccessFromModules({ MODULE_PATRIMOINE: 'FULL' });
    const { result } = renderHook(() => useFilteredNavigation(nav, new Set(), access, true));
    const tree = result.current!.tree;
    const patrimoine = tree.find(g => g.key === 'patrimoine')!;
    expect(patrimoine.children!.map(c => c.key)).not.toContain('patrimoine-statements');
    const finance = tree.find(g => g.key === 'finance-clients-proprietaires')!;
    expect(finance.children!.map(c => c.key)).not.toContain('finance-owner-accounts');
  });

  it('sans barrière « détenu en propre » : relevés et comptes propriétaires restent visibles', () => {
    const access = featureAccessFromModules({ MODULE_AGENCY: 'FULL' });
    const { result } = renderHook(() => useFilteredNavigation(nav, new Set(), access, false));
    const tree = result.current!.tree;
    expect(tree.find(g => g.key === 'patrimoine')!.children!.map(c => c.key)).toContain('patrimoine-statements');
    expect(tree.find(g => g.key === 'finance-clients-proprietaires')!.children!.map(c => c.key)).toContain(
      'finance-owner-accounts'
    );
  });

  it('applyOwnAssetsOnly : un groupe sans entrée réservée à un tiers est renvoyé tel quel', () => {
    const syndic = nav.tree.find(g => g.key === 'syndic')!;
    expect(applyOwnAssetsOnly(syndic, true)).toBe(syndic);
  });

  it('le catalogue des menus expose la fonctionnalité de chaque entrée', () => {
    const entries = catalogForPersona('collaborateur').flatMap(s => s.entries);
    expect(entries.find(e => e.menuKey === 'collaborateur.syndic')!.feature).toBe('SYNDIC');
    const crm = entries.find(e => e.menuKey === 'collaborateur.crm')!;
    expect(crm.children.find(c => c.menuKey.endsWith('crm-deals'))!.feature).toBe('CRM');
    expect(crm.children.find(c => c.menuKey.endsWith('crm-contacts'))!.feature).toBe('CORE');
  });
});
