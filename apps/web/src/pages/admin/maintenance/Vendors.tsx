import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Card, Button, Space, Typography, Tag, Spin, Popconfirm, Modal, Form } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { Table } from '../../../components/primitives';
import { collectAllPages } from '../../../utils/table-export/collect';
import { vendorMaintenanceService } from '../../../services/maintenance-service';
import { useAuth } from '../../../hooks/useAuth';
import { useListSearch } from '../../../hooks/useListSearch';
import { t } from '../../../i18n/t';

const { Title } = Typography;

interface Vendor {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  specialties?: string[];
  isActive: boolean;
}

export const Vendors: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  // Premier chargement terminé : le spinner plein écran ne remplace plus la page ensuite
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

  useEffect(() => {
    if (effectiveTenantId) {
      loadVendors();
    }
  }, [effectiveTenantId, paramsKey]);

  const loadVendors = async () => {
    if (!effectiveTenantId) return;

    setLoading(true);
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
    } catch (error) {
      console.error('Error loading vendors:', error);
      message.error(t('Erreur lors du chargement des prestataires'));
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

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

  const handleSubmit = async (values: any) => {
    if (!effectiveTenantId) return;

    setSubmitting(true);
    try {
      if (editingVendor) {
        await vendorMaintenanceService.updateVendor(effectiveTenantId, editingVendor.id, values);
        message.success(t('Prestataire mis à jour avec succès'));
      } else {
        await vendorMaintenanceService.createVendor(effectiveTenantId, values);
        message.success(t('Prestataire créé avec succès'));
      }
      setShowForm(false);
      form.resetFields();
      await loadVendors();
    } catch (error: any) {
      message.error(error.response?.data?.message || t("Erreur lors de l'enregistrement"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (vendorId: string) => {
    if (!effectiveTenantId) return;

    try {
      await vendorMaintenanceService.deleteVendor(effectiveTenantId, vendorId);
      message.success(t('Prestataire supprimé définitivement'));
      await loadVendors();
    } catch (error: any) {
      message.error(error.response?.data?.message || t('Erreur lors de la suppression'));
    }
  };

  const columns = [
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
      exportValue: (record: Vendor) => (record.specialties ?? []).join(', '),
      render: (specialties: string[]) =>
        specialties && specialties.length > 0 ? (
          <Space wrap>
            {specialties.map((spec, index) => (
              <Tag key={index}>{spec}</Tag>
            ))}
          </Space>
        ) : (
          '-'
        )
    },
    {
      title: t('Statut'),
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'default'}>{isActive ? t('Actif') : t('Inactif')}</Tag>
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: any, record: Vendor) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} title={t('Modifier')} />
          <Popconfirm
            title={t('Êtes-vous sûr de vouloir supprimer définitivement ce prestataire ?')}
            description={t('Cette action est irréversible. Le prestataire sera supprimé de manière permanente.')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('Oui, supprimer')}
            cancelText={t('Annuler')}
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger icon={<DeleteOutlined />} title={t('Supprimer définitivement')} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  if (!loaded) {
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
          <Title level={2}>{t('Gestion des prestataires')}</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            {t('Nouveau prestataire')}
          </Button>
        </div>

        <Card>
          <Table
            aria-label={t('Gestion des prestataires')}
            search={search.searchProps}
            exportFilename={t('Gestion des prestataires')}
            exportFetchAll={() =>
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
            }
            scroll={{ x: 'max-content' }}
            columns={columns}
            dataSource={vendors}
            rowKey="id"
            pagination={search.tablePagination(total)}
            loading={loading}
            locale={search.isFiltered ? undefined : { emptyText: t('Aucun prestataire') }}
          />
        </Card>
      </div>
    </>
  );
};
