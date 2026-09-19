import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Typography, Spin, Alert, Table, Tag, Space, Button, Modal, Empty } from 'antd';
import { DollarOutlined, WalletOutlined, EyeOutlined, SyncOutlined } from '@ant-design/icons';
import { ownerPortalService } from '../../services/ownerPortalService';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface DepositListItem {
  id: string;
  propertyAddress: string;
  tenantName: string;
  depositAmount: number;
  currentHeldAmount: number;
  status: string;
}

interface DepositSummary {
  total: number;
  totalHeld: number;
  totalReleased: number;
}

interface DepositsData {
  deposits: DepositListItem[];
  summary: DepositSummary;
}

interface DepositMovement {
  id: string;
  type: string;
  amount: number;
  currency: string;
  note: string | null;
  createdAt: Date | string;
  payment: any;
  installment: any;
  createdBy: string | null;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(amount);
};

const getStatusTag = (status: string) => {
  const statusConfig: Record<string, { color: string; text: string }> = {
    PENDING: { color: 'default', text: 'En attente' },
    COLLECTED: { color: 'blue', text: 'Collecté' },
    HELD: { color: 'orange', text: 'En retenue' },
    REFUNDED: { color: 'green', text: 'Remboursé' },
    FORFEITED: { color: 'red', text: 'Confisqué' }
  };

  const config = statusConfig[status] || { color: 'default', text: status };
  return <Tag color={config.color}>{config.text}</Tag>;
};

const getMovementTypeLabel = (type: string) => {
  const labels: Record<string, { label: string; color: string }> = {
    COLLECT: { label: 'Collecte', color: 'success' },
    HOLD: { label: 'Mise en retenue', color: 'warning' },
    RELEASE: { label: 'Libération', color: 'processing' },
    REFUND: { label: 'Remboursement', color: 'success' },
    FORFEIT: { label: 'Confiscation', color: 'error' },
    ADJUSTMENT: { label: 'Ajustement', color: 'default' }
  };
  const config = labels[type] || { label: type, color: 'default' };
  return <Tag color={config.color}>{config.label}</Tag>;
};

export default function Deposits() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DepositsData | null>(null);
  const [selectedDepositId, setSelectedDepositId] = useState<string | null>(null);
  const [movements, setMovements] = useState<DepositMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsModalVisible, setMovementsModalVisible] = useState(false);

  useEffect(() => {
    loadDeposits();
  }, []);

  const loadDeposits = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await ownerPortalService.getDeposits();
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des dépôts de garantie');
    } finally {
      setLoading(false);
    }
  };

  const handleViewMovements = async (depositId: string) => {
    try {
      setMovementsLoading(true);
      setSelectedDepositId(depositId);
      const response = await ownerPortalService.getDepositMovements(depositId);
      if (response.data?.success && response.data?.data?.movements) {
        setMovements(response.data.data.movements);
        setMovementsModalVisible(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des mouvements');
    } finally {
      setMovementsLoading(false);
    }
  };

  const movementColumns = [
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => getMovementTypeLabel(type)
    },
    {
      title: 'Montant',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => formatCurrency(amount)
    },
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: Date | string) => {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dayjs(dateObj).format('DD/MM/YYYY HH:mm');
      }
    },
    {
      title: 'Note',
      dataIndex: 'note',
      key: 'note',
      render: (note: string | null) => note || '-'
    },
    {
      title: 'Créé par',
      dataIndex: 'createdBy',
      key: 'createdBy',
      render: (createdBy: string | null) => createdBy || '-'
    }
  ];

  const columns = [
    {
      title: 'Propriété',
      dataIndex: 'propertyAddress',
      key: 'propertyAddress'
    },
    {
      title: 'Locataire',
      dataIndex: 'tenantName',
      key: 'tenantName'
    },
    {
      title: 'Montant du dépôt',
      dataIndex: 'depositAmount',
      key: 'depositAmount',
      render: (amount: number) => formatCurrency(amount),
      sorter: (a: DepositListItem, b: DepositListItem) => a.depositAmount - b.depositAmount
    },
    {
      title: 'Montant retenu',
      dataIndex: 'currentHeldAmount',
      key: 'currentHeldAmount',
      render: (amount: number) => formatCurrency(amount),
      sorter: (a: DepositListItem, b: DepositListItem) => a.currentHeldAmount - b.currentHeldAmount
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status)
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: DepositListItem) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => handleViewMovements(record.id)}
          loading={movementsLoading && selectedDepositId === record.id}
        >
          Mouvements
        </Button>
      )
    }
  ];

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="Chargement des dépôts de garantie..." />
      </div>
    );
  }

  if (error) {
    return <Alert message="Erreur" description={error} type="error" showIcon />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="it-toolbar">
        <div>
          <Title level={2}>Dépôts de garantie</Title>
          <Text type="secondary">Suivi des dépôts de garantie de vos propriétés</Text>
        </div>
        <Button icon={<SyncOutlined />} onClick={loadDeposits} loading={loading} aria-label="Rafraîchir les dépôts">
          Actualiser
        </Button>
      </div>

      {/* Summary Cards (T117) */}
      {data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8}>
            <StatCard
              title="Total"
              value={data.summary.total.toString()}
              icon={<WalletOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <StatCard
              title="Total retenu"
              value={formatCurrency(data.summary.totalHeld)}
              icon={<WalletOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ fontSize: 18, color: '#faad14' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <StatCard
              title="Total libéré"
              value={formatCurrency(data.summary.totalReleased)}
              icon={<DollarOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ fontSize: 18, color: '#52c41a' }}
            />
          </Col>
        </Row>
      )}

      {/* Deposits Table (T116) */}
      <Card title="Liste des dépôts de garantie">
        {data && data.deposits.length > 0 ? (
          <Table
            scroll={{ x: 'max-content' }}
            columns={columns}
            dataSource={data.deposits}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20 }}
          />
        ) : (
          <Empty description="Aucun dépôt de garantie trouvé" />
        )}
      </Card>

      {/* Movements Modal (T118) */}
      <Modal
        title={
          <Space>
            <WalletOutlined />
            <span>Historique des mouvements</span>
          </Space>
        }
        open={movementsModalVisible}
        onCancel={() => {
          setMovementsModalVisible(false);
          setMovements([]);
          setSelectedDepositId(null);
        }}
        footer={null}
        width={800}
      >
        {movementsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <Spin size="large" />
          </div>
        ) : movements.length > 0 ? (
          <Table
            scroll={{ x: 'max-content' }}
            columns={movementColumns}
            dataSource={movements}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            size="small"
          />
        ) : (
          <Empty description="Aucun mouvement trouvé" />
        )}
      </Modal>
    </Space>
  );
}
