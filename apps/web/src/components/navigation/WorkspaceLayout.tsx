import React from 'react';
import { Outlet } from 'react-router-dom';
import { Skeleton, Typography } from 'antd';
import { WorkspaceTabs } from './WorkspaceTabs';
import type { WorkspaceTabItem } from './WorkspaceTabs';

const { Title, Text } = Typography;

/**
 * `<WorkspaceLayout>` — en-tête + barre d'onglets + `<Outlet/>`, commun à
 * tous les espaces à onglets (Syndic, Finance).
 *
 * Purement présentationnel : il ne charge rien et ne sait rien du module qui
 * l'emploie. C'est la route de layout propre à chaque module
 * (`SyndicWorkspaceLayout`, `FinanceWorkspaceLayout`) qui décide du libellé,
 * du titre et des onglets — le syndic va chercher le nom de la copropriété,
 * la finance n'a besoin d'aucun appel réseau.
 *
 * Posé comme route de layout autour de `<Route>` existantes dans `App.tsx` :
 * aucune URL ne change, seul ce bandeau apparaît au-dessus de chaque écran.
 * L'écran rendu par `<Outlet/>` garde son propre `<PageHeader>` ; celui-ci ne
 * fait que situer — dans quelle famille d'écrans, à quel onglet.
 */

export interface WorkspaceLayoutProps {
  /** Petit libellé en capitales au-dessus du titre : la famille ou le module. */
  eyebrow: string;
  title: React.ReactNode;
  /** Vrai tant que le titre dépend d'une donnée en cours de chargement. */
  titleLoading?: boolean;
  tabs: WorkspaceTabItem[];
  /** `aria-label` du groupe d'onglets — déjà passé par `t()`. */
  tabsLabel: string;
}

export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
  eyebrow,
  title,
  titleLoading = false,
  tabs,
  tabsLabel
}) => (
  <div>
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <Text
        style={{
          display: 'block',
          fontSize: 'var(--font-size-caption)',
          fontWeight: 'var(--font-weight-caption)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--text-tertiary)'
        }}
      >
        {eyebrow}
      </Text>
      {titleLoading ? (
        <Skeleton.Input active size="small" style={{ marginTop: 'var(--space-1)', maxWidth: 280 }} />
      ) : (
        <Title level={3} style={{ margin: 0 }}>
          {title}
        </Title>
      )}
    </div>

    <div style={{ marginBottom: 'var(--space-5)' }}>
      <WorkspaceTabs items={tabs} ariaLabel={tabsLabel} />
    </div>

    <Outlet />
  </div>
);
