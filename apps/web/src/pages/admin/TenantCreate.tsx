import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Radio, Button, Space, Typography, Alert, Row, Col } from 'antd';
import { ArrowLeftOutlined, BankOutlined, TeamOutlined } from '@ant-design/icons';
import { createTenant, CreateTenantRequest } from '../../services/tenant-service';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { t } from '../../i18n/t';

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
        setError(t('Erreur lors de la création du tenant'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors de la création du tenant'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
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
              {t('Nouveau Tenant')}
            </Title>
            <Text type="secondary">{t('Créer une nouvelle agence')}</Text>
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
              contactPhone: '+225 ',
              country: t("Côte d'Ivoire"),
              city: '',
              address: '',
              brandingPrimaryColor: '',
              subdomain: '',
              customDomain: ''
            }}
            onFinish={handleSubmit}
            onFinishFailed={onAntFormValidationFailed(form)}
          >
            {error && (
              <Alert
                message={t('Erreur')}
                description={error}
                type="error"
                showIcon
                closable
                onClose={() => setError(null)}
                style={{ marginBottom: 24 }}
              />
            )}

            <Form.Item label={t("Type d'agence")} required>
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                value={tenantType}
                onChange={e => setTenantType(e.target.value)}
              >
                <Radio.Button value="AGENCY">
                  <Space>
                    <BankOutlined />
                    {t('Agence')}
                  </Space>
                </Radio.Button>
                <Radio.Button value="OPERATOR">
                  <Space>
                    <TeamOutlined />
                    {t('Opérateur')}
                  </Space>
                </Radio.Button>
              </Radio.Group>
              <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                {tenantType === 'AGENCY'
                  ? t('Agence immobilière traditionnelle')
                  : t('Opérateur ou promoteur immobilier')}
              </Text>
            </Form.Item>

            <Row gutter={24}>
              <Col xs={24} sm={12}>
                <Form.Item label={t('Nom')} name="name" rules={[{ required: true, message: t('Le nom est requis') }]}>
                  <Input placeholder={t("Nom de l'agence")} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label={t('Nom légal')} name="legalName">
                  <Input placeholder={t('Raison sociale')} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label={t('Email de contact')} name="contactEmail">
                  <Input type="email" placeholder="contact@exemple.fr" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label={t('Téléphone')} name="contactPhone">
                  <Input placeholder="+225 07 00 00 00 00" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label={t('Ville')} name="city">
                  <Input placeholder={t('Ville')} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label={t('Pays')} name="country">
                  <Input placeholder={t("Côte d'Ivoire")} />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label={t('Adresse')} name="address">
                  <TextArea rows={3} placeholder={t('Adresse complète')} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label={t('Sous-domaine')} name="subdomain">
                  <Input placeholder="mon-agence" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label={t('Domaine personnalisé')} name="customDomain">
                  <Input placeholder="www.mon-domaine.fr" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
              <Space>
                <Button onClick={() => navigate('/admin/tenants')}>{t('Annuler')}</Button>
                <Button type="primary" htmlType="submit" loading={loading}>
                  {t('Créer')}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </Space>
    </>
  );
};
