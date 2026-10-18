import React, { useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Alert, App, Button, Descriptions, Popconfirm, Skeleton, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelRemittance,
  cancelRemittanceLine,
  exportRemittance,
  getRemittance,
  refreshRemittance,
  rejectRemittanceLine,
  RemittanceDto,
  RemittanceLineDto,
  RemittanceStatus,
  resendPrenotifications,
  settleAllRemittanceLines,
  SettleAllResult,
  settleRemittanceLine,
  SkippedMandateDto,
  submitRemittance,
  validateRemittance
} from '../../services/direct-debit-service';
import { PageHeader, formatMoney } from '../../components/primitives';
import { DirectDebitTabs } from '../../components/rental/direct-debit/DirectDebitTabs';
import { ReasonModal } from '../../components/rental/direct-debit/ReasonModal';
import {
  DraftSkippedMandatesSection,
  PrenotificationSummaryAlert,
  ReturnSummaryAlert,
  SkippedMandatesAlert
} from '../../components/rental/direct-debit/RemittanceNotices';
import {
  invalidateRentalCollections,
  RejectLineModal,
  SettleAllModal,
  SettleLineModal
} from '../../components/rental/direct-debit/ReturnConstatModals';
import {
  apiErrorMessage,
  formatDate,
  formatDay,
  formatPeriod,
  inactiveMandateWarning,
  PrenotificationTag,
  recipientSourceLabel,
  RemittanceLineStatusTag,
  RemittanceStatusTag
} from '../../components/rental/direct-debit/direct-debit-shared';
import { saveBlob } from '../../utils/save-blob';
import { detailKey, entityKeyPrefix, STALE_TIME } from '../../lib/query-keys';
import { t } from '../../i18n/t';

const { Text } = Typography;

/** Relecture automatique des avis en cours d'envoi : toutes les 3 s, pendant 2 minutes au plus. */
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 2 * 60 * 1000;

type Action =
  'refresh' | 'validate' | 'resend' | 'export' | 'submit' | 'cancel' | 'line' | 'settle' | 'reject' | 'settleAll';

/** Bouton dont le geste est confirmé par une infobulle de confirmation. */
const ConfirmButton: React.FC<{
  label: string;
  confirm: React.ReactNode;
  onConfirm: () => void;
  loading?: boolean;
  disabled?: boolean;
  type?: 'primary' | 'default';
}> = ({ label, confirm, onConfirm, loading, disabled, type = 'default' }) => (
  <Popconfirm
    title={<div style={{ maxWidth: 380 }}>{confirm}</div>}
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

/** Ce que l'annulation entraîne, selon l'avancement de la remise. */
function cancelDescription(status: RemittanceStatus, exportCount: number): string {
  if (status === 'VALIDATED') {
    return t(
      "Les locataires ont déjà reçu un avis de prélèvement : prévenez-les que le prélèvement n'aura pas lieu. Toutes les lignes de la remise seront annulées. Cette action est définitive."
    );
  }
  if (status === 'EXPORTED') {
    return exportCount === 1
      ? t(
          "Le fichier a déjà été produit (1 fois). S'il a été chargé sur la banque en ligne, annulez aussi la remise chez la banque : sinon les comptes seront débités, et une nouvelle remise prélèverait une deuxième fois. Toutes les lignes seront annulées. Cette action est définitive."
        )
      : t(
          "Le fichier a déjà été produit ({{n}} fois). S'il a été chargé sur la banque en ligne, annulez aussi la remise chez la banque : sinon les comptes seront débités, et une nouvelle remise prélèverait une deuxième fois. Toutes les lignes seront annulées. Cette action est définitive.",
          { n: exportCount }
        );
  }
  return t(
    "Rien n'est encore parti : les échéances redeviendront disponibles pour une autre remise. Toutes les lignes seront annulées. Cette action est définitive."
  );
}

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
  const [busy, setBusy] = useState<Action | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [lineToWithdraw, setLineToWithdraw] = useState<RemittanceLineDto | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [lineToSettle, setLineToSettle] = useState<RemittanceLineDto | null>(null);
  const [lineToReject, setLineToReject] = useState<RemittanceLineDto | null>(null);
  const [settleAllOpen, setSettleAllOpen] = useState(false);
  const [settleAllResult, setSettleAllResult] = useState<SettleAllResult | null>(null);

  const pollStartedAt = useRef<number | null>(null);

  const key = detailKey('direct-debit-remittances', tenantId, remittanceId as string);
  const {
    data: remittance,
    isPending,
    error
  } = useQuery({
    queryKey: key,
    queryFn: () => getRemittance(tenantId as string, remittanceId as string),
    enabled: Boolean(tenantId && remittanceId),
    staleTime: STALE_TIME.list,
    // Les avis partent en arrière-plan : on relit la remise tant que des lignes sont « en attente ».
    refetchInterval: query => {
      const current = query.state.data;
      const sending =
        current !== undefined &&
        ['VALIDATED', 'EXPORTED', 'SUBMITTED'].includes(current.status) &&
        current.prenotificationSummary.pending > 0;
      if (!sending) {
        pollStartedAt.current = null;
        return false;
      }
      pollStartedAt.current ??= Date.now();
      return Date.now() - pollStartedAt.current < POLL_MAX_MS ? POLL_INTERVAL_MS : false;
    }
  });

  const apply = (next: RemittanceDto) => {
    queryClient.setQueryData(key, next);
    void queryClient.invalidateQueries({ queryKey: entityKeyPrefix('direct-debit-remittances', tenantId) });
  };

  /** Après une erreur (un 409 veut dire que l'état a changé), l'écran relit la remise. */
  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: entityKeyPrefix('direct-debit-remittances', tenantId) });
  };

  const run = async (action: Action, work: () => Promise<void>, success: string | (() => string), fallback: string) => {
    setBusy(action);
    try {
      await work();
      message.success(typeof success === 'function' ? success() : success);
    } catch (err) {
      message.error(apiErrorMessage(err, fallback));
      reload();
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
  // Constats du retour banque : seulement une fois le fichier produit (spec 042 §8.3 et §8.4).
  const canRecordReturn = status === 'EXPORTED' || status === 'SUBMITTED';
  const showReturnSummary =
    canRecordReturn ||
    remittance.returnState !== 'NOT_APPLICABLE' ||
    remittance.lines.some(line => line.status === 'SETTLED' || line.status === 'REJECTED');
  const activeLines = remittance.lines.filter(line => line.status === 'PENDING');
  const summary = remittance.prenotificationSummary;
  const anyBusy = busy !== null;
  const showNoticesSummary = status === 'VALIDATED' || status === 'EXPORTED' || status === 'SUBMITTED';
  // Locataires qui n'ont pas (encore) reçu leur avis de prélèvement.
  const notNotified = Math.max(0, remittance.lineCount - summary.sent);
  // Lignes actives dont le mandat n'est plus actif : le fichier les contient encore.
  const inactiveMandateLines = activeLines.filter(line => line.mandate.status !== 'ACTIVE').length;
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
        pollStartedAt.current = null;
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
        pollStartedAt.current = null;
        apply(result.remittance);
      },
      t('Avis de prélèvement renvoyés'),
      t('Erreur lors du renvoi des avis de prélèvement')
    );

  const handleExport = (first: boolean) => {
    let savedAs = fallbackFileName;
    return run(
      'export',
      async () => {
        const { blob, filename } = await exportRemittance(tenantId as string, id, fallbackFileName);
        saveBlob(blob, filename);
        savedAs = filename;
        void queryClient.invalidateQueries({ queryKey: entityKeyPrefix('direct-debit-remittances', tenantId) });
      },
      // Le message nomme le fichier : sans lui, le téléchargement passe inaperçu.
      () => t('Fichier {{name}} téléchargé.', { name: savedAs }),
      first ? t('Erreur lors de la production du fichier') : t('Erreur lors du téléchargement du fichier')
    );
  };

  /** Constat sur une ligne ou sur la remise : même gabarit que le retrait (erreur dans la fenêtre, remise relue). */
  const runConstat = async (action: Action, work: () => Promise<void>, fallback: string) => {
    setDialogError(null);
    setBusy(action);
    try {
      await work();
    } catch (err) {
      setDialogError(apiErrorMessage(err, fallback));
      reload();
    } finally {
      setBusy(null);
    }
  };

  const handleSettle = (settledAt: string) => {
    const line = lineToSettle;
    if (!line) return;
    return runConstat(
      'settle',
      async () => {
        apply(await settleRemittanceLine(tenantId as string, id, line.id, { settledAt }));
        invalidateRentalCollections(queryClient, tenantId);
        setLineToSettle(null);
        message.success(t('Règlement constaté'));
      },
      t('Erreur lors du constat du règlement')
    );
  };

  const handleReject = (input: { rejectedAt: string; code?: string; reason?: string }) => {
    const line = lineToReject;
    if (!line) return;
    return runConstat(
      'reject',
      async () => {
        apply(await rejectRemittanceLine(tenantId as string, id, line.id, input));
        invalidateRentalCollections(queryClient, tenantId);
        setLineToReject(null);
        message.success(t('Rejet constaté'));
      },
      t('Erreur lors du constat du rejet')
    );
  };

  const handleSettleAll = (settledAt: string) =>
    runConstat(
      'settleAll',
      async () => {
        const result = await settleAllRemittanceLines(tenantId as string, id, { settledAt });
        apply(result.remittance);
        invalidateRentalCollections(queryClient, tenantId);
        setSettleAllResult(result);
      },
      t('Erreur lors du constat des règlements')
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
      message.success(t('Remise annulée'));
    } catch (err) {
      setDialogError(apiErrorMessage(err, t("Erreur lors de l'annulation de la remise")));
      reload();
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
      reload();
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
          {line.status === 'PENDING' && inactiveMandateWarning(line.mandate.status) && (
            <div>
              <Tag color="warning">{inactiveMandateWarning(line.mandate.status)}</Tag>
            </div>
          )}
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
      title: t('Avis de prélèvement'),
      key: 'prenotification',
      render: (_value, line) => (
        <Space size={4} wrap>
          <PrenotificationTag status={line.prenotificationStatus} />
          {line.prenotifiedAt && <Text type="secondary">{formatDate(line.prenotifiedAt)}</Text>}
          {line.status !== 'CANCELED' && (
            <div>
              {line.prenotificationRecipient ? (
                <Text type="secondary">
                  <bdi dir="ltr">{line.prenotificationRecipient.masked}</bdi>
                  {' ('}
                  {recipientSourceLabel(line.prenotificationRecipient.source)}
                  {')'}
                </Text>
              ) : (
                <Text type="secondary">{t('aucune adresse')}</Text>
              )}
            </div>
          )}
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
          {line.status === 'REJECTED' && (line.rejectionCode || line.rejectionReason) && (
            <div>
              {line.rejectionCode && (
                <Text type="secondary">
                  <bdi dir="ltr">{line.rejectionCode}</bdi>
                </Text>
              )}
              {line.rejectionCode && line.rejectionReason ? ' — ' : ''}
              {line.rejectionReason && <Text type="secondary">{line.rejectionReason}</Text>}
            </div>
          )}
        </div>
      )
    }
  ];

  if (showReturnSummary) {
    columns.push(
      {
        title: t('Date de valeur ou de rejet'),
        key: 'returnDate',
        render: (_value, line) => {
          if (line.status === 'SETTLED') return formatDay(line.settledAt);
          if (line.status === 'REJECTED') return formatDay(line.rejectedAt);
          return '—';
        }
      },
      {
        title: t('Frais refacturés'),
        key: 'rejectFee',
        align: 'end',
        render: (_value, line) =>
          line.status === 'REJECTED' && line.rejectFeeAmount && line.rejectFeeAmount > 0
            ? formatMoney(line.rejectFeeAmount)
            : '—'
      },
      {
        title: t('Paiement'),
        key: 'payment',
        render: (_value, line) =>
          line.status === 'SETTLED' && line.paymentId ? (
            <Link to={`/tenant/${tenantId}/rental/payments/${line.paymentId}`}>{t('Voir le paiement')}</Link>
          ) : (
            '—'
          )
      }
    );
  }

  if (canWithdraw || canRecordReturn) {
    columns.push({
      title: t('Actions'),
      key: 'actions',
      render: (_value, line) => {
        if (canRecordReturn) {
          if (line.status === 'PENDING') {
            return (
              <Space size={4} wrap>
                <Button
                  size="small"
                  type="primary"
                  disabled={anyBusy}
                  onClick={() => {
                    setDialogError(null);
                    setLineToSettle(line);
                  }}
                >
                  {t('Constater le règlement')}
                </Button>
                <Button
                  size="small"
                  danger
                  disabled={anyBusy}
                  onClick={() => {
                    setDialogError(null);
                    setLineToReject(line);
                  }}
                >
                  {t('Constater le rejet')}
                </Button>
              </Space>
            );
          }
          if (line.status === 'SETTLED') {
            return (
              <Button
                size="small"
                danger
                disabled={anyBusy}
                onClick={() => {
                  setDialogError(null);
                  setLineToReject(line);
                }}
              >
                {t('Constater un rejet tardif')}
              </Button>
            );
          }
          return null;
        }
        if (line.status !== 'PENDING') return null;
        const isLast = status === 'VALIDATED' && pendingLines.length <= 1;
        const button = (
          <Button
            size="small"
            danger
            disabled={isLast || anyBusy}
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
                disabled={anyBusy}
              />
              <ConfirmButton
                type="primary"
                label={t('Valider la remise')}
                confirm={t('Valider cette remise ? Les débiteurs recevront un avis de prélèvement par e-mail.')}
                onConfirm={() => void handleValidate()}
                loading={busy === 'validate'}
                disabled={anyBusy || pendingLines.length === 0}
              />
            </>
          )}
          {status === 'VALIDATED' && (
            <ConfirmButton
              type="primary"
              label={t('Produire le fichier')}
              confirm={
                <>
                  <div>
                    {t('Produire le fichier de remise ? Il contient les IBAN complets : conservez-le avec soin.')}
                  </div>
                  <div>
                    {t(
                      "Une fois le fichier produit, une ligne ne peut plus être retirée : seule l'annulation de la remise reste possible."
                    )}
                  </div>
                  {notNotified > 0 && (
                    <div>
                      <strong>
                        {notNotified === 1
                          ? t("1 locataire n'a pas reçu l'avis de prélèvement.")
                          : t("{{n}} locataires n'ont pas reçu l'avis de prélèvement.", { n: notNotified })}
                      </strong>
                    </div>
                  )}
                </>
              }
              onConfirm={() => void handleExport(true)}
              loading={busy === 'export'}
              disabled={anyBusy}
            />
          )}
          {(status === 'EXPORTED' || status === 'SUBMITTED') && (
            <ConfirmButton
              label={t('Télécharger à nouveau le fichier')}
              confirm={
                <>
                  <div>{t('Télécharger à nouveau le fichier de remise ? Il contient les IBAN complets.')}</div>
                  {inactiveMandateLines > 0 && (
                    <div>
                      <strong>
                        {inactiveMandateLines === 1
                          ? t(
                              "Attention : 1 ligne a un mandat qui n'est plus actif ; le fichier contient encore ce prélèvement."
                            )
                          : t(
                              "Attention : {{n}} lignes ont un mandat qui n'est plus actif ; le fichier contient encore ces prélèvements.",
                              { n: inactiveMandateLines }
                            )}
                      </strong>
                    </div>
                  )}
                </>
              }
              onConfirm={() => void handleExport(false)}
              loading={busy === 'export'}
              disabled={anyBusy}
            />
          )}
          {status === 'EXPORTED' && (
            <ConfirmButton
              type="primary"
              label={t('Marquer comme déposée à la banque')}
              confirm={t('Confirmer que le fichier a été chargé sur votre banque en ligne ?')}
              onConfirm={() => void handleSubmit()}
              loading={busy === 'submit'}
              disabled={anyBusy}
            />
          )}
          {(status === 'VALIDATED' || status === 'EXPORTED') && (
            <ConfirmButton
              label={t('Renvoyer les avis de prélèvement')}
              confirm={t('Renvoyer les avis de prélèvement aux débiteurs qui ne les ont pas reçus ?')}
              onConfirm={() => void handleResend()}
              loading={busy === 'resend'}
              disabled={anyBusy}
            />
          )}
          {canRecordReturn && (
            <Button
              disabled={anyBusy || pendingLines.length === 0}
              onClick={() => {
                setDialogError(null);
                setSettleAllResult(null);
                setSettleAllOpen(true);
              }}
            >
              {t('Tout constater réglé')}
            </Button>
          )}
          {canCancel && (
            <Button
              danger
              disabled={anyBusy}
              onClick={() => {
                setDialogError(null);
                setCancelOpen(true);
              }}
            >
              {t('Annuler la remise')}
            </Button>
          )}
        </Space>

        {showNoticesSummary && <PrenotificationSummaryAlert summary={summary} lineCount={remittance.lineCount} />}
        {showReturnSummary && <ReturnSummaryAlert summary={remittance.returnSummary} state={remittance.returnState} />}
        <SkippedMandatesAlert skipped={skipped} onClose={() => setSkipped([])} />
        {status === 'DRAFT' && <DraftSkippedMandatesSection skipped={remittance.skipped} />}

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
          <Descriptions.Item label={t('Avis de prélèvement au plus tard le')}>
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
        description={cancelDescription(status, remittance.exportCount)}
        acknowledgement={
          status === 'EXPORTED'
            ? t("J'ai vérifié que ce fichier n'a pas été chargé sur la banque, ou je l'ai annulé chez elle")
            : undefined
        }
        okText={t('Annuler la remise')}
        required
        loading={busy === 'cancel'}
        error={dialogError}
        onCancel={() => setCancelOpen(false)}
        onSubmit={reason => void handleCancel(reason)}
      />
      <SettleLineModal
        open={lineToSettle !== null}
        line={lineToSettle}
        collectionDate={remittance.collectionDate}
        loading={busy === 'settle'}
        error={dialogError}
        onCancel={() => setLineToSettle(null)}
        onSubmit={settledAt => void handleSettle(settledAt)}
      />
      <RejectLineModal
        open={lineToReject !== null}
        line={lineToReject}
        late={lineToReject?.status === 'SETTLED'}
        collectionDate={remittance.collectionDate}
        loading={busy === 'reject'}
        error={dialogError}
        onCancel={() => setLineToReject(null)}
        onSubmit={input => void handleReject(input)}
      />
      <SettleAllModal
        open={settleAllOpen}
        pendingCount={pendingLines.length}
        result={settleAllResult}
        collectionDate={remittance.collectionDate}
        loading={busy === 'settleAll'}
        error={dialogError}
        onCancel={() => {
          setSettleAllOpen(false);
          setSettleAllResult(null);
        }}
        onSubmit={settledAt => void handleSettleAll(settledAt)}
      />
      <ReasonModal
        open={lineToWithdraw !== null}
        title={t('Retirer la ligne {{reference}}', { reference: lineToWithdraw?.reference ?? '' })}
        description={
          status === 'VALIDATED'
            ? t("Le locataire a déjà reçu l'avis de prélèvement : prévenez-le que ce prélèvement n'aura pas lieu.")
            : undefined
        }
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
