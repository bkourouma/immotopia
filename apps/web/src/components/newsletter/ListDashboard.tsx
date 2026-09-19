import React from 'react';
import { Card, Row, Col, Statistic, Tag, Button, Typography, Space } from 'antd';
import { TeamOutlined, UserOutlined, MailOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { NewsletterList } from '../../services/newsletter.service';

const { Title, Text } = Typography;

interface ListDashboardProps {
  lists: NewsletterList[];
  loading?: boolean;
  onSelectList: (list: NewsletterList) => void;
  onCreateList: () => void;
  onEditList: (list: NewsletterList) => void;
  onDeleteList: (list: NewsletterList) => void;
}

const typeLabels: Record<string, string> = {
  MANUAL: 'Manuelle',
  FROM_OWNERS: 'Propriétaires',
  FROM_RENTERS: 'Locataires',
  FROM_CRM_CONTACTS: 'Contacts CRM'
};

export function ListDashboard({
  lists,
  loading,
  onSelectList,
  onCreateList,
  onEditList,
  onDeleteList
}: ListDashboardProps) {
  return (
    <div>
      <div className="it-toolbar" style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          Listes de diffusion
        </Title>
        <Button type="primary" onClick={onCreateList} icon={<TeamOutlined />}>
          Nouvelle liste
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        {lists.map(list => (
          <Col xs={24} sm={12} lg={8} xl={6} key={list.id}>
            <Card
              loading={loading}
              hoverable
              onClick={() => onSelectList(list)}
              style={{ cursor: 'pointer' }}
              actions={[
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={e => {
                    e.stopPropagation();
                    onEditList(list);
                  }}
                  key="edit"
                >
                  Modifier
                </Button>,
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={e => {
                    e.stopPropagation();
                    onDeleteList(list);
                  }}
                  key="delete"
                >
                  Supprimer
                </Button>
              ]}
            >
              <Card.Meta
                title={
                  <Space>
                    <MailOutlined />
                    {list.name}
                  </Space>
                }
                description={
                  <>
                    <Tag>{typeLabels[list.type] ?? list.type}</Tag>
                    {list.doubleOptIn && <Tag color="blue">Double opt-in</Tag>}
                  </>
                }
              />
              <Row gutter={16} style={{ marginTop: 12 }}>
                <Col span={8}>
                  <Statistic title="Total" value={list.totalCount ?? 0} prefix={<TeamOutlined />} />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Actifs"
                    value={list.activeCount ?? 0}
                    valueStyle={{ color: '#52c41a' }}
                    prefix={<UserOutlined />}
                  />
                </Col>
                <Col span={8}>
                  <Statistic title="Désabonnés" value={list.unsubscribedCount ?? 0} valueStyle={{ color: '#999' }} />
                </Col>
              </Row>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
