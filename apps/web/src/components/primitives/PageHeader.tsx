import React from 'react';
import { Breadcrumb, Button, Dropdown, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

/**
 * `<PageHeader>` — en-tete de page unique (REFONTE_UI_UX.md §3.6, §10.1).
 *
 * Chaque ecran ecrit aujourd'hui son propre en-tete, avec sa taille de titre,
 * son espacement et son nombre de boutons. La cible impose : un titre, un fil
 * d'Ariane, UNE action primaire, le reste dans un menu « … ».
 *
 * Le fil d'Ariane est passe explicitement ici. Sa derivation automatique
 * depuis le routeur est un composant a part (`<Breadcrumbs>`), qui appartient
 * au Lot 1 en meme temps que la coquille au niveau route.
 *
 * Non cable dans les ecrans a ce stade.
 */

export interface Crumb {
  label: string;
  /** Absent sur le dernier element : la page courante n'est pas un lien. */
  to?: string;
}

export interface PageHeaderProps {
  title: string;
  /** Sous-titre court : reference, statut, contexte. */
  subtitle?: React.ReactNode;
  breadcrumbs?: Crumb[];
  /** L'unique action primaire de l'ecran. */
  primaryAction?: { label: string; onClick: () => void; icon?: React.ReactNode; loading?: boolean };
  /** Actions secondaires, regroupees derriere « … ». */
  secondaryActions?: MenuProps['items'];
  /** Contenu libre aligne a droite (filtres, bascule de vue). */
  extra?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  primaryAction,
  secondaryActions,
  extra
}) => {
  const { isDesktop } = useBreakpoint();

  return (
    <header
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-6)'
      }}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label={t("Fil d'Ariane")}>
          <Breadcrumb
            items={breadcrumbs.map(c => ({
              title: c.to ? <Link to={c.to}>{c.label}</Link> : c.label
            }))}
          />
        </nav>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: isDesktop ? 'row' : 'column',
          alignItems: isDesktop ? 'center' : 'stretch',
          justifyContent: 'space-between',
          gap: 'var(--space-3)'
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Title
            level={1}
            style={{
              margin: 0,
              fontSize: 'var(--font-size-h1)',
              lineHeight: 'var(--line-height-h1)',
              fontWeight: 'var(--font-weight-h1)' as unknown as number
            }}
          >
            {title}
          </Title>
          {subtitle && (
            <Text type="secondary" style={{ fontSize: 'var(--font-size-small)' }}>
              {subtitle}
            </Text>
          )}
        </div>

        <Space size="small" wrap>
          {extra}
          {primaryAction && (
            <Button
              type="primary"
              icon={primaryAction.icon}
              loading={primaryAction.loading}
              onClick={primaryAction.onClick}
              block={!isDesktop}
            >
              {primaryAction.label}
            </Button>
          )}
          {secondaryActions && secondaryActions.length > 0 && (
            <Dropdown menu={{ items: secondaryActions }} trigger={['click']}>
              <Button icon={<MoreOutlined />} aria-label={t('Autres actions')} />
            </Dropdown>
          )}
        </Space>
      </div>
    </header>
  );
};
