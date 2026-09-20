import React, { useState, useEffect } from 'react';
import {
  App,
  Card,
  Typography,
  Button,
  Space,
  Table,
  Tag,
  Select,
  Spin,
  Alert,
  Empty,
  Statistic,
  Row,
  Col,
  Modal,
  Descriptions,
  Image,
  Input,
  List,
  Avatar,
  Divider
} from 'antd';
import {
  ToolOutlined,
  PlusOutlined,
  EyeOutlined,
  FilterOutlined,
  MessageOutlined,
  UserOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import MaintenanceTicketModal from '../../components/TenantPortal/MaintenanceTicketModal';
import { tenantPortalService } from '../../services/tenantPortalService';
import dayjs from 'dayjs';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface MaintenanceTicket {
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
  assignedVendor: {
    id: string;
    name: string;
  } | null;
}

interface MaintenanceTicketsData {
  tickets: MaintenanceTicket[];
  summary: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface TicketDetails {
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
  attachments: Array<{
    id: string;
    file_url: string;
    file_name: string;
  }>;
  comments: Array<{
    id: string;
    content: string;
    author_type: string;
    created_at: string;
    authorUser: {
      fullName: string | null;
      email: string;
    } | null;
    authorContact: {
      firstName: string | null;
      lastName: string | null;
      email: string;
    } | null;
  }>;
}

export default function TenantMaintenance() {
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MaintenanceTicketsData | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  useEffect(() => {
    loadTickets();
  }, [statusFilter]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {};
      if (statusFilter) {
        params.status = statusFilter;
      }
      const response = await tenantPortalService.getMaintenanceTickets(params);
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError(t('Erreur lors du chargement des tickets'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des tickets'));
    } finally {
      setLoading(false);
    }
  };

  const loadTicketDetails = async (ticketId: string) => {
    try {
      setDetailsLoading(true);
      const response = await tenantPortalService.getMaintenanceTicketDetails(ticketId);
      if (response.data?.success && response.data?.data) {
        setSelectedTicket(response.data.data);
        setDetailsModalVisible(true);
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors du chargement des détails'));
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!selectedTicket || !commentText.trim()) return;

    try {
      setCommentLoading(true);
      await tenantPortalService.addTicketComment(selectedTicket.id, commentText);
      message.success(t('Commentaire ajouté avec succès'));
      setCommentText('');
      // Reload ticket details
      await loadTicketDetails(selectedTicket.id);
      // Reload tickets list
      await loadTickets();
    } catch (err: any) {
      message.error(err.response?.data?.message || t("Erreur lors de l'ajout du commentaire"));
    } finally {
      setCommentLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return dayjs(dateString).format('DD/MM/YYYY HH:mm');
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
      MEDIUM: { label: t('Moyenne'), color: 'processing' },
      HIGH: { label: t('Haute'), color: 'warning' },
      URGENT: { label: t('Urgente'), color: 'error' }
    };
    const config = priorityMap[priority] || { label: priority, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      PLUMBING: 'Plomberie',
      ELECTRICITY: t('Électricité'),
      AC: 'Climatisation',
      OTHER: 'Autre'
    };
    return labels[category] || category;
  };

  const columns = [
    {
      title: t('Titre'),
      dataIndex: 'title',
      key: 'title',
      render: (title: string) => <Text strong>{title}</Text>
    },
    {
      title: t('Catégorie'),
      dataIndex: 'category',
      key: 'category',
      render: (category: string) => getCategoryLabel(category)
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
      title: t('Date de création'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => (
        <Space>
          <CalendarOutlined />
          {formatDate(date)}
        </Space>
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: any, record: MaintenanceTicket) => (
        <Button type="link" icon={<EyeOutlined />} onClick={() => loadTicketDetails(record.id)}>
          {t('Détails')}
        </Button>
      )
    }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Maintenance')}</Title>
          <Text type="secondary">{t('Gérez vos demandes de maintenance')}</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
          {t('Nouvelle demande')}
        </Button>
      </div>

      {/* Summary Cards */}
      {data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title={t('Total tickets')} value={data.summary.total} prefix={<ToolOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={t('Ouverts')}
                value={data.summary.open}
                valueStyle={{ color: '#faad14' }}
                prefix={<ToolOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={t('En cours')}
                value={data.summary.inProgress}
                valueStyle={{ color: '#1890ff' }}
                prefix={<ToolOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={t('Résolus')}
                value={data.summary.resolved}
                valueStyle={{ color: '#3f8600' }}
                prefix={<ToolOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Filters (T099) */}
      <Card>
        <div className="it-toolbar__actions">
          <Space>
            <FilterOutlined />
            <Text strong>{t('Filtres :')}</Text>
          </Space>
          <Select
            showSearch
            optionFilterProp="children"
            placeholder={t('Statut')}
            allowClear
            style={{ width: 200 }}
            value={statusFilter}
            onChange={value => setStatusFilter(value)}
          >
            <Select.Option value="DECLARED">{t('Déclaré')}</Select.Option>
            <Select.Option value="IN_PROGRESS">{t('En cours')}</Select.Option>
            <Select.Option value="ASSIGNED">{t('Assigné')}</Select.Option>
            <Select.Option value="RESOLVED">{t('Résolu')}</Select.Option>
            <Select.Option value="CANCELED">{t('Annulé')}</Select.Option>
          </Select>
          {statusFilter && <Button onClick={() => setStatusFilter(undefined)}>{t('Réinitialiser')}</Button>}
        </div>
      </Card>

      {/* Tickets Table (T098, T099) */}
      <Card
        title={
          <>
            <ToolOutlined /> {t('Liste des tickets')}
          </>
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spin size="large" tip={t('Chargement des tickets...')} />
          </div>
        ) : error ? (
          <Alert message={t('Erreur')} description={error} type="error" showIcon />
        ) : data && data.tickets.length > 0 ? (
          <Table
            scroll={{ x: 'max-content' }}
            columns={columns}
            dataSource={data.tickets}
            rowKey="id"
            pagination={{
              current: data.pagination.page,
              pageSize: data.pagination.limit,
              total: data.pagination.total,
              showSizeChanger: true,
              showTotal: total => t('Total: {{total}} tickets', { total: total })
            }}
          />
        ) : (
          <Empty description={t('Aucun ticket trouvé')} />
        )}
      </Card>

      {/* Create Ticket Modal */}
      <MaintenanceTicketModal
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onSuccess={() => {
          loadTickets();
        }}
      />

      {/* Ticket Details Modal (T100, T101) */}
      <Modal
        title={
          selectedTicket ? (
            <Space>
              <ToolOutlined />
              <span>{selectedTicket.title}</span>
            </Space>
          ) : (
            t('Détails du ticket')
          )
        }
        open={detailsModalVisible}
        onCancel={() => {
          setDetailsModalVisible(false);
          setSelectedTicket(null);
          setCommentText('');
        }}
        footer={null}
        width={800}
        destroyOnClose
      >
        {detailsLoading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spin size="large" tip={t('Chargement des détails...')} />
          </div>
        ) : selectedTicket ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* Ticket Details */}
            <Descriptions bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label={t('Statut')}>{getStatusTag(selectedTicket.status)}</Descriptions.Item>
              <Descriptions.Item label={t('Priorité')}>{getPriorityTag(selectedTicket.priority)}</Descriptions.Item>
              <Descriptions.Item label={t('Catégorie')}>{getCategoryLabel(selectedTicket.category)}</Descriptions.Item>
              <Descriptions.Item label={t('Date de création')}>
                {formatDate(selectedTicket.created_at)}
              </Descriptions.Item>
              <Descriptions.Item label={t('Propriété')} span={2}>
                {selectedTicket.property.address}
              </Descriptions.Item>
              <Descriptions.Item label={t('Description')} span={2}>
                {selectedTicket.description}
              </Descriptions.Item>
              {selectedTicket.location_details && (
                <Descriptions.Item label={t('Détails de localisation')} span={2}>
                  {selectedTicket.location_details}
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* Attachments */}
            {selectedTicket.attachments && selectedTicket.attachments.length > 0 && (
              <div>
                <Title level={5}>{t('Photos')}</Title>
                <Image.PreviewGroup>
                  <Space wrap>
                    {selectedTicket.attachments.map(attachment => (
                      <Image
                        key={attachment.id}
                        width={100}
                        height={100}
                        src={attachment.file_url}
                        alt={attachment.file_name}
                        style={{ objectFit: 'cover', borderRadius: 4 }}
                      />
                    ))}
                  </Space>
                </Image.PreviewGroup>
              </div>
            )}

            <Divider />

            {/* Comments Section (T100, T101) */}
            <div>
              <Title level={5}>
                <MessageOutlined /> {t('Commentaires (')}
                {selectedTicket.comments?.length || 0})
              </Title>
              {selectedTicket.comments && selectedTicket.comments.length > 0 ? (
                <List
                  dataSource={selectedTicket.comments}
                  renderItem={comment => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={<Avatar icon={<UserOutlined />} />}
                        title={
                          comment.author_type === 'TENANT'
                            ? comment.authorContact
                              ? `${comment.authorContact.firstName || ''} ${comment.authorContact.lastName || ''}`.trim() ||
                                comment.authorContact.email
                              : t('Locataire')
                            : comment.authorUser
                              ? comment.authorUser.fullName || comment.authorUser.email
                              : t('Gestionnaire')
                        }
                        description={
                          <Space direction="vertical" size="small">
                            <Text>{comment.content}</Text>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              {formatDate(comment.created_at)}
                            </Text>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description={t('Aucun commentaire')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}

              {/* Add Comment Form (T101) */}
              <div style={{ marginTop: 16 }}>
                <TextArea
                  rows={3}
                  placeholder={t('Ajouter un commentaire...')}
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                />
                <Button
                  type="primary"
                  icon={<MessageOutlined />}
                  onClick={handleAddComment}
                  loading={commentLoading}
                  style={{ marginTop: 8 }}
                  disabled={!commentText.trim()}
                >
                  {t('Ajouter un commentaire')}
                </Button>
              </div>
            </div>
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
}
