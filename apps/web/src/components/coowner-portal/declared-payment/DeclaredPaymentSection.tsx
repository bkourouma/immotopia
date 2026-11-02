import { invalidateAfterDeclaration } from './invalidate';
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listMyLots, type CoOwnerChargeCall, type CoOwnerDeclaration } from '../../../services/coowner-portal-service';
import { DeclarationForm } from './DeclarationForm';
import type { DeclaredAvailabilityEntry } from './useDeclaredAvailabilities';

/**
 * Parcours « J'ai payé par mobile money » (spec 047) sur la page « Mes appels de
 * charges » : le bouton de chaque ligne ouvre ici le formulaire de déclaration
 * prérempli sur l'appel (les numéros de réception s'y choisissent).
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
  /** Appel dont le bouton de ligne « J'ai payé par mobile money » a été cliqué : ouvre le formulaire prérempli. */
  callToDeclare: CoOwnerChargeCall | null;
  onCallDeclarationClose: () => void;
}

export function DeclaredPaymentSection({
  calls,
  entries,
  callToDeclare,
  onCallDeclarationClose
}: DeclaredPaymentSectionProps): React.ReactElement | null {
  const queryClient = useQueryClient();
  const [payerPhone, setPayerPhone] = useState<string | undefined>(() => readPayerPhone());

  const lotsQuery = useQuery({
    queryKey: ['coowner-portal', 'lots'],
    staleTime: 30_000,
    queryFn: () => listMyLots(),
    enabled: entries.length > 0,
    retry: false
  });

  const entry = callToDeclare ? entries.find(candidate => candidate.syndicate.id === callToDeclare.syndicateId) : null;
  if (!callToDeclare || !entry) return null;

  const handleSubmitted = (declaration: CoOwnerDeclaration) => {
    writePayerPhone(declaration.payerPhone);
    if (declaration.payerPhone) setPayerPhone(declaration.payerPhone);
    onCallDeclarationClose();
    invalidateAfterDeclaration(queryClient);
  };

  return (
    <DeclarationForm
      open
      onClose={onCallDeclarationClose}
      onSubmitted={handleSubmitted}
      syndicate={entry.syndicate}
      availability={entry.availability}
      lots={(lotsQuery.data ?? [])
        .filter(lot => lot.syndicate?.id === entry.syndicate.id)
        .map(lot => ({ id: lot.id, lotNumber: lot.lotNumber }))}
      calls={calls}
      defaultPayerPhone={payerPhone}
      initialCall={callToDeclare}
    />
  );
}

export default DeclaredPaymentSection;
