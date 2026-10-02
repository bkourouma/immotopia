import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Popconfirm, Space, Table, Tag } from 'antd';
import {
  listInstallmentPaymentLinks,
  revokeInstallmentPaymentLink
} from '../../services/installment-payment-link-service';
import type {
  InstallmentPaymentLinkPaymentStatus,
  InstallmentPaymentLinkStatus,
  InstallmentPaymentLinkSummary
} from '../../types/installment-payment-link-types';
import { InstallmentPaymentLinkButton } from './InstallmentPaymentLinkButton';
import { MoneyValue } from '../primitives';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString(activeLocale()) : '-';
}

function errorText(e: any, fallback: string): string {
  return e?.response?.data?.error || e?.response?.data?.message || fallback;
}

function statusTag(status: InstallmentPaymentLinkStatus) {
  if (status === 'ACTIVE') return <Tag color="success">{t('Actif')}</Tag>;
  if (status === 'EXPIRED') return <Tag>{t('Expiré')}</Tag>;
  return <Tag color="error">{t('Révoqué')}</Tag>;
}

function paymentTag(status: InstallmentPaymentLinkPaymentStatus) {
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

export interface InstallmentPaymentLinksPanelProps {
  tenantId: string;
  installmentId: string;
  remaining: number;
  status?: string | null;
  periodLabel?: string;
  /** `RENTAL_PAYMENTS_VIEW` : sans ce droit la section n'est pas rendue. */
  canView?: boolean;
  /** `RENTAL_PAYMENTS_CREATE` : sans ce droit ni création ni révocation. */
  canCreate?: boolean;
}

/** Section « Lien de paiement » du détail d'une échéance : création et liste des liens. */
export const InstallmentPaymentLinksPanel: React.FC<InstallmentPaymentLinksPanelProps> = ({
  tenantId,
  installmentId,
  remaining,
  status,
  periodLabel,
  canView = true,
  canCreate = true
}) => {
  const { message } = App.useApp();
  const [links, setLinks] = useState<InstallmentPaymentLinkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setLinks(await listInstallmentPaymentLinks(tenantId, installmentId));
    } catch (e: any) {
      setLoadError(errorText(e, t('Erreur de chargement des liens de paiement')));
    } finally {
      setLoading(false);
    }
  }, [tenantId, installmentId]);

  useEffect(() => {
    if (canView) void reload();
  }, [canView, reload]);

  if (!canView) return null;

  const handleRevoke = async (linkId: string) => {
    setRevokingId(linkId);
    try {
      await revokeInstallmentPaymentLink(tenantId, installmentId, linkId);
      message.success(t('Lien révoqué.'));
      await reload();
    } catch (e: any) {
      message.error(errorText(e, t('Échec de la révocation du lien')));
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Card title={t('Lien de paiement Mobile Money')}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <InstallmentPaymentLinkButton
            tenantId={tenantId}
            installmentId={installmentId}
            remaining={remaining}
            status={status}
            canCreate={canCreate}
            periodLabel={periodLabel}
            onChanged={() => void reload()}
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
          scroll={{ x: 'max-content' }}
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={links}
          pagination={false}
          locale={{ emptyText: t('Aucun lien de paiement.') }}
          columns={[
            { title: t('Créé le'), dataIndex: 'createdAt', render: (v: string) => formatDateTime(v) },
            { title: t('Expire le'), dataIndex: 'expiresAt', render: (v: string) => formatDateTime(v) },
            {
              title: t('Consultations'),
              dataIndex: 'viewCount',
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
              render: (v: InstallmentPaymentLinkStatus) => statusTag(v)
            },
            {
              title: t('Paiement'),
              key: 'payment',
              render: (_: unknown, r: InstallmentPaymentLinkSummary) => (
                <Space size="small">
                  {paymentTag(r.payment.status)}
                  {r.payment.amount != null && r.payment.status !== 'NONE' ? (
                    <MoneyValue value={r.payment.amount} />
                  ) : null}
                </Space>
              )
            },
            {
              title: '',
              key: 'actions',
              align: 'end' as const,
              render: (_: unknown, r: InstallmentPaymentLinkSummary) =>
                canCreate && r.status === 'ACTIVE' ? (
                  <Popconfirm
                    title={t('Révoquer ce lien ?')}
                    description={t('Le locataire ne pourra plus payer avec ce lien.')}
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
    </Card>
  );
};
