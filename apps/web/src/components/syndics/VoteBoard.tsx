import React from 'react';
import { Card, Col, Progress, Row, Statistic, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { MeetingResolution } from '../../types/syndic-types';

interface VoteBoardProps {
  quorum: number | string | null | undefined;
  resolutions: MeetingResolution[];
}

export const VoteBoard: React.FC<VoteBoardProps> = ({ quorum, resolutions }) => {
  const rawQuorum = typeof quorum === 'number' ? quorum : Number(quorum);
  const normalizedQuorum = Number.isFinite(rawQuorum) ? rawQuorum : 0;
  const quorumPercent = Number(normalizedQuorum.toFixed(2));
  const resultLabels: Record<string, string> = {
    PENDING: 'En attente',
    APPROVED: 'Approuvée',
    REJECTED: 'Rejetée',
    DEFERRED: 'Reportée'
  };

  const columns: ColumnsType<MeetingResolution> = [
    {
      title: 'Resolution',
      dataIndex: 'title',
      key: 'title'
    },
    {
      title: 'Pour',
      dataIndex: 'votesFor',
      key: 'votesFor'
    },
    {
      title: 'Contre',
      dataIndex: 'votesAgainst',
      key: 'votesAgainst'
    },
    {
      title: 'Abstention',
      dataIndex: 'votesAbstain',
      key: 'votesAbstain'
    },
    {
      title: 'Resultat',
      dataIndex: 'result',
      key: 'result',
      render: (value: string) => resultLabels[value] || value
    }
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title="Quorum" value={quorumPercent} suffix="%" />
          <Progress percent={Math.min(100, Math.max(0, quorumPercent))} />
        </Card>
      </Col>
      <Col xs={24} md={16}>
        <Card title="Resultats des resolutions">
          <Table
            scroll={{ x: 'max-content' }}
            rowKey="id"
            dataSource={resolutions}
            columns={columns}
            pagination={{ pageSize: 8, hideOnSinglePage: true }}
            locale={{ emptyText: 'Aucun vote enregistre' }}
          />
        </Card>
      </Col>
    </Row>
  );
};
