import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Space, Table, Tag, Typography, message } from 'antd';
import { DashboardLayout } from '../../../components/dashboard/dashboard-layout';
import { OwnerStatementGenerator } from '../../../components/patrimoine/OwnerStatementGenerator';
import { createOwnerStatement, listOwnerStatements, sendOwnerStatement } from '../../../services/patrimoine-service';
import { listContacts } from '../../../services/crm-service';
import { listProperties } from '../../../services/property-service';
import type { OwnerStatement } from '../../../types/patrimoine-types';
import { useAuth } from '../../../hooks/useAuth';

const { Title, Text } = Typography;

function statementStatusLabel(status: OwnerStatement['status']): string {
  if (status === 'DRAFT') return 'Brouillon';
  if (status === 'SENT') return 'Envoyé';
  if (status === 'PAID') return 'Payé';
  return status;
}

function sendReasonLabel(reason?: string): string {
  if (reason === 'NO_EMAIL') {
    return "Le propriétaire n'a pas d'email valide.";
  }
  if (reason === 'NO_EMAIL_OR_CONSENT') {
    return "Le propriétaire n'a pas d'email valide ou son consentement email est désactivé.";
  }
  if (reason === 'EVENT_DISABLED') {
    return "L'envoi est désactivé pour ce type de notification.";
  }
  if (reason === 'STATEMENT_NOT_FOUND') {
    return 'Le relevé est introuvable.';
  }
  return 'Relevé non envoyé.';
}

export const OwnerStatementsPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [loading, setLoading] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [sendLoadingId, setSendLoadingId] = useState<string | null>(null);
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
      setPropertyOptions(properties.properties.map((property) => ({ value: property.id, label: property.title })));
      const owners = contacts.contacts.filter((contact) =>
        (contact.roles || []).some((role) => role.active && role.role === 'PROPRIETAIRE')
      );
      setOwnerOptions(
        owners.map((owner) => ({
          value: owner.id,
          label: `${owner.firstName} ${owner.lastName}`.trim() || owner.email || owner.id
        }))
      );
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Erreur de chargement des relevés');
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
      message.success('Relevé généré');
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Échec de génération du relevé');
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
        message.success(result.whatsappSent ? 'Relevé envoyé (email + WhatsApp)' : 'Relevé envoyé (email)');
      } else {
        message.warning(sendReasonLabel(result.reason));
      }
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.error || "Échec de l'envoi du relevé");
    } finally {
      setSendLoadingId(null);
    }
  };

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2} style={{ marginBottom: 0 }}>
            Relevés de gérance
          </Title>
          <Text type="secondary">Génération, suivi et envoi des relevés propriétaires</Text>
        </div>

        {error ? <Alert type="error" showIcon message={error} /> : null}
        <OwnerStatementGenerator
          ownerOptions={ownerOptions}
          propertyOptions={propertyOptions}
          loading={createLoading}
          onGenerate={handleGenerate}
        />

        <Card title="Historique des relevés">
          <Table
            loading={loading}
            rowKey="id"
            dataSource={statements}
            columns={[
              { title: 'Période', dataIndex: 'period' },
              {
                title: 'Total revenus',
                dataIndex: 'totalRevenue',
                render: (value: number) => Number(value).toLocaleString('fr-FR')
              },
              {
                title: 'Total charges',
                dataIndex: 'totalExpenses',
                render: (value: number) => Number(value).toLocaleString('fr-FR')
              },
              {
                title: 'Net',
                dataIndex: 'netAmount',
                render: (value: number, record: OwnerStatement) =>
                  `${Number(value).toLocaleString('fr-FR')} ${record.currency}`
              },
              {
                title: 'Statut',
                dataIndex: 'status',
                render: (status: OwnerStatement['status']) => <Tag>{statementStatusLabel(status)}</Tag>
              },
              {
                title: 'Actions',
                key: 'actions',
                render: (_: unknown, record: OwnerStatement) => (
                  <Space>
                    <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/patrimoine/statements/${record.id}`)}>
                      Détails
                    </Button>
                    <Button loading={sendLoadingId === record.id} onClick={() => handleSend(record.id)}>
                      Envoyer
                    </Button>
                  </Space>
                )
              }
            ]}
          />
        </Card>
      </Space>
    </DashboardLayout>
  );
};
