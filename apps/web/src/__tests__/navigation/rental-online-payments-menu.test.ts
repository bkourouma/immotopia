import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { getNavigation } from '../../navigation/model';
import type { NavGroup } from '../../navigation/model';
import { useFilteredNavigation } from '../../hooks/useMenuAccess';

const nav = getNavigation().collaborateur;

function visible(permissions: string[]): NavGroup[] {
  const { result } = renderHook(() =>
    useFilteredNavigation(nav, new Set<string>(), null, false, new Set(permissions), new Set<string>())
  );
  return result.current?.tree ?? [];
}
const leafKeys = (tree: NavGroup[], group: string) =>
  (tree.find(g => g.key === group)?.children ?? []).map(leaf => leaf.key);

describe('entrée de menu « Paiements en ligne » du locatif', () => {
  it('existe sous Encaisser, juste après Paiements', () => {
    const keys = leafKeys(nav.tree, 'encaisser');
    expect(keys).toContain('rental-online-payments');
    expect(keys.indexOf('rental-online-payments')).toBe(keys.indexOf('rental-payments') + 1);
  });

  it('est cachée sans RENTAL_PAYMENTS_VIEW', () => {
    expect(leafKeys(visible(['RENTAL_INSTALLMENTS_VIEW']), 'encaisser')).not.toContain('rental-online-payments');
  });

  it('est visible avec RENTAL_PAYMENTS_VIEW', () => {
    expect(leafKeys(visible(['RENTAL_PAYMENTS_VIEW']), 'encaisser')).toContain('rental-online-payments');
  });
});
