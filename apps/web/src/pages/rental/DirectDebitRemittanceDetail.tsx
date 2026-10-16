import React, { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Alert, App, Button, Descriptions, Popconfirm, Skeleton, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelRemittance,
  cancelRemittanceLine,
  exportRemittance,
  getRemittance,
  PrenotificationSummaryDto,
  refreshRemittance,
  RemittanceDto,
  RemittanceLineDto,
  resendPrenotifications,
  SkippedMandateDto,
  submitRemittance,
  validateRemittance
} from '../../services/direct-debit-service';
import { PageHeader, formatMoney } from '../../components/primitives';
import { DirectDebitTabs } from '../../components/rental/direct-debit/DirectDebitTabs';
import { ReasonModal } from '../../components/rental/direct-debit/ReasonModal';
import {
  PrenotificationSummaryAlert,
  SkippedMandatesAlert
} from '../../components/rental/direct-debit/RemittanceNotices';
import {
  apiErrorMessage,
  formatDate,
  formatDay,
  formatPeriod,
  PrenotificationTag,
  RemittanceLineStatusTag,
  RemittanceStatusTag
} from '../../components/rental/direct-debit/direct-debit-shared';
import { saveBlob } from '../../utils/save-blob';
import { detailKey, entityKeyPrefix, STALE_TIME } from '../../lib/query-keys';
import { t } from '../../i18n/t';

const { Text } = Typography;

type Action = 'refresh' | 'validate' | 'resend' | 'export' | 'submit' | 'cancel' | 'line';

/** Bouton dont le geste est confirmé par une infobulle de confirmation. */
const ConfirmButton: React.FC<{
  label: string;
  confirm: string;
  onConfirm: () => void;
  loading?: boolean;
  disabled?: boolean;
  type?: 'primary' | 'default';
}> = ({ label, confirm, onConfirm, loading, disabled, type = 'default' }) => (
  <Popconfirm
    title={confirm}
    okText={t('Confirmer')}
    cancelText={t('Fermer')}
    onConfirm={onConfirm}
    disabled={disabled || loading}
  >
    <Button type={type} loading={loading} disabled={disabled}>
      {label}
    </Button>
  </Popconfirm>
);

/**
 * Détail d'une remise de prélèvements (spec 042, P2, §7.3 et §7.10) : en-tête,
 * actions selon le statut, lignes, mandats non retenus. Aucun crochet de
 * permission : un refus de l'API (403) s'affiche en message clair.
 */
export const DirectDebitRemittanceDetail: React.FC = () => {
  const { tenantId, remittanceId } = useParams<{ tenantId: string; remittanceId: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  // Les mandats non retenus à la création arrivent par l'état de navigation.
  const [skipped, setSkipped] = useState<SkippedMandateDto[]>(
    () => (location.state as { skipped?: SkippedMandateDto[] } | null)?.skipped ?? []
  );
  const [prenotifications, setPrenotifications] = useState<PrenotificationSummaryDto | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [lineToWithdraw, setLineToWithdraw] = useState<RemittanceLineDto | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const key = detailKey('direct-debit-remittances', tenantId, remittanceId as string);
  const {
    data: remittance,
    isPending,
    error
  } = useQuery({
    queryKey: key,
    queryFn: () => getRemittance(tenantId as string, remittanceId as string),
    enabled: Boolean(tenantId && remittanceId),
    staleTime: STALE_TIME.list
  });

  const apply = (next: RemittanceDto) => {
    queryClient.setQueryData(key, next);
    void queryClient.invalidateQueries({ queryKey: entityKeyPrefix('direct-debit-remittances', tenantId) });
  };

  const run = async (action: Action, work: () => Promise<void>, success: string, fallback: string) => {
    setBusy(action);
    try {
      await work();
      message.success(success);
    } catch (err) {
      message.error(apiErrorMessage(err, fallback));
    } finally {
      setBusy(null);
    }
  };

  if (isPending) {
    return (
      <>
        <PageHeader title={t('Remise de prélèvements')} />
        <DirectDebitTabs />
        <Skeleton active />
      </>
    );
  }

  if (error || !remittance) {
    return (
      <>
        <PageHeader title={t('Remise de prélèvements')} />
        <DirectDebitTabs />
        <Alert type="error" showIcon message={apiErrorMessage(error, t('Erreur lors du chargement de la remise'))} />
      </>
    );
  }

  const id = remittance.id;
  const status = remittance.status;
  const pendingLines = remittance.lines.filter(line => line.status === 'PENDING');
  const canWithdraw = status === 'DRAFT' || status === 'VALIDATED';
  const canCancel = status === 'DRAFT' || status === 'VALIDATED' || status === 'EXPORTED';
  const fallbackFileName = `${remittance.reference}.csv`;

  const handleRefresh = () =>
    run(
      'refresh',
      async () => {
        const result = await refreshRemittance(tenantId as string, id);
        setSkipped(result.skipped);
        apply(result.remittance);
      },
      t('Remise actualisée'),
      t("Erreur lors de l'actualisation de la remise")
    );

  const handleValidate = () =>
    run(
      'validate',
      async () => {
        const result = await validateRemittance(tenantId as string, id);
        setPrenotifications(result.prenotifications);
        setSkipped([]);
        apply(result.remittance);
      },
      t('Remise validée'),
      t('Erreur lors de la validation de la remise')
    );

  const handleResend = () =>
    run(
      'resend',
      async () => {
        const result = await resendPrenotifications(tenantId as string, id);
        setPrenotifications(result.prenotifications);
        apply(result.remittance);
      },
      t('Prénotifications renvoyées'),
      t('Erreur lors du renvoi des prénotifications')
    );

  const handleExport = (first: boolean) =>
    run(
      'export',
      async () => {
        const { blob, filename } = await exportRemittance(tenantId as string, id, fallbackFileName);
        saveBlob(blob, filename);
        void queryClient.invalidateQueries({ queryKey: entityKeyPrefix('direct-debit-remittances', tenantId) });
      },
      first ? t('Fichier produit') : t('Fichier téléchargé'),
      t('Erreur lors de la production du fichier')
    );

  const handleSubmit = () =>
    run(
      'submit',
      async () => {
        apply(await submitRemittance(tenantId as string, id));
      },
      t('Remise marquée comme déposée à la banque'),
      t('Erreur lors du dépôt de la remise')
    );

  const handleCancel = async (reason: string) => {
    setDialogError(null);
    setBusy('cancel');
    try {
      apply(await cancelRemittance(tenantId as string, id, reason));
      setCancelOpen(false);
      setPrenotifications(null);
      message.success(t('Remise annulée'));
    } catch (err) {
      setDialogError(apiErrorMessage(err, t("Erreur lors de l'annulation de la remise")));
    } finally {
      setBusy(null);
    }
  };

  const handleWithdraw = async (reason: string) => {
    if (!lineToWithdraw) return;
    setDialogError(null);
    setBusy('line');
    try {
      apply(await cancelRemittanceLine(tenantId as string, id, lineToWithdraw.id, reason || undefined));
      setLineToWithdraw(null);
      message.success(t('Ligne retirée'));
    } catch (err) {
      setDialogError(apiErrorMessage(err, t('Erreur lors du retrait de la ligne')));
    } finally {
      setBusy(null);
    }
  };

  const columns: ColumnsType<RemittanceLineDto> = [
    {
      title: t("Référence d'opération"),
      key: 'reference',
      render: (_value, line) => <bdi dir="ltr">{line.reference}</bdi>
    },
    { title: t('Débiteur'), key: 'debtor', render: (_value, line) => line.debtor.displayName ?? '—' },
    {
      title: t('Bail'),
      key: 'lease',
      render: (_value, line) => (
        <Link to={`/tenant/${tenantId}/rental/leases/${line.lease.id}`}>{line.lease.leaseNumber}</Link>
      )
    },
    {
      title: t('Mandat'),
      key: 'mandate',
      render: (_value, line) => (
        <div>
          <div>{line.mandate.reference}</div>
          <Text type="secondary">
            <bdi dir="ltr">{line.mandate.ibanMasked}</bdi>
          </Text>
        </div>
      )
    },
    {
      title: t('Période'),
      key: 'period',
      render: (_value, line) => formatPeriod(line.installment.periodYear, line.installment.periodMonth)
    },
    {
      title: t('Reste dû'),
      key: 'remaining',
      align: 'end',
      render: (_value, line) => formatMoney(line.remainingDueAtSelection)
    },
    {
      title: t('Montant prélevé'),
      key: 'amount',
      align: 'end',
      render: (_value, line) => (
        <Space size={4} wrap>
          {formatMoney(line.amount)}
          {line.capped && (
            <Tooltip
              title={
                line.mandate.maxAmount != null
                  ? t('Limité au plafond du mandat : {{amount}}', { amount: formatMoney(line.mandate.maxAmount) })
                  : undefined
              }
            >
              <Tag color="warning">{t('Plafonné')}</Tag>
            </Tooltip>
          )}
        </Space>
      )
    },
    {
      title: t('Prénotification'),
      key: 'prenotification',
      render: (_value, line) => (
        <Space size={4} wrap>
          <PrenotificationTag status={line.prenotificationStatus} />
          {line.prenotifiedAt && <Text type="secondary">{formatDate(line.prenotifiedAt)}</Text>}
        </Space>
      )
    },
    {
      title: t('Statut'),
      key: 'status',
      render: (_value, line) => (
        <div>
          <RemittanceLineStatusTag status={line.status} />
          {line.status === 'CANCELED' && line.cancellationReason && (
            <div>
              <Text type="secondary">{line.cancellationReason}</Text>
            </div>
          )}
        </div>
      )
    }
  ];

  if (canWithdraw) {
    columns.push({
      title: t('Actions'),
      key: 'actions',
      render: (_value, line) => {
        if (line.status !== 'PENDING') return null;
        const isLast = status === 'VALIDATED' && pendingLines.length <= 1;
        const button = (
          <Button
            size="small"
            danger
            disabled={isLast}
            onClick={() => {
              setDialogError(null);
              setLineToWithdraw(line);
            }}
          >
            {t('Retirer')}
          </Button>
        );
        return isLast ? (
          <Tooltip title={t("La dernière ligne d'une remise validée ne se retire pas : annulez la remise.")}>
            <span>{button}</span>
          </Tooltip>
        ) : (
          button
        );
      }
    });
  }

  return (
    <>
      <PageHeader
        title={remittance.reference}
        subtitle={`${remittance.creditor.label} · ${formatPeriod(remittance.periodYear, remittance.periodMonth)}`}
      />
      <DirectDebitTabs />
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {status === 'EXPORTED' && (
          <Alert
            type="warning"
            showIcon
            message={t(
              'Fichier produit mais remise pas encore marquée comme déposée à la banque : chargez le fichier sur votre banque en ligne, puis marquez la remise comme déposée.'
            )}
          />
        )}
        {status === 'SUBMITTED' && (
          <Alert
            type="info"
            showIcon
            message={t('Remise déposée à la banque le {{date}}', { date: formatDate(remittance.submittedAt) })}
          />
        )}
        {status === 'CANCELED' && (
          <Alert
            type="info"
            showIcon
            message={t('Remise annulée le {{date}}', { date: formatDate(remittance.canceledAt) })}
            description={remittance.cancellationReason ?? undefined}
          />
        )}

        <Space wrap>
          {status === 'DRAFT' && (
            <>
              <ConfirmButton
                label={t('Actualiser')}
                confirm={t("Recalculer les lignes à partir des échéances et des mandats d'aujourd'hui ?")}
                onConfirm={() => void handleRefresh()}
                loading={busy === 'refresh'}
              />
              <ConfirmButton
                type="primary"
                label={t('Valider la remise')}
                confirm={t('Valider cette remise ? Les débiteurs recevront une prénotification par e-mail.')}
                onConfirm={() => void handleValidate()}
                loading={busy === 'validate'}
                disabled={pendingLines.length === 0}
              />
            </>
          )}
          {status === 'VALIDATED' && (
            <ConfirmButton
              type="primary"
              label={t('Produire le fichier')}
              confirm={t('Produire le fichier de remise ? Il contient les IBAN complets : conservez-le avec soin.')}
              onConfirm={() => void handleExport(true)}
              loading={busy === 'export'}
            />
          )}
          {(status === 'EXPORTED' || status === 'SUBMITTED') && (
            <ConfirmButton
              label={t('Télécharger à nouveau le fichier')}
              confirm={t('Télécharger à nouveau le fichier de remise ? Il contient les IBAN complets.')}
              onConfirm={() => void handleExport(false)}
              loading={busy === 'export'}
            />
          )}
          {status === 'EXPORTED' && (
            <ConfirmButton
              type="primary"
              label={t('Marquer comme déposée à la banque')}
              confirm={t('Confirmer que le fichier a été chargé sur votre banque en ligne ?')}
              onConfirm={() => void handleSubmit()}
              loading={busy === 'submit'}
            />
          )}
          {(status === 'VALIDATED' || status === 'EXPORTED') && (
            <ConfirmButton
              label={t('Renvoyer les prénotifications')}
              confirm={t('Renvoyer les prénotifications aux débiteurs qui ne les ont pas reçues ?')}
              onConfirm={() => void handleResend()}
              loading={busy === 'resend'}
            />
          )}
          {canCancel && (
            <Button
              danger
              onClick={() => {
                setDialogError(null);
                setCancelOpen(true);
              }}
            >
              {t('Annuler la remise')}
            </Button>
          )}
        </Space>

        {prenotifications && (
          <PrenotificationSummaryAlert summary={prenotifications} onClose={() => setPrenotifications(null)} />
        )}
        <SkippedMandatesAlert skipped={skipped} onClose={() => setSkipped([])} />

        <Descriptions bordered size="small" column={{ xs: 1, md: 2, xl: 3 }}>
          <Descriptions.Item label={t('Référence')}>
            <bdi dir="ltr">{remittance.reference}</bdi>
          </Descriptions.Item>
          <Descriptions.Item label={t('Statut')}>
            <RemittanceStatusTag status={status} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Créancier')}>{remittance.creditor.label}</Descriptions.Item>
          <Descriptions.Item label={t("Numéro d'émetteur")}>
            {remittance.creditor.creditorIdentifier ? (
              <bdi dir="ltr">{remittance.creditor.creditorIdentifier}</bdi>
            ) : (
              '—'
            )}
          </Descriptions.Item>
          <Descriptions.Item label={t('Format du fichier')}>
            <bdi dir="ltr">{remittance.fileFormat}</bdi>
          </Descriptions.Item>
          <Descriptions.Item label={t('Date de prélèvement')}>{formatDay(remittance.collectionDate)}</Descriptions.Item>
          <Descriptions.Item label={t('Période')}>
            {formatPeriod(remittance.periodYear, remittance.periodMonth)}
          </Descriptions.Item>
          <Descriptions.Item label={t('Prénotification au plus tard le')}>
            {formatDay(remittance.prenotificationDeadline)}
          </Descriptions.Item>
          <Descriptions.Item label={t('Lignes')}>{remittance.lineCount}</Descriptions.Item>
          <Descriptions.Item label={t('Total')}>{formatMoney(remittance.totalAmount)}</Descriptions.Item>
          {remittance.validatedAt && (
            <Descriptions.Item label={t('Validée le')}>{formatDate(remittance.validatedAt)}</Descriptions.Item>
          )}
          {remittance.firstExportedAt && (
            <Descriptions.Item label={t('Fichier produit le')}>
              {formatDate(remittance.firstExportedAt)}
            </Descriptions.Item>
          )}
          {remittance.lastExportedAt && remittance.exportCount > 1 && (
            <Descriptions.Item label={t('Dernier téléchargement')}>
              {t('{{date}} ({{n}} fichiers produits)', {
                date: formatDate(remittance.lastExportedAt),
                n: remittance.exportCount
              })}
            </Descriptions.Item>
          )}
          {remittance.submittedAt && (
            <Descriptions.Item label={t('Déposée à la banque le')}>
              {formatDate(remittance.submittedAt)}
            </Descriptions.Item>
          )}
          {remittance.canceledAt && (
            <Descriptions.Item label={t('Annulée le')}>{formatDate(remittance.canceledAt)}</Descriptions.Item>
          )}
          {remittance.cancellationReason && (
            <Descriptions.Item label={t("Motif d'annulation")}>{remittance.cancellationReason}</Descriptions.Item>
          )}
          {remittance.notes && <Descriptions.Item label={t('Notes')}>{remittance.notes}</Descriptions.Item>}
        </Descriptions>

        <Table<RemittanceLineDto>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={remittance.lines}
          pagination={false}
          scroll={{ x: 'max-content' }}
          onRow={line => ({ style: line.status === 'CANCELED' ? { opacity: 0.55 } : undefined })}
          locale={{ emptyText: t('Aucune ligne dans cette remise') }}
        />
      </Space>

      <ReasonModal
        open={cancelOpen}
        title={t('Annuler la remise')}
        description={t('Toutes les lignes de la remise seront annulées. Cette action est définitive.')}
        okText={t('Annuler la remise')}
        required
        loading={busy === 'cancel'}
        error={dialogError}
        onCancel={() => setCancelOpen(false)}
        onSubmit={reason => void handleCancel(reason)}
      />
      <ReasonModal
        open={lineToWithdraw !== null}
        title={t('Retirer la ligne {{reference}}', { reference: lineToWithdraw?.reference ?? '' })}
        okText={t('Retirer')}
        required={false}
        loading={busy === 'line'}
        error={dialogError}
        onCancel={() => setLineToWithdraw(null)}
        onSubmit={reason => void handleWithdraw(reason)}
      />
    </>
  );
};
