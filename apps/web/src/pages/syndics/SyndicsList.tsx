import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Row,
  Select,
  Space,
  Spin,
  Typography
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { SyndicateCard } from '../../components/syndics/SyndicateCard';
import { useAuth } from '../../hooks/useAuth';
import { createSyndicate, deleteSyndicate, listSyndicates } from '../../services/syndic-service';
import { listMandatingAgencies, MandatingAgency } from '../../services/document-branding-service';
import { CreateSyndicateRequest, Syndicate } from '../../types/syndic-types';
import { ListSearch, StateBlock, useConfirmAction } from '../../components/primitives';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion, SearchOption } from '../../utils/list-search';
import { localizedList } from '../../i18n/localized';
import { t } from '../../i18n/t';

const { Paragraph, Title } = Typography;

const PAGE_SIZE = 12;
/** Valeur du critère « Mandant » pour les copropriétés sans agence mandante (identité de l'agence). */
const NO_MANDANT = 'NONE';

// Libellés vivants : un `t()` évalué au chargement du module figerait la langue.
// IN_LIQUIDATION n'est pas proposé : ces copropriétés sont exclues de la liste.
const STATUS_OPTIONS = localizedList((): SearchOption[] => [
  { value: 'ACTIVE', label: t('Active') },
  { value: 'IN_DISPUTE', label: t('En litige') }
]);

function lotCount(item: Syndicate): number {
  return item._count?.lots ?? item.lots?.length ?? item.totalLots ?? 0;
}

// Stables (hors du composant) : le filtrage reste mémoïsé.
const TEXTE_RECHERCHE = [
  (item: Syndicate) => item.name,
  (item: Syndicate) => item.address,
  (item: Syndicate) => item.cadastralReference,
  (item: Syndicate) => item.mandatingAgency?.name
];
const ACCESSEURS = {
  status: (item: Syndicate) => item.status,
  mandant: (item: Syndicate) => item.mandatingAgencyId || NO_MANDANT,
  withLots: (item: Syndicate) => lotCount(item) > 0
};

export const SyndicsList: React.FC = () => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();

  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [items, setItems] = useState<Syndicate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingSyndicId, setDeletingSyndicId] = useState<string | null>(null);
  const [mandatingAgencies, setMandatingAgencies] = useState<MandatingAgency[]>([]);
  const [form] = Form.useForm<CreateSyndicateRequest>();

  useEffect(() => {
    if (!effectiveTenantId) {
      setLoading(false);
      setError(t('Tenant introuvable'));
      return;
    }
    void loadSyndicates();
    // Un échec ici n'empêche pas la liste des copropriétés de s'afficher :
    // le champ mandant sera simplement vide dans le formulaire de création.
    listMandatingAgencies(effectiveTenantId)
      .then(setMandatingAgencies)
      .catch(() => setMandatingAgencies([]));
  }, [effectiveTenantId]);

  useEffect(() => {
    const section = searchParams.get('openSyndicSection');
    if (!section || loading || !effectiveTenantId || items.length === 0) {
      return;
    }

    const sectionToSuffix: Record<string, string> = {
      detail: '',
      lots: '/lots',
      charges: '/charges',
      assemblees: '/assemblees',
      prestataires: '/prestataires',
      documents: '/documents',
      finances: '/finances',
      recouvrement: '/recouvrement',
      comptabilite: '/comptabilite',
      budgets: '/budgets',
      'profils-incidents': '/profils-incidents'
    };

    const suffix = sectionToSuffix[section];
    if (suffix === undefined) {
      return;
    }

    navigate(`/tenant/${effectiveTenantId}/syndics/${items[0].id}${suffix}`, { replace: true });
  }, [effectiveTenantId, items, loading, navigate, searchParams]);

  const loadSyndicates = async () => {
    if (!effectiveTenantId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await listSyndicates(effectiveTenantId);
      setItems(data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Erreur lors du chargement des copropriétés'));
    } finally {
      setLoading(false);
    }
  };

  // Les copropriétés en liquidation sont exclues de la gestion courante. La redirection `?openSyndicSection=`
  // ci-dessus lit `items` (liste non filtrée par la recherche).
  const visibleItems = useMemo(() => items.filter(item => item.status !== 'IN_LIQUIDATION'), [items]);

  const mandantOptions = useMemo(() => {
    const byId = new Map<string, string>();
    let withoutMandant = false;
    for (const item of visibleItems) {
      if (!item.mandatingAgencyId) withoutMandant = true;
      else if (item.mandatingAgency?.name) byId.set(item.mandatingAgencyId, item.mandatingAgency.name);
    }
    const options: SearchOption[] = [...byId].map(([value, label]) => ({ value, label }));
    if (withoutMandant) options.push({ value: NO_MANDANT, label: t('Identité de l’agence') });
    return options;
  }, [visibleItems]);

  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Nom, adresse, référence cadastrale, mandant…')
    },
    { key: 'status', type: 'multiSelect', label: t('Statut'), primary: true, options: STATUS_OPTIONS },
    { key: 'mandant', type: 'select', label: t('Mandant'), primary: true, options: mandantOptions },
    {
      key: 'withLots',
      type: 'boolean',
      label: t('Lots'),
      tristate: true,
      trueLabel: t('Avec lots'),
      falseLabel: t('Sans lot')
    }
  ];

  const local = useLocalListSearch<Syndicate>(visibleItems, {
    ariaLabel: t('Rechercher dans les copropriétés'),
    defaultPageSize: PAGE_SIZE,
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  const handleCreate = async () => {
    if (!effectiveTenantId) {
      return;
    }

    const values = await form.validateFields();

    setSubmitting(true);
    try {
      const created = await createSyndicate(effectiveTenantId, values);
      message.success(t('Copropriété créée'));
      setOpen(false);
      form.resetFields();
      navigate(`/tenant/${effectiveTenantId}/syndics/${created.id}/lots?openImport=true`);
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Création impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (syndicId: string) => {
    if (!effectiveTenantId) {
      return;
    }

    confirmAction({
      title: t('Supprimer cette copropriété ?'),
      description: t('Cette action supprime définitivement la copropriété et ses données liées.'),
      okText: t('Supprimer'),
      danger: true,
      cancelText: t('Annuler'),
      onConfirm: async () => {
        setDeletingSyndicId(syndicId);
        try {
          await deleteSyndicate(effectiveTenantId, syndicId);
          message.success(t('Copropriété supprimée'));
          await loadSyndicates();
        } catch (err: any) {
          message.error(err.response?.data?.error || t('Suppression impossible'));
        } finally {
          setDeletingSyndicId(null);
        }
      }
    });
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <Title level={2} style={{ marginBottom: 8 }}>
              {t('Copropriétés')}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t("Gérez vos syndics, leurs adresses, leur statut et l'accès aux lots.")}
            </Paragraph>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            {t('Nouvelle copropriété')}
          </Button>
        </div>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {loading ? (
          <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : visibleItems.length === 0 ? (
          <Empty description={t('Aucune copropriété trouvée')}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
              {t('Créer une copropriété')}
            </Button>
          </Empty>
        ) : (
          <>
            <ListSearch {...local.searchProps} />
            {local.total === 0 ? (
              <StateBlock
                variant="no-results"
                actions={[{ label: t('Effacer les critères'), onClick: local.clear, primary: true }]}
              />
            ) : (
              <Row gutter={[16, 16]}>
                {local.pageItems.map(item => (
                  <Col key={item.id} xs={24} md={12} xl={8}>
                    <SyndicateCard
                      syndicate={item}
                      tenantId={effectiveTenantId || ''}
                      onDelete={handleDelete}
                      deleting={deletingSyndicId === item.id}
                    />
                  </Col>
                ))}
              </Row>
            )}
            {local.total > PAGE_SIZE ? (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Pagination
                  current={local.page}
                  pageSize={PAGE_SIZE}
                  total={local.total}
                  onChange={page => local.setPage(page)}
                  showSizeChanger={false}
                />
              </div>
            ) : null}
          </>
        )}
      </Space>

      <Modal
        title={t('Créer une copropriété')}
        open={open}
        onCancel={() => {
          setOpen(false);
          form.resetFields();
        }}
        onOk={() => void handleCreate()}
        okText={t('Créer')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" initialValues={{ propertyId: undefined }}>
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
          <Form.Item label={t("N° d'immatriculation")} name="registrationNo">
            <Input />
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
    </>
  );
};
