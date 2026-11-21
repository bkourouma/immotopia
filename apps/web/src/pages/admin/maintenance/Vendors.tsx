import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { App, Card, Button, Space, Modal, Form, Input, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { DataCard, DataView, PageHeader, StatusTag, useConfirmAction } from '../../../components/primitives';
import { collectAllPages } from '../../../utils/table-export/collect';
import { vendorMaintenanceService } from '../../../services/maintenance-service';
import { useAuth } from '../../../hooks/useAuth';
import { useListSearch } from '../../../hooks/useListSearch';
import { t } from '../../../i18n/t';

interface Vendor {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  specialties?: string[];
  isActive: boolean;
}

interface VendorFormValues {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  specialties?: string[];
  isActive?: boolean;
}

// Bornes alignées sur createVendorSchema / updateVendorSchema (packages/api/src/types/maintenance-types.ts).
const NAME_MIN = 2;
const NAME_MAX = 200;
const PHONE_MAX = 50;
const EMAIL_MAX = 255;
const ADDRESS_MAX = 1000;
const SPECIALTY_MAX = 50;

/** Corps envoyé à l'API : textes rognés, spécialités vides ou en double retirées. */
function toVendorPayload(values: VendorFormValues, withStatus: boolean) {
  const specialties = Array.from(
    new Set((values.specialties ?? []).map(spec => spec.trim()).filter(spec => spec.length > 0))
  );
  return {
    name: values.name.trim(),
    phone: values.phone?.trim() ?? '',
    email: values.email?.trim() ?? '',
    address: values.address?.trim() ?? '',
    specialties,
    ...(withStatus && values.isActive !== undefined ? { isActive: values.isActive } : {})
  };
}

export const Vendors: React.FC = () => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();

  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  // Premier chargement terminé : les squelettes ne remplacent plus la page ensuite
  // (la barre de recherche garde son focus, même quand une recherche ne donne rien).
  const [loaded, setLoaded] = useState(false);

  // Recherche multicritères portée par l'URL (?q=…&active=1&page=2).
  const search = useListSearch({
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Nom, spécialité, e-mail ou téléphone…')
      },
      {
        key: 'active',
        type: 'boolean',
        label: t('Statut'),
        primary: true,
        tristate: true,
        trueLabel: t('Actifs'),
        falseLabel: t('Inactifs'),
        api: 'isActive'
      }
    ]
  });
  const paramsRef = useRef(search.apiParams);
  paramsRef.current = search.apiParams;
  const paramsKey = JSON.stringify(search.apiParams);

  const loadVendors = async () => {
    if (!effectiveTenantId) return;

    setLoading(true);
    setError(null);
    try {
      const { isActive, ...rest } = paramsRef.current as Record<string, string | number>;
      const response = await vendorMaintenanceService.listVendors(effectiveTenantId, {
        search: rest.search as string | undefined,
        isActive: isActive === undefined ? undefined : isActive === 'true',
        page: rest.page as number,
        limit: rest.limit as number
      });

      if (response.success) {
        setVendors(response.data);
        setTotal(response.pagination?.total ?? response.data.length);
      }
    } catch (err) {
      console.error('Error loading vendors:', err);
      setError(t('Erreur lors du chargement des prestataires'));
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (effectiveTenantId) {
      loadVendors();
    }
  }, [effectiveTenantId, paramsKey]);

  const handleCreate = () => {
    setEditingVendor(null);
    form.resetFields();
    setShowForm(true);
  };

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    form.setFieldsValue({
      name: vendor.name,
      phone: vendor.phone || '',
      email: vendor.email || '',
      address: vendor.address || '',
      specialties: vendor.specialties || [],
      isActive: vendor.isActive
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingVendor(null);
    form.resetFields();
  };

  const handleSubmit = async (values: VendorFormValues) => {
    if (!effectiveTenantId) return;

    setSubmitting(true);
    try {
      if (editingVendor) {
        await vendorMaintenanceService.updateVendor(effectiveTenantId, editingVendor.id, toVendorPayload(values, true));
        message.success(t('Prestataire mis à jour avec succès'));
      } else {
        await vendorMaintenanceService.createVendor(effectiveTenantId, toVendorPayload(values, false));
        message.success(t('Prestataire créé avec succès'));
      }
      closeForm();
      await loadVendors();
    } catch (err) {
      const apiMessage = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(apiMessage || t("Erreur lors de l'enregistrement"));
    } finally {
      setSubmitting(false);
    }
  };

  const deleteVendor = async (vendorId: string) => {
    if (!effectiveTenantId) return;

    try {
      await vendorMaintenanceService.deleteVendor(effectiveTenantId, vendorId);
      message.success(t('Prestataire supprimé définitivement'));
      await loadVendors();
    } catch (err) {
      const apiMessage = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(apiMessage || t('Erreur lors de la suppression'));
    }
  };

  // Suppression définitive : la confirmation nomme le prestataire.
  const confirmDelete = (vendor: Vendor) => {
    confirmAction({
      title: t('Supprimer définitivement « {{name}} » ?', { name: vendor.name }),
      description: t('Cette action est irréversible. Le prestataire sera supprimé de manière permanente.'),
      okText: t('Oui, supprimer'),
      cancelText: t('Annuler'),
      danger: true,
      onConfirm: () => deleteVendor(vendor.id)
    });
  };

  const statusTag = (isActive: boolean) => (
    <StatusTag
      status={isActive ? 'ACTIVE' : 'INACTIVE'}
      tone={isActive ? 'success' : 'neutral'}
      label={isActive ? t('Actif') : t('Inactif')}
    />
  );

  const columns: ColumnsType<Vendor> = [
    {
      title: t('Nom'),
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: t('Téléphone'),
      dataIndex: 'phone',
      key: 'phone',
      render: (phone: string) => phone || '-'
    },
    {
      title: t('Email'),
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => email || '-'
    },
    {
      title: t('Spécialités'),
      dataIndex: 'specialties',
      key: 'specialties',
      render: (specialties: string[]) => (specialties && specialties.length > 0 ? specialties.join(', ') : '-')
    },
    {
      title: t('Statut'),
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => statusTag(isActive)
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, record: Vendor) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            title={t('Modifier')}
            aria-label={t('Modifier')}
            style={{ minWidth: 44, minHeight: 44 }}
          />
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => confirmDelete(record)}
            title={t('Supprimer définitivement')}
            aria-label={t('Supprimer définitivement')}
            style={{ minWidth: 44, minHeight: 44 }}
          />
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={t('Gestion des prestataires')}
        primaryAction={{ label: t('Nouveau prestataire'), icon: <PlusOutlined />, onClick: handleCreate }}
      />

      <Card>
        <DataView<Vendor>
          helpId="administration.maintenance-gestion.prestataires.tableau"
          aria-label={t('Gestion des prestataires')}
          search={search.searchProps}
          {...search.dataViewProps}
          items={vendors}
          total={total}
          loading={!loaded}
          isReloading={loaded && loading}
          error={error}
          onRetry={() => void loadVendors()}
          rowKey={vendor => vendor.id}
          columns={columns}
          scrollX={800}
          emptyDescription={t('Aucun prestataire')}
          emptyAction={{ label: t('Nouveau prestataire'), onClick: handleCreate }}
          export={{
            filename: t('Gestion des prestataires'),
            fetchAll: () =>
              collectAllPages<Vendor>(async (page, limit) => {
                const { search: term, isActive } = search.filterParams as Record<string, string | undefined>;
                const reponse = await vendorMaintenanceService.listVendors(effectiveTenantId as string, {
                  search: term,
                  isActive: isActive === undefined ? undefined : isActive === 'true',
                  page,
                  limit
                });
                return { items: reponse.data ?? [], total: reponse.pagination?.total ?? 0 };
              })
          }}
          renderCard={vendor => (
            <DataCard
              title={vendor.name}
              subtitle={vendor.phone || vendor.email || undefined}
              status={statusTag(vendor.isActive)}
              fields={[
                { label: t('Email'), value: vendor.email || '-' },
                { label: t('Spécialités'), value: (vendor.specialties ?? []).join(', ') || '-' }
              ]}
              primaryAction={{ label: t('Modifier'), icon: <EditOutlined />, onClick: () => handleEdit(vendor) }}
              secondaryActions={[
                {
                  key: 'delete',
                  danger: true,
                  icon: <DeleteOutlined />,
                  label: t('Supprimer définitivement'),
                  onClick: () => confirmDelete(vendor)
                }
              ]}
              aria-label={vendor.name}
            />
          )}
        />
      </Card>

      <Modal
        title={editingVendor ? t('Modifier le prestataire') : t('Nouveau prestataire')}
        open={showForm}
        onCancel={closeForm}
        footer={null}
        width={600}
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label={t('Nom')}
            rules={[
              { required: true, whitespace: true, message: t('Le nom est requis') },
              {
                validator: (_rule, value?: string) =>
                  !value || value.trim().length >= NAME_MIN
                    ? Promise.resolve()
                    : Promise.reject(new Error(t('Le nom doit contenir au moins 2 caractères')))
              },
              { max: NAME_MAX, message: t('Le nom ne peut pas dépasser 200 caractères') }
            ]}
          >
            <Input placeholder={t('Nom du prestataire')} maxLength={NAME_MAX} autoComplete="off" />
          </Form.Item>

          <Form.Item
            name="phone"
            label={t('Téléphone')}
            rules={[{ max: PHONE_MAX, message: t('Le numéro de téléphone ne peut pas dépasser 50 caractères') }]}
          >
            <Input
              placeholder={t('Numéro de téléphone')}
              maxLength={PHONE_MAX}
              type="tel"
              inputMode="tel"
              autoComplete="off"
            />
          </Form.Item>

          <Form.Item
            name="email"
            label={t('Email')}
            rules={[
              { type: 'email', message: t('Email invalide') },
              { max: EMAIL_MAX, message: t("L'email ne peut pas dépasser 255 caractères") }
            ]}
          >
            <Input placeholder={t('Adresse email')} maxLength={EMAIL_MAX} inputMode="email" autoComplete="off" />
          </Form.Item>

          <Form.Item
            name="address"
            label={t('Adresse')}
            rules={[{ max: ADDRESS_MAX, message: t("L'adresse ne peut pas dépasser 1000 caractères") }]}
          >
            <Input.TextArea rows={3} placeholder={t('Adresse complète')} maxLength={ADDRESS_MAX} />
          </Form.Item>

          <Form.Item
            name="specialties"
            label={t('Spécialités')}
            rules={[
              {
                validator: (_rule, value?: string[]) =>
                  (value ?? []).every(spec => spec.trim().length <= SPECIALTY_MAX)
                    ? Promise.resolve()
                    : Promise.reject(new Error(t('Chaque spécialité ne peut pas dépasser 50 caractères')))
              }
            ]}
          >
            <Select
              mode="tags"
              placeholder={t('Ajouter des spécialités (ex: Plomberie, Électricité)')}
              tokenSeparators={[',']}
            />
          </Form.Item>

          {editingVendor && (
            <Form.Item name="isActive" label={t('Statut')}>
              <Select
                options={[
                  { value: true, label: t('Actif') },
                  { value: false, label: t('Inactif') }
                ]}
              />
            </Form.Item>
          )}

          <Form.Item>
            <Space wrap>
              <Button type="primary" htmlType="submit" loading={submitting} style={{ minHeight: 44 }}>
                {editingVendor ? t('Enregistrer') : t('Créer')}
              </Button>
              <Button onClick={closeForm} disabled={submitting} style={{ minHeight: 44 }}>
                {t('Annuler')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
