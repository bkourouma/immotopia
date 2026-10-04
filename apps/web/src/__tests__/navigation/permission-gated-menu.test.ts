import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNavigation } from '../../navigation/model';
import { menuKeyFor, menuKeysDeniedByPermissions } from '../../navigation/menu-catalog';

const get = vi.fn();
vi.mock('../../utils/api-client', () => ({ default: { get: (...a: unknown[]) => get(...a) } }));

import { getMyDisabledMenus } from '../../services/role-menu-service';

const cleGroupe = menuKeyFor('collaborateur', 'patrimoine');
const cleFeuille = (leaf: string) => menuKeyFor('collaborateur', 'patrimoine', leaf);

describe('menu Patrimoine selon les permissions réelles (BUG-2026-10-02-010 / -004)', () => {
  it('sans PROPERTIES_VIEW : les groupes Patrimoine et Biens sont fermés', () => {
    const denied = menuKeysDeniedByPermissions('collaborateur', ['FINANCE_REPORTS_READ']);
    expect(denied).toContain(cleGroupe);
    expect(denied).toContain(menuKeyFor('collaborateur', 'biens'));
  });

  it('avec PROPERTIES_VIEW : Sinistres, Foncier et Accès partagés restent ouverts', () => {
    const denied = menuKeysDeniedByPermissions('collaborateur', ['PROPERTIES_VIEW']);
    for (const leaf of ['patrimoine-claims', 'patrimoine-land', 'patrimoine-external-access']) {
      expect(denied).not.toContain(cleFeuille(leaf));
    }
    expect(denied).not.toContain(cleGroupe);
  });

  it('chaque feuille suit sa propre exigence : l’import réclame CREATE ou EDIT', () => {
    expect(menuKeysDeniedByPermissions('collaborateur', ['PROPERTIES_VIEW'])).toContain(
      cleFeuille('patrimoine-import')
    );
    expect(menuKeysDeniedByPermissions('collaborateur', ['PROPERTIES_VIEW', 'PROPERTIES_EDIT'])).not.toContain(
      cleFeuille('patrimoine-import')
    );
  });

  it('le groupe Patrimoine du menu existe bien sous la clé testée', () => {
    const groupe = getNavigation().collaborateur.tree.find(item => item.key === 'patrimoine');
    expect((groupe?.children ?? []).map(leaf => leaf.key)).toEqual(
      expect.arrayContaining(['patrimoine-claims', 'patrimoine-land', 'patrimoine-external-access'])
    );
  });
});

describe('getMyDisabledMenus', () => {
  beforeEach(() => get.mockReset());

  it('ajoute aux coupures du serveur les entrées que les permissions ne permettent pas d’ouvrir', async () => {
    get.mockResolvedValue({
      data: { data: { disabledMenuKeys: ['collaborateur.crm'], permissions: ['FINANCE_REPORTS_READ'] } }
    });
    const keys = await getMyDisabledMenus('agence-1');
    expect(keys).toContain('collaborateur.crm');
    expect(keys).toContain(cleGroupe);
  });

  it('sans permissions dans la réponse (ancien serveur, plateforme) : rien n’est déduit', async () => {
    get.mockResolvedValue({ data: { data: { disabledMenuKeys: ['collaborateur.crm'] } } });
    expect(await getMyDisabledMenus('agence-1')).toEqual(['collaborateur.crm']);
  });
});

describe('Chantiers et stock selon les permissions réelles (lot 040, ecrans §2.3)', () => {
  const groupe = menuKeyFor('collaborateur', 'finance-chantiers-stock');
  const stock = menuKeyFor('collaborateur', 'finance-chantiers-stock', 'finance-stock');
  const chantiers = menuKeyFor('collaborateur', 'finance-chantiers-stock', 'finance-chantiers');

  it('magasinier (seulement STOCK_*) : Gestion du stock visible, Suivi des chantiers fermé', () => {
    const denied = menuKeysDeniedByPermissions('collaborateur', [
      'STOCK_VIEW',
      'STOCK_RECEIVE',
      'STOCK_ISSUE',
      'STOCK_TRANSFER',
      'STOCK_COUNT',
      'STOCK_TAKERS_MANAGE'
    ]);
    expect(denied).not.toContain(groupe);
    expect(denied).not.toContain(stock);
    expect(denied).toContain(chantiers);
  });

  it('comptable (FINANCE_ACCOUNTS_READ et STOCK_VIEW) : les deux entrées sont ouvertes', () => {
    const denied = menuKeysDeniedByPermissions('collaborateur', ['FINANCE_ACCOUNTS_READ', 'STOCK_VIEW']);
    expect(denied).not.toContain(groupe);
    expect(denied).not.toContain(stock);
    expect(denied).not.toContain(chantiers);
  });

  it('FINANCE_ACCOUNTS_READ sans STOCK_VIEW : le suivi des chantiers sans la gestion du stock', () => {
    const denied = menuKeysDeniedByPermissions('collaborateur', ['FINANCE_ACCOUNTS_READ']);
    expect(denied).not.toContain(chantiers);
    expect(denied).toContain(stock);
  });

  it('ni l’un ni l’autre : le groupe entier est fermé', () => {
    const denied = menuKeysDeniedByPermissions('collaborateur', ['RENTAL_LEASES_VIEW']);
    expect(denied).toContain(groupe);
  });

  it('le groupe et ses deux entrées existent bien sous les clés testées', () => {
    const entree = getNavigation().collaborateur.tree.find(item => item.key === 'finance-chantiers-stock');
    expect((entree?.children ?? []).map(leaf => leaf.key)).toEqual(['finance-chantiers', 'finance-stock']);
  });
});
