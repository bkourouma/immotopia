import React, { useMemo, useState } from 'react';
import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { NavGroup, PersonaNav, SectionId } from '../../navigation/model';
import { SECTION_LABELS } from '../../navigation/model';
import { resolveHref } from '../../navigation/resolve';
import type { NavContext } from '../../navigation/resolve';
import logoImmoTopia from '../../assets/logo-immotopia.png';
import { t } from '../../i18n/t';

const { Sider } = Layout;

/**
 * Rendu du menu, commun à la sidebar, au rail et au drawer
 * (REFONTE_UI_UX.md §4.2).
 *
 * Deux corrections du drawer actuel sont appliquées ici :
 *   1. **un seul groupe ouvert à la fois**, au lieu du comportement actuel qui
 *      laisse le groupe Syndic empiler ses douze enfants sous les autres ;
 *   2. le drawer porte **un bouton de fermeture visible** — `closable={false}`
 *      obligeait à taper le masque, geste ni découvrable ni accessible au
 *      clavier. Il est posé par `<AppShell>`, qui rend le `Drawer`.
 *
 * La recherche de destination qui coiffait le menu a été retirée : elle
 * occupait la place juste sous le logo, là où commence la liste.
 *
 * **Les intertitres de domaine.** `NavGroup.section` devient un
 * `type: 'group'` d'AntD : un titre non cliquable, sans chevron, qui ne replie
 * rien. « Gestion locative » coiffe ainsi Baux et Encaisser sans les enterrer
 * d'un tap — la lisibilité de l'accordéon, sans son coût. Une exception : le
 * rail, en icônes seules, où un intertitre serait tronqué.
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

/** Aplatit l'arbre en couples (libellé, href) : destination active et clics. */
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
    const entries = tree
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
          return { section: group.section, item: { key: group.key, icon: group.icon, label: group.label, children } };
        }
        const href = group.href ? resolveHref(group.href, context) : null;
        if (!href) return null;
        return { section: group.section, item: { key: group.key, icon: group.icon, label: group.label } };
      })
      .filter(Boolean) as { section?: SectionId; item: NonNullable<MenuProps['items']>[number] }[];

    // Le rail n'affiche que des icônes : un intertitre y serait tronqué en
    // trois lettres illisibles. Il reste plat.
    if (variant === 'rail') return entries.map(e => e.item);

    // Les entrées d'un même domaine sont contiguës dans le modèle : il suffit
    // de fermer le bloc courant quand la section change.
    const out: NonNullable<MenuProps['items']> = [];
    let current: SectionId | undefined;
    for (const entry of entries) {
      if (entry.section && entry.section !== current) {
        out.push({
          key: `section:${entry.section}`,
          type: 'group',
          label: SECTION_LABELS()[entry.section],
          children: []
        });
      }
      // Une entrée sans domaine qui suit un bloc titré se lit comme le dernier
      // élément de ce bloc — « Plus » paraissait relever de « Suivi des
      // bâtiments ». Un filet la détache de ce qu'elle ne rejoint pas.
      if (!entry.section && current) out.push({ key: `apres:${entry.item?.key}`, type: 'divider' });
      current = entry.section;
      const last = out[out.length - 1];
      if (entry.section && last && 'type' in last && last.type === 'group') {
        (last.children as NonNullable<MenuProps['items']>).push(entry.item);
      } else {
        out.push(entry.item);
      }
    }
    return out;
  }, [tree, context, variant]);

  const handleClick: MenuProps['onClick'] = ({ key }) => {
    const entry = flat.find(e => e.key === key);
    if (!entry) return;
    navigate(entry.href);
    onNavigate?.();
  };

  const menu = (
    <Menu
      // Fond clair depuis que la navigation porte le logo de marque : le thème
      // sombre d'AntD y rendrait les libellés en slate-100 sur blanc.
      theme="light"
      mode="inline"
      items={items}
      selectedKeys={selectedKey ? [selectedKey] : []}
      openKeys={openKeys}
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
        minHeight: 64,
        // Hors du flux défilant : le bandeau garde sa hauteur quel que soit le
        // nombre de destinations sous lui.
        flexShrink: 0
      }}
    >
      {/* Le rail ne fait que 72 px : la signature y tiendrait sur 56 px de
          large, soit onze pixels de haut — une tache. Il garde donc la pastille
          carrée, seul format lisible à cette taille. */}
      {variant === 'rail' ? (
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
      ) : (
        <div style={{ minWidth: 0 }}>
          {/* Le logo est posé directement sur `--surface-nav`, sans cartouche ni
              retouche : c'est pour lui que la navigation est passée sur fond
              clair (voir `--surface-nav` dans tokens.css). */}
          <img
            src={logoImmoTopia}
            alt={'ImmoTopia'}
            width={148}
            height={46}
            style={{ display: 'block', width: 148, maxWidth: '100%', height: 'auto' }}
          />
          <div
            style={{
              color: 'var(--text-secondary)',
              fontSize: 'var(--font-size-caption)',
              lineHeight: 1.2,
              marginTop: 'var(--space-2)'
            }}
          >
            {persona.label}
          </div>
        </div>
      )}
    </div>
  );

  /**
   * Colonne de hauteur fixe : le bandeau de marque ne bouge pas, **seule la
   * liste des destinations défile**.
   *
   * Le `flex: 1` ne suffit pas seul : sans `minHeight: 0`, un élément flex ne
   * descend pas sous la hauteur de son contenu, la colonne déborde et c'est la
   * page entière qui défile — logo compris. `overscroll-behavior: contain`
   * ferme le dernier passage : arrivé en bout de menu, le geste ne se propage
   * plus au document derrière.
   */
  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {brand}
      <div
        className="app-nav-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain'
        }}
      >
        {menu}
      </div>
    </div>
  );

  if (variant === 'drawer') return body;

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
        background: 'var(--surface-nav)',
        // Sans ce filet, le blanc de la sidebar et le #F8FAFC de la page se
        // touchent sans limite lisible : 1,04:1 entre les deux surfaces.
        borderInlineEnd: '1px solid var(--border-nav)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {body}
    </Sider>
  );
};
