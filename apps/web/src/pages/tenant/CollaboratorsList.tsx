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
import { listMembers, Member, MembershipFilters, disableMember, enableMember } from '../../services/membership-service';
import type { ColumnsType } from 'antd/es/table';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
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
        setError(t('Erreur lors du chargement des collaborateurs'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des collaborateurs'));
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
        message.success(t('Collaborateur désactivé avec succès'));
      } else {
        await enableMember(tenantId, userId);
        message.success(t('Collaborateur activé avec succès'));
      }
      await loadMembers();
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors de la modification'));
    }
  };

  const getStatusTag = (status: string) => {
    const statusConfig = {
      ACTIVE: { color: 'success', text: t('Actif') },
      PENDING_INVITE: { color: 'warning', text: t('Invitation en attente') },
      DISABLED: { color: 'error', text: t('Désactivé') }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.DISABLED;
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const columns: ColumnsType<Member> = [
    {
      title: t('Utilisateur'),
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
      title: t('Rôles'),
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
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: string) => getStatusTag(status)
    },
    {
      title: t('Dernière connexion'),
      key: 'lastLogin',
      width: 150,
      render: (_, record) =>
        record.user.lastLoginAt ? new Date(record.user.lastLoginAt).toLocaleDateString(activeLocale()) : 'Jamais'
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/tenant/${tenantId}/collaborators/${record.userId}`)}
            title={t('Voir les détails')}
          />
          {record.status === 'ACTIVE' ? (
            <Popconfirm
              title={t('Désactiver le collaborateur')}
              description={t('Êtes-vous sûr de vouloir désactiver ce collaborateur ?')}
              onConfirm={() => handleToggleStatus(record.userId, record.status)}
              okText={t('Oui')}
              cancelText={t('Non')}
            >
              <Button type="text" danger icon={<UserDeleteOutlined />} title={t('Désactiver')} />
            </Popconfirm>
          ) : (
            <Popconfirm
              title={t('Activer le collaborateur')}
              description={t('Êtes-vous sûr de vouloir activer ce collaborateur ?')}
              onConfirm={() => handleToggleStatus(record.userId, record.status)}
              okText={t('Oui')}
              cancelText={t('Non')}
            >
              <Button type="text" icon={<CheckCircleOutlined />} title={t('Activer')} />
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <div className="it-toolbar it-toolbar--start">
          <div>
            <Title level={2} style={{ margin: 0 }}>
              {t('Collaborateurs')}
            </Title>
            <Text type="secondary">{t('Gérez les collaborateurs de votre agence')}</Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/tenant/${tenantId}/invite`)}>
            {t('Inviter un collaborateur')}
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder={t('Rechercher un collaborateur...')}
              prefix={<SearchOutlined />}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onPressEnter={handleSearch}
              style={{ flex: 1 }}
            />
            <Select
              style={{ width: 200 }}
              placeholder={t('Tous les statuts')}
              value={filters.status}
              onChange={handleStatusFilter}
              allowClear
            >
              <Select.Option value="ACTIVE">{t('Actif')}</Select.Option>
              <Select.Option value="PENDING_INVITE">{t('Invitation en attente')}</Select.Option>
              <Select.Option value="DISABLED">{t('Désactivé')}</Select.Option>
            </Select>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              {t('Rechercher')}
            </Button>
          </Space.Compact>
        </Card>

        {/* Error Message */}
        {error && (
          <Alert
            message={t('Erreur')}
            description={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
          />
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
                showTotal: total => t('Total: {{total}} collaborateurs', { total: total }),
                onChange: (page, pageSize) => {
                  setFilters({ ...filters, page, limit: pageSize });
                }
              }}
              locale={{
                emptyText: <Empty description={t('Aucun collaborateur trouvé')} />
              }}
            />
          </div>
        </Card>
      </Space>
    </>
  );
};
