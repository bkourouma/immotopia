import React, { useState } from 'react';
import { Button, Space, Tag } from 'antd';
import { CreditCardOutlined, FileTextOutlined, MobileOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DataCard, DataView, MoneyValue } from '../../components/primitives';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import { downloadCoOwnerChargeCallNotice, type CoOwnerChargeCall } from '../../services/coowner-portal-service';
import { formatChargePeriod } from '../../utils/charge-period';
import { describeDownloadError } from '../../utils/download-error';
import { saveBlob } from '../../utils/save-blob';
import { ChargeCallStatusTag } from './labels';
import { isNotFound } from './portal-error';

/**
 * Bouton « Avis d'appel (PDF) ». La route (`GET /appels/:id/avis`) est posée
 * par un autre lot en parallèle : un 404 se lit comme « pas encore
 * disponible », pas comme une panne — le bouton reste affiché, désactivé
 * après l'essai, plutôt que de disparaître et laisser croire à une erreur.
 */
const NoticeButton: React.FC<{ call: CoOwnerChargeCall }> = ({ call }) => {
  const [state, setState] = useState<'idle' | 'loading' | 'unavailable'>('idle');

  if (state === 'unavailable') {
    return <span style={{ color: 'var(--text-secondary)' }}>{t('Avis indisponible')}</span>;
  }

  const download = async () => {
    setState('loading');
    try {
      const { blob, filename } = await downloadCoOwnerChargeCallNotice(
        call.id,
        t("Avis d'appel {{period}}.pdf", { period: formatChargePeriod(call) })
      );
      saveBlob(blob, filename);
      setState('idle');
    } catch (error) {
      if (isNotFound(error)) {
        setState('unavailable');
        return;
      }
      setState('idle');
      feedback.error(await describeDownloadError(error));
    }
  };

  return (
    <Button icon={<FileTextOutlined />} loading={state === 'loading'} onClick={() => void download()}>
      {t("Avis d'appel (PDF)")}
    </Button>
  );
};

/**
 * Vrai si l'appel peut être réglé en ligne depuis sa ligne : payable, sans paiement déjà engagé
 * ni paiement mobile money déclaré en attente. Le serveur reste juge (`onlinePayable`, reste dû recalculé).
 */
export function isCallPayableOnline(call: CoOwnerChargeCall): boolean {
  if (call.pendingDeclaration) return false;
  return call.onlinePayable && call.onlineCheckout === 'NONE' && Boolean(call.lot);
}

/** Période, lot et échéance tiennent sur une seule ligne : la table défile plutôt que de couper « novembre 2026 » ou « A-109 ». */
const NO_WRAP: React.CSSProperties = { whiteSpace: 'nowrap' };

/** Vrai si l'appel peut être déclaré payé par mobile money depuis sa ligne : reste dû, lot connu, rien d'engagé. */
export function isCallDeclarable(call: CoOwnerChargeCall): boolean {
  if (call.pendingDeclaration || call.outstanding <= 0 || !call.lot) return false;
  return call.onlineCheckout === undefined || call.onlineCheckout === 'NONE';
}

/** Mention d'un paiement déjà engagé sur l'appel (colonne « Statut »), avec la reprise si le compte en a le code. */
const OnlineCheckoutTag: React.FC<{ call: CoOwnerChargeCall; onResume?: (call: CoOwnerChargeCall) => void }> = ({
  call,
  onResume
}) => {
  if (call.onlineCheckout === 'IN_PROGRESS') {
    return (
      <>
        <Tag color="processing">{t('Paiement en cours')}</Tag>
        {onResume && call.onlineCheckoutCode ? (
          <Button size="small" type="link" onClick={() => onResume(call)}>
            {t('Reprendre le paiement')}
          </Button>
        ) : null}
      </>
    );
  }
  if (call.onlineCheckout === 'REVIEW') return <Tag color="warning">{t('Paiement en vérification')}</Tag>;
  return null;
};

/** Paiement mobile money déclaré, en attente de validation par l'agence (spec 047). */
const PendingDeclarationTag: React.FC<{ call: CoOwnerChargeCall }> = ({ call }) =>
  call.pendingDeclaration ? <Tag color="warning">{t('Paiement déclaré, en vérification')}</Tag> : null;

/**
 * Appels de charges d'un copropriétaire, partagé par « Mes appels de
 * charges » et par le détail d'un lot. Sans `onPayOne` ni `onDeclareOne`, lecture
 * seule ; avec, chaque appel porte « Payer en ligne » et/ou « J'ai payé par mobile money ».
 */
export const ChargeCallsTable: React.FC<{
  calls: CoOwnerChargeCall[];
  showLot?: boolean;
  /** Reprend le paiement en cours d'un appel (page du fournisseur) ; absent = pas de bouton. */
  onResume?: (call: CoOwnerChargeCall) => void;
  /** Règle un seul appel en ligne (bouton de la ligne) ; absent = pas de bouton. */
  onPayOne?: (call: CoOwnerChargeCall) => void;
  /** Déclare un paiement mobile money pour cet appel (bouton de la ligne) ; absent = pas de bouton. */
  onDeclareOne?: (call: CoOwnerChargeCall) => void;
  /** Filtre supplémentaire du bouton de déclaration (copropriété ouverte, lot connu) ; absent = tous les appels déclarables. */
  canDeclare?: (call: CoOwnerChargeCall) => boolean;
  /** Appel dont le paiement s'initie : son bouton tourne et les autres sont désactivés. */
  payingCallId?: string | null;
}> = ({ calls, showLot = true, onResume, onPayOne, onDeclareOne, canDeclare, payingCallId = null }) => {
  /** Bouton « Payer en ligne » d'une ligne : seulement sur un appel payable, sans paiement déjà engagé. */
  const payButton = (call: CoOwnerChargeCall) => {
    if (!onPayOne || !isCallPayableOnline(call)) return null;
    return (
      <Button
        type="primary"
        size="small"
        icon={<CreditCardOutlined aria-hidden />}
        loading={payingCallId === call.id}
        disabled={payingCallId !== null && payingCallId !== call.id}
        onClick={() => onPayOne(call)}
        aria-label={t('Payer en ligne : {{period}}', { period: formatChargePeriod(call) })}
      >
        {t('Payer en ligne')}
      </Button>
    );
  };

  /** Bouton « J'ai payé par mobile money » d'une ligne : ouvre la déclaration préremplie sur cet appel. */
  const declareButton = (call: CoOwnerChargeCall) => {
    if (!onDeclareOne || !isCallDeclarable(call) || (canDeclare && !canDeclare(call))) return null;
    return (
      <Button
        size="small"
        icon={<MobileOutlined aria-hidden />}
        onClick={() => onDeclareOne(call)}
        aria-label={t("J'ai payé par mobile money : {{period}}", { period: formatChargePeriod(call) })}
      >
        {t("J'ai payé par mobile money")}
      </Button>
    );
  };

  /** Boutons de paiement de la ligne, l'un sous l'autre ; rien si aucun ne s'applique. */
  const payActions = (call: CoOwnerChargeCall) => {
    const online = payButton(call);
    const declared = declareButton(call);
    if (!online && !declared) return null;
    return (
      <Space direction="vertical" size={4} style={{ alignItems: 'stretch' }}>
        {online}
        {declared}
      </Space>
    );
  };

  const columns: ColumnsType<CoOwnerChargeCall> = [
    {
      title: t('Période'),
      dataIndex: 'period',
      key: 'period',
      onCell: () => ({ style: NO_WRAP }),
      render: (_: unknown, call: CoOwnerChargeCall) => formatChargePeriod(call)
    },
    ...(showLot
      ? [
          {
            title: t('Lot'),
            key: 'lot',
            onCell: () => ({ style: NO_WRAP }),
            render: (_: unknown, call: CoOwnerChargeCall) => call.lot?.lotNumber ?? '—'
          }
        ]
      : []),
    {
      title: t('Échéance'),
      key: 'dueDate',
      onCell: () => ({ style: NO_WRAP }),
      render: (_, call) => dayjs(call.dueDate).format('DD/MM/YYYY')
    },
    {
      title: t('Montant'),
      key: 'amount',
      align: 'end',
      exportValue: call => Number(call.amount),
      render: (_, call) => <MoneyValue value={call.amount} />
    },
    {
      title: t('Payé'),
      key: 'paid',
      align: 'end',
      exportValue: call => Number(call.paid),
      render: (_, call) => <MoneyValue value={call.paid} />
    },
    {
      title: t('Reste à payer'),
      key: 'outstanding',
      align: 'end',
      exportValue: call => Number(call.outstanding),
      render: (_, call) => (
        <strong>
          <MoneyValue value={call.outstanding} />
        </strong>
      )
    },
    {
      title: t('Statut'),
      key: 'status',
      width: 220,
      render: (_, call) => (
        <Space wrap size={[4, 4]}>
          <ChargeCallStatusTag status={call.status} />
          <OnlineCheckoutTag call={call} onResume={onResume} />
          <PendingDeclarationTag call={call} />
        </Space>
      )
    },
    ...(onPayOne || onDeclareOne
      ? [
          {
            title: t('Paiement'),
            key: 'payActions',
            align: 'end' as const,
            exportable: false,
            render: (_: unknown, call: CoOwnerChargeCall) => payActions(call)
          }
        ]
      : []),
    // Bouton de téléchargement de l'avis : rien à exporter.
    {
      title: t('Avis'),
      key: 'notice',
      align: 'end',
      exportable: false,
      render: (_, call) => <NoticeButton call={call} />
    }
  ];

  return (
    <DataView<CoOwnerChargeCall>
      paginated={false}
      items={calls}
      total={calls.length}
      page={1}
      pageSize={calls.length || 20}
      onPageChange={() => {}}
      rowKey={call => call.id}
      aria-label={t('Appels de charges')}
      export={{ filename: t('Appels de charges') }}
      emptyDescription={t("Aucun appel de charges n'a été émis pour vos lots.")}
      columns={columns}
      scrollX={1300}
      renderCard={call => (
        <DataCard
          title={formatChargePeriod(call)}
          subtitle={[
            call.lot ? t('Lot {{lotNumber}}', { lotNumber: call.lot.lotNumber }) : null,
            t('échéance le {{date}}', { date: dayjs(call.dueDate).format('DD/MM/YYYY') })
          ]
            .filter(Boolean)
            .join(' · ')}
          status={
            <>
              <ChargeCallStatusTag status={call.status} />
              <OnlineCheckoutTag call={call} onResume={onResume} />
              <PendingDeclarationTag call={call} />
            </>
          }
          highlight={<MoneyValue value={call.outstanding} />}
          fields={[
            { label: t('Montant'), value: <MoneyValue value={call.amount} /> },
            { label: t('Payé'), value: <MoneyValue value={call.paid} /> },
            ...(payActions(call) ? [{ label: t('Paiement'), value: payActions(call) }] : []),
            { label: t('Avis'), value: <NoticeButton call={call} /> }
          ]}
        />
      )}
    />
  );
};
