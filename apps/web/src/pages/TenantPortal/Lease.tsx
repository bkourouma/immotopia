import React, { useState, useEffect } from 'react';
import {
  App,
  Card,
  Row,
  Col,
  Typography,
  Spin,
  Alert,
  Descriptions,
  Tag,
  List,
  Button,
  Space,
  Empty,
  Divider
} from 'antd';
import {
  FileTextOutlined,
  UserOutlined,
  HomeOutlined,
  DownloadOutlined,
  CalendarOutlined,
  DollarOutlined
} from '@ant-design/icons';
import { tenantPortalService } from '../../services/tenantPortalService';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;

interface LeaseDetailsData {
  lease: {
    id: string;
    lease_number: string;
    lease_label?: string;
    status: string;
    start_date: string;
    end_date: string | null;
    move_in_date: string | null;
    move_out_date: string | null;
    billing_frequency: string;
    due_day_of_month: number;
    currency: string;
    rent_amount: number;
    service_charge_amount: number;
    security_deposit_amount: number;
    penalty_grace_days: number;
    penalty_mode: string;
    penalty_rate: number;
    penalty_fixed_amount: number;
    penalty_cap_amount: number | null;
    notes: string | null;
    property: {
      id: string;
      address: string;
      title: string | null;
      internalReference: string;
      owner?: {
        fullName: string | null;
      } | null;
    };
    primaryRenter: {
      id: string;
      user: {
        fullName: string | null;
        email: string;
      };
    };
    ownerClient: {
      id: string;
      user: {
        fullName: string | null;
        email: string;
      };
    } | null;
  };
  coRenters: Array<{
    id: string;
    user: {
      fullName: string | null;
      email: string;
    };
  }>;
  documents: Array<{
    id: string;
    type: string;
    document_number: string | null;
    file_url: string | null;
    file_path: string | null;
    issued_at: string | null;
    title: string | null;
  }>;
  groupedByType: Record<
    string,
    Array<{
      id: string;
      type: string;
      document_number: string | null;
      file_url: string | null;
      file_path: string | null;
      issued_at: string | null;
      title: string | null;
    }>
  >;
}

export default function TenantLease() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LeaseDetailsData | null>(null);

  useEffect(() => {
    loadLeaseDetails();
  }, []);

  const loadLeaseDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await tenantPortalService.getLeaseDetails();
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError(t('Erreur lors du chargement des détails du bail'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des détails du bail'));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Montant en francs CFA, insécable.
   *
   * `Intl` sépare les milliers par une espace fine insécable, mais pose une
   * espace ORDINAIRE avant le symbole : dans une cellule étroite, le montant
   * se coupait entre le nombre et « F CFA ». On rend toutes les espaces
   * insécables pour que le montant reste d'un seul tenant.
   */
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(activeLocale(), {
      style: 'currency',
      currency: 'XOF',
      minimumFractionDigits: 0
    })
      .format(amount)
      .replace(/\s/g, '\u00a0');
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString(activeLocale(), {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      ACTIVE: { label: t('Actif'), color: 'success' },
      DRAFT: { label: t('Brouillon'), color: 'default' },
      SUSPENDED: { label: t('Suspendu'), color: 'warning' },
      ENDED: { label: t('Terminé'), color: 'default' },
      CANCELED: { label: t('Annulé'), color: 'error' }
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const getBillingFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      MONTHLY: 'Mensuel',
      QUARTERLY: 'Trimestriel',
      SEMIANNUAL: 'Semestriel',
      ANNUAL: 'Annuel'
    };
    return labels[frequency] || frequency;
  };

  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      LEASE_CONTRACT: t('Contrat de bail'),
      LEASE_ADDENDUM: 'Avenant',
      RENT_RECEIPT: t('Quittance de loyer'),
      RENT_QUITTANCE: 'Quittance',
      DEPOSIT_RECEIPT: t('Reçu de dépôt'),
      STATEMENT: t('Relevé'),
      OTHER: 'Autre'
    };
    return labels[type] || type;
  };

  const getDisplayName = (
    fullName: string | null | undefined,
    email?: string | null,
    fallback = t('Non renseigné')
  ) => {
    const cleanName = fullName?.trim();
    if (cleanName) return cleanName;

    const localPart = (email || '').split('@')[0]?.trim();
    if (!localPart) return fallback;

    const normalized = localPart
      .replace(/[._-]+/g, ' ')
      .replace(/\d+$/g, '')
      .trim();

    if (!normalized) return fallback;

    return normalized
      .split(' ')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const handleDownloadDocument = async (documentId: string) => {
    try {
      const response = await tenantPortalService.downloadDocument(documentId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `document-${documentId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Error downloading document:', err);
      message.error(t('Erreur lors du téléchargement du document'));
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip={t('Chargement des détails du bail...')} />
      </div>
    );
  }

  if (error) {
    return <Alert message={t('Erreur')} description={error} type="error" showIcon />;
  }

  if (!data) {
    return <Empty description={t('Aucune donnée disponible')} />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div>
        <Title level={2}>{t('Mon bail')}</Title>
        <Text type="secondary">{t('Détails complets de votre contrat de location')}</Text>
      </div>

      {/* Lease Information Display (T041) */}
      <Card
        title={
          <>
            <FileTextOutlined /> {t('Informations du bail')}
          </>
        }
      >
        {/*
          Deux colonnes au plus, jamais trois.

          Une `Descriptions` bordée à trois colonnes pose SIX cellules par
          ligne — libellé et valeur pour chacune —, soit environ 15 % de la
          largeur par cellule. À cette taille, « Dépôt de garantie » se coupait
          en deux et le montant lui-même se brisait en plein milieu :
          « 1500 0 00 F CF A ». Un montant illisible sur le portail du
          locataire, c'est-à-dire exactement là où il compte.

          Les libellés ne se coupent plus (`nowrap`) et la colonne qui les
          porte a une largeur fixe : sans elle, Ant Design la dimensionne sur
          le plus long et le reste suit.
        */}
        <Descriptions
          bordered
          column={{ xs: 1, md: 2 }}
          size="middle"
          labelStyle={{ whiteSpace: 'nowrap', width: 180, verticalAlign: 'top' }}
          contentStyle={{ verticalAlign: 'top' }}
        >
          <Descriptions.Item label={t('Numéro de bail')}>
            <Text strong>{data.lease.lease_number}</Text>
          </Descriptions.Item>
          {data.lease.lease_label && (
            <Descriptions.Item label={t('Nom du bail')}>
              <Space>
                <HomeOutlined />
                <Text>{data.lease.lease_label}</Text>
              </Space>
            </Descriptions.Item>
          )}
          <Descriptions.Item label={t('Adresse')}>
            <Text>{data.lease.property?.address || data.lease.property?.title || '-'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('Statut')}>{getStatusTag(data.lease.status)}</Descriptions.Item>
          <Descriptions.Item label={t('Date de début')}>
            <CalendarOutlined style={{ marginInlineEnd: 8 }} />
            {formatDate(data.lease.start_date)}
          </Descriptions.Item>
          <Descriptions.Item label={t('Date de fin')}>
            <CalendarOutlined style={{ marginInlineEnd: 8 }} />
            {data.lease.end_date ? formatDate(data.lease.end_date) : t('Non définie')}
          </Descriptions.Item>
          <Descriptions.Item label={t("Date d'emménagement")}>
            {data.lease.move_in_date ? formatDate(data.lease.move_in_date) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('Loyer mensuel')}>
            <DollarOutlined style={{ marginInlineEnd: 8 }} />
            <Text strong>{formatCurrency(data.lease.rent_amount)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('Charges')}>{formatCurrency(data.lease.service_charge_amount)}</Descriptions.Item>
          <Descriptions.Item label={t('Dépôt de garantie')}>
            {formatCurrency(data.lease.security_deposit_amount)}
          </Descriptions.Item>
          <Descriptions.Item label={t('Fréquence de facturation')}>
            {getBillingFrequencyLabel(data.lease.billing_frequency)}
          </Descriptions.Item>
          <Descriptions.Item label={t("Jour d'échéance")}>
            {t('Le')} {data.lease.due_day_of_month} de chaque mois
          </Descriptions.Item>
          {data.lease.notes && (
            <Descriptions.Item label={t('Notes')} span={{ xs: 1, md: 2 }}>
              <Text>{data.lease.notes}</Text>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Primary Renter and Owner */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card
            title={
              <>
                <UserOutlined /> {t('Locataire principal')}
              </>
            }
          >
            <Space direction="vertical">
              <Text strong>{data.lease.primaryRenter.user.fullName || t('Non renseigné')}</Text>
              <Text type="secondary">{data.lease.primaryRenter.user.email}</Text>
            </Space>
          </Card>
        </Col>
        {data.lease.ownerClient && (
          <Col xs={24} md={12}>
            <Card
              title={
                <>
                  <UserOutlined /> {t('Propriétaire')}
                </>
              }
            >
              <Space direction="vertical">
                <Text strong>
                  {getDisplayName(
                    data.lease.ownerClient.user.fullName || data.lease.property?.owner?.fullName,
                    data.lease.ownerClient.user.email
                  )}
                </Text>
                <Text type="secondary">{data.lease.ownerClient.user.email}</Text>
              </Space>
            </Card>
          </Col>
        )}
      </Row>

      {/* Co-Renters List Display (T042) */}
      {data.coRenters.length > 0 && (
        <Card
          title={
            <>
              <UserOutlined /> {t('Co-locataires')}
            </>
          }
        >
          <List
            dataSource={data.coRenters}
            renderItem={coRenter => (
              <List.Item>
                <List.Item.Meta
                  avatar={<UserOutlined />}
                  title={coRenter.user.fullName || t('Non renseigné')}
                  description={coRenter.user.email}
                />
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* Documents List Grouped by Type (T043) */}
      <Card
        title={
          <>
            <FileTextOutlined /> {t('Documents')}
          </>
        }
      >
        {Object.keys(data.groupedByType).length > 0 ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {Object.entries(data.groupedByType).map(([type, docs]) => (
              <div key={type}>
                <Title level={4} style={{ marginBottom: 16 }}>
                  {getDocumentTypeLabel(type)}
                  <Tag style={{ marginInlineStart: 8 }}>{docs.length}</Tag>
                </Title>
                <List
                  dataSource={docs}
                  renderItem={doc => (
                    <List.Item
                      actions={[
                        <Button
                          key="download"
                          type="link"
                          icon={<DownloadOutlined />}
                          onClick={() => handleDownloadDocument(doc.id)}
                          disabled={!doc.file_url && !doc.file_path}
                        >
                          {t('Télécharger')}
                        </Button>
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          doc.title || doc.document_number || t('Document {{value}}', { value: doc.id.substring(0, 8) })
                        }
                        description={
                          doc.issued_at
                            ? t('Émis le {{value}}', { value: formatDate(doc.issued_at) })
                            : t('Date non disponible')
                        }
                      />
                    </List.Item>
                  )}
                />
                <Divider />
              </div>
            ))}
          </Space>
        ) : (
          <Empty description={t('Aucun document disponible')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>
    </Space>
  );
}
