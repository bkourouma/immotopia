import { invalidateAfterDeclaration } from './invalidate';
import React from 'react';
import { Button, Space, Tag, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DataCard, DataView, MoneyValue, PhoneNumber } from '../../primitives';
import { ConfirmAction } from '../../primitives/ConfirmAction';
import { feedback } from '../../../lib/feedback';
import { t } from '../../../i18n/t';
import { cancelDeclaration, type CoOwnerDeclaration } from '../../../services/coowner-portal-service';
import {
  declarationStatusColor,
  declarationStatusLabel,
  formatPhoneForDisplay,
  operatorLabel,
  parseDeclarationApiError,
  rejectReasonLabel
} from './labels';

const { Text } = Typography;

/**
 * « Mes déclarations » (spec 047, P2 étape 6) : chaque paiement mobile money
 * déclaré, son statut et, tant qu'il est en vérification, l'annulation. Les
 * notes du syndic sont du texte brut (`pre-wrap`), jamais du HTML.
 */

export interface DeclarationsListProps {
  items: CoOwnerDeclaration[];
  onChanged?: () => void;
}

const NOTE_STYLE: React.CSSProperties = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };

function lotsLabel(declaration: CoOwnerDeclaration): string {
  return declaration.lines.map(line => t('Lot {{lotNumber}}', { lotNumber: line.lot.lotNumber })).join(', ');
}

function receivingLabel(declaration: CoOwnerDeclaration): React.ReactNode {
  const { operator, phoneNumber } = declaration.receivingNumber;
  return (
    <>
      {operatorLabel(operator)} <PhoneNumber value={formatPhoneForDisplay(phoneNumber)} />
    </>
  );
}

function hasCorrectedAmount(declaration: CoOwnerDeclaration): boolean {
  return declaration.acceptedAmount !== null && declaration.acceptedAmount !== declaration.amount;
}

function AmountCell({ declaration }: { declaration: CoOwnerDeclaration }) {
  return (
    <Space orientation="vertical" size={0}>
      <MoneyValue value={declaration.amount} />
      {hasCorrectedAmount(declaration) ? (
        <Text type="secondary">
          {t('Montant retenu :')} <MoneyValue value={declaration.acceptedAmount} />
        </Text>
      ) : null}
    </Space>
  );
}

function StatusCell({ declaration, onChanged }: { declaration: CoOwnerDeclaration; onChanged?: () => void }) {
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = React.useState(false);
  const inFlight = React.useRef(false);

  const cancel = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setCancelling(true);
    try {
      await cancelDeclaration(declaration.id);
      feedback.success(t('Déclaration annulée.'));
    } catch (error) {
      feedback.error(parseDeclarationApiError(error, t("L'annulation n'a pas abouti.")).message);
    } finally {
      inFlight.current = false;
      setCancelling(false);
      // Succès ou 409 DECLARATION_NOT_PENDING : la liste doit se rafraîchir dans tous les cas.
      invalidateAfterDeclaration(queryClient);
      onChanged?.();
    }
  };

  const { status, reviewNote, rejectReason, documents } = declaration;
  return (
    <Space orientation="vertical" size={4} style={{ maxWidth: '100%' }}>
      <Tag color={declarationStatusColor(status)} style={{ marginInlineEnd: 0 }}>
        {declarationStatusLabel(status)}
      </Tag>
      {status === 'PENDING' ? (
        <Text type="secondary">
          {t('Vérification en cours par le syndic. Le reste dû de vos appels ne change pas avant validation.')}
        </Text>
      ) : null}
      {status === 'REJECTED' ? (
        <>
          {rejectReason ? (
            <Text>
              {t('Motif :')} {rejectReasonLabel(rejectReason)}
            </Text>
          ) : null}
          {reviewNote ? <Text style={NOTE_STYLE}>{reviewNote}</Text> : null}
        </>
      ) : null}
      {status === 'APPROVED' && reviewNote ? (
        <Text style={NOTE_STYLE}>
          {t('Note du syndic :')} {reviewNote}
        </Text>
      ) : null}
      {status === 'APPROVED' && documents.length > 0 ? (
        <>
          <Text>
            {documents
              .map(doc =>
                doc.kind === 'QUITTANCE'
                  ? t('Quittance {{number}}', { number: doc.number })
                  : t('Reçu {{number}}', { number: doc.number })
              )
              .join(', ')}
          </Text>
          <Text type="secondary">{t('Retrouvez-les dans « Mes quittances ».')}</Text>
        </>
      ) : null}
      {status === 'PENDING' && declaration.canCancel ? (
        <ConfirmAction
          title={t('Annuler cette déclaration ?')}
          okText={t("Oui, l'annuler")}
          cancelText={t('Non')}
          danger
          onConfirm={cancel}
        >
          <Button size="small" danger loading={cancelling} disabled={cancelling}>
            {t('Annuler la déclaration')}
          </Button>
        </ConfirmAction>
      ) : null}
    </Space>
  );
}

export function DeclarationsList({ items, onChanged }: DeclarationsListProps) {
  const columns: ColumnsType<CoOwnerDeclaration> = [
    {
      title: t('Date du paiement'),
      key: 'paidAt',
      render: (_, row) => dayjs(row.paidAt).format('DD/MM/YYYY HH:mm')
    },
    { title: t('Lot(s)'), key: 'lots', render: (_, row) => lotsLabel(row) },
    { title: t('Copropriété'), key: 'syndicate', render: (_, row) => row.syndicate.name },
    { title: t('Numéro de réception'), key: 'receiving', render: (_, row) => receivingLabel(row) },
    { title: t('Référence'), key: 'reference', render: (_, row) => row.transactionReference },
    {
      title: t('Montant déclaré'),
      key: 'amount',
      align: 'end',
      exportValue: row => Number(row.amount),
      render: (_, row) => <AmountCell declaration={row} />
    },
    {
      title: t('Statut'),
      key: 'status',
      exportable: false,
      render: (_, row) => <StatusCell declaration={row} onChanged={onChanged} />
    }
  ];

  return (
    <DataView<CoOwnerDeclaration>
      paginated={false}
      items={items}
      total={items.length}
      page={1}
      pageSize={items.length || 20}
      onPageChange={() => {}}
      rowKey={row => row.id}
      aria-label={t('Mes déclarations')}
      emptyDescription={t("Vous n'avez fait aucune déclaration de paiement.")}
      columns={columns}
      renderCard={row => (
        <DataCard
          title={dayjs(row.paidAt).format('DD/MM/YYYY HH:mm')}
          subtitle={[lotsLabel(row), row.syndicate.name].join(' · ')}
          highlight={<AmountCell declaration={row} />}
          fields={[
            { label: t('Numéro de réception'), value: receivingLabel(row) },
            { label: t('Référence'), value: row.transactionReference },
            { label: t('Statut'), value: <StatusCell declaration={row} onChanged={onChanged} /> }
          ]}
        />
      )}
    />
  );
}

export default DeclarationsList;
