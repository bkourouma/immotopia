import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Alert, Button, Card, Space, Tag, Typography } from 'antd';
import { OwnerStatementGenerator } from '../../../components/patrimoine/OwnerStatementGenerator';
import {
  createOwnerStatement,
  listEligibleOwnerStatementProperties,
  recomputeOwnerStatement,
  sendOwnerStatement
} from '../../../services/patrimoine-service';
import { isLegacyStatement, statementStatusLabel } from '../../../components/patrimoine/owner-statement-helpers';
import { MoneyValue, Table } from '../../../components/primitives';
import { listContacts } from '../../../services/crm-service';
import type { OwnerStatement } from '../../../types/patrimoine-types';
import { useOwnerStatementsList } from './useOwnerStatementsList';
import { useAuth } from '../../../hooks/useAuth';
import { useOwnAssetsOnly } from '../../../hooks/useMenuAccess';
import { t } from '../../../i18n/t';
import { statementApiErrorMessage } from './statement-errors';

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

/** « Titre — REF-001 · adresse » : le titre seul ne distingue pas deux biens du même type. */
export function propertyOptionLabel(property: {
  title: string;
  internalReference?: string | null;
  address?: string | null;
}): string {
  const complement = [property.internalReference, property.address]
    .map(part => (part ?? '').trim())
    .filter(Boolean)
    .join(' · ');
  return complement ? `${property.title} — ${complement}` : property.title;
}

export const OwnerStatementsPage: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;
  const ownAssetsOnly = useOwnAssetsOnly(effectiveTenantId, true);
  const list = useOwnerStatementsList(effectiveTenantId);

  const [loading, setLoading] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [sendLoadingId, setSendLoadingId] = useState<string | null>(null);
  const [recomputeLoadingId, setRecomputeLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ownerOptions, setOwnerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [propertyOptions, setPropertyOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>();
  const [propertyLoading, setPropertyLoading] = useState(false);

  const loadData = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    setError(null);
    try {
      const contacts = await listContacts(effectiveTenantId, { page: 1, limit: 500 });
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
      setError(statementApiErrorMessage(e, t('Erreur de chargement des relevés')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [effectiveTenantId]);

  useEffect(() => {
    if (!effectiveTenantId || !selectedOwnerId) {
      setPropertyOptions([]);
      setPropertyLoading(false);
      return;
    }

    let current = true;
    setPropertyLoading(true);
    void listEligibleOwnerStatementProperties(effectiveTenantId, selectedOwnerId)
      .then(properties => {
        if (!current) return;
        // Les titres ne sont pas uniques : référence et adresse distinguent les lots.
        setPropertyOptions(properties.map(property => ({ value: property.id, label: propertyOptionLabel(property) })));
      })
      .catch(e => {
        if (!current) return;
        setPropertyOptions([]);
        message.error(statementApiErrorMessage(e, t('Erreur de chargement des relevés')));
      })
      .finally(() => {
        if (current) setPropertyLoading(false);
      });
    return () => {
      current = false;
    };
  }, [effectiveTenantId, selectedOwnerId]);

  const handleGenerate = async (payload: { ownerContactId: string; period: string; propertyIds: string[] }) => {
    if (!effectiveTenantId) return;
    setCreateLoading(true);
    try {
      await createOwnerStatement(effectiveTenantId, payload);
      message.success(t('Relevé généré'));
      await loadData();
      void list.refetch();
    } catch (e: any) {
      message.error(statementApiErrorMessage(e, t('Échec de génération du relevé')));
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
      void list.refetch();
    } catch (e: any) {
      message.error(statementApiErrorMessage(e, t("Échec de l'envoi du relevé")));
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
      void list.refetch();
    } catch (e: any) {
      message.error(statementApiErrorMessage(e, t('Échec du recalcul du relevé')));
    } finally {
      setRecomputeLoadingId(null);
    }
  };

  // Toute l'agence, ancien calcul et non payé : compté par le serveur, hors critères et pagination.
  const legacyCount = list.legacyUnpaidCount;
  const listError = list.error ? statementApiErrorMessage(list.error, t('Erreur de chargement des relevés')) : null;

  if (ownAssetsOnly) {
    return (
      <Alert
        type="info"
        showIcon
        message={t('Relevés de gérance non inclus')}
        description={t(
          'Les relevés de gérance concernent des biens de propriétaires tiers : ils ne font pas partie du pack Patrimoine.'
        )}
      />
    );
  }

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2} style={{ marginBottom: 0 }}>
            {t('Relevés de gérance')}
          </Title>
          <Text type="secondary">{t('Génération, suivi et envoi des relevés propriétaires')}</Text>
        </div>

        {error || listError ? <Alert type="error" showIcon message={error || listError} /> : null}
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
          propertyLoading={propertyLoading}
          loading={createLoading}
          onOwnerChange={ownerContactId => {
            setPropertyOptions([]);
            setSelectedOwnerId(ownerContactId);
          }}
          onGenerate={handleGenerate}
        />

        <Card title={t('Historique des relevés')}>
          {!listError ? (
            <Table
              exportFilename={t('Historique des relevés')}
              exportFetchAll={list.exportFetchAll}
              search={list.search.searchProps}
              pagination={list.search.tablePagination(list.total)}
              locale={list.search.isFiltered ? undefined : { emptyText: t('Aucun relevé de gérance pour le moment.') }}
              scroll={{ x: 'max-content' }}
              loading={loading || list.isFetching}
              rowKey="id"
              dataSource={list.statements}
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
                  exportValue: (record: OwnerStatement) =>
                    Number(record.totalManagementFees) + Number(record.totalManagementFeesVat),
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
                  exportValue: (record: OwnerStatement) =>
                    isLegacyStatement(record)
                      ? `${statementStatusLabel(record.status)} — ${t('Ancien calcul')}`
                      : statementStatusLabel(record.status),
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
          ) : null}
        </Card>
      </Space>
    </>
  );
};
