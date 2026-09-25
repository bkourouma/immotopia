import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Card, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CreditCardOutlined, FilePdfOutlined } from '@ant-design/icons';
import {
  downloadOwnInvoicePdf,
  getInvoiceCheckout,
  getPaymentAvailability,
  listOwnPlatformInvoices,
  startInvoiceCheckout,
  type PaymentAvailability,
  type PlatformCheckout,
  type PlatformInvoice
} from '../../services/platform-billing-service';
import { formatMoney, StatusTag } from '../primitives';
import { INVOICE_NATURE_LABEL, INVOICE_STATUS_LABEL, PAYABLE_STATUSES, formatDay, formatPeriod } from './platform-invoice-labels';
import { t } from '../../i18n/t';

const { Text } = Typography;

/** Suivi du retour de paiement : toutes les 3 s, 60 s au plus (comme le portail locataire du lot 7). */
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 60_000;

interface Props {
  tenantId: string;
  /** Appelé quand un paiement réussit : l'abonnement a pu sortir de la lecture seule. */
  onPaid?: () => void;
}

/**
 * Factures de l'abonnement vues par l'agence (vague 3) : liste, PDF, bouton
 * « Payer en ligne » (compte PaySecureHub d'ImmoTopia) et suivi du retour
 * `?paiement=<codePaiement>`. Jamais bloqué par la lecture seule : les routes
 * `/subscription/*` sont EXEMPT côté API.
 */
export const TenantInvoicesSection: React.FC<Props> = ({ tenantId, onPaid }) => {
  const { message, modal } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState<PaymentAvailability | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [returned, setReturned] = useState<PlatformCheckout | null>(null);
  const [stillPending, setStillPending] = useState(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [page, avail] = await Promise.all([
        listOwnPlatformInvoices(tenantId, { limit: 50 }),
        getPaymentAvailability(tenantId).catch(() => null)
      ]);
      setInvoices(page.invoices);
      setAvailability(avail);
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors du chargement des factures'));
    } finally {
      setLoading(false);
    }
  }, [tenantId, message]);

  useEffect(() => {
    load();
  }, [load]);

  // Retour de la page de paiement : suivi du statut.
  const codePaiement = searchParams.get('paiement');
  useEffect(() => {
    if (!codePaiement) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const poll = async () => {
      try {
        const checkout = await getInvoiceCheckout(tenantId, codePaiement);
        if (cancelled) return;
        setReturned(checkout);
        if (checkout.status === 'PENDING') {
          if (Date.now() - startedAt < POLL_MAX_MS) timer = setTimeout(poll, POLL_INTERVAL_MS);
          else setStillPending(true);
          return;
        }
        if (checkout.status === 'SUCCESS') {
          await load();
          onPaidRef.current?.();
        }
      } catch {
        if (!cancelled) setStillPending(true);
      }
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [codePaiement, tenantId, load]);

  const dismissReturn = () => {
    setReturned(null);
    setStillPending(false);
    const next = new URLSearchParams(searchParams);
    next.delete('paiement');
    setSearchParams(next, { replace: true });
  };

  const redirectTo = (url: string | null | undefined) => {
    if (url) window.location.assign(url);
    else message.error(t('Adresse de paiement indisponible.'));
  };

  const handlePay = async (invoice: PlatformInvoice) => {
    setPaying(invoice.id);
    try {
      const checkout = await startInvoiceCheckout(tenantId, invoice.id);
      redirectTo(checkout.checkoutUrl);
    } catch (err: any) {
      const data = err.response?.data?.data as { checkoutUrl?: string | null } | undefined;
      if (err.response?.status === 409 && data?.checkoutUrl) {
        modal.confirm({
          title: t('Un paiement est déjà en cours pour cette facture'),
          content: t('Reprenez-le pour le terminer.'),
          okText: t('Reprendre le paiement'),
          cancelText: t('Annuler'),
          onOk: () => redirectTo(data.checkoutUrl)
        });
      } else {
        message.error(err.response?.data?.message || t('Impossible de démarrer le paiement en ligne'));
      }
    } finally {
      setPaying(null);
    }
  };

  const handlePdf = async (invoice: PlatformInvoice) => {
    try {
      await downloadOwnInvoicePdf(tenantId, invoice);
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Téléchargement impossible'));
    }
  };

  const columns: ColumnsType<PlatformInvoice> = [
    { title: t('Numéro'), dataIndex: 'invoiceNumber', key: 'number', render: (v: string | null) => v ?? '—' },
    {
      title: t('Nature'),
      dataIndex: 'nature',
      key: 'nature',
      render: (v: string | null) => (v ? INVOICE_NATURE_LABEL[v] ?? v : '—')
    },
    { title: t('Période'), key: 'period', render: (_, r) => formatPeriod(r.periodStart, r.periodEnd) },
    { title: t('Échéance'), dataIndex: 'dueDate', key: 'due', render: formatDay },
    {
      title: t('Montant TTC'),
      dataIndex: 'amountTotal',
      key: 'amount',
      align: 'end',
      render: (_, r) => formatMoney(r.amountTotal, { currency: r.currency })
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const info = INVOICE_STATUS_LABEL[status];
        return <StatusTag status={status} tone={info?.tone} label={info?.label} />;
      }
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, r) => (
        <Space wrap>
          <Button size="small" icon={<FilePdfOutlined />} onClick={() => handlePdf(r)}>
            {t('PDF')}
          </Button>
          {availability?.available && PAYABLE_STATUSES.includes(r.status) && r.amountTotal > 0 && (
            <Button
              size="small"
              type="primary"
              icon={<CreditCardOutlined />}
              loading={paying === r.id}
              onClick={() => handlePay(r)}
            >
              {t('Payer en ligne')}
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <Card title={t('Factures')}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {returned && returned.status === 'SUCCESS' && (
          <Alert type="success" showIcon closable onClose={dismissReturn} message={t('Paiement reçu : la facture est réglée.')} />
        )}
        {returned && (returned.status === 'FAILED' || returned.status === 'CANCELED' || returned.status === 'EXPIRED') && (
          <Alert
            type="error"
            showIcon
            closable
            onClose={dismissReturn}
            message={t("Le paiement n'a pas abouti.")}
            description={returned.failureMessage ?? undefined}
          />
        )}
        {returned && returned.status === 'REVIEW' && (
          <Alert type="warning" showIcon closable onClose={dismissReturn} message={t('Paiement en cours de vérification par ImmoTopia.')} />
        )}
        {codePaiement && (stillPending || (returned?.status === 'PENDING' && !stillPending)) && (
          <Alert
            type="info"
            showIcon
            closable
            onClose={dismissReturn}
            message={stillPending ? t('Paiement en cours de confirmation.') : t('Vérification du paiement…')}
          />
        )}
        {availability?.mode === 'SIMULATOR' && availability.available && (
          <Text type="secondary">{t('Mode démonstration : aucun paiement réel.')}</Text>
        )}
        <Table<PlatformInvoice>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={invoices}
          loading={loading}
          pagination={false}
          scroll={{ x: 'max-content' }}
          aria-label={t('Factures')}
          locale={{ emptyText: t('Aucune facture') }}
        />
      </Space>
    </Card>
  );
};
