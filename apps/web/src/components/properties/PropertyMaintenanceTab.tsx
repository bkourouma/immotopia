import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Select, Space, Typography, Empty, Spin, Tag, Button } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { TicketStatusBadge } from '../maintenance/TicketStatusBadge';
import { propertyMaintenanceService } from '../../services/maintenance-service';
import { Ticket, MaintenanceTicketStatus, MaintenanceTicketCategory } from '../../types/maintenance-types';
import { safeFormatDate } from '../../utils/date-utils';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;
const { Option } = Select;

const categoryLabels: Record<string, string> = {
  PLUMBING: 'Plomberie',
  ELECTRICITY: t('Électricité'),
  AC: 'Climatisation',
  OTHER: 'Autre'
};

const priorityLabels: Record<string, string> = {
  LOW: 'Faible',
  MEDIUM: 'Moyenne',
  HIGH: t('Élevée'),
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

export const PropertyMaintenanceTab: React.FC<PropertyMaintenanceTabProps> = ({ propertyId, tenantId }) => {
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
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const columns = [
    {
      title: t('Titre'),
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: Ticket) => (
        <Button type="link" onClick={() => navigate(`/tenant/${tenantId}/admin/maintenance/tickets/${record.id}`)}>
          {text}
        </Button>
      )
    },
    {
      title: t('Catégorie'),
      dataIndex: 'category',
      key: 'category',
      render: (category: string) => categoryLabels[category] || category
    },
    {
      title: t('Priorité'),
      dataIndex: 'priority',
      key: 'priority',
      render: (priority: string) => <Tag color={priorityColors[priority]}>{priorityLabels[priority] || priority}</Tag>
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (status: MaintenanceTicketStatus) => <TicketStatusBadge status={status} />
    },
    {
      title: t('Prestataire'),
      dataIndex: ['assignedVendor', 'name'],
      key: 'assignedVendor',
      render: (name: string) => name || '-'
    },
    {
      title: t('Date de création'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string | null | undefined) => safeFormatDate(date, 'DD MMM YYYY', '-')
    }
  ];

  return (
    <div>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div className="it-toolbar">
          <Title level={5} className="it-toolbar__title" style={{ margin: 0 }}>
            {t('Historique de maintenance')}
          </Title>
          <div className="it-toolbar__actions">
            <Select
              showSearch
              optionFilterProp="children"
              placeholder={t('Filtrer par statut')}
              allowClear
              style={{ width: 200 }}
              value={filters.status}
              onChange={value => handleFilterChange('status', value)}
            >
              <Option value="DECLARED">{t('Déclaré')}</Option>
              <Option value="IN_PROGRESS">{t('En cours')}</Option>
              <Option value="ASSIGNED">{t('Assigné')}</Option>
              <Option value="RESOLVED">{t('Résolu')}</Option>
              <Option value="CANCELED">{t('Annulé')}</Option>
            </Select>

            <Select
              showSearch
              optionFilterProp="children"
              placeholder={t('Filtrer par catégorie')}
              allowClear
              style={{ width: 200 }}
              value={filters.category}
              onChange={value => handleFilterChange('category', value)}
            >
              <Option value="PLUMBING">{t('Plomberie')}</Option>
              <Option value="ELECTRICITY">{t('Électricité')}</Option>
              <Option value="AC">{t('Climatisation')}</Option>
              <Option value="OTHER">{t('Autre')}</Option>
            </Select>
          </div>
        </div>

        {tickets.length === 0 && !loading ? (
          <Empty
            description={t('Aucun ticket de maintenance pour cette propriété')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Table
            columns={columns}
            dataSource={tickets}
            rowKey="id"
            loading={loading}
            pagination={false}
            size="middle"
            // Six colonnes ne tiennent pas sous 992 px : le tableau defile
            // horizontalement plutot que de comprimer ses colonnes.
            scroll={{ x: 'max-content' }}
          />
        )}
      </Space>
    </div>
  );
};
