import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, Space, Row, Col, Modal, Spin, Empty, Alert, Pagination, Typography } from 'antd';
import { PlusOutlined, CalendarOutlined } from '@ant-design/icons';
import { ActivityForm } from '../../components/crm/ActivityForm';
import { ActivityTimeline } from '../../components/crm/ActivityTimeline';
import { ListSearch } from '../../components/primitives/ListSearch';
import { useListSearch } from '../../hooks/useListSearch';
import {
  listActivities,
  createActivity,
  listContacts,
  getContact,
  CrmActivity,
  CreateCrmActivityRequest,
  ActivityFilters
} from '../../services/crm-service';
import { listAssignableMembers } from '../../services/membership-service';
import { t } from '../../i18n/t';
import { activityTypeLabel } from '../../utils/crm-labels';
import { contactDisplayNameWithEmail } from '../../utils/contact-display';

const { Title, Text } = Typography;

const ACTIVITY_TYPES = ['CALL', 'EMAIL', 'SMS', 'WHATSAPP', 'VISIT', 'MEETING', 'NOTE', 'TASK'];

export const Activities: React.FC = () => {
  const { tenantId, contactId, dealId } = useParams<{ tenantId: string; contactId?: string; dealId?: string }>();
  // `loadOptions` / `resolveLabel` sont figés au premier rendu : le tenant courant se lit par une ref.
  const tenantRef = useRef(tenantId);
  tenantRef.current = tenantId;
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });
  const [members, setMembers] = useState<{ value: string; label: string }[]>([]);

  // Recherche multicritères : l'état vit dans l'URL, tout part à l'API (page serveur de 50 activités).
  const search = useListSearch({
    defaultPageSize: 50,
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Sujet, contenu, résultat, contact, auteur…')
      },
      {
        key: 'type',
        type: 'multiSelect',
        label: t("Type d'activité"),
        primary: true,
        options: ACTIVITY_TYPES.map(type => ({ value: type, label: activityTypeLabel(type) }))
      },
      {
        key: 'contactId',
        type: 'select',
        label: t('Contact'),
        primary: true,
        placeholder: t('Tous les contacts'),
        // Contacts à recherche distante : 20 au plus, filtrés par le serveur.
        loadOptions: async term => {
          const response = await listContacts(tenantRef.current as string, {
            search: term || undefined,
            page: 1,
            limit: 20
          });
          return (response.contacts ?? []).map(contact => ({
            value: contact.id,
            label: contactDisplayNameWithEmail(contact)
          }));
        },
        resolveLabel: async id => {
          const response = await getContact(tenantRef.current as string, id);
          return response.success ? contactDisplayNameWithEmail(response.data) : undefined;
        }
      },
      { key: 'createdBy', type: 'select', label: t('Collaborateur'), primary: true, options: members },
      { key: 'period', type: 'dateRange', label: t('Période'), api: ['startDate', 'endDate'] },
      {
        key: 'direction',
        type: 'multiSelect',
        label: t('Direction'),
        options: [
          { value: 'OUT', label: t('Sortant') },
          { value: 'IN', label: t('Entrant') },
          { value: 'INTERNAL', label: t('Interne') }
        ]
      },
      { key: 'hasNextAction', type: 'boolean', label: t('Prochaine action'), tristate: true }
    ]
  });

  // Une page « activités d'un contact / d'une affaire » : la route pose le périmètre de départ,
  // le critère « Contact » de la barre peut le remplacer (comme l'ancien filtre).
  const apiParams = {
    ...search.apiParams,
    ...(contactId && !search.apiParams.contactId ? { contactId } : {}),
    ...(dealId ? { dealId } : {})
  } as ActivityFilters;

  useEffect(() => {
    if (tenantId) {
      loadActivities();
    }
  }, [tenantId, search.apiParams, contactId, dealId]);

  useEffect(() => {
    if (tenantId) {
      loadMembers();
    }
  }, [tenantId]);

  const loadActivities = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listActivities(tenantId, apiParams);
      if (response.success) {
        setActivities(response.activities);
        setPagination(response.pagination);
      } else {
        setError(t('Erreur lors du chargement des activités'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des activités'));
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

  const loadMembers = async () => {
    if (!tenantId) return;
    try {
      const response = await listAssignableMembers(tenantId);
      if (response.success) {
        setMembers(
          (response.data?.members ?? []).map(member => ({
            value: member.user.id,
            label: member.user.fullName || member.user.email
          }))
        );
      }
    } catch (err) {
      console.error('Error loading members:', err);
    }
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} sm={24} md={12}>
            <Title level={2} style={{ margin: 0 }}>
              {t('Activités')}
            </Title>
            <Text type="secondary">{t('Suivez toutes les interactions et activités')}</Text>
          </Col>
          <Col xs={24} sm={24} md={12} style={{ textAlign: 'end' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
              {t('Nouvelle activité')}
            </Button>
          </Col>
        </Row>

        <Modal
          title={t('Créer une nouvelle activité')}
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

        {/* Recherche multicritères */}
        <ListSearch {...search.searchProps} resultCount={loading ? undefined : pagination.total} />

        {/* Activities Timeline */}
        {error && (
          <Alert
            message={t('Erreur')}
            description={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
          />
        )}

        <Card>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text>{t('Chargement des activités...')}</Text>
              </div>
            </div>
          ) : activities.length === 0 && search.isFiltered ? (
            <Empty description={t('Aucun résultat')}>
              <Button onClick={search.clear}>{t('Effacer les critères')}</Button>
            </Empty>
          ) : activities.length === 0 ? (
            <Empty
              image={<CalendarOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
              imageStyle={{ height: 64 }}
              description={
                <Space direction="vertical" size="small">
                  <Text strong>{t('Aucune activité trouvée')}</Text>
                  <Text type="secondary">{t('Commencez par créer votre première activité.')}</Text>
                </Space>
              }
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
                {t('Créer une activité')}
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
                  {t('Affichage de')} {(pagination.page - 1) * pagination.limit + 1} à{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} sur {pagination.total}{' '}
                  {t('activités')}
                </Text>
              </Col>
              <Col xs={24} sm={12} style={{ textAlign: 'end' }}>
                <Pagination
                  current={pagination.page}
                  total={pagination.total}
                  pageSize={pagination.limit}
                  showSizeChanger={false}
                  showTotal={(total, range) =>
                    t('{{start}}–{{end}} sur {{total}}', { start: range[0], end: range[1], total })
                  }
                  onChange={page => search.setPage(page)}
                />
              </Col>
            </Row>
          </Card>
        )}
      </Space>
    </>
  );
};
