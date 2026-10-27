import React from 'react';
import { Button, Card, Col, Popconfirm, Progress, Row, Statistic, Tag, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Table } from '../primitives';
import { MeetingAttendance, MeetingResolution } from '../../types/syndic-types';
import { majorityRuleLabel, normalizeMajorityRule } from './meeting-governance';
import { t } from '../../i18n/t';

const { Text } = Typography;

interface VoteBoardProps {
  quorum: number | string | null | undefined;
  resolutions: MeetingResolution[];
  /** Tantiemes representes sur le total, calcules par l'API. */
  attendance?: MeetingAttendance;
  /** AG cloturee ou annulee : la decision est affichee meme si un vote est reste ouvert. */
  frozen?: boolean;
  /**
   * Suppression d'une résolution : l'action n'apparaît que si ce gestionnaire est fourni, que l'AG
   * n'est pas figée et que la résolution n'a ni vote ouvert ni vote saisi.
   */
  onDeleteResolution?: (resolutionId: string) => Promise<void> | void;
  /** Résolution en cours de suppression (bouton en chargement). */
  deletingResolutionId?: string | null;
}

/** Une résolution n'est supprimable que tant qu'aucun vote n'a été ouvert ni saisi. */
export function canDeleteResolution(resolution: MeetingResolution): boolean {
  const status = resolution.voteStatus ?? 'PENDING';
  const hasVotes =
    (resolution.votes?.length ?? 0) > 0 || resolution.votesFor + resolution.votesAgainst + resolution.votesAbstain > 0;
  return status === 'PENDING' && !hasVotes;
}

/** « 2 lots · 300 tantièmes » : nombre de lots et poids en tantiemes. */
function formatCount(lots: number, shares?: number) {
  if (shares === undefined) return String(lots);
  return t('{{lots}} lot(s) · {{shares}} tantièmes', { lots, shares });
}

export const VoteBoard: React.FC<VoteBoardProps> = ({
  quorum,
  resolutions,
  attendance,
  frozen = false,
  onDeleteResolution,
  deletingResolutionId = null
}) => {
  const rawQuorum = typeof quorum === 'number' ? quorum : Number(quorum);
  const storedQuorum = Number.isFinite(rawQuorum) ? rawQuorum : 0;
  const quorumPercent = Number((attendance ? attendance.quorumPercent : storedQuorum).toFixed(2));
  const resultLabels: Record<string, string> = {
    PENDING: t('En attente'),
    APPROVED: t('Approuvée'),
    REJECTED: t('Rejetée'),
    DEFERRED: t('Reportée')
  };
  const resultColors: Record<string, string> = { APPROVED: 'green', REJECTED: 'red', DEFERRED: 'orange' };

  const columns: ColumnsType<MeetingResolution> = [
    {
      title: t('Résolution'),
      dataIndex: 'title',
      key: 'title'
    },
    {
      title: t('Règle'),
      key: 'rule',
      render: (_: unknown, resolution) =>
        majorityRuleLabel(resolution.tally?.rule ?? normalizeMajorityRule(resolution.majorityRule))
    },
    {
      title: t('Pour'),
      key: 'for',
      render: (_: unknown, resolution) => formatCount(resolution.votesFor, resolution.tally?.sharesFor)
    },
    {
      title: t('Contre'),
      key: 'against',
      render: (_: unknown, resolution) => formatCount(resolution.votesAgainst, resolution.tally?.sharesAgainst)
    },
    {
      title: t('Abstention'),
      key: 'abstain',
      render: (_: unknown, resolution) => formatCount(resolution.votesAbstain, resolution.tally?.sharesAbstain)
    },
    {
      title: t('Total de référence'),
      key: 'reference',
      render: (_: unknown, resolution) =>
        resolution.tally ? t('{{shares}} tantièmes', { shares: resolution.tally.referenceShares }) : '-'
    },
    {
      title: t('Résultat'),
      key: 'result',
      // Resultat enregistre (recalcule a chaque vote et fige a la cloture).
      render: (_: unknown, resolution) => {
        // Vote ouvert : la decision provisoire est masquee, seuls les decomptes restent visibles.
        if (!frozen && resolution.voteStatus === 'OPEN') return <Tag color="blue">{t('Vote en cours')}</Tag>;
        const value = resolution.result ?? 'PENDING';
        return <Tag color={resultColors[value]}>{resultLabels[value] || value}</Tag>;
      }
    }
  ];

  if (onDeleteResolution && !frozen) {
    columns.push({
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, resolution) =>
        canDeleteResolution(resolution) ? (
          <Popconfirm
            title={t('Supprimer cette résolution ?')}
            okText={t('Supprimer')}
            cancelText={t('Annuler')}
            okButtonProps={{ danger: true }}
            onConfirm={() => onDeleteResolution(resolution.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={deletingResolutionId === resolution.id}>
              {t('Supprimer')}
            </Button>
          </Popconfirm>
        ) : null
    });
  }

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title={t('Quorum')} value={quorumPercent} suffix="%" />
          <Progress percent={Math.min(100, Math.max(0, quorumPercent))} />
          {attendance ? (
            <Text type="secondary">
              {t('{{represented}} / {{total}} tantièmes représentés', {
                represented: attendance.representedShares,
                total: attendance.totalShares
              })}
            </Text>
          ) : null}
        </Card>
      </Col>
      <Col xs={24} md={16}>
        <Card title={t('Résultats des résolutions')}>
          <Table
            exportFilename={t('Resultats des resolutions')}
            scroll={{ x: 'max-content' }}
            rowKey="id"
            dataSource={resolutions}
            columns={columns}
            pagination={{ pageSize: 8, hideOnSinglePage: true }}
            locale={{ emptyText: t('Aucun vote enregistré') }}
          />
        </Card>
      </Col>
    </Row>
  );
};
