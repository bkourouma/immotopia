import React, { useState, useEffect } from 'react';
import { fileUrl as buildFileUrl } from '../../config/api';
import {
  Card,
  Row,
  Col,
  Typography,
  Spin,
  Alert,
  Table,
  Tag,
  Space,
  Button,
  Modal,
  Descriptions,
  Image,
  List,
  Avatar,
  Select,
  Empty
} from 'antd';
import {
  ToolOutlined,
  EyeOutlined,
  FilterOutlined,
  MessageOutlined,
  UserOutlined,
  CalendarOutlined,
  SyncOutlined,
  FileOutlined
} from '@ant-design/icons';
import { ownerPortalService } from '../../services/ownerPortalService';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

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
        firstName: string;
        lastName: string;
        email: string;
      } | null;
      authorContact: {
        firstName: string;
        lastName: string;
        email: string;
      } | null;
    }>;
    statusHistory: Array<{
      id: string;
      from_status: string | null;
      to_status: string;
      note: string | null;
      changed_at: string;
      changedByUser: {
        firstName: string;
        lastName: string;
        email: string;
      } | null;
    }>;
    assignedVendor: {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
    } | null;
    assignedToUser: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
  };
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(amount);
};

const getStatusTag = (status: string) => {
  const statusMap: Record<string, { label: string; color: string }> = {
    DECLARED: { label: 'Déclaré', color: 'default' },
    IN_PROGRESS: { label: 'En cours', color: 'processing' },
    ASSIGNED: { label: 'Assigné', color: 'warning' },
    RESOLVED: { label: 'Résolu', color: 'success' },
    CANCELED: { label: 'Annulé', color: 'error' }
  };
  const config = statusMap[status] || { label: status, color: 'default' };
  return <Tag color={config.color}>{config.label}</Tag>;
};

const getPriorityTag = (priority: string) => {
  const priorityMap: Record<string, { label: string; color: string }> = {
    LOW: { label: 'Basse', color: 'default' },
    MEDIUM: { label: 'Moyenne', color: 'warning' },
    HIGH: { label: 'Haute', color: 'error' },
    URGENT: { label: 'Urgente', color: 'red' }
  };
  const config = priorityMap[priority] || { label: priority, color: 'default' };
  return <Tag color={config.color}>{config.label}</Tag>;
};

const getCategoryLabel = (category: string) => {
  const categoryMap: Record<string, string> = {
    PLUMBING: 'Plomberie',
    ELECTRICITY: 'Électricité',
    AC: 'Climatisation',
    OTHER: 'Autre'
  };
  return categoryMap[category] || category;
};

// Static files are served from the server root at /uploads, not from /api.
const getAttachmentUrl = (fileUrl: string): string => buildFileUrl(fileUrl);

export default function Maintenance() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MaintenanceTicketsData | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [propertyFilter, setPropertyFilter] = useState<string | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);
  const [properties, setProperties] = useState<Array<{ id: string; address: string }>>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketDetails, setTicketDetails] = useState<TicketDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);

  useEffect(() => {
    loadProperties();
  }, []);

  useEffect(() => {
    loadTickets();
  }, [statusFilter, propertyFilter, categoryFilter, priorityFilter]);

  const loadProperties = async () => {
    try {
      const response = await ownerPortalService.getProperties();
      if (response.data?.success && response.data?.data?.properties) {
        setProperties(response.data.data.properties.map((p: any) => ({
          id: p.id,
          address: p.address
        })));
      }
    } catch (err) {
      console.error('Error loading properties:', err);
    }
  };

  const loadTickets = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      if (propertyFilter) params.propertyId = propertyFilter;
      if (categoryFilter) params.category = categoryFilter;
      if (priorityFilter) params.priority = priorityFilter;

      const response = await ownerPortalService.getMaintenanceTickets(params);
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (ticketId: string) => {
    try {
      setDetailsLoading(true);
      setSelectedTicketId(ticketId);
      const response = await ownerPortalService.getMaintenanceTicketDetails(ticketId);
      if (response.data?.success && response.data?.data?.ticket) {
        setTicketDetails(response.data.data);
        setDetailsModalVisible(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des détails');
    } finally {
      setDetailsLoading(false);
    }
  };

  const columns = [
    {
      title: 'Propriété',
      dataIndex: 'propertyAddress',
      key: 'propertyAddress',
    },
    {
      title: 'Titre',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: 'Catégorie',
      dataIndex: 'category',
      key: 'category',
      render: (category: string) => getCategoryLabel(category),
      filters: [
        { text: 'Plomberie', value: 'PLUMBING' },
        { text: 'Électricité', value: 'ELECTRICITY' },
        { text: 'Climatisation', value: 'AC' },
        { text: 'Autre', value: 'OTHER' },
      ],
      onFilter: (value: any, record: MaintenanceTicketListItem) => record.category === value,
    },
    {
      title: 'Priorité',
      dataIndex: 'priority',
      key: 'priority',
      render: (priority: string) => getPriorityTag(priority),
      filters: [
        { text: 'Basse', value: 'LOW' },
        { text: 'Moyenne', value: 'MEDIUM' },
        { text: 'Haute', value: 'HIGH' },
        { text: 'Urgente', value: 'URGENT' },
      ],
      onFilter: (value: any, record: MaintenanceTicketListItem) => record.priority === value,
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status),
      filters: [
        { text: 'Déclaré', value: 'DECLARED' },
        { text: 'En cours', value: 'IN_PROGRESS' },
        { text: 'Assigné', value: 'ASSIGNED' },
        { text: 'Résolu', value: 'RESOLVED' },
        { text: 'Annulé', value: 'CANCELED' },
      ],
      onFilter: (value: any, record: MaintenanceTicketListItem) => record.status === value,
    },
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: Date | string) => {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dayjs(dateObj).format('DD/MM/YYYY');
      },
      sorter: (a: MaintenanceTicketListItem, b: MaintenanceTicketListItem) => {
        const dateA = typeof a.createdAt === 'string' ? new Date(a.createdAt) : a.createdAt;
        const dateB = typeof b.createdAt === 'string' ? new Date(b.createdAt) : b.createdAt;
        return dateA.getTime() - dateB.getTime();
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: MaintenanceTicketListItem) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetails(record.id)}
          loading={detailsLoading && selectedTicketId === record.id}
        >
          Détails
        </Button>
      ),
    },
  ];

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="Chargement des tickets de maintenance..." />
      </div>
    );
  }

  if (error) {
    return <Alert message="Erreur" description={error} type="error" showIcon />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2}>Maintenance</Title>
          <Text type="secondary">Suivi des tickets de maintenance</Text>
        </div>
        <Button
          icon={<SyncOutlined />}
          onClick={loadTickets}
          loading={loading}
          aria-label="Rafraîchir les tickets"
        >
          Actualiser
        </Button>
      </div>

      {/* Summary Cards (T127) */}
      {data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="Total"
              value={data.summary.total.toString()}
              icon={<ToolOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="Ouverts"
              value={data.summary.open.toString()}
              icon={<ToolOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ fontSize: 18, color: '#faad14' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="En cours"
              value={data.summary.inProgress.toString()}
              icon={<ToolOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18, color: '#1890ff' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="Résolus"
              value={data.summary.resolved.toString()}
              icon={<ToolOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ fontSize: 18, color: '#52c41a' }}
            />
          </Col>
        </Row>
      )}

      {/* Filters (T126) */}
      <Card
        title={
          <Space>
            <FilterOutlined />
            <span>Filtres</span>
          </Space>
        }
      >
        <Space wrap>
          <Space>
            <Text strong>Statut:</Text>
            <Select
              style={{ width: 150 }}
              placeholder="Tous les statuts"
              allowClear
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
            >
              <Option value="DECLARED">Déclaré</Option>
              <Option value="IN_PROGRESS">En cours</Option>
              <Option value="ASSIGNED">Assigné</Option>
              <Option value="RESOLVED">Résolu</Option>
              <Option value="CANCELED">Annulé</Option>
            </Select>
          </Space>
          <Space>
            <Text strong>Propriété:</Text>
            <Select
              style={{ width: 200 }}
              placeholder="Toutes les propriétés"
              allowClear
              value={propertyFilter}
              onChange={(value) => setPropertyFilter(value)}
            >
              {properties.map(prop => (
                <Option key={prop.id} value={prop.id}>{prop.address}</Option>
              ))}
            </Select>
          </Space>
          <Space>
            <Text strong>Catégorie:</Text>
            <Select
              style={{ width: 150 }}
              placeholder="Toutes les catégories"
              allowClear
              value={categoryFilter}
              onChange={(value) => setCategoryFilter(value)}
            >
              <Option value="PLUMBING">Plomberie</Option>
              <Option value="ELECTRICITY">Électricité</Option>
              <Option value="AC">Climatisation</Option>
              <Option value="OTHER">Autre</Option>
            </Select>
          </Space>
          <Space>
            <Text strong>Priorité:</Text>
            <Select
              style={{ width: 150 }}
              placeholder="Toutes les priorités"
              allowClear
              value={priorityFilter}
              onChange={(value) => setPriorityFilter(value)}
            >
              <Option value="LOW">Basse</Option>
              <Option value="MEDIUM">Moyenne</Option>
              <Option value="HIGH">Haute</Option>
              <Option value="URGENT">Urgente</Option>
            </Select>
          </Space>
        </Space>
      </Card>

      {/* Tickets Table (T126) */}
      <Card title="Liste des tickets">
        {data && data.tickets.length > 0 ? (
          <Table
            columns={columns}
            dataSource={data.tickets}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20 }}
          />
        ) : (
          <Empty description="Aucun ticket trouvé" />
        )}
      </Card>

      {/* Ticket Details Modal (T128-T129) */}
      <Modal
        title={
          <Space>
            <ToolOutlined />
            <span>Détails du ticket</span>
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
            <Descriptions bordered column={2}>
              <Descriptions.Item label="Titre">{ticketDetails.ticket.title}</Descriptions.Item>
              <Descriptions.Item label="Statut">{getStatusTag(ticketDetails.ticket.status)}</Descriptions.Item>
              <Descriptions.Item label="Catégorie">{getCategoryLabel(ticketDetails.ticket.category)}</Descriptions.Item>
              <Descriptions.Item label="Priorité">{getPriorityTag(ticketDetails.ticket.priority)}</Descriptions.Item>
              <Descriptions.Item label="Propriété">{ticketDetails.ticket.property.address}</Descriptions.Item>
              <Descriptions.Item label="Date de création">
                {dayjs(ticketDetails.ticket.created_at).format('DD/MM/YYYY HH:mm')}
              </Descriptions.Item>
              {ticketDetails.ticket.location_details && (
                <Descriptions.Item label="Localisation" span={2}>
                  {ticketDetails.ticket.location_details}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Description" span={2}>
                {ticketDetails.ticket.description}
              </Descriptions.Item>
              {ticketDetails.ticket.assignedVendor && (
                <Descriptions.Item label="Vendeur assigné">
                  {ticketDetails.ticket.assignedVendor.name}
                  {ticketDetails.ticket.assignedVendor.phone && ` - ${ticketDetails.ticket.assignedVendor.phone}`}
                </Descriptions.Item>
              )}
              {ticketDetails.ticket.assignedToUser && (
                <Descriptions.Item label="Utilisateur assigné">
                  {`${ticketDetails.ticket.assignedToUser.firstName} ${ticketDetails.ticket.assignedToUser.lastName}`}
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* Attachments */}
            {ticketDetails.ticket.attachments && ticketDetails.ticket.attachments.length > 0 && (
              <div>
                <Title level={5}>Pièces jointes</Title>
                <Image.PreviewGroup>
                  <Space wrap>
                    {ticketDetails.ticket.attachments.map(att => {
                      const imageUrl = getAttachmentUrl(att.file_url);
                      // Check if file is an image based on extension or mime type
                      const isImageFile = /\.(jpg|jpeg|png|gif|webp)$/i.test(att.file_name) || 
                                         att.file_name.toLowerCase().includes('image');
                      
                      if (!isImageFile) {
                        // For non-image files, show a file icon
                        return (
                          <div
                            key={att.id}
                            style={{
                              width: 100,
                              height: 100,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: '1px solid #d9d9d9',
                              borderRadius: 4,
                              padding: 8,
                              backgroundColor: '#fafafa'
                            }}
                          >
                            <FileOutlined style={{ fontSize: 32, color: '#1890ff' }} />
                            <Text style={{ fontSize: 10, marginTop: 4, textAlign: 'center' }} ellipsis>
                              {att.file_name}
                            </Text>
                          </div>
                        );
                      }
                      
                      return (
                        <Image
                          key={att.id}
                          width={100}
                          height={100}
                          src={imageUrl}
                          alt={att.file_name}
                          style={{ objectFit: 'cover', borderRadius: 4 }}
                          preview={{
                            mask: 'Aperçu'
                          }}
                          onError={(e) => {
                            console.error('Image load error:', {
                              url: imageUrl,
                              fileUrl: att.file_url,
                              fileName: att.file_name,
                              error: e
                            });
                          }}
                        />
                      );
                    })}
                  </Space>
                </Image.PreviewGroup>
              </div>
            )}

            {/* Comments */}
            {ticketDetails.ticket.comments && ticketDetails.ticket.comments.length > 0 && (
              <div>
                <Title level={5}>
                  <MessageOutlined /> Commentaires
                </Title>
                <List
                  dataSource={ticketDetails.ticket.comments}
                  renderItem={(comment) => {
                    const authorName = comment.authorUser
                      ? `${comment.authorUser.firstName} ${comment.authorUser.lastName}`
                      : comment.authorContact
                      ? `${comment.authorContact.firstName} ${comment.authorContact.lastName}`
                      : 'Système';
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
                  <CalendarOutlined /> Historique des statuts
                </Title>
                <List
                  dataSource={ticketDetails.ticket.statusHistory}
                  renderItem={(history) => {
                    const changedBy = history.changedByUser
                      ? `${history.changedByUser.firstName} ${history.changedByUser.lastName}`
                      : 'Système';
                    return (
                      <List.Item>
                        <List.Item.Meta
                          title={
                            <Space>
                              <Text>
                                {history.from_status ? `${history.from_status} → ${history.to_status}` : history.to_status}
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
                                Par {changedBy}
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
          <Empty description="Aucune information disponible" />
        )}
      </Modal>
    </Space>
  );
}
