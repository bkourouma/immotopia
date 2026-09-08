import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  App,
  Table,
  Card,
  Input,
  Select,
  Button,
  Tag,
  Space,
  Avatar,
  Popconfirm,
  Alert,
  Empty,
  Spin,
  Typography
} from 'antd';
import {
  UserOutlined,
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  UserDeleteOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { listMembers, Member, MembershipFilters, disableMember, enableMember } from '../../services/membership-service';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;

export const CollaboratorsList: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<MembershipFilters>({
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
    if (tenantId) {
      loadMembers();
    }
  }, [tenantId, filters]);

  const loadMembers = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listMembers(tenantId, {
        ...filters,
        search: searchTerm || undefined
      });
      if (response.success && response.data) {
        setMembers(response.data.members || []);
        setPagination(
          response.data.pagination || {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 0
          }
        );
      } else {
        setError('Erreur lors du chargement des collaborateurs');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des collaborateurs');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setFilters({ ...filters, page: 1, search: searchTerm || undefined });
  };

  const handleStatusFilter = (status: 'ACTIVE' | 'PENDING_INVITE' | 'DISABLED' | undefined) => {
    setFilters({ ...filters, page: 1, status });
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    if (!tenantId) return;
    try {
      if (currentStatus === 'ACTIVE') {
        await disableMember(tenantId, userId);
        message.success('Collaborateur désactivé avec succès');
      } else {
        await enableMember(tenantId, userId);
        message.success('Collaborateur activé avec succès');
      }
      await loadMembers();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors de la modification');
    }
  };

  const getStatusTag = (status: string) => {
    const statusConfig = {
      ACTIVE: { color: 'success', text: 'Actif' },
      PENDING_INVITE: { color: 'warning', text: 'Invitation en attente' },
      DISABLED: { color: 'error', text: 'Désactivé' }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.DISABLED;
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const columns: ColumnsType<Member> = [
    {
      title: 'Utilisateur',
      key: 'user',
      width: 250,
      render: (_, record) => (
        <Space>
          <Avatar icon={<UserOutlined />} />
          <div>
            <div>{record.user.fullName || record.user.email}</div>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {record.user.email}
            </Text>
          </div>
        </Space>
      )
    },
    {
      title: 'Rôles',
      key: 'roles',
      width: 200,
      render: (_, record) => (
        <Space size="small" wrap>
          {record.roles.map(role => (
            <Tag key={role.id} color="blue">
              {role.name}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: string) => getStatusTag(status)
    },
    {
      title: 'Dernière connexion',
      key: 'lastLogin',
      width: 150,
      render: (_, record) =>
        record.user.lastLoginAt ? new Date(record.user.lastLoginAt).toLocaleDateString('fr-FR') : 'Jamais'
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/tenant/${tenantId}/collaborators/${record.userId}`)}
            title="Voir les détails"
          />
          {record.status === 'ACTIVE' ? (
            <Popconfirm
              title="Désactiver le collaborateur"
              description="Êtes-vous sûr de vouloir désactiver ce collaborateur ?"
              onConfirm={() => handleToggleStatus(record.userId, record.status)}
              okText="Oui"
              cancelText="Non"
            >
              <Button type="text" danger icon={<UserDeleteOutlined />} title="Désactiver" />
            </Popconfirm>
          ) : (
            <Popconfirm
              title="Activer le collaborateur"
              description="Êtes-vous sûr de vouloir activer ce collaborateur ?"
              onConfirm={() => handleToggleStatus(record.userId, record.status)}
              okText="Oui"
              cancelText="Non"
            >
              <Button type="text" icon={<CheckCircleOutlined />} title="Activer" />
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Title level={2} style={{ margin: 0 }}>
              Collaborateurs
            </Title>
            <Text type="secondary">Gérez les collaborateurs de votre tenant</Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/tenant/${tenantId}/invite`)}>
            Inviter un collaborateur
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="Rechercher un collaborateur..."
              prefix={<SearchOutlined />}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onPressEnter={handleSearch}
              style={{ flex: 1 }}
            />
            <Select
              style={{ width: 200 }}
              placeholder="Tous les statuts"
              value={filters.status}
              onChange={handleStatusFilter}
              allowClear
            >
              <Select.Option value="ACTIVE">Actif</Select.Option>
              <Select.Option value="PENDING_INVITE">Invitation en attente</Select.Option>
              <Select.Option value="DISABLED">Désactivé</Select.Option>
            </Select>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              Rechercher
            </Button>
          </Space.Compact>
        </Card>

        {/* Error Message */}
        {error && (
          <Alert message="Erreur" description={error} type="error" showIcon closable onClose={() => setError(null)} />
        )}

        {/* Members Table */}
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <Table
              columns={columns}
              dataSource={members}
              rowKey="id"
              loading={loading}
              scroll={{ x: 'max-content' }}
              pagination={{
                current: pagination.page,
                pageSize: pagination.limit,
                total: pagination.total,
                showSizeChanger: true,
                showTotal: total => `Total: ${total} collaborateurs`,
                onChange: (page, pageSize) => {
                  setFilters({ ...filters, page, limit: pageSize });
                }
              }}
              locale={{
                emptyText: <Empty description="Aucun collaborateur trouvé" />
              }}
            />
          </div>
        </Card>
      </Space>
    </DashboardLayout>
  );
};
