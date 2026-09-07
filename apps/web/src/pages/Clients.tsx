import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Table,
  Card,
  Input,
  Button,
  Space,
  Typography,
  Tag,
  Avatar,
  Alert,
  Spin,
  Empty,
  Row,
  Col,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  UserOutlined,
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  HomeOutlined,
  ShoppingCartOutlined,
  BankOutlined,
  TagOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { DashboardLayout } from '../components/dashboard/dashboard-layout';
import { listContacts, CrmContact, listTags, CrmTag } from '../services/crm-service';
import { useAuth } from '../hooks/useAuth';
import { AdvancedFilters, AdvancedFilters as AdvancedFiltersType } from '../components/crm/AdvancedFilters';
import { exportToCSV, exportToExcel } from '../utils/export-utils';

const { Title, Text } = Typography;
const { Search } = Input;

interface ClientTableData extends CrmContact {
  key: string;
}

export const Clients: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tenantMembership } = useAuth();
  const [clients, setClients] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'PROPRIETAIRE' | 'LOCATAIRE' | 'ACQUEREUR' | 'COPROPRIETAIRE'>('ALL');
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<CrmTag | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFiltersType>({});

  useEffect(() => {
    const tagId = searchParams.get('tag');
    if (tagId) {
      setSelectedTagId(tagId);
      loadTagInfo(tagId);
    } else {
      setSelectedTagId(null);
      setSelectedTag(null);
    }
  }, [searchParams, tenantMembership?.tenantId]);

  useEffect(() => {
    if (tenantMembership?.tenantId) {
      loadClients();
    }
  }, [tenantMembership?.tenantId, advancedFilters]);

  const loadTagInfo = async (tagId: string) => {
    if (!tenantMembership?.tenantId) return;
    try {
      const response = await listTags(tenantMembership.tenantId);
      if (response.success) {
        const tag = response.data.find(t => t.id === tagId);
        if (tag) {
          setSelectedTag(tag);
        }
      }
    } catch (err) {
      console.error('Error loading tag info:', err);
    }
  };

  const clearTagFilter = () => {
    setSearchParams({});
    setSelectedTagId(null);
    setSelectedTag(null);
  };

  const loadClients = async () => {
    if (!tenantMembership?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listContacts(tenantMembership.tenantId, {
        limit: 1000,
        startDate: advancedFilters.startDate,
        endDate: advancedFilters.endDate,
        assignedTo: advancedFilters.assignedTo,
        source: advancedFilters.source,
      });
      if (response.success) {
        const clientContacts = response.contacts.filter(contact =>
          contact.roles && contact.roles.length > 0 && contact.roles.some(r => r.active)
        );
        setClients(clientContacts);
      } else {
        setError('Erreur lors du chargement des clients');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des clients');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    // Search is handled by filtering the clients array
  };

  const getClientTypeIcon = (type: string) => {
    switch (type) {
      case 'PROPRIETAIRE':
        return <HomeOutlined />;
      case 'LOCATAIRE':
        return <UserOutlined />;
      case 'ACQUEREUR':
        return <ShoppingCartOutlined />;
      case 'COPROPRIETAIRE':
        return <BankOutlined />;
      default:
        return <UserOutlined />;
    }
  };

  const getClientTypeLabel = (type: string) => {
    switch (type) {
      case 'PROPRIETAIRE':
        return 'Propriétaire';
      case 'LOCATAIRE':
        return 'Locataire';
      case 'ACQUEREUR':
        return 'Acquéreur';
      case 'COPROPRIETAIRE':
        return 'Copropriétaire';
      default:
        return type;
    }
  };

  const getClientTypeTag = (type: string) => {
    const colors: Record<string, string> = {
      PROPRIETAIRE: 'blue',
      LOCATAIRE: 'green',
      ACQUEREUR: 'purple',
      COPROPRIETAIRE: 'orange',
    };
    return (
      <Tag color={colors[type] || 'default'} icon={getClientTypeIcon(type)}>
        {getClientTypeLabel(type)}
      </Tag>
    );
  };

  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      !searchTerm ||
      `${client.firstName} ${client.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === 'ALL' ||
      (client.roles && client.roles.some(r => r.active && r.role === filterType));

    const matchesTag = !selectedTagId ||
      (client.tags && client.tags.some(tag => tag.id === selectedTagId));

    return matchesSearch && matchesType && matchesTag;
  });

  const handleExportCSV = () => {
    const exportData = filteredClients.map(client => ({
      'Nom': `${client.firstName} ${client.lastName}`,
      'Email': client.email,
      'Téléphone': client.phone || '',
      'Type': client.roles?.filter(r => r.active).map(r => getClientTypeLabel(r.role)).join(', ') || '',
      'Groupes': client.tags?.map(t => t.name).join(', ') || '',
      'Date d\'inscription': new Date(client.createdAt).toLocaleDateString('fr-FR'),
    }));
    exportToCSV(exportData, 'clients');
    message.success('Export CSV réussi');
  };

  const handleExportExcel = async () => {
    const exportData = filteredClients.map(client => ({
      'Nom': `${client.firstName} ${client.lastName}`,
      'Email': client.email,
      'Téléphone': client.phone || '',
      'Type': client.roles?.filter(r => r.active).map(r => getClientTypeLabel(r.role)).join(', ') || '',
      'Groupes': client.tags?.map(t => t.name).join(', ') || '',
      'Date d\'inscription': new Date(client.createdAt).toLocaleDateString('fr-FR'),
    }));
    await exportToExcel(exportData, 'clients', 'Clients');
    message.success('Export Excel réussi');
  };

  const columns: ColumnsType<ClientTableData> = [
    {
      title: 'Client',
      key: 'client',
      width: 250,
      render: (_, record) => (
        <Space>
          <Avatar icon={<UserOutlined />} />
          <div>
            <div style={{ fontWeight: 500 }}>
              {record.firstName} {record.lastName}
            </div>
            {record.phone && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.phone}
              </Text>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 250,
      render: (email: string) => <Text>{email}</Text>,
    },
    {
      title: 'Type',
      key: 'type',
      width: 200,
      render: (_, record) => {
        const activeRoles = record.roles?.filter(r => r.active) || [];
        return (
          <Space size="small" wrap>
            {activeRoles.map((role, idx) => (
              <Tag key={idx} color={
                role.role === 'PROPRIETAIRE' ? 'blue' :
                role.role === 'LOCATAIRE' ? 'green' :
                role.role === 'ACQUEREUR' ? 'purple' :
                role.role === 'COPROPRIETAIRE' ? 'orange' : 'default'
              } icon={getClientTypeIcon(role.role)}>
                {getClientTypeLabel(role.role)}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: 'Groupes',
      key: 'tags',
      width: 200,
      render: (_, record) => {
        if (!record.tags || record.tags.length === 0) {
          return <Text type="secondary" style={{ fontSize: 12 }}>Aucun groupe</Text>;
        }
        return (
          <Space size="small" wrap>
            {record.tags.slice(0, 3).map((tag) => (
              <Tag
                key={tag.id}
                color={tag.color || '#1890ff'}
                icon={<TagOutlined />}
              >
                {tag.name}
              </Tag>
            ))}
            {record.tags.length > 3 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                +{record.tags.length - 3} autre{record.tags.length - 3 > 1 ? 's' : ''}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Date d\'inscription',
      key: 'createdAt',
      width: 150,
      render: (_, record) => (
        <Text>{new Date(record.createdAt).toLocaleDateString('fr-FR')}</Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right',
      width: 100,
      render: (_, record) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/tenant/${tenantMembership?.tenantId}/crm/contacts/${record.id}`)}
          title="Voir les détails"
        />
      ),
    },
  ];

  const tableData: ClientTableData[] = filteredClients.map(client => ({
    ...client,
    key: client.id,
  }));

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <Title level={2} style={{ margin: 0 }}>Clients</Title>
            <Text type="secondary">Gérez vos clients et leurs informations</Text>
          </div>
          <Space wrap>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportCSV}
            >
              Exporter CSV
            </Button>
            <Button
              icon={<FileExcelOutlined />}
              onClick={handleExportExcel}
            >
              Exporter Excel
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate(`/tenant/${tenantMembership?.tenantId}/crm/contacts/new`)}
            >
              Nouveau client
            </Button>
          </Space>
        </div>

        {/* Filters */}
        <Card>
          {/* Tag Filter Badge */}
          {selectedTag && (
            <div style={{ marginBottom: 16 }}>
              <Space>
                <Text type="secondary">Filtre actif:</Text>
                <Tag
                  color={selectedTag.color || '#1890ff'}
                  icon={<TagOutlined />}
                  closable
                  onClose={clearTagFilter}
                  style={{ fontSize: 14, padding: '4px 12px' }}
                >
                  {selectedTag.name}
                </Tag>
              </Space>
            </div>
          )}

          <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
            <Search
              placeholder="Rechercher des clients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onSearch={handleSearch}
              onPressEnter={handleSearch}
              style={{ flex: 1 }}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              Rechercher
            </Button>
          </Space.Compact>

          {/* Advanced Filters */}
          <div style={{ marginBottom: 16 }}>
            <AdvancedFilters
              tenantId={tenantMembership?.tenantId}
              config={{
                showDateRange: true,
                showAssignedTo: true,
                showSource: true,
                dateRangeLabel: 'Date de création',
              }}
              filters={advancedFilters}
              onFiltersChange={setAdvancedFilters}
            />
          </div>

          {/* Type Filters */}
          <Space wrap>
            <Button
              type={filterType === 'ALL' ? 'primary' : 'default'}
              size="small"
              onClick={() => setFilterType('ALL')}
            >
              Tous
            </Button>
            <Button
              type={filterType === 'PROPRIETAIRE' ? 'primary' : 'default'}
              size="small"
              onClick={() => setFilterType('PROPRIETAIRE')}
            >
              Propriétaires
            </Button>
            <Button
              type={filterType === 'LOCATAIRE' ? 'primary' : 'default'}
              size="small"
              onClick={() => setFilterType('LOCATAIRE')}
            >
              Locataires
            </Button>
            <Button
              type={filterType === 'ACQUEREUR' ? 'primary' : 'default'}
              size="small"
              onClick={() => setFilterType('ACQUEREUR')}
            >
              Acquéreurs
            </Button>
            <Button
              type={filterType === 'COPROPRIETAIRE' ? 'primary' : 'default'}
              size="small"
              onClick={() => setFilterType('COPROPRIETAIRE')}
            >
              Copropriétaires
            </Button>
          </Space>
        </Card>

        {/* Error Alert */}
        {error && (
          <Alert
            message="Erreur"
            description={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
          />
        )}

        {/* Clients List */}
        {loading ? (
          <Card>
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">Chargement des clients...</Text>
              </div>
            </div>
          </Card>
        ) : filteredClients.length === 0 ? (
          <Card>
            <Empty
              image={<UserOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
              description={
                <Space direction="vertical" size="small">
                  <Title level={4} style={{ margin: 0 }}>
                    Aucun client trouvé
                  </Title>
                  <Text type="secondary">
                    {clients.length === 0
                      ? 'Commencez par ajouter votre premier client.'
                      : 'Aucun client ne correspond à votre recherche.'}
                  </Text>
                </Space>
              }
            >
              {clients.length === 0 && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => navigate(`/tenant/${tenantMembership?.tenantId}/crm/contacts/new`)}
                >
                  Ajouter un client
                </Button>
              )}
            </Empty>
          </Card>
        ) : (
          <Card>
            <div style={{ overflowX: 'auto' }}>
              <Table
                columns={columns}
                dataSource={tableData}
                loading={loading}
                scroll={{ x: 'max-content' }}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: true,
                  showTotal: (total) => `Total: ${total} clients`,
                }}
                locale={{
                  emptyText: <Empty description="Aucun client trouvé" />,
                }}
              />
            </div>
          </Card>
        )}
      </Space>
    </DashboardLayout>
  );
};
