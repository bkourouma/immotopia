import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, App, Button, Card, Descriptions, Space, Table, Tag, Typography } from 'antd';
import { getOwnerStatementById, recomputeOwnerStatement } from '../../../services/patrimoine-service';
import type { OwnerStatement } from '../../../types/patrimoine-types';
import { useAuth } from '../../../hooks/useAuth';
import { MoneyValue } from '../../../components/primitives';
import { isLegacyStatement, statementStatusLabel } from '../../../components/patrimoine/owner-statement-helpers';
import { t } from '../../../i18n/t';

import { activeLocale } from '../../../i18n/format';
const { Title } = Typography;

function statementItemTypeLabel(type: OwnerStatement['items'][number]['type']): string {
  if (type === 'RENT_COLLECTED') return t('Loyer encaissé');
  if (type === 'EXPENSE_DEDUCTED') return t('Dépense déduite');
  if (type === 'MANAGEMENT_FEE') return t('Honoraires de gestion');
  if (type === 'MANAGEMENT_FEE_VAT') return t('TVA sur honoraires');
  if (type === 'ADVANCE') return t('Avance');
  if (type === 'OTHER') return t('Autre');
  return type;
}

function ownerLabel(statement: OwnerStatement): string {
  const fullName = `${statement.owner?.firstName || ''} ${statement.owner?.lastName || ''}`.trim();
  return fullName || statement.owner?.email || statement.ownerContactId;
}

function propertyLabel(item: OwnerStatement['items'][number]): string {
  return item.property?.title || item.property?.internalReference || item.propertyId;
}

/** « 10 % », « 12,5 % ». */
function rateLabel(rate: number | string | null): string {
  if (rate === null || rate === undefined) return '';
  return `${Number(rate).toLocaleString(activeLocale())} %`;
}

export const OwnerStatementDetailPage: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, id } = useParams<{ tenantId: string; id: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statement, setStatement] = useState<OwnerStatement | null>(null);

  useEffect(() => {
    if (!effectiveTenantId || !id) return;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getOwnerStatementById(effectiveTenantId, id);
        setStatement(data);
      } catch (e: any) {
        setError(e?.response?.data?.error || t('Erreur de chargement du détail du relevé'));
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [effectiveTenantId, id]);

  const handleRecompute = async () => {
    if (!effectiveTenantId || !statement) return;
    setRecomputing(true);
    try {
      const data = await recomputeOwnerStatement(effectiveTenantId, statement.id);
      setStatement(data);
      message.success(t('Relevé recalculé. Vérifiez-le avant de le renvoyer au propriétaire.'));
    } catch (e: any) {
      message.error(e?.response?.data?.error || e?.response?.data?.message || t('Échec du recalcul du relevé'));
    } finally {
      setRecomputing(false);
    }
  };

  const legacy = statement ? isLegacyStatement(statement) : false;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space wrap>
        <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/patrimoine/statements`)}>{t('Retour')}</Button>
        <Title level={3} style={{ margin: 0 }}>
          {t('Détail du relevé')}
        </Title>
      </Space>
      {error ? <Alert type="error" showIcon message={error} /> : null}

      {statement && legacy ? (
        <Alert
          type="warning"
          showIcon
          message={t("Relevé calculé selon l'ancienne méthode")}
          description={
            statement.status === 'PAID'
              ? t(
                  "Le loyer du contrat y figure comme loyer encaissé, et aucun honoraire n'est déduit. Ce relevé est déjà réglé : il ne peut plus être recalculé, l'écart se régularise sur le relevé suivant."
                )
              : t(
                  "Le loyer du contrat y figure comme loyer encaissé, et aucun honoraire n'est déduit. Recalculez-le avant de l'envoyer : il repassera en brouillon."
                )
          }
          action={
            statement.status !== 'PAID' ? (
              <Button type="primary" loading={recomputing} onClick={() => void handleRecompute()}>
                {t('Recalculer')}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {/* Taux nul ET aucun honoraire : rien n'était paramétré. Un taux nul avec
          des honoraires veut seulement dire que les baux du relevé n'ont pas
          tous le même taux. */}
      {statement && !legacy && statement.managementFeeRate === null && Number(statement.totalManagementFees) === 0 ? (
        <Alert
          type="info"
          showIcon
          message={t("Aucun honoraire déduit : le taux de l'agence n'était pas fixé au moment du calcul")}
          description={
            <Space wrap>
              <Link to={`/tenant/${effectiveTenantId}/settings/finance`}>{t('Fixer le taux d’honoraires')}</Link>
              {statement.status === 'DRAFT' ? (
                <Button size="small" loading={recomputing} onClick={() => void handleRecompute()}>
                  {t('Recalculer')}
                </Button>
              ) : null}
            </Space>
          }
        />
      ) : null}

      <Card loading={loading}>
        {statement ? (
          <Descriptions bordered column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label={t('Période')}>{statement.period}</Descriptions.Item>
            <Descriptions.Item label={t('Statut')}>
              <Space size={4} wrap>
                <Tag>{statementStatusLabel(statement.status)}</Tag>
                {legacy ? <Tag color="warning">{t('Ancien calcul')}</Tag> : null}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label={t('Propriétaire')} span="filled">
              {ownerLabel(statement)}
            </Descriptions.Item>

            {legacy ? (
              <>
                <Descriptions.Item label={t('Loyers (loyer du contrat)')}>
                  <MoneyValue value={statement.totalRevenue} />
                </Descriptions.Item>
                <Descriptions.Item label={t('Dépenses')}>
                  <MoneyValue value={statement.totalExpenses} />
                </Descriptions.Item>
              </>
            ) : (
              <>
                <Descriptions.Item label={t('Loyers appelés')}>
                  <MoneyValue value={statement.totalRentDue} />
                </Descriptions.Item>
                <Descriptions.Item label={t('Loyers encaissés')}>
                  <MoneyValue value={statement.totalRevenue} />
                </Descriptions.Item>
                <Descriptions.Item label={t('Restant dû par les locataires')} span="filled">
                  <MoneyValue value={statement.totalArrears} />
                </Descriptions.Item>
                <Descriptions.Item
                  label={
                    statement.managementFeeRate !== null
                      ? t('Honoraires de gestion ({{rate}})', { rate: rateLabel(statement.managementFeeRate) })
                      : t('Honoraires de gestion')
                  }
                >
                  <MoneyValue value={statement.totalManagementFees} />
                </Descriptions.Item>
                <Descriptions.Item
                  label={
                    statement.vatRate !== null
                      ? t('TVA sur honoraires ({{rate}})', { rate: rateLabel(statement.vatRate) })
                      : t('TVA sur honoraires')
                  }
                >
                  <MoneyValue value={statement.totalManagementFeesVat} />
                </Descriptions.Item>
                <Descriptions.Item label={t('Dépenses')} span="filled">
                  <MoneyValue value={statement.totalExpenses} />
                </Descriptions.Item>
              </>
            )}

            <Descriptions.Item label={t('Net à reverser')}>
              <strong>
                <MoneyValue value={statement.netAmount} signed />
              </strong>
            </Descriptions.Item>
            <Descriptions.Item label={t('Envoyé le')}>
              {statement.sentAt ? new Date(statement.sentAt).toLocaleString(activeLocale()) : '-'}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Card>

      <Card title={t('Lignes du relevé')} loading={loading}>
        <Table
          scroll={{ x: 'max-content' }}
          rowKey="id"
          dataSource={statement?.items ?? []}
          pagination={false}
          columns={[
            {
              title: t('Bien'),
              key: 'property',
              render: (_: unknown, record: OwnerStatement['items'][number]) => propertyLabel(record)
            },
            { title: t('Libellé'), dataIndex: 'label' },
            {
              title: t('Type'),
              dataIndex: 'type',
              render: (value: OwnerStatement['items'][number]['type']) => <Tag>{statementItemTypeLabel(value)}</Tag>
            },
            {
              title: t('Montant'),
              dataIndex: 'amount',
              align: 'end' as const,
              render: (value: number) => <MoneyValue value={value} />
            }
          ]}
        />
      </Card>
    </Space>
  );
};
