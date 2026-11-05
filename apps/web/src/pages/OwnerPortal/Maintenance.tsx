import React, { useState } from 'react';
import { Card, Row, Col, Typography, Spin, Tag, Space, Button, Modal, Descriptions, List, Avatar, Empty } from 'antd';
import {
  ToolOutlined,
  EyeOutlined,
  MessageOutlined,
  UserOutlined,
  CalendarOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { ownerPortalService } from '../../services/ownerPortalService';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import { portalPersonName, type PortalPerson } from './owner-portal-people';
import { Table } from '../../components/primitives';
import { InlineError } from './search/InlineError';
import { useMaintenanceTickets } from './search/useMaintenanceTickets';
import {
  AttachmentList,
  fromPortalAttachment,
  type PortalAttachment
} from '../../components/maintenance/AttachmentList';
import dayjs from 'dayjs';
import { t } from '../../i18n/t';

import { formatFcfa } from '../../i18n/format';
const { Title, Text } = Typography;

interface MaintenanceTicketListItem {
  id: string;
  propertyAddress: string;
  category: string;
  priority: string;
  title: string;
  status: string;
  createdAt: Date | string;
}

interface MaintenanceTicketSummary {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  totalCost: number;
}

interface MaintenanceTicketsData {
  tickets: MaintenanceTicketListItem[];
  summary: MaintenanceTicketSummary;
}

interface TicketDetails {
  ticket: {
    id: string;
    title: string;
    category: string;
    priority: string;
    status: string;
    description: string;
    location_details: string | null;
    created_at: string;
    property: {
      id: string;
      address: string;
    };
    attachments: PortalAttachment[];
    comments: Array<{
      id: string;
      content: string;
      author_type: string;
      created_at: string;
      authorUser: PortalPerson | null;
      authorContact: PortalPerson | null;
    }>;
    statusHistory: Array<{
      id: string;
      from_status: string | null;
      to_status: string;
      note: string | null;
      changed_at: string;
      changedByUser: PortalPerson | null;
    }>;
    assignedVendor: {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
    } | null;
    assignedToUser: (PortalPerson & { id: string }) | null;
  };
}

const formatCurrency = (amount: number) => {
  return formatFcfa(amount);
};

const getStatusTag = (status: string) => {
  const statusMap: Record<string, { label: string; color: string }> = {
    DECLARED: { label: t('Déclaré'), color: 'default' },
    IN_PROGRESS: { label: t('En cours'), color: 'processing' },
    ASSIGNED: { label: t('Assigné'), color: 'warning' },
    RESOLVED: { label: t('Résolu'), color: 'success' },
    CANCELED: { label: t('Annulé'), color: 'error' }
  };
  const config = statusMap[status] || { label: status, color: 'default' };
  return <Tag color={config.color}>{config.label}</Tag>;
};

const getPriorityTag = (priority: string) => {
  const priorityMap: Record<string, { label: string; color: string }> = {
    LOW: { label: t('Basse'), color: 'default' },
    MEDIUM: { label: t('Moyenne'), color: 'warning' },
    HIGH: { label: t('Haute'), color: 'error' },
    URGENT: { label: t('Urgente'), color: 'red' }
  };
  const config = priorityMap[priority] || { label: priority, color: 'default' };
  return <Tag color={config.color}>{config.label}</Tag>;
};

const getCategoryLabel = (category: string) => {
  const categoryMap: Record<string, string> = {
    PLUMBING: 'Plomberie',
    ELECTRICITY: t('Électricité'),
    AC: 'Climatisation',
    OTHER: 'Autre'
  };
  return categoryMap[category] || category;
};

export default function Maintenance() {
  const [error, setError] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketDetails, setTicketDetails] = useState<TicketDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);

  const { search, data, tickets, total, isPending, loading, loadError, loadTickets, exportAll } =
    useMaintenanceTickets<MaintenanceTicketsData>();

  const handleViewDetails = async (ticketId: string) => {
    try {
      setDetailsLoading(true);
      setError(null);
      setSelectedTicketId(ticketId);
      const response = await ownerPortalService.getMaintenanceTicketDetails(ticketId);
      if (response.data?.success && response.data?.data?.ticket) {
        setTicketDetails(response.data.data);
        setDetailsModalVisible(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des détails'));
    } finally {
      setDetailsLoading(false);
    }
  };

  const columns = [
    {
      title: t('Propriété'),
      dataIndex: 'propertyAddress',
      key: 'propertyAddress'
    },
    {
      title: t('Titre'),
      dataIndex: 'title',
      key: 'title'
    },
    {
      title: t('Catégorie'),
      dataIndex: 'category',
      key: 'category',
      render: (category: string) => getCategoryLabel(category)
      // Les `filters`/`onFilter` de colonne sont retirés (REFONTE_UI_UX.md
      // §8.4, « double filtrage »). Ils s'appliquaient EN PLUS du filtrage
      // serveur, et seulement sur la page reçue : choisir « Urgente » dans le
      // menu de colonne cachait des tickets urgents des autres pages, tout en
      // laissant le filtre du haut de l'écran afficher autre chose. Deux
      // commandes pour le même réglage, dont une qui ment. Les sélecteurs
      // au-dessus du tableau, eux, partent au serveur.
    },
    {
      title: t('Priorité'),
      dataIndex: 'priority',
      key: 'priority',
      render: (priority: string) => getPriorityTag(priority)
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status)
    },
    {
      title: t('Date'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: Date | string) => {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dayjs(dateObj).format('DD/MM/YYYY');
      }
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: any, record: MaintenanceTicketListItem) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetails(record.id)}
          loading={detailsLoading && selectedTicketId === record.id}
        >
          {t('Détails')}
        </Button>
      )
    }
  ];

  if (isPending && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip={t('Chargement des tickets de maintenance...')} />
      </div>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Maintenance')}</Title>
          <Text type="secondary">{t('Suivi des tickets de maintenance')}</Text>
        </div>
        <Button
          icon={<SyncOutlined />}
          onClick={loadTickets}
          loading={loading}
          aria-label={t('Rafraîchir les tickets')}
        >
          {t('Actualiser')}
        </Button>
      </div>

      {/* Summary Cards (T127) */}
      {data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('Total')}
              value={data.summary.total.toString()}
              icon={<ToolOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('Ouverts')}
              value={data.summary.open.toString()}
              icon={<ToolOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ fontSize: 18, color: '#faad14' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('En cours')}
              value={data.summary.inProgress.toString()}
              icon={<ToolOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18, color: '#1890ff' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('Résolus')}
              value={data.summary.resolved.toString()}
              icon={<ToolOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ fontSize: 18, color: '#52c41a' }}
            />
          </Col>
        </Row>
      )}

      {/* Tickets Table (T126) */}
      <Card title={t('Liste des tickets')}>
        <InlineError message={error || loadError} />
        <Table
          aria-label={t('Liste des tickets')}
          search={search.searchProps}
          exportFilename={t('Liste des tickets')}
          exportFetchAll={exportAll}
          scroll={{ x: 'max-content' }}
          columns={columns}
          dataSource={tickets}
          rowKey="id"
          loading={loading}
          pagination={search.tablePagination(total)}
          locale={search.isFiltered ? undefined : { emptyText: t('Aucun ticket trouvé') }}
        />
      </Card>

      {/* Ticket Details Modal (T128-T129) */}
      <Modal
        title={
          <Space>
            <ToolOutlined />
            <span>{t('Détails du ticket')}</span>
          </Space>
        }
        open={detailsModalVisible}
        onCancel={() => {
          setDetailsModalVisible(false);
          setTicketDetails(null);
          setSelectedTicketId(null);
        }}
        footer={null}
        width={900}
      >
        {detailsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <Spin size="large" />
          </div>
        ) : ticketDetails?.ticket ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* Ticket Information */}
            <Descriptions bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label={t('Titre')}>{ticketDetails.ticket.title}</Descriptions.Item>
              <Descriptions.Item label={t('Statut')}>{getStatusTag(ticketDetails.ticket.status)}</Descriptions.Item>
              <Descriptions.Item label={t('Catégorie')}>
                {getCategoryLabel(ticketDetails.ticket.category)}
              </Descriptions.Item>
              <Descriptions.Item label={t('Priorité')}>
                {getPriorityTag(ticketDetails.ticket.priority)}
              </Descriptions.Item>
              <Descriptions.Item label={t('Propriété')}>{ticketDetails.ticket.property.address}</Descriptions.Item>
              <Descriptions.Item label={t('Date de création')}>
                {dayjs(ticketDetails.ticket.created_at).format('DD/MM/YYYY HH:mm')}
              </Descriptions.Item>
              {ticketDetails.ticket.location_details && (
                <Descriptions.Item label={t('Localisation')} span={2}>
                  {ticketDetails.ticket.location_details}
                </Descriptions.Item>
              )}
              <Descriptions.Item label={t('Description')} span={2}>
                {ticketDetails.ticket.description}
              </Descriptions.Item>
              {ticketDetails.ticket.assignedVendor && (
                <Descriptions.Item label={t('Vendeur assigné')}>
                  {ticketDetails.ticket.assignedVendor.name}
                  {ticketDetails.ticket.assignedVendor.phone && ` - ${ticketDetails.ticket.assignedVendor.phone}`}
                </Descriptions.Item>
              )}
              <Descriptions.Item label={t('Utilisateur assigné')}>
                {portalPersonName(ticketDetails.ticket.assignedToUser) ?? t('Non assigné')}
              </Descriptions.Item>
            </Descriptions>

            {/* Pièces jointes : lues par la route du portail, jamais en statique. */}
            {ticketDetails.ticket.attachments && ticketDetails.ticket.attachments.length > 0 && (
              <div>
                <Title level={5}>{t('Pièces jointes')}</Title>
                <AttachmentList
                  attachments={ticketDetails.ticket.attachments.map(fromPortalAttachment)}
                  source={{ kind: 'owner-portal', ticketId: ticketDetails.ticket.id }}
                />
              </div>
            )}

            {/* Comments */}
            {ticketDetails.ticket.comments && ticketDetails.ticket.comments.length > 0 && (
              <div>
                <Title level={5}>
                  <MessageOutlined /> {t('Commentaires')}
                </Title>
                <List
                  dataSource={ticketDetails.ticket.comments}
                  renderItem={comment => {
                    const authorName =
                      portalPersonName(comment.authorUser) ?? portalPersonName(comment.authorContact) ?? t('Système');
                    return (
                      <List.Item>
                        <List.Item.Meta
                          avatar={<Avatar icon={<UserOutlined />} />}
                          title={authorName}
                          description={
                            <Space direction="vertical" size="small">
                              <Text>{comment.content}</Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {dayjs(comment.created_at).format('DD/MM/YYYY HH:mm')}
                              </Text>
                            </Space>
                          }
                        />
                      </List.Item>
                    );
                  }}
                />
              </div>
            )}

            {/* Status History */}
            {ticketDetails.ticket.statusHistory && ticketDetails.ticket.statusHistory.length > 0 && (
              <div>
                <Title level={5}>
                  <CalendarOutlined /> {t('Historique des statuts')}
                </Title>
                <List
                  dataSource={ticketDetails.ticket.statusHistory}
                  renderItem={history => {
                    const changedBy = portalPersonName(history.changedByUser) ?? t('Système');
                    return (
                      <List.Item>
                        <List.Item.Meta
                          title={
                            <Space>
                              <Text>
                                {history.from_status
                                  ? `${history.from_status} → ${history.to_status}`
                                  : history.to_status}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {dayjs(history.changed_at).format('DD/MM/YYYY HH:mm')}
                              </Text>
                            </Space>
                          }
                          description={
                            <Space direction="vertical" size="small">
                              {history.note && <Text>{history.note}</Text>}
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {t('Par')} {changedBy}
                              </Text>
                            </Space>
                          }
                        />
                      </List.Item>
                    );
                  }}
                />
              </div>
            )}
          </Space>
        ) : (
          <Empty description={t('Aucune information disponible')} />
        )}
      </Modal>
    </Space>
  );
}
