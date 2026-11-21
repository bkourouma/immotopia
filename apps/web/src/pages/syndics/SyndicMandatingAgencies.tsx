import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Alert, Button, Drawer, Form, Input, Space, Spin, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';
import { useFormFieldModes } from '../../hooks/useFormFieldModes';
import { PageHeader, StateBlock, Table, useConfirmAction } from '../../components/primitives';
import { BrandingImageField } from '../../components/documents/BrandingImageField';
import {
  createMandatingAgency,
  type CreateMandatingAgencyRequest,
  deleteMandatingAgency,
  fetchMandantImageBlob,
  listMandatingAgencies,
  MandatingAgency,
  MandantImageKind,
  removeMandantImage,
  updateMandatingAgency,
  uploadMandantImage
} from '../../services/document-branding-service';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';

const { Text } = Typography;

// Accesseurs stables (hors du composant) : le filtrage reste mémoïsé.
const TEXTE_RECHERCHE = [
  (agency: MandatingAgency) => agency.name,
  (agency: MandatingAgency) => agency.legalName,
  (agency: MandatingAgency) => agency.address,
  (agency: MandatingAgency) => agency.email,
  (agency: MandatingAgency) => agency.phone,
  (agency: MandatingAgency) => agency.rccm,
  (agency: MandatingAgency) => agency.taxId
];
const ACCESSEURS = {
  copro: (agency: MandatingAgency) => agency.syndicateCount > 0,
  logo: (agency: MandatingAgency) => agency.hasLogo
};

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
  const fm = useFormFieldModes('syndic.agence-mandante');
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
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    // Un champ masqué par l'agence n'est pas envoyé : la valeur enregistrée reste inchangée.
    const payload: CreateMandatingAgencyRequest = { name: values.name };
    if (fm.isVisible('legalName')) payload.legalName = values.legalName || null;
    if (fm.isVisible('address')) payload.address = values.address || null;
    if (fm.isVisible('phone')) payload.phone = values.phone || null;
    if (fm.isVisible('email')) payload.email = values.email || '';
    if (fm.isVisible('rccm')) payload.rccm = values.rccm || null;
    if (fm.isVisible('taxId')) payload.taxId = values.taxId || null;

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
        message.success(
          t('Agence mandante créée. Vous pouvez maintenant ajouter son logo, sa signature et son cachet.')
        );
      }
      await loadAgencies();
    } catch (err: any) {
      const fieldErrors: Array<{ field: string; message: string }> | undefined = err.response?.data?.errors;
      if (fieldErrors && fieldErrors.length > 0) {
        form.setFields(
          fieldErrors.map(fe => ({ name: fe.field as keyof MandatingAgencyFormValues, errors: [fe.message] }))
        );
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
      title: t('Supprimer l’agence mandante « {{name}} » ?', { name: agency.name }),
      description: t('Cette action est définitive. Ses copropriétés doivent être détachées au préalable.'),
      okText: t('Supprimer'),
      danger: true,
      cancelText: t('Annuler'),
      onConfirm: async () => {
        setDeletingId(agency.id);
        try {
          await deleteMandatingAgency(effectiveTenantId, agency.id);
          message.success(t('Agence mandante « {{name}} » supprimée', { name: agency.name }));
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

  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Nom, raison sociale, adresse, e-mail, téléphone, RCCM…')
    },
    {
      key: 'copro',
      type: 'boolean',
      label: t('Copropriétés gérées'),
      primary: true,
      tristate: true,
      trueLabel: t('Avec copropriétés'),
      falseLabel: t('Sans copropriété')
    },
    {
      key: 'logo',
      type: 'boolean',
      label: t('Logo'),
      tristate: true,
      trueLabel: t('Avec logo'),
      falseLabel: t('Sans logo')
    }
  ];

  const local = useLocalListSearch<MandatingAgency>(items, {
    ariaLabel: t('Rechercher une agence mandante'),
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  const columns: ColumnsType<MandatingAgency> = useMemo(
    () => [
      {
        title: t('Logo'),
        key: 'logo',
        // Vignette : rien à exporter.
        exportable: false,
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
        exportValue: (agency: MandatingAgency) => [agency.phone, agency.email].filter(Boolean).join(' — '),
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
            {agency.syndicateCount > 0 ? (
              // Un bouton désactivé ne déclenche pas le survol : le span porte l'infobulle.
              <Tooltip title={t("Détachez d'abord ses copropriétés pour pouvoir le supprimer.")}>
                <span tabIndex={0} data-testid={`mandant-delete-blocked-${agency.id}`}>
                  <Button size="small" danger disabled style={{ pointerEvents: 'none' }}>
                    {t('Supprimer')}
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button size="small" danger loading={deletingId === agency.id} onClick={() => handleDelete(agency)}>
                {t('Supprimer')}
              </Button>
            )}
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
        <PageHeader
          title={t('Agences mandantes')}
          subtitle={t(
            'Agences pour le compte desquelles ce cabinet gère des copropriétés. Les documents portent leur logo, leur signature et leur cachet.'
          )}
          primaryAction={{ label: t('Nouvelle agence mandante'), icon: <PlusOutlined />, onClick: openCreateDrawer }}
        />

        {error ? (
          <Alert
            type="error"
            message={error}
            showIcon
            action={
              <Button size="small" onClick={() => void loadAgencies()}>
                {t('Réessayer')}
              </Button>
            }
          />
        ) : null}

        {loading ? (
          <div style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : items.length === 0 ? (
          <StateBlock
            variant="empty"
            title={t('Aucune agence mandante enregistrée')}
            description={t(
              'Ajoutez une agence mandante pour que les documents de ses copropriétés portent son logo, sa signature et son cachet.'
            )}
            actions={[{ label: t('Ajouter une agence mandante'), onClick: openCreateDrawer, primary: true }]}
          />
        ) : (
          <Table<MandatingAgency>
            {...local.tableProps}
            helpId="syndic.mandants.tableau"
            aria-label={t('Agences mandantes')}
            exportFilename={t('Agences mandantes')}
            exportFetchAll={local.exportAll}
            rowKey="id"
            columns={columns}
          />
        )}
      </Space>

      <Drawer
        title={
          <HelpSectionTitle
            title={editingAgency ? t('Modifier l’agence mandante') : t('Nouvelle agence mandante')}
            helpId="syndic.mandants.edition"
          />
        }
        open={drawerOpen}
        onClose={closeDrawer}
        width="min(480px, 100vw)"
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
          <Form.Item label={t('Nom')} name="name" rules={[{ required: true, message: t('Le nom est obligatoire') }]}>
            <Input autoFocus />
          </Form.Item>
          {fm.isVisible('legalName') && (
            <Form.Item
              label={t('Dénomination légale')}
              name="legalName"
              rules={[
                {
                  required: fm.isRequired('legalName', false),
                  whitespace: fm.isRequired('legalName', false),
                  message: t('Ce champ est obligatoire')
                }
              ]}
            >
              <Input />
            </Form.Item>
          )}
          {fm.isVisible('address') && (
            <Form.Item
              label={t('Adresse')}
              name="address"
              rules={[
                {
                  required: fm.isRequired('address', false),
                  whitespace: fm.isRequired('address', false),
                  message: t('Ce champ est obligatoire')
                }
              ]}
            >
              <Input.TextArea rows={2} />
            </Form.Item>
          )}
          {fm.isVisible('phone') && (
            <Form.Item
              label={t('Téléphone')}
              name="phone"
              rules={[
                {
                  required: fm.isRequired('phone', false),
                  whitespace: fm.isRequired('phone', false),
                  message: t('Ce champ est obligatoire')
                }
              ]}
            >
              <Input />
            </Form.Item>
          )}
          {fm.isVisible('email') && (
            <Form.Item
              label={t('E-mail')}
              name="email"
              rules={[
                {
                  required: fm.isRequired('email', false),
                  whitespace: fm.isRequired('email', false),
                  message: t('Ce champ est obligatoire')
                },
                { type: 'email', message: t('Adresse e-mail invalide') }
              ]}
            >
              <Input />
            </Form.Item>
          )}
          {fm.isVisible('rccm') && (
            <Form.Item
              label={t('RCCM')}
              name="rccm"
              rules={[
                {
                  required: fm.isRequired('rccm', false),
                  whitespace: fm.isRequired('rccm', false),
                  message: t('Ce champ est obligatoire')
                }
              ]}
            >
              <Input />
            </Form.Item>
          )}
          {fm.isVisible('taxId') && (
            <Form.Item
              label={t('NIF')}
              name="taxId"
              rules={[
                {
                  required: fm.isRequired('taxId', false),
                  whitespace: fm.isRequired('taxId', false),
                  message: t('Ce champ est obligatoire')
                }
              ]}
            >
              <Input />
            </Form.Item>
          )}
        </Form>

        {editingAgency ? (
          <Space direction="vertical" size="large" style={{ width: '100%', marginTop: 24 }}>
            <Text strong>{t('Images pour les documents')}</Text>
            {fm.isVisible('logo') && (
              <BrandingImageField
                label={t('Logo')}
                hasImage={editingAgency.hasLogo}
                imageVersion={imageVersion}
                fetchImage={() => fetchMandantImageBlob(effectiveTenantId!, editingAgency.id, 'logo')}
                onUpload={file => handleImageUpload('logo', file)}
                onRemove={() => handleImageRemove('logo')}
              />
            )}
            {fm.isVisible('signature') && (
              <BrandingImageField
                label={t('Signature')}
                hasImage={editingAgency.hasSignature}
                imageVersion={imageVersion}
                fetchImage={() => fetchMandantImageBlob(effectiveTenantId!, editingAgency.id, 'signature')}
                onUpload={file => handleImageUpload('signature', file)}
                onRemove={() => handleImageRemove('signature')}
              />
            )}
            {fm.isVisible('stamp') && (
              <BrandingImageField
                label={t('Cachet')}
                hasImage={editingAgency.hasStamp}
                imageVersion={imageVersion}
                fetchImage={() => fetchMandantImageBlob(effectiveTenantId!, editingAgency.id, 'stamp')}
                onUpload={file => handleImageUpload('stamp', file)}
                onRemove={() => handleImageRemove('stamp')}
              />
            )}
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
