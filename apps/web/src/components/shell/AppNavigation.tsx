import React, { useMemo, useState } from 'react';
import { Input, Layout, Menu, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { HomeOutlined, SearchOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { NavGroup, PersonaNav } from '../../navigation/model';
import { resolveHref } from '../../navigation/resolve';
import type { NavContext } from '../../navigation/resolve';

const { Sider } = Layout;
const { Text } = Typography;

/**
 * Rendu du menu, commun à la sidebar, au rail et au drawer
 * (REFONTE_UI_UX.md §4.2).
 *
 * Trois corrections du drawer actuel sont appliquées ici :
 *   1. **une recherche de destination** en tête — plus rapide que déplier
 *      douze accordéons pour retrouver une entrée parmi cinquante ;
 *   2. **un seul groupe ouvert à la fois**, au lieu du comportement actuel qui
 *      laisse le groupe Syndic empiler ses douze enfants sous les autres ;
 *   3. le drawer porte **un bouton de fermeture visible** — `closable={false}`
 *      obligeait à taper le masque, geste ni découvrable ni accessible au
 *      clavier. Il est posé par `<AppShell>`, qui rend le `Drawer`.
 */

export interface AppNavigationProps {
  persona: PersonaNav;
  context: NavContext;
  /** `rail` : icônes seules, palier md (768-991). */
  variant: 'sidebar' | 'rail' | 'drawer';
  /** Le drawer n'affiche que la zone « more » quand il est ouvert par l'onglet « Plus ». */
  onlyMore?: boolean;
  onNavigate?: () => void;
}

/** Aplatit l'arbre en couples (libellé, href) pour la recherche de destination. */
function flatten(tree: NavGroup[], context: NavContext) {
  const out: { key: string; label: string; parent?: string; href: string }[] = [];
  for (const group of tree) {
    if (group.children?.length) {
      for (const child of group.children) {
        const href = resolveHref(child.href, context);
        if (href) out.push({ key: child.key, label: child.label, parent: group.label, href });
      }
    } else if (group.href) {
      const href = resolveHref(group.href, context);
      if (href) out.push({ key: group.key, label: group.label, href });
    }
  }
  return out;
}

export const AppNavigation: React.FC<AppNavigationProps> = ({
  persona,
  context,
  variant,
  onlyMore = false,
  onNavigate
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [openKeys, setOpenKeys] = useState<string[]>([]);

  const tree = useMemo(
    () => (onlyMore ? persona.tree.filter(g => g.zone === 'more') : persona.tree),
    [persona.tree, onlyMore]
  );

  const flat = useMemo(() => flatten(tree, context), [tree, context]);

  /** Destination active : le href le plus long qui préfixe le chemin courant. */
  const selectedKey = useMemo(() => {
    let best: { key: string; length: number } | null = null;
    for (const entry of flat) {
      const [path] = entry.href.split('?');
      const matches = location.pathname === path || location.pathname.startsWith(`${path}/`);
      if (matches && (!best || path.length > best.length)) {
        best = { key: entry.key, length: path.length };
      }
    }
    return best?.key;
  }, [flat, location.pathname]);

  const items: MenuProps['items'] = useMemo(() => {
    // En recherche, on rend une liste plate de résultats : replier les
    // accordéons pendant qu'on cherche annule le bénéfice de la recherche.
    if (query.trim().length > 0) {
      const needle = query.trim().toLowerCase();
      const hits = flat.filter(e => e.label.toLowerCase().includes(needle) || e.parent?.toLowerCase().includes(needle));
      if (hits.length === 0) return [{ key: 'aucun', label: 'Aucune destination', disabled: true }];
      return hits.map(e => ({
        key: e.key,
        label: e.parent ? (
          <span>
            {e.label} <Text type="secondary">· {e.parent}</Text>
          </span>
        ) : (
          e.label
        )
      }));
    }

    return tree
      .map(group => {
        if (group.children?.length) {
          const children = group.children
            .map(child => {
              const href = resolveHref(child.href, context);
              return href ? { key: child.key, label: child.label } : null;
            })
            .filter(Boolean) as { key: string; label: string }[];
          // Un groupe dont aucune destination n'est résolue est masqué plutôt
          // que rendu vide.
          if (children.length === 0) return null;
          return { key: group.key, icon: group.icon, label: group.label, children };
        }
        const href = group.href ? resolveHref(group.href, context) : null;
        if (!href) return null;
        return { key: group.key, icon: group.icon, label: group.label };
      })
      .filter(Boolean) as MenuProps['items'];
  }, [tree, context, query, flat]);

  const handleClick: MenuProps['onClick'] = ({ key }) => {
    const entry = flat.find(e => e.key === key);
    if (!entry) return;
    navigate(entry.href);
    onNavigate?.();
  };

  const menu = (
    <Menu
      theme="dark"
      mode="inline"
      items={items}
      selectedKeys={selectedKey ? [selectedKey] : []}
      openKeys={query ? [] : openKeys}
      // Un seul groupe ouvert : le comportement actuel laisse Syndic empiler
      // douze enfants sous les autres groupes.
      onOpenChange={keys => setOpenKeys(keys.slice(-1))}
      onClick={handleClick}
      inlineCollapsed={variant === 'rail'}
      style={{ background: 'transparent', borderInlineEnd: 'none' }}
    />
  );

  const brand = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        minHeight: 64
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <HomeOutlined style={{ color: 'var(--surface-card)', fontSize: 20 }} />
      </div>
      {variant !== 'rail' && (
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: 'var(--text-on-inverse)',
              fontWeight: 'var(--font-weight-semibold)' as unknown as number,
              lineHeight: 1.2
            }}
          >
            ImmoPro
          </div>
          <div
            style={{
              color: 'var(--text-on-inverse-muted)',
              fontSize: 'var(--font-size-caption)',
              lineHeight: 1.2
            }}
          >
            {persona.label}
          </div>
        </div>
      )}
    </div>
  );

  const body = (
    <>
      {brand}
      {/* La recherche de destination n'a de sens que sur un arbre profond. */}
      {variant !== 'rail' && flat.length > 12 && (
        <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
          <Input
            allowClear
            value={query}
            onChange={e => setQuery(e.target.value)}
            prefix={<SearchOutlined />}
            placeholder="Rechercher une destination"
            aria-label="Rechercher une destination dans le menu"
          />
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>{menu}</div>
    </>
  );

  if (variant === 'drawer') {
    return <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{body}</div>;
  }

  return (
    <Sider
      width={256}
      collapsed={variant === 'rail'}
      // Rail de 72 px au palier md : icônes seules (§3.4).
      collapsedWidth={72}
      style={{
        position: 'fixed',
        insetBlock: 0,
        insetInlineStart: 0,
        zIndex: 'var(--z-sidebar)' as unknown as number,
        background: 'var(--surface-inverse)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {body}
    </Sider>
  );
};
