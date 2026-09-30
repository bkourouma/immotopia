import React, { useEffect, useMemo, useState } from 'react';
import { App, Alert, Button, Card, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined, MailOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { MoneyValue } from '../../components/primitives';
import { PrintReceiptsModal } from '../../components/syndics/PrintReceiptsModal';
import { listSyndicateLots } from '../../services/syndic-service';
import {
  backfillMissingReceipts,
  downloadReceiptFile,
  listSyndicateReceipts,
  resendReceiptEmail
} from '../../services/syndic-receipt-service';
import { ReceiptKind, ReceiptView, SyndicateLot } from '../../types/syndic-types';
import { describeDownloadError } from '../../utils/download-error';
import { saveBlob } from '../../utils/save-blob';
import { formatLotLabel } from '../../utils/syndic-lot-label';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';
import { displayCurrency } from '../../utils/syndic-currency';

const { Paragraph, Text, Title } = Typography;

const kindLabel: Record<ReceiptKind, string> = {
  RECEIPT: t('Reçu'),
  QUITTANCE: t('Quittance')
};

const kindColor: Record<ReceiptKind, string> = {
  RECEIPT: 'blue',
  QUITTANCE: 'green'
};

/**
 * Libellé traduit à partir du CODE d'échec d'envoi — jamais le texte brut
 * `emailError` renvoyé par l'API (français uniquement, pas passé par `t()`
 * côté serveur). Mêmes libellés que `RECEIPT_EMAIL_ERROR_MESSAGES`
 * (`packages/api/src/lib/syndics/charge-receipt-delivery.ts`), traduits ici.
 */
const emailErrorLabel: Record<NonNullable<ReceiptView['emailErrorCode']>, string> = {
  SMTP_REJECTED: t("Le serveur de messagerie a refusé l'e-mail."),
  TIMEOUT: t("Le serveur de messagerie n'a pas répondu à temps."),
  ERROR: t("L'envoi de l'e-mail a échoué.")
};

/** Délai entre deux passages de rattrapage automatique, pour ne pas marteler l'API. */
const BACKFILL_CONTINUE_DELAY_MS = 300;
/** Filet de sécurité : arrête la boucle même si `remaining` ne descend jamais à 0. */
const MAX_BACKFILL_ITERATIONS = 50;

function ownerLabelOf(lot: SyndicateLot): string {
  const coowner = lot.coowner;
  if (!coowner) return '';
  const fullName = [coowner.firstName, coowner.lastName].filter(Boolean).join(' ').trim();
  return fullName || coowner.legalName || coowner.fullName || coowner.email || '';
}

function periodLabelOf(receipt: ReceiptView): string {
  if (receipt.periodLabel) return receipt.periodLabel;
  if (receipt.periodStart && receipt.periodEnd) {
    return `${dayjs(receipt.periodStart).format('DD/MM/YYYY')} – ${dayjs(receipt.periodEnd).format('DD/MM/YYYY')}`;
  }
  return '—';
}

/**
 * Écran « Quittances » de la copropriété (lot S3, besoin 1) : historique des
 * reçus de paiement et quittances de charges, avec téléchargement, renvoi par
 * e-mail, rattrapage des quittances manquantes et impression groupée.
 */
export const SyndicReceipts: React.FC = () => {
  const { message, modal } = App.useApp();
  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();

  const [lots, setLots] = useState<SyndicateLot[]>([]);
  const [items, setItems] = useState<ReceiptView[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kindFilter, setKindFilter] = useState<ReceiptKind | undefined>(undefined);
  const [lotFilter, setLotFilter] = useState<string | undefined>(undefined);
  const [contactFilter, setContactFilter] = useState<string | undefined>(undefined);

  const [resendingId, setResendingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) return;
    listSyndicateLots(effectiveTenantId, syndicId)
      .then(setLots)
      .catch(() => setLots([]));
  }, [effectiveTenantId, syndicId]);

  const loadReceipts = async (page = 1) => {
    if (!effectiveTenantId || !syndicId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listSyndicateReceipts(effectiveTenantId, syndicId, {
        kind: kindFilter,
        lotId: lotFilter,
        contactId: contactFilter,
        page,
        limit: pagination.limit
      });
      setItems(result.items);
      setPagination(result.pagination);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger les reçus et quittances'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres copropriété manquants'));
      return;
    }
    void loadReceipts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTenantId, syndicId, kindFilter, lotFilter, contactFilter]);

  const lotOptions = useMemo(() => lots.map(lot => ({ value: lot.id, label: formatLotLabel(lot) })), [lots]);

  const ownerOptions = useMemo(() => {
    const byContact = new Map<string, string>();
    for (const lot of lots) {
      if (!lot.ownerContactId) continue;
      const label = ownerLabelOf(lot) || lot.ownerContactId;
      byContact.set(lot.ownerContactId, label);
    }
    return Array.from(byContact.entries()).map(([value, label]) => ({ value, label }));
  }, [lots]);

  const handleDownload = async (receipt: ReceiptView) => {
    if (!effectiveTenantId || !syndicId) return;
    setDownloadingId(receipt.id);
    try {
      const fallback = `${receipt.kind === 'QUITTANCE' ? 'Quittance' : 'Recu'} ${receipt.number}.pdf`;
      const { blob, filename } = await downloadReceiptFile(effectiveTenantId, syndicId, receipt.id, fallback);
      saveBlob(blob, filename);
    } catch (err) {
      message.error(await describeDownloadError(err));
    } finally {
      setDownloadingId(null);
    }
  };

  const errorMessageOf = (err: any): string | undefined => err.response?.data?.message || err.response?.data?.error;

  const handleResend = async (receipt: ReceiptView) => {
    if (!effectiveTenantId || !syndicId) return;
    setResendingId(receipt.id);
    try {
      await resendReceiptEmail(effectiveTenantId, syndicId, receipt.id);
      message.success(t('Document renvoyé par e-mail.'));
      await loadReceipts(pagination.page);
    } catch (err: any) {
      const status = err.response?.status;
      const code = err.response?.data?.code;
      if (status === 429 && code === 'EMAIL_RECENTLY_SENT') {
        message.error(t("Ce document vient d'être envoyé : patientez deux minutes avant de le renvoyer."));
      } else if (status === 429) {
        message.error(t('Trop de renvois en peu de temps. Réessayez plus tard.'));
      } else if (status === 409) {
        message.error(
          errorMessageOf(err) ||
            t(
              "Ce document rattrapé désigne un copropriétaire qui n'est plus celui du lot : il ne peut pas lui être renvoyé."
            )
        );
      } else if (status === 422) {
        message.error(errorMessageOf(err) || t("Le copropriétaire de ce lot n'a pas d'adresse e-mail."));
      } else if (code === 'EMAIL_SEND_FAILED') {
        message.error(t("L'envoi de l'e-mail a échoué. Réessayez plus tard."));
      } else {
        message.error(errorMessageOf(err) || t('Le renvoi par e-mail a échoué.'));
      }
    } finally {
      setResendingId(null);
    }
  };

  const handleBackfill = () => {
    if (!effectiveTenantId || !syndicId) return;
    modal.confirm({
      title: t('Générer les quittances manquantes'),
      content: t(
        'Une quittance sera créée pour chaque appel entièrement réglé qui n’en a pas encore. Aucun e-mail ne sera envoyé.'
      ),
      okText: t('Générer'),
      cancelText: t('Annuler'),
      onOk: () => runBackfill(effectiveTenantId, syndicId)
    });
  };

  /**
   * Le rattrapage est plafonné par requête côté API (`remaining`) : cette
   * boucle relance automatiquement les passages suivants jusqu'à
   * `remaining === 0`, avec une progression affichée, plutôt que de laisser
   * le gestionnaire recliquer manuellement.
   */
  const runBackfill = async (tenantId: string, syndicId: string) => {
    setBackfilling(true);
    let totalCreated = 0;
    let totalSkipped = 0;
    try {
      for (let iteration = 0; iteration < MAX_BACKFILL_ITERATIONS; iteration += 1) {
        const result = await backfillMissingReceipts(tenantId, syndicId);
        totalCreated += result.created;
        totalSkipped += result.skipped;
        if (result.remaining <= 0) break;
        message.loading({
          key: 'backfill-progress',
          content: t('{{created}} quittance(s) créée(s), encore {{remaining}} appel(s) à traiter…', {
            created: totalCreated,
            remaining: result.remaining
          }),
          duration: 0
        });
        await new Promise(resolve => setTimeout(resolve, BACKFILL_CONTINUE_DELAY_MS));
      }
      message.destroy('backfill-progress');
      message.success(
        t('{{created}} quittance(s) créée(s), {{skipped}} déjà à jour.', {
          created: totalCreated,
          skipped: totalSkipped
        })
      );
      await loadReceipts(pagination.page);
    } catch (err: any) {
      message.destroy('backfill-progress');
      message.error(errorMessageOf(err) || t('Le rattrapage des quittances a échoué.'));
    } finally {
      setBackfilling(false);
    }
  };

  const emailColumn = (receipt: ReceiptView) => {
    if (receipt.emailErrorCode) {
      return <Tag color="red">{t('Erreur : {{error}}', { error: emailErrorLabel[receipt.emailErrorCode] })}</Tag>;
    }
    if (receipt.emailError) {
      return <Tag color="red">{t('Erreur : {{error}}', { error: receipt.emailError })}</Tag>;
    }
    if (receipt.emailedAt) {
      return <Tag color="green">{dayjs(receipt.emailedAt).format('DD/MM/YYYY HH:mm')}</Tag>;
    }
    return <Tag>{t('Non envoyé')}</Tag>;
  };

  const columns: ColumnsType<ReceiptView> = [
    { title: t('Numéro'), dataIndex: 'number', key: 'number' },
    {
      title: t('Type'),
      dataIndex: 'kind',
      key: 'kind',
      render: (value: ReceiptKind) => <Tag color={kindColor[value]}>{kindLabel[value]}</Tag>
    },
    { title: t('Lot'), dataIndex: 'lotNumber', key: 'lotNumber', render: (value: string | null) => value || '—' },
    {
      title: t('Copropriétaire'),
      dataIndex: 'coownerName',
      key: 'coownerName',
      render: (value: string | null) => value || t('Sans copropriétaire')
    },
    { title: t('Période'), key: 'period', render: (_: unknown, row) => periodLabelOf(row) },
    {
      title: t('Montant'),
      key: 'amount',
      align: 'end',
      render: (_: unknown, row) => <MoneyValue value={row.amount} currency={displayCurrency(row.currency)} />
    },
    {
      title: t('Émis le'),
      dataIndex: 'issuedAt',
      key: 'issuedAt',
      render: (value: string) => dayjs(value).format('DD/MM/YYYY')
    },
    { title: t('E-mail'), key: 'email', render: (_: unknown, row) => emailColumn(row) },
    {
      title: t('Rattrapé'),
      dataIndex: 'backfilled',
      key: 'backfilled',
      render: (value: boolean) => (value ? <Tag>{t('Rattrapé')}</Tag> : null)
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, row) => (
        <Space>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            loading={downloadingId === row.id}
            onClick={() => void handleDownload(row)}
          >
            {t('Télécharger')}
          </Button>
          <Button
            size="small"
            icon={<MailOutlined />}
            loading={resendingId === row.id}
            onClick={() => void handleResend(row)}
          >
            {t('Renvoyer')}
          </Button>
        </Space>
      )
    }
  ];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Title level={2} style={{ margin: 0 }}>
              {t('Quittances')}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t('Reçus de paiement et quittances de charges de la copropriété.')}
            </Paragraph>
          </Space>
          <Space wrap>
            <Button icon={<PlusOutlined />} loading={backfilling} onClick={handleBackfill}>
              {t('Générer les quittances manquantes')}
            </Button>
            <Button type="primary" icon={<PrinterOutlined />} onClick={() => setPrintOpen(true)}>
              {t('Imprimer les quittances')}
            </Button>
          </Space>
        </div>

        <Card size="small">
          <Space wrap size={16}>
            <label>
              <Text style={{ marginInlineEnd: 8 }}>{t('Type')}</Text>
              <Select
                allowClear
                style={{ minWidth: 160 }}
                placeholder={t('Tous')}
                value={kindFilter}
                onChange={value => setKindFilter(value)}
                options={[
                  { value: 'QUITTANCE', label: t('Quittance') },
                  { value: 'RECEIPT', label: t('Reçu') }
                ]}
              />
            </label>
            <label>
              <Text style={{ marginInlineEnd: 8 }}>{t('Lot')}</Text>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ minWidth: 200 }}
                placeholder={t('Tous les lots')}
                value={lotFilter}
                onChange={value => setLotFilter(value)}
                options={lotOptions}
              />
            </label>
            <label>
              <Text style={{ marginInlineEnd: 8 }}>{t('Copropriétaire')}</Text>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ minWidth: 220 }}
                placeholder={t('Tous les copropriétaires')}
                value={contactFilter}
                onChange={value => setContactFilter(value)}
                options={ownerOptions}
              />
            </label>
          </Space>
        </Card>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        <Table<ReceiptView>
          rowKey="id"
          loading={loading}
          dataSource={items}
          columns={columns}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: pagination.page,
            pageSize: pagination.limit,
            total: pagination.total,
            onChange: page => void loadReceipts(page)
          }}
          locale={{ emptyText: t('Aucun reçu ou quittance pour cette copropriété.') }}
        />
      </Space>

      {effectiveTenantId && syndicId ? (
        <PrintReceiptsModal
          open={printOpen}
          tenantId={effectiveTenantId}
          syndicId={syndicId}
          lots={lots}
          onClose={() => setPrintOpen(false)}
        />
      ) : null}
    </>
  );
};
