import { describe, it, expect } from 'vitest';
import { featureAccessFromModules } from '../../navigation/feature-access';
import type { ModuleAccessLevel } from '../../navigation/feature-access';
import {
  FINANCE_WORKSPACES,
  filterWorkspaceTabsByAccess,
  financeWorkspaceTabs
} from '../../navigation/finance-workspaces';
import type { FinanceWorkspaceFamily } from '../../navigation/finance-workspaces';

/** BUG-075 / BUG-077 : les onglets des espaces Finance suivent l'abonnement, comme le menu. */
const FAMILIES = Object.keys(FINANCE_WORKSPACES) as FinanceWorkspaceFamily[];

function keys(family: FinanceWorkspaceFamily, modules: Record<string, ModuleAccessLevel> | null) {
  const access = modules ? featureAccessFromModules(modules) : null;
  return filterWorkspaceTabsByAccess(financeWorkspaceTabs(family, 't1'), access).map(tab => tab.key);
}

describe('onglets des espaces Finance par pack', () => {
  it('AGENCE : ni Bons de commande ni Associations ; locatif et socle conservés', () => {
    const m = { MODULE_AGENCY: 'FULL' } as const;
    expect(keys('fournisseurs-commandes', m)).toEqual(['fournisseurs', 'balance-fournisseurs']);
    expect(keys('reversements-commissions', m)).toEqual(['owner-accounts', 'commissions']);
    expect(keys('suivi-chantiers', m)).toEqual([]);
    expect(keys('gestion-stock', m)).toEqual([]);
    expect(keys('caisse-tresorerie', m)).toEqual(['caisse', 'tresorerie']);
    expect(keys('facturation-balances', m)).toHaveLength(3);
  });

  it('SYNDIC : plus de locatif ni de chantier, socle conservé', () => {
    const m = { MODULE_SYNDIC: 'FULL' } as const;
    expect(keys('fournisseurs-commandes', m)).toEqual(['fournisseurs', 'balance-fournisseurs']);
    expect(keys('reversements-commissions', m)).toEqual([]);
    expect(keys('saisie-validation', m)).toHaveLength(2);
  });

  it('PROMOTEUR : chantier et bons de commande visibles, locatif retiré', () => {
    const m = { MODULE_PROMOTER: 'FULL' } as const;
    expect(keys('fournisseurs-commandes', m)).toHaveLength(3);
    expect(keys('reversements-commissions', m)).toEqual(['associations']);
    expect(keys('suivi-chantiers', m)).toHaveLength(3);
    // Lot 040 : les six onglets du stock, tous sous `finance/stock`, donc
    // classés CONSTRUCTION sans rien déclarer de plus.
    expect(keys('gestion-stock', m)).toEqual([
      'stock',
      'stock-magasin',
      'stock-inventaire',
      'stock-preneurs',
      'stock-controle',
      'stock-parametrage'
    ]);
  });

  it('INTEGRE : tout visible', () => {
    const m = { MODULE_AGENCY: 'FULL', MODULE_SYNDIC: 'FULL', MODULE_PROMOTER: 'FULL' } as const;
    for (const family of FAMILIES) {
      expect(keys(family, m)).toHaveLength(FINANCE_WORKSPACES[family].tabs.length);
    }
  });

  it('PATRIMOINE : locatif visible, chantier retiré', () => {
    const m = { MODULE_PATRIMOINE: 'FULL' } as const;
    expect(keys('reversements-commissions', m)).toEqual(['owner-accounts', 'commissions']);
    expect(keys('fournisseurs-commandes', m)).toEqual(['fournisseurs', 'balance-fournisseurs']);
  });

  it('droits inconnus ou lecture seule : tout visible', () => {
    for (const family of FAMILIES) {
      expect(keys(family, null)).toHaveLength(FINANCE_WORKSPACES[family].tabs.length);
    }
    expect(keys('fournisseurs-commandes', { MODULE_AGENCY: 'FULL', MODULE_PROMOTER: 'READ_ONLY' })).toHaveLength(3);
  });
});

describe('Gestion du stock — onglets du lot 041', () => {
  it('« Comptages terrain » puis « WhatsApp », juste avant « Articles et lieux » qui reste le dernier', () => {
    const cles = FINANCE_WORKSPACES['gestion-stock'].tabs.map(tab => tab.key);
    const terrain = cles.indexOf('stock-comptages-terrain');
    const whatsapp = cles.indexOf('stock-whatsapp');
    expect(terrain).toBeGreaterThan(-1);
    expect(whatsapp).toBe(terrain + 1);
    expect(cles[cles.length - 1]).toBe('stock-parametrage');
    expect(cles.indexOf('stock-parametrage')).toBe(whatsapp + 1);
  });

  it('routes sous finance/stock : suivent la fonctionnalité CONSTRUCTION comme les autres onglets du stock', () => {
    const hrefs = financeWorkspaceTabs('gestion-stock', 't1').map(tab => tab.href);
    expect(hrefs).toContain('/tenant/t1/finance/stock/comptages-terrain');
    expect(hrefs).toContain('/tenant/t1/finance/stock/whatsapp');
    expect(keys('gestion-stock', { MODULE_AGENCY: 'FULL' })).toEqual([]);
    expect(keys('gestion-stock', { MODULE_PROMOTER: 'FULL' })).toEqual(
      expect.arrayContaining(['stock-comptages-terrain', 'stock-whatsapp'])
    );
  });
});
