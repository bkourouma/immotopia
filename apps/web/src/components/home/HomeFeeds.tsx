import React from 'react';
import { Card, List, Tooltip, Typography } from 'antd';
import { Link } from 'react-router-dom';
import {
  ClockCircleOutlined,
  FileDoneOutlined,
  HomeOutlined,
  ToolOutlined,
  TransactionOutlined,
  UserOutlined
} from '@ant-design/icons';
import { StateBlock, formatMoney } from '../primitives';
import { formatRelativeDate, safeFormatDate } from '../../utils/date-utils';
import type { DashboardActivity, DashboardTask, DashboardTaskKind } from '../../services/dashboard-service';
import { t } from '../../i18n/t';

const { Text } = Typography;

/**
 * Les deux files de l'accueil : ce qu'il faut faire, et ce qui s'est passé.
 *
 * Elles ne se ressemblent pas et ne doivent pas se ressembler. « À traiter »
 * appelle une action et porte une gravité ; « Activité récente » est un journal,
 * et il est délibérément placé en dernier (§6.14 : l'ordre est le retard, puis
 * la semaine, puis ce qui bloque, et le journal en queue).
 */

const SEVERITE: Record<DashboardTask['severity'], { color: string; label: string }> = {
  danger: { color: 'var(--color-error)', label: t('Urgent') },
  warning: { color: 'var(--color-warning)', label: t('À surveiller') },
  info: { color: 'var(--color-primary)', label: t('Information') }
};

/**
 * La ligne secondaire : le montant, puis ce qui le qualifie.
 *
 * Le montant est mis en forme ICI, par `formatMoney`, et nulle part ailleurs.
 * L'API l'envoie brut : elle composait autrefois la phrase elle-même en
 * recopiant le code devise stocké, si bien qu'une même liste affichait
 * « 105 000 XOF » au-dessus de « 840 000 FCFA », selon que le bail venait du
 * jeu de démonstration ou du défaut de schéma. Hors tableau — et cette file
 * n'en est pas un — le montant porte sa devise, une fois, par le seul
 * utilitaire du produit.
 */
function ligneSecondaire(montant: number | null, complement: string): string {
  return [montant === null ? null : formatMoney(montant), complement || null].filter(Boolean).join(' · ');
}

const ICONE_TACHE: Record<DashboardTaskKind, React.ReactNode> = {
  OVERDUE_INSTALLMENT: <ClockCircleOutlined />,
  PENDING_DECLARATION: <FileDoneOutlined />,
  URGENT_TICKET: <ToolOutlined />
};

export interface WorkQueueProps {
  tasks: DashboardTask[];
  loading?: boolean;
  /** Lien de sortie vers la liste complète. */
  link?: { label: string; to: string };
}

/** « À traiter aujourd'hui » : la première ligne est l'action primaire de l'écran. */
export const WorkQueue: React.FC<WorkQueueProps> = ({ tasks, loading, link }) => (
  <Card
    loading={loading}
    title={
      <span>
        {t("À traiter aujourd'hui")}{' '}
        <Text type="secondary" style={{ fontWeight: 400 }}>
          ({tasks.length})
        </Text>
      </span>
    }
    extra={link ? <Link to={link.to}>{link.label}</Link> : undefined}
    style={{ height: '100%', borderColor: 'var(--border-default)' }}
    styles={{ body: { padding: tasks.length ? 0 : 'var(--space-4)' } }}
  >
    {tasks.length === 0 ? (
      <StateBlock
        variant="empty"
        title={t("Rien à traiter aujourd'hui")}
        description={t('Aucun impayé, aucune déclaration en attente, aucun ticket urgent.')}
      />
    ) : (
      <List
        dataSource={tasks}
        renderItem={tache => {
          const severite = SEVERITE[tache.severity];

          return (
            <List.Item style={{ padding: 0 }}>
              {/* Toute la ligne est la cible : sur 375 px, viser au pouce un
                  lien de quelques caractères ne marche pas (P1). */}
              <Link
                to={tache.href}
                aria-label={`${severite.label} — ${tache.title}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  width: '100%',
                  minHeight: 44,
                  color: 'inherit',
                  // Le liseré de gravité, doublé par le libellé de la ligne :
                  // la couleur ne porte jamais le sens à elle seule.
                  borderInlineStart: `3px solid ${severite.color}`
                }}
              >
                <span aria-hidden="true" style={{ color: severite.color, fontSize: 18, lineHeight: '22px' }}>
                  {ICONE_TACHE[tache.kind]}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 600, color: 'var(--text-primary)' }}>{tache.title}</span>
                  <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    {ligneSecondaire(tache.amount, tache.description)}
                  </span>
                </span>
                <Tooltip title={safeFormatDate(tache.occurredAt)}>
                  <span
                    style={{
                      color: 'var(--text-tertiary)',
                      fontSize: 'var(--font-size-sm)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {formatRelativeDate(tache.occurredAt)}
                  </span>
                </Tooltip>
              </Link>
            </List.Item>
          );
        }}
      />
    )}
  </Card>
);

const ICONE_ACTIVITE: Record<DashboardActivity['type'], { icon: React.ReactNode; color: string }> = {
  PROPERTY_CREATED: { icon: <HomeOutlined />, color: 'var(--color-primary)' },
  CONTACT_CREATED: { icon: <UserOutlined />, color: 'var(--color-success)' },
  PAYMENT_SUCCEEDED: { icon: <TransactionOutlined />, color: 'var(--color-warning)' }
};

export interface ActivityFeedProps {
  activities: DashboardActivity[];
  loading?: boolean;
}

/** Le journal. Chaque ligne mène à la fiche concernée. */
export const ActivityFeed: React.FC<ActivityFeedProps> = ({ activities, loading }) => (
  <Card
    loading={loading}
    title={t('Activité récente')}
    style={{ height: '100%', borderColor: 'var(--border-default)' }}
    styles={{ body: { padding: activities.length ? 0 : 'var(--space-4)' } }}
  >
    {activities.length === 0 ? (
      <StateBlock
        variant="empty"
        title={t('Aucune activité récente')}
        description={t('Rien de neuf ces derniers jours.')}
      />
    ) : (
      <List
        dataSource={activities}
        renderItem={activite => {
          const style = ICONE_ACTIVITE[activite.type];
          const contenu = (
            <>
              <span aria-hidden="true" style={{ color: style.color, fontSize: 16, lineHeight: '22px' }}>
                {style.icon}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', color: 'var(--text-primary)' }}>{activite.title}</span>
                <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  {ligneSecondaire(activite.amount, activite.description)}
                </span>
              </span>
              <Tooltip title={safeFormatDate(activite.occurredAt)}>
                <span
                  style={{
                    color: 'var(--text-tertiary)',
                    fontSize: 'var(--font-size-sm)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {formatRelativeDate(activite.occurredAt)}
                </span>
              </Tooltip>
            </>
          );

          const disposition: React.CSSProperties = {
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            width: '100%',
            minHeight: 44,
            color: 'inherit'
          };

          return (
            <List.Item style={{ padding: 0 }}>
              {activite.href ? (
                <Link to={activite.href} style={disposition}>
                  {contenu}
                </Link>
              ) : (
                <span style={disposition}>{contenu}</span>
              )}
            </List.Item>
          );
        }}
      />
    )}
  </Card>
);
