import React from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DatePicker, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { getAgentCommissions } from '../../services/agent-commissions-service';
import type { AgentCommissionDetailLine, AgentCommissionLine } from '../../services/agent-commissions-service';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue, StatCard } from '../../components/primitives';
import { dateFormat, formatPercent } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Text } = Typography;

/**
 * Commissions des agents — lot 2 de la gestion locative.
 *
 * L'état mensuel des honoraires de gestion, ventilé par collaborateur
 * gestionnaire : combien ses baux ont généré, et ce qui lui est dû. Construit
 * sur le même modèle que les écrans de rapport du lot 1
 * (`pages/finance/BalanceClients.tsx`, `BalanceAgee.tsx`) — mêmes primitives,
 * mêmes trois états délégués, `<PageHeader>` puis indicateurs puis liste —
 * mais sans `<DataView>` : la liste se déplie ligne par ligne sur le détail
 * des encaissements, et `<DataView>` n'expose pas cette forme. Le tableau est
 * donc un `<Table>` d'Ant Design ordinaire, comme le pratique déjà
 * `pages/TenantPortal/Payments.tsx` pour la même raison.
 *
 * Contrat : `lot2-contrat-api.md` (scratchpad de l'atelier), section 5.
 * L'API n'existe pas encore ; l'écran est codé contre le contrat et testé
 * avec un mock de `services/agent-commissions-service.ts`.
 *
 * **La période est dans l'URL** (`?period=YYYY-MM`), comme le tri et les
 * filtres des autres écrans de la refonte (§10.1) : un lien vers le mois
 * consulté, partagé ou rechargé, rouvre le même état.
 *
 * **« Sans gestionnaire » n'est pas une anomalie tue.** Le contrat prévoit une
 * ligne dédiée (`agentUserId: null`) pour les honoraires de baux sans
 * gestionnaire désigné ; elle porte une aide qui dit quoi faire, plutôt que de
 * laisser deviner pourquoi une part de la recette n'est attribuée à personne.
 *
 * **Les honoraires sont figés à l'encaissement.** Rien ici ne recalcule quoi
 * que ce soit à partir des taux courants : la note sous le tableau le dit
 * explicitement, pour qu'un taux modifié après coup ne fasse pas soupçonner
 * une erreur de calcul sur une commission déjà versée.
 */

const PERIOD_KEY = 'period';

function periodeCourante(): string {
  return dayjs().format('YYYY-MM');
}

/** La colonne « Agent » : le nom, et l'aide sur la ligne sans gestionnaire. */
function colonneAgent(agent: AgentCommissionLine): React.ReactNode {
  if (agent.agentUserId !== null) return agent.agentName;
  return (
    <span>
      {agent.agentName}{' '}
      <Tooltip title={t('Désignez un gestionnaire sur la fiche du bail pour que ses honoraires lui soient attribués.')}>
        <InfoCircleOutlined style={{ color: 'var(--text-tertiary)' }} aria-label={t('Aide')} />
      </Tooltip>
    </span>
  );
}

export const CommissionsAgents: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const period = searchParams.get(PERIOD_KEY) || periodeCourante();

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('agent-commissions', tenantId, { period }),
    queryFn: () => getAgentCommissions(tenantId as string, period),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const handlePeriodChange = (date: dayjs.Dayjs | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      // `null` (bouton d'effacement) ne doit pas laisser un écran sans
      // période : on retombe sur le mois courant plutôt que sur une adresse
      // sans intention.
      next.set(PERIOD_KEY, date ? date.format('YYYY-MM') : periodeCourante());
      return next;
    });
  };

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const colonnesDetail: ColumnsType<AgentCommissionDetailLine> = [
    {
      title: t("Date d'encaissement"),
      key: 'date',
      render: (_, ligne) => dayjs(ligne.collectedAt).format(dateFormat('short'))
    },
    {
      title: t('Bail'),
      key: 'bail',
      render: (_, ligne) => <Link to={`/tenant/${tenantId}/rental/leases/${ligne.leaseId}`}>{ligne.leaseNumber}</Link>
    },
    { title: t('Bien'), key: 'bien', render: (_, ligne) => ligne.propertyTitle },
    {
      title: t('Montant encaissé'),
      key: 'encaisse',
      align: 'end',
      render: (_, ligne) => <MoneyValue value={ligne.collectedAmount} />
    },
    {
      title: t('Honoraires'),
      key: 'honoraires',
      align: 'end',
      render: (_, ligne) => <MoneyValue value={ligne.feeAmount} />
    },
    {
      title: t("Part de l'agent"),
      key: 'part',
      align: 'end',
      render: (_, ligne) => <MoneyValue value={ligne.shareAmount} />
    }
  ];

  const colonnesAgents: ColumnsType<AgentCommissionLine> = [
    { title: t('Agent'), key: 'agent', render: (_, agent) => colonneAgent(agent) },
    {
      title: t('Part'),
      key: 'sharePercent',
      align: 'end',
      render: (_, agent) => (agent.sharePercent !== null ? formatPercent(agent.sharePercent) : '—')
    },
    { title: t('Encaissements'), key: 'feeCount', align: 'end', render: (_, agent) => agent.feeCount },
    {
      title: t('Honoraires HT'),
      key: 'feesAmount',
      align: 'end',
      render: (_, agent) => <MoneyValue value={agent.feesAmount} />
    },
    {
      title: t('Commission due'),
      key: 'shareAmount',
      align: 'end',
      render: (_, agent) => <MoneyValue value={agent.shareAmount} />
    }
  ];

  const agents = data?.agents ?? [];

  return (
    <>
      <PageHeader title={t('Commissions des agents')} />

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)'
        }}
      >
        <div>
          <div>
            <label htmlFor="commissions-agents-periode">{t('Période')}</label>
          </div>
          <DatePicker
            id="commissions-agents-periode"
            picker="month"
            allowClear={false}
            format={dateFormat('month')}
            value={dayjs(period, 'YYYY-MM')}
            onChange={handlePeriodChange}
          />
        </div>
      </div>

      {erreurRequete ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger les commissions des agents.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetch(), primary: true }]}
        />
      ) : isPending ? (
        <StateBlock variant="loading" />
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-6)'
            }}
          >
            <StatCard label={t('Honoraires HT')} value={<MoneyValue value={data?.totals.feesAmount} />} />
            <StatCard label={t('TVA')} value={<MoneyValue value={data?.totals.vatAmount} />} />
            <StatCard
              label={t('Commissions dues aux agents')}
              value={<MoneyValue value={data?.totals.shareAmount} />}
            />
            <StatCard
              label={t('Honoraires sans gestionnaire')}
              value={<MoneyValue value={data?.totals.unassignedFeesAmount} />}
            />
          </div>

          {agents.length === 0 ? (
            <StateBlock variant="empty" description={t('Aucun honoraire encaissé sur cette période.')} />
          ) : (
            <>
              <Table<AgentCommissionLine>
                dataSource={agents}
                columns={colonnesAgents}
                rowKey={agent => agent.agentUserId ?? 'sans-gestionnaire'}
                pagination={false}
                loading={isFetching && !isPending}
                scroll={{ x: 'max-content' }}
                aria-label={t('Commissions des agents')}
                expandable={{
                  expandedRowRender: agent =>
                    agent.lines.length === 0 ? (
                      <Text type="secondary">{t('Aucun encaissement')}</Text>
                    ) : (
                      <Table<AgentCommissionDetailLine>
                        dataSource={agent.lines}
                        columns={colonnesDetail}
                        rowKey={ligne => ligne.id}
                        pagination={false}
                        size="small"
                        aria-label={t('Détail des encaissements de {{agentName}}', { agentName: agent.agentName })}
                      />
                    )
                }}
              />

              <Text type="secondary" style={{ display: 'block', marginTop: 'var(--space-3)' }}>
                {t(
                  'Les honoraires sont figés à l’encaissement : un changement de taux ou de part ne modifie pas une commission déjà calculée.'
                )}
              </Text>
            </>
          )}
        </>
      )}
    </>
  );
};
