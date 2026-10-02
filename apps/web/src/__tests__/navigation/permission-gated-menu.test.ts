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
