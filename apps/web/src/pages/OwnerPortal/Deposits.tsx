import React, { useState, useEffect } from 'react';
import { App, Row, Col, Spin, Tag, Space, Button, Modal } from 'antd';
import { DollarOutlined, WalletOutlined, EyeOutlined, SyncOutlined } from '@ant-design/icons';
import { ownerPortalService } from '../../services/ownerPortalService';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import {
  DataCard,
  DataView,
  PageHeader,
  SkeletonList,
  SkeletonStats,
  StateBlock,
  Table
} from '../../components/primitives';
import { useDepositsSearch } from './search/useDepositsSearch';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { t } from '../../i18n/t';

import { formatFcfa } from '../../i18n/format';

interface DepositListItem {
  id: string;
  propertyAddress: string;
  tenantName: string;
  depositAmount: number;
  /** Détenu : ce que l'agence garde pour le locataire (collecté - rendu - confisqué). */
  currentHeldAmount: number;
  /** Retenu : retenues réelles (mises en retenue + confiscations). */
  withheldAmount: number;
  status: string;
}

interface DepositSummary {
  total: number;
  totalHeld: number;
  totalReleased: number;
  totalWithheld: number;
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
  return formatFcfa(amount);
};

const getStatusTag = (status: string) => {
  const statusConfig: Record<string, { color: string; text: string }> = {
    PENDING: { color: 'default', text: t('En attente') },
    COLLECTED: { color: 'blue', text: t('Collecté') },
    HELD: { color: 'orange', text: t('En retenue') },
    REFUNDED: { color: 'green', text: t('Remboursé') },
    FORFEITED: { color: 'red', text: t('Confisqué') }
  };

  const config = statusConfig[status] || { color: 'default', text: status };
  return <Tag color={config.color}>{config.text}</Tag>;
};

const getMovementTypeLabel = (type: string) => {
  const labels: Record<string, { label: string; color: string }> = {
    COLLECT: { label: t('Collecte'), color: 'success' },
    HOLD: { label: t('Mise en retenue'), color: 'warning' },
    RELEASE: { label: t('Libération'), color: 'processing' },
    REFUND: { label: t('Remboursement'), color: 'success' },
    FORFEIT: { label: t('Confiscation'), color: 'error' },
    ADJUSTMENT: { label: t('Ajustement'), color: 'default' }
  };
  const config = labels[type] || { label: type, color: 'default' };
  return <Tag color={config.color}>{config.label}</Tag>;
};

export default function Deposits() {
  const { message } = App.useApp();
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

  const local = useDepositsSearch(data?.deposits);

  const loadDeposits = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await ownerPortalService.getDeposits();
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des dépôts de garantie'));
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
      message.error(err.response?.data?.message || t('Impossible de charger les mouvements de ce dépôt. Réessayez.'));
    } finally {
      setMovementsLoading(false);
    }
  };

  const movementColumns = [
    {
      title: t('Type'),
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => getMovementTypeLabel(type)
    },
    {
      title: t('Montant'),
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => formatCurrency(amount)
    },
    {
      title: t('Date'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: Date | string) => {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dayjs(dateObj).format('DD/MM/YYYY HH:mm');
      }
    },
    {
      title: t('Note'),
      dataIndex: 'note',
      key: 'note',
      render: (note: string | null) => note || '-'
    },
    {
      title: t('Créé par'),
      dataIndex: 'createdBy',
      key: 'createdBy',
      render: (createdBy: string | null) => createdBy || '-'
    }
  ];

  const columns: ColumnsType<DepositListItem> = [
    {
      title: t('Propriété'),
      dataIndex: 'propertyAddress',
      key: 'propertyAddress'
    },
    {
      title: t('Locataire'),
      dataIndex: 'tenantName',
      key: 'tenantName'
    },
    {
      title: t('Montant du dépôt'),
      dataIndex: 'depositAmount',
      key: 'depositAmount',
      render: (amount: number) => formatCurrency(amount)
    },
    {
      title: t('Montant détenu'),
      dataIndex: 'currentHeldAmount',
      key: 'currentHeldAmount',
      render: (amount: number) => formatCurrency(amount)
    },
    {
      title: t('Montant retenu'),
      dataIndex: 'withheldAmount',
      key: 'withheldAmount',
      render: (amount: number) => formatCurrency(amount),
      sorter: (a: DepositListItem, b: DepositListItem) => a.withheldAmount - b.withheldAmount
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status)
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: any, record: DepositListItem) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => handleViewMovements(record.id)}
          loading={movementsLoading && selectedDepositId === record.id}
        >
          {t('Mouvements')}
        </Button>
      )
    }
  ];

  const header = (
    <PageHeader
      title={t('Dépôts de garantie')}
      subtitle={t('Suivi des dépôts de garantie de vos propriétés')}
      extra={
        <Button
          icon={<SyncOutlined />}
          onClick={loadDeposits}
          loading={loading}
          aria-label={t('Rafraîchir les dépôts')}
        >
          {t('Actualiser')}
        </Button>
      }
    />
  );

  if (loading && !data) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {header}
        <SkeletonStats rows={4} aria-label={t('Chargement des dépôts de garantie')} />
        <SkeletonList rows={3} aria-label={t('Chargement des dépôts de garantie')} />
      </Space>
    );
  }

  if (error) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {header}
        <StateBlock
          variant="error"
          title={t('Impossible de charger les dépôts de garantie')}
          description={error}
          actions={[{ label: t('Réessayer'), onClick: loadDeposits, primary: true }]}
        />
      </Space>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {header}

      {/* Summary Cards (T117) */}
      {data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              helpId="portails.proprietaire.cautions.indicateurs"
              title={t('Total')}
              value={data.summary.total.toString()}
              icon={<WalletOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('Total détenu')}
              value={formatCurrency(data.summary.totalHeld)}
              icon={<WalletOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('Total retenu')}
              value={formatCurrency(data.summary.totalWithheld)}
              icon={<WalletOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ fontSize: 18, color: '#faad14' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('Total libéré')}
              value={formatCurrency(data.summary.totalReleased)}
              icon={<DollarOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ fontSize: 18, color: '#52c41a' }}
            />
          </Col>
        </Row>
      )}

      {/* Deposits (T116) : tableau sur grand ecran, cartes sur telephone */}
      {data && data.deposits.length > 0 ? (
        <DataView<DepositListItem>
          helpId="portails.proprietaire.cautions.tableau"
          aria-label={t('Liste des dépôts de garantie')}
          {...local.dataViewProps}
          export={{ filename: t('Liste des dépôts de garantie'), fetchAll: local.exportAll }}
          columns={columns}
          rowKey={row => row.id}
          renderCard={row => (
            <DataCard
              title={row.propertyAddress}
              subtitle={row.tenantName}
              status={getStatusTag(row.status)}
              highlight={formatCurrency(row.currentHeldAmount)}
              fields={[
                { label: t('Montant du dépôt'), value: formatCurrency(row.depositAmount) },
                { label: t('Montant retenu'), value: formatCurrency(row.withheldAmount) }
              ]}
              primaryAction={{
                label: t('Mouvements'),
                icon: <EyeOutlined />,
                onClick: () => handleViewMovements(row.id),
                loading: movementsLoading && selectedDepositId === row.id
              }}
            />
          )}
        />
      ) : (
        <StateBlock variant="empty" description={t('Aucun dépôt de garantie trouvé')} />
      )}

      {/* Movements Modal (T118) */}
      <Modal
        title={
          <Space>
            <WalletOutlined />
            <span>{t('Historique des mouvements')}</span>
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
            helpId="portails.proprietaire.cautions.mouvements"
            exportFilename={t('Historique des mouvements')}
            scroll={{ x: 'max-content' }}
            columns={movementColumns}
            dataSource={movements}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            size="small"
          />
        ) : (
          <StateBlock variant="empty" description={t('Aucun mouvement trouvé')} />
        )}
      </Modal>
    </Space>
  );
}
