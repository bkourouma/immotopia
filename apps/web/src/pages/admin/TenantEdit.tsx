import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Form, Input, Button, Space, Typography, Alert, Row, Col, Skeleton, Upload, App } from 'antd';
import { ArrowLeftOutlined, UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { getTenant, Tenant, UpdateTenantRequest } from '../../services/tenant-service';
import {
  updateTenantBrandingAdmin,
  uploadTenantLogo,
  TenantWithBranding
} from '../../services/tenant-branding-service';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;
const { TextArea } = Input;

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

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
> & { brandingPrimaryColor: string };

/**
 * L'API valide contactEmail en email et website en url : une chaine vide y est
 * refusee. On n'envoie donc que les champs reellement renseignes ou vides pour
 * les champs libres, et on omet les champs contraints laisses vides.
 */
const CONSTRAINED_FIELDS: Array<keyof TenantFormValues> = ['contactEmail', 'website', 'brandingPrimaryColor'];

function toPayload(values: TenantFormValues): UpdateTenantRequest {
  const payload: UpdateTenantRequest = {};
  (Object.keys(values) as Array<keyof TenantFormValues>).forEach(key => {
    const value = (values[key] ?? '').trim();
    if (!value && CONSTRAINED_FIELDS.includes(key)) return;
    (payload as Record<string, string>)[key] = value;
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
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const brandingColorValue = Form.useWatch('brandingPrimaryColor', form);

  const loadTenant = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getTenant(tenantId);
      if (response.success) {
        setTenant(response.data);
        setLogoUrl((response.data as TenantWithBranding).logoUrl ?? null);
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
          website: response.data.website ?? '',
          brandingPrimaryColor: response.data.brandingPrimaryColor ?? ''
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
      const response = await updateTenantBrandingAdmin(tenantId, toPayload(values));
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

  const handleLogoSelect = async (file: File) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      message.error(t('Format non supporté (PNG, JPEG ou WebP)'));
      return Upload.LIST_IGNORE;
    }
    if (file.size > 2 * 1024 * 1024) {
      message.error(t('Le logo ne doit pas dépasser 2 Mo'));
      return Upload.LIST_IGNORE;
    }
    if (!tenantId) return Upload.LIST_IGNORE;
    setUploadingLogo(true);
    try {
      const response = await uploadTenantLogo(tenantId, file);
      setLogoUrl(response.data.logoUrl);
      message.success(t('Logo mis à jour'));
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors du téléversement du logo'));
    } finally {
      setUploadingLogo(false);
    }
    return Upload.LIST_IGNORE;
  };

  const handleRemoveLogo = async () => {
    if (!tenantId) return;
    setRemovingLogo(true);
    try {
      await updateTenantBrandingAdmin(tenantId, { logoUrl: null });
      setLogoUrl(null);
      message.success(t('Logo retiré'));
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors du retrait du logo'));
    } finally {
      setRemovingLogo(false);
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

            <Form.Item label={t('Logo')}>
              <Space align="start" wrap>
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={t("Logo de l'agence")}
                    style={{
                      width: 80,
                      height: 80,
                      objectFit: 'contain',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)'
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px dashed var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-tertiary)',
                      fontSize: 'var(--font-size-sm)',
                      textAlign: 'center'
                    }}
                  >
                    {t('Aucun logo')}
                  </div>
                )}
                <Space direction="vertical">
                  <Upload accept="image/png,image/jpeg,image/webp" showUploadList={false} beforeUpload={handleLogoSelect}>
                    <Button icon={<UploadOutlined />} loading={uploadingLogo}>
                      {t('Téléverser un logo')}
                    </Button>
                  </Upload>
                  {logoUrl && (
                    <Button danger icon={<DeleteOutlined />} loading={removingLogo} onClick={handleRemoveLogo}>
                      {t('Retirer')}
                    </Button>
                  )}
                  <Text type="secondary" style={{ fontSize: 'var(--font-size-caption)' }}>
                    {t('PNG, JPEG ou WebP, 2 Mo maximum')}
                  </Text>
                </Space>
              </Space>
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
              <Col xs={24} sm={12}>
                <Form.Item
                  label={t('Couleur de marque')}
                  name="brandingPrimaryColor"
                  rules={[{ pattern: HEX_COLOR_PATTERN, message: t('Couleur invalide (#RRGGBB)') }]}
                >
                  <Input
                    placeholder="#1677FF"
                    prefix={
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'inline-block',
                          width: 14,
                          height: 14,
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-default)',
                          backgroundColor: HEX_COLOR_PATTERN.test(brandingColorValue || '')
                            ? brandingColorValue
                            : 'transparent'
                        }}
                      />
                    }
                  />
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
