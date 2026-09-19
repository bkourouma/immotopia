import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Typography, Spin, Alert, Table, Tag, Space, Select, DatePicker, Empty, Button } from 'antd';
import { DollarOutlined, CalendarOutlined, FilterOutlined, SyncOutlined } from '@ant-design/icons';
import { ownerPortalService } from '../../services/ownerPortalService';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

interface InstallmentListItem {
  id: string;
  propertyAddress: string;
  tenantName: string;
  period: string;
  dueDate: Date | string;
  penaltyAmount: number;
  paidAmount: number;
  amount: number;
  status: string;
}

interface InstallmentSummary {
  total: number;
  due: number;
  overdue: number;
  paid: number;
  totalAmount: number;
  dueAmount: number;
}

interface InstallmentsData {
  installments: InstallmentListItem[];
  summary: InstallmentSummary;
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
    DRAFT: { color: 'default', text: 'Brouillon' },
    DUE: { color: 'blue', text: 'À payer' },
    PARTIAL: { color: 'orange', text: 'Partiel' },
    PAID: { color: 'green', text: 'Payé' },
    OVERDUE: { color: 'red', text: 'En retard' }
  };

  const config = statusConfig[status] || { color: 'default', text: status };
  return <Tag color={config.color}>{config.text}</Tag>;
};

export default function Installments() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InstallmentsData | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [propertyFilter, setPropertyFilter] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [properties, setProperties] = useState<Array<{ id: string; address: string }>>([]);

  useEffect(() => {
    loadProperties();
  }, []);

  useEffect(() => {
    loadInstallments();
  }, [statusFilter, propertyFilter, dateRange]);

  const loadProperties = async () => {
    try {
      const response = await ownerPortalService.getProperties();
      if (response.data?.success && response.data?.data?.properties) {
        setProperties(
          response.data.data.properties.map((p: any) => ({
            id: p.id,
            address: p.address
          }))
        );
      }
    } catch (err) {
      console.error('Error loading properties:', err);
    }
  };

  const loadInstallments = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      if (propertyFilter) params.propertyId = propertyFilter;
      if (dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      const response = await ownerPortalService.getInstallments(params);
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des échéances');
    } finally {
      setLoading(false);
    }
  };

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
      title: 'Période',
      dataIndex: 'period',
      key: 'period'
    },
    {
      title: "Date d'échéance",
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (date: Date | string) => {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dayjs(dateObj).format('DD/MM/YYYY');
      },
      sorter: (a: InstallmentListItem, b: InstallmentListItem) => {
        const dateA = typeof a.dueDate === 'string' ? new Date(a.dueDate) : a.dueDate;
        const dateB = typeof b.dueDate === 'string' ? new Date(b.dueDate) : b.dueDate;
        return dateA.getTime() - dateB.getTime();
      }
    },
    {
      title: 'Montant',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number, record: InstallmentListItem) => (
        <Space direction="vertical" size={0}>
          <Text>{formatCurrency(amount)}</Text>
          {Number(record.paidAmount || 0) > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              payé: {formatCurrency(Number(record.paidAmount || 0))}
            </Text>
          )}
          {Number(record.penaltyAmount || 0) > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              dont pénalité: {formatCurrency(Number(record.penaltyAmount || 0))}
            </Text>
          )}
        </Space>
      ),
      sorter: (a: InstallmentListItem, b: InstallmentListItem) => a.amount - b.amount
    },
    {
      title: 'Pénalité',
      dataIndex: 'penaltyAmount',
      key: 'penaltyAmount',
      render: (penaltyAmount: number) => (Number(penaltyAmount || 0) > 0 ? formatCurrency(Number(penaltyAmount)) : '-'),
      sorter: (a: InstallmentListItem, b: InstallmentListItem) =>
        Number(a.penaltyAmount || 0) - Number(b.penaltyAmount || 0)
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status)
      // `filters`/`onFilter` de colonne retirés (§8.4, « double filtrage »).
      // Ils doublaient le sélecteur de statut au-dessus du tableau, avec les
      // mêmes libellés et les mêmes valeurs, mais ne portaient que sur la page
      // reçue : les deux commandes pouvaient afficher des états contradictoires
      // du même écran. Celle du haut part au serveur ; elle reste.
    }
  ];

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="Chargement des échéances..." />
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
          <Title level={2}>Échéances</Title>
          <Text type="secondary">Suivi des échéances de paiement</Text>
        </div>
        <Button
          icon={<SyncOutlined />}
          onClick={loadInstallments}
          loading={loading}
          aria-label="Rafraîchir les échéances"
        >
          Actualiser
        </Button>
      </div>

      {/* Summary Cards (T096) */}
      {data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="Total"
              value={data.summary.total.toString()}
              icon={<CalendarOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="À payer"
              value={data.summary.due.toString()}
              icon={<CalendarOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18, color: '#1890ff' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="En retard"
              value={data.summary.overdue.toString()}
              icon={<CalendarOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ fontSize: 18, color: '#ff4d4f' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="Payées"
              value={data.summary.paid.toString()}
              icon={<CalendarOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ fontSize: 18, color: '#52c41a' }}
            />
          </Col>
        </Row>
      )}

      {/* Amount Summary Cards */}
      {data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <StatCard
              title="Montant total"
              value={formatCurrency(data.summary.totalAmount)}
              icon={<DollarOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={24} sm={12}>
            <StatCard
              title="Montant dû"
              value={formatCurrency(data.summary.dueAmount)}
              icon={<DollarOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ fontSize: 18, color: '#faad14' }}
            />
          </Col>
        </Row>
      )}

      {/* Filters (T095) */}
      <Card
        title={
          <Space>
            <FilterOutlined />
            <span>Filtres</span>
          </Space>
        }
      >
        <div className="it-filters">
          <div className="it-filters__field">
            <Text strong>Statut</Text>
            <Select
              style={{ width: 150 }}
              placeholder="Tous les statuts"
              allowClear
              value={statusFilter}
              onChange={value => setStatusFilter(value)}
            >
              <Option value="DRAFT">Brouillon</Option>
              <Option value="DUE">À payer</Option>
              <Option value="PARTIAL">Partiel</Option>
              <Option value="PAID">Payé</Option>
              <Option value="OVERDUE">En retard</Option>
            </Select>
          </div>
          <div className="it-filters__field">
            <Text strong>Propriété</Text>
            <Select
              style={{ width: 200 }}
              placeholder="Toutes les propriétés"
              allowClear
              value={propertyFilter}
              onChange={value => setPropertyFilter(value)}
            >
              {properties.map(prop => (
                <Option key={prop.id} value={prop.id}>
                  {prop.address}
                </Option>
              ))}
            </Select>
          </div>
          <div className="it-filters__field">
            <Text strong>Période</Text>
            <RangePicker
              value={dateRange}
              onChange={dates => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
              format="DD/MM/YYYY"
            />
          </div>
        </div>
      </Card>

      {/* Installments Table (T097) */}
      <Card title="Liste des échéances">
        {data && data.installments.length > 0 ? (
          <Table
            scroll={{ x: 'max-content' }}
            columns={columns}
            dataSource={data.installments}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20 }}
          />
        ) : (
          <Empty description="Aucune échéance trouvée" />
        )}
      </Card>
    </Space>
  );
}
