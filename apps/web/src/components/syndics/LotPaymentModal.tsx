import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { MoneyValue } from '../primitives';
import {
  getLotAdvance,
  listOpenLotCharges,
  previewLotPayment,
  recordLotPayment
} from '../../services/syndic-lot-payment-service';
import { downloadReceiptFile } from '../../services/syndic-receipt-service';
import {
  IssuedReceiptRef,
  LotOpenChargeCall,
  LotPaymentAllocationView,
  LotPaymentResult,
  SyndicateLot
} from '../../types/syndic-types';
import { describeDownloadError } from '../../utils/download-error';
import { saveBlob } from '../../utils/save-blob';
import { formatLotLabel } from '../../utils/syndic-lot-label';
import { chargeCallStatusConfig } from './ChargeCallTable';
import { t } from '../../i18n/t';
import { displayCurrency } from '../../utils/syndic-currency';

const { Paragraph, Text } = Typography;

// FR-005 (v2, lot S2) : mêmes modes que la création d'appel — jamais le
// paiement en ligne, voir SyndicCharges.tsx pour la référence de recette.
const paymentMethodOptions = [
  { label: t('Espèces'), value: 'ESPECES' },
  { label: t('Virement'), value: 'VIREMENT' },
  { label: t('Chèque'), value: 'CHEQUE' },
  { label: t('Mobile money'), value: 'MOBILE_MONEY' }
];

const allocationSourceLabel: Record<LotPaymentAllocationView['source'], string> = {
  PAYMENT: t('Paiement'),
  ADVANCE: t('Avance')
};

/** Débounce en ms avant de rejouer l'aperçu : évite un appel API à chaque frappe. */
const PREVIEW_DEBOUNCE_MS = 400;

export interface LotPaymentModalProps {
  open: boolean;
  tenantId: string;
  syndicId: string;
  lots: SyndicateLot[];
  /** Lot pré-sélectionné (ouverture depuis un appel ou depuis le compte du lot) ; verrouille le choix du lot. */
  initialLotId?: string;
  /** Appel pré-coché quand la modale est ouverte depuis ce dossier. */
  initialChargeCallId?: string;
  onClose: () => void;
  /** Appelé après un enregistrement réussi, avant la fermeture de la modale. */
  onRecorded: (result: LotPaymentResult) => void;
}

function formatPeriodRange(call: LotOpenChargeCall): string {
  if (!call.periodStart || !call.periodEnd) return call.period;
  return `${call.period} (${dayjs(call.periodStart).format('DD/MM/YYYY')} – ${dayjs(call.periodEnd).format('DD/MM/YYYY')})`;
}

/** Statut d'appel traduit, avec la même couleur que la liste des appels. */
function renderCallStatus(value: LotOpenChargeCall['status']) {
  const config = chargeCallStatusConfig[value];
  return config ? <Tag color={config.color}>{config.label}</Tag> : <Tag>{value}</Tag>;
}

/**
 * Modale « Enregistrer un paiement » du lot S2 : un paiement PAR LOT, plus
 * par appel isolé. Le gestionnaire peut cocher les appels à couvrir ; sans
 * case cochée, l'API affecte du plus ancien au plus récent. Un aperçu en
 * direct (route dédiée, sans écriture) montre l'affectation et l'avance
 * restante avant validation.
 */
export const LotPaymentModal: React.FC<LotPaymentModalProps> = ({
  open,
  tenantId,
  syndicId,
  lots,
  initialLotId,
  initialChargeCallId,
  onClose,
  onRecorded
}) => {
  const [lotId, setLotId] = useState<string | undefined>(initialLotId);
  const [amount, setAmount] = useState<number | null>(null);
  const [paidAt, setPaidAt] = useState<Dayjs | null>(dayjs());
  const [method, setMethod] = useState<string | undefined>('VIREMENT');
  const [reference, setReference] = useState('');

  const [openCalls, setOpenCalls] = useState<LotOpenChargeCall[]>([]);
  const [callsLoading, setCallsLoading] = useState(false);
  const [selectedCallIds, setSelectedCallIds] = useState<string[]>(initialChargeCallId ? [initialChargeCallId] : []);

  const [advance, setAdvance] = useState<number | null>(null);
  const [preview, setPreview] = useState<LotPaymentResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Synthèse affichée après l'enregistrement, avant fermeture (lot S3 : les
  // documents émis, avec numéro et lien de téléchargement).
  const [recordedResult, setRecordedResult] = useState<LotPaymentResult | null>(null);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  // Réinitialise l'état à chaque ouverture, sur les valeurs de la consigne
  // (lot et appel pré-sélectionnés depuis un appel donné).
  useEffect(() => {
    if (!open) return;
    setLotId(initialLotId);
    setAmount(null);
    setPaidAt(dayjs());
    setMethod('VIREMENT');
    setReference('');
    setSelectedCallIds(initialChargeCallId ? [initialChargeCallId] : []);
    setPreview(null);
    setPreviewError(null);
    setSubmitError(null);
    setAdvance(null);
    setRecordedResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialLotId, initialChargeCallId]);

  useEffect(() => {
    if (!open || !lotId) {
      setOpenCalls([]);
      return;
    }
    let cancelled = false;
    setCallsLoading(true);
    Promise.all([listOpenLotCharges(tenantId, syndicId, lotId), getLotAdvance(tenantId, syndicId, lotId)])
      .then(([calls, lotAdvance]) => {
        if (cancelled) return;
        setOpenCalls(calls);
        setAdvance(lotAdvance.advance);
        setSelectedCallIds(prev => prev.filter(id => calls.some(call => call.id === id)));
      })
      .catch(() => {
        if (!cancelled) setOpenCalls([]);
      })
      .finally(() => {
        if (!cancelled) setCallsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, lotId, tenantId, syndicId]);

  // Aperçu en direct, avec anti-rebond : rejoué à chaque changement pertinent.
  useEffect(() => {
    if (!open || !lotId || !amount || amount <= 0 || !paidAt || !method) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      previewLotPayment(tenantId, syndicId, lotId, {
        amount,
        paidAt: paidAt.toISOString(),
        method,
        reference: reference || undefined,
        chargeCallIds: selectedCallIds.length > 0 ? selectedCallIds : undefined
      })
        .then(result => {
          if (cancelled) return;
          setPreview(result);
          setPreviewError(null);
        })
        .catch((err: any) => {
          if (cancelled) return;
          setPreview(null);
          setPreviewError(err.response?.data?.error || t("Aperçu de l'affectation impossible"));
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, lotId, amount, paidAt, method, reference, selectedCallIds, tenantId, syndicId]);

  const lotOptions = useMemo(() => lots.map(lot => ({ value: lot.id, label: formatLotLabel(lot) })), [lots]);

  const openCallColumns: ColumnsType<LotOpenChargeCall> = [
    { title: t('Période'), dataIndex: 'period', key: 'period', render: (_: string, call) => formatPeriodRange(call) },
    {
      title: t("Date d'échéance"),
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (value: string) => dayjs(value).format('DD/MM/YYYY')
    },
    {
      title: t('Reste dû'),
      key: 'outstanding',
      align: 'end',
      render: (_: unknown, call) => <MoneyValue value={call.outstanding} currency={displayCurrency(call.currency)} />
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (value: LotOpenChargeCall['status']) => renderCallStatus(value)
    }
  ];

  const allocationColumns: ColumnsType<LotPaymentAllocationView> = [
    { title: t('Période'), dataIndex: 'period', key: 'period' },
    {
      title: t('Montant affecté'),
      key: 'amount',
      align: 'end',
      render: (_: unknown, row) => <MoneyValue value={row.amount} currency={displayCurrency(preview?.currency)} />
    },
    {
      title: t('Origine'),
      dataIndex: 'source',
      key: 'source',
      render: (value: LotPaymentAllocationView['source']) => (
        <Tag color={value === 'ADVANCE' ? 'purple' : 'blue'}>{allocationSourceLabel[value]}</Tag>
      )
    },
    {
      title: t('Statut après'),
      dataIndex: 'callStatusAfter',
      key: 'callStatusAfter',
      render: (value: LotPaymentAllocationView['callStatusAfter']) => renderCallStatus(value)
    }
  ];

  const canSubmit = Boolean(lotId && amount && amount > 0 && paidAt && method);

  const handleSubmit = async () => {
    if (!lotId || !amount || amount <= 0 || !paidAt || !method) {
      setSubmitError(t('Renseignez le lot, le montant, la date et le mode de paiement.'));
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await recordLotPayment(tenantId, syndicId, lotId, {
        amount,
        paidAt: paidAt.toISOString(),
        method,
        reference: reference || undefined,
        chargeCallIds: selectedCallIds.length > 0 ? selectedCallIds : undefined
      });
      // Lot S3 : la synthèse (documents émis) reste affichée jusqu'à ce que
      // le gestionnaire ferme lui-même ; `onRecorded` (rafraîchissement de la
      // liste des appels côté parent) n'est appelé qu'à ce moment-là.
      setRecordedResult(result);
    } catch (err: any) {
      setSubmitError(err.response?.data?.error || t('Enregistrement du paiement impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadDocument = async (doc: IssuedReceiptRef) => {
    setDownloadingDocId(doc.id);
    try {
      const fallback = `${doc.kind === 'QUITTANCE' ? 'Quittance' : 'Recu'} ${doc.number}.pdf`;
      const { blob, filename } = await downloadReceiptFile(tenantId, syndicId, doc.id, fallback);
      saveBlob(blob, filename);
    } catch (err) {
      setSubmitError(await describeDownloadError(err));
    } finally {
      setDownloadingDocId(null);
    }
  };

  const handleCloseSynthesis = () => {
    if (recordedResult) onRecorded(recordedResult);
  };

  if (recordedResult) {
    return (
      <Modal
        title={t('Paiement enregistré')}
        open={open}
        onCancel={handleCloseSynthesis}
        footer={
          <Button type="primary" onClick={handleCloseSynthesis}>
            {t('Fermer')}
          </Button>
        }
        width={640}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {submitError ? <Alert type="error" message={submitError} showIcon /> : null}

          <Table<LotPaymentAllocationView>
            rowKey={(row, index) => `${row.chargeCallId}-${index}`}
            size="small"
            dataSource={recordedResult.allocations}
            columns={allocationColumns}
            pagination={false}
            locale={{ emptyText: t('Le paiement reste entièrement en avance') }}
          />
          <Paragraph style={{ marginBottom: 0 }}>
            {t('Avance restante')} :{' '}
            <MoneyValue value={recordedResult.lotAdvanceBalance} currency={displayCurrency(recordedResult.currency)} />
          </Paragraph>

          <div>
            <Text strong>{t('Documents émis')}</Text>
            {recordedResult.documents && recordedResult.documents.length > 0 ? (
              <Table<IssuedReceiptRef>
                rowKey="id"
                size="small"
                style={{ marginTop: 4 }}
                dataSource={recordedResult.documents}
                pagination={false}
                columns={[
                  { title: t('Numéro'), dataIndex: 'number' },
                  {
                    title: t('Type'),
                    dataIndex: 'kind',
                    render: (value: IssuedReceiptRef['kind']) => (
                      <Tag color={value === 'QUITTANCE' ? 'green' : 'blue'}>
                        {value === 'QUITTANCE' ? t('Quittance') : t('Reçu')}
                      </Tag>
                    )
                  },
                  {
                    title: t('Actions'),
                    render: (_: unknown, doc: IssuedReceiptRef) => (
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        loading={downloadingDocId === doc.id}
                        onClick={() => void handleDownloadDocument(doc)}
                      >
                        {t('Télécharger')}
                      </Button>
                    )
                  }
                ]}
              />
            ) : (
              <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
                {t('Aucun document émis par ce paiement.')}
              </Paragraph>
            )}
          </div>
        </Space>
      </Modal>
    );
  }

  return (
    <Modal
      title={t('Enregistrer un paiement')}
      open={open}
      onCancel={onClose}
      onOk={() => void handleSubmit()}
      okText={t('Enregistrer')}
      cancelText={t('Annuler')}
      confirmLoading={submitting}
      okButtonProps={{ disabled: !canSubmit }}
      width={720}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {submitError ? <Alert type="error" message={submitError} showIcon /> : null}

        <div>
          <Text strong>{t('Lot')}</Text>
          <Select
            showSearch
            optionFilterProp="label"
            style={{ width: '100%', marginTop: 4 }}
            value={lotId}
            disabled={Boolean(initialLotId)}
            placeholder={t('Choisir un lot')}
            options={lotOptions}
            onChange={value => setLotId(value)}
            aria-label={t('Lot')}
          />
        </div>

        {lotId && advance !== null && advance > 0 ? (
          <Alert
            type="info"
            showIcon
            message={
              <>
                {t('Avance disponible sur ce lot')} : <MoneyValue value={advance} />
              </>
            }
          />
        ) : null}

        <Space wrap size={16} style={{ width: '100%' }}>
          <div>
            <Text strong>{t('Montant')}</Text>
            <InputNumber
              id="lot-payment-amount"
              aria-label={t('Montant')}
              min={1}
              style={{ width: 200, display: 'block', marginTop: 4 }}
              value={amount ?? undefined}
              onChange={value => setAmount(typeof value === 'number' ? value : null)}
            />
          </div>
          <div>
            <Text strong>{t('Date de paiement')}</Text>
            <DatePicker
              id="lot-payment-date"
              aria-label={t('Date de paiement')}
              style={{ width: 200, display: 'block', marginTop: 4 }}
              format="DD/MM/YYYY"
              value={paidAt}
              onChange={value => setPaidAt(value)}
            />
          </div>
          <div>
            <Text strong>{t('Mode de paiement')}</Text>
            <Select
              id="lot-payment-method"
              aria-label={t('Mode de paiement')}
              showSearch
              optionFilterProp="label"
              style={{ width: 200, marginTop: 4 }}
              value={method}
              options={paymentMethodOptions}
              onChange={value => setMethod(value)}
            />
          </div>
        </Space>

        <div>
          <Text strong>{t('Référence (optionnel)')}</Text>
          <Input
            id="lot-payment-reference"
            aria-label={t('Référence (optionnel)')}
            style={{ marginTop: 4 }}
            value={reference}
            onChange={event => setReference(event.target.value)}
          />
        </div>

        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t(
            "Aucune case cochée : le paiement solde d'abord les appels les plus anciens. Cochez les appels que vous voulez couvrir vous-même ; le surplus devient une avance imputée automatiquement sur les appels suivants."
          )}
        </Paragraph>

        <Table<LotOpenChargeCall>
          rowKey="id"
          size="small"
          loading={callsLoading}
          dataSource={openCalls}
          columns={openCallColumns}
          pagination={false}
          locale={{ emptyText: t('Aucun appel ouvert pour ce lot') }}
          rowSelection={{
            selectedRowKeys: selectedCallIds,
            onChange: keys => setSelectedCallIds(keys as string[]),
            // Antd écrit en dur « Select all » / « Select row N » : libellés accessibles fournis ici.
            getTitleCheckboxProps: () => ({ 'aria-label': t('Sélectionner tous les appels') }),
            getCheckboxProps: call => ({
              'aria-label': t("Sélectionner l'appel {{period}}", { period: call.period })
            })
          }}
        />

        <div>
          <Text strong>{t('Aperçu')}</Text>
          {previewLoading ? (
            <div style={{ padding: 12 }}>
              <Spin size="small" />
            </div>
          ) : previewError ? (
            <Alert type="warning" message={previewError} showIcon style={{ marginTop: 4 }} />
          ) : preview ? (
            <>
              <Table<LotPaymentAllocationView>
                rowKey={(row, index) => `${row.chargeCallId}-${index}`}
                size="small"
                dataSource={preview.allocations}
                columns={allocationColumns}
                pagination={false}
                style={{ marginTop: 4 }}
                locale={{ emptyText: t('Le paiement resterait entièrement en avance') }}
              />
              <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                {t('Avance restante')} :{' '}
                <MoneyValue value={preview.lotAdvanceBalance} currency={displayCurrency(preview.currency)} />
              </Paragraph>
            </>
          ) : (
            <Paragraph type="secondary" style={{ marginTop: 4 }}>
              {t('Renseignez le montant pour voir un aperçu.')}
            </Paragraph>
          )}
        </div>
      </Space>
    </Modal>
  );
};
