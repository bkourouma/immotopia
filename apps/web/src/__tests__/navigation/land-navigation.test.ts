import { describe, it, expect } from 'vitest';
import { getNavigation } from '../../navigation/model';
import { catalogForPersona, menuKeyFor } from '../../navigation/menu-catalog';
import { featureForAgencyPath } from '../../navigation/route-features';

/** Lot B2 : entrée « Régularisation foncière » dans la section Patrimoine. */
describe('navigation — régularisation foncière', () => {
  const nav = getNavigation().collaborateur;
  const patrimoine = nav.tree.find(group => group.key === 'patrimoine');

  it('ajoute l’entrée dans le groupe Patrimoine, vers la liste des dossiers', () => {
    const entree = (patrimoine?.children ?? []).find(child => child.key === 'patrimoine-land');
    expect(entree?.label).toBe('Régularisation foncière');
    expect(entree?.href).toBe('/tenant/:tenantId/patrimoine/land');
  });

  it('le catalogue des menus connaît l’entrée, ouverte avec la permission des biens', () => {
    const feuilles = catalogForPersona('collaborateur').flatMap(section =>
      section.entries.flatMap(entry => entry.children)
    );
    const feuille = feuilles.find(
      item => item.menuKey === menuKeyFor('collaborateur', 'patrimoine', 'patrimoine-land')
    );
    expect(feuille).toBeDefined();
    expect(feuille?.requires).toEqual(['PROPERTIES_VIEW']);
    expect(feuille?.feature).toBe('PATRIMOINE');
  });

  it('la route est rattachée à la fonctionnalité PATRIMOINE', () => {
    expect(featureForAgencyPath('/tenant/agence-1/patrimoine/land')).toBe('PATRIMOINE');
    expect(featureForAgencyPath('/tenant/agence-1/patrimoine/land/reg-1')).toBe('PATRIMOINE');
  });
});
