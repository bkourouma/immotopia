import React, { useState } from 'react';
import { Alert, App, Button, Card, Empty, Pagination, Select, Skeleton, Space, Tag, Typography } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ConfirmAction } from '../../primitives/ConfirmAction';
import { PhoneNumber } from '../../primitives';

import { formatMontantLocatif } from '../../../lib/rental-labels';
import { t } from '../../../i18n/t';
import { cancelMyDeclaration, listMyDeclarations } from '../../../services/tenant-portal-declared-payment-service';
import type { RentalDeclarationStatus, TenantPortalDeclarationDto } from '../../../types/rental-declared-payment';
import { invalidateAfterDeclaration, MY_DECLARATIONS_KEY } from './invalidate';
import {
  declarationStatusColor,
  declarationStatusLabel,
  formatPhoneForDisplay,
  operatorLabel,
  parseDeclarationApiError,
  paymentMethodLabel,
  rejectReasonLabel
} from './labels';

const { Text } = Typography;

/**
 * « Mes déclarations » du portail locataire (spec 049) : chaque paiement mobile
 * money déclaré, son statut et, tant qu'il est en attente de validation,
 * l'annulation. Les notes de l'agence sont du texte brut (`pre-wrap`), jamais
 * du HTML. Rendu en cartes empilées (lisible à 375 px).
 */

export interface MyDeclarationsListProps {
  /** Appelé après une annulation, pour que la page recharge ses listes. */
  onChanged?: () => void;
}

const PAGE_SIZE = 10;
const NOTE_STYLE: React.CSSProperties = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };
const TOUCH_TARGET = 40;

type StatusFilter = RentalDeclarationStatus | 'ALL';

function statusOptions(): Array<{ value: StatusFilter; label: string }> {
  return [
    { value: 'ALL', label: t('Toutes') },
    { value: 'PENDING', label: t('En attente de validation') },
    { value: 'APPROVED', label: t('Validées') },
    { value: 'REJECTED', label: t('Rejetées') },
    { value: 'CANCELED', label: t('Annulées') }
  ];
}

function DeclarationCard({
  declaration,
  onCancel
}: {
  declaration: TenantPortalDeclarationDto;
  onCancel: (declaration: TenantPortalDeclarationDto) => Promise<void>;
}): React.ReactElement {
  const { status, rejectReason, reviewNote, installment, receivingNumber } = declaration;
  const retained = declaration.acceptedAmount;
  const corrected = status === 'APPROVED' && retained !== null && retained !== declaration.amount;

  return (
    <Card size="small" data-testid="my-declaration">
      <Space orientation="vertical" size={4} style={{ width: '100%' }}>
        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
          <Text strong>{formatMontantLocatif(declaration.amount)}</Text>
          <Tag color={declarationStatusColor(status)} style={{ marginInlineEnd: 0 }}>
            {declarationStatusLabel(status)}
          </Tag>
        </Space>
        <Text type="secondary">
          {t('Payé le {{date}}', { date: dayjs(declaration.paidAt).format('DD/MM/YYYY HH:mm') })}
        </Text>
        <Text>
          {t('Référence :')} {declaration.reference ?? '—'}
        </Text>
        {declaration.paymentMethod && declaration.paymentMethod !== 'MOBILE_MONEY' ? (
          <Text>
            {t('Mode de paiement :')} {paymentMethodLabel(declaration.paymentMethod)}
          </Text>
        ) : null}
        {receivingNumber ? (
          <Text>
            {operatorLabel(receivingNumber.operator)} →{' '}
            <PhoneNumber value={formatPhoneForDisplay(receivingNumber.phone)} />
          </Text>
        ) : null}
        {installment ? (
          <Text type="secondary">
            {t('Échéance {{period}}', {
              period: `${String(installment.periodMonth).padStart(2, '0')}/${installment.periodYear}`
            })}
          </Text>
        ) : null}

        {status === 'PENDING' ? (
          <Text type="secondary">
            {t('Vérification en cours par votre agence. Votre solde ne change pas avant la validation.')}
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
        {corrected ? (
          <Text>
            {t('Montant retenu :')} {formatMontantLocatif(retained as number)}
          </Text>
        ) : null}
        {status === 'APPROVED' && reviewNote ? (
          <Text style={NOTE_STYLE}>
            {t("Note de l'agence :")} {reviewNote}
          </Text>
        ) : null}

        {declaration.canCancel ? (
          <ConfirmAction
            title={t('Annuler cette déclaration de {{amount}} ?', { amount: formatMontantLocatif(declaration.amount) })}
            okText={t('Annuler la déclaration')}
            cancelText={t('Garder')}
            danger
            onConfirm={() => onCancel(declaration)}
          >
            <Button danger style={{ minHeight: TOUCH_TARGET }}>
              {t('Annuler la déclaration')}
            </Button>
          </ConfirmAction>
        ) : null}
      </Space>
    </Card>
  );
}

export function MyDeclarationsList({ onChanged }: MyDeclarationsListProps): React.ReactElement {
  const queryClient = useQueryClient();
  const { message: messageApi } = App.useApp();
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: [...MY_DECLARATIONS_KEY, status, page],
    queryFn: () => listMyDeclarations({ status, page, pageSize: PAGE_SIZE }),
    retry: false
  });

  const handleCancel = async (declaration: TenantPortalDeclarationDto): Promise<void> => {
    try {
      await cancelMyDeclaration(declaration.id);
      messageApi.success(t('Déclaration annulée.'));
    } catch (error) {
      const { message } = parseDeclarationApiError(error, t("Impossible d'annuler la déclaration."));
      messageApi.error(message);
    } finally {
      invalidateAfterDeclaration(queryClient);
      onChanged?.();
    }
  };

  const items = query.data?.items ?? [];

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Select
        value={status}
        onChange={value => {
          setStatus(value);
          setPage(1);
        }}
        options={statusOptions()}
        aria-label={t('Filtrer par statut')}
        style={{ width: '100%', maxWidth: 320, minHeight: TOUCH_TARGET }}
      />

      {query.isPending ? (
        <Skeleton active paragraph={{ rows: 4 }} aria-label={t('Chargement de vos déclarations')} />
      ) : query.isError ? (
        <Alert
          type="error"
          showIcon
          message={t('Impossible de charger vos déclarations.')}
          action={
            <Button size="small" onClick={() => void query.refetch()}>
              {t('Réessayer')}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <Empty description={t('Aucune déclaration de paiement pour le moment.')} />
      ) : (
        <Space orientation="vertical" size="small" style={{ width: '100%' }}>
          {items.map(declaration => (
            <DeclarationCard key={declaration.id} declaration={declaration} onCancel={handleCancel} />
          ))}
          {(query.data?.total ?? 0) > PAGE_SIZE ? (
            <Pagination
              current={page}
              pageSize={PAGE_SIZE}
              total={query.data?.total ?? 0}
              showSizeChanger={false}
              onChange={setPage}
              align="center"
            />
          ) : null}
        </Space>
      )}
    </Space>
  );
}

export default MyDeclarationsList;
