import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  App,
  Table,
  Card,
  Button,
  Space,
  Typography,
  Input,
  Tag,
  Empty,
  Spin,
  Popconfirm,
  Modal,
  Form,
  Select,
  Pagination
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { vendorMaintenanceService } from '../../../services/maintenance-service';
import { useAuth } from '../../../hooks/useAuth';
import { t } from '../../../i18n/t';

const { Title } = Typography;
const { Option } = Select;
const { Search } = Input;

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
  const [searchTerm, setSearchTerm] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState<boolean | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  useEffect(() => {
    if (effectiveTenantId) {
      loadVendors();
    }
  }, [effectiveTenantId, pagination.page, searchTerm, isActiveFilter]);

  const loadVendors = async () => {
    if (!effectiveTenantId) return;

    setLoading(true);
    try {
      const response = await vendorMaintenanceService.listVendors(effectiveTenantId, {
        search: searchTerm || undefined,
        isActive: isActiveFilter,
        page: pagination.page,
        limit: pagination.limit
      });

      if (response.success) {
        setVendors(response.data);
        setPagination(response.pagination);
      }
    } catch (error) {
      console.error('Error loading vendors:', error);
      message.error(t('Erreur lors du chargement des prestataires'));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleFilterChange = (value: boolean | undefined) => {
    setIsActiveFilter(value);
    setPagination(prev => ({ ...prev, page: 1 }));
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

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, page }));
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

  if (loading && vendors.length === 0) {
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

        <Card style={{ marginBottom: 24 }}>
          <Space>
            <Search
              placeholder={t('Rechercher par nom ou spécialité...')}
              allowClear
              style={{ width: 300 }}
              onSearch={handleSearch}
              enterButton={<SearchOutlined />}
            />
            <Select
              placeholder={t('Filtrer par statut')}
              allowClear
              style={{ width: 200 }}
              value={isActiveFilter}
              onChange={handleFilterChange}
            >
              <Option value={true}>{t('Actifs')}</Option>
              <Option value={false}>{t('Inactifs')}</Option>
            </Select>
          </Space>
        </Card>

        <Card>
          {vendors.length === 0 ? (
            <Empty description={t('Aucun prestataire')} />
          ) : (
            <>
              <Table
                scroll={{ x: 'max-content' }}
                columns={columns}
                dataSource={vendors}
                rowKey="id"
                pagination={false}
                loading={loading}
              />

              {pagination.totalPages > 1 && (
                <div style={{ textAlign: 'center', marginTop: 24 }}>
                  <Pagination
                    current={pagination.page}
                    total={pagination.total}
                    pageSize={pagination.limit}
                    onChange={handlePageChange}
                    showTotal={total => t('Total: {{total}} prestataires', { total: total })}
                  />
                </div>
              )}
            </>
          )}
        </Card>

        <Modal
          title={editingVendor ? t('Modifier le prestataire') : t('Nouveau prestataire')}
          open={showForm}
          onCancel={() => {
            setShowForm(false);
            form.resetFields();
          }}
          footer={null}
          width={600}
        >
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <Form.Item
              name="name"
              label={t('Nom')}
              rules={[
                { required: true, message: t('Le nom est requis') },
                { min: 2, message: t('Le nom doit contenir au moins 2 caractères') }
              ]}
            >
              <Input placeholder={t('Nom du prestataire')} />
            </Form.Item>

            <Form.Item name="phone" label={t('Téléphone')}>
              <Input placeholder={t('Numéro de téléphone')} />
            </Form.Item>

            <Form.Item name="email" label={t('Email')} rules={[{ type: 'email', message: t('Email invalide') }]}>
              <Input placeholder={t('Adresse email')} />
            </Form.Item>

            <Form.Item name="address" label={t('Adresse')}>
              <Input.TextArea rows={3} placeholder={t('Adresse complète')} />
            </Form.Item>

            <Form.Item name="specialties" label={t('Spécialités')}>
              <Select
                mode="tags"
                placeholder={t('Ajouter des spécialités (ex: Plomberie, Électricité)')}
                tokenSeparators={[',']}
              />
            </Form.Item>

            {editingVendor && (
              <Form.Item name="isActive" label={t('Statut')} initialValue={true}>
                <Select>
                  <Option value={true}>{t('Actif')}</Option>
                  <Option value={false}>{t('Inactif')}</Option>
                </Select>
              </Form.Item>
            )}

            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={submitting}>
                  {editingVendor ? t('Enregistrer') : t('Créer')}
                </Button>
                <Button
                  onClick={() => {
                    setShowForm(false);
                    form.resetFields();
                  }}
                >
                  {t('Annuler')}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </>
  );
};
