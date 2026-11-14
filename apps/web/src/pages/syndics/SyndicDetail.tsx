import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ApartmentOutlined, BankOutlined, EditOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { LotTable } from '../../components/syndics/LotTable';
import { LotTypeRatesCard } from '../../components/syndics/LotTypeRatesCard';
import { useMyMenuAccess } from '../../hooks/useMenuAccess';
import { BrandingImageField } from '../../components/documents/BrandingImageField';
import { DataCard, DataView, StatCard } from '../../components/primitives';
import { ChargeCallsTab } from '../../components/syndics/finances/ChargeCallsTab';
import { useTabParam } from '../../components/syndics/finances/url-params';
import { listContacts } from '../../services/crm-service';
import { getSyndicate, listChargeCallsPage, updateSyndicate } from '../../services/syndic-service';
import {
  fetchSyndicateLogoBlob,
  listMandatingAgencies,
  MandatingAgency,
  removeSyndicateLogo,
  uploadSyndicateLogo
} from '../../services/document-branding-service';
import { CrmContact } from '../../types/crm-types';
import type { Sort } from '../../hooks/useListParams';
import { Syndicate, SyndicateLot, UpdateSyndicateRequest } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';

import { localizedRecord } from '../../i18n/localized';
const { Paragraph, Title } = Typography;

/** Onglets de la fiche, dans l'ordre d'affichage (le premier est le défaut de `?tab=`). */
const DETAIL_TABS = ['lots', 'batiments', 'appels', 'tarifs'] as const;
type DetailTab = (typeof DETAIL_TABS)[number];
const NO_LOTS: SyndicateLot[] = [];

const statusConfig: Record<Syndicate['status'], { color: string; label: string }> = localizedRecord(() => ({
  ACTIVE: { color: 'green', label: t('Active') },
  IN_LIQUIDATION: { color: 'orange', label: t('En liquidation') },
  IN_DISPUTE: { color: 'red', label: t('En litige') }
}));

/**
 * La réponse réelle de `GET .../syndics/:id` porte le bien IMMEUBLE lié au
 * syndic (vérifié par appel direct à l'API) — absent du type `Syndicate`
 * partagé, qui ne le déclarait pas encore.
 */
type SyndicateWithProperty = Syndicate & {
  property?: {
    id: string;
    title?: string | null;
    address?: string | null;
    typeSpecificData?: Record<string, unknown> | null;
  } | null;
};

/**
 * Même construction de libellé que `<SyndicLots>` (nom complet, sinon raison
 * sociale, sinon e-mail) : les deux écrans piochent dans le même annuaire CRM
 * pour représenter un contact, sans dépendre l'un de l'autre.
 */
function buildContactLabel(contact: CrmContact): string {
  const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  if (fullName) {
    return contact.email ? `${fullName} (${contact.email})` : fullName;
  }
  if (contact.legalName) {
    return contact.email ? `${contact.legalName} (${contact.email})` : contact.legalName;
  }
  return contact.email || contact.id;
}

/**
 * Champs modifiables via `PATCH .../syndics/:syndicId`
 * (voir `packages/api/src/lib/syndics/schemas.ts#updateSyndicateSchema`) : les
 * noms de champ du formulaire correspondent déjà à ceux attendus par l'API,
 * donc une erreur de validation retrouve directement son `Form.Item` sans
 * table de correspondance (contrairement à `<SyndicLots>`, où le service web
 * traduit les noms).
 */
interface EditSyndicateFormValues {
  name: string;
  address: string;
  registrationNo?: string;
  cadastralReference?: string;
  totalGeneralShares?: number | null;
  fiscalYear?: number;
  syndicManagerId?: string;
  status?: Syndicate['status'];
  mandatingAgencyId?: string;
}

/** Tri et pagination client d'une liste déjà chargée en mémoire (voir `<SyndicFinances>`). */
function useLocalTable<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort | null>(null);

  useEffect(() => {
    setPage(1);
  }, [items]);

  const sorted = useMemo(() => {
    if (!sort) return items;
    const { field, order } = sort;
    return [...items].sort((a, b) => {
      const av = (a as Record<string, unknown>)[field];
      const bv = (b as Record<string, unknown>)[field];
      if (av === bv) return 0;
      if (av === null || av === undefined) return order === 'asc' ? -1 : 1;
      if (bv === null || bv === undefined) return order === 'asc' ? 1 : -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return order === 'asc' ? av - bv : bv - av;
      }
      const as = String(av);
      const bs = String(bv);
      return order === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [items, sort]);

  const total = sorted.length;
  const pageItems = useMemo(
    () => sorted.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [sorted, page, pageSize]
  );

  return {
    pageItems,
    // Toutes les lignes, triées comme à l'écran : c'est ce que l'export emporte.
    allItems: sorted,
    total,
    page,
    pageSize,
    onPageChange: (nextPage: number) => setPage(nextPage),
    sort,
    onSortChange: (nextSort: Sort | null) => {
      setSort(nextSort);
      setPage(1);
    }
  };
}

interface BuildingRow {
  id: string;
  title: string;
  address: string;
  floors?: number;
  units?: number;
  parkingSpaces?: number;
}

function buildBuildingRows(syndicate: SyndicateWithProperty | null): BuildingRow[] {
  const property = syndicate?.property;
  if (!property) return [];
  const data = property.typeSpecificData || {};
  return [
    {
      id: property.id,
      title: property.title || syndicate?.name || t('Bâtiment'),
      address: property.address || syndicate?.address || '—',
      floors: typeof data.floors_count === 'number' ? data.floors_count : undefined,
      units: typeof data.units_count === 'number' ? data.units_count : undefined,
      parkingSpaces: typeof data.parking_spaces === 'number' ? data.parking_spaces : undefined
    }
  ];
}

export const SyndicDetail: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  // Même logique que SyndicCharges : l'API reste l'autorité (SYNDIC_EDIT pour modifier le barème).
  const { permissions, ready: permissionsReady } = useMyMenuAccess(effectiveTenantId);
  const canEditSyndic = permissionsReady && (permissions === null || permissions.has('SYNDIC_EDIT'));

  const [syndicate, setSyndicate] = useState<SyndicateWithProperty | null>(null);
  // Total des appels de charges (une page d'une ligne suffit) : le détail ne se charge que dans son onglet.
  const [chargeCount, setChargeCount] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useTabParam<DetailTab>(DETAIL_TABS, 'lots');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managerOptions, setManagerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [mandatingAgencies, setMandatingAgencies] = useState<MandatingAgency[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm] = Form.useForm<EditSyndicateFormValues>();
  const [logoVersion, setLogoVersion] = useState(0);

  const managerLabelById = useMemo(() => {
    return managerOptions.reduce<Record<string, string>>((acc, option) => {
      acc[option.value] = option.label;
      return acc;
    }, {});
  }, [managerOptions]);

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres syndic manquants'));
      return;
    }
    void loadAll();
  }, [effectiveTenantId, syndicId]);

  const loadAll = async () => {
    if (!effectiveTenantId || !syndicId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [syndicateData, chargesPage] = await Promise.all([
        getSyndicate(effectiveTenantId, syndicId),
        listChargeCallsPage(effectiveTenantId, syndicId, { page: 1, limit: 1 }).catch(() => null)
      ]);
      setSyndicate(syndicateData);
      setChargeCount(chargesPage ? chargesPage.pagination.total : null);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger la copropriété'));
    } finally {
      setLoading(false);
    }

    // Annuaire CRM pour le champ "Gestionnaire" (syndicManagerId pointe vers
    // un CrmContact, voir prisma schema.prisma#Syndicate). Un échec ici ne
    // doit pas bloquer l'affichage de la fiche : la sélection sera juste vide.
    try {
      const contactsResult = await listContacts(effectiveTenantId, { page: 1, limit: 200 });
      setManagerOptions(
        (contactsResult.contacts || []).map(contact => ({
          value: contact.id,
          label: buildContactLabel(contact)
        }))
      );
    } catch {
      setManagerOptions([]);
    }

    // Idem pour la liste des agences mandantes (sélecteur du formulaire de
    // modification) : un échec laisse simplement la liste vide.
    try {
      setMandatingAgencies(await listMandatingAgencies(effectiveTenantId));
    } catch {
      setMandatingAgencies([]);
    }
  };

  const openEditModal = () => {
    if (!syndicate) {
      return;
    }
    editForm.setFieldsValue({
      name: syndicate.name,
      address: syndicate.address,
      registrationNo: syndicate.registrationNo ?? undefined,
      cadastralReference: syndicate.cadastralReference ?? undefined,
      totalGeneralShares: syndicate.totalGeneralShares ?? undefined,
      fiscalYear: syndicate.fiscalYear ?? undefined,
      syndicManagerId: syndicate.syndicManagerId ?? undefined,
      status: syndicate.status,
      mandatingAgencyId: syndicate.mandatingAgencyId ?? undefined
    });
    setEditOpen(true);
  };

  const closeEditModal = () => {
    setEditOpen(false);
    editForm.resetFields();
  };

  const handleEditSubmit = async () => {
    if (!effectiveTenantId || !syndicId) {
      return;
    }

    const values = await editForm.validateFields();

    setEditSubmitting(true);
    try {
      const payload: UpdateSyndicateRequest = {
        name: values.name,
        address: values.address,
        registrationNo: values.registrationNo || null,
        cadastralReference: values.cadastralReference || null,
        totalGeneralShares: values.totalGeneralShares ?? null,
        fiscalYear: values.fiscalYear,
        syndicManagerId: values.syndicManagerId || null,
        status: values.status,
        mandatingAgencyId: values.mandatingAgencyId || null
      };
      await updateSyndicate(effectiveTenantId, syndicId, payload);
      message.success(t('Copropriété mise à jour'));
      closeEditModal();
      await loadAll();
    } catch (err: any) {
      // Même mécanisme que `<SyndicLots>` : une erreur de validation (400)
      // porte le détail par champ dans `errors[]`, sinon le message générique
      // du serveur (y compris un 403 SUBSCRIPTION_READ_ONLY, déjà notifié en
      // plus par l'intercepteur global d'`apiClient`).
      const fieldErrors: Array<{ field: string; message: string }> | undefined = err.response?.data?.errors;

      if (fieldErrors && fieldErrors.length > 0) {
        fieldErrors.forEach(fieldErr => {
          editForm.setFields([{ name: fieldErr.field as keyof EditSyndicateFormValues, errors: [fieldErr.message] }]);
        });
        message.error(
          t('Formulaire invalide : {{details}}', {
            details: fieldErrors.map(fieldErr => fieldErr.message).join(' ; ')
          })
        );
      } else {
        message.error(err.response?.data?.error || t('Mise à jour impossible'));
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  const buildingRows = useMemo(() => buildBuildingRows(syndicate), [syndicate]);

  const buildingsTable = useLocalTable(buildingRows, 10);

  const buildingColumns: ColumnsType<BuildingRow> = [
    { title: t('Bâtiment'), dataIndex: 'title', key: 'title' },
    { title: t('Adresse'), dataIndex: 'address', key: 'address' },
    { title: t('Étages'), dataIndex: 'floors', key: 'floors', align: 'end', render: value => value ?? '—' },
    { title: t('Unités'), dataIndex: 'units', key: 'units', align: 'end', render: value => value ?? '—' },
    {
      title: t('Places de parking'),
      dataIndex: 'parkingSpaces',
      key: 'parkingSpaces',
      align: 'end',
      render: value => value ?? '—'
    }
  ];

  if (loading) {
    return (
      <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !syndicate) {
    return (
      <Alert
        type="error"
        message={t('Erreur de chargement')}
        description={error || t('Copropriété introuvable')}
        showIcon
      />
    );
  }

  const status = statusConfig[syndicate.status];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space direction="vertical" size={4}>
        <Space>
          <Title level={2} style={{ margin: 0 }}>
            {syndicate.name}
          </Title>
          <Tag color={status.color}>{status.label}</Tag>
        </Space>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {syndicate.address}
        </Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t('Mandant:')} {syndicate.mandatingAgency?.name || t('Identité de l’agence')}
        </Paragraph>
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <StatCard
            helpId="syndic.copropriete.fiche.indicateurs"
            label={t('Lots')}
            value={syndicate.lots?.length ?? syndicate._count?.lots ?? syndicate.totalLots}
            icon={<FolderOpenOutlined />}
            onClick={() => setActiveTab('lots')}
          />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            helpId="syndic.copropriete.fiche.indicateurs"
            label={t('Bâtiments')}
            value={syndicate.totalBuildings}
            icon={<ApartmentOutlined />}
            onClick={() => setActiveTab('batiments')}
          />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            helpId="syndic.copropriete.fiche.indicateurs"
            label={t('Appels de charges')}
            value={chargeCount ?? '—'}
            icon={<BankOutlined />}
            onClick={() => setActiveTab('appels')}
          />
        </Col>
      </Row>

      <Card
        title={<HelpSectionTitle title={t('Informations générales')} helpId="syndic.copropriete.fiche.informations" />}
        extra={
          <Button icon={<EditOutlined />} onClick={openEditModal}>
            {t('Modifier')}
          </Button>
        }
      >
        <Descriptions column={{ xs: 1, md: 2 }} bordered>
          <Descriptions.Item label={t('Nom')}>{syndicate.name}</Descriptions.Item>
          <Descriptions.Item label={t('Statut')}>
            <Tag color={status.color}>{status.label}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('Adresse')}>{syndicate.address}</Descriptions.Item>
          <Descriptions.Item label={t("N° d'immatriculation")}>
            {syndicate.registrationNo || t('Non renseigné')}
          </Descriptions.Item>
          <Descriptions.Item label={t('Référence cadastrale')}>
            {syndicate.cadastralReference || t('Non renseignée')}
          </Descriptions.Item>
          {syndicate.totalGeneralShares != null ? (
            <Descriptions.Item label={t('Total de référence des tantièmes')}>
              {syndicate.totalGeneralShares}
            </Descriptions.Item>
          ) : null}
          <Descriptions.Item label={t('Exercice')}>{syndicate.fiscalYear ?? t('Non renseigné')}</Descriptions.Item>
          <Descriptions.Item label={t('Agence mandante')}>
            {syndicate.mandatingAgency?.name || t('Identité de l’agence')}
          </Descriptions.Item>
          <Descriptions.Item label={t('Gestionnaire')}>
            {(syndicate.syndicManagerId && managerLabelById[syndicate.syndicManagerId]) || t('Non renseigné')}
          </Descriptions.Item>
          <Descriptions.Item label={t('Nombre de lots déclaré')}>
            {syndicate.lots?.length ?? syndicate._count?.lots ?? syndicate.totalLots}
          </Descriptions.Item>
          <Descriptions.Item label={t('Nombre de bâtiments')}>{syndicate.totalBuildings}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={<HelpSectionTitle title={t('Logo de la copropriété')} helpId="syndic.copropriete.fiche.logo" />}>
        <BrandingImageField
          label={t('Logo')}
          hasImage={Boolean(syndicate.hasLogo)}
          imageVersion={logoVersion}
          fetchImage={() => fetchSyndicateLogoBlob(effectiveTenantId!, syndicId!)}
          onUpload={async file => {
            const updated = await uploadSyndicateLogo(effectiveTenantId!, syndicId!, file);
            setSyndicate(prev => (prev ? { ...prev, hasLogo: updated.hasLogo, logoUrl: updated.logoUrl } : prev));
            setLogoVersion(version => version + 1);
          }}
          onRemove={async () => {
            const updated = await removeSyndicateLogo(effectiveTenantId!, syndicId!);
            setSyndicate(prev => (prev ? { ...prev, hasLogo: updated.hasLogo, logoUrl: updated.logoUrl } : prev));
            setLogoVersion(version => version + 1);
          }}
        />
      </Card>

      <Modal
        title={<HelpSectionTitle title={t('Modifier la copropriété')} helpId="syndic.copropriete.fiche.edition" />}
        open={editOpen}
        onCancel={closeEditModal}
        onOk={() => void handleEditSubmit()}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        confirmLoading={editSubmitting}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label={t('Nom')} name="name" rules={[{ required: true, message: t('Le nom est obligatoire') }]}>
            <Input />
          </Form.Item>
          <Form.Item
            label={t('Adresse')}
            name="address"
            rules={[{ required: true, message: t("L'adresse est obligatoire") }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label={t("N° d'immatriculation")} name="registrationNo">
            <Input />
          </Form.Item>
          <Form.Item label={t('Référence cadastrale')} name="cadastralReference">
            <Input />
          </Form.Item>
          <Form.Item
            label={t('Total de référence des tantièmes')}
            name="totalGeneralShares"
            extra={t('Facultatif. Sert à avertir si la somme des tantièmes des lots diffère.')}
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('Exercice')} name="fiscalYear">
            <InputNumber min={1} max={12} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={t('Statut')}
            name="status"
            rules={[{ required: true, message: t('Le statut est obligatoire') }]}
            extra={t(
              'Passer une copropriété « En liquidation » la retire des listes de gestion courante — une alternative à la suppression, elle, définitive.'
            )}
          >
            <Select
              options={(Object.keys(statusConfig) as Array<Syndicate['status']>).map(value => ({
                value,
                label: statusConfig[value].label
              }))}
            />
          </Form.Item>
          <Form.Item label={t('Gestionnaire')} name="syndicManagerId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('Sélectionner un contact CRM')}
              options={managerOptions}
            />
          </Form.Item>
          <Form.Item
            label={t('Agence mandante')}
            name="mandatingAgencyId"
            extra={t(
              'Les documents de cette copropriété porteront le logo, la signature et le cachet du mandant choisi.'
            )}
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('Aucune (identité de l’agence)')}
              options={mandatingAgencies.map(agency => ({ value: agency.id, label: agency.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Une requête par onglet, lancée seulement quand l'onglet est affiché (`destroyOnHidden`). */}
      <Tabs
        activeKey={activeTab}
        onChange={key => setActiveTab(key as DetailTab)}
        destroyOnHidden
        items={[
          {
            key: 'lots',
            label: t('Résumé des lots'),
            children: (
              <LotTable
                lots={syndicate.lots ?? NO_LOTS}
                paramPrefix="lo"
                portalManageHref={`/tenant/${effectiveTenantId}/syndics/${syndicId}/profils-incidents`}
              />
            )
          },
          {
            key: 'batiments',
            label: t('Détail des bâtiments'),
            // Une copropriété compte une poignée de bâtiments : pas de barre de recherche.
            children: (
              <DataView<BuildingRow>
                helpId="syndic.copropriete.fiche.batiments"
                items={buildingsTable.pageItems}
                total={buildingsTable.total}
                page={buildingsTable.page}
                pageSize={buildingsTable.pageSize}
                onPageChange={buildingsTable.onPageChange}
                sort={buildingsTable.sort}
                onSortChange={buildingsTable.onSortChange}
                loading={loading}
                error={null}
                emptyDescription={t('Aucun bâtiment renseigné pour cette copropriété.')}
                columns={buildingColumns}
                rowKey={row => row.id}
                aria-label={t('Détail des bâtiments')}
                export={{ filename: t('Détail des bâtiments'), fetchAll: async () => buildingsTable.allItems }}
                renderCard={row => (
                  <DataCard
                    title={row.title}
                    aria-label={row.title}
                    subtitle={row.address}
                    fields={[
                      { label: t('Étages'), value: row.floors ?? '—' },
                      { label: t('Unités'), value: row.units ?? '—' },
                      { label: t('Places de parking'), value: row.parkingSpaces ?? '—' }
                    ]}
                  />
                )}
              />
            )
          },
          {
            key: 'appels',
            label: t('Détail des appels de charges'),
            children:
              effectiveTenantId && syndicId ? <ChargeCallsTab tenantId={effectiveTenantId} syndicId={syndicId} /> : null
          },
          {
            key: 'tarifs',
            label: t('Barème par type de lot'),
            children:
              effectiveTenantId && syndicId ? (
                <LotTypeRatesCard tenantId={effectiveTenantId} syndicId={syndicId} canEdit={canEditSyndic} />
              ) : null
          }
        ]}
      />
    </Space>
  );
};
