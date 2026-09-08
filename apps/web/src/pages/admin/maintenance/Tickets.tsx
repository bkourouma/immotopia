import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Table,
  Card,
  Select,
  Button,
  Space,
  Typography,
  DatePicker,
  Input,
  Tag,
  Empty,
  Spin,
  Pagination,
  Row,
  Col
} from 'antd';
import { EyeOutlined, FilterOutlined } from '@ant-design/icons';
import { TicketStatusBadge } from '../../../components/maintenance/TicketStatusBadge';
import { managerMaintenanceService } from '../../../services/maintenance-service';
import { Ticket, MaintenanceTicketStatus, MaintenanceTicketPriority } from '../../../types/maintenance-types';
import { useAuth } from '../../../hooks/useAuth';
import { safeFormatDate } from '../../../utils/date-utils';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const categoryLabels: Record<string, string> = {
  PLUMBING: 'Plomberie',
  ELECTRICITY: 'Électricité',
  AC: 'Climatisation',
  OTHER: 'Autre'
};

const priorityLabels: Record<string, string> = {
  LOW: 'Faible',
  MEDIUM: 'Moyenne',
  HIGH: 'Élevée',
  URGENT: 'Urgente'
};

const priorityColors: Record<string, string> = {
  LOW: 'default',
  MEDIUM: 'processing',
  HIGH: 'warning',
  URGENT: 'error'
};

export const Tickets: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    propertyId: undefined as string | undefined,
    status: undefined as MaintenanceTicketStatus | undefined,
    priority: undefined as MaintenanceTicketPriority | undefined,
    assignedVendorId: undefined as string | undefined,
    dateFrom: undefined as string | undefined,
    dateTo: undefined as string | undefined,
    page: 1,
    limit: 20
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  useEffect(() => {
    if (effectiveTenantId) {
      loadTickets();
    }
  }, [effectiveTenantId, filters]);

  const loadTickets = async () => {
    if (!effectiveTenantId) return;

    setLoading(true);
    try {
      const response = await managerMaintenanceService.listTickets(effectiveTenantId, filters);
      if (response.success) {
        setTickets(response.data);
        setPagination(response.pagination);
      }
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleDateRangeChange = (dates: any) => {
    if (dates && dates.length === 2) {
      setFilters(prev => ({
        ...prev,
        dateFrom: dates[0].format('YYYY-MM-DD'),
        dateTo: dates[1].format('YYYY-MM-DD'),
        page: 1
      }));
    } else {
      setFilters(prev => ({
        ...prev,
        dateFrom: undefined,
        dateTo: undefined,
        page: 1
      }));
    }
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const columns = [
    {
      title: 'Titre',
      dataIndex: 'title',
      key: 'title',
      width: 200,
      ellipsis: true,
      render: (text: string, record: Ticket) => (
        <Button
          type="link"
          onClick={() => navigate(`/tenant/${effectiveTenantId}/admin/maintenance/tickets/${record.id}`)}
          style={{
            padding: 0,
            textAlign: 'left',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block'
          }}
          title={text}
        >
          {text}
        </Button>
      )
    },
    {
      title: 'Propriété',
      dataIndex: ['property', 'address'],
      key: 'property',
      width: 200,
      ellipsis: true,
      render: (address: string) => address || 'N/A'
    },
    {
      title: 'Catégorie',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (category: string) => categoryLabels[category] || category
    },
    {
      title: 'Priorité',
      dataIndex: 'priority',
      key: 'priority',
      width: 120,
      render: (priority: string) => <Tag color={priorityColors[priority]}>{priorityLabels[priority] || priority}</Tag>
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: MaintenanceTicketStatus) => <TicketStatusBadge status={status} />
    },
    {
      title: 'Prestataire',
      dataIndex: ['assignedVendor', 'name'],
      key: 'assignedVendor',
      width: 150,
      ellipsis: true,
      render: (name: string, record: Ticket) => {
        // Try multiple ways to get the vendor name
        return name || record.assignedVendor?.name || '-';
      }
    },
    {
      title: 'Date de création',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (date: string | null | undefined, record: Ticket) => {
        // Try multiple approaches to format the date
        if (!date && record.createdAt) {
          date = record.createdAt;
        }
        if (!date) {
          return <span style={{ color: '#999' }}>-</span>;
        }

        // Try dayjs first (more lenient)
        const dayjsDate = dayjs(date);
        if (dayjsDate.isValid()) {
          return dayjsDate.format('DD MMM YYYY');
        }

        // Fallback to safeFormatDate
        const formatted = safeFormatDate(date, 'DD MMM YYYY', '');
        if (formatted && formatted !== 'Date invalide') {
          return formatted;
        }

        // Last resort: try to display the raw value if it exists
        return <span style={{ color: '#999' }}>-</span>;
      }
    },
    {
      title: 'Action',
      key: 'action',
      width: 80,
      render: (_: any, record: Ticket) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/tenant/${effectiveTenantId}/admin/maintenance/tickets/${record.id}`)}
          title="Voir les détails"
        />
      )
    }
  ];

  if (loading && tickets.length === 0) {
    return (
      <>
        <Spin size="large" style={{ display: 'block', textAlign: 'center', padding: '50px' }} />
      </>
    );
  }

  return (
    <>
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Title level={2}>Gestion des tickets de maintenance</Title>
        </div>

        <Card style={{ marginBottom: 24 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6} lg={5}>
              <Select
                placeholder="Filtrer par statut"
                allowClear
                style={{ width: '100%' }}
                value={filters.status}
                onChange={value => handleFilterChange('status', value)}
              >
                <Option value="DECLARED">Déclaré</Option>
                <Option value="IN_PROGRESS">En cours</Option>
                <Option value="ASSIGNED">Assigné</Option>
                <Option value="RESOLVED">Résolu</Option>
                <Option value="CANCELED">Annulé</Option>
              </Select>
            </Col>

            <Col xs={24} sm={12} md={6} lg={5}>
              <Select
                placeholder="Filtrer par priorité"
                allowClear
                style={{ width: '100%' }}
                value={filters.priority}
                onChange={value => handleFilterChange('priority', value)}
              >
                <Option value="LOW">Faible</Option>
                <Option value="MEDIUM">Moyenne</Option>
                <Option value="HIGH">Élevée</Option>
                <Option value="URGENT">Urgente</Option>
              </Select>
            </Col>

            <Col xs={24} sm={24} md={8} lg={8}>
              <RangePicker
                placeholder={['Date début', 'Date fin']}
                onChange={handleDateRangeChange}
                format="DD/MM/YYYY"
                style={{ width: '100%' }}
              />
            </Col>

            <Col xs={24} sm={24} md={4} lg={6}>
              <Button icon={<FilterOutlined />} onClick={loadTickets} block type="primary">
                Appliquer les filtres
              </Button>
            </Col>
          </Row>
        </Card>

        <Card>
          {tickets.length === 0 ? (
            <Empty description="Aucun ticket de maintenance" />
          ) : (
            <>
              <Table
                columns={columns}
                dataSource={tickets}
                rowKey="id"
                pagination={false}
                loading={loading}
                scroll={{ x: 'max-content' }}
              />

              {pagination.totalPages > 1 && (
                <div style={{ textAlign: 'center', marginTop: 24 }}>
                  <Pagination
                    current={pagination.page}
                    total={pagination.total}
                    pageSize={pagination.limit}
                    onChange={handlePageChange}
                    showTotal={total => `Total: ${total} tickets`}
                  />
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
};
