import { invalidateAfterDeclaration } from './invalidate';
import React, { useState } from 'react';
import { Button, Space } from 'antd';
import { MobileOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBreakpoint } from '../../../hooks/useBreakpoint';
import { t } from '../../../i18n/t';
import { listMyLots, type CoOwnerChargeCall, type CoOwnerDeclaration } from '../../../services/coowner-portal-service';
import { DeclarationForm } from './DeclarationForm';
import { ReceivingNumbersCard } from './ReceivingNumbersCard';
import type { DeclaredAvailabilityEntry } from './useDeclaredAvailabilities';

/**
 * Parcours « J'ai payé par mobile money » (spec 047, étapes 1 et 5) sur la
 * page « Mes appels de charges » : numéros de réception de chaque copropriété
 * ouverte et bouton qui ouvre le formulaire de déclaration.
 */

const PAYER_PHONE_KEY = 'coowner-portal:payer-phone';

function readPayerPhone(): string | undefined {
  try {
    return window.localStorage.getItem(PAYER_PHONE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

function writePayerPhone(phone: string | undefined): void {
  if (!phone) return;
  try {
    window.localStorage.setItem(PAYER_PHONE_KEY, phone);
  } catch {
    // Stockage indisponible : le numéro sera simplement ressaisi.
  }
}

export interface DeclaredPaymentSectionProps {
  calls: CoOwnerChargeCall[];
  entries: DeclaredAvailabilityEntry[];
}

export function DeclaredPaymentSection({ calls, entries }: DeclaredPaymentSectionProps): React.ReactElement | null {
  const queryClient = useQueryClient();
  const { isMobile } = useBreakpoint();
  const [openSyndicateId, setOpenSyndicateId] = useState<string | null>(null);
  const [payerPhone, setPayerPhone] = useState<string | undefined>(() => readPayerPhone());

  const lotsQuery = useQuery({
    queryKey: ['coowner-portal', 'lots'],
    staleTime: 30_000,
    queryFn: () => listMyLots(),
    enabled: entries.length > 0,
    retry: false
  });

  if (entries.length === 0) return null;

  const handleSubmitted = (declaration: CoOwnerDeclaration) => {
    writePayerPhone(declaration.payerPhone);
    if (declaration.payerPhone) setPayerPhone(declaration.payerPhone);
    setOpenSyndicateId(null);
    invalidateAfterDeclaration(queryClient);
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {entries.map(({ syndicate, availability }) => {
        const lots = (lotsQuery.data ?? []).filter(lot => lot.syndicate?.id === syndicate.id);
        const canDeclare = lots.length > 0;
        return (
          <ReceivingNumbersCard
            key={syndicate.id}
            numbers={availability.receivingNumbers}
            payerInstructions={availability.payerInstructions}
            syndicateName={entries.length > 1 ? syndicate.name : undefined}
            extra={
              canDeclare ? (
                <>
                  <Button
                    type="primary"
                    icon={<MobileOutlined aria-hidden />}
                    block={isMobile}
                    style={{ minHeight: 40 }}
                    onClick={() => setOpenSyndicateId(syndicate.id)}
                  >
                    {t("J'ai payé par mobile money")}
                  </Button>
                  {openSyndicateId === syndicate.id ? (
                    <DeclarationForm
                      open
                      onClose={() => setOpenSyndicateId(null)}
                      onSubmitted={handleSubmitted}
                      syndicate={syndicate}
                      availability={availability}
                      lots={lots.map(lot => ({ id: lot.id, lotNumber: lot.lotNumber }))}
                      calls={calls}
                      defaultPayerPhone={payerPhone}
                    />
                  ) : null}
                </>
              ) : null
            }
          />
        );
      })}
    </Space>
  );
}

export default DeclaredPaymentSection;
