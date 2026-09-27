import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Form, Input, Card, Button, Space, Alert, Spin, Typography, Row, Col, Upload } from 'antd';
import {
  SaveOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  UploadOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { getTenant, Tenant, UpdateTenantRequest } from '../../services/tenant-service';
import {
  updateTenantBrandingSelf,
  uploadTenantLogo,
  TenantWithBranding
} from '../../services/tenant-branding-service';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { BrandingImageField } from '../../components/documents/BrandingImageField';
import {
  AgencyImageKind,
  fetchAgencyImageBlob,
  getAgencyDocumentIdentity,
  removeAgencyImage,
  uploadAgencyImage
} from '../../services/document-branding-service';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export const TenantSettings: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();

  const { tenantId } = useParams<{ tenantId: string }>();
  const [form] = Form.useForm();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [hasStamp, setHasStamp] = useState(false);
  const [identityVersion, setIdentityVersion] = useState(0);
  const brandingColorValue = Form.useWatch('brandingPrimaryColor', form);

  useEffect(() => {
    if (tenantId) {
      loadTenant();
      void loadDocumentIdentity();
    }
  }, [tenantId]);

  // Signature et cachet pour les documents (lot S1, besoin 7) : chargés à
  // part du reste des réglages, sur une route dédiée (`document-identity`).
  const loadDocumentIdentity = async () => {
    if (!tenantId) return;
    try {
      const identity = await getAgencyDocumentIdentity(tenantId);
      setHasSignature(identity.hasSignature);
      setHasStamp(identity.hasStamp);
    } catch {
      setHasSignature(false);
      setHasStamp(false);
    }
  };

  const handleIdentityImageUpload = async (kind: AgencyImageKind, file: File) => {
    if (!tenantId) return;
    const updated = await uploadAgencyImage(tenantId, kind, file);
    setHasSignature(updated.hasSignature);
    setHasStamp(updated.hasStamp);
    setIdentityVersion(version => version + 1);
  };

  const handleIdentityImageRemove = async (kind: AgencyImageKind) => {
    if (!tenantId) return;
    const updated = await removeAgencyImage(tenantId, kind);
    setHasSignature(updated.hasSignature);
    setHasStamp(updated.hasStamp);
    setIdentityVersion(version => version + 1);
  };

  const loadTenant = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getTenant(tenantId);
      if (response.success && response.data) {
        const tenantData = response.data;
        setTenant(tenantData);
        setLogoUrl((tenantData as TenantWithBranding).logoUrl ?? null);
        form.setFieldsValue({
          name: tenantData.name || '',
          legalName: tenantData.legalName || '',
          contactEmail: tenantData.contactEmail || '',
          contactPhone: tenantData.contactPhone || '',
          address: tenantData.address || '',
          city: tenantData.city || '',
          country: tenantData.country || '',
          website: tenantData.website || '',
          brandingPrimaryColor: tenantData.brandingPrimaryColor || ''
        });
      } else {
        setError(t('Erreur lors du chargement des informations'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des informations'));
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
        website: values.website || undefined,
        brandingPrimaryColor: values.brandingPrimaryColor || undefined
      };

      const response = await updateTenantBrandingSelf(tenantId, updateData);
      if (response.success) {
        setSuccess(true);
        setTenant(response.data);
        message.success(t('Informations mises à jour avec succès !'));
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(t('Erreur lors de la sauvegarde'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors de la sauvegarde'));
      message.error(t('Erreur lors de la sauvegarde'));
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
      await updateTenantBrandingSelf(tenantId, { logoUrl: null });
      setLogoUrl(null);
      message.success(t('Logo retiré'));
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors du retrait du logo'));
    } finally {
      setRemovingLogo(false);
    }
  };

  if (loading) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <Spin size="large" />
        </div>
      </>
    );
  }

  if (error && !tenant) {
    return (
      <>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Alert
            message={t('Erreur')}
            description={error}
            type="error"
            showIcon
            icon={<ExclamationCircleOutlined />}
            action={
              <Button size="small" onClick={loadTenant}>
                {t('Réessayer')}
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <div>
          <Title level={2} style={{ margin: 0 }}>
            {t("Paramètres de l'Agence")}
          </Title>
          <Text type="secondary">
            {t('Gérez les informations de votre agence. Ces informations seront utilisées dans les documents générés.')}
          </Text>
        </div>

        {/* Abonnement — consultation seule, vague 2 (lot C) : packs, période,
            jauges de consommation. */}
        <Card title={t('Abonnement')}>
          <Space direction="vertical" size="small">
            <Text type="secondary">
              {t('Packs souscrits, période en cours et consommation de lots, copropriétés et chantiers.')}
            </Text>
            <Button onClick={() => navigate(`/tenant/${tenantId}/settings/abonnement`)}>
              {t('Voir mon abonnement')}
            </Button>
          </Space>
        </Card>

        {/* Success Message */}
        {success && (
          <Alert
            message={t('Succès')}
            description={t('Informations mises à jour avec succès !')}
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
            message={t('Erreur')}
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
          onFinishFailed={onAntFormValidationFailed(form)}
          initialValues={{
            name: '',
            legalName: '',
            contactEmail: '',
            contactPhone: '',
            address: '',
            city: '',
            country: '',
            website: '',
            brandingPrimaryColor: ''
          }}
        >
          {/* Logo et couleur de marque */}
          <Card title={t('Logo et couleur de marque')} style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col xs={24} md={12}>
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
              </Col>
              <Col xs={24} md={12}>
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
          </Card>

          {/* Signature et cachet pour les documents (lot S1, besoin 7) : images
              privées (jamais un <img src> direct), utilisées comme identité par
              défaut quand une copropriété n'a pas de mandant. */}
          <Card title={t('Signature et cachet pour les documents')} style={{ marginBottom: 16 }}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <BrandingImageField
                label={t('Signature')}
                hasImage={hasSignature}
                imageVersion={identityVersion}
                fetchImage={() => fetchAgencyImageBlob(tenantId!, 'signature')}
                onUpload={file => handleIdentityImageUpload('signature', file)}
                onRemove={() => handleIdentityImageRemove('signature')}
              />
              <BrandingImageField
                label={t('Cachet')}
                hasImage={hasStamp}
                imageVersion={identityVersion}
                fetchImage={() => fetchAgencyImageBlob(tenantId!, 'stamp')}
                onUpload={file => handleIdentityImageUpload('stamp', file)}
                onRemove={() => handleIdentityImageRemove('stamp')}
              />
            </Space>
          </Card>

          {/* Informations Générales */}
          <Card title={t('Informations Générales')} style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  label={t("Nom de l'agence")}
                  name="name"
                  rules={[{ required: true, message: t('Le nom est requis') }]}
                >
                  <Input placeholder={t("Nom de l'agence")} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label={t('Dénomination légale')} name="legalName">
                  <Input placeholder={t('Dénomination légale (optionnel)')} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Informations de Contact */}
          <Card title={t('Informations de Contact')} style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  label={t('Email de contact')}
                  name="contactEmail"
                  rules={[{ type: 'email', message: t('Email invalide') }]}
                >
                  <Input type="email" placeholder="contact@agence.com" />
                </Form.Item>
                <Text
                  type="secondary"
                  style={{ fontSize: '12px', marginTop: '-12px', display: 'block', marginBottom: '16px' }}
                >
                  {t('Utilisé dans les documents générés (AGENCE_EMAIL)')}
                </Text>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label={t('Téléphone de contact')} name="contactPhone">
                  <Input type="tel" placeholder={t('+225 XX XX XX XX XX')} />
                </Form.Item>
                <Text
                  type="secondary"
                  style={{ fontSize: '12px', marginTop: '-12px', display: 'block', marginBottom: '16px' }}
                >
                  {t('Utilisé dans les documents générés (AGENCE_TELEPHONE)')}
                </Text>
              </Col>
            </Row>
          </Card>

          {/* Adresse */}
          <Card title={t('Adresse')} style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col xs={24}>
                <Form.Item label={t('Adresse complète')} name="address">
                  <Input placeholder={t("Adresse complète de l'agence")} />
                </Form.Item>
                <Text
                  type="secondary"
                  style={{ fontSize: '12px', marginTop: '-12px', display: 'block', marginBottom: '16px' }}
                >
                  {t('Utilisé dans les documents générés (AGENCE_ADRESSE)')}
                </Text>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label={t('Ville')} name="city">
                  <Input placeholder={t('Ville')} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label={t('Pays')} name="country">
                  <Input placeholder={t('Pays')} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Informations Supplémentaires */}
          <Card title={t('Informations Supplémentaires')} style={{ marginBottom: 16 }}>
            <Form.Item
              label={t('Site web')}
              name="website"
              rules={[
                {
                  pattern: /^https?:\/\/.+/,
                  message: t('URL invalide (doit commencer par http:// ou https://)')
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
                {saving ? 'Enregistrement...' : t('Enregistrer')}
              </Button>
            </Form.Item>
          </Card>
        </Form>

        {/* Info Box */}
        <Alert
          message={t('Information importante')}
          description={t(
            'Les informations renseignées ici seront utilisées automatiquement dans tous les documents générés (contrats de bail, reçus, etc.). Assurez-vous que les informations sont complètes et à jour.'
          )}
          type="info"
          showIcon
          icon={<SettingOutlined />}
        />
      </Space>
    </>
  );
};
