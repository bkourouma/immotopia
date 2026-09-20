import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Form, Input, Button, Space, Typography, Alert, Row, Col, Skeleton, App } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { getTenant, updateTenant, Tenant, UpdateTenantRequest } from '../../services/tenant-service';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;
const { TextArea } = Input;

type TenantFormValues = Required<
  Pick<
    UpdateTenantRequest,
    | 'name'
    | 'legalName'
    | 'contactEmail'
    | 'contactPhone'
    | 'country'
    | 'city'
    | 'address'
    | 'subdomain'
    | 'customDomain'
    | 'website'
  >
>;

/**
 * L'API valide contactEmail en email et website en url : une chaine vide y est
 * refusee. On n'envoie donc que les champs reellement renseignes ou vides pour
 * les champs libres, et on omet les champs contraints laisses vides.
 */
const CONSTRAINED_FIELDS: Array<keyof TenantFormValues> = ['contactEmail', 'website'];

function toPayload(values: TenantFormValues): UpdateTenantRequest {
  const payload: UpdateTenantRequest = {};
  (Object.keys(values) as Array<keyof TenantFormValues>).forEach(key => {
    const value = (values[key] ?? '').trim();
    if (!value && CONSTRAINED_FIELDS.includes(key)) return;
    payload[key] = value;
  });
  return payload;
}

export const TenantEdit: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm<TenantFormValues>();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTenant = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getTenant(tenantId);
      if (response.success) {
        setTenant(response.data);
        form.setFieldsValue({
          name: response.data.name ?? '',
          legalName: response.data.legalName ?? '',
          contactEmail: response.data.contactEmail ?? '',
          contactPhone: response.data.contactPhone ?? '',
          country: response.data.country ?? '',
          city: response.data.city ?? '',
          address: response.data.address ?? '',
          subdomain: response.data.subdomain ?? '',
          customDomain: response.data.customDomain ?? '',
          website: response.data.website ?? ''
        });
      } else {
        setError(t("Erreur lors du chargement de l'agence"));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t("Erreur lors du chargement de l'agence"));
    } finally {
      setLoading(false);
    }
  }, [tenantId, form]);

  useEffect(() => {
    loadTenant();
  }, [loadTenant]);

  const handleSubmit = async (values: TenantFormValues) => {
    if (!tenantId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await updateTenant(tenantId, toPayload(values));
      if (response.success) {
        message.success(t('Agence mise à jour'));
        navigate(`/admin/tenants/${tenantId}`);
      } else {
        setError(t("Erreur lors de la mise à jour de l'agence"));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t("Erreur lors de la mise à jour de l'agence"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/admin/tenants/${tenantId}`)}
          style={{ padding: 4 }}
        />
        <div>
          <Title level={3} style={{ margin: 0 }}>
            {t("Modifier l'agence")}
          </Title>
          <Text type="secondary">{tenant?.name ?? 'Chargement…'}</Text>
        </div>
      </div>

      <Card>
        {loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Form form={form} layout="vertical" onFinish={handleSubmit} onFinishFailed={onAntFormValidationFailed(form)}>
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
                <Form.Item
                  label={t('Email de contact')}
                  name="contactEmail"
                  rules={[{ type: 'email', message: t('Adresse email invalide') }]}
                >
                  <Input placeholder="contact@exemple.ci" />
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
                  <Input placeholder="www.mon-domaine.ci" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  label={t('Site web')}
                  name="website"
                  rules={[{ type: 'url', message: t('URL invalide (https://…)') }]}
                >
                  <Input placeholder="https://www.mon-domaine.ci" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
              <Space>
                <Button onClick={() => navigate(`/admin/tenants/${tenantId}`)}>{t('Annuler')}</Button>
                <Button type="primary" htmlType="submit" loading={saving}>
                  {t('Enregistrer')}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Card>
    </Space>
  );
};
