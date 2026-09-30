import React, { useEffect, useState } from 'react';
import { App, Alert, Button, Card, InputNumber, Table, Typography } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  AgentCommissionShare,
  listAgentCommissionShares,
  updateAgentCommissionShare
} from '../../services/agency-finance-settings-service';
import { ModuleNotIncluded } from '../primitives/ModuleNotIncluded';
import { isModuleNotIncludedError } from '../../utils/module-not-included';
import { t } from '../../i18n/t';

const { Text } = Typography;

export interface AgentCommissionCardProps {
  tenantId: string;
}

/**
 * Carte « Commission des collaborateurs » (Lot 2, `lot2-contrat-api.md` §3).
 *
 * La part enregistrée ici sert au calcul de la commission d'un collaborateur
 * sur les baux dont il est le gestionnaire (`agentUserId` du bail) ; elle ne
 * change rien aux honoraires déjà figés sur un encaissement passé.
 */
export const AgentCommissionCard: React.FC<AgentCommissionCardProps> = ({ tenantId }) => {
  const { message } = App.useApp();
  const [agents, setAgents] = useState<AgentCommissionShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notIncluded, setNotIncluded] = useState(false);
  // Brouillon local par collaborateur, distinct de la valeur enregistrée :
  // permet de taper sans enregistrer à chaque frappe, et sans perdre la saisie
  // si `load()` est rappelé entre-temps.
  const [drafts, setDrafts] = useState<Record<string, number | null>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAgentCommissionShares(tenantId);
      setAgents(data);
      setDrafts(Object.fromEntries(data.map(agent => [agent.userId, agent.sharePercent])));
    } catch (e: any) {
      if (isModuleNotIncludedError(e)) {
        setNotIncluded(true);
        return;
      }
      setError(e?.response?.data?.message || t('Erreur lors du chargement des collaborateurs'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [tenantId]);

  const handleSave = async (agent: AgentCommissionShare) => {
    const value = drafts[agent.userId] ?? null;
    setSavingId(agent.userId);
    try {
      const saved = await updateAgentCommissionShare(tenantId, agent.userId, value);
      setAgents(current =>
        current.map(a => (a.userId === agent.userId ? { ...a, sharePercent: saved.sharePercent } : a))
      );
      message.success(t('Part de {{name}} enregistrée', { name: agent.fullName }));
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('Erreur lors de la sauvegarde'));
    } finally {
      setSavingId(null);
    }
  };

  const columns: ColumnsType<AgentCommissionShare> = [
    {
      title: t('Collaborateur'),
      dataIndex: 'fullName',
      key: 'fullName'
    },
    {
      title: t('E-mail'),
      dataIndex: 'email',
      key: 'email'
    },
    {
      title: t('Part (%)'),
      key: 'sharePercent',
      width: 160,
      render: (_, agent) => (
        <InputNumber
          id={`agent-share-${agent.userId}`}
          min={0}
          max={100}
          value={drafts[agent.userId] ?? null}
          onChange={value => setDrafts(current => ({ ...current, [agent.userId]: value }))}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      width: 140,
      render: (_, agent) => (
        <Button
          size="small"
          icon={<SaveOutlined />}
          loading={savingId === agent.userId}
          disabled={drafts[agent.userId] === agent.sharePercent}
          onClick={() => handleSave(agent)}
        >
          {t('Enregistrer')}
        </Button>
      )
    }
  ];

  if (notIncluded) {
    return (
      <Card title={t('Commission des collaborateurs')}>
        <ModuleNotIncluded />
      </Card>
    );
  }

  return (
    <Card title={t('Commission des collaborateurs')}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {t('Part des honoraires HT reversée au collaborateur sur les baux dont il est le gestionnaire.')}
      </Text>
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
      <Table rowKey="userId" columns={columns} dataSource={agents} loading={loading} pagination={false} />
    </Card>
  );
};
