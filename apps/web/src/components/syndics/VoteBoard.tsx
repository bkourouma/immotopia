import React from 'react';
import { Card, Col, Progress, Row, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { MeetingAttendance, MeetingResolution } from '../../types/syndic-types';
import { majorityRuleLabel, normalizeMajorityRule } from './meeting-governance';
import { t } from '../../i18n/t';

const { Text } = Typography;

interface VoteBoardProps {
  quorum: number | string | null | undefined;
  resolutions: MeetingResolution[];
  /** Tantiemes representes sur le total, calcules par l'API. */
  attendance?: MeetingAttendance;
}

/** « 2 lots · 300 tantièmes » : nombre de lots et poids en tantiemes. */
function formatCount(lots: number, shares?: number) {
  if (shares === undefined) return String(lots);
  return t('{{lots}} lot(s) · {{shares}} tantièmes', { lots, shares });
}

export const VoteBoard: React.FC<VoteBoardProps> = ({ quorum, resolutions, attendance }) => {
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
      title: t('Resolution'),
      dataIndex: 'title',
      key: 'title'
    },
    {
      title: t('Règle'),
      key: 'rule',
      render: (_: unknown, resolution) => majorityRuleLabel(resolution.tally?.rule ?? normalizeMajorityRule(resolution.majorityRule))
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
      title: t('Resultat'),
      key: 'result',
      // Resultat enregistre (recalcule a chaque vote et fige a la cloture).
      render: (_: unknown, resolution) => {
        const value = resolution.result ?? 'PENDING';
        return <Tag color={resultColors[value]}>{resultLabels[value] || value}</Tag>;
      }
    }
  ];

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
        <Card title={t('Resultats des resolutions')}>
          <Table
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
