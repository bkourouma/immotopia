import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Alert, Button, Drawer, Empty, Form, Input, Space, Spin, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';
import { useConfirmAction } from '../../components/primitives';
import { BrandingImageField } from '../../components/documents/BrandingImageField';
import {
  createMandatingAgency,
  deleteMandatingAgency,
  fetchMandantImageBlob,
  listMandatingAgencies,
  MandatingAgency,
  MandantImageKind,
  removeMandantImage,
  updateMandatingAgency,
  uploadMandantImage
} from '../../services/document-branding-service';
import { t } from '../../i18n/t';

const { Paragraph, Text, Title } = Typography;

interface MandatingAgencyFormValues {
  name: string;
  legalName?: string;
  address?: string;
  phone?: string;
  email?: string;
  rccm?: string;
  taxId?: string;
}

/**
 * Page « Agences mandantes » (lot S1, besoin 7) : un cabinet de syndic
 * (un seul tenant) gère des copropriétés pour le compte d'agences clientes.
 * Chaque mandant porte son logo, sa signature et son cachet, utilisés sur les
 * documents des copropriétés qui lui sont rattachées.
 *
 * Les images ne peuvent être envoyées qu'une fois le mandant créé (elles
 * pointent vers son identifiant) : le tiroir de création se limite aux
 * coordonnées, puis bascule en mode édition (mêmes champs + images) dès que
 * la création réussit, sans se refermer.
 */
export const SyndicMandatingAgencies: React.FC = () => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [items, setItems] = useState<MandatingAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingAgency, setEditingAgency] = useState<MandatingAgency | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [imageVersion, setImageVersion] = useState(0);
  const [form] = Form.useForm<MandatingAgencyFormValues>();

  useEffect(() => {
    if (!effectiveTenantId) {
      setLoading(false);
      setError(t('Tenant introuvable'));
      return;
    }
    void loadAgencies();
  }, [effectiveTenantId]);

  const loadAgencies = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listMandatingAgencies(effectiveTenantId));
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || t('Erreur lors du chargement'));
    } finally {
      setLoading(false);
    }
  };

  const openCreateDrawer = () => {
    setEditingAgency(null);
    form.resetFields();
    setDrawerOpen(true);
  };

  const openEditDrawer = (agency: MandatingAgency) => {
    setEditingAgency(agency);
    form.setFieldsValue({
      name: agency.name,
      legalName: agency.legalName ?? undefined,
      address: agency.address ?? undefined,
      phone: agency.phone ?? undefined,
      email: agency.email ?? undefined,
      rccm: agency.rccm ?? undefined,
      taxId: agency.taxId ?? undefined
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingAgency(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    if (!effectiveTenantId) return;
    const values = await form.validateFields();
    const payload = {
      name: values.name,
      legalName: values.legalName || null,
      address: values.address || null,
      phone: values.phone || null,
      email: values.email || '',
      rccm: values.rccm || null,
      taxId: values.taxId || null
    };

    setSubmitting(true);
    try {
      if (editingAgency) {
        const updated = await updateMandatingAgency(effectiveTenantId, editingAgency.id, payload);
        setEditingAgency(updated);
        message.success(t('Agence mandante mise à jour'));
      } else {
        const created = await createMandatingAgency(effectiveTenantId, payload);
        // Reste ouvert, bascule en édition : les images ne peuvent être
        // envoyées qu'une fois le mandant créé (elles pointent vers son id).
        setEditingAgency(created);
        message.success(t('Agence mandante créée. Vous pouvez maintenant ajouter son logo, sa signature et son cachet.'));
      }
      await loadAgencies();
    } catch (err: any) {
      const fieldErrors: Array<{ field: string; message: string }> | undefined = err.response?.data?.errors;
      if (fieldErrors && fieldErrors.length > 0) {
        form.setFields(fieldErrors.map(fe => ({ name: fe.field as keyof MandatingAgencyFormValues, errors: [fe.message] })));
      } else if (err.response?.status === 409) {
        message.error(err.response?.data?.error || t('Une agence mandante porte déjà ce nom.'));
      } else {
        message.error(err.response?.data?.message || err.response?.data?.error || t('Enregistrement impossible'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (agency: MandatingAgency) => {
    if (!effectiveTenantId) return;
    confirmAction({
      title: t('Supprimer cette agence mandante ?'),
      description: t('Cette action est définitive. Ses copropriétés doivent être détachées au préalable.'),
      okText: t('Supprimer'),
      danger: true,
      cancelText: t('Annuler'),
      onConfirm: async () => {
        setDeletingId(agency.id);
        try {
          await deleteMandatingAgency(effectiveTenantId, agency.id);
          message.success(t('Agence mandante supprimée'));
          await loadAgencies();
        } catch (err: any) {
          message.error(
            err.response?.data?.error ||
              err.response?.data?.message ||
              t('Suppression impossible : une copropriété est peut-être encore rattachée.')
          );
        } finally {
          setDeletingId(null);
        }
      }
    });
  };

  const handleImageUpload = async (kind: MandantImageKind, file: File) => {
    if (!effectiveTenantId || !editingAgency) return;
    const updated = await uploadMandantImage(effectiveTenantId, editingAgency.id, kind, file);
    setEditingAgency(updated);
    setImageVersion(version => version + 1);
    setItems(prev => prev.map(item => (item.id === updated.id ? updated : item)));
  };

  const handleImageRemove = async (kind: MandantImageKind) => {
    if (!effectiveTenantId || !editingAgency) return;
    const updated = await removeMandantImage(effectiveTenantId, editingAgency.id, kind);
    setEditingAgency(updated);
    setImageVersion(version => version + 1);
    setItems(prev => prev.map(item => (item.id === updated.id ? updated : item)));
  };

  const columns: ColumnsType<MandatingAgency> = useMemo(
    () => [
      {
        title: t('Logo'),
        key: 'logo',
        width: 64,
        render: (_: unknown, agency) =>
          agency.hasLogo ? (
            <MandantLogoThumbnail tenantId={effectiveTenantId || ''} agency={agency} />
          ) : (
            <Text type="secondary">—</Text>
          )
      },
      { title: t('Nom'), dataIndex: 'name', key: 'name' },
      {
        title: t('Coordonnées'),
        key: 'contact',
        render: (_: unknown, agency) => (
          <Space direction="vertical" size={0}>
            {agency.phone ? <Text>{agency.phone}</Text> : null}
            {agency.email ? <Text type="secondary">{agency.email}</Text> : null}
            {!agency.phone && !agency.email ? <Text type="secondary">{t('Non renseignées')}</Text> : null}
          </Space>
        )
      },
      {
        title: t('Copropriétés'),
        dataIndex: 'syndicateCount',
        key: 'syndicateCount',
        align: 'end'
      },
      {
        title: t('Actions'),
        key: 'actions',
        align: 'end',
        render: (_: unknown, agency) => (
          <Space>
            <Button size="small" onClick={() => openEditDrawer(agency)}>
              {t('Modifier')}
            </Button>
            <Button
              size="small"
              danger
              loading={deletingId === agency.id}
              disabled={agency.syndicateCount > 0}
              onClick={() => handleDelete(agency)}
            >
              {t('Supprimer')}
            </Button>
          </Space>
        )
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deletingId, effectiveTenantId]
  );

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <Title level={2} style={{ marginBottom: 8 }}>
              {t('Agences mandantes')}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t(
                'Agences pour le compte desquelles ce cabinet gère des copropriétés. Les documents portent leur logo, leur signature et leur cachet.'
              )}
            </Paragraph>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
            {t('Nouvelle agence mandante')}
          </Button>
        </div>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {loading ? (
          <div style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : items.length === 0 ? (
          <Empty description={t('Aucune agence mandante enregistrée')} />
        ) : (
          <Table<MandatingAgency> rowKey="id" columns={columns} dataSource={items} pagination={false} />
        )}
      </Space>

      <Drawer
        title={editingAgency ? t('Modifier l’agence mandante') : t('Nouvelle agence mandante')}
        open={drawerOpen}
        onClose={closeDrawer}
        width={480}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={closeDrawer}>{t('Fermer')}</Button>
            <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
              {t('Enregistrer')}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label={t('Nom')} name="name" rules={[{ required: true, message: t("Le nom est obligatoire") }]}>
            <Input />
          </Form.Item>
          <Form.Item label={t('Dénomination légale')} name="legalName">
            <Input />
          </Form.Item>
          <Form.Item label={t('Adresse')} name="address">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label={t('Téléphone')} name="phone">
            <Input />
          </Form.Item>
          <Form.Item
            label={t('E-mail')}
            name="email"
            rules={[{ type: 'email', message: t('Adresse e-mail invalide') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label={t('RCCM')} name="rccm">
            <Input />
          </Form.Item>
          <Form.Item label={t('NIF')} name="taxId">
            <Input />
          </Form.Item>
        </Form>

        {editingAgency ? (
          <Space direction="vertical" size="large" style={{ width: '100%', marginTop: 24 }}>
            <Text strong>{t('Images pour les documents')}</Text>
            <BrandingImageField
              label={t('Logo')}
              hasImage={editingAgency.hasLogo}
              imageVersion={imageVersion}
              fetchImage={() => fetchMandantImageBlob(effectiveTenantId!, editingAgency.id, 'logo')}
              onUpload={file => handleImageUpload('logo', file)}
              onRemove={() => handleImageRemove('logo')}
            />
            <BrandingImageField
              label={t('Signature')}
              hasImage={editingAgency.hasSignature}
              imageVersion={imageVersion}
              fetchImage={() => fetchMandantImageBlob(effectiveTenantId!, editingAgency.id, 'signature')}
              onUpload={file => handleImageUpload('signature', file)}
              onRemove={() => handleImageRemove('signature')}
            />
            <BrandingImageField
              label={t('Cachet')}
              hasImage={editingAgency.hasStamp}
              imageVersion={imageVersion}
              fetchImage={() => fetchMandantImageBlob(effectiveTenantId!, editingAgency.id, 'stamp')}
              onUpload={file => handleImageUpload('stamp', file)}
              onRemove={() => handleImageRemove('stamp')}
            />
          </Space>
        ) : (
          <Alert
            style={{ marginTop: 24 }}
            type="info"
            showIcon
            message={t('Enregistrez d’abord les coordonnées pour pouvoir ajouter le logo, la signature et le cachet.')}
          />
        )}
      </Drawer>
    </>
  );
};

/** Vignette de logo dans la colonne du tableau : image privée, chargée en blob. */
const MandantLogoThumbnail: React.FC<{ tenantId: string; agency: MandatingAgency }> = ({ tenantId, agency }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    fetchMandantImageBlob(tenantId, agency.id, 'logo')
      .then(blob => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setObjectUrl(null);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [tenantId, agency.id, agency.hasLogo]);

  if (!objectUrl) return <Text type="secondary">—</Text>;
  return <img src={objectUrl} alt={agency.name} style={{ width: 32, height: 32, objectFit: 'contain' }} />;
};

export default SyndicMandatingAgencies;
