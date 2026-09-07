import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Form,
  DatePicker,
  Select,
  Button,
  Space,
  Divider,
  message,
  Row,
  Col,
  Spin,
  Alert
} from 'antd';
import {
  FilePdfOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import { ownerPortalService } from '../../services/ownerPortalService';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

export default function Reports() {
  const [revenueForm] = Form.useForm();
  const [occupancyForm] = Form.useForm();
  const [exportForm] = Form.useForm();
  const [properties, setProperties] = useState<Array<{ id: string; address: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProperties();
  }, []);

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

  const handleRevenueReport = async (values: any) => {
    try {
      setLoading(true);
      const response = await ownerPortalService.generateRevenueReport({
        startDate: values.dateRange[0].format('YYYY-MM-DD'),
        endDate: values.dateRange[1].format('YYYY-MM-DD'),
        propertyId: values.propertyId,
        format: values.format
      });

      // Create blob from response
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;

      const extension = values.format === 'pdf' ? 'pdf' : values.format === 'csv' ? 'csv' : 'xlsx';
      const filename = `revenue-report-${dayjs().format('YYYY-MM-DD')}.${extension}`;

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      message.success('Rapport de revenus généré avec succès');
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors de la génération du rapport');
    } finally {
      setLoading(false);
    }
  };

  const handleOccupancyReport = async (values: any) => {
    try {
      setLoading(true);
      const response = await ownerPortalService.generateOccupancyReport({
        asOfDate: values.asOfDate.format('YYYY-MM-DD'),
        format: values.format
      });

      // Create blob from response
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;

      const extension = values.format === 'pdf' ? 'pdf' : values.format === 'csv' ? 'csv' : 'xlsx';
      const filename = `occupancy-report-${dayjs().format('YYYY-MM-DD')}.${extension}`;

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      message.success('Rapport d\'occupation généré avec succès');
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors de la génération du rapport');
    } finally {
      setLoading(false);
    }
  };

  const handleExportData = async (values: any) => {
    try {
      setLoading(true);
      const params: any = {
        entityType: values.entityType,
        format: values.format
      };

      if (values.dateRange) {
        params.startDate = values.dateRange[0].format('YYYY-MM-DD');
        params.endDate = values.dateRange[1].format('YYYY-MM-DD');
      }

      if (values.propertyId) {
        params.propertyId = values.propertyId;
      }

      const response = await ownerPortalService.exportData(params);

      // Create blob from response
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;

      const extension = values.format === 'csv' ? 'csv' : 'xlsx';
      const filename = `${values.entityType}-export-${dayjs().format('YYYY-MM-DD')}.${extension}`;

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      message.success('Export des données réussi');
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors de l\'export des données');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div>
        <Title level={2}>Rapports</Title>
        <Text type="secondary">Génération de rapports et export de données</Text>
      </div>

      {/* Revenue Report (T152) */}
      <Card
        title={
          <Space>
            <FilePdfOutlined />
            <span>Rapport de revenus</span>
          </Space>
        }
      >
        <Form
          form={revenueForm}
          layout="vertical"
          onFinish={handleRevenueReport}
        >
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="dateRange"
                label="Période"
                rules={[{ required: true, message: 'Veuillez sélectionner une période' }]}
              >
                <RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="propertyId"
                label="Propriété (optionnel)"
              >
                <Select placeholder="Toutes les propriétés" allowClear>
                  {properties.map(prop => (
                    <Option key={prop.id} value={prop.id}>{prop.address}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="format"
                label="Format"
                rules={[{ required: true, message: 'Veuillez sélectionner un format' }]}
                initialValue="pdf"
              >
                <Select>
                  <Option value="pdf">
                    <Space>
                      <FilePdfOutlined />
                      <span>PDF</span>
                    </Space>
                  </Option>
                  <Option value="csv">
                    <Space>
                      <FileTextOutlined />
                      <span>CSV</span>
                    </Space>
                  </Option>
                  <Option value="excel">
                    <Space>
                      <FileExcelOutlined />
                      <span>Excel</span>
                    </Space>
                  </Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<DownloadOutlined />}
              loading={loading}
            >
              Générer le rapport
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* Occupancy Report (T153) */}
      <Card
        title={
          <Space>
            <FilePdfOutlined />
            <span>Rapport d'occupation</span>
          </Space>
        }
      >
        <Form
          form={occupancyForm}
          layout="vertical"
          onFinish={handleOccupancyReport}
        >
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="asOfDate"
                label="Date"
                rules={[{ required: true, message: 'Veuillez sélectionner une date' }]}
                initialValue={dayjs()}
              >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="format"
                label="Format"
                rules={[{ required: true, message: 'Veuillez sélectionner un format' }]}
                initialValue="pdf"
              >
                <Select>
                  <Option value="pdf">
                    <Space>
                      <FilePdfOutlined />
                      <span>PDF</span>
                    </Space>
                  </Option>
                  <Option value="csv">
                    <Space>
                      <FileTextOutlined />
                      <span>CSV</span>
                    </Space>
                  </Option>
                  <Option value="excel">
                    <Space>
                      <FileExcelOutlined />
                      <span>Excel</span>
                    </Space>
                  </Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<DownloadOutlined />}
              loading={loading}
            >
              Générer le rapport
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* Data Export (T149) */}
      <Card
        title={
          <Space>
            <FileExcelOutlined />
            <span>Export de données</span>
          </Space>
        }
      >
        <Form
          form={exportForm}
          layout="vertical"
          onFinish={handleExportData}
        >
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="entityType"
                label="Type de données"
                rules={[{ required: true, message: 'Veuillez sélectionner un type' }]}
              >
                <Select>
                  <Option value="payments">Paiements</Option>
                  <Option value="installments">Échéances</Option>
                  <Option value="leases">Baux</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="format"
                label="Format"
                rules={[{ required: true, message: 'Veuillez sélectionner un format' }]}
                initialValue="excel"
              >
                <Select>
                  <Option value="csv">
                    <Space>
                      <FileTextOutlined />
                      <span>CSV</span>
                    </Space>
                  </Option>
                  <Option value="excel">
                    <Space>
                      <FileExcelOutlined />
                      <span>Excel</span>
                    </Space>
                  </Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="dateRange"
                label="Période (optionnel)"
              >
                <RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="propertyId"
                label="Propriété (optionnel)"
              >
                <Select placeholder="Toutes les propriétés" allowClear>
                  {properties.map(prop => (
                    <Option key={prop.id} value={prop.id}>{prop.address}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<DownloadOutlined />}
              loading={loading}
            >
              Exporter les données
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </Space>
  );
}
