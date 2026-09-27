import React, { useState } from 'react';
import { Button } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DataCard, DataView, MoneyValue } from '../../components/primitives';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import { downloadCoOwnerChargeCallNotice, type CoOwnerChargeCall } from '../../services/coowner-portal-service';
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
        t("Avis d'appel {{period}}.pdf", { period: call.period })
      );
      saveBlob(blob, filename);
      setState('idle');
    } catch (error) {
      if (isNotFound(error)) {
        setState('unavailable');
        return;
      }
      setState('idle');
      feedback.error(t('Téléchargement impossible.'));
    }
  };

  return (
    <Button icon={<FileTextOutlined />} loading={state === 'loading'} onClick={() => void download()}>
      {t("Avis d'appel (PDF)")}
    </Button>
  );
};

/**
 * Appels de charges d'un copropriétaire, partagé par « Mes appels de
 * charges » et par le détail d'un lot. Lecture seule : aucun bouton de
 * paiement (le paiement en ligne des charges de copropriété n'existe pas).
 */
export const ChargeCallsTable: React.FC<{ calls: CoOwnerChargeCall[]; showLot?: boolean }> = ({
  calls,
  showLot = true
}) => {
  const columns: ColumnsType<CoOwnerChargeCall> = [
    { title: t('Période'), dataIndex: 'period', key: 'period' },
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
    { title: t('Montant'), key: 'amount', align: 'end', render: (_, call) => <MoneyValue value={call.amount} /> },
    { title: t('Payé'), key: 'paid', align: 'end', render: (_, call) => <MoneyValue value={call.paid} /> },
    {
      title: t('Reste à payer'),
      key: 'outstanding',
      align: 'end',
      render: (_, call) => (
        <strong>
          <MoneyValue value={call.outstanding} />
        </strong>
      )
    },
    { title: t('Statut'), key: 'status', render: (_, call) => <ChargeCallStatusTag status={call.status} /> },
    { title: t('Avis'), key: 'notice', align: 'end', render: (_, call) => <NoticeButton call={call} /> }
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
      emptyDescription={t("Aucun appel de charges n'a été émis pour vos lots.")}
      columns={columns}
      renderCard={call => (
        <DataCard
          title={call.period}
          subtitle={[
            call.lot ? t('Lot {{lotNumber}}', { lotNumber: call.lot.lotNumber }) : null,
            t('échéance le {{date}}', { date: dayjs(call.dueDate).format('DD/MM/YYYY') })
          ]
            .filter(Boolean)
            .join(' · ')}
          status={<ChargeCallStatusTag status={call.status} />}
          highlight={<MoneyValue value={call.outstanding} />}
          fields={[
            { label: t('Montant'), value: <MoneyValue value={call.amount} /> },
            { label: t('Payé'), value: <MoneyValue value={call.paid} /> },
            { label: t('Avis'), value: <NoticeButton call={call} /> }
          ]}
        />
      )}
    />
  );
};
