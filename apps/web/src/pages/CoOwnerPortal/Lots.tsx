import React from 'react';
import { Button, Card, Space, Typography } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DataCard, MoneyValue, SkeletonList, StateBlock } from '../../components/primitives';
import { t } from '../../i18n/t';
import { listMyLots, type CoOwnerLot } from '../../services/coowner-portal-service';
import { BalanceDirectionTag, lotTypeLabel } from './labels';
import { portalErrorMessage } from './portal-error';

const { Title, Text } = Typography;

/**
 * « Mes lots » — accueil du portail copropriétaire.
 *
 * Les lots du copropriétaire dans toutes les copropriétés de l'agence,
 * regroupés par copropriété, avec le solde du compte de chaque lot : en
 * valeur absolue, avec la mention « Débiteur » ou « Créditeur », jamais un
 * nombre signé sans explication.
 */
function groupBySyndicate(lots: CoOwnerLot[]) {
  const groups = new Map<string, { key: string; name: string; address: string; lots: CoOwnerLot[] }>();
  for (const lot of lots) {
    const key = lot.syndicate?.id ?? 'sans-copropriete';
    if (!groups.has(key)) {
      groups.set(key, { key, name: lot.syndicate?.name ?? '—', address: lot.syndicate?.address ?? '', lots: [] });
    }
    groups.get(key)?.lots.push(lot);
  }
  return Array.from(groups.values());
}

function LotCard({ lot, onOpen }: { lot: CoOwnerLot; onOpen: () => void }) {
  const fields = [
    { label: t('Tantièmes généraux'), value: lot.generalShares },
    ...(lot.specialShares !== null ? [{ label: t('Tantièmes spéciaux'), value: lot.specialShares }] : []),
    { label: t('Part détenue'), value: `${lot.ownershipPercentage} %` }
  ];
  return (
    <DataCard
      title={t('Lot {{lotNumber}}', { lotNumber: lot.lotNumber })}
      subtitle={lotTypeLabel(lot.lotType)}
      status={lot.balance ? <BalanceDirectionTag direction={lot.balance.direction} /> : undefined}
      highlight={
        lot.balance ? (
          <MoneyValue value={lot.balance.amount} />
        ) : (
          <Text type="secondary">{t('Aucun compte ouvert')}</Text>
        )
      }
      fields={fields}
      onOpen={onOpen}
      aria-label={t('Lot {{lotNumber}}', { lotNumber: lot.lotNumber })}
    />
  );
}

export default function CoOwnerLots() {
  const navigate = useNavigate();
  const {
    data: lots,
    isPending,
    isFetching,
    error,
    refetch
  } = useQuery({
    queryKey: ['coowner-portal', 'lots'],
    queryFn: () => listMyLots()
  });

  if (isPending) {
    return <SkeletonList rows={3} />;
  }

  if (error || !lots) {
    return (
      <StateBlock
        variant="error"
        description={portalErrorMessage(error, t('Impossible de charger vos lots.'))}
        actions={[{ label: t('Réessayer'), onClick: () => void refetch(), primary: true }]}
      />
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Mes lots')}</Title>
          <Text type="secondary">{t('Vos lots en copropriété, et le solde du compte de chacun.')}</Text>
        </div>
        <Button icon={<SyncOutlined />} onClick={() => void refetch()} loading={isFetching}>
          {t('Actualiser')}
        </Button>
      </div>

      {lots.length === 0 ? (
        <StateBlock variant="empty" description={t("Aucun lot n'est ouvert à votre compte pour le moment.")} />
      ) : (
        groupBySyndicate(lots).map(group => (
          <Card
            key={group.key}
            title={group.name}
            extra={group.address ? <Text type="secondary">{group.address}</Text> : null}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {group.lots.map(lot => (
                <LotCard key={lot.id} lot={lot} onOpen={() => navigate(`/copropriete/lots/${lot.id}`)} />
              ))}
            </Space>
          </Card>
        ))
      )}
    </Space>
  );
}
