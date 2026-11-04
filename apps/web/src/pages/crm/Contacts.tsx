import { dealTypeLabel, dealStageLabel } from '../../utils/crm-labels';
import { contactDisplayName } from '../../utils/contact-display';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAgencyFeatures } from '../../hooks/useAgencyFeatures';
import { App, Button, Card, Space, Row, Col, Modal, Spin, Empty, Alert, Typography, Tooltip, Popconfirm } from 'antd';
import {
  UserOutlined,
  PlusOutlined,
  EditOutlined,
  EyeOutlined,
  CalendarOutlined,
  TagOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { ContactForm } from '../../components/crm/ContactForm';
import { ActivityForm } from '../../components/crm/ActivityForm';
import { BulkTagManager } from '../../components/crm/BulkTagManager';
import {
  listContacts,
  getContact,
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
import { useListSearch } from '../../hooks/useListSearch';
import { listAssignableMembers } from '../../services/membership-service';
import { getMaturityLabel } from '../../utils/crm-utils';
import { leadSourceLabels } from '../../utils/crm-labels';
import { Table } from '../../components/primitives';
import { collectAllPages } from '../../utils/table-export/collect';
import type { ColumnsType } from 'antd/es/table';
import { t as translate } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;

export const Contacts: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const { has: possede } = useAgencyFeatures(tenantId);
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<CrmContact | null>(null);
  // La liste ne porte pas la note « avis au compte portail » : le détail est lu à l'ouverture.
  const [editingDetail, setEditingDetail] = useState<CrmContact | null>(null);
  const [editingDetailLoading, setEditingDetailLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [selectedContactForActivity, setSelectedContactForActivity] = useState<CrmContact | null>(null);
  const [allTags, setAllTags] = useState<CrmTag[]>([]);
  const [members, setMembers] = useState<{ value: string; label: string }[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [showBulkTagManager, setShowBulkTagManager] = useState(false);

  // Recherche multicritères : l'état vit dans l'URL, tout part à l'API (page serveur).
  const search = useListSearch({
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: translate('Rechercher'),
        placeholder: translate('Nom, raison sociale, e-mail, téléphone…')
      },
      {
        key: 'status',
        type: 'multiSelect',
        label: translate('Statut'),
        primary: true,
        options: [
          { value: 'LEAD', label: translate('Prospects') },
          { value: 'ACTIVE_CLIENT', label: translate('Clients') },
          { value: 'ARCHIVED', label: translate('Archivés') }
        ]
      },
      {
        key: 'tagIds',
        type: 'multiSelect',
        label: translate('Tags'),
        primary: true,
        options: allTags.map(tag => ({ value: tag.id, label: tag.name }))
      },
      {
        key: 'assignedTo',
        type: 'select',
        label: translate('Collaborateur'),
        primary: true,
        options: members
      },
      // Affaires et activités à venir : propres au module CRM.
      ...(possede('CRM')
        ? ([
            { key: 'hasActiveDeal', type: 'boolean', label: translate('Affaire en cours') },
            { key: 'hasUpcomingActivity', type: 'boolean', label: translate('Activité à venir') }
          ] as const)
        : []),
      { key: 'created', type: 'dateRange', label: translate('Date de création'), api: ['startDate', 'endDate'] },
      {
        key: 'contactType',
        type: 'multiSelect',
        label: translate('Type de contact'),
        options: [
          { value: 'PERSON', label: translate('Personne') },
          { value: 'COMPANY', label: translate('Entreprise') }
        ]
      },
      {
        key: 'maturityLevel',
        type: 'multiSelect',
        label: translate('Maturité'),
        options: (['COLD', 'WARM', 'HOT'] as const).map(level => ({ value: level, label: getMaturityLabel(level) }))
      },
      {
        key: 'leadSource',
        type: 'multiSelect',
        label: translate('Source du lead'),
        options: Object.entries(leadSourceLabels()).map(([value, label]) => ({ value, label: String(label) }))
      }
    ]
  });

  useEffect(() => {
    if (tenantId) {
      loadTags();
      listAssignableMembers(tenantId)
        .then(response => {
          if (response.success) {
            setMembers(
              (response.data?.members ?? []).map(member => ({
                value: member.user.id,
                label: member.user.fullName || member.user.email
              }))
            );
          }
        })
        .catch(() => undefined);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) {
      loadContacts();
    }
  }, [tenantId, search.apiParams]);

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
      const response = await listContacts(tenantId, search.apiParams as ContactFilters);
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

  const editingId = editingContact?.id;
  useEffect(() => {
    setEditingDetail(null);
    if (!tenantId || !editingId) {
      setEditingDetailLoading(false);
      return;
    }
    let cancelled = false;
    setEditingDetailLoading(true);
    getContact(tenantId, editingId)
      .then(response => {
        if (!cancelled && response.success) setEditingDetail(response.data);
      })
      .catch(() => {
        // Sans détail, le formulaire s'ouvre sur la ligne de la liste (sans la note).
      })
      .finally(() => {
        if (!cancelled) setEditingDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, editingId]);

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

  const toutesColonnes: ColumnsType<CrmContact> = [
    {
      title: translate('Nom'),
      key: 'name',
      render: (_, record) => <Text strong>{contactDisplayName(record)}</Text>
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
      exportValue: record =>
        record.nextAction
          ? `${record.nextAction.nextActionType || translate('Action')} — ${new Date(
              record.nextAction.nextActionAt
            ).toLocaleDateString(activeLocale())}`
          : '',
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
      exportValue: record =>
        record.activeDeal
          ? `${dealTypeLabel(record.activeDeal.type)} — ${dealStageLabel(record.activeDeal.stage)}`
          : '',
      render: (_, record) => {
        if (!record.activeDeal) return <Text type="secondary">-</Text>;
        const dealType = dealTypeLabel(record.activeDeal.type);
        return (
          <Space direction="vertical" size={0}>
            <Text>{dealType}</Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {dealStageLabel(record.activeDeal.stage)}
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
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => {
                setEditingDetailLoading(true);
                setEditingContact(record);
              }}
            />
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
  const columns = toutesColonnes.filter(
    col => possede('CRM') || (col.key !== 'nextAction' && col.key !== 'activeDeal')
  );

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
          {editingContact &&
            (editingDetailLoading ? (
              <Spin />
            ) : (
              <ContactForm
                contact={editingDetail ?? editingContact}
                onSubmit={handleUpdate}
                onCancel={() => setEditingContact(null)}
              />
            ))}
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
                    {selectedContacts.length} contact{selectedContacts.length > 1 ? 's' : ''} {translate('sélectionné')}
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

        {/* Table View : la barre de recherche reste affichée même sans ligne. */}
        <Card>
          <Table
            search={search.searchProps}
            exportFilename={translate('Contacts')}
            // Export de TOUS les contacts, avec les mêmes critères que la liste affichée.
            exportFetchAll={() =>
              collectAllPages<CrmContact>(async (page, limit) => {
                const reponse = await listContacts(
                  tenantId as string,
                  {
                    ...search.filterParams,
                    page,
                    limit
                  } as ContactFilters
                );
                return { items: reponse.contacts ?? [], total: reponse.pagination?.total ?? 0 };
              })
            }
            columns={columns}
            dataSource={contacts}
            rowKey="id"
            loading={loading}
            rowSelection={rowSelection}
            pagination={search.tablePagination(pagination.total)}
            scroll={{ x: 'max-content' }}
            rowClassName={record => (selectedContacts.includes(record.id) ? 'ant-table-row-selected' : '')}
            // Sans critère : invitation à créer. Sous critère, la Table affiche seule « Aucun résultat ».
            locale={
              search.isFiltered || search.page > 1
                ? undefined
                : {
                    emptyText: (
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
                    )
                  }
            }
          />
        </Card>

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
