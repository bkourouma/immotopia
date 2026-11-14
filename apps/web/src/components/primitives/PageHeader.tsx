import React, { useEffect } from 'react';
import { Breadcrumb, Button, Dropdown, Space, Tooltip, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { t } from '../../i18n/t';
import { HelpButton } from '../../help/components/HelpButton';
import { useHelp } from '../../help/help-context';

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
  /**
   * L'unique action primaire de l'ecran.
   *
   * `disabled` la grise sans la retirer : un bouton qui disparait ne dit pas
   * pourquoi le geste est refuse, la ou un bouton grise avec `disabledReason`
   * en `<Tooltip>` le dit avant meme le clic.
   */
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    loading?: boolean;
    disabled?: boolean;
    /** Raison affichee en infobulle quand `disabled` est vrai. */
    disabledReason?: string;
    /** Ancre de visite guidee (`data-help-anchor`) posee sur le bouton. */
    helpAnchor?: string;
  };
  /** Actions secondaires, regroupees derriere « … ». */
  secondaryActions?: MenuProps['items'];
  /** Contenu libre aligne a droite (filtres, bascule de vue). */
  extra?: React.ReactNode;
  /** Fiche d'aide de la page ; par défaut celle de la route (`useHelp().pageHelpId`). */
  helpId?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  primaryAction,
  secondaryActions,
  extra,
  helpId
}) => {
  const { isDesktop } = useBreakpoint();
  const { available, pageHelpId, claimPageHelp } = useHelp();
  const effectiveHelpId = helpId ?? pageHelpId;
  const showHelp = Boolean(effectiveHelpId) && available;
  useEffect(() => {
    if (!effectiveHelpId || !available) return undefined;
    return claimPageHelp();
  }, [effectiveHelpId, available, claimPageHelp]);

  const titleNode = (
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
  );

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
          {showHelp && effectiveHelpId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {titleNode}
              <HelpButton helpId={effectiveHelpId} />
            </div>
          ) : (
            titleNode
          )}
          {subtitle && (
            <Text type="secondary" style={{ fontSize: 'var(--font-size-small)' }}>
              {subtitle}
            </Text>
          )}
        </div>

        <Space size="small" wrap>
          {extra}
          {primaryAction &&
            (primaryAction.disabled && primaryAction.disabledReason ? (
              <Tooltip title={primaryAction.disabledReason}>
                {/* Un `Button` desactive ne recoit plus d'evenement souris :
                    sans ce `span`, l'infobulle qui explique le refus ne
                    s'afficherait jamais. */}
                <span style={{ display: 'inline-block', width: !isDesktop ? '100%' : undefined }}>
                  <Button
                    type="primary"
                    icon={primaryAction.icon}
                    loading={primaryAction.loading}
                    disabled
                    data-help-anchor={primaryAction.helpAnchor}
                    block={!isDesktop}
                  >
                    {primaryAction.label}
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button
                type="primary"
                icon={primaryAction.icon}
                loading={primaryAction.loading}
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                data-help-anchor={primaryAction.helpAnchor}
                block={!isDesktop}
              >
                {primaryAction.label}
              </Button>
            ))}
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
