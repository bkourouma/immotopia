import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { getNavigation } from '../../navigation/model';
import type { NavGroup } from '../../navigation/model';
import { menuKeyFor } from '../../navigation/menu-catalog';
import { useFilteredNavigation } from '../../hooks/useMenuAccess';

const get = vi.fn();
vi.mock('../../utils/api-client', () => ({ default: { get: (...a: unknown[]) => get(...a) } }));

import { getMyDisabledMenus, getMyMenuAccess } from '../../services/role-menu-service';

const nav = getNavigation().collaborateur;

/** Navigation du collaborateur pour des permissions données et des ouvertures explicites. */
function visible(permissions: string[], enabled: string[] = [], disabled: string[] = []): NavGroup[] {
  const { result } = renderHook(() =>
    useFilteredNavigation(nav, new Set(disabled), null, false, new Set(permissions), new Set(enabled))
  );
  return result.current!.tree;
}
const groupKeys = (tree: NavGroup[]) => tree.map(g => g.key);
const leafKeys = (tree: NavGroup[], group: string) =>
  (tree.find(g => g.key === group)?.children ?? []).map(leaf => leaf.key);

describe('menu Patrimoine selon les permissions réelles (BUG-2026-10-02-010 / -004)', () => {
  it('sans PROPERTIES_VIEW et sans décision : les groupes Patrimoine et Biens sont masqués', () => {
    const tree = visible(['FINANCE_REPORTS_READ']);
    expect(groupKeys(tree)).not.toContain('patrimoine');
    expect(groupKeys(tree)).not.toContain('biens');
  });

  it('avec PROPERTIES_VIEW : Sinistres, Foncier et Accès partagés restent ouverts', () => {
    const tree = visible(['PROPERTIES_VIEW']);
    expect(groupKeys(tree)).toContain('patrimoine');
    expect(leafKeys(tree, 'patrimoine')).toEqual(
      expect.arrayContaining(['patrimoine-claims', 'patrimoine-land', 'patrimoine-external-access'])
    );
  });

  it('chaque feuille suit sa propre exigence : l’import réclame CREATE ou EDIT', () => {
    expect(leafKeys(visible(['PROPERTIES_VIEW']), 'patrimoine')).not.toContain('patrimoine-import');
    expect(leafKeys(visible(['PROPERTIES_VIEW', 'PROPERTIES_EDIT']), 'patrimoine')).toContain('patrimoine-import');
  });

  it('le groupe Patrimoine du menu existe bien sous la clé testée', () => {
    expect(leafKeys(nav.tree, 'patrimoine')).toEqual(
      expect.arrayContaining(['patrimoine-claims', 'patrimoine-land', 'patrimoine-external-access'])
    );
  });
});

describe('le choix de l’agence prime sur la permission', () => {
  const patrimoine = menuKeyFor('collaborateur', 'patrimoine');
  const patrimoineClaims = menuKeyFor('collaborateur', 'patrimoine', 'patrimoine-claims');

  it('menu ouvert explicitement mais sans permission : visible', () => {
    const tree = visible(['FINANCE_REPORTS_READ'], [patrimoine, patrimoineClaims]);
    expect(groupKeys(tree)).toContain('patrimoine');
    expect(leafKeys(tree, 'patrimoine')).toEqual(['patrimoine-claims']);
  });

  it('menu sans décision et sans permission : masqué', () => {
    expect(groupKeys(visible(['FINANCE_REPORTS_READ'], []))).not.toContain('patrimoine');
    // Une ouverture sur une AUTRE clé ne dispense pas celle-ci.
    expect(groupKeys(visible(['FINANCE_REPORTS_READ'], [menuKeyFor('collaborateur', 'crm')]))).not.toContain(
      'patrimoine'
    );
  });

  it('une coupure explicite l’emporte toujours, même avec la permission', () => {
    const tree = visible(['PROPERTIES_VIEW'], [], [patrimoine]);
    expect(groupKeys(tree)).not.toContain('patrimoine');
  });

  it('Finance reste masquée par défaut sans droit financier, ouverte si l’agence l’ouvre', () => {
    const caisse = menuKeyFor('collaborateur', 'finance-caisse-compta');
    const compta = menuKeyFor('collaborateur', 'finance-caisse-compta', 'finance-comptabilite');
    expect(groupKeys(visible(['PROPERTIES_VIEW']))).not.toContain('finance-caisse-compta');
    expect(groupKeys(visible(['PROPERTIES_VIEW'], [caisse, compta]))).toContain('finance-caisse-compta');
  });
});

describe('getMyMenuAccess', () => {
  beforeEach(() => get.mockReset());

  it('rend telles quelles les coupures, les ouvertures explicites et les permissions du serveur', async () => {
    get.mockResolvedValue({
      data: {
        data: {
          disabledMenuKeys: ['collaborateur.crm'],
          enabledMenuKeys: ['collaborateur.patrimoine'],
          permissionKeys: ['FINANCE_REPORTS_READ']
        }
      }
    });
    expect(await getMyMenuAccess('agence-1')).toEqual({
      disabledMenuKeys: ['collaborateur.crm'],
      enabledMenuKeys: ['collaborateur.patrimoine'],
      permissionKeys: ['FINANCE_REPORTS_READ']
    });
  });

  it('ancien serveur (sans enabledMenuKeys) : aucune ouverture explicite, rien n’est déduit', async () => {
    get.mockResolvedValue({ data: { data: { disabledMenuKeys: ['collaborateur.crm'] } } });
    expect(await getMyMenuAccess('agence-1')).toEqual({
      disabledMenuKeys: ['collaborateur.crm'],
      enabledMenuKeys: [],
      permissionKeys: null
    });
    expect(await getMyDisabledMenus('agence-1')).toEqual(['collaborateur.crm']);
  });
});

describe('Chantiers et stock selon les permissions réelles (lot 040, ecrans §2.3)', () => {
  const GROUPE = 'finance-chantiers-stock';
  const MAGASINIER = [
    'STOCK_VIEW',
    'STOCK_RECEIVE',
    'STOCK_ISSUE',
    'STOCK_TRANSFER',
    'STOCK_COUNT',
    'STOCK_TAKERS_MANAGE'
  ];

  it('magasinier (seulement STOCK_*) : Gestion du stock visible, Suivi des chantiers fermé', () => {
    const tree = visible(MAGASINIER);
    expect(groupKeys(tree)).toContain(GROUPE);
    expect(leafKeys(tree, GROUPE)).toEqual(['finance-stock']);
  });

  it('comptable (FINANCE_ACCOUNTS_READ et STOCK_VIEW) : les deux entrées sont ouvertes', () => {
    const tree = visible(['FINANCE_ACCOUNTS_READ', 'STOCK_VIEW']);
    expect(leafKeys(tree, GROUPE)).toEqual(['finance-chantiers', 'finance-stock']);
  });

  it('FINANCE_ACCOUNTS_READ sans STOCK_VIEW : le suivi des chantiers sans la gestion du stock', () => {
    expect(leafKeys(visible(['FINANCE_ACCOUNTS_READ']), GROUPE)).toEqual(['finance-chantiers']);
  });

  it('ni l’un ni l’autre : le groupe entier est fermé', () => {
    expect(groupKeys(visible(['RENTAL_LEASES_VIEW']))).not.toContain(GROUPE);
  });

  it('le groupe et ses deux entrées existent bien sous les clés testées', () => {
    expect(leafKeys(nav.tree, GROUPE)).toEqual(['finance-chantiers', 'finance-stock']);
  });
});
