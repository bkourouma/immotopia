import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  App,
  Button,
  Input,
  Table,
  Card,
  Tag as AntTag,
  Space,
  Row,
  Col,
  Modal,
  Spin,
  Empty,
  Alert,
  Pagination,
  Checkbox,
  Typography,
  Divider,
  Tooltip,
  Popconfirm
} from 'antd';

const { Search: InputSearch } = Input;
import {
  UserOutlined,
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  EyeOutlined,
  CalendarOutlined,
  TagOutlined,
  DeleteOutlined,
  CloseOutlined,
  FilterOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  CheckOutlined
} from '@ant-design/icons';
import { ContactForm } from '../../components/crm/ContactForm';
import { ActivityForm } from '../../components/crm/ActivityForm';
import { BulkTagManager } from '../../components/crm/BulkTagManager';
import {
  listContacts,
  createContact,
  updateContact,
  createActivity,
  listTags,
  deleteContact as deleteContactApi,
  CrmContact,
  CrmTag,
  CreateCrmContactRequest,
  UpdateCrmContactRequest,
  CreateCrmActivityRequest,
  ContactFilters
} from '../../services/crm-service';
import { AdvancedFilters, AdvancedFilters as AdvancedFiltersType } from '../../components/crm/AdvancedFilters';
import { exportToCSV, exportToExcel } from '../../utils/export-utils';
import type { ColumnsType } from 'antd/es/table';
import { t as translate } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;

export const Contacts: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<CrmContact | null>(null);
  const [filters, setFilters] = useState<ContactFilters>({
    page: 1,
    limit: 20
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [selectedContactForActivity, setSelectedContactForActivity] = useState<CrmContact | null>(null);
  const [allTags, setAllTags] = useState<CrmTag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [showBulkTagManager, setShowBulkTagManager] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFiltersType>({});
  const [hasActiveDealFilter, setHasActiveDealFilter] = useState<boolean | undefined>(undefined);
  const [hasUpcomingActivityFilter, setHasUpcomingActivityFilter] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (tenantId) {
      loadContacts();
      loadTags();
    }
  }, [tenantId, filters, advancedFilters, hasActiveDealFilter, hasUpcomingActivityFilter]);

  const loadTags = async () => {
    if (!tenantId) return;
    try {
      const response = await listTags(tenantId);
      if (response.success) {
        setAllTags(response.data);
      }
    } catch (err) {
      console.error('Error loading tags:', err);
    }
  };

  const loadContacts = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listContacts(tenantId, {
        ...filters,
        search: filters.search || undefined,
        startDate: advancedFilters.startDate,
        endDate: advancedFilters.endDate,
        assignedTo: advancedFilters.assignedTo,
        source: advancedFilters.source,
        hasActiveDeal: hasActiveDealFilter,
        hasUpcomingActivity: hasUpcomingActivityFilter
      });
      if (response.success) {
        setContacts(response.contacts);
        setPagination(response.pagination);
      } else {
        setError(translate('Erreur lors du chargement des contacts'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || translate('Erreur lors du chargement des contacts'));
    } finally {
      setLoading(false);
    }
  };

  const handleStatusFilter = (status: 'LEAD' | 'ACTIVE_CLIENT' | 'ARCHIVED' | '') => {
    setFilters({ ...filters, page: 1, status: status || undefined });
  };

  const handleTagToggle = (tagId: string) => {
    const newSelectedTags = selectedTags.includes(tagId)
      ? selectedTags.filter(id => id !== tagId)
      : [...selectedTags, tagId];
    setSelectedTags(newSelectedTags);
    setFilters({ ...filters, page: 1, tagIds: newSelectedTags.length > 0 ? newSelectedTags : undefined });
  };

  const clearTagFilters = () => {
    setSelectedTags([]);
    setFilters({ ...filters, page: 1, tagIds: undefined });
  };

  const handleBulkTagComplete = () => {
    setSelectedContacts([]);
    loadContacts();
  };

  const handleCreate = async (data: CreateCrmContactRequest | UpdateCrmContactRequest) => {
    if (!tenantId) return;
    try {
      await createContact(tenantId, data as CreateCrmContactRequest);
      setShowForm(false);
      await loadContacts();
    } catch (err: any) {
      throw err; // Let ContactForm handle the error
    }
  };

  const handleUpdate = async (data: UpdateCrmContactRequest) => {
    if (!tenantId || !editingContact) return;
    try {
      await updateContact(tenantId, editingContact.id, data);
      setEditingContact(null);
      await loadContacts();
    } catch (err: any) {
      throw err; // Let ContactForm handle the error
    }
  };

  const handleDeleteContact = async (contact: CrmContact) => {
    if (!tenantId) return;
    try {
      await deleteContactApi(tenantId, contact.id);
      message.success(translate('Contact supprimé avec succès'));
      await loadContacts();
    } catch (err: any) {
      console.error('Error deleting contact:', err);
      message.error(err?.response?.data?.message || translate('Erreur lors de la suppression du contact'));
    }
  };

  const handleAddActivity = (contact: CrmContact) => {
    setSelectedContactForActivity(contact);
    setShowActivityForm(true);
  };

  const handleAddAppointment = (contact: CrmContact) => {
    // Navigate to calendar page for the contact
    navigate(`/tenant/${tenantId}/crm/calendar`);
  };

  const handleCreateActivity = async (data: CreateCrmActivityRequest) => {
    if (!tenantId) return;
    try {
      await createActivity(tenantId, data);
      setShowActivityForm(false);
      setSelectedContactForActivity(null);
      // Optionally show success message or reload contacts
    } catch (err: any) {
      throw err;
    }
  };

  const handleExportCSV = () => {
    const exportData = contacts.map(contact => ({
      Nom: `${contact.firstName} ${contact.lastName}`,
      Email: contact.email,
      Téléphone: contact.phonePrimary || contact.phone || '',
      Statut:
        contact.status === 'LEAD'
          ? 'Prospect'
          : contact.status === 'ACTIVE_CLIENT'
            ? translate('Client actif')
            : translate('Archivé'),
      Source: contact.source || '',
      'Prochaine action': contact.nextAction
        ? `${contact.nextAction.nextActionType || 'Action'} - ${new Date(contact.nextAction.nextActionAt).toLocaleDateString(activeLocale())}`
        : '',
      'Affaire en cours': contact.activeDeal
        ? `${contact.activeDeal.type === 'ACHAT' ? 'Achat' : 'Location'} - ${contact.activeDeal.stage}`
        : '',
      'Date de création': new Date(contact.createdAt).toLocaleDateString(activeLocale())
    }));
    exportToCSV(exportData, 'contacts');
    message.success(translate('Export CSV réussi'));
  };

  const handleExportExcel = async () => {
    const exportData = contacts.map(contact => ({
      Nom: `${contact.firstName} ${contact.lastName}`,
      Email: contact.email,
      Téléphone: contact.phonePrimary || contact.phone || '',
      Statut:
        contact.status === 'LEAD'
          ? 'Prospect'
          : contact.status === 'ACTIVE_CLIENT'
            ? translate('Client actif')
            : translate('Archivé'),
      Source: contact.source || '',
      'Prochaine action': contact.nextAction
        ? `${contact.nextAction.nextActionType || 'Action'} - ${new Date(contact.nextAction.nextActionAt).toLocaleDateString(activeLocale())}`
        : '',
      'Affaire en cours': contact.activeDeal
        ? `${contact.activeDeal.type === 'ACHAT' ? 'Achat' : 'Location'} - ${contact.activeDeal.stage}`
        : '',
      'Date de création': new Date(contact.createdAt).toLocaleDateString(activeLocale())
    }));
    await exportToExcel(exportData, 'contacts', 'Contacts');
    message.success(translate('Export Excel réussi'));
  };

  const columns: ColumnsType<CrmContact> = [
    {
      title: translate('Nom'),
      key: 'name',
      render: (_, record) => <Text strong>{`${record.firstName} ${record.lastName}`}</Text>
    },
    {
      title: translate('Email'),
      dataIndex: 'email',
      key: 'email'
    },
    {
      title: translate('Téléphone'),
      key: 'phone',
      // `phone` est un champ historique que l'API ne renseigne plus : le numero
      // vit dans `phonePrimary`. On garde le repli pour les contacts anciens.
      render: (_, record) => record.phonePrimary || record.phone || '-'
    },
    {
      title: translate('Prochaine action'),
      key: 'nextAction',
      render: (_, record) => {
        if (!record.nextAction) return <Text type="secondary">-</Text>;
        return (
          <Space direction="vertical" size={0}>
            <Text>{record.nextAction.nextActionType || translate('Action')}</Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {new Date(record.nextAction.nextActionAt).toLocaleDateString(activeLocale(), {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              })}
            </Text>
          </Space>
        );
      }
    },
    {
      title: translate('Affaire en cours'),
      key: 'activeDeal',
      render: (_, record) => {
        if (!record.activeDeal) return <Text type="secondary">-</Text>;
        const dealType = record.activeDeal.type === 'ACHAT' ? 'Achat' : 'Location';
        const stageMap: Record<string, string> = {
          NEW: 'Nouveau',
          QUALIFIED: translate('Qualifié'),
          VISIT: 'Visite',
          NEGOTIATION: translate('Négociation')
        };
        return (
          <Space direction="vertical" size={0}>
            <Text>{dealType}</Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {stageMap[record.activeDeal.stage] || record.activeDeal.stage}
            </Text>
          </Space>
        );
      }
    },
    {
      title: translate('Actions'),
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          <Tooltip title={translate('Ajouter une activité')}>
            <Button type="text" icon={<CalendarOutlined />} onClick={() => handleAddActivity(record)} />
          </Tooltip>
          <Tooltip title={translate('Voir les détails')}>
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/tenant/${tenantId}/crm/contacts/${record.id}`)}
            />
          </Tooltip>
          <Tooltip title={translate('Modifier')}>
            <Button type="text" icon={<EditOutlined />} onClick={() => setEditingContact(record)} />
          </Tooltip>
          <Tooltip title={translate('Supprimer')}>
            <Popconfirm
              title={translate('Supprimer ce contact ?')}
              description={translate('Cette action est définitive. Confirmez la suppression du contact.')}
              okText={translate('Supprimer')}
              okType="danger"
              cancelText={translate('Annuler')}
              onConfirm={() => handleDeleteContact(record)}
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      )
    }
  ];

  const rowSelection = {
    selectedRowKeys: selectedContacts,
    onChange: (selectedRowKeys: React.Key[]) => {
      setSelectedContacts(selectedRowKeys as string[]);
    },
    onSelectAll: (selected: boolean, selectedRows: CrmContact[], changeRows: CrmContact[]) => {
      if (selected) {
        setSelectedContacts(contacts.map(c => c.id));
      } else {
        setSelectedContacts([]);
      }
    }
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} sm={24} md={12}>
            <Title level={2} style={{ margin: 0 }}>
              {translate('Contacts')}
            </Title>
            <Text type="secondary">{translate('Gérez vos contacts et prospects CRM')}</Text>
          </Col>
          <Col xs={24} sm={24} md={12}>
            <Space wrap>
              <Button icon={<DownloadOutlined />} onClick={handleExportCSV}>
                {translate('Exporter CSV')}
              </Button>
              <Button icon={<FileExcelOutlined />} onClick={handleExportExcel}>
                {translate('Exporter Excel')}
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
                {translate('Nouveau contact')}
              </Button>
            </Space>
          </Col>
        </Row>

        <Modal
          title={translate('Créer un nouveau contact')}
          open={showForm}
          onCancel={() => setShowForm(false)}
          footer={null}
          width={800}
          // ANO-22, recette du 20 septembre 2026 : sans ce démontage, `ContactForm`
          // restait monté entre deux ouvertures et rouvrait sur le dernier onglet
          // visité, avec les valeurs du contact précédemment saisi encore dans le
          // formulaire — y compris après « Annuler ». La modale d'édition
          // (ci-dessous) n'a jamais eu ce défaut : elle ne rend `ContactForm` que
          // lorsque `editingContact` est défini, ce qui le démonte déjà à la
          // fermeture. Ici, `ContactForm` était rendu inconditionnellement, sans
          // jamais se démonter — `destroyOnHidden` force ce même démontage.
          destroyOnHidden
        >
          <ContactForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </Modal>

        <Modal
          title={translate('Modifier le contact')}
          open={!!editingContact}
          onCancel={() => setEditingContact(null)}
          footer={null}
          width={800}
        >
          {editingContact && (
            <ContactForm contact={editingContact} onSubmit={handleUpdate} onCancel={() => setEditingContact(null)} />
          )}
        </Modal>

        <Modal
          title={translate('Ajouter une activité au contact')}
          open={showActivityForm && !!selectedContactForActivity}
          onCancel={() => {
            setShowActivityForm(false);
            setSelectedContactForActivity(null);
          }}
          footer={null}
          width={600}
        >
          {selectedContactForActivity && (
            <ActivityForm
              tenantId={tenantId!}
              contactId={selectedContactForActivity.id}
              onSubmit={handleCreateActivity}
              onCancel={() => {
                setShowActivityForm(false);
                setSelectedContactForActivity(null);
              }}
            />
          )}
        </Modal>

        {/* Filters */}
        <Card title={translate('Filtres')} extra={<FilterOutlined />}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <InputSearch
              placeholder={translate('Rechercher des contacts...')}
              allowClear
              enterButton={<SearchOutlined />}
              size="large"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onSearch={value => {
                setSearchTerm(value);
                setFilters({ ...filters, page: 1, search: value || undefined });
              }}
            />

            <Divider style={{ margin: '12px 0' }} />

            <div>
              <Text strong style={{ marginInlineEnd: 16 }}>
                Statut:
              </Text>
              <Space wrap>
                <Button type={!filters.status ? 'primary' : 'default'} onClick={() => handleStatusFilter('')}>
                  {translate('Tous')}
                </Button>
                <Button
                  type={filters.status === 'LEAD' ? 'primary' : 'default'}
                  onClick={() => handleStatusFilter('LEAD')}
                >
                  {translate('Prospects')}
                </Button>
                <Button
                  type={filters.status === 'ACTIVE_CLIENT' ? 'primary' : 'default'}
                  onClick={() => handleStatusFilter('ACTIVE_CLIENT')}
                >
                  {translate('Clients')}
                </Button>
                <Button
                  type={filters.status === 'ARCHIVED' ? 'primary' : 'default'}
                  onClick={() => handleStatusFilter('ARCHIVED')}
                >
                  {translate('Archivés')}
                </Button>
              </Space>
            </div>

            <Divider style={{ margin: '12px 0' }} />

            {/* Tag Filters */}
            <div>
              <Space style={{ marginBottom: 12, width: '100%' }} wrap>
                <TagOutlined />
                <Text strong>{translate('Filtrer par tags:')}</Text>
                {selectedTags.length > 0 && (
                  <Text type="secondary">
                    ({selectedTags.length} {translate('sélectionné')}
                    {selectedTags.length > 1 ? 's' : ''})
                  </Text>
                )}
                {selectedTags.length > 0 && (
                  <Button type="text" size="small" icon={<CloseOutlined />} onClick={clearTagFilters}>
                    {translate('Effacer')}
                  </Button>
                )}
                <Button size="small" icon={<FilterOutlined />} onClick={() => setShowTagFilter(!showTagFilter)}>
                  {showTagFilter ? translate('Masquer') : translate('Afficher')}
                </Button>
              </Space>

              {showTagFilter && (
                <div style={{ marginTop: 12 }}>
                  {allTags.length === 0 ? (
                    <Text type="secondary" italic>
                      {translate('Aucun tag disponible')}
                    </Text>
                  ) : (
                    <Space wrap>
                      {allTags.map(tag => (
                        <AntTag
                          key={tag.id}
                          color={tag.color || '#3B82F6'}
                          style={{
                            cursor: 'pointer',
                            opacity: selectedTags.includes(tag.id) ? 1 : 0.7
                          }}
                          onClick={() => handleTagToggle(tag.id)}
                        >
                          {selectedTags.includes(tag.id) && <CheckOutlined style={{ marginInlineEnd: 4 }} />}
                          {tag.name}
                        </AntTag>
                      ))}
                    </Space>
                  )}
                </div>
              )}

              {/* Selected Tags Display */}
              {selectedTags.length > 0 && !showTagFilter && (
                <div style={{ marginTop: 12 }}>
                  <Space wrap>
                    {selectedTags.map(tagId => {
                      const tag = allTags.find(t => t.id === tagId);
                      if (!tag) return null;
                      return (
                        <AntTag
                          key={tag.id}
                          color={tag.color || '#3B82F6'}
                          closable
                          onClose={() => handleTagToggle(tag.id)}
                        >
                          {tag.name}
                        </AntTag>
                      );
                    })}
                  </Space>
                </div>
              )}
            </div>

            <Divider style={{ margin: '12px 0' }} />

            {/* Quick Filters */}
            <Space>
              <Checkbox
                checked={hasActiveDealFilter === true}
                onChange={e => setHasActiveDealFilter(e.target.checked ? true : undefined)}
              >
                {translate('Affaire en cours')}
              </Checkbox>
              <Checkbox
                checked={hasUpcomingActivityFilter === true}
                onChange={e => setHasUpcomingActivityFilter(e.target.checked ? true : undefined)}
              >
                {translate('Activité à venir')}
              </Checkbox>
            </Space>

            <Divider style={{ margin: '12px 0' }} />

            {/* Advanced Filters */}
            <AdvancedFilters
              tenantId={tenantId}
              config={{
                showDateRange: true,
                showAssignedTo: true,
                showSource: true,
                dateRangeLabel: translate('Date de création')
              }}
              filters={advancedFilters}
              onFiltersChange={setAdvancedFilters}
            />
          </Space>
        </Card>

        {/* Contacts List */}
        {error && (
          <Alert
            message={translate('Erreur')}
            description={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
          />
        )}

        {loading ? (
          <Card>
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text>{translate('Chargement des contacts...')}</Text>
              </div>
            </div>
          </Card>
        ) : contacts.length === 0 ? (
          <Card>
            <Empty
              image={<UserOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
              imageStyle={{ height: 64 }}
              description={
                <Space direction="vertical" size="small">
                  <Text strong>{translate('Aucun contact trouvé')}</Text>
                  <Text type="secondary">{translate('Commencez par créer votre premier contact.')}</Text>
                </Space>
              }
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
                {translate('Créer un contact')}
              </Button>
            </Empty>
          </Card>
        ) : (
          <>
            {/* Bulk Actions Toolbar */}
            {selectedContacts.length > 0 && (
              <Card
                style={{
                  background: '#e6f7ff',
                  borderColor: '#91d5ff'
                }}
              >
                <Row justify="space-between" align="middle" gutter={[16, 16]}>
                  <Col xs={24} sm={12}>
                    <Space>
                      <Text strong>
                        {selectedContacts.length} contact{selectedContacts.length > 1 ? 's' : ''}{' '}
                        {translate('sélectionné')}
                        {selectedContacts.length > 1 ? 's' : ''}
                      </Text>
                      <Button size="small" onClick={() => setSelectedContacts([])}>
                        {translate('Désélectionner tout')}
                      </Button>
                    </Space>
                  </Col>
                  <Col xs={24} sm={12} style={{ textAlign: 'end' }}>
                    <Button type="primary" icon={<TagOutlined />} onClick={() => setShowBulkTagManager(true)}>
                      {translate('Gérer les tags')}
                    </Button>
                  </Col>
                </Row>
              </Card>
            )}

            {/* Table View */}
            <Card>
              <Table
                columns={columns}
                dataSource={contacts}
                rowKey="id"
                loading={loading}
                rowSelection={rowSelection}
                pagination={false}
                scroll={{ x: 'max-content' }}
                rowClassName={record => (selectedContacts.includes(record.id) ? 'ant-table-row-selected' : '')}
              />
            </Card>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <Card>
                <Row justify="space-between" align="middle" gutter={[16, 16]}>
                  <Col xs={24} sm={12}>
                    <Text type="secondary">
                      {translate('Affichage de')} {(pagination.page - 1) * pagination.limit + 1} à{' '}
                      {Math.min(pagination.page * pagination.limit, pagination.total)} sur {pagination.total} contacts
                    </Text>
                  </Col>
                  <Col xs={24} sm={12} style={{ textAlign: 'end' }}>
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
          </>
        )}

        {/* Bulk Tag Manager Modal */}
        {showBulkTagManager && (
          <BulkTagManager
            tenantId={tenantId!}
            contactIds={selectedContacts}
            contactCount={selectedContacts.length}
            onClose={() => setShowBulkTagManager(false)}
            onComplete={handleBulkTagComplete}
          />
        )}
      </Space>
    </>
  );
};
