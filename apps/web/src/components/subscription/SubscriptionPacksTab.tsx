import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Col, Row, Space, Spin, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  cancelItemRemoval,
  getAccountCatalog,
  type AccountItem,
  type CatalogOffer
} from '../../services/subscription-account-service';
import { formatMoney, StatusTag, Table } from '../primitives';
import { AddItemModal } from './AddItemModal';
import { ExtensionRequestCard } from './ExtensionRequestCard';
import { RemoveItemModal } from './RemoveItemModal';
import { apiErrorMessage, capacitiesSummary, formatLongDate, moduleLabel } from './subscription-account-labels';
import type { SubscriptionAccount } from './useSubscriptionAccount';
import { t } from '../../i18n/t';

const { Text, Paragraph, Title } = Typography;

interface Props {
  tenantId: string;
  account: SubscriptionAccount;
}

/** Onglet « Packs et extensions » : éléments détenus, catalogue, ajout, retrait, autre demande. */
export const SubscriptionPacksTab: React.FC<Props> = ({ tenantId, account }) => {
  const { message } = App.useApp();
  const { overview, entitlements, version, refreshAfterChange } = account;
  const [catalog, setCatalog] = useState<CatalogOffer[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [adding, setAdding] = useState<CatalogOffer | null>(null);
  const [removing, setRemoving] = useState<AccountItem | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAccountCatalog(tenantId)
      .then(offers => {
        if (cancelled) return;
        setCatalog(offers);
        setCatalogError(null);
      })
      .catch(err => {
        if (!cancelled) setCatalogError(apiErrorMessage(err, t('Erreur lors du chargement du catalogue')));
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, version]);

  const handleCancelRemoval = useCallback(
    async (item: AccountItem) => {
      setCancelingId(item.id);
      try {
        await cancelItemRemoval(tenantId, item.id);
        message.success(t('Retrait annulé : {{name}} reste dans votre abonnement', { name: item.name }));
        await refreshAfterChange();
      } catch (err) {
        message.error(apiErrorMessage(err, t("Erreur lors de l'annulation du retrait")));
      } finally {
        setCancelingId(null);
      }
    },
    [tenantId, message, refreshAfterChange]
  );

  if (!overview) {
    return <Alert type="error" showIcon message={account.overviewError ?? t('Erreur lors du chargement du compte')} />;
  }

  const canManage = overview.canManage;
  const columns: ColumnsType<AccountItem> = [
    {
      title: t('Élément'),
      key: 'name',
      exportValue: item => item.name,
      render: (_: unknown, item) => (
        <Space direction="vertical" size={0}>
          <Text strong>{item.name}</Text>
          <Text type="secondary">
            {item.kind === 'PACK' ? t('Pack') : item.kind === 'SETUP' ? t('Mise en place') : t('Extension')}
          </Text>
        </Space>
      )
    },
    { title: t('Quantité'), dataIndex: 'quantity', key: 'quantity' },
    {
      title: t('Prix mensuel (HT)'),
      key: 'monthlyAmount',
      exportValue: item => item.monthlyAmount,
      render: (_: unknown, item) => formatMoney(item.monthlyAmount)
    },
    {
      title: t('Capacité apportée'),
      key: 'capacities',
      exportValue: item => capacitiesSummary(item.capacities),
      render: (_: unknown, item) => capacitiesSummary(item.capacities) || '—'
    },
    {
      title: t('Depuis le'),
      key: 'startsAt',
      exportValue: item => formatLongDate(item.startsAt),
      render: (_: unknown, item) => formatLongDate(item.startsAt)
    },
    {
      title: t('Statut'),
      key: 'status',
      exportValue: item =>
        item.removalScheduled ? t('Retrait programmé le {{date}}', { date: formatLongDate(item.endsAt) }) : t('Actif'),
      render: (_: unknown, item) =>
        item.removalScheduled ? (
          <StatusTag
            status="PENDING"
            tone="warning"
            label={t('Retrait programmé le {{date}}', { date: formatLongDate(item.endsAt) })}
          />
        ) : (
          <StatusTag status="ACTIVE" />
        )
    }
  ];
  if (canManage) {
    columns.push({
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, item) => (
        <Space wrap>
          {item.canScheduleRemoval && (
            <Button size="small" danger onClick={() => setRemoving(item)}>
              {t('Retirer à l’échéance')}
            </Button>
          )}
          {item.canCancelRemoval && (
            <Button size="small" loading={cancelingId === item.id} onClick={() => handleCancelRemoval(item)}>
              {t('Annuler le retrait')}
            </Button>
          )}
        </Space>
      )
    });
  }

  const packs = (catalog ?? []).filter(offer => offer.kind === 'PACK');
  const extensions = (catalog ?? []).filter(offer => offer.kind === 'EXTENSION');

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {!canManage && (
        <Alert
          type={overview.manageBlockedReason ? 'warning' : 'info'}
          showIcon
          message={overview.manageBlockedReason ?? t('Seul l’administrateur de l’agence peut modifier l’abonnement.')}
        />
      )}

      <Card title={t('Éléments de votre abonnement')}>
        <Table<AccountItem>
          exportFilename={t('Éléments de votre abonnement')}
          aria-label={t('Éléments de votre abonnement')}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
          dataSource={overview.items}
          columns={columns}
        />
      </Card>

      {!overview.isParticulier && (
        <Card title={t('Ajouter à votre abonnement')}>
          {catalogError && <Alert type="error" showIcon message={catalogError} />}
          {!catalog && !catalogError && <Spin />}
          {catalog && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <OfferGroup title={t('Packs')} offers={packs} canManage={canManage} onAdd={setAdding} />
              <OfferGroup title={t('Extensions')} offers={extensions} canManage={canManage} onAdd={setAdding} />
              <Paragraph type="secondary" style={{ margin: 0 }}>
                {t('Pour changer de pack ou résilier, contactez ImmoTopia.')}
              </Paragraph>
            </Space>
          )}
        </Card>
      )}

      <ExtensionRequestCard tenantId={tenantId} packs={entitlements?.packs ?? []} />

      <AddItemModal
        tenantId={tenantId}
        offer={adding}
        billingCycle={overview.billingCycle}
        onClose={() => setAdding(null)}
        onAdded={refreshAfterChange}
      />
      <RemoveItemModal
        tenantId={tenantId}
        item={removing}
        dueDate={overview.currentPeriodEnd}
        onClose={() => setRemoving(null)}
        onDone={refreshAfterChange}
      />
    </Space>
  );
};

const OfferGroup: React.FC<{
  title: string;
  offers: CatalogOffer[];
  canManage: boolean;
  onAdd: (offer: CatalogOffer) => void;
}> = ({ title, offers, canManage, onAdd }) => {
  if (offers.length === 0) return null;
  return (
    <div>
      <Title level={5} style={{ marginBlockStart: 0 }}>
        {title}
      </Title>
      <Row gutter={[16, 16]}>
        {offers.map(offer => (
          <Col key={offer.code} xs={24} md={12} xl={8}>
            <OfferCard offer={offer} canManage={canManage} onAdd={onAdd} />
          </Col>
        ))}
      </Row>
    </div>
  );
};

const OfferCard: React.FC<{ offer: CatalogOffer; canManage: boolean; onAdd: (offer: CatalogOffer) => void }> = ({
  offer,
  canManage,
  onAdd
}) => {
  const capacities = capacitiesSummary(offer.capacities);
  return (
    <Card size="small" style={{ height: '100%' }} data-testid={`offer-${offer.code}`}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Space wrap>
          <Text strong>{offer.name}</Text>
          {offer.held && <Tag color="green">{t('Déjà détenu')}</Tag>}
        </Space>
        {offer.description && <Text type="secondary">{offer.description}</Text>}
        <Text strong>
          {offer.kind === 'EXTENSION'
            ? t('{{price}} HT / mois par unité', { price: formatMoney(offer.unitMonthlyPrice) })
            : t('{{price}} HT / mois', { price: formatMoney(offer.unitMonthlyPrice) })}
        </Text>
        {capacities && <Text>{t('Capacité : {{value}}', { value: capacities })}</Text>}
        {offer.modules.length > 0 && (
          <Space wrap size={4}>
            {offer.modules.map(key => (
              <Tag key={key}>{moduleLabel(key)}</Tag>
            ))}
          </Space>
        )}
        {!offer.available && (
          <Text type="warning">{offer.unavailableReason ?? t('Non disponible pour votre abonnement.')}</Text>
        )}
        {canManage && offer.available && (
          <Button type="primary" onClick={() => onAdd(offer)} aria-label={t('Ajouter {{name}}', { name: offer.name })}>
            {t('Ajouter')}
          </Button>
        )}
      </Space>
    </Card>
  );
};
