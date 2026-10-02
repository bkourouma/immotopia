import React from 'react';
import { Steps } from 'antd';
import type { InsuranceClaimStatus } from '../../types/insurance-types';
import { CLAIM_FLOW, claimStatusLabel } from './insurance-labels';

interface Props {
  status: InsuranceClaimStatus | string;
  /** Date du rejet (DTO) : distingue un sinistre rejeté puis clos d'un sinistre indemnisé puis clos. */
  rejectedAt?: string | null;
  size?: 'default' | 'small';
}

type StepStatus = 'finish' | 'process' | 'error' | 'wait';

/**
 * Frise des statuts d'un sinistre. Parcours nominal : Déclaré, Assureur
 * prévenu, Expertise, Indemnisé, Clos. Un sinistre rejeté remplace l'étape
 * « Indemnisé » par « Rejeté » (en erreur), y compris une fois clos : un
 * rejet clos ne s'affiche jamais comme une indemnisation terminée.
 */
export const ClaimStatusTimeline: React.FC<Props> = ({ status, rejectedAt, size = 'small' }) => {
  const closed = status === 'CLOSED';
  const rejected = status === 'REJECTED' || (closed && Boolean(rejectedAt));
  const flow: string[] = CLAIM_FLOW.map(step => (rejected && step === 'SETTLED' ? 'REJECTED' : step));
  const current = closed ? flow.length - 1 : Math.max(0, flow.indexOf(status));

  const stepStatus = (step: string, index: number): StepStatus => {
    if (step === 'REJECTED') return 'error';
    if (closed || index < current) return 'finish';
    if (index > current) return 'wait';
    return step === 'SETTLED' ? 'finish' : 'process';
  };

  const items = flow.map((step, index) => ({
    key: step,
    title: claimStatusLabel(step),
    status: stepStatus(step, index)
  }));

  return <Steps size={size} current={current} items={items} responsive data-testid="claim-timeline" />;
};

export default ClaimStatusTimeline;
