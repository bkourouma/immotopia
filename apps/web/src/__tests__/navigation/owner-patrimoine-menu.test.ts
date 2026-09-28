import { renderHook } from '@testing-library/react';
import { NAVIGATION } from '../../navigation/model';
import { useFilteredNavigation } from '../../hooks/useMenuAccess';
import { OWNER_PATRIMOINE_MENU_KEY, withOwnerPatrimoineMenu } from '../../navigation/owner-patrimoine-menu';

/**
 * « Mon patrimoine » (portail propriétaire, lot P5) est masqué par un réglage
 * d'agence (`GET /portal/owner/patrimoine/settings` → `enabled`), pas par le
 * RBAC. `withOwnerPatrimoineMenu` fusionne ce réglage dans l'ensemble des
 * menus coupés que `useFilteredNavigation` sait déjà élaguer.
 */
describe('menu « Mon patrimoine » — masqué par le réglage d’agence', () => {
  it('ne coupe rien tant que la réponse n’est pas arrivée (`enabled === null`)', () => {
    expect(withOwnerPatrimoineMenu(new Set(), null)).toEqual(new Set());
  });

  it('ne coupe rien quand la vue est activée', () => {
    expect(withOwnerPatrimoineMenu(new Set(), true)).toEqual(new Set());
  });

  it('ajoute la clé du menu quand la vue est désactivée', () => {
    const result = withOwnerPatrimoineMenu(new Set(), false);
    expect(result.has(OWNER_PATRIMOINE_MENU_KEY)).toBe(true);
  });

  it('ne modifie pas l’ensemble d’origine (immutabilité)', () => {
    const original = new Set(['autre.cle']);
    const result = withOwnerPatrimoineMenu(original, false);
    expect(original.has(OWNER_PATRIMOINE_MENU_KEY)).toBe(false);
    expect(result.has('autre.cle')).toBe(true);
  });

  it('fait disparaître l’entrée « Mon patrimoine » de la navigation filtrée quand la vue est masquée', () => {
    const disabled = withOwnerPatrimoineMenu(new Set(), false);
    const nav = renderHook(() => useFilteredNavigation(NAVIGATION.proprietaire, disabled)).result.current;

    expect(nav?.tree.some(group => group.key === 'mon-patrimoine')).toBe(false);
    // Le reste du portefeuille reste visible : seule cette entrée est coupée.
    expect(nav?.tree.some(group => group.key === 'biens')).toBe(true);
  });

  it('laisse « Mon patrimoine » visible quand la vue est activée', () => {
    const disabled = withOwnerPatrimoineMenu(new Set(), true);
    const nav = renderHook(() => useFilteredNavigation(NAVIGATION.proprietaire, disabled)).result.current;

    expect(nav?.tree.some(group => group.key === 'mon-patrimoine')).toBe(true);
  });
});
