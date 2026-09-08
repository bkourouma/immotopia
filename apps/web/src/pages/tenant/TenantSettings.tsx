import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { App, Form, Input, Card, Button, Space, Alert, Spin, Typography, Row, Col } from 'antd';
import { SaveOutlined, SettingOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { getTenant, updateTenantSelf, Tenant, UpdateTenantRequest } from '../../services/tenant-service';

const { Title, Text } = Typography;

export const TenantSettings: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const [form] = Form.useForm();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (tenantId) {
      loadTenant();
    }
  }, [tenantId]);

  const loadTenant = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getTenant(tenantId);
      if (response.success && response.data) {
        const tenantData = response.data;
        setTenant(tenantData);
        form.setFieldsValue({
          name: tenantData.name || '',
          legalName: tenantData.legalName || '',
          contactEmail: tenantData.contactEmail || '',
          contactPhone: tenantData.contactPhone || '',
          address: tenantData.address || '',
          city: tenantData.city || '',
          country: tenantData.country || '',
          website: tenantData.website || ''
        });
      } else {
        setError('Erreur lors du chargement des informations');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des informations');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: any) => {
    if (!tenantId) return;

    setSuccess(false);
    setError(null);
    setSaving(true);

    try {
      const updateData: Omit<UpdateTenantRequest, 'status' | 'subdomain' | 'customDomain'> = {
        name: values.name,
        legalName: values.legalName || undefined,
        contactEmail: values.contactEmail || undefined,
        contactPhone: values.contactPhone || undefined,
        address: values.address || undefined,
        city: values.city || undefined,
        country: values.country || undefined,
        website: values.website || undefined
      };

      const response = await updateTenantSelf(tenantId, updateData);
      if (response.success) {
        setSuccess(true);
        setTenant(response.data);
        message.success('Informations mises à jour avec succès !');
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError('Erreur lors de la sauvegarde');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la sauvegarde');
      message.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <Spin size="large" />
        </div>
      </DashboardLayout>
    );
  }

  if (error && !tenant) {
    return (
      <DashboardLayout>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Alert
            message="Erreur"
            description={error}
            type="error"
            showIcon
            icon={<ExclamationCircleOutlined />}
            action={
              <Button size="small" onClick={loadTenant}>
                Réessayer
              </Button>
            }
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <div>
          <Title level={2} style={{ margin: 0 }}>
            Paramètres de l'Agence
          </Title>
          <Text type="secondary">
            Gérez les informations de votre agence. Ces informations seront utilisées dans les documents générés.
          </Text>
        </div>

        {/* Success Message */}
        {success && (
          <Alert
            message="Succès"
            description="Informations mises à jour avec succès !"
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            closable
            onClose={() => setSuccess(false)}
          />
        )}

        {/* Error Message */}
        {error && (
          <Alert
            message="Erreur"
            description={error}
            type="error"
            showIcon
            icon={<ExclamationCircleOutlined />}
            closable
            onClose={() => setError(null)}
          />
        )}

        {/* Settings Form */}
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            name: '',
            legalName: '',
            contactEmail: '',
            contactPhone: '',
            address: '',
            city: '',
            country: '',
            website: ''
          }}
        >
          {/* Informations Générales */}
          <Card title="Informations Générales" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Nom de l'agence"
                  name="name"
                  rules={[{ required: true, message: 'Le nom est requis' }]}
                >
                  <Input placeholder="Nom de l'agence" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Dénomination légale" name="legalName">
                  <Input placeholder="Dénomination légale (optionnel)" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Informations de Contact */}
          <Card title="Informations de Contact" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Email de contact"
                  name="contactEmail"
                  rules={[{ type: 'email', message: 'Email invalide' }]}
                >
                  <Input type="email" placeholder="contact@agence.com" />
                </Form.Item>
                <Text
                  type="secondary"
                  style={{ fontSize: '12px', marginTop: '-12px', display: 'block', marginBottom: '16px' }}
                >
                  Utilisé dans les documents générés (AGENCE_EMAIL)
                </Text>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Téléphone de contact" name="contactPhone">
                  <Input type="tel" placeholder="+225 XX XX XX XX XX" />
                </Form.Item>
                <Text
                  type="secondary"
                  style={{ fontSize: '12px', marginTop: '-12px', display: 'block', marginBottom: '16px' }}
                >
                  Utilisé dans les documents générés (AGENCE_TELEPHONE)
                </Text>
              </Col>
            </Row>
          </Card>

          {/* Adresse */}
          <Card title="Adresse" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col xs={24}>
                <Form.Item label="Adresse complète" name="address">
                  <Input placeholder="Adresse complète de l'agence" />
                </Form.Item>
                <Text
                  type="secondary"
                  style={{ fontSize: '12px', marginTop: '-12px', display: 'block', marginBottom: '16px' }}
                >
                  Utilisé dans les documents générés (AGENCE_ADRESSE)
                </Text>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Ville" name="city">
                  <Input placeholder="Ville" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Pays" name="country">
                  <Input placeholder="Pays" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Informations Supplémentaires */}
          <Card title="Informations Supplémentaires" style={{ marginBottom: 16 }}>
            <Form.Item
              label="Site web"
              name="website"
              rules={[
                {
                  pattern: /^https?:\/\/.+/,
                  message: 'URL invalide (doit commencer par http:// ou https://)'
                }
              ]}
            >
              <Input type="url" placeholder="https://www.agence.com" />
            </Form.Item>
          </Card>

          {/* Actions */}
          <Card>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} size="large">
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </Form.Item>
          </Card>
        </Form>

        {/* Info Box */}
        <Alert
          message="Information importante"
          description="Les informations renseignées ici seront utilisées automatiquement dans tous les documents générés (contrats de bail, reçus, etc.). Assurez-vous que les informations sont complètes et à jour."
          type="info"
          showIcon
          icon={<SettingOutlined />}
        />
      </Space>
    </DashboardLayout>
  );
};
