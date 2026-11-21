import { dealTypeLabel, dealStageLabel } from '../../utils/crm-labels';
import { contactDisplayName } from '../../utils/contact-display';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAgencyFeatures } from '../../hooks/useAgencyFeatures';
import { App, Button, Card, Checkbox, Space, Row, Col, Modal, Pagination, Typography, Tooltip } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  EyeOutlined,
  CalendarOutlined,
  TagOutlined,
  DeleteOutlined,
  PhoneOutlined
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
import {
  Table,
  PageHeader,
  StateBlock,
  SkeletonList,
  DataCard,
  ListSearch,
  useConfirmAction
} from '../../components/primitives';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { collectAllPages } from '../../utils/table-export/collect';
import type { ColumnsType } from 'antd/es/table';
import { t as translate } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
import { HelpSectionTitle, helpAnchor } from '../../help';
const { Text } = Typography;

export const Contacts: React.FC = () => {
  const { message } = App.useApp();
  const confirm = useConfirmAction();
  const { isDesktop } = useBreakpoint();

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
      setError(translate('Impossible de charger les contacts. Vérifiez votre connexion puis réessayez.'));
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

  const askDelete = (contact: CrmContact) =>
    confirm({
      title: translate('Supprimer le contact {{nom}} ?', { nom: contactDisplayName(contact) }),
      description: translate('Cette action est définitive. Confirmez la suppression du contact.'),
      okText: translate('Supprimer'),
      danger: true,
      onConfirm: () => handleDeleteContact(contact)
    });

  const openEdit = (contact: CrmContact) => {
    setEditingDetailLoading(true);
    setEditingContact(contact);
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
      render: (_, record) => {
        const nom = contactDisplayName(record);
        return (
          <Space {...helpAnchor('contacts-actions')}>
            <Tooltip title={translate('Ajouter une activité')}>
              <Button
                type="text"
                icon={<CalendarOutlined />}
                aria-label={translate('Ajouter une activité pour {{nom}}', { nom })}
                onClick={() => handleAddActivity(record)}
              />
            </Tooltip>
            <Tooltip title={translate('Voir les détails')}>
              <Button
                type="text"
                icon={<EyeOutlined />}
                aria-label={translate('Voir la fiche de {{nom}}', { nom })}
                onClick={() => navigate(`/tenant/${tenantId}/crm/contacts/${record.id}`)}
              />
            </Tooltip>
            <Tooltip title={translate('Modifier')}>
              <Button
                type="text"
                icon={<EditOutlined />}
                aria-label={translate('Modifier {{nom}}', { nom })}
                onClick={() => openEdit(record)}
              />
            </Tooltip>
            <Tooltip title={translate('Supprimer')}>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={translate('Supprimer {{nom}}', { nom })}
                onClick={() => askDelete(record)}
              />
            </Tooltip>
          </Space>
        );
      }
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

  const clearSearch = search.searchProps.onClear;
  const emptyState = (
    <StateBlock
      variant="empty"
      title={translate('Aucun contact trouvé')}
      description={translate('Commencez par créer votre premier contact.')}
      actions={[{ label: translate('Créer un contact'), onClick: () => setShowForm(true), primary: true }]}
    />
  );
  const errorState = <StateBlock variant="error" description={error ?? undefined} onRetry={loadContacts} />;

  const tableLocale = error
    ? { emptyText: errorState }
    : search.isFiltered || search.page > 1
      ? undefined
      : { emptyText: emptyState };

  const toggleSelected = (id: string, checked: boolean) =>
    setSelectedContacts(prev => (checked ? [...prev.filter(x => x !== id), id] : prev.filter(x => x !== id)));

  const renderContactCard = (record: CrmContact) => {
    const nom = contactDisplayName(record);
    const phone = record.phonePrimary || record.phone;
    const fields = [
      ...(phone ? [{ label: translate('Téléphone'), value: phone }] : []),
      ...(possede('CRM') && record.activeDeal
        ? [
            {
              label: translate('Affaire en cours'),
              value: `${dealTypeLabel(record.activeDeal.type)} — ${dealStageLabel(record.activeDeal.stage)}`
            }
          ]
        : []),
      ...(possede('CRM') && record.nextAction
        ? [
            {
              label: translate('Prochaine action'),
              value: `${record.nextAction.nextActionType || translate('Action')} — ${new Date(
                record.nextAction.nextActionAt
              ).toLocaleDateString(activeLocale(), { day: '2-digit', month: 'short' })}`
            }
          ]
        : [])
    ];
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
        <Checkbox
          checked={selectedContacts.includes(record.id)}
          onChange={event => toggleSelected(record.id, event.target.checked)}
          aria-label={translate('Sélectionner {{nom}}', { nom })}
          style={{ minHeight: 44, minWidth: 28, alignItems: 'center' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <DataCard
            title={nom}
            subtitle={record.email || undefined}
            fields={fields}
            onOpen={() => navigate(`/tenant/${tenantId}/crm/contacts/${record.id}`)}
            primaryAction={
              phone
                ? {
                    label: translate('Appeler'),
                    icon: <PhoneOutlined />,
                    onClick: () => {
                      window.location.href = `tel:${phone}`;
                    }
                  }
                : undefined
            }
            secondaryActions={[
              { key: 'activity', label: translate('Ajouter une activité'), onClick: () => handleAddActivity(record) },
              { key: 'edit', label: translate('Modifier'), onClick: () => openEdit(record) },
              { key: 'delete', label: translate('Supprimer'), danger: true, onClick: () => askDelete(record) }
            ]}
          />
        </div>
      </div>
    );
  };

  const mobileList = (
    <div {...helpAnchor('contacts-tableau')}>
      <ListSearch
        {...search.searchProps}
        resultCount={error || (loading && contacts.length === 0) ? undefined : pagination.total}
      />
      {error ? (
        errorState
      ) : loading && contacts.length === 0 ? (
        <SkeletonList rows={5} aria-label={translate('Chargement des contacts')} />
      ) : contacts.length === 0 ? (
        search.isFiltered ? (
          <StateBlock
            variant="no-results"
            actions={[{ label: translate('Effacer les critères'), onClick: clearSearch, primary: true }]}
          />
        ) : (
          emptyState
        )
      ) : (
        <div role="list" aria-label={translate('Contacts')} aria-busy={loading || undefined}>
          {contacts.map(record => (
            <div role="listitem" key={record.id}>
              {renderContactCard(record)}
            </div>
          ))}
        </div>
      )}
      {!error && pagination.total > 0 && (
        <nav aria-label={translate('Pagination')} style={{ display: 'flex', justifyContent: 'center' }}>
          <Pagination
            current={search.page}
            pageSize={search.pageSize}
            total={pagination.total}
            onChange={search.dataViewProps.onPageChange}
            showSizeChanger={false}
            responsive
          />
        </nav>
      )}
    </div>
  );

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <PageHeader
          title={translate('Contacts')}
          subtitle={translate('Gérez vos contacts et prospects CRM')}
          primaryAction={{
            label: translate('Nouveau contact'),
            icon: <PlusOutlined />,
            onClick: () => setShowForm(true),
            helpAnchor: 'contacts-nouveau'
          }}
        />

        <Modal
          title={
            <HelpSectionTitle title={translate('Créer un nouveau contact')} helpId="commercial.contacts.nouveau" />
          }
          open={showForm}
          onCancel={() => setShowForm(false)}
          // Un clic à côté ne doit pas faire perdre un formulaire long : on ferme par « Annuler » ou la croix.
          maskClosable={false}
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
          title={<HelpSectionTitle title={translate('Modifier le contact')} helpId="commercial.contacts.modifier" />}
          open={!!editingContact}
          onCancel={() => setEditingContact(null)}
          maskClosable={false}
          footer={null}
          width={800}
        >
          {editingContact &&
            (editingDetailLoading ? (
              <SkeletonList rows={4} aria-label={translate('Chargement du contact')} />
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

        {/* Actions groupées : la barre dit combien de contacts sont choisis et ce qu'on peut en faire. */}
        {selectedContacts.length > 0 && (
          <Card
            role="region"
            aria-live="polite"
            aria-label={translate('Actions sur la sélection')}
            style={{
              background: 'var(--color-primary-bg)',
              borderColor: 'var(--color-primary-border)'
            }}
          >
            <Row justify="space-between" align="middle" gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <Space wrap>
                  <Text strong>
                    {selectedContacts.length > 1
                      ? translate('{{count}} contacts sélectionnés', { count: selectedContacts.length })
                      : translate('{{count}} contact sélectionné', { count: selectedContacts.length })}
                  </Text>
                  <Button size={isDesktop ? 'small' : 'middle'} onClick={() => setSelectedContacts([])}>
                    {translate('Désélectionner tout')}
                  </Button>
                </Space>
              </Col>
              <Col xs={24} sm={12} style={{ textAlign: 'end' }}>
                <Button
                  type="primary"
                  icon={<TagOutlined />}
                  block={!isDesktop}
                  onClick={() => setShowBulkTagManager(true)}
                >
                  {translate('Gérer les tags')}
                </Button>
              </Col>
            </Row>
          </Card>
        )}

        {/* La barre de recherche reste affichée même sans ligne, en tableau comme en cartes. */}
        <Card>
          {isDesktop ? (
            <div {...helpAnchor('contacts-tableau')}>
              <Table
                helpId="commercial.contacts.liste.tableau"
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
                locale={tableLocale}
              />
            </div>
          ) : (
            mobileList
          )}
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
