import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Space, Typography, Button, Input, Select, Alert, Spin, Empty, Table, Tag } from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  FilterOutlined,
  EyeOutlined,
  EditOutlined,
  BankOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { listTenants, Tenant, TenantFilters } from '../../services/tenant-service';

const { Title, Text } = Typography;

const statusOptions = [
  { value: '', label: 'Tous les statuts' },
  { value: 'ACTIVE', label: 'Actif' },
  { value: 'SUSPENDED', label: 'Suspendu' },
  { value: 'INACTIVE', label: 'Inactif' }
];

const getStatusTag = (status: string) => {
  const config: Record<string, { color: string; text: string }> = {
    ACTIVE: { color: 'success', text: 'Actif' },
    SUSPENDED: { color: 'error', text: 'Suspendu' },
    INACTIVE: { color: 'default', text: 'Inactif' }
  };
  const { color, text } = config[status] || config.INACTIVE;
  return <Tag color={color}>{text}</Tag>;
};

export const TenantsList: React.FC = () => {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TenantFilters>({
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

  useEffect(() => {
    loadTenants();
  }, [filters]);

  const loadTenants = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listTenants({
        ...filters,
        search: searchTerm || undefined
      });
      if (response.success && response.data) {
        setTenants(response.data.tenants || []);
        setPagination(
          response.data.pagination || {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 0
          }
        );
      } else {
        setError('Erreur lors du chargement des tenants');
        setTenants([]);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des tenants');
      setTenants([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ ...filters, page: 1, search: searchTerm || undefined });
  };

  const handleStatusFilter = (value: string | null | undefined) => {
    const status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' | undefined =
      value === 'ACTIVE' || value === 'SUSPENDED' || value === 'INACTIVE' ? value : undefined;
    setFilters({ ...filters, page: 1, status });
  };

  const columns: ColumnsType<Tenant> = [
    {
      title: 'Nom',
      dataIndex: 'name',
      key: 'name',
      render: (_, record) => (
        <Space>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: '#e6f4ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <BankOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          </div>
          <div>
            <Text strong>{record.name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.slug}
            </Text>
          </div>
        </Space>
      )
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status)
    },
    {
      title: 'Email',
      dataIndex: 'contactEmail',
      key: 'contactEmail',
      render: (email: string) => email || '-'
    },
    {
      title: 'Dernière activité',
      dataIndex: 'lastActivityAt',
      key: 'lastActivityAt',
      render: (date: string) => (date ? new Date(date).toLocaleDateString('fr-FR') : '-')
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/admin/tenants/${record.id}`)}
            title="Voir les détails"
          />
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => navigate(`/admin/tenants/${record.id}/edit`)}
            title="Modifier"
          />
        </Space>
      )
    }
  ];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 16
          }}
        >
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Tenants
            </Title>
            <Text type="secondary">Gérez tous les tenants de la plateforme</Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/admin/tenants/new')}>
            Nouveau Tenant
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <form onSubmit={handleSearch}>
            <Space wrap size="middle" style={{ width: '100%' }}>
              <Input
                placeholder="Rechercher un tenant..."
                prefix={<SearchOutlined />}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ minWidth: 240 }}
                allowClear
              />
              <Select
                placeholder="Statut"
                value={filters.status || undefined}
                onChange={v => handleStatusFilter(v)}
                style={{ minWidth: 140 }}
                options={statusOptions}
                allowClear
              />
              <Button type="primary" htmlType="submit" icon={<FilterOutlined />}>
                Filtrer
              </Button>
            </Space>
          </form>
        </Card>

        {/* Error */}
        {error && (
          <Alert message="Erreur" description={error} type="error" showIcon closable onClose={() => setError(null)} />
        )}

        {/* Table */}
        <Card>
          <Spin spinning={loading}>
            {!loading && (!tenants || tenants.length === 0) ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Aucun tenant trouvé" />
            ) : (
              <Table
                rowKey="id"
                columns={columns}
                dataSource={tenants}
                scroll={{ x: 'max-content' }}
                pagination={{
                  current: pagination.page,
                  pageSize: pagination.limit,
                  total: pagination.total,
                  showSizeChanger: true,
                  showTotal: total => `Total ${total} résultat(s)`,
                  pageSizeOptions: ['10', '20', '50'],
                  onChange: (page, pageSize) => {
                    setFilters({
                      ...filters,
                      page,
                      limit: pageSize || pagination.limit
                    });
                  }
                }}
                locale={{ emptyText: 'Aucune donnée' }}
              />
            )}
          </Spin>
        </Card>
      </Space>
    </>
  );
};
