import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Radio,
  Button,
  Space,
  Typography,
  Alert,
  Row,
  Col,
} from 'antd';
import { ArrowLeftOutlined, BankOutlined, TeamOutlined } from '@ant-design/icons';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { createTenant, CreateTenantRequest } from '../../services/tenant-service';

const { Title, Text } = Typography;
const { TextArea } = Input;

export const TenantCreate: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm<CreateTenantRequest>();
  const [tenantType, setTenantType] = useState<'AGENCY' | 'OPERATOR'>('AGENCY');

  const handleSubmit = async (values: CreateTenantRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response = await createTenant({ ...values, type: tenantType });
      if (response.success) {
        navigate(`/admin/tenants/${response.data.id}`);
      } else {
        setError('Erreur lors de la création du tenant');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la création du tenant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/admin/tenants')}
            style={{ padding: 4 }}
          />
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Nouveau Tenant
            </Title>
            <Text type="secondary">Créer un nouveau tenant</Text>
          </div>
        </div>

        <Card>
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              name: '',
              legalName: '',
              contactEmail: '',
              contactPhone: '',
              country: '',
              city: '',
              address: '',
              brandingPrimaryColor: '',
              subdomain: '',
              customDomain: '',
            }}
            onFinish={handleSubmit}
          >
            {error && (
              <Alert
                message="Erreur"
                description={error}
                type="error"
                showIcon
                closable
                onClose={() => setError(null)}
                style={{ marginBottom: 24 }}
              />
            )}

            <Form.Item label="Type de tenant" required>
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                value={tenantType}
                onChange={(e) => setTenantType(e.target.value)}
              >
                <Radio.Button value="AGENCY">
                  <Space>
                    <BankOutlined />
                    Agence
                  </Space>
                </Radio.Button>
                <Radio.Button value="OPERATOR">
                  <Space>
                    <TeamOutlined />
                    Opérateur
                  </Space>
                </Radio.Button>
              </Radio.Group>
              <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                {tenantType === 'AGENCY'
                  ? 'Agence immobilière traditionnelle'
                  : 'Opérateur ou promoteur immobilier'}
              </Text>
            </Form.Item>

            <Row gutter={24}>
              <Col xs={24} sm={12}>
                <Form.Item
                  label="Nom"
                  name="name"
                  rules={[{ required: true, message: 'Le nom est requis' }]}
                >
                  <Input placeholder="Nom du tenant" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Nom légal" name="legalName">
                  <Input placeholder="Raison sociale" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Email de contact" name="contactEmail">
                  <Input type="email" placeholder="contact@exemple.fr" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Téléphone" name="contactPhone">
                  <Input placeholder="+33 ..." />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Ville" name="city">
                  <Input placeholder="Ville" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Pays" name="country">
                  <Input placeholder="Pays" />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="Adresse" name="address">
                  <TextArea rows={3} placeholder="Adresse complète" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Sous-domaine" name="subdomain">
                  <Input placeholder="mon-tenant" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Domaine personnalisé" name="customDomain">
                  <Input placeholder="www.mon-domaine.fr" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
              <Space>
                <Button onClick={() => navigate('/admin/tenants')}>Annuler</Button>
                <Button type="primary" htmlType="submit" loading={loading}>
                  Créer
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </Space>
    </DashboardLayout>
  );
};
