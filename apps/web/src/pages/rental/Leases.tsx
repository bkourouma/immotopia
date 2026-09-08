import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  App,
  Button,
  Input,
  Table,
  Card,
  Tag,
  Space,
  Row,
  Col,
  Spin,
  Empty,
  Alert,
  Pagination,
  Select,
  Typography,
  Tooltip,
  Modal
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import {
  listLeases,
  updateLeaseStatus,
  deleteLease,
  RentalLease,
  RentalLeaseStatus,
  LeaseFilters
} from '../../services/rental-service';
import { PropertyTransactionMode } from '../../types/property-types';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { Search: InputSearch } = Input;

export const Leases: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [leases, setLeases] = useState<RentalLease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LeaseFilters>({
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
      loadLeases();
    }
  }, [tenantId, filters, searchTerm]);

  const loadLeases = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listLeases(tenantId, {
        ...filters,
        search: searchTerm || undefined
      });
      if (response.success) {
        setLeases(response.data);
        setPagination(response.pagination);
      } else {
        setError('Erreur lors du chargement des baux');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des baux');
    } finally {
      setLoading(false);
    }
  };

  const getStatusTag = (status: RentalLeaseStatus) => {
    const statusMap: Record<RentalLeaseStatus, { label: string; color: string }> = {
      DRAFT: { label: 'Brouillon', color: 'default' },
      ACTIVE: { label: 'Actif', color: 'green' },
      SUSPENDED: { label: 'Suspendu', color: 'orange' },
      ENDED: { label: 'Terminé', color: 'blue' },
      CANCELED: { label: 'Annulé', color: 'red' }
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const formatCurrency = (amount: number, currency: string = 'FCFA') => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency === 'FCFA' ? 'XOF' : currency
    }).format(amount);
  };

  const getPropertyDisplayName = (record: RentalLease) => {
    const title = record.property?.title?.trim();
    const address = record.property?.address?.trim();
    const internalReference = record.property?.internalReference?.trim();
    return title || address || internalReference || '-';
  };

  const handleStatusChange = async (leaseId: string, newStatus: RentalLeaseStatus) => {
    if (!tenantId) return;
    try {
      await updateLeaseStatus(tenantId, leaseId, newStatus);
      message.success('Statut mis à jour avec succès');
      loadLeases();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors de la mise à jour du statut');
    }
  };

  const handleDelete = (leaseId: string, leaseNumber: string) => {
    if (!tenantId) return;

    Modal.confirm({
      title: 'Supprimer le bail',
      content: `Êtes-vous sûr de vouloir supprimer le bail "${leaseNumber}" ? Cette action est irréversible.`,
      okText: 'Supprimer',
      okType: 'danger',
      cancelText: 'Annuler',
      onOk: async () => {
        try {
          await deleteLease(tenantId, leaseId);
          message.success('Bail supprimé avec succès');
          loadLeases();
        } catch (err: any) {
          message.error(err.response?.data?.message || 'Erreur lors de la suppression du bail');
        }
      }
    });
  };

  const columns: ColumnsType<RentalLease> = [
    {
      title: 'Numéro',
      dataIndex: 'lease_number',
      key: 'lease_number',
      render: text => <Text strong>{text}</Text>
    },
    {
      title: 'Propriété',
      key: 'property',
      render: (_, record) => getPropertyDisplayName(record)
    },
    {
      title: 'Locataire',
      key: 'renter',
      render: (_, record) => record.primaryRenter?.user?.fullName || record.primaryRenter?.userId || '-'
    },
    {
      title: 'Date début',
      key: 'start_date',
      render: (_, record) => formatDate(record.start_date)
    },
    {
      title: 'Date fin',
      key: 'end_date',
      render: (_, record) => formatDate(record.end_date)
    },
    {
      title: 'Montant',
      key: 'amount',
      render: (_, record) => {
        const modes = record.property?.transactionModes ?? [];
        const isSale =
          modes.includes(PropertyTransactionMode.SALE) &&
          !modes.includes(PropertyTransactionMode.RENTAL) &&
          !modes.includes(PropertyTransactionMode.SHORT_TERM);
        const amount = isSale ? (record.property?.price ?? 0) : record.rent_amount;
        const currency = record.property?.currency || record.currency;
        return <Text>{formatCurrency(amount, currency)}</Text>;
      }
    },
    {
      title: 'Statut',
      key: 'status',
      render: (_, record) => getStatusTag(record.status)
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          <Tooltip title="Voir les détails">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={e => {
                e.stopPropagation();
                navigate(`/tenant/${tenantId}/rental/leases/${record.id}`);
              }}
            />
          </Tooltip>
          <Tooltip title="Modifier">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={e => {
                e.stopPropagation();
                navigate(`/tenant/${tenantId}/rental/leases/${record.id}/edit`);
              }}
            />
          </Tooltip>
          <Tooltip title="Supprimer">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              data-lease-id={record.id}
              data-lease-number={record.lease_number}
              onClick={e => {
                e.stopPropagation();
                const leaseId = (e.currentTarget as HTMLButtonElement).dataset.leaseId;
                const leaseNumber = (e.currentTarget as HTMLButtonElement).dataset.leaseNumber ?? '';
                if (leaseId) handleDelete(leaseId, leaseNumber);
              }}
            />
          </Tooltip>
        </Space>
      )
    }
  ];

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} sm={24} md={12}>
            <Title level={2} style={{ margin: 0 }}>
              Gestion Locative
            </Title>
            <Text type="secondary">Gérez les baux et locations</Text>
          </Col>
          <Col xs={24} sm={24} md={12} style={{ textAlign: 'right' }}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate(`/tenant/${tenantId}/rental/leases/new`)}
            >
              Nouveau bail
            </Button>
          </Col>
        </Row>

        {error && (
          <Alert message="Erreur" description={error} type="error" showIcon closable onClose={() => setError(null)} />
        )}

        <Card>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={16}>
                <InputSearch
                  placeholder="Rechercher par numéro de bail..."
                  allowClear
                  enterButton={<SearchOutlined />}
                  size="large"
                  value={searchTerm}
                  onChange={e => {
                    setSearchTerm(e.target.value);
                    setFilters({ ...filters, page: 1 });
                  }}
                  onSearch={value => {
                    setSearchTerm(value);
                    setFilters({ ...filters, page: 1, search: value || undefined });
                  }}
                />
              </Col>
              <Col xs={24} sm={8}>
                <Select
                  style={{ width: '100%' }}
                  size="large"
                  placeholder="Tous les statuts"
                  value={filters.status || undefined}
                  onChange={value =>
                    setFilters({
                      ...filters,
                      status: value as RentalLeaseStatus | undefined,
                      page: 1
                    })
                  }
                  allowClear
                >
                  <Select.Option value="DRAFT">Brouillon</Select.Option>
                  <Select.Option value="ACTIVE">Actif</Select.Option>
                  <Select.Option value="SUSPENDED">Suspendu</Select.Option>
                  <Select.Option value="ENDED">Terminé</Select.Option>
                  <Select.Option value="CANCELED">Annulé</Select.Option>
                </Select>
              </Col>
            </Row>
          </Space>
        </Card>

        {loading ? (
          <Card>
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text>Chargement des baux...</Text>
              </div>
            </div>
          </Card>
        ) : leases.length === 0 ? (
          <Card>
            <Empty
              image={<FileTextOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
              imageStyle={{ height: 64 }}
              description={
                <Space direction="vertical" size="small">
                  <Text strong>Aucun bail trouvé</Text>
                  <Text type="secondary">Commencez par créer votre premier bail.</Text>
                </Space>
              }
            >
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate(`/tenant/${tenantId}/rental/leases/new`)}
              >
                Créer un bail
              </Button>
            </Empty>
          </Card>
        ) : (
          <>
            <Card>
              <Table
                columns={columns}
                dataSource={leases}
                rowKey={record => record.id}
                loading={loading}
                pagination={false}
                scroll={{ x: 'max-content' }}
              />
            </Card>

            {pagination.totalPages > 1 && (
              <Card>
                <Row justify="space-between" align="middle" gutter={[16, 16]}>
                  <Col xs={24} sm={12}>
                    <Text type="secondary">
                      Page {pagination.page} sur {pagination.totalPages} ({pagination.total} baux)
                    </Text>
                  </Col>
                  <Col xs={24} sm={12} style={{ textAlign: 'right' }}>
                    <Pagination
                      current={pagination.page}
                      total={pagination.total}
                      pageSize={pagination.limit}
                      showSizeChanger={false}
                      showTotal={(total, range) => `${range[0]}-${range[1]} sur ${total}`}
                      onChange={page => setFilters({ ...filters, page })}
                    />
                  </Col>
                </Row>
              </Card>
            )}
          </>
        )}
      </Space>
    </DashboardLayout>
  );
};
