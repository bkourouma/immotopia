import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Popconfirm, Space, Tag } from 'antd';
import { listChargeCallPaymentLinks, revokeChargeCallPaymentLink } from '../../services/syndic-online-payment-service';
import type { ChargeCallPaymentLinkSummary } from '../../services/syndic-online-payment-service';
import { ChargeCallPaymentLinkButton, chargeCallLinkErrorText } from './ChargeCallPaymentLinkButton';
import { MoneyValue, Table } from '../primitives';
import { activeLocale } from '../../i18n/format';
import { displayCurrency } from '../../utils/syndic-currency';
import { t } from '../../i18n/t';

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString(activeLocale()) : '-';
}

function statusTag(status: ChargeCallPaymentLinkSummary['status']) {
  if (status === 'ACTIVE') return <Tag color="success">{t('Actif')}</Tag>;
  if (status === 'EXPIRED') return <Tag>{t('Expiré')}</Tag>;
  return <Tag color="error">{t('Révoqué')}</Tag>;
}

function paymentTag(status: ChargeCallPaymentLinkSummary['payment']['status']) {
  switch (status) {
    case 'PENDING':
      return <Tag color="processing">{t('Paiement en cours')}</Tag>;
    case 'SUCCESS':
      return <Tag color="success">{t('Payé')}</Tag>;
    case 'FAILED':
      return <Tag color="error">{t('Échoué')}</Tag>;
    case 'CANCELED':
      return <Tag>{t('Annulé')}</Tag>;
    case 'EXPIRED':
      return <Tag>{t('Expiré')}</Tag>;
    case 'REVIEW':
      return <Tag color="warning">{t('À vérifier')}</Tag>;
    default:
      return <Tag>{t('Aucun paiement')}</Tag>;
  }
}

export interface ChargeCallPaymentLinksPanelProps {
  tenantId: string;
  syndicId: string;
  chargeId: string;
  remaining: number;
  status?: string | null;
  periodLabel?: string;
  /** `SYNDIC_VIEW` : sans ce droit la section n'est pas rendue. */
  canView?: boolean;
  /** `SYNDIC_EDIT` : sans ce droit ni création ni révocation. */
  canCreate?: boolean;
  /** Appelé après une création ou une révocation (l'écran parent peut se rafraîchir). */
  onChanged?: () => void;
  /** Devise de l'appel, pour les montants des paiements. */
  currency?: string;
}

/** Section « Liens de paiement » d'un appel de charges : création et liste des liens. */
export const ChargeCallPaymentLinksPanel: React.FC<ChargeCallPaymentLinksPanelProps> = ({
  tenantId,
  syndicId,
  chargeId,
  remaining,
  status,
  periodLabel,
  canView = true,
  canCreate = true,
  onChanged,
  currency
}) => {
  const { message } = App.useApp();
  const [links, setLinks] = useState<ChargeCallPaymentLinkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setLinks(await listChargeCallPaymentLinks(tenantId, syndicId, chargeId));
    } catch (e: any) {
      setLoadError(chargeCallLinkErrorText(e, t('Erreur de chargement des liens de paiement')));
    } finally {
      setLoading(false);
    }
  }, [tenantId, syndicId, chargeId]);

  useEffect(() => {
    if (canView) void reload();
  }, [canView, reload]);

  if (!canView) return null;

  const handleRevoke = async (linkId: string) => {
    setRevokingId(linkId);
    try {
      await revokeChargeCallPaymentLink(tenantId, syndicId, chargeId, linkId);
      message.success(t('Lien révoqué.'));
      await reload();
      onChanged?.();
    } catch (e: any) {
      message.error(chargeCallLinkErrorText(e, t('Échec de la révocation du lien')));
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <ChargeCallPaymentLinkButton
          tenantId={tenantId}
          syndicId={syndicId}
          chargeId={chargeId}
          remaining={remaining}
          status={status}
          canCreate={canCreate}
          periodLabel={periodLabel}
          onChanged={() => {
            void reload();
            onChanged?.();
          }}
        />
      </div>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          message={loadError}
          action={
            <Button size="small" onClick={() => void reload()}>
              {t('Réessayer')}
            </Button>
          }
        />
      ) : null}
      <Table
        exportFilename={t('Liens de paiement')}
        scroll={{ x: 'max-content' }}
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={links}
        pagination={false}
        locale={{ emptyText: t('Aucun lien de paiement.') }}
        columns={[
          {
            title: t('Créé le'),
            dataIndex: 'createdAt',
            render: (v: string, r: ChargeCallPaymentLinkSummary) => (
              <Space size="small" wrap>
                {formatDateTime(v)}
                {r.createdByUserId === null ? <Tag>{t('Automatique')}</Tag> : null}
              </Space>
            )
          },
          { title: t('Expire le'), dataIndex: 'expiresAt', render: (v: string) => formatDateTime(v) },
          {
            title: t('Consultations'),
            dataIndex: 'viewCount',
            exportValue: (r: ChargeCallPaymentLinkSummary) => r.viewCount,
            align: 'end' as const,
            render: (v: number) => <bdi dir="ltr">{v.toLocaleString(activeLocale())}</bdi>
          },
          {
            title: t('Dernière consultation'),
            dataIndex: 'lastViewedAt',
            render: (v: string | null) => formatDateTime(v)
          },
          {
            title: t('Statut'),
            dataIndex: 'status',
            render: (v: ChargeCallPaymentLinkSummary['status']) => statusTag(v)
          },
          {
            title: t('Paiement'),
            key: 'payment',
            render: (_: unknown, r: ChargeCallPaymentLinkSummary) => (
              <Space size="small">
                {paymentTag(r.payment.status)}
                {r.payment.amount != null && r.payment.status !== 'NONE' ? (
                  <MoneyValue value={r.payment.amount} currency={displayCurrency(currency)} />
                ) : null}
              </Space>
            )
          },
          {
            title: '',
            key: 'actions',
            align: 'end' as const,
            render: (_: unknown, r: ChargeCallPaymentLinkSummary) =>
              canCreate && r.status === 'ACTIVE' ? (
                <Popconfirm
                  title={t('Révoquer ce lien ?')}
                  description={t('Le copropriétaire ne pourra plus payer avec ce lien.')}
                  okText={t('Révoquer')}
                  cancelText={t('Annuler')}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleRevoke(r.id)}
                >
                  <Button size="small" danger loading={revokingId === r.id}>
                    {t('Révoquer')}
                  </Button>
                </Popconfirm>
              ) : null
          }
        ]}
      />
    </Space>
  );
};
