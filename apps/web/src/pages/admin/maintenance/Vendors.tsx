import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
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
  message,
  Modal,
  Form,
  Select,
  Pagination
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { DashboardLayout } from '../../../components/dashboard/dashboard-layout';
import { vendorMaintenanceService } from '../../../services/maintenance-service';
import { useAuth } from '../../../hooks/useAuth';

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
      message.error('Erreur lors du chargement des prestataires');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleFilterChange = (value: boolean | undefined) => {
    setIsActiveFilter(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
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
        message.success('Prestataire mis à jour avec succès');
      } else {
        await vendorMaintenanceService.createVendor(effectiveTenantId, values);
        message.success('Prestataire créé avec succès');
      }
      setShowForm(false);
      form.resetFields();
      await loadVendors();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (vendorId: string) => {
    if (!effectiveTenantId) return;

    try {
      await vendorMaintenanceService.deleteVendor(effectiveTenantId, vendorId);
      message.success('Prestataire supprimé définitivement');
      await loadVendors();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Erreur lors de la suppression');
    }
  };

  const handlePageChange = (page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  const columns = [
    {
      title: 'Nom',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: 'Téléphone',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone: string) => phone || '-'
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => email || '-'
    },
    {
      title: 'Spécialités',
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
      title: 'Statut',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'default'}>{isActive ? 'Actif' : 'Inactif'}</Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Vendor) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            title="Modifier"
          />
          <Popconfirm
            title="Êtes-vous sûr de vouloir supprimer définitivement ce prestataire ?"
            description="Cette action est irréversible. Le prestataire sera supprimé de manière permanente."
            onConfirm={() => handleDelete(record.id)}
            okText="Oui, supprimer"
            cancelText="Annuler"
            okButtonProps={{ danger: true }}
          >
            <Button 
              type="link" 
              danger 
              icon={<DeleteOutlined />} 
              title="Supprimer définitivement"
            />
          </Popconfirm>
        </Space>
      )
    }
  ];

  if (loading && vendors.length === 0) {
    return (
      <DashboardLayout>
        <Spin size="large" style={{ display: 'block', textAlign: 'center', padding: '50px' }} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Title level={2}>Gestion des prestataires</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Nouveau prestataire
          </Button>
        </div>

        <Card style={{ marginBottom: 24 }}>
          <Space>
            <Search
              placeholder="Rechercher par nom ou spécialité..."
              allowClear
              style={{ width: 300 }}
              onSearch={handleSearch}
              enterButton={<SearchOutlined />}
            />
            <Select
              placeholder="Filtrer par statut"
              allowClear
              style={{ width: 200 }}
              value={isActiveFilter}
              onChange={handleFilterChange}
            >
              <Option value={true}>Actifs</Option>
              <Option value={false}>Inactifs</Option>
            </Select>
          </Space>
        </Card>

        <Card>
          {vendors.length === 0 ? (
            <Empty description="Aucun prestataire" />
          ) : (
            <>
              <Table
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
                    showTotal={(total) => `Total: ${total} prestataires`}
                  />
                </div>
              )}
            </>
          )}
        </Card>

        <Modal
          title={editingVendor ? 'Modifier le prestataire' : 'Nouveau prestataire'}
          open={showForm}
          onCancel={() => {
            setShowForm(false);
            form.resetFields();
          }}
          footer={null}
          width={600}
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
          >
            <Form.Item
              name="name"
              label="Nom"
              rules={[
                { required: true, message: 'Le nom est requis' },
                { min: 2, message: 'Le nom doit contenir au moins 2 caractères' }
              ]}
            >
              <Input placeholder="Nom du prestataire" />
            </Form.Item>

            <Form.Item
              name="phone"
              label="Téléphone"
            >
              <Input placeholder="Numéro de téléphone" />
            </Form.Item>

            <Form.Item
              name="email"
              label="Email"
              rules={[
                { type: 'email', message: 'Email invalide' }
              ]}
            >
              <Input placeholder="Adresse email" />
            </Form.Item>

            <Form.Item
              name="address"
              label="Adresse"
            >
              <Input.TextArea rows={3} placeholder="Adresse complète" />
            </Form.Item>

            <Form.Item
              name="specialties"
              label="Spécialités"
            >
              <Select
                mode="tags"
                placeholder="Ajouter des spécialités (ex: Plomberie, Électricité)"
                tokenSeparators={[',']}
              />
            </Form.Item>

            {editingVendor && (
              <Form.Item
                name="isActive"
                label="Statut"
                initialValue={true}
              >
                <Select>
                  <Option value={true}>Actif</Option>
                  <Option value={false}>Inactif</Option>
                </Select>
              </Form.Item>
            )}

            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={submitting}>
                  {editingVendor ? 'Enregistrer' : 'Créer'}
                </Button>
                <Button onClick={() => {
                  setShowForm(false);
                  form.resetFields();
                }}>
                  Annuler
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </DashboardLayout>
  );
};
