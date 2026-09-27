import React from 'react';
import { Button, Card, Space, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DataCard, DataView, MoneyValue, SkeletonList, SkeletonStats, StateBlock } from '../../components/primitives';
import { t } from '../../i18n/t';
import { getMyLotAccount, listMyChargeCalls, type CoOwnerTransaction } from '../../services/coowner-portal-service';
import { ChargeCallsTable } from './ChargeCallsTable';
import { BalanceDirectionTag, balanceDirectionHint, lotTypeLabel, transactionTypeLabel } from './labels';
import { isNotFound, portalErrorMessage } from './portal-error';

const { Title, Text } = Typography;

/**
 * Détail d'un lot : solde du compte (valeur absolue + « Débiteur » /
 * « Créditeur »), mouvements, et appels de charges du lot.
 *
 * L'identifiant du lot vient de l'URL ; le serveur ne l'accepte que s'il est
 * l'un des lots du copropriétaire connecté, sinon 404 — rendu ici comme un
 * lot introuvable, sans rien dire de plus.
 */
function SoldeApres({ transaction }: { transaction: CoOwnerTransaction }) {
  return (
    <Space size={4}>
      <MoneyValue value={transaction.balanceAfter} />
      {transaction.balanceAfterDirection !== 'A_JOUR' && (
        <BalanceDirectionTag direction={transaction.balanceAfterDirection} />
      )}
    </Space>
  );
}

export default function CoOwnerLotAccount() {
  const { lotId = '' } = useParams<{ lotId: string }>();
  const navigate = useNavigate();

  const account = useQuery({
    queryKey: ['coowner-portal', 'lot-account', lotId],
    queryFn: () => getMyLotAccount(lotId),
    enabled: Boolean(lotId),
    retry: false
  });
  const calls = useQuery({
    queryKey: ['coowner-portal', 'charge-calls', lotId],
    queryFn: () => listMyChargeCalls(lotId),
    enabled: Boolean(lotId) && account.isSuccess,
    retry: false
  });

  const back = (
    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/copropriete')}>
      {t('Mes lots')}
    </Button>
  );

  if (account.isPending) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <SkeletonStats rows={1} />
        <SkeletonList rows={3} />
      </Space>
    );
  }

  if (account.error || !account.data) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {back}
        {isNotFound(account.error) ? (
          <StateBlock variant="empty" description={t('Ce lot est introuvable dans votre espace.')} />
        ) : (
          <StateBlock
            variant="error"
            description={portalErrorMessage(account.error, t('Impossible de charger le compte de ce lot.'))}
            actions={[{ label: t('Réessayer'), onClick: () => void account.refetch(), primary: true }]}
          />
        )}
      </Space>
    );
  }

  const { lot, syndicate, account: solde, transactions } = account.data;

  const columns: ColumnsType<CoOwnerTransaction> = [
    { title: t('Date'), key: 'date', render: (_, tx) => dayjs(tx.transactionDate).format('DD/MM/YYYY') },
    { title: t('Type'), key: 'type', render: (_, tx) => transactionTypeLabel(tx.type) },
    { title: t('Libellé'), dataIndex: 'label', key: 'label' },
    {
      title: t('Débit'),
      key: 'debit',
      align: 'end',
      render: (_, tx) => (tx.debit ? <MoneyValue value={tx.debit} /> : '—')
    },
    {
      title: t('Crédit'),
      key: 'credit',
      align: 'end',
      render: (_, tx) => (tx.credit ? <MoneyValue value={tx.credit} /> : '—')
    },
    { title: t('Solde après'), key: 'balanceAfter', align: 'end', render: (_, tx) => <SoldeApres transaction={tx} /> }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {back}
      <div>
        <Title level={2}>{t('Lot {{lotNumber}}', { lotNumber: lot.lotNumber })}</Title>
        <Text type="secondary">
          {syndicate.name} · {lotTypeLabel(lot.lotType)} ·{' '}
          {t('{{shares}} tantièmes généraux', { shares: lot.generalShares })} ·{' '}
          {t('part détenue {{percent}} %', { percent: lot.ownershipPercentage })}
        </Text>
      </div>

      <Card title={t('Solde du compte')}>
        {solde ? (
          <Space direction="vertical" size={4}>
            <Space size="middle" wrap>
              <Text style={{ fontSize: 'var(--font-size-h2)', fontWeight: 600 }}>
                <MoneyValue value={solde.amount} />
              </Text>
              <BalanceDirectionTag direction={solde.direction} />
            </Space>
            <Text type="secondary">{balanceDirectionHint(solde.direction)}</Text>
          </Space>
        ) : (
          <Text type="secondary">{t("Aucun compte n'est encore ouvert pour ce lot.")}</Text>
        )}
      </Card>

      <Card title={t('Mouvements du compte')}>
        <DataView<CoOwnerTransaction>
          paginated={false}
          items={transactions}
          total={transactions.length}
          page={1}
          pageSize={transactions.length || 20}
          onPageChange={() => {}}
          rowKey={tx => tx.id}
          aria-label={t('Mouvements du compte')}
          emptyDescription={t('Aucun mouvement enregistré sur ce compte.')}
          columns={columns}
          renderCard={tx => (
            <DataCard
              title={tx.label}
              subtitle={`${dayjs(tx.transactionDate).format('DD/MM/YYYY')} · ${transactionTypeLabel(tx.type)}`}
              highlight={<MoneyValue value={tx.debit ?? tx.credit ?? 0} />}
              fields={[
                {
                  label: tx.debit ? t('Débit') : t('Crédit'),
                  value: <MoneyValue value={tx.debit ?? tx.credit ?? 0} />
                },
                { label: t('Solde après'), value: <SoldeApres transaction={tx} /> }
              ]}
            />
          )}
        />
      </Card>

      <Card title={t('Appels de charges du lot')}>
        {calls.isPending ? (
          <SkeletonList rows={2} />
        ) : calls.error ? (
          <StateBlock
            variant="error"
            description={portalErrorMessage(calls.error, t('Impossible de charger les appels de charges.'))}
            actions={[{ label: t('Réessayer'), onClick: () => void calls.refetch(), primary: true }]}
          />
        ) : (
          <ChargeCallsTable calls={calls.data ?? []} showLot={false} />
        )}
      </Card>
    </Space>
  );
}
