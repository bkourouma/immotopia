import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, InputNumber, Modal, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import { previewPaymentReminders, sendReminderBatch } from '../../../services/rental-payment-reminder-service';
import type {
  BatchReminderResultDto,
  RentalReminderPreviewDto,
  RentalReminderPreviewItemDto,
  SendReminderResultDto
} from '../../../types/rental-payment-reminder';
import { formatMoney } from '../../primitives';
import { libellePeriodeEcheance } from '../../../lib/rental-labels';
import { t } from '../../../i18n/t';
import {
  REMINDER_BATCH_CHUNK,
  REMINDER_BATCH_MAX,
  reminderChannelLabel,
  reminderExclusionText,
  reminderFailureText,
  reminderLevelLabel
} from './reminder-labels';

const { Text } = Typography;

export interface ReminderBatchModalProps {
  tenantId: string;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
  leaseId?: string;
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function retardText(daysLate: number): string {
  if (daysLate > 0) return t('{{count}} jours de retard', { count: daysLate });
  if (daysLate < 0) return t('dans {{count}} jours', { count: -daysLate });
  return t("Échéance aujourd'hui");
}

function errorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message || fallback;
}

/** Sélection par défaut : les lignes éligibles, dans la limite du plafond. */
function defaultSelection(preview: RentalReminderPreviewDto): { ids: string[]; truncated: boolean } {
  const all = preview.groups.flatMap(g => g.items.filter(i => i.eligible).map(i => i.installmentId));
  return { ids: all.slice(0, REMINDER_BATCH_MAX), truncated: all.length > REMINDER_BATCH_MAX };
}

export const ReminderBatchModal: React.FC<ReminderBatchModalProps> = ({ tenantId, open, onClose, onDone, leaseId }) => {
  const { message } = App.useApp();
  const [minDaysLate, setMinDaysLate] = useState<number>(1);
  const [daysBefore, setDaysBefore] = useState<number>(0);
  const [preview, setPreview] = useState<RentalReminderPreviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BatchReminderResultDto | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Les filtres saisis sont lus au moment du chargement, sans le relancer à chaque frappe.
  const filtres = useRef({ minDaysLate, daysBefore });
  filtres.current = { minDaysLate, daysBefore };

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await previewPaymentReminders(tenantId, { ...filtres.current, leaseId });
      setPreview(data);
      const sel = defaultSelection(data);
      setSelected(sel.ids);
      setTruncated(sel.truncated);
    } catch (err) {
      setPreview(null);
      setSelected([]);
      setLoadError(errorMessage(err, t("Impossible de charger l'aperçu des relances.")));
    } finally {
      setLoading(false);
    }
  }, [tenantId, leaseId]);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setSendError(null);
    void loadPreview();
  }, [open, loadPreview]);

  const itemsById = useMemo(() => {
    const map = new Map<string, { item: RentalReminderPreviewItemDto; tenantName: string | null }>();
    for (const g of preview?.groups ?? []) {
      for (const item of g.items) map.set(item.installmentId, { item, tenantName: item.tenantName ?? g.tenantName });
    }
    return map;
  }, [preview]);

  const selectedDue = selected.reduce((sum, id) => sum + (itemsById.get(id)?.item.amountDue ?? 0), 0);

  function changeGroupSelection(groupKeys: string[], keys: React.Key[]) {
    const others = selected.filter(id => !groupKeys.includes(id));
    const next = [...others, ...keys.map(String)];
    if (next.length > REMINDER_BATCH_MAX) {
      setTruncated(true);
      setSelected(next.slice(0, REMINDER_BATCH_MAX));
    } else {
      setSelected(next);
    }
  }

  async function handleSend() {
    setSending(true);
    setSendError(null);
    let merged: BatchReminderResultDto = { results: [], totals: { sent: 0, skipped: 0, failed: 0 } };
    setResult(merged);
    try {
      for (let i = 0; i < selected.length; i += REMINDER_BATCH_CHUNK) {
        const chunk = selected.slice(i, i + REMINDER_BATCH_CHUNK);
        const res = await sendReminderBatch(tenantId, { installmentIds: chunk });
        merged = {
          results: [...merged.results, ...res.results],
          totals: {
            sent: merged.totals.sent + res.totals.sent,
            skipped: merged.totals.skipped + res.totals.skipped,
            failed: merged.totals.failed + res.totals.failed
          }
        };
        setResult(merged);
      }
      message.success(t('Relances traitées.'));
    } catch (err) {
      setSendError(errorMessage(err, t("L'envoi des relances a été interrompu.")));
    } finally {
      setSending(false);
    }
  }

  function handleClose() {
    if (result) onDone?.();
    onClose();
  }

  const columns: ColumnsType<RentalReminderPreviewItemDto> = [
    { title: t('Période'), key: 'periode', render: (_, i) => libellePeriodeEcheance(i.periodMonth, i.periodYear) },
    { title: t('Échéance'), key: 'due', render: (_, i) => dateCourte(i.dueDate) },
    { title: t('Retard'), key: 'retard', render: (_, i) => retardText(i.daysLate) },
    {
      title: t('Reste dû'),
      key: 'reste',
      align: 'end',
      render: (_, i) => formatMoney(i.amountDue, { currency: i.currency || 'FCFA' })
    },
    {
      title: t('Niveau suivant'),
      key: 'niveau',
      render: (_, i) => (i.nextLevel ? reminderLevelLabel(i.nextLevel) : '-')
    },
    {
      title: t('Canaux'),
      key: 'canaux',
      render: (_, i) => (i.channels.length ? i.channels.map(reminderChannelLabel).join(', ') : '-')
    },
    {
      title: t('Lien joint'),
      key: 'lien',
      render: (_, i) =>
        i.eligible ? (
          i.paymentLinkIncluded ? (
            <Tag color="green">{t('Lien de paiement')}</Tag>
          ) : (
            <Tag>{t('Sans lien')}</Tag>
          )
        ) : null
    },
    {
      title: t('Motif'),
      key: 'motif',
      render: (_, i) =>
        i.exclusions.length ? <Text type="secondary">{i.exclusions.map(reminderExclusionText).join(' ; ')}</Text> : null
    }
  ];

  const resultColumns: ColumnsType<SendReminderResultDto> = [
    {
      title: t('Locataire'),
      key: 'locataire',
      render: (_, r) => itemsById.get(r.installmentId)?.tenantName ?? '-'
    },
    {
      title: t('Bail'),
      key: 'bail',
      render: (_, r) => itemsById.get(r.installmentId)?.item.leaseReference ?? '-'
    },
    {
      title: t('Période'),
      key: 'periode',
      render: (_, r) => {
        const i = itemsById.get(r.installmentId)?.item;
        return i ? libellePeriodeEcheance(i.periodMonth, i.periodYear) : '-';
      }
    },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, r) =>
        r.status === 'SENT' ? (
          <Tag color="green">{t('Envoyée')}</Tag>
        ) : r.status === 'SKIPPED' ? (
          <Tag>{t('Ignorée')}</Tag>
        ) : (
          <Tag color="red">{t('Échec')}</Tag>
        )
    },
    { title: t('Niveau'), key: 'niveau', render: (_, r) => (r.level ? reminderLevelLabel(r.level) : '-') },
    {
      title: t('Détail'),
      key: 'detail',
      render: (_, r) => {
        if (r.status === 'SKIPPED') return reminderExclusionText(r.reason);
        if (r.status === 'FAILED' && r.channels.length === 0) return reminderFailureText(r.failureCode);
        return (
          <Space direction="vertical" size={0}>
            {r.channels.map(c => (
              <Text key={c.channel} type={c.status === 'FAILED' ? 'danger' : undefined}>
                {c.status === 'FAILED'
                  ? `${reminderChannelLabel(c.channel)} : ${reminderFailureText(c.failureCode)}`
                  : `${reminderChannelLabel(c.channel)} : ${t('Envoyée')}`}
              </Text>
            ))}
          </Space>
        );
      }
    }
  ];

  const groups = preview?.groups ?? [];
  const empty = !loading && !loadError && !!preview && groups.length === 0;
  const showResult = result !== null;

  const footer = showResult ? (
    <Button type="primary" onClick={handleClose} disabled={sending}>
      {t('Fermer')}
    </Button>
  ) : (
    <Space>
      <Button onClick={onClose}>{t('Annuler')}</Button>
      <Button type="primary" disabled={selected.length === 0} loading={sending} onClick={handleSend}>
        {t('Envoyer {{count}} relance(s)', { count: selected.length })}
      </Button>
    </Space>
  );

  return (
    <Modal
      open={open}
      title={t('Relancer en lot')}
      onCancel={showResult ? handleClose : onClose}
      footer={footer}
      width={980}
      destroyOnHidden
    >
      {showResult ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space size="large" wrap>
            <Text>{t('{{count}} envoyée(s)', { count: result.totals.sent })}</Text>
            <Text>{t('{{count}} ignorée(s)', { count: result.totals.skipped })}</Text>
            <Text type={result.totals.failed ? 'danger' : undefined}>
              {t('{{count}} échec(s)', { count: result.totals.failed })}
            </Text>
          </Space>
          {sendError ? (
            <Alert
              type="error"
              showIcon
              message={t("L'envoi s'est arrêté avant la fin. Les relances ci-dessous sont déjà parties.")}
              description={sendError}
            />
          ) : null}
          <Table
            size="small"
            rowKey="installmentId"
            loading={sending}
            pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false, size: 'small' }}
            dataSource={result.results}
            columns={resultColumns}
            scroll={{ x: 'max-content' }}
          />
        </Space>
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap align="end">
            <label>
              <div>{t('Retard minimal (jours)')}</div>
              <InputNumber
                min={0}
                max={365}
                value={minDaysLate}
                onChange={v => setMinDaysLate(Number(v ?? 1))}
                aria-label={t('Retard minimal (jours)')}
              />
            </label>
            <label>
              <div>{t('Jours avant échéance (0 à 30)')}</div>
              <InputNumber
                min={0}
                max={30}
                value={daysBefore}
                onChange={v => setDaysBefore(Number(v ?? 0))}
                aria-label={t('Jours avant échéance (0 à 30)')}
              />
            </label>
            <Button icon={<ReloadOutlined />} onClick={() => void loadPreview()} loading={loading}>
              {t('Actualiser')}
            </Button>
          </Space>

          {loadError ? <Alert type="error" showIcon message={loadError} /> : null}
          {empty ? <Alert type="info" showIcon message={t('Aucune échéance à relancer pour le moment.')} /> : null}
          {truncated ? (
            <Alert
              type="warning"
              showIcon
              message={t('Sélection limitée à {{max}} échéances', { max: REMINDER_BATCH_MAX })}
            />
          ) : null}

          {groups.map(group => {
            const groupKeys = group.items.map(i => i.installmentId);
            return (
              <div key={`${group.leaseId}-${group.tenantClientId ?? ''}`}>
                <Space wrap style={{ marginBottom: 4 }}>
                  <Text strong>{group.tenantName ?? t('Locataire inconnu')}</Text>
                  <Text type="secondary">
                    {[group.leaseReference, group.propertyLabel].filter(Boolean).join(' · ')}
                  </Text>
                  <Text>
                    {t('Total dû')} : {formatMoney(group.totalDue, { currency: 'FCFA' })}
                  </Text>
                </Space>
                <Table
                  size="small"
                  rowKey="installmentId"
                  pagination={false}
                  dataSource={group.items}
                  columns={columns}
                  scroll={{ x: 'max-content' }}
                  rowSelection={{
                    selectedRowKeys: selected.filter(id => groupKeys.includes(id)),
                    onChange: keys => changeGroupSelection(groupKeys, keys),
                    getCheckboxProps: (i: RentalReminderPreviewItemDto) => ({ disabled: !i.eligible })
                  }}
                />
              </div>
            );
          })}

          {preview ? (
            <Space size="large" wrap>
              <Text>{t('{{count}} éligible(s)', { count: preview.totals.eligible })}</Text>
              <Text>{t('{{count}} exclue(s)', { count: preview.totals.excluded })}</Text>
              <Text>
                {t('Montant dû de la sélection')} : {formatMoney(selectedDue, { currency: 'FCFA' })}
              </Text>
            </Space>
          ) : null}
          <Text type="secondary">
            {t(
              "Le serveur recalcule chaque ligne au moment de l'envoi : certaines relances peuvent être ignorées si la situation a changé."
            )}
          </Text>
        </Space>
      )}
    </Modal>
  );
};
