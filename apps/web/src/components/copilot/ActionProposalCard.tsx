import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Descriptions, Space } from 'antd';
import { t } from '../../i18n/t';
import type { ActionExecutedPayload, ActionProposal, CopilotProposalState } from '../../types/copilot';
import { DocumentDownloadCard } from './DocumentDownloadCard';

export interface ActionProposalCardProps {
  proposal: ActionProposal;
  state: CopilotProposalState;
  result?: ActionExecutedPayload;
  error?: { code: string; message: string };
  tenantId: string;
  onConfirm(proposalId: string): void;
  onCancel(proposalId: string): void;
  /** « Modifier » : par défaut, annule la proposition pour laisser reformuler. */
  onEdit?(proposalId: string): void;
}

const DOCUMENT_LABEL: Record<ActionProposal['documentType'], string> = {
  RENT_RECEIPT: 'Quittance de loyer',
  RENT_STATEMENT: 'Relevé de compte'
};

function useExpired(expiresAt: string): boolean {
  const target = Date.parse(expiresAt);
  const [expired, setExpired] = useState(() => Number.isFinite(target) && Date.now() >= target);
  useEffect(() => {
    if (!Number.isFinite(target)) return undefined;
    const remaining = target - Date.now();
    if (remaining <= 0) {
      setExpired(true);
      return undefined;
    }
    // setTimeout plafonné : au-delà de 2^31 ms il se déclencherait aussitôt.
    const timer = setTimeout(() => setExpired(true), Math.min(remaining, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [target]);
  return expired;
}

export function ActionProposalCard({
  proposal,
  state,
  result,
  error,
  tenantId,
  onConfirm,
  onCancel,
  onEdit
}: ActionProposalCardProps): React.ReactElement {
  const timeExpired = useExpired(proposal.expiresAt);
  const expired = state === 'expired' || (state === 'pending' && timeExpired);
  const { summary } = proposal;
  const actionable = state === 'pending' && !expired;
  const confirming = state === 'confirming';

  let status: React.ReactNode = null;
  if (expired) {
    status = <Alert type="warning" showIcon title={t('Cette proposition a expiré. Redemandez-la.')} />;
  } else if (state === 'cancelled') {
    status = <Alert type="info" showIcon title={t('Proposition annulée.')} />;
  } else if (state === 'failed') {
    status = <Alert type="error" showIcon title={error?.message ?? t('La génération a échoué.')} />;
  } else if (state === 'confirmed') {
    status = (
      <Alert
        type="success"
        showIcon
        title={result?.alreadyExisted ? t('Ce document existait déjà.') : t('Document généré.')}
      />
    );
  }

  return (
    <Card size="small" title={t(DOCUMENT_LABEL[proposal.documentType])} data-testid="copilot-proposal-card">
      <Descriptions size="small" column={1}>
        <Descriptions.Item label={t('Bail')}>{summary.leaseNumber}</Descriptions.Item>
        <Descriptions.Item label={t('Bien')}>{summary.propertyLabel}</Descriptions.Item>
        {summary.renterName ? <Descriptions.Item label={t('Locataire')}>{summary.renterName}</Descriptions.Item> : null}
        <Descriptions.Item label={t('Période')}>{summary.periodLabel}</Descriptions.Item>
        {summary.amount ? (
          <Descriptions.Item label={t('Montant')}>{`${summary.amount} ${summary.currency}`}</Descriptions.Item>
        ) : null}
      </Descriptions>
      <div aria-live="polite" data-testid="copilot-proposal-status" style={{ marginBlockStart: 8 }}>
        {status}
      </div>
      {state === 'confirmed' && result ? (
        <div style={{ marginBlockStart: 8 }}>
          <DocumentDownloadCard
            tenantId={tenantId}
            kind="rental"
            documentId={result.document.id}
            filename={result.document.filename}
            label={result.document.documentNumber ?? result.document.filename}
            formatLabel={t('Word (.docx)')}
          />
        </div>
      ) : null}
      {state === 'pending' || confirming ? (
        <Space style={{ marginBlockStart: 12 }} wrap>
          <Button
            type="primary"
            loading={confirming}
            disabled={!actionable}
            onClick={() => onConfirm(proposal.proposalId)}
          >
            {t('Confirmer et générer')}
          </Button>
          <Button disabled={!actionable} onClick={() => (onEdit ?? onCancel)(proposal.proposalId)}>
            {t('Modifier')}
          </Button>
          <Button type="text" disabled={!actionable} onClick={() => onCancel(proposal.proposalId)}>
            {t('Annuler')}
          </Button>
        </Space>
      ) : null}
    </Card>
  );
}

export default ActionProposalCard;
