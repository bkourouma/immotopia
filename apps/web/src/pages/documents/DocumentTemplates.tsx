import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { App, Card, Button, Select, Tag, Space, Row, Col, Typography, Alert, Modal, Form, Input, Upload } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
  PlusOutlined,
  QuestionCircleOutlined,
  FileTextOutlined,
  UploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  StarOutlined,
  StarFilled
} from '@ant-design/icons';
import apiClient from '../../utils/api-client';
import { useAgencyFeatures } from '../../hooks/useAgencyFeatures';
import { ConfirmAction, DataCard, DataView, StatusTag, useConfirmAction } from '../../components/primitives';
import { t as translate } from '../../i18n/t';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

interface DocumentTemplate {
  id: string;
  doc_type: string;
  name: string;
  status: string;
  is_default: boolean;
  original_filename: string;
  placeholders: string[];
  created_at: string;
}

const DOC_TYPES = [
  { value: 'LEASE_HABITATION', label: translate('Bail Habitation') },
  { value: 'LEASE_COMMERCIAL', label: translate('Bail Commercial') },
  { value: 'RENT_RECEIPT', label: translate('Reçu de Loyer') },
  { value: 'RENT_STATEMENT', label: translate('Relevé de Compte') }
];

// Constants for displaying placeholder syntax in JSX
const OPEN_BRACE = '{';
const CLOSE_BRACE = '}';

/** Libellé métier d'un type de document, ou le code brut s'il est inconnu. */
function libelleType(docType: string): string {
  return DOC_TYPES.find(t => t.value === docType)?.label || docType;
}

/**
 * La liste des modèles, dans ses deux représentations (REFONTE_UI_UX.md §5.1).
 *
 * Le `<Table scroll={{ x: 'max-content' }}>` d'origine rendait cinq colonnes — dont une colonne d'actions
 * portant trois boutons texte — sans aucune stratégie sous 992 px : à 375 px,
 * « Placeholders » et « Actions » sortaient de l'écran, et rien n'indiquait
 * qu'on pouvait faire glisser le tableau. `<DataView>` rend le tableau au-dessus
 * de 992 px et une liste de `<DataCard>` en dessous ; `renderCard` est
 * obligatoire, l'oubli ne compile pas.
 *
 * **Sur la pagination.** `<DataView>` attend un `total` serveur, jamais un
 * `items.length` — c'est le défaut du §8.4, une liste et son compteur qui se
 * contredisent. Ici l'endpoint ne pagine pas : il rend la collection entière,
 * déjà filtrée par `docType`. `templates.length` EST donc le total du serveur,
 * et la tranche est découpée localement. Les deux ne peuvent pas diverger.
 */

export function DocumentTemplates() {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  // Les quatre types de modèles (baux, reçus, relevés) relèvent de la gestion locative.
  const rentalIncluded = useAgencyFeatures(tenantId).has('RENTAL');
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filterDocType, setFilterDocType] = useState<string>('');
  // L'endpoint rend la collection entière : la tranche est découpée ici.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();
  const confirmAction = useConfirmAction();

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const url = filterDocType
        ? `/tenants/${tenantId}/documents/templates?docType=${filterDocType}`
        : `/tenants/${tenantId}/documents/templates`;

      const response = await apiClient.get(url);
      const data = response.data;

      if (data.success) {
        setTemplates(data.data || []);
        setError(null);
      } else {
        // Erreur de chargement portée par le bloc d'erreur de `<DataView>`, et
        // non par un toast : le toast disparaît et laisse « Aucun modèle », qui
        // fait croire à une liste vide alors que l'appel a échoué. Le bloc
        // reste, et porte le bouton « Réessayer ».
        setError(data.message || translate('Impossible de charger les modèles de documents.'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || translate('Impossible de charger les modèles de documents.'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, filterDocType]);

  useEffect(() => {
    if (tenantId) {
      loadTemplates();
    }
  }, [tenantId, loadTemplates]);

  // Changer de filtre remet en page 1 : rester en page 3 d'un résultat qui n'en
  // compte qu'une afficherait une liste vide sur des données présentes.
  useEffect(() => {
    setPage(1);
  }, [filterDocType]);

  const handleUpload = async (values: any) => {
    if (!values.file || !Array.isArray(values.file) || values.file.length === 0) {
      message.error(translate('Veuillez sélectionner un fichier'));
      return;
    }

    const file = values.file[0];
    if (!file.originFileObj) {
      message.error(translate('Erreur lors de la sélection du fichier'));
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append('file', file.originFileObj);
      formData.append('docType', values.docType);
      formData.append('name', values.name);

      const response = await apiClient.post(`/tenants/${tenantId}/documents/templates/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      const data = response.data;

      if (data.success) {
        message.success(translate('Template ajouté avec succès'));
        setShowUploadModal(false);
        form.resetFields();
        loadTemplates();
      } else {
        message.error(data.message || translate('Erreur lors du téléchargement'));
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || translate('Erreur lors du téléchargement'));
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleSetDefault = async (templateId: string) => {
    try {
      const response = await apiClient.post(`/tenants/${tenantId}/documents/templates/${templateId}/set-default`);

      const data = response.data;
      if (data.success) {
        message.success(translate('Template défini par défaut'));
        loadTemplates();
      } else {
        message.error(data.message || translate('Erreur lors de la définition du template par défaut'));
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || translate('Erreur lors de la définition du template par défaut'));
      console.error(err);
    }
  };

  const handleToggleStatus = async (templateId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const response = await apiClient.patch(`/tenants/${tenantId}/documents/templates/${templateId}`, {
        status: newStatus
      });

      const data = response.data;
      if (data.success) {
        message.success(translate('Template {{value}}', { value: newStatus === 'ACTIVE' ? 'activé' : 'désactivé' }));
        loadTemplates();
      } else {
        message.error(data.message || translate('Erreur lors de la mise à jour'));
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || translate('Erreur lors de la mise à jour'));
      console.error(err);
    }
  };

  const handleDelete = async (templateId: string) => {
    try {
      const response = await apiClient.delete(`/tenants/${tenantId}/documents/templates/${templateId}`);

      const data = response.data;
      if (data.success) {
        message.success(translate('Template supprimé avec succès'));
        loadTemplates();
      } else {
        message.error(data.message || translate('Erreur lors de la suppression'));
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || translate('Erreur lors de la suppression'));
      console.error(err);
    }
  };

  /**
   * Colonnes du tableau, au-dessus de 992 px.
   *
   * Chacune porte une largeur, et les valeurs courtes portent `nowrap`. Sans
   * cela, AntD répartit la place restante au prorata du contenu : à 1280 px
   * avec la sidebar, « Bail Habitation » tombait sur deux lignes alors que la
   * colonne « Placeholders » étalait ses étiquettes. La somme des largeurs
   * (1080 px) dépasse la zone de contenu au plancher du desktop, d'où le
   * `scrollX` passé à `<DataView>` — le tableau défile au lieu de se comprimer.
   */
  const columns: ColumnsType<DocumentTemplate> = [
    {
      title: translate('Nom'),
      dataIndex: 'name',
      key: 'name',
      width: 340,
      render: (text: string, record: DocumentTemplate) => (
        <Space direction="vertical" size="small">
          {/* `wrap` : sans lui, l'étiquette « Par défaut » garde sa place sur la
              ligne et c'est le nom qui se casse — « Bail / Habitation /
              Standard ». Elle passe dessous, le nom reste lisible. */}
          <Space wrap>
            <Text strong>{text}</Text>
            {record.is_default && (
              <Tag icon={<StarFilled />} color="gold">
                {translate('Par défaut')}
              </Tag>
            )}
          </Space>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.original_filename}
          </Text>
        </Space>
      )
    },
    {
      title: translate('Type'),
      dataIndex: 'doc_type',
      key: 'doc_type',
      width: 170,
      render: (docType: string) => <Text style={{ whiteSpace: 'nowrap' }}>{libelleType(docType)}</Text>
    },
    {
      title: translate('Statut'),
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => <StatusTag status={status} />
    },
    {
      title: translate('Placeholders'),
      dataIndex: 'placeholders',
      key: 'placeholders',
      width: 220,
      render: (placeholders: string[]) => (
        <Space wrap>
          {(placeholders || []).slice(0, 3).map(p => (
            <Tag key={p}>{p}</Tag>
          ))}
          {(placeholders || []).length > 3 && <Tag>+{(placeholders || []).length - 3}</Tag>}
        </Space>
      )
    },
    {
      title: translate('Actions'),
      key: 'actions',
      width: 280,
      render: (_: any, record: DocumentTemplate) => (
        <Space wrap={false}>
          {!record.is_default && (
            <Button type="link" icon={<StarOutlined />} onClick={() => handleSetDefault(record.id)}>
              {translate('Définir par défaut')}
            </Button>
          )}
          <Button type="link" onClick={() => handleToggleStatus(record.id, record.status)}>
            {record.status === 'ACTIVE' ? translate('Désactiver') : translate('Activer')}
          </Button>
          <ConfirmAction
            title={translate('Supprimer « {{name}} » ?', { name: record.name })}
            description={translate('Le modèle ne sera plus proposé à la génération. Cette action est définitive.')}
            okText={translate('Supprimer')}
            danger
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              {translate('Supprimer')}
            </Button>
          </ConfirmAction>
        </Space>
      )
    }
  ];

  /**
   * Les actions d'une carte, derrière « ⋮ ». Une seule reste visible sur la
   * carte — « Définir par défaut », la seule qu'on refait — le reste passe ici :
   * les trois boutons texte du tableau, alignés sur 375 px, donnaient des cibles
   * de moins de 44 px collées les unes aux autres (§10.1).
   */
  const actionsSecondaires = (template: DocumentTemplate): MenuProps['items'] => [
    {
      key: 'statut',
      label: template.status === 'ACTIVE' ? translate('Désactiver') : 'Activer',
      icon: template.status === 'ACTIVE' ? <CloseCircleOutlined /> : <CheckCircleOutlined />,
      onClick: () => handleToggleStatus(template.id, template.status)
    },
    {
      key: 'supprimer',
      label: translate('Supprimer'),
      icon: <DeleteOutlined />,
      danger: true,
      // Version impérative de `<ConfirmAction>` : une entrée de menu n'est pas
      // un élément déclencheur qu'on peut envelopper.
      onClick: () =>
        confirmAction({
          title: translate('Supprimer « {{name}} » ?', { name: template.name }),
          description: translate('Le modèle ne sera plus proposé à la génération. Cette action est définitive.'),
          okText: translate('Supprimer'),
          danger: true,
          onConfirm: () => handleDelete(template.id)
        })
    }
  ];

  const pageCourante = templates.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* `gutter` et `Col` pleine largeur sous 576 px : sans eux, les deux
            boutons restaient sur la ligne du titre et sortaient de l'écran de
            43 px — mesuré à 375. */}
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} sm="auto">
            <Title level={2} style={{ marginBottom: 'var(--space-1)' }}>
              {translate('Templates de Documents')}
            </Title>
            <Text type="secondary">{translate('Gérez vos templates de documents')}</Text>
          </Col>
          <Col xs={24} sm="auto">
            <Space wrap>
              <Button
                icon={<QuestionCircleOutlined />}
                onClick={() => window.open('/docs/GUIDE_TENANT_MODELES_DOCUMENTS.md', '_blank', 'noopener,noreferrer')}
              >
                {translate("Guide d'utilisation")}
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowUploadModal(true)}>
                {translate('Ajouter un template')}
              </Button>
            </Space>
          </Col>
        </Row>

        {!rentalIncluded ? (
          <Alert
            type="info"
            showIcon
            message={translate('Ces modèles servent à la gestion locative')}
            description={translate(
              "Les modèles de baux, de reçus de loyer et de relevés ne sont utilisés que par la gestion locative, qui n'est pas comprise dans votre abonnement."
            )}
          />
        ) : null}

        {/* Help Section */}
        <Card>
          <Alert
            message={
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Title level={5} style={{ margin: 0 }}>
                  {translate('Comment créer vos modèles de documents ?')}
                </Title>
                <Paragraph style={{ marginBottom: 8 }}>
                  {translate(
                    'Créez vos propres modèles de contrats de bail, reçus et relevés en utilisant des variables dans un document Word (.docx).'
                  )}
                </Paragraph>
                <Space direction="vertical" size="small">
                  <Text>
                    {translate('• Utilisez des variables comme')}{' '}
                    <Tag>
                      {OPEN_BRACE}
                      {OPEN_BRACE}AGENCE_NOM{CLOSE_BRACE}
                      {CLOSE_BRACE}
                    </Tag>{' '}
                    ou{' '}
                    <Tag>
                      {OPEN_BRACE}
                      {OPEN_BRACE}BAIL_LOYER_MENSUEL{CLOSE_BRACE}
                      {CLOSE_BRACE}
                    </Tag>
                  </Text>
                  <Text>{translate('• Téléchargez votre fichier DOCX avec votre mise en page personnalisée')}</Text>
                  <Text>
                    {translate('• Le système remplacera automatiquement les variables lors de la génération')}
                  </Text>
                </Space>
                <Button
                  type="link"
                  onClick={() =>
                    window.open('/docs/GUIDE_TENANT_MODELES_DOCUMENTS.md', '_blank', 'noopener,noreferrer')
                  }
                  // Un `Button` AntD garde son libellé sur une seule ligne :
                  // celui-ci mesure 504 px et débordait de l'écran. On l'autorise
                  // à se couper, et la hauteur suit.
                  style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'start' }}
                >
                  {translate('Consulter le guide complet avec toutes les variables disponibles →')}
                </Button>
              </Space>
            }
            type="info"
            icon={<FileTextOutlined />}
            showIcon
          />
        </Card>

        {/* Filter */}
        <Card>
          <div className="it-filters">
            <div className="it-filters__field">
              <Text strong>{translate('Filtrer par type')}</Text>
              <Select
                showSearch
                optionFilterProp="children"
                value={filterDocType || undefined}
                onChange={value => setFilterDocType(value || '')}
                placeholder={translate('Tous les types')}
                allowClear
                style={{ width: 200 }}
              >
                {DOC_TYPES.map(type => (
                  <Option key={type.value} value={type.value}>
                    {type.label}
                  </Option>
                ))}
              </Select>
            </div>
          </div>
        </Card>

        {/* Liste — tableau au-dessus de 992 px, cartes en dessous. */}
        <DataView<DocumentTemplate>
          items={pageCourante}
          total={templates.length}
          page={page}
          pageSize={pageSize}
          onPageChange={(suivante, taille) => {
            setPageSize(taille);
            setPage(taille !== pageSize ? 1 : suivante);
          }}
          loading={loading}
          error={error}
          onRetry={loadTemplates}
          isFiltered={Boolean(filterDocType)}
          onClearFilters={() => setFilterDocType('')}
          emptyDescription={translate("Aucun modèle de document n'est encore enregistré pour cette agence.")}
          emptyAction={{ label: translate('Ajouter un template'), onClick: () => setShowUploadModal(true) }}
          columns={columns}
          // 340 + 170 + 110 + 220 + 280. Au plancher du desktop (992 px moins
          // la sidebar), la zone de contenu fait environ 690 px : le tableau
          // défile plutôt que d'écraser « Type » sur deux lignes.
          scrollX={1120}
          rowKey={template => template.id}
          aria-label={translate('Modèles de documents')}
          renderCard={template => (
            <DataCard
              title={template.name}
              aria-label={translate('Modèle {{name}}', { name: template.name })}
              subtitle={template.original_filename}
              status={<StatusTag status={template.status} />}
              highlight={
                template.is_default ? (
                  <Tag icon={<StarFilled />} color="gold">
                    {translate('Par défaut')}
                  </Tag>
                ) : undefined
              }
              fields={[
                { label: translate('Type'), value: libelleType(template.doc_type) },
                {
                  // Le compte, et non les étiquettes : sur 375 px, trois
                  // `<Tag>` alignés à droite d'un libellé repassent à la ligne
                  // et cassent la paire libellé/valeur. Le tableau, lui, garde
                  // les étiquettes — il a la largeur pour.
                  label: translate('Variables'),
                  value: (template.placeholders || []).length
                    ? `${template.placeholders.length} variable${template.placeholders.length > 1 ? 's' : ''}`
                    : 'Aucune'
                }
              ]}
              primaryAction={
                template.is_default
                  ? undefined
                  : {
                      label: translate('Définir par défaut'),
                      icon: <StarOutlined />,
                      onClick: () => handleSetDefault(template.id)
                    }
              }
              secondaryActions={actionsSecondaires(template)}
            />
          )}
        />

        {/* Upload Modal */}
        <Modal
          title={translate('Ajouter un template')}
          open={showUploadModal}
          onCancel={() => {
            setShowUploadModal(false);
            form.resetFields();
          }}
          footer={null}
          width={600}
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleUpload}
            initialValues={{
              docType: 'LEASE_HABITATION'
            }}
          >
            <Form.Item
              label={translate('Type de document')}
              name="docType"
              rules={[{ required: true, message: translate('Veuillez sélectionner un type de document') }]}
            >
              <Select showSearch optionFilterProp="children">
                {DOC_TYPES.map(type => (
                  <Option key={type.value} value={type.value}>
                    {type.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              label={translate('Nom du template')}
              name="name"
              rules={[{ required: true, message: translate('Veuillez saisir un nom pour le template') }]}
            >
              <Input placeholder={translate('Ex: Bail Habitation Standard')} />
            </Form.Item>

            <Form.Item
              label={translate('Fichier DOCX')}
              name="file"
              rules={[
                { required: true, message: translate('Veuillez sélectionner un fichier DOCX') },
                {
                  validator: (_: any, fileList: any[]) => {
                    if (!fileList || fileList.length === 0) {
                      return Promise.reject(new Error(translate('Veuillez sélectionner un fichier DOCX')));
                    }
                    const file = fileList[0];
                    if (file.originFileObj) {
                      const fileName = file.originFileObj.name.toLowerCase();
                      if (!fileName.endsWith('.docx')) {
                        return Promise.reject(new Error(translate('Seuls les fichiers DOCX sont acceptés')));
                      }
                    }
                    return Promise.resolve();
                  }
                }
              ]}
              valuePropName="fileList"
              getValueFromEvent={e => {
                if (Array.isArray(e)) {
                  return e;
                }
                return e?.fileList;
              }}
            >
              <Upload accept=".docx" maxCount={1} beforeUpload={() => false}>
                <Button icon={<UploadOutlined />}>{translate('Sélectionner un fichier DOCX')}</Button>
              </Upload>
            </Form.Item>

            <Form.Item>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button
                  onClick={() => {
                    setShowUploadModal(false);
                    form.resetFields();
                  }}
                >
                  {translate('Annuler')}
                </Button>
                <Button type="primary" htmlType="submit" loading={uploading}>
                  {uploading ? translate('Téléchargement...') : translate('Télécharger')}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </Space>
    </>
  );
}
