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
import { t } from '../../../i18n/t';

const { Title } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

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

  /**
   * Filtres appliqués, distincts des filtres en cours de saisie (§8.4).
   *
   * L'écran chargeait DEUX fois à chaque usage : l'effet réagissait au moindre
   * changement de `filters`, et le bouton « Appliquer les filtres » relançait
   * la même requête avec les mêmes paramètres. Toucher un sélecteur puis
   * valider, le geste naturel, faisait donc deux allers-retours identiques.
   *
   * Le bouton devient le seul déclencheur — ce que demande le §8.4 —, mais la
   * pagination ne peut pas attendre un clic sur « Appliquer » : `page` vit
   * dans cet état-ci, et changer de page le met à jour directement.
   */
  const [filtresAppliques, setFiltresAppliques] = useState(filters);

  useEffect(() => {
    if (effectiveTenantId) {
      loadTickets();
    }
  }, [effectiveTenantId, filtresAppliques]);

  const appliquerLesFiltres = () => {
    // Retour à la première page : la page 7 d'un autre jeu de filtres n'a pas
    // d'équivalent, et y atterrir donne une liste vide alors que des résultats
    // existent.
    setFiltresAppliques({ ...filters, page: 1 });
  };

  const loadTickets = async () => {
    if (!effectiveTenantId) return;

    setLoading(true);
    try {
      const response = await managerMaintenanceService.listTickets(effectiveTenantId, filtresAppliques);
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
    // La page s'applique immédiatement, dans les deux états : le brouillon
    // reste cohérent avec ce qui est affiché si l'on valide ensuite.
    setFilters(prev => ({ ...prev, page }));
    setFiltresAppliques(prev => ({ ...prev, page }));
  };

  const columns = [
    {
      title: t('Titre'),
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
            textAlign: 'start',
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
      title: t('Propriété'),
      dataIndex: ['property', 'address'],
      key: 'property',
      width: 200,
      ellipsis: true,
      render: (address: string) => address || 'N/A'
    },
    {
      title: t('Catégorie'),
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (category: string) => categoryLabels[category] || category
    },
    {
      title: t('Priorité'),
      dataIndex: 'priority',
      key: 'priority',
      width: 120,
      render: (priority: string) => <Tag color={priorityColors[priority]}>{priorityLabels[priority] || priority}</Tag>
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: MaintenanceTicketStatus) => <TicketStatusBadge status={status} />
    },
    {
      title: t('Prestataire'),
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
      title: t('Date de création'),
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
      title: t('Action'),
      key: 'action',
      width: 80,
      render: (_: any, record: Ticket) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/tenant/${effectiveTenantId}/admin/maintenance/tickets/${record.id}`)}
          title={t('Voir les détails')}
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
        <div className="it-toolbar" style={{ marginBottom: 24 }}>
          <Title level={2}>{t('Gestion des tickets de maintenance')}</Title>
        </div>

        <Card style={{ marginBottom: 24 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6} lg={5}>
              <Select
                showSearch
                optionFilterProp="children"
                placeholder={t('Filtrer par statut')}
                allowClear
                style={{ width: '100%' }}
                value={filters.status}
                onChange={value => handleFilterChange('status', value)}
              >
                <Option value="DECLARED">{t('Déclaré')}</Option>
                <Option value="IN_PROGRESS">{t('En cours')}</Option>
                <Option value="ASSIGNED">{t('Assigné')}</Option>
                <Option value="RESOLVED">{t('Résolu')}</Option>
                <Option value="CANCELED">{t('Annulé')}</Option>
              </Select>
            </Col>

            <Col xs={24} sm={12} md={6} lg={5}>
              <Select
                showSearch
                optionFilterProp="children"
                placeholder={t('Filtrer par priorité')}
                allowClear
                style={{ width: '100%' }}
                value={filters.priority}
                onChange={value => handleFilterChange('priority', value)}
              >
                <Option value="LOW">{t('Faible')}</Option>
                <Option value="MEDIUM">{t('Moyenne')}</Option>
                <Option value="HIGH">{t('Élevée')}</Option>
                <Option value="URGENT">{t('Urgente')}</Option>
              </Select>
            </Col>

            <Col xs={24} sm={24} md={8} lg={8}>
              <RangePicker
                placeholder={[t('Date début'), t('Date fin')]}
                onChange={handleDateRangeChange}
                format="DD/MM/YYYY"
                style={{ width: '100%' }}
              />
            </Col>

            <Col xs={24} sm={24} md={4} lg={6}>
              <Button icon={<FilterOutlined />} onClick={appliquerLesFiltres} block type="primary">
                {t('Appliquer les filtres')}
              </Button>
            </Col>
          </Row>
        </Card>

        <Card>
          {tickets.length === 0 ? (
            <Empty description={t('Aucun ticket de maintenance')} />
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
                    showTotal={total => t('Total: {{total}} tickets', { total: total })}
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
