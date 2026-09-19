import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Spin,
  Statistic,
  Typography
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { LotTable } from '../../components/syndics/LotTable';
import { listContacts } from '../../services/crm-service';
import { listProperties } from '../../services/property-service';
import {
  addLotTenantAssignment,
  createSyndicateLot,
  getSyndicate,
  importSyndicateLotsFromProperties,
  listSyndicateLots,
  updateSyndicateLot
} from '../../services/syndic-service';
import { CrmContact } from '../../types/crm-types';
import { Property } from '../../types/property-types';
import {
  CreateSyndicateLotRequest,
  LotType,
  Syndicate,
  SyndicateLot,
  UpdateSyndicateLotRequest
} from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';

const { Paragraph, Title } = Typography;

const lotTypeOptions: Array<{ label: string; value: LotType }> = [
  { label: 'Appartement', value: 'APARTMENT' },
  { label: 'Parking', value: 'PARKING' },
  { label: 'Cave', value: 'CELLAR' },
  { label: 'Bureau', value: 'OFFICE' },
  { label: 'Commerce', value: 'COMMERCIAL' },
  { label: 'Autre', value: 'OTHER' }
];

type PropertySelectOption = {
  value: string;
  label: string;
  inferredLotType: LotType;
  inferredLotNumber: string;
  ownerEmail?: string;
};

type OwnerSelectOption = {
  value: string;
  label: string;
  email?: string;
};

type PropertyLabelSource = {
  id: string;
  internalReference?: string | null;
  title?: string | null;
  owner?: { fullName?: string | null } | null;
  containerParent?: { title?: string | null } | null;
};

function buildPropertyNomenclatureLabel(property: PropertyLabelSource): string {
  const ownerLabel = property.owner?.fullName?.trim() || '';
  const title = property.title?.trim() || property.internalReference || property.id || 'Sans libellé';
  const buildingPart = property.containerParent?.title ? ` ( ${property.containerParent.title} )` : '';
  const titleWithBuilding = title + buildingPart;
  return ownerLabel ? `${ownerLabel} - ${titleWithBuilding}` : titleWithBuilding;
}

function inferLotTypeFromProperty(property: Property): LotType {
  switch (property.propertyType) {
    case 'APPARTEMENT':
    case 'STUDIO':
    case 'DUPLEX_TRIPLEX':
    case 'CHAMBRE_COLOCATION':
    case 'MAISON_VILLA':
    case 'LOT_PROGRAMME_NEUF':
      return 'APARTMENT';
    case 'PARKING_BOX':
      return 'PARKING';
    case 'BUREAU':
      return 'OFFICE';
    case 'BOUTIQUE_COMMERCIAL':
      return 'COMMERCIAL';
    default:
      return 'OTHER';
  }
}

function inferLotNumberFromProperty(property: Property): string {
  return property.internalReference || property.title || property.id;
}

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

export const SyndicLots: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [syndicate, setSyndicate] = useState<Syndicate | null>(null);
  const [lots, setLots] = useState<SyndicateLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingLot, setEditingLot] = useState<SyndicateLot | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [tenantOpen, setTenantOpen] = useState(false);
  const [tenantSubmitting, setTenantSubmitting] = useState(false);
  const [tenantLot, setTenantLot] = useState<SyndicateLot | null>(null);
  const [allPropertyOptions, setAllPropertyOptions] = useState<PropertySelectOption[]>([]);
  const [lotPropertyOptions, setLotPropertyOptions] = useState<PropertySelectOption[]>([]);
  const [importPropertyOptions, setImportPropertyOptions] = useState<PropertySelectOption[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<OwnerSelectOption[]>([]);
  const [referenceWarning, setReferenceWarning] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [importForm] = Form.useForm<{ propertyIds: string[] }>();
  const [tenantForm] = Form.useForm<{
    tenantId: string;
    startDate: dayjs.Dayjs;
    endDate?: dayjs.Dayjs;
    leaseId?: string;
    notes?: string;
  }>();

  const ownerByEmail = useMemo(() => {
    const map = new Map<string, string>();
    ownerOptions.forEach(owner => {
      if (owner.email) {
        map.set(owner.email.trim().toLowerCase(), owner.value);
      }
    });
    return map;
  }, [ownerOptions]);

  const propertyLabelById = useMemo(() => {
    const labelById = allPropertyOptions.reduce<Record<string, string>>((acc, option) => {
      acc[option.value] = option.label;
      return acc;
    }, {});

    // Ensure imported lots keep a readable property label even if the property is
    // not present in the local property options payload.
    lots.forEach(lot => {
      const property = lot.property;
      if (!property?.id || labelById[property.id]) {
        return;
      }

      labelById[property.id] = buildPropertyNomenclatureLabel(property);
    });

    return labelById;
  }, [allPropertyOptions, lots]);

  const ownerLabelById = useMemo(() => {
    return ownerOptions.reduce<Record<string, string>>((acc, option) => {
      acc[option.value] = option.label;
      return acc;
    }, {});
  }, [ownerOptions]);

  const ownerLabelByEmail = useMemo(() => {
    return ownerOptions.reduce<Record<string, string>>((acc, option) => {
      if (option.email) {
        acc[option.email.trim().toLowerCase()] = option.label;
      }
      return acc;
    }, {});
  }, [ownerOptions]);

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError('Paramètres lots manquants');
      return;
    }
    void loadData();
  }, [effectiveTenantId, syndicId]);

  useEffect(() => {
    if (searchParams.get('openImport') !== 'true') {
      return;
    }

    setImportOpen(true);
    importForm.resetFields();

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('openImport');
    setSearchParams(nextParams, { replace: true });
  }, [importForm, searchParams, setSearchParams]);

  const loadData = async () => {
    if (!effectiveTenantId || !syndicId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [syndicateData, lotData] = await Promise.all([
        getSyndicate(effectiveTenantId, syndicId),
        listSyndicateLots(effectiveTenantId, syndicId)
      ]);
      setSyndicate(syndicateData);
      setLots(lotData);
      await loadReferenceData(effectiveTenantId);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Impossible de charger les lots');
    } finally {
      setLoading(false);
    }
  };

  const loadReferenceData = async (tenantId: string) => {
    const [propertiesResult, contactsResult] = await Promise.allSettled([
      listProperties(tenantId, { page: 1, limit: 200 }),
      listContacts(tenantId, { page: 1, limit: 200 })
    ]);

    const warnings: string[] = [];

    if (propertiesResult.status === 'fulfilled') {
      const properties = propertiesResult.value.properties.filter(property => property.ownershipType !== 'PUBLIC');
      const selectableProperties = properties.map(property => ({
        value: property.id,
        label: buildPropertyNomenclatureLabel(property),
        inferredLotType: inferLotTypeFromProperty(property),
        inferredLotNumber: inferLotNumberFromProperty(property),
        ownerEmail: property.owner?.email || undefined
      }));

      // Full lookup used for table labels and fallback displays.
      setAllPropertyOptions(selectableProperties);

      // Manual lot creation: hide sub-properties and parent buildings.
      setLotPropertyOptions(
        properties
          .filter(property => !property.containerParent && property.propertyType !== 'IMMEUBLE')
          .map(property => ({
            value: property.id,
            label: buildPropertyNomenclatureLabel(property),
            inferredLotType: inferLotTypeFromProperty(property),
            inferredLotNumber: inferLotNumberFromProperty(property),
            ownerEmail: property.owner?.email || undefined
          }))
      );

      // Import modal: only top-level properties (building or autonomous properties).
      setImportPropertyOptions(
        properties
          .filter(property => !property.containerParent)
          .map(property => ({
            value: property.id,
            label: buildPropertyNomenclatureLabel(property),
            inferredLotType: inferLotTypeFromProperty(property),
            inferredLotNumber: inferLotNumberFromProperty(property),
            ownerEmail: property.owner?.email || undefined
          }))
      );
    } else {
      setAllPropertyOptions([]);
      setLotPropertyOptions([]);
      setImportPropertyOptions([]);
      warnings.push('Liste des biens indisponible');
    }

    if (contactsResult.status === 'fulfilled') {
      const contacts = contactsResult.value.contacts || [];

      setOwnerOptions(
        contacts.map(contact => ({
          value: contact.id,
          label: buildContactLabel(contact),
          email: contact.email || undefined
        }))
      );
    } else {
      setOwnerOptions([]);
      warnings.push('Liste des contacts CRM indisponible');
    }

    setReferenceWarning(warnings.length > 0 ? warnings.join(' - ') : null);
  };

  const resetModalState = () => {
    setOpen(false);
    setEditingLot(null);
    form.resetFields();
  };

  const openCreateModal = () => {
    setEditingLot(null);
    form.resetFields();
    form.setFieldsValue({ lotType: 'APARTMENT' });
    setOpen(true);
  };

  const openImportModal = () => {
    importForm.resetFields();
    setImportOpen(true);
  };

  const openTenantModal = (lot: SyndicateLot) => {
    setTenantLot(lot);
    tenantForm.resetFields();
    tenantForm.setFieldsValue({
      startDate: dayjs()
    });
    setTenantOpen(true);
  };

  const openEditModal = (lot: SyndicateLot) => {
    setEditingLot(lot);
    form.setFieldsValue({
      lotNumber: lot.lotNumber,
      lotType: lot.lotType,
      generalShares: lot.generalShares,
      specialShares: lot.specialShares ?? undefined,
      propertyId: lot.propertyId ?? undefined,
      ownerContactId: lot.ownerContactId ?? undefined,
      ownerSince: lot.ownerSince ? dayjs(lot.ownerSince) : null
    });
    setOpen(true);
  };

  const handlePropertyChange = (propertyId?: string) => {
    if (!propertyId) {
      return;
    }

    const selectedProperty = lotPropertyOptions.find(option => option.value === propertyId);
    if (!selectedProperty) {
      return;
    }

    const ownerContactId = selectedProperty.ownerEmail
      ? ownerByEmail.get(selectedProperty.ownerEmail.trim().toLowerCase())
      : undefined;
    const currentLotNumber = form.getFieldValue('lotNumber');

    form.setFieldsValue({
      lotType: selectedProperty.inferredLotType,
      lotNumber: currentLotNumber || selectedProperty.inferredLotNumber,
      ownerContactId: ownerContactId || undefined
    });
  };

  const handleSubmitLot = async () => {
    if (!effectiveTenantId || !syndicId) {
      return;
    }

    const values = await form.validateFields();
    const payload = {
      ...values,
      ownerSince: values.ownerSince ? values.ownerSince.toISOString() : undefined
    };

    setSubmitting(true);
    try {
      if (editingLot) {
        const updatePayload: UpdateSyndicateLotRequest = {
          ...payload,
          propertyId: values.propertyId || null,
          ownerContactId: values.ownerContactId || null,
          ownerSince: values.ownerSince ? values.ownerSince.toISOString() : null,
          specialShares: values.specialShares ?? null
        };
        await updateSyndicateLot(effectiveTenantId, syndicId, editingLot.id, updatePayload);
        message.success('Lot mis à jour');
      } else {
        await createSyndicateLot(effectiveTenantId, syndicId, payload as CreateSyndicateLotRequest);
        message.success('Lot créé');
      }
      resetModalState();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Enregistrement du lot impossible');
    } finally {
      setSubmitting(false);
    }
  };

  const handleImportLots = async () => {
    if (!effectiveTenantId || !syndicId) {
      return;
    }

    const values = await importForm.validateFields();
    const selectedPropertyIds = values.propertyIds || [];
    if (selectedPropertyIds.length === 0) {
      message.warning('Sélectionnez au moins une propriété');
      return;
    }

    setImportSubmitting(true);
    try {
      const result = await importSyndicateLotsFromProperties(effectiveTenantId, syndicId, selectedPropertyIds);
      const createdCount = result.created?.length || 0;
      const skippedCount = result.skipped?.length || 0;

      if (createdCount > 0) {
        message.success(`${createdCount} lot(s) importé(s) avec succès`);
      } else {
        message.info(result.message || 'Aucun lot créé');
      }

      if (skippedCount > 0) {
        const skippedReasons = result.skipped
          .slice(0, 3)
          .map(item => item.reason)
          .join(' | ');
        message.warning(`${skippedCount} lot(s) ignoré(s). ${skippedReasons}`);
      }

      setImportOpen(false);
      importForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Import des lots impossible');
    } finally {
      setImportSubmitting(false);
    }
  };

  const handleAssignTenant = async () => {
    if (!effectiveTenantId || !syndicId || !tenantLot) {
      return;
    }

    const values = await tenantForm.validateFields();
    setTenantSubmitting(true);
    try {
      await addLotTenantAssignment(effectiveTenantId, syndicId, tenantLot.id, {
        tenantId: values.tenantId,
        startDate: values.startDate.toISOString(),
        endDate: values.endDate ? values.endDate.toISOString() : undefined,
        leaseId: values.leaseId || undefined,
        notes: values.notes || undefined
      });
      message.success('Locataire assigné au lot');
      setTenantOpen(false);
      setTenantLot(null);
      tenantForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Assignation du locataire impossible');
    } finally {
      setTenantSubmitting(false);
    }
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicId}`)}
            >
              Retour à la fiche syndic
            </Button>
            <Title level={2} style={{ margin: 0 }}>
              Lots de {syndicate?.name || 'la copropriété'}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Ajoutez les lots et sélectionnez directement un bien existant pour proposer automatiquement le
              propriétaire.
            </Paragraph>
          </Space>

          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            Nouveau lot
          </Button>
          <Button onClick={openImportModal}>Importer des biens</Button>
        </div>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {loading ? (
          <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            {referenceWarning ? <Alert type="warning" message={referenceWarning} showIcon /> : null}

            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic title="Nombre de lots" value={lots.length} />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic
                    title="Tantièmes généraux cumulés"
                    value={lots.reduce((sum, lot) => sum + lot.generalShares, 0)}
                  />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic
                    title="Lots avec propriétaire"
                    value={lots.filter(lot => Boolean(lot.ownerContactId)).length}
                  />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic
                    title="Lots avec locataire actif"
                    value={
                      lots.filter(lot => (lot.tenantAssignments || []).some(assignment => assignment.isActive)).length
                    }
                  />
                </Card>
              </Col>
            </Row>

            <Card title="Tableau des lots">
              <LotTable
                lots={lots}
                showMobileHint
                propertyLabelById={propertyLabelById}
                ownerLabelById={ownerLabelById}
                ownerLabelByEmail={ownerLabelByEmail}
                onEdit={openEditModal}
                onAssignTenant={openTenantModal}
                onViewAccount={lot =>
                  navigate(`/tenant/${effectiveTenantId}/syndics/${syndicId}/lots/${lot.id}/compte`)
                }
              />
            </Card>
          </>
        )}
      </Space>

      <Modal
        title={editingLot ? `Modifier le lot ${editingLot.lotNumber}` : 'Créer un lot'}
        open={open}
        onCancel={resetModalState}
        onOk={() => void handleSubmitLot()}
        okText={editingLot ? 'Enregistrer' : 'Créer le lot'}
        cancelText="Annuler"
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" initialValues={{ lotType: 'APARTMENT' }}>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Numéro de lot"
                name="lotNumber"
                rules={[{ required: true, message: 'Le numéro est obligatoire' }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Type de lot"
                name="lotType"
                rules={[{ required: true, message: 'Le type est obligatoire' }]}
              >
                <Select options={lotTypeOptions} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Tantièmes généraux"
                name="generalShares"
                rules={[{ required: true, message: 'Champ obligatoire' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Tantièmes spéciaux" name="specialShares">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Bien lié" name="propertyId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Sélectionner un bien existant"
              options={lotPropertyOptions}
              onChange={handlePropertyChange}
            />
          </Form.Item>
          <Form.Item label="Propriétaire CRM" name="ownerContactId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Sélection automatique si disponible"
              options={ownerOptions}
            />
          </Form.Item>
          <Form.Item label="Propriétaire depuis le" name="ownerSince">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Importer des lots depuis des propriétés"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onOk={() => void handleImportLots()}
        okText="Importer"
        cancelText="Annuler"
        confirmLoading={importSubmitting}
      >
        <Form form={importForm} layout="vertical">
          <Alert
            type="info"
            showIcon
            message="Règle d'import"
            description="Si vous sélectionnez un IMMEUBLE, les lots importés seront ses sous-propriétés (appartements/unités). Pour une villa/bureau/commerce, le lot sera la propriété elle-même."
            style={{ marginBottom: 12 }}
          />
          <Form.Item
            label="Propriétés à importer"
            name="propertyIds"
            rules={[{ required: true, message: 'Sélectionnez au moins une propriété' }]}
          >
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              placeholder="Sélectionner une ou plusieurs propriétés"
              options={importPropertyOptions.map(option => ({
                value: option.value,
                label: option.label
              }))}
            />
          </Form.Item>
          <div>
            <Tag color="blue">Flexible</Tag>
            <span>Vous pouvez mélanger IMMEUBLE, villa, bureau, commerce, etc.</span>
          </div>
        </Form>
      </Modal>

      <Modal
        title={tenantLot ? `Ajouter un locataire - ${tenantLot.lotNumber}` : 'Ajouter un locataire'}
        open={tenantOpen}
        onCancel={() => {
          setTenantOpen(false);
          setTenantLot(null);
          tenantForm.resetFields();
        }}
        onOk={() => void handleAssignTenant()}
        okText="Assigner"
        cancelText="Annuler"
        confirmLoading={tenantSubmitting}
      >
        <Form form={tenantForm} layout="vertical">
          <Alert
            type="info"
            showIcon
            message="Source des locataires"
            description="Sélectionnez un contact CRM existant. Cette action couvre le cas où le locataire n'a pas encore été rattaché via Gestion locative."
            style={{ marginBottom: 12 }}
          />
          <Form.Item
            label="Contact locataire"
            name="tenantId"
            rules={[{ required: true, message: 'Le contact locataire est obligatoire' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Sélectionner un contact CRM"
              options={ownerOptions.map(contact => ({
                value: contact.value,
                label: contact.label
              }))}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Date de début"
                name="startDate"
                rules={[{ required: true, message: 'La date de début est obligatoire' }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Date de fin" name="endDate">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Référence bail (optionnel)" name="leaseId">
            <Input />
          </Form.Item>
          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
