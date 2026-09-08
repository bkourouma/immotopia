import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  App,
  Button,
  Card,
  Space,
  Row,
  Col,
  Modal,
  Spin,
  Empty,
  Alert,
  Pagination,
  Select,
  DatePicker,
  Typography,
  Divider
} from 'antd';
import { PlusOutlined, FilterOutlined, CloseOutlined, CalendarOutlined } from '@ant-design/icons';
import { ActivityForm } from '../../components/crm/ActivityForm';
import { ActivityTimeline } from '../../components/crm/ActivityTimeline';
import {
  listActivities,
  createActivity,
  listContacts,
  CrmActivity,
  CrmContact,
  CreateCrmActivityRequest,
  ActivityFilters
} from '../../services/crm-service';
import { listMembers, Member } from '../../services/membership-service';
import { CrmActivityType } from '../../types/crm-types';
import dayjs, { Dayjs } from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export const Activities: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId, contactId, dealId } = useParams<{ tenantId: string; contactId?: string; dealId?: string }>();
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState<ActivityFilters>({
    page: 1,
    limit: 50,
    contactId: contactId,
    dealId: dealId
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  useEffect(() => {
    if (tenantId) {
      loadActivities();
      loadContacts();
      loadMembers();
    }
  }, [tenantId, filters, contactId, dealId]);

  useEffect(() => {
    setFilters((prev: ActivityFilters) => ({
      ...prev,
      contactId: contactId,
      dealId: dealId
    }));
  }, [contactId, dealId]);

  const loadActivities = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listActivities(tenantId, filters);
      if (response.success) {
        setActivities(response.activities);
        setPagination(response.pagination);
      } else {
        setError('Erreur lors du chargement des activités');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des activités');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (data: CreateCrmActivityRequest) => {
    if (!tenantId) return;
    try {
      await createActivity(tenantId, data);
      setShowForm(false);
      await loadActivities();
    } catch (err: any) {
      throw err;
    }
  };

  const loadContacts = async () => {
    if (!tenantId) return;
    try {
      const response = await listContacts(tenantId, { limit: 100 });
      if (response.success) {
        setContacts(response.contacts);
      }
    } catch (err) {
      console.error('Error loading contacts:', err);
    }
  };

  const loadMembers = async () => {
    if (!tenantId) return;
    try {
      const response = await listMembers(tenantId, { limit: 100 });
      if (response.success) {
        setMembers(response.data.members);
      }
    } catch (err) {
      console.error('Error loading members:', err);
    }
  };

  const handleTypeFilter = (type: string) => {
    setFilters({ ...filters, page: 1, type: (type || undefined) as CrmActivityType | undefined });
  };

  const handleContactFilter = (contactId: string) => {
    setFilters({ ...filters, page: 1, contactId: contactId || undefined });
  };

  const handleCollaboratorFilter = (userId: string) => {
    setFilters({ ...filters, page: 1, createdBy: userId || undefined });
  };

  const handleDateRangeFilter = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      setFilters({
        ...filters,
        page: 1,
        startDate: dates[0].format('YYYY-MM-DD'),
        endDate: dates[1].format('YYYY-MM-DD')
      });
    } else {
      setFilters({ ...filters, page: 1, startDate: undefined, endDate: undefined });
    }
  };

  const clearFilters = () => {
    setFilters({
      page: 1,
      limit: 50,
      contactId: contactId,
      dealId: dealId
    });
    setShowAdvancedFilters(false);
    message.info('Filtres réinitialisés');
  };

  const typeLabels: Record<string, string> = {
    CALL: 'Appel',
    EMAIL: 'Email',
    SMS: 'SMS',
    WHATSAPP: 'WhatsApp',
    VISIT: 'Visite',
    MEETING: 'Réunion',
    NOTE: 'Note',
    TASK: 'Tâche'
  };

  const activityTypes = ['CALL', 'EMAIL', 'SMS', 'WHATSAPP', 'VISIT', 'MEETING', 'NOTE', 'TASK'];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} sm={24} md={12}>
            <Title level={2} style={{ margin: 0 }}>
              Activités
            </Title>
            <Text type="secondary">Suivez toutes les interactions et activités</Text>
          </Col>
          <Col xs={24} sm={24} md={12} style={{ textAlign: 'right' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
              Nouvelle activité
            </Button>
          </Col>
        </Row>

        <Modal
          title="Créer une nouvelle activité"
          open={showForm && !!tenantId}
          onCancel={() => setShowForm(false)}
          footer={null}
          width={800}
        >
          {tenantId && (
            <ActivityForm
              tenantId={tenantId}
              contactId={contactId}
              dealId={dealId}
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
            />
          )}
        </Modal>

        {/* Filters */}
        <Card title="Filtres" extra={<FilterOutlined />}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {/* Type Filters */}
            <div>
              <Text strong style={{ marginRight: 16 }}>
                Type d'activité:
              </Text>
              <Space wrap>
                <Button type={!filters.type ? 'primary' : 'default'} onClick={() => handleTypeFilter('')}>
                  Tous les types
                </Button>
                {activityTypes.map(type => (
                  <Button
                    key={type}
                    type={filters.type === type ? 'primary' : 'default'}
                    onClick={() => handleTypeFilter(type)}
                  >
                    {typeLabels[type] || type}
                  </Button>
                ))}
              </Space>
            </div>

            <Divider style={{ margin: '12px 0' }} />

            {/* Advanced Filters */}
            <Space wrap>
              <Button icon={<FilterOutlined />} onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}>
                {showAdvancedFilters ? 'Masquer' : 'Afficher'} les filtres avancés
              </Button>
              {(filters.contactId || filters.createdBy || filters.startDate || filters.endDate) && (
                <Button icon={<CloseOutlined />} onClick={clearFilters}>
                  Réinitialiser
                </Button>
              )}
            </Space>

            {showAdvancedFilters && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <Row gutter={[16, 16]}>
                  {/* Contact Filter */}
                  <Col xs={24} sm={12} md={6}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>
                      Contact
                    </Text>
                    <Select
                      style={{ width: '100%' }}
                      placeholder="Tous les contacts"
                      allowClear
                      value={filters.contactId || undefined}
                      onChange={value => handleContactFilter(value || '')}
                      showSearch
                      filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      options={contacts.map(contact => ({
                        value: contact.id,
                        label: `${contact.firstName} ${contact.lastName}`
                      }))}
                    />
                  </Col>

                  {/* Collaborator Filter */}
                  <Col xs={24} sm={12} md={6}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>
                      Collaborateur
                    </Text>
                    <Select
                      style={{ width: '100%' }}
                      placeholder="Tous les collaborateurs"
                      allowClear
                      value={filters.createdBy || undefined}
                      onChange={value => handleCollaboratorFilter(value || '')}
                      showSearch
                      filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      options={members.map(member => ({
                        value: member.user.id,
                        label: member.user.fullName || member.user.email
                      }))}
                    />
                  </Col>

                  {/* Date Range Filter */}
                  <Col xs={24} sm={12} md={12}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>
                      Période
                    </Text>
                    <RangePicker
                      style={{ width: '100%' }}
                      format="DD/MM/YYYY"
                      placeholder={['Date début', 'Date fin']}
                      value={
                        filters.startDate && filters.endDate ? [dayjs(filters.startDate), dayjs(filters.endDate)] : null
                      }
                      onChange={handleDateRangeFilter}
                    />
                  </Col>
                </Row>
              </>
            )}
          </Space>
        </Card>

        {/* Activities Timeline */}
        {error && (
          <Alert message="Erreur" description={error} type="error" showIcon closable onClose={() => setError(null)} />
        )}

        <Card>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text>Chargement des activités...</Text>
              </div>
            </div>
          ) : activities.length === 0 ? (
            <Empty
              image={<CalendarOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
              imageStyle={{ height: 64 }}
              description={
                <Space direction="vertical" size="small">
                  <Text strong>Aucune activité trouvée</Text>
                  <Text type="secondary">Commencez par créer votre première activité.</Text>
                </Space>
              }
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
                Créer une activité
              </Button>
            </Empty>
          ) : (
            <ActivityTimeline activities={activities} loading={loading} tenantId={tenantId} contactId={contactId} />
          )}
        </Card>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <Card>
            <Row justify="space-between" align="middle" gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <Text type="secondary">
                  Affichage de {(pagination.page - 1) * pagination.limit + 1} à{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} sur {pagination.total} activités
                </Text>
              </Col>
              <Col xs={24} sm={12} style={{ textAlign: 'right' }}>
                <Pagination
                  current={pagination.page}
                  total={pagination.total}
                  pageSize={pagination.limit}
                  showSizeChanger={false}
                  showTotal={(total, range) => `${range[0]}-${range[1]} sur ${total}`}
                  onChange={page => setFilters({ ...filters, page })}
                />
              </Col>
            </Row>
          </Card>
        )}
      </Space>
    </>
  );
};
