import React, { useState } from 'react';
import { Button, Checkbox, Space, Tag } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DataCard, DataView, MoneyValue } from '../../components/primitives';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import {
  MAX_CHARGE_CALLS_PER_PAYMENT,
  downloadCoOwnerChargeCallNotice,
  type CoOwnerChargeCall
} from '../../services/coowner-portal-service';
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
 * Sélection des appels à régler en ligne (spec 042). Un paiement couvre les
 * appels d'un seul lot : dès qu'un appel est coché, ceux des autres lots sont
 * grisés. Le serveur reste juge (`onlinePayable`, reste dû recalculé).
 */
export interface ChargeCallSelection {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

/** Vrai si l'appel peut être coché, compte tenu de la sélection courante. */
export function isCallSelectable(call: CoOwnerChargeCall, selected: CoOwnerChargeCall[]): boolean {
  if (call.pendingDeclaration) return false;
  if (!call.onlinePayable || call.onlineCheckout !== 'NONE' || !call.lot) return false;
  if (selected.some(other => other.id === call.id)) return true;
  if (selected.length >= MAX_CHARGE_CALLS_PER_PAYMENT) return false;
  return selected.length === 0 || selected[0].lot?.id === call.lot.id;
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
 * charges » et par le détail d'un lot. Sans `selection`, lecture seule ; avec,
 * une case à cocher apparaît sur les appels payables en ligne.
 */
export const ChargeCallsTable: React.FC<{
  calls: CoOwnerChargeCall[];
  showLot?: boolean;
  selection?: ChargeCallSelection;
  /** Reprend le paiement en cours d'un appel (page du fournisseur) ; absent = pas de bouton. */
  onResume?: (call: CoOwnerChargeCall) => void;
}> = ({ calls, showLot = true, selection, onResume }) => {
  const selectedCalls = selection ? calls.filter(call => selection.selectedIds.includes(call.id)) : [];
  const showSelection = Boolean(selection) && calls.some(call => call.onlinePayable || call.pendingDeclaration);

  const toggle = (call: CoOwnerChargeCall, checked: boolean) => {
    if (!selection) return;
    selection.onChange(
      checked ? [...selection.selectedIds, call.id] : selection.selectedIds.filter(id => id !== call.id)
    );
  };

  const selectBox = (call: CoOwnerChargeCall) => {
    if (call.pendingDeclaration) {
      const reason = t('Paiement déclaré, en vérification : paiement en ligne indisponible sur cet appel');
      return <Checkbox checked={false} disabled title={reason} aria-label={reason} />;
    }
    if (!call.onlinePayable) return null;
    return (
      <Checkbox
        checked={selectedCalls.some(other => other.id === call.id)}
        disabled={!isCallSelectable(call, selectedCalls)}
        onChange={event => toggle(call, event.target.checked)}
        aria-label={t("Sélectionner l'appel {{period}}", { period: formatChargePeriod(call) })}
      />
    );
  };

  const columns: ColumnsType<CoOwnerChargeCall> = [
    ...(showSelection
      ? [
          {
            title: t('Payer'),
            key: 'select',
            width: 64,
            render: (_: unknown, call: CoOwnerChargeCall) => selectBox(call)
          }
        ]
      : []),
    {
      title: t('Période'),
      dataIndex: 'period',
      key: 'period',
      render: (_: unknown, call: CoOwnerChargeCall) => formatChargePeriod(call)
    },
    ...(showLot
      ? [
          {
            title: t('Lot'),
            key: 'lot',
            render: (_: unknown, call: CoOwnerChargeCall) =>
              call.lot ? `${call.lot.lotNumber}${call.syndicate ? ` · ${call.syndicate}` : ''}` : '—'
          }
        ]
      : []),
    { title: t('Échéance'), key: 'dueDate', render: (_, call) => dayjs(call.dueDate).format('DD/MM/YYYY') },
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
      scrollX={1100}
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
            ...(showSelection && (call.onlinePayable || call.pendingDeclaration)
              ? [{ label: t('Payer'), value: selectBox(call) }]
              : []),
            { label: t('Avis'), value: <NoticeButton call={call} /> }
          ]}
        />
      )}
    />
  );
};
