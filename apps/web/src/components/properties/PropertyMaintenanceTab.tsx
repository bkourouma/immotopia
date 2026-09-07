import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Select,
  Space,
  Typography,
  Empty,
  Spin,
  Tag,
  Button
} from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { TicketStatusBadge } from '../maintenance/TicketStatusBadge';
import { propertyMaintenanceService } from '../../services/maintenance-service';
import { Ticket, MaintenanceTicketStatus, MaintenanceTicketCategory } from '../../types/maintenance-types';
import { safeFormatDate } from '../../utils/date-utils';

const { Title, Text } = Typography;
const { Option } = Select;

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

interface PropertyMaintenanceTabProps {
  propertyId: string;
  tenantId: string;
}

export const PropertyMaintenanceTab: React.FC<PropertyMaintenanceTabProps> = ({
  propertyId,
  tenantId
}) => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: undefined as MaintenanceTicketStatus | undefined,
    category: undefined as MaintenanceTicketCategory | undefined
  });

  useEffect(() => {
    if (tenantId && propertyId) {
      loadHistory();
    }
  }, [tenantId, propertyId, filters]);

  const loadHistory = async () => {
    if (!tenantId || !propertyId) return;

    setLoading(true);
    try {
      const response = await propertyMaintenanceService.getHistory(tenantId, propertyId, filters);
      if (response.success) {
        setTickets(response.data);
      }
    } catch (error) {
      console.error('Error loading maintenance history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const columns = [
    {
      title: 'Titre',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: Ticket) => (
        <Button
          type="link"
          onClick={() => navigate(`/tenant/${tenantId}/admin/maintenance/tickets/${record.id}`)}
        >
          {text}
        </Button>
      )
    },
    {
      title: 'Catégorie',
      dataIndex: 'category',
      key: 'category',
      render: (category: string) => categoryLabels[category] || category
    },
    {
      title: 'Priorité',
      dataIndex: 'priority',
      key: 'priority',
      render: (priority: string) => (
        <Tag color={priorityColors[priority]}>{priorityLabels[priority] || priority}</Tag>
      )
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: (status: MaintenanceTicketStatus) => <TicketStatusBadge status={status} />
    },
    {
      title: 'Prestataire',
      dataIndex: ['assignedVendor', 'name'],
      key: 'assignedVendor',
      render: (name: string) => name || '-'
    },
    {
      title: 'Date de création',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string | null | undefined) => safeFormatDate(date, 'DD MMM YYYY', '-')
    }
  ];

  return (
    <div>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={5} style={{ margin: 0 }}>
            Historique de maintenance
          </Title>
          <Space>
            <Select
              placeholder="Filtrer par statut"
              allowClear
              style={{ width: 200 }}
              value={filters.status}
              onChange={(value) => handleFilterChange('status', value)}
            >
              <Option value="DECLARED">Déclaré</Option>
              <Option value="IN_PROGRESS">En cours</Option>
              <Option value="ASSIGNED">Assigné</Option>
              <Option value="RESOLVED">Résolu</Option>
              <Option value="CANCELED">Annulé</Option>
            </Select>

            <Select
              placeholder="Filtrer par catégorie"
              allowClear
              style={{ width: 200 }}
              value={filters.category}
              onChange={(value) => handleFilterChange('category', value)}
            >
              <Option value="PLUMBING">Plomberie</Option>
              <Option value="ELECTRICITY">Électricité</Option>
              <Option value="AC">Climatisation</Option>
              <Option value="OTHER">Autre</Option>
            </Select>
          </Space>
        </div>

        {tickets.length === 0 && !loading ? (
          <Empty
            description="Aucun ticket de maintenance pour cette propriété"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Table
            columns={columns}
            dataSource={tickets}
            rowKey="id"
            loading={loading}
            pagination={false}
          />
        )}
      </Space>
    </div>
  );
};
