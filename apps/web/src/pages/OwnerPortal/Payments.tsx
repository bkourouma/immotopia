import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Spin,
  Alert,
  Table,
  Tag,
  Space,
  Select,
  DatePicker,
  Button,
  Empty
} from 'antd';
import {
  DollarOutlined,
  FilterOutlined,
  EyeOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { ownerPortalService } from '../../services/ownerPortalService';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import { PaymentDetailsModal } from '../../components/OwnerPortal/PaymentDetailsModal';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

interface PaymentListItem {
  id: string;
  propertyAddress: string;
  tenantName: string;
  amount: number;
  date: Date | string;
  method: string;
  status: string;
}

interface PaymentSummary {
  total: number;
  totalAmount: number;
  thisMonth: number;
  thisYear: number;
}

interface PaymentsData {
  payments: PaymentListItem[];
  summary: PaymentSummary;
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
    SUCCESS: { color: 'green', text: 'Réussi' },
    FAILED: { color: 'red', text: 'Échoué' },
    CANCELED: { color: 'orange', text: 'Annulé' }
  };

  const config = statusConfig[status] || { color: 'default', text: status };
  return <Tag color={config.color}>{config.text}</Tag>;
};

const getMethodLabel = (method: string) => {
  const methodLabels: Record<string, string> = {
    MOBILE_MONEY: 'Mobile Money',
    BANK_TRANSFER: 'Virement bancaire',
    CASH: 'Espèces',
    CHECK: 'Chèque',
    CARD: 'Carte bancaire'
  };
  return methodLabels[method] || method;
};

export default function Payments() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaymentsData | null>(null);
  const [propertyFilter, setPropertyFilter] = useState<string | undefined>(undefined);
  const [methodFilter, setMethodFilter] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [properties, setProperties] = useState<Array<{ id: string; address: string }>>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);

  useEffect(() => {
    loadProperties();
  }, []);

  useEffect(() => {
    loadPayments();
  }, [propertyFilter, methodFilter, dateRange]);

  const loadProperties = async () => {
    try {
      const response = await ownerPortalService.getProperties();
      if (response.data?.success && response.data?.data?.properties) {
        setProperties(response.data.data.properties.map((p: any) => ({
          id: p.id,
          address: p.address
        })));
      }
    } catch (err) {
      console.error('Error loading properties:', err);
    }
  };

  const loadPayments = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {};
      if (propertyFilter) params.propertyId = propertyFilter;
      if (methodFilter) params.method = methodFilter;
      if (dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      const response = await ownerPortalService.getPayments(params);
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des paiements');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (paymentId: string) => {
    try {
      setDetailsLoading(true);
      setSelectedPaymentId(paymentId);
      const response = await ownerPortalService.getPaymentDetails(paymentId);
      if (response.data?.success && response.data?.data?.payment) {
        setPaymentDetails(response.data.data.payment);
        setDetailsModalVisible(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des détails');
    } finally {
      setDetailsLoading(false);
    }
  };

  const columns = [
    {
      title: 'Propriété',
      dataIndex: 'propertyAddress',
      key: 'propertyAddress',
    },
    {
      title: 'Locataire',
      dataIndex: 'tenantName',
      key: 'tenantName',
    },
    {
      title: 'Montant',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => formatCurrency(amount),
      sorter: (a: PaymentListItem, b: PaymentListItem) => a.amount - b.amount,
    },
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (date: Date | string) => {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dayjs(dateObj).format('DD/MM/YYYY HH:mm');
      },
      sorter: (a: PaymentListItem, b: PaymentListItem) => {
        const dateA = typeof a.date === 'string' ? new Date(a.date) : a.date;
        const dateB = typeof b.date === 'string' ? new Date(b.date) : b.date;
        return dateA.getTime() - dateB.getTime();
      },
    },
    {
      title: 'Méthode',
      dataIndex: 'method',
      key: 'method',
      render: (method: string) => getMethodLabel(method),
      filters: [
        { text: 'Mobile Money', value: 'MOBILE_MONEY' },
        { text: 'Virement bancaire', value: 'BANK_TRANSFER' },
        { text: 'Espèces', value: 'CASH' },
        { text: 'Chèque', value: 'CHECK' },
        { text: 'Carte bancaire', value: 'CARD' },
      ],
      onFilter: (value: any, record: PaymentListItem) => record.method === value,
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: PaymentListItem) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetails(record.id)}
          loading={detailsLoading && selectedPaymentId === record.id}
        >
          Détails
        </Button>
      ),
    },
  ];

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="Chargement des paiements..." />
      </div>
    );
  }

  if (error) {
    return <Alert message="Erreur" description={error} type="error" showIcon />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2}>Paiements</Title>
          <Text type="secondary">Historique des paiements reçus</Text>
        </div>
        <Button
          icon={<SyncOutlined />}
          onClick={loadPayments}
          loading={loading}
          aria-label="Rafraîchir les paiements"
        >
          Actualiser
        </Button>
      </div>

      {/* Summary Cards (T107) */}
      {data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="Total"
              value={data.summary.total.toString()}
              icon={<DollarOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="Montant total"
              value={formatCurrency(data.summary.totalAmount)}
              icon={<DollarOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ fontSize: 18, color: '#52c41a' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="Ce mois"
              value={data.summary.thisMonth.toString()}
              icon={<DollarOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="Cette année"
              value={data.summary.thisYear.toString()}
              icon={<DollarOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
        </Row>
      )}

      {/* Filters (T106) */}
      <Card
        title={
          <Space>
            <FilterOutlined />
            <span>Filtres</span>
          </Space>
        }
      >
        <Space wrap>
          <Space>
            <Text strong>Propriété:</Text>
            <Select
              style={{ width: 200 }}
              placeholder="Toutes les propriétés"
              allowClear
              value={propertyFilter}
              onChange={(value) => setPropertyFilter(value)}
            >
              {properties.map(prop => (
                <Option key={prop.id} value={prop.id}>{prop.address}</Option>
              ))}
            </Select>
          </Space>
          <Space>
            <Text strong>Méthode:</Text>
            <Select
              style={{ width: 150 }}
              placeholder="Toutes les méthodes"
              allowClear
              value={methodFilter}
              onChange={(value) => setMethodFilter(value)}
            >
              <Option value="MOBILE_MONEY">Mobile Money</Option>
              <Option value="BANK_TRANSFER">Virement bancaire</Option>
              <Option value="CASH">Espèces</Option>
              <Option value="CHECK">Chèque</Option>
              <Option value="CARD">Carte bancaire</Option>
            </Select>
          </Space>
          <Space>
            <Text strong>Période:</Text>
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
              format="DD/MM/YYYY"
            />
          </Space>
        </Space>
      </Card>

      {/* Payments Table (T106) */}
      <Card title="Historique des paiements">
        {data && data.payments.length > 0 ? (
          <Table
            columns={columns}
            dataSource={data.payments}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20 }}
          />
        ) : (
          <Empty description="Aucun paiement trouvé" />
        )}
      </Card>

      {/* Payment Details Modal (T108) */}
      <PaymentDetailsModal
        visible={detailsModalVisible}
        onClose={() => {
          setDetailsModalVisible(false);
          setPaymentDetails(null);
          setSelectedPaymentId(null);
        }}
        payment={paymentDetails}
        loading={detailsLoading}
      />
    </Space>
  );
}
