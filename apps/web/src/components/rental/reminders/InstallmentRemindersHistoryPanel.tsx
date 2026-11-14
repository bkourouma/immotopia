import React, { useEffect, useState } from 'react';
import { Alert, Card, Table, Tag, Typography } from 'antd';
import { listInstallmentReminders } from '../../../services/rental-payment-reminder-service';
import type { RentalPaymentReminderDto } from '../../../types/rental-payment-reminder';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { HelpButton, HelpSectionTitle } from '../../../help';
import { reminderChannelLabel, reminderFailureText, reminderLevelLabel, reminderStatusLabel } from './reminder-labels';

const { Text } = Typography;

export interface InstallmentRemindersHistoryPanelProps {
  tenantId: string;
  installmentId: string;
  canView: boolean;
  /** Change après chaque envoi pour recharger la liste. */
  refreshKey?: number;
}

const STATUS_COLOR: Record<string, string> = { SENT: 'green', DELIVERED: 'green', FAILED: 'red' };

/** Historique des relances d'une échéance (lecture seule). */
export const InstallmentRemindersHistoryPanel: React.FC<InstallmentRemindersHistoryPanelProps> = ({
  tenantId,
  installmentId,
  canView,
  refreshKey = 0
}) => {
  const [rows, setRows] = useState<RentalPaymentReminderDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    Promise.resolve()
      .then(() => listInstallmentReminders(tenantId, installmentId))
      .then(list => {
        if (!cancelled) setRows(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canView, tenantId, installmentId, refreshKey]);

  if (!canView) return null;

  return (
    <Card
      title={<HelpSectionTitle title={t('Historique des relances')} helpId="locatif.echeances.fiche.relances" />}
      extra={<HelpButton helpId="locatif.echeances.fiche.relances.tableau" />}
    >
      {error ? (
        <Alert type="warning" showIcon message={t("Impossible de charger l'historique des relances.")} />
      ) : (
        <Table<RentalPaymentReminderDto>
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: t('Aucune relance envoyée pour cette échéance.') }}
          columns={[
            {
              title: t("Date d'envoi"),
              dataIndex: 'sent_at',
              render: (v: string) => new Date(v).toLocaleString(activeLocale())
            },
            { title: t('Niveau de relance'), dataIndex: 'level', render: (v: number) => reminderLevelLabel(v) },
            {
              title: t('Canal'),
              dataIndex: 'channel',
              render: (v: RentalPaymentReminderDto['channel']) => reminderChannelLabel(v)
            },
            {
              title: t('Statut'),
              dataIndex: 'status',
              render: (_: unknown, r) => (
                <div>
                  <Tag color={STATUS_COLOR[r.status] ?? 'default'}>{reminderStatusLabel(r.status)}</Tag>
                  {r.status === 'FAILED' ? (
                    <div>
                      <Text type="danger">{reminderFailureText(r.failure_code)}</Text>
                    </div>
                  ) : null}
                </div>
              )
            },
            { title: t('Envoyée par'), dataIndex: 'sent_by_name', render: (v: string | null) => v ?? '-' },
            {
              title: t('Lien de paiement'),
              dataIndex: 'payment_link_id',
              render: (v: string | null) => (v ? <Tag>{t('Lien joint')}</Tag> : '-')
            }
          ]}
        />
      )}
    </Card>
  );
};
