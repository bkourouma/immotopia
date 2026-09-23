import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Alert, Button, Card, Space, Table, Tag, Typography } from 'antd';
import { OwnerStatementGenerator } from '../../../components/patrimoine/OwnerStatementGenerator';
import {
  createOwnerStatement,
  listOwnerStatements,
  recomputeOwnerStatement,
  sendOwnerStatement
} from '../../../services/patrimoine-service';
import { isLegacyStatement, statementStatusLabel } from '../../../components/patrimoine/owner-statement-helpers';
import { MoneyValue } from '../../../components/primitives';
import { listContacts } from '../../../services/crm-service';
import { listProperties } from '../../../services/property-service';
import type { OwnerStatement } from '../../../types/patrimoine-types';
import { useAuth } from '../../../hooks/useAuth';
import { t } from '../../../i18n/t';

const { Title, Text } = Typography;

function sendReasonLabel(reason?: string): string {
  if (reason === 'NO_EMAIL') {
    return t("Le propriétaire n'a pas d'email valide.");
  }
  if (reason === 'NO_EMAIL_OR_CONSENT') {
    return t("Le propriétaire n'a pas d'email valide ou son consentement email est désactivé.");
  }
  if (reason === 'EVENT_DISABLED') {
    return t("L'envoi est désactivé pour ce type de notification.");
  }
  if (reason === 'STATEMENT_NOT_FOUND') {
    return t('Le relevé est introuvable.');
  }
  return t('Relevé non envoyé.');
}

export const OwnerStatementsPage: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [loading, setLoading] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [sendLoadingId, setSendLoadingId] = useState<string | null>(null);
  const [recomputeLoadingId, setRecomputeLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statements, setStatements] = useState<OwnerStatement[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [propertyOptions, setPropertyOptions] = useState<Array<{ value: string; label: string }>>([]);

  const loadData = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [statementData, properties, contacts] = await Promise.all([
        listOwnerStatements(effectiveTenantId),
        listProperties(effectiveTenantId, { page: 1, limit: 100 }),
        listContacts(effectiveTenantId, { page: 1, limit: 500 })
      ]);
      setStatements(statementData);
      setPropertyOptions(properties.properties.map(property => ({ value: property.id, label: property.title })));
      const owners = contacts.contacts.filter(contact =>
        (contact.roles || []).some(role => role.active && role.role === 'PROPRIETAIRE')
      );
      setOwnerOptions(
        owners.map(owner => ({
          value: owner.id,
          label: `${owner.firstName} ${owner.lastName}`.trim() || owner.email || owner.id
        }))
      );
    } catch (e: any) {
      setError(e?.response?.data?.error || t('Erreur de chargement des relevés'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [effectiveTenantId]);

  const handleGenerate = async (payload: { ownerContactId: string; period: string; propertyIds: string[] }) => {
    if (!effectiveTenantId) return;
    setCreateLoading(true);
    try {
      await createOwnerStatement(effectiveTenantId, payload);
      message.success(t('Relevé généré'));
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('Échec de génération du relevé'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSend = async (statementId: string) => {
    if (!effectiveTenantId) return;
    setSendLoadingId(statementId);
    try {
      const result = await sendOwnerStatement(effectiveTenantId, statementId);
      if (result.sent) {
        message.success(result.whatsappSent ? t('Relevé envoyé (email + WhatsApp)') : t('Relevé envoyé (email)'));
      } else {
        message.warning(sendReasonLabel(result.reason));
      }
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.error || t("Échec de l'envoi du relevé"));
    } finally {
      setSendLoadingId(null);
    }
  };

  const handleRecompute = async (statementId: string) => {
    if (!effectiveTenantId) return;
    setRecomputeLoadingId(statementId);
    try {
      await recomputeOwnerStatement(effectiveTenantId, statementId);
      message.success(t('Relevé recalculé. Vérifiez-le avant de le renvoyer au propriétaire.'));
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.error || e?.response?.data?.message || t('Échec du recalcul du relevé'));
    } finally {
      setRecomputeLoadingId(null);
    }
  };

  const legacyCount = statements.filter(
    statement => isLegacyStatement(statement) && statement.status !== 'PAID'
  ).length;

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2} style={{ marginBottom: 0 }}>
            {t('Relevés de gérance')}
          </Title>
          <Text type="secondary">{t('Génération, suivi et envoi des relevés propriétaires')}</Text>
        </div>

        {error ? <Alert type="error" showIcon message={error} /> : null}
        {legacyCount > 0 ? (
          <Alert
            type="warning"
            showIcon
            message={t('{{count}} relevé(s) calculé(s) selon l’ancienne méthode', { count: legacyCount })}
            description={t(
              'Ils affichent le loyer du contrat comme loyer encaissé et ne déduisent aucun honoraire. Recalculez-les avant de les envoyer ou de les renvoyer.'
            )}
          />
        ) : null}
        <OwnerStatementGenerator
          ownerOptions={ownerOptions}
          propertyOptions={propertyOptions}
          loading={createLoading}
          onGenerate={handleGenerate}
        />

        <Card title={t('Historique des relevés')}>
          <Table
            scroll={{ x: 'max-content' }}
            loading={loading}
            rowKey="id"
            dataSource={statements}
            columns={[
              { title: t('Période'), dataIndex: 'period' },
              {
                title: t('Propriétaire'),
                key: 'owner',
                render: (_: unknown, record: OwnerStatement) =>
                  `${record.owner?.firstName || ''} ${record.owner?.lastName || ''}`.trim() ||
                  record.owner?.email ||
                  '—'
              },
              {
                title: t('Loyers encaissés'),
                dataIndex: 'totalRevenue',
                align: 'end' as const,
                render: (value: number) => <MoneyValue value={value} />
              },
              {
                title: t('Honoraires et TVA'),
                key: 'fees',
                align: 'end' as const,
                render: (_: unknown, record: OwnerStatement) => (
                  <MoneyValue value={Number(record.totalManagementFees) + Number(record.totalManagementFeesVat)} />
                )
              },
              {
                title: t('Dépenses'),
                dataIndex: 'totalExpenses',
                align: 'end' as const,
                render: (value: number) => <MoneyValue value={value} />
              },
              {
                title: t('Net à reverser'),
                dataIndex: 'netAmount',
                align: 'end' as const,
                render: (value: number) => <MoneyValue value={value} signed />
              },
              {
                title: t('Statut'),
                dataIndex: 'status',
                render: (status: OwnerStatement['status'], record: OwnerStatement) => (
                  <Space size={4} wrap>
                    <Tag>{statementStatusLabel(status)}</Tag>
                    {isLegacyStatement(record) ? <Tag color="warning">{t('Ancien calcul')}</Tag> : null}
                  </Space>
                )
              },
              {
                title: t('Actions'),
                key: 'actions',
                render: (_: unknown, record: OwnerStatement) => {
                  const legacy = isLegacyStatement(record);
                  return (
                    <Space>
                      <Button
                        onClick={() => navigate(`/tenant/${effectiveTenantId}/patrimoine/statements/${record.id}`)}
                      >
                        {t('Détails')}
                      </Button>
                      {legacy && record.status !== 'PAID' ? (
                        <Button
                          type="primary"
                          loading={recomputeLoadingId === record.id}
                          onClick={() => handleRecompute(record.id)}
                        >
                          {t('Recalculer')}
                        </Button>
                      ) : null}
                      {!legacy ? (
                        <Button loading={sendLoadingId === record.id} onClick={() => handleSend(record.id)}>
                          {t('Envoyer')}
                        </Button>
                      ) : null}
                    </Space>
                  );
                }
              }
            ]}
          />
        </Card>
      </Space>
    </>
  );
};
