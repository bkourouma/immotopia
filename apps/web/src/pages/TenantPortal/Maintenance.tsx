import React, { useState, useEffect, useRef } from 'react';
import {
  App,
  Card,
  Typography,
  Button,
  Space,
  Tag,
  Spin,
  Alert,
  Empty,
  Statistic,
  Row,
  Col,
  Modal,
  Descriptions,
  Input,
  List,
  Avatar,
  Divider
} from 'antd';
import {
  ToolOutlined,
  PlusOutlined,
  EyeOutlined,
  MessageOutlined,
  UserOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import MaintenanceTicketModal from '../../components/TenantPortal/MaintenanceTicketModal';
import {
  AttachmentList,
  fromPortalAttachment,
  type PortalAttachment
} from '../../components/maintenance/AttachmentList';
import { tenantPortalService } from '../../services/tenantPortalService';
import { Table } from '../../components/primitives';
import { collectAllPages } from '../../utils/table-export/collect';
import { useListSearch } from '../../hooks/useListSearch';
import dayjs from 'dayjs';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;
const { TextArea } = Input;

/** Libellé d'une catégorie de ticket (lu au moment de l'appel, pour suivre la langue). */
function getCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    PLUMBING: 'Plomberie',
    ELECTRICITY: t('Électricité'),
    AC: 'Climatisation',
    OTHER: 'Autre'
  };
  return labels[category] || category;
}

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
  attachments: PortalAttachment[];
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
  const [modalVisible, setModalVisible] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  // Liste paginée par le serveur : tous les critères partent à l'API (qui ne trie pas).
  const search = useListSearch({
    apiNames: { sort: false },
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Titre, description…') },
      {
        key: 'status',
        type: 'multiSelect',
        label: t('Statut'),
        primary: true,
        options: [
          { value: 'DECLARED', label: t('Déclaré') },
          { value: 'IN_PROGRESS', label: t('En cours') },
          { value: 'ASSIGNED', label: t('Assigné') },
          { value: 'RESOLVED', label: t('Résolu') },
          { value: 'CANCELED', label: t('Annulé') }
        ]
      },
      {
        key: 'priority',
        type: 'multiSelect',
        label: t('Priorité'),
        primary: true,
        options: [
          { value: 'LOW', label: t('Basse') },
          { value: 'MEDIUM', label: t('Moyenne') },
          { value: 'HIGH', label: t('Haute') },
          { value: 'URGENT', label: t('Urgente') }
        ]
      },
      {
        key: 'category',
        type: 'multiSelect',
        label: t('Catégorie'),
        options: ['PLUMBING', 'ELECTRICITY', 'AC', 'OTHER'].map(value => ({
          value,
          label: getCategoryLabel(value)
        }))
      }
    ]
  });
  // Ignore la réponse d'une requête dépassée par une plus récente (frappes successives).
  const derniereRequete = useRef(0);

  useEffect(() => {
    loadTickets();
  }, [search.apiParams]);

  const loadTickets = async () => {
    const numero = ++derniereRequete.current;
    try {
      setLoading(true);
      setError(null);
      const response = await tenantPortalService.getMaintenanceTickets(search.apiParams);
      if (numero !== derniereRequete.current) return;
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError(t('Erreur lors du chargement des tickets'));
      }
    } catch (err: any) {
      if (numero !== derniereRequete.current) return;
      setError(err.response?.data?.message || t('Erreur lors du chargement des tickets'));
    } finally {
      if (numero === derniereRequete.current) setLoading(false);
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

      {/* Tickets Table (T098, T099) */}
      <Card
        title={
          <>
            <ToolOutlined /> {t('Liste des tickets')}
          </>
        }
      >
        {error ? (
          <Alert message={t('Erreur')} description={error} type="error" showIcon style={{ marginBottom: 16 }} />
        ) : null}
        <Table
          search={search.searchProps}
          exportFilename={t('Liste des tickets')}
          // Export de TOUS les tickets, avec les mêmes critères que la liste affichée.
          exportFetchAll={() =>
            collectAllPages<MaintenanceTicket>(async (page, limit) => {
              const reponse = await tenantPortalService.getMaintenanceTickets({
                ...search.filterParams,
                page,
                limit
              });
              const donnees = reponse.data?.data;
              return { items: donnees?.tickets ?? [], total: donnees?.pagination?.total ?? 0 };
            })
          }
          scroll={{ x: 'max-content' }}
          columns={columns}
          dataSource={data?.tickets ?? []}
          rowKey="id"
          loading={loading}
          pagination={{
            ...search.tablePagination(data?.pagination?.total ?? 0),
            showTotal: total => t('Total: {{total}} tickets', { total: total })
          }}
          // Sous critère, la Table affiche seule son bloc « Aucun résultat » et « Effacer les critères ».
          locale={
            search.isFiltered || error ? undefined : { emptyText: <Empty description={t('Aucun ticket trouvé')} /> }
          }
        />
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

            {/* Pièces jointes : lues par la route du portail, jamais en statique. */}
            {selectedTicket.attachments && selectedTicket.attachments.length > 0 && (
              <div>
                <Title level={5}>{t('Pièces jointes')}</Title>
                <AttachmentList
                  attachments={selectedTicket.attachments.map(fromPortalAttachment)}
                  source={{ kind: 'tenant-portal', ticketId: selectedTicket.id }}
                />
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
