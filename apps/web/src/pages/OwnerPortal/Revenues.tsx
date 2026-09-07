import React, { useState, useEffect } from 'react';
import { Card, Select, Space, Typography, Spin, Alert, Empty, Row, Col, DatePicker, Table, Tag, Button } from 'antd';
import { DollarOutlined, CalendarOutlined, SyncOutlined } from '@ant-design/icons';
import { ownerPortalService } from '../../services/ownerPortalService';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import { RevenueChart } from '../../components/OwnerPortal/RevenueChart';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

interface RevenueSummaryData {
  currentMonth: number;
  lastMonth: number;
  currentYear: number;
  lastYear: number;
  allTime: number;
  averageMonthly: number;
}

interface RevenueByPropertyData {
  propertyId: string;
  propertyAddress: string;
  revenue: number;
  paymentCount: number;
}

interface RevenueByMonthData {
  month: string;
  monthName: string;
  revenue: number;
  paymentCount: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(amount);
};

export default function Revenues() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RevenueSummaryData | null>(null);
  const [revenuesByProperty, setRevenuesByProperty] = useState<RevenueByPropertyData[]>([]);
  const [revenuesByMonth, setRevenuesByMonth] = useState<RevenueByMonthData[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);

  useEffect(() => {
    loadRevenueData();
  }, [selectedYear, dateRange]);

  const loadRevenueData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load summary
      const summaryResponse = await ownerPortalService.getRevenueSummary();
      if (summaryResponse.data?.success && summaryResponse.data?.data) {
        setSummary(summaryResponse.data.data);
      }

      // Load revenues by property
      const params: any = {};
      if (dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      const byPropertyResponse = await ownerPortalService.getRevenuesByProperty(params);
      if (byPropertyResponse.data?.success && byPropertyResponse.data?.data) {
        setRevenuesByProperty(byPropertyResponse.data.data);
      }

      // Load revenues by month
      const byMonthResponse = await ownerPortalService.getRevenuesByMonth({ year: selectedYear });
      if (byMonthResponse.data?.success && byMonthResponse.data?.data) {
        setRevenuesByMonth(byMonthResponse.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des revenus');
    } finally {
      setLoading(false);
    }
  };

  // Generate year options (current year and 4 previous years)
  const yearOptions = [];
  const currentYear = new Date().getFullYear();
  for (let i = 0; i < 5; i++) {
    yearOptions.push(currentYear - i);
  }

  const propertyTableColumns = [
    {
      title: 'Propriété',
      dataIndex: 'propertyAddress',
      key: 'propertyAddress',
    },
    {
      title: 'Revenus',
      dataIndex: 'revenue',
      key: 'revenue',
      render: (amount: number) => formatCurrency(amount),
      sorter: (a: RevenueByPropertyData, b: RevenueByPropertyData) => a.revenue - b.revenue,
    },
    {
      title: 'Nombre de paiements',
      dataIndex: 'paymentCount',
      key: 'paymentCount',
      sorter: (a: RevenueByPropertyData, b: RevenueByPropertyData) => a.paymentCount - b.paymentCount,
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="Chargement des revenus..." />
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
          <Title level={2}>Revenus</Title>
          <Text type="secondary">Analyse de vos revenus locatifs</Text>
        </div>
        <Button
          icon={<SyncOutlined />}
          onClick={loadRevenueData}
          loading={loading}
          aria-label="Rafraîchir les revenus"
        >
          Actualiser
        </Button>
      </div>

      {/* Revenue Summary Cards (T084) */}
      {summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="Ce mois"
              value={formatCurrency(summary.currentMonth)}
              icon={<DollarOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ fontSize: 18, color: '#52c41a' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="Cette année"
              value={formatCurrency(summary.currentYear)}
              icon={<DollarOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18, color: '#1890ff' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="Tous les temps"
              value={formatCurrency(summary.allTime)}
              icon={<DollarOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title="Moyenne mensuelle"
              value={formatCurrency(summary.averageMonthly)}
              icon={<DollarOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
        </Row>
      )}

      {/* Filters (T088) */}
      <Card title="Filtres">
        <Space wrap>
          <Space>
            <Text strong>Période:</Text>
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
              format="DD/MM/YYYY"
            />
          </Space>
          <Space>
            <Text strong>Année (revenus mensuels):</Text>
            <Select
              style={{ width: 150 }}
              value={selectedYear}
              onChange={(value) => setSelectedYear(value)}
            >
              {yearOptions.map(year => (
                <Option key={year} value={year}>{year}</Option>
              ))}
            </Select>
          </Space>
        </Space>
      </Card>

      {/* Revenue by Month Chart (T085) */}
      <Card
        title={
          <Space>
            <CalendarOutlined />
            <span>Revenus par mois ({selectedYear})</span>
          </Space>
        }
      >
        {revenuesByMonth.length > 0 ? (
          <RevenueChart
            data={revenuesByMonth}
            type="line"
            dataKey="revenue"
            xAxisKey="monthName"
          />
        ) : (
          <Empty description="Aucune donnée disponible pour cette année" />
        )}
      </Card>

      {/* Revenue by Property Chart (T086) */}
      <Card title="Revenus par propriété">
        {revenuesByProperty.length > 0 ? (
          <>
            <RevenueChart
              data={revenuesByProperty}
              type="bar"
              dataKey="revenue"
              xAxisKey="propertyAddress"
            />
            {/* Revenue by Property Table (T087) */}
            <div style={{ marginTop: 24 }}>
              <Table
                columns={propertyTableColumns}
                dataSource={revenuesByProperty}
                rowKey="propertyId"
                pagination={{ pageSize: 10 }}
              />
            </div>
          </>
        ) : (
          <Empty description="Aucune donnée disponible" />
        )}
      </Card>
    </Space>
  );
}
