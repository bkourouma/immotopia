import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Button, Card, Col, Descriptions, List, Row, Space, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  ownerPortalPatrimoineService,
  type PatrimoineDocument,
  type PatrimoineLoan,
  type PatrimoinePropertyDetails as PatrimoinePropertyDetailsData,
  type PatrimoineValuationHistoryEntry,
  type PatrimoineWork
} from '../../services/owner-portal-patrimoine-service';
import { StateBlock, formatMoney } from '../../components/primitives';
import {
  DASH,
  deviseAffichee,
  documentTypeLabel,
  formatPercent,
  loanStatusTag,
  sharePercentLabel,
  valuationMethodLabel,
  workStatusTag
} from './owner-patrimoine-labels';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

function isHiddenOrNotFound(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 404;
}

function errorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { message?: string; error?: string } } } | null)?.response?.data;
  return data?.message || data?.error || fallback;
}

const formatDate = (value: string | null | undefined): string => (value ? dayjs(value).format('DD/MM/YYYY') : DASH);

export default function PatrimoinePropertyDetails() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PatrimoinePropertyDetailsData | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    setHidden(false);
    try {
      const details = await ownerPortalPatrimoineService.getPropertyDetails(propertyId);
      setData(details);
    } catch (err) {
      if (isHiddenOrNotFound(err)) {
        setHidden(true);
      } else {
        setError(errorMessage(err, t('Erreur lors du chargement des détails')));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [propertyId]);

  const handleDownload = async (doc: PatrimoineDocument) => {
    setDownloadingId(doc.id);
    try {
      const blob = await ownerPortalPatrimoineService.downloadDocument(doc.downloadPath);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success(t('Document téléchargé avec succès'));
    } catch (err) {
      message.error(errorMessage(err, t('Erreur lors du téléchargement')));
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading && !data) {
    return <StateBlock variant="loading" />;
  }

  if (hidden) {
    return (
      <StateBlock
        variant="empty"
        title={t('Vue indisponible')}
        description={t("Cette vue n'est pas disponible.")}
        actions={[{ label: t('Retour'), onClick: () => navigate('/owner/patrimoine') }]}
      />
    );
  }

  if (error) {
    return (
      <StateBlock
        variant="error"
        description={error}
        actions={[{ label: t('Réessayer'), onClick: () => void load(), primary: true }]}
      />
    );
  }

  if (!data) {
    return <StateBlock variant="empty" />;
  }

  const {
    sections,
    property,
    valuation,
    valuations,
    latentCapitalGain,
    yield: yieldData,
    loans,
    works,
    documents
  } = data;

  const valuationColumns: ColumnsType<PatrimoineValuationHistoryEntry> = [
    { title: t('Date'), dataIndex: 'valuatedAt', key: 'valuatedAt', render: formatDate },
    {
      title: t('Valeur estimée'),
      key: 'estimatedValue',
      render: (_: unknown, record) => formatMoney(record.estimatedValue, { currency: deviseAffichee(record.currency) })
    },
    { title: t('Méthode'), dataIndex: 'method', key: 'method', render: valuationMethodLabel }
  ];

  const loanColumns: ColumnsType<PatrimoineLoan> = [
    { title: t('Prêteur'), dataIndex: 'lender', key: 'lender' },
    {
      title: t('Capital emprunté'),
      key: 'capitalAmount',
      render: (_: unknown, record) => formatMoney(record.capitalAmount, { currency: deviseAffichee(record.currency) })
    },
    {
      title: t('Capital restant dû'),
      key: 'remainingCapital',
      render: (_: unknown, record) =>
        formatMoney(record.remainingCapital, { currency: deviseAffichee(record.currency) })
    },
    { title: t('Taux'), key: 'interestRate', render: (_: unknown, record) => formatPercent(record.interestRate) },
    {
      title: t('Mensualité'),
      key: 'monthlyPayment',
      render: (_: unknown, record) => formatMoney(record.monthlyPayment, { currency: deviseAffichee(record.currency) })
    },
    { title: t('Début'), dataIndex: 'startDate', key: 'startDate', render: formatDate },
    { title: t('Fin'), dataIndex: 'endDate', key: 'endDate', render: formatDate },
    { title: t('Statut'), dataIndex: 'status', key: 'status', render: loanStatusTag }
  ];

  const workColumns: ColumnsType<PatrimoineWork> = [
    { title: t('Travaux'), dataIndex: 'title', key: 'title' },
    { title: t('Statut'), dataIndex: 'status', key: 'status', render: workStatusTag },
    { title: t('Date prévue'), dataIndex: 'plannedDate', key: 'plannedDate', render: formatDate },
    { title: t('Date de fin'), dataIndex: 'completedDate', key: 'completedDate', render: formatDate },
    {
      title: t('Coût estimé'),
      key: 'estimatedCost',
      render: (_: unknown, record) =>
        record.estimatedCost === null
          ? t('Non renseigné')
          : formatMoney(record.estimatedCost, { currency: deviseAffichee(record.currency) })
    },
    {
      title: t('Coût réel'),
      key: 'actualCost',
      render: (_: unknown, record) =>
        record.actualCost === null
          ? t('Non renseigné')
          : formatMoney(record.actualCost, { currency: deviseAffichee(record.currency) })
    }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/owner/patrimoine')} style={{ marginBottom: 16 }}>
          {t('Retour')}
        </Button>
        <Title level={2}>{property.title}</Title>
        <Text type="secondary">{property.address}</Text>
        {property.city && (
          <>
            <br />
            <Text type="secondary">{property.city}</Text>
          </>
        )}
      </div>

      <Card title={t('Quote-part')}>
        <Statistic title={t('Votre part dans ce bien')} value={sharePercentLabel(property.ownerSharePercent)} />
      </Card>

      {sections.valuation && (
        <Card title={t('Valorisation')}>
          {valuation ? (
            <Descriptions column={{ xs: 1, sm: 2 }} bordered>
              <Descriptions.Item label={t('Valeur estimée')}>
                {formatMoney(valuation.estimatedValue, { currency: deviseAffichee(valuation.currency) })}
              </Descriptions.Item>
              <Descriptions.Item label={t('Valorisée le')}>{formatDate(valuation.valuatedAt)}</Descriptions.Item>
              <Descriptions.Item label={t("Prix d'acquisition")}>
                {valuation.acquisitionCost === null
                  ? t('Non renseigné')
                  : formatMoney(valuation.acquisitionCost, { currency: deviseAffichee(valuation.currency) })}
              </Descriptions.Item>
              <Descriptions.Item label={t('Plus-value latente')}>
                {latentCapitalGain === undefined || latentCapitalGain === null
                  ? t('Non renseigné')
                  : formatMoney(latentCapitalGain, { currency: deviseAffichee(valuation.currency) })}
              </Descriptions.Item>
            </Descriptions>
          ) : (
            <StateBlock variant="empty" description={t('Aucune valorisation enregistrée.')} />
          )}

          {valuations && valuations.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <Title level={4}>{t('Historique des valorisations')}</Title>
              <Table
                scroll={{ x: 'max-content' }}
                columns={valuationColumns}
                dataSource={valuations}
                rowKey="id"
                pagination={{ pageSize: 10 }}
              />
            </div>
          )}
        </Card>
      )}

      {sections.yield && (
        <Card title={t('Rendement')}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Statistic title={t('Brut')} value={formatPercent(yieldData?.grossYield)} />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Statistic title={t('Net')} value={formatPercent(yieldData?.netYield)} />
            </Col>
            {sections.loans && (
              <Col xs={24} sm={12} md={6}>
                <Statistic title={t('Net-Net')} value={formatPercent(yieldData?.netNetYield)} />
              </Col>
            )}
            <Col xs={24} sm={12} md={6}>
              <Statistic title={t('Loyer annuel')} value={yieldData ? formatMoney(yieldData.annualRent) : DASH} />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Statistic
                title={t('Charges annuelles')}
                value={yieldData ? formatMoney(yieldData.annualExpenses) : DASH}
              />
            </Col>
          </Row>
        </Card>
      )}

      {sections.loans && (
        <Card title={t('Emprunts')}>
          {loans && loans.length > 0 ? (
            <Table
              scroll={{ x: 'max-content' }}
              columns={loanColumns}
              dataSource={loans}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          ) : (
            <StateBlock variant="empty" description={t('Aucun emprunt enregistré.')} />
          )}
        </Card>
      )}

      {sections.works && (
        <Card title={t('Travaux')}>
          {works && works.length > 0 ? (
            <Table
              scroll={{ x: 'max-content' }}
              columns={workColumns}
              dataSource={works}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          ) : (
            <StateBlock variant="empty" description={t('Aucun programme de travaux.')} />
          )}
        </Card>
      )}

      {sections.documents && (
        <Card title={t('Documents')}>
          {documents && documents.length > 0 ? (
            <List
              dataSource={documents}
              renderItem={doc => (
                <List.Item
                  actions={[
                    <Button
                      key="download"
                      type="link"
                      icon={<DownloadOutlined />}
                      onClick={() => void handleDownload(doc)}
                      loading={downloadingId === doc.id}
                    >
                      {t('Télécharger')}
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    title={doc.fileName}
                    description={
                      <Space direction="vertical" size={0}>
                        <Text type="secondary">{documentTypeLabel(doc.documentType)}</Text>
                        <Text type="secondary">
                          {t('Ajouté le')} {formatDate(doc.createdAt)}
                        </Text>
                        {doc.expirationDate && (
                          <Text type="secondary">
                            {t('Expire le')} {formatDate(doc.expirationDate)}
                          </Text>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          ) : (
            <StateBlock variant="empty" description={t('Aucun document disponible.')} />
          )}
        </Card>
      )}
    </Space>
  );
}
