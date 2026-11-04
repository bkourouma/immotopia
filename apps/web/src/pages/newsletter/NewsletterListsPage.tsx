import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { App, Card, Button, Modal, Form, Input, Select, Switch, Space, Typography, Collapse } from 'antd';
import { DownloadOutlined, UserAddOutlined } from '@ant-design/icons';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { ListDashboard } from '../../components/newsletter/ListDashboard';
import { SubscriberList } from '../../components/newsletter/SubscriberList';
import { ImportCsvModal } from '../../components/newsletter/ImportCsvModal';
import { SubscriptionForm } from '../../components/newsletter/SubscriptionForm';
import { AdvancedContactSearch } from '../../components/crm/AdvancedContactSearch';
import { useListSearch } from '../../hooks/useListSearch';
import { useLocalListSearch } from '../../utils/list-search';
import { newsletterService, type NewsletterList, type NewsletterSubscriber } from '../../services/newsletter.service';
import type { ContactSearchResultItem } from '../../services/contact-search.service';
import { t } from '../../i18n/t';
import { collectAllPages } from '../../utils/table-export/collect';

// Stables : déclarés hors du composant (le filtrage local reste mémoïsé).
const LIST_TEXT = [(list: NewsletterList) => list.name];
const LIST_ACCESSORS = { type: (list: NewsletterList) => list.type };

export function NewsletterListsPage() {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const [lists, setLists] = useState<NewsletterList[]>([]);
  const [selectedList, setSelectedList] = useState<NewsletterList | null>(null);
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [subLoading, setSubLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editList, setEditList] = useState<NewsletterList | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [listToDelete, setListToDelete] = useState<NewsletterList | null>(null);
  const [advancedSearchModalOpen, setAdvancedSearchModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const loadLists = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await newsletterService.listLists(tenantId);
      setLists(data);
    } catch (e) {
      message.error((e as Error).message || t('Erreur lors du chargement'));
    } finally {
      setLoading(false);
    }
  }, [tenantId, message]);

  // Listes de diffusion (reçues en entier) : recherche locale, état dans l'URL sous le préfixe « lst ».
  const listSearch = useLocalListSearch<NewsletterList>(lists, {
    paramPrefix: 'lst',
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Nom de la liste…') },
      {
        key: 'type',
        type: 'multiSelect',
        label: t('Type'),
        primary: true,
        options: [
          { value: 'MANUAL', label: t('Manuelle') },
          { value: 'FROM_OWNERS', label: t('Propriétaires') },
          { value: 'FROM_RENTERS', label: t('Locataires') },
          { value: 'FROM_CRM_CONTACTS', label: t('Contacts CRM') }
        ]
      }
    ],
    text: LIST_TEXT,
    accessors: LIST_ACCESSORS
  });

  // Abonnés de la liste ouverte (paginés par le serveur), préfixe « abo ».
  const subSearch = useListSearch({
    paramPrefix: 'abo',
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('E-mail ou nom de l’abonné…') },
      {
        key: 'status',
        type: 'multiSelect',
        label: t('Statut'),
        primary: true,
        options: [
          { value: 'ACTIVE', label: t('Actif') },
          { value: 'PENDING_CONFIRMATION', label: t('En attente') },
          { value: 'UNSUBSCRIBED', label: t('Désabonné') }
        ]
      }
    ]
  });
  const subParamsRef = useRef(subSearch.apiParams);
  subParamsRef.current = subSearch.apiParams;
  const subParamsKey = JSON.stringify(subSearch.apiParams);

  const loadSubscribers = useCallback(async () => {
    if (!tenantId || !selectedList) return;
    setSubLoading(true);
    try {
      const data = await newsletterService.listSubscribers(tenantId, selectedList.id, subParamsRef.current);
      setSubscribers(data.subscribers);
      setPagination(data.pagination);
    } catch (e) {
      message.error((e as Error).message || t('Erreur lors du chargement'));
    } finally {
      setSubLoading(false);
    }
  }, [tenantId, selectedList, message]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    if (selectedList) {
      loadSubscribers();
    } else {
      setSubscribers([]);
    }
  }, [selectedList, loadSubscribers, subParamsKey]);

  const handleCreateList = async (values: { name: string; type: string; doubleOptIn?: boolean }) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      await newsletterService.createList(tenantId, { ...values, doubleOptIn: values.doubleOptIn ?? true });
      message.success(t('Liste créée'));
      setCreateModalOpen(false);
      form.resetFields();
      loadLists();
    } catch (e) {
      message.error((e as Error).message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleEditList = async (values: { name?: string; doubleOptIn?: boolean }) => {
    if (!tenantId || !editList) return;
    setSaving(true);
    try {
      await newsletterService.updateList(tenantId, editList.id, values);
      message.success(t('Liste modifiée'));
      setEditModalOpen(false);
      setEditList(null);
      editForm.resetFields();
      loadLists();
      if (selectedList?.id === editList.id) {
        setSelectedList(prev => (prev ? { ...prev, ...values } : null));
      }
    } catch (e) {
      message.error((e as Error).message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteList = async () => {
    if (!tenantId || !listToDelete) return;
    setSaving(true);
    try {
      await newsletterService.deleteList(tenantId, listToDelete.id);
      message.success(t('Liste supprimée'));
      setDeleteModalOpen(false);
      setListToDelete(null);
      if (selectedList?.id === listToDelete.id) setSelectedList(null);
      loadLists();
    } catch (e) {
      message.error((e as Error).message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSubscriber = async (sub: NewsletterSubscriber) => {
    if (!tenantId) return;
    try {
      await newsletterService.removeSubscriber(tenantId, sub.id);
      message.success(t('Abonné retiré'));
      loadSubscribers();
      loadLists();
    } catch (e) {
      message.error((e as Error).message || 'Erreur');
    }
  };

  const handleImport = async (file: File) => {
    if (!tenantId || !selectedList) throw new Error(t('Liste non sélectionnée'));
    return newsletterService.importCsv(tenantId, selectedList.id, file);
  };

  const handleExport = async () => {
    if (!tenantId || !selectedList) return;
    try {
      const blob = await newsletterService.exportCsv(tenantId, selectedList.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `newsletter-${selectedList.name}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(t('Export terminé'));
    } catch (e) {
      message.error((e as Error).message || 'Erreur');
    }
  };

  const handleAddContactsFromSearch = async (contacts: ContactSearchResultItem[]) => {
    if (!tenantId || !selectedList || contacts.length === 0) return;
    try {
      const result = await newsletterService.addSubscribersFromContacts(
        tenantId,
        selectedList.id,
        contacts.map(c => c.id)
      );
      setAdvancedSearchModalOpen(false);
      message.success(
        t('{{added}} contact(s) ajouté(s){{value}}', {
          added: result.added,
          value: result.skipped ? `, ${result.skipped} ignoré(s) ou déjà présents` : ''
        })
      );
      loadSubscribers();
      loadLists();
    } catch (e) {
      message.error((e as Error).message || t("Erreur lors de l'ajout"));
    }
  };

  const canEditList = selectedList?.type === 'MANUAL';

  return (
    <>
      <div style={{ padding: 24 }}>
        {selectedList ? (
          <>
            <Button
              type="link"
              icon={<ArrowLeftOutlined />}
              onClick={() => setSelectedList(null)}
              style={{ marginBottom: 16 }}
            >
              {t('Retour aux listes')}
            </Button>
            <Card title={selectedList.name}>
              {canEditList && selectedList.publicSubscribeToken != null && selectedList.publicSubscribeToken && (
                <Collapse
                  items={[
                    {
                      key: 'public-form',
                      label: t("Formulaire d'inscription publique"),
                      children: (
                        <div>
                          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                            {t('Lien public :')}{' '}
                            <a
                              href={`${window.location.origin}/newsletter/subscribe?token=${selectedList.publicSubscribeToken}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {window.location.origin}/newsletter/subscribe?token={selectedList.publicSubscribeToken}
                            </a>
                          </Typography.Paragraph>
                          <SubscriptionForm
                            listToken={selectedList.publicSubscribeToken}
                            submitLabel={t("S'inscrire à la newsletter")}
                            showName={true}
                          />
                        </div>
                      )
                    }
                  ]}
                  style={{ marginBottom: 16 }}
                />
              )}
              {canEditList ? (
                <>
                  <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAdvancedSearchModalOpen(true)}>
                      {t('Ajouter des contacts (recherche CRM)')}
                    </Button>
                  </div>
                  <SubscriberList
                    subscribers={subscribers}
                    loading={subLoading}
                    pagination={{ ...pagination, page: subSearch.page, limit: subSearch.pageSize }}
                    search={subSearch.searchProps}
                    isFiltered={subSearch.isFiltered}
                    onPageChange={(page, limit) => {
                      if (limit && limit !== subSearch.pageSize) subSearch.setPageSize(limit);
                      subSearch.setPage(page);
                    }}
                    onRemove={handleRemoveSubscriber}
                    onImport={() => setImportModalOpen(true)}
                    onExport={handleExport}
                    exportFetchAll={() =>
                      collectAllPages<NewsletterSubscriber>(async (page, limit) => {
                        const data = await newsletterService.listSubscribers(tenantId!, selectedList.id, {
                          ...subSearch.filterParams,
                          page,
                          limit
                        });
                        return { items: data.subscribers, total: data.pagination.total };
                      })
                    }
                    canEdit={true}
                  />
                </>
              ) : (
                <div style={{ padding: 24, background: '#fafafa', borderRadius: 8 }}>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
                    {t('Liste dérivée :')} {selectedList.activeCount ?? 0} destinataire(s) potentiel(s) (propriétaires /
                    locataires / contacts avec consentement). Les abonnés sont résolus à l&apos;envoi de chaque
                    campagne.
                  </Typography.Paragraph>
                  <Button type="default" icon={<DownloadOutlined />} onClick={handleExport}>
                    {t('Exporter CSV (destinataires actuels)')}
                  </Button>
                </div>
              )}
            </Card>
          </>
        ) : (
          <ListDashboard
            lists={listSearch.filtered}
            totalLists={lists.length}
            search={listSearch.searchProps}
            onClearSearch={listSearch.clear}
            loading={loading}
            onSelectList={list => {
              subSearch.clear();
              setSelectedList(list);
            }}
            onCreateList={() => setCreateModalOpen(true)}
            onEditList={l => {
              setEditList(l);
              editForm.setFieldsValue({ name: l.name, doubleOptIn: l.doubleOptIn });
              setEditModalOpen(true);
            }}
            onDeleteList={l => {
              setListToDelete(l);
              setDeleteModalOpen(true);
            }}
          />
        )}
      </div>

      <Modal
        title={t('Nouvelle liste')}
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreateList}>
          <Form.Item name="name" label={t('Nom')} rules={[{ required: true }]}>
            <Input placeholder={t('Ex: Newsletter clients')} />
          </Form.Item>
          <Form.Item name="type" label={t('Type')} initialValue="MANUAL" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={[
                { value: 'MANUAL', label: t('Manuelle (import, ajout manuel)') },
                { value: 'FROM_OWNERS', label: t('Propriétaires (avec accord newsletter)') },
                { value: 'FROM_RENTERS', label: t('Locataires (avec accord newsletter)') },
                { value: 'FROM_CRM_CONTACTS', label: t('Contacts CRM (consentement email)') }
              ]}
            />
          </Form.Item>
          <Form.Item name="doubleOptIn" label={t('Double opt-in')} valuePropName="checked" initialValue={true}>
            <Switch checkedChildren={t('Oui')} unCheckedChildren={t('Non')} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={saving}>
                {t('Créer')}
              </Button>
              <Button onClick={() => setCreateModalOpen(false)}>{t('Annuler')}</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('Modifier la liste')}
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditList(null);
        }}
        footer={null}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditList}>
          <Form.Item name="name" label={t('Nom')} rules={[{ required: true }]}>
            <Input placeholder={t('Ex: Newsletter clients')} />
          </Form.Item>
          {editList?.type === 'MANUAL' && (
            <Form.Item name="doubleOptIn" label={t('Double opt-in')} valuePropName="checked">
              <Switch checkedChildren={t('Oui')} unCheckedChildren={t('Non')} />
            </Form.Item>
          )}
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={saving}>
                {t('Enregistrer')}
              </Button>
              <Button
                onClick={() => {
                  setEditModalOpen(false);
                  setEditList(null);
                }}
              >
                {t('Annuler')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('Supprimer la liste')}
        open={deleteModalOpen}
        onOk={handleDeleteList}
        onCancel={() => {
          setDeleteModalOpen(false);
          setListToDelete(null);
        }}
        confirmLoading={saving}
        okText={t('Supprimer')}
        okButtonProps={{ danger: true }}
      >
        {listToDelete && (
          <p>
            {t('Êtes-vous sûr de vouloir supprimer la liste')} <strong>{listToDelete.name}</strong>{' '}
            {t('? Tous les abonnés seront supprimés.')}
          </p>
        )}
      </Modal>

      <ImportCsvModal open={importModalOpen} onClose={() => setImportModalOpen(false)} onImport={handleImport} />

      <Modal
        title={t('Recherche avancée de contacts CRM')}
        open={advancedSearchModalOpen}
        onCancel={() => setAdvancedSearchModalOpen(false)}
        footer={null}
        width={900}
        destroyOnClose
      >
        <AdvancedContactSearch mode="select" multiSelect={true} onSelectContacts={handleAddContactsFromSearch} />
      </Modal>
    </>
  );
}
