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
  Tag,
  Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ApartmentOutlined, BankOutlined, EditOutlined, FolderOpenOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { LotTable } from '../../components/syndics/LotTable';
import { DataCard, DataView, MoneyValue, StatCard } from '../../components/primitives';
import { listContacts } from '../../services/crm-service';
import { getSyndicate, listAllChargeCalls, updateSyndicate } from '../../services/syndic-service';
import { CrmContact } from '../../types/crm-types';
import type { Sort } from '../../hooks/useListParams';
import {
  ChargeCall,
  ChargeCallStatus,
  Syndicate,
  SyndicateLot,
  UpdateSyndicateRequest
} from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { formatLotLabel } from '../../utils/syndic-lot-label';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Paragraph, Title } = Typography;

const statusConfig: Record<Syndicate['status'], { color: string; label: string }> = {
  ACTIVE: { color: 'green', label: t('Active') },
  IN_LIQUIDATION: { color: 'orange', label: t('En liquidation') },
  IN_DISPUTE: { color: 'red', label: t('En litige') }
};

/**
 * Étiquettes de statut d'un appel de charges — mêmes clés que
 * `<SyndicFinances>`, pour ne pas dupliquer la traduction sous une forme
 * légèrement différente.
 */
const chargeStatusConfig: Record<ChargeCallStatus, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: t('En attente') },
  PARTIAL: { color: 'blue', label: t('Partiel') },
  PAID: { color: 'green', label: t('Paye') },
  OVERDUE: { color: 'red', label: t('En retard') }
};

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

type LotWithOwner = SyndicateLot & {
  owner?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null;
};

function ownerLabel(
  owner?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null
): string {
  if (!owner) return t('Sans copropriétaire');
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
  return name || owner.email || t('Copropriétaire');
}

function shortReference(id: string): string {
  return `APPEL-${id.slice(0, 8).toUpperCase()}`;
}

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
  fiscalYear?: number;
  syndicManagerId?: string;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

interface ChargeRow {
  id: string;
  reference: string;
  period: string;
  lotLabel: string;
  ownerLabel: string;
  amount: number;
  paid: number;
  outstanding: number;
  dueDate: string;
  status: ChargeCallStatus;
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

function buildChargeRows(charges: ChargeCall[]): ChargeRow[] {
  return charges.map(charge => {
    const lot = charge.lot as LotWithOwner | undefined;
    const paid = (charge.payments || []).reduce((sum, payment) => sum + Number(payment.amount), 0);
    const amount = Number(charge.amount);
    return {
      id: charge.id,
      reference: shortReference(charge.id),
      period: charge.period,
      lotLabel: formatLotLabel(lot, charge.lotId),
      ownerLabel: ownerLabel(lot?.owner),
      amount,
      paid,
      outstanding: Math.max(0, amount - paid),
      dueDate: charge.dueDate,
      status: charge.status
    };
  });
}

export const SyndicDetail: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();

  const [syndicate, setSyndicate] = useState<SyndicateWithProperty | null>(null);
  const [charges, setCharges] = useState<ChargeCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managerOptions, setManagerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm] = Form.useForm<EditSyndicateFormValues>();

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
      const [syndicateData, chargesData] = await Promise.all([
        getSyndicate(effectiveTenantId, syndicId),
        listAllChargeCalls(effectiveTenantId, syndicId)
      ]);
      setSyndicate(syndicateData);
      setCharges(chargesData);
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
      fiscalYear: syndicate.fiscalYear ?? undefined,
      syndicManagerId: syndicate.syndicManagerId ?? undefined
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
        fiscalYear: values.fiscalYear,
        syndicManagerId: values.syndicManagerId || null
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
  const chargeRows = useMemo(() => buildChargeRows(charges), [charges]);

  const buildingsTable = useLocalTable(buildingRows, 10);
  const chargesTable = useLocalTable(chargeRows, 10);

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

  const chargeColumns: ColumnsType<ChargeRow> = [
    { title: t('Référence'), dataIndex: 'reference', key: 'reference' },
    { title: t('Période'), dataIndex: 'period', key: 'period', sorter: true },
    { title: t('Lot'), dataIndex: 'lotLabel', key: 'lotLabel' },
    { title: t('Copropriétaire'), dataIndex: 'ownerLabel', key: 'ownerLabel' },
    {
      title: t('Montant appelé'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'end',
      sorter: true,
      render: (_: number, row) => <MoneyValue value={row.amount} />
    },
    {
      title: t('Payé'),
      dataIndex: 'paid',
      key: 'paid',
      align: 'end',
      sorter: true,
      render: (_: number, row) => <MoneyValue value={row.paid} />
    },
    {
      title: t('Reste'),
      dataIndex: 'outstanding',
      key: 'outstanding',
      align: 'end',
      sorter: true,
      render: (_: number, row) => <MoneyValue value={row.outstanding} />
    },
    {
      title: t('Échéance'),
      dataIndex: 'dueDate',
      key: 'dueDate',
      sorter: true,
      render: (value: string) => dayjs(value).format(dateFormat('short'))
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (value: ChargeCallStatus) => (
        <Tag color={chargeStatusConfig[value].color}>{chargeStatusConfig[value].label}</Tag>
      )
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
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <StatCard
            label={t('Lots')}
            value={syndicate.lots?.length ?? syndicate._count?.lots ?? syndicate.totalLots}
            icon={<FolderOpenOutlined />}
            onClick={() => scrollToSection('fiche-lots')}
          />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            label={t('Bâtiments')}
            value={syndicate.totalBuildings}
            icon={<ApartmentOutlined />}
            onClick={() => scrollToSection('fiche-batiments')}
          />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            label={t('Appels de charges')}
            value={charges.length}
            icon={<BankOutlined />}
            onClick={() => scrollToSection('fiche-appels')}
          />
        </Col>
      </Row>

      <Card
        title={t('Informations générales')}
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
          <Descriptions.Item label={t('Exercice')}>{syndicate.fiscalYear ?? t('Non renseigné')}</Descriptions.Item>
          <Descriptions.Item label={t('Gestionnaire')}>
            {(syndicate.syndicManagerId && managerLabelById[syndicate.syndicManagerId]) || t('Non renseigné')}
          </Descriptions.Item>
          <Descriptions.Item label={t('Nombre de lots déclaré')}>
            {syndicate.lots?.length ?? syndicate._count?.lots ?? syndicate.totalLots}
          </Descriptions.Item>
          <Descriptions.Item label={t('Nombre de bâtiments')}>{syndicate.totalBuildings}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Modal
        title={t('Modifier la copropriété')}
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
          <Form.Item label={t('Exercice')} name="fiscalYear">
            <InputNumber min={1} max={12} style={{ width: '100%' }} />
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
        </Form>
      </Modal>

      <div id="fiche-lots">
        <Card title={t('Résumé des lots')}>
          <LotTable lots={syndicate.lots || []} />
        </Card>
      </div>

      <div id="fiche-batiments">
        <Card title={t('Détail des bâtiments')}>
          <DataView<BuildingRow>
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
        </Card>
      </div>

      <div id="fiche-appels">
        <Card title={t('Détail des appels de charges')}>
          <DataView<ChargeRow>
            items={chargesTable.pageItems}
            total={chargesTable.total}
            page={chargesTable.page}
            pageSize={chargesTable.pageSize}
            onPageChange={chargesTable.onPageChange}
            sort={chargesTable.sort}
            onSortChange={chargesTable.onSortChange}
            loading={loading}
            error={null}
            emptyDescription={t('Aucun appel de charges enregistré pour cette copropriété.')}
            columns={chargeColumns}
            rowKey={row => row.id}
            aria-label={t('Détail des appels de charges')}
            scrollX={1100}
            renderCard={row => (
              <DataCard
                title={`${row.lotLabel} — ${row.ownerLabel}`}
                aria-label={row.reference}
                subtitle={`${row.reference} · ${row.period}`}
                highlight={<MoneyValue value={row.amount} />}
                status={<Tag color={chargeStatusConfig[row.status].color}>{chargeStatusConfig[row.status].label}</Tag>}
                fields={[
                  { label: t('Payé'), value: <MoneyValue value={row.paid} /> },
                  { label: t('Reste'), value: <MoneyValue value={row.outstanding} /> },
                  { label: t('Échéance'), value: dayjs(row.dueDate).format(dateFormat('short')) }
                ]}
              />
            )}
          />
        </Card>
      </div>
    </Space>
  );
};
