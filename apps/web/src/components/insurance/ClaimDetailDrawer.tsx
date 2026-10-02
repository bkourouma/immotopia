import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Descriptions, Divider, Drawer, Spin, Tag, Timeline, Typography } from 'antd';
import { getInsuranceClaim } from '../../services/insurance-service';
import type { InsuranceClaimDetailDto } from '../../types/insurance-types';
import { apiErrorMessage } from '../patrimoine/patrimoine-labels';
import { t } from '../../i18n/t';
import { ClaimDocuments } from './ClaimDocuments';
import { ClaimStatusTimeline } from './ClaimStatusTimeline';
import { ClaimTransitionActions } from './ClaimTransitionActions';
import {
  causeLabel,
  claimStatusColor,
  claimStatusLabel,
  formatAmount,
  formatDateTime,
  formatDay
} from './insurance-labels';

interface Props {
  tenantId: string;
  claimId: string | null;
  canEdit: boolean;
  onClose: () => void;
  /** Appelé après toute modification, pour rafraîchir la liste. */
  onChanged: () => void;
}

/**
 * Détail d'un sinistre : frise des statuts, montants, historique horodaté,
 * transitions et pièces. Le reste à charge est CALCULÉ par l'API et affiché
 * en lecture seule ; il n'existe aucun champ pour le saisir.
 */
export const ClaimDetailDrawer: React.FC<Props> = ({ tenantId, claimId, canEdit, onClose, onChanged }) => {
  const [claim, setClaim] = useState<InsuranceClaimDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!claimId) return;
    setLoading(true);
    setError(null);
    try {
      setClaim(await getInsuranceClaim(tenantId, claimId));
    } catch (e) {
      setError(apiErrorMessage(e, t('Impossible de charger le sinistre.')));
    } finally {
      setLoading(false);
    }
  }, [tenantId, claimId]);

  useEffect(() => {
    setClaim(null);
    void load();
  }, [load]);

  const changed = () => {
    onChanged();
    void load();
  };

  return (
    <Drawer open={claimId !== null} onClose={onClose} width={640} title={t('Détail du sinistre')} destroyOnClose>
      {loading && !claim && <Spin />}
      {error && <Alert type="error" showIcon message={error} />}
      {claim && (
        <>
          <ClaimStatusTimeline status={claim.status} rejectedAt={claim.rejectedAt} />
          <Descriptions column={1} size="small" bordered style={{ marginBlockStart: 16 }}>
            <Descriptions.Item label={t('Statut')}>
              <Tag color={claimStatusColor(claim.status)}>{claimStatusLabel(claim.status)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('Police')}>{claim.policyLabel}</Descriptions.Item>
            <Descriptions.Item label={t('Date du sinistre')}>{formatDay(claim.occurredAt)}</Descriptions.Item>
            <Descriptions.Item label={t('Cause')}>{causeLabel(claim.cause)}</Descriptions.Item>
            <Descriptions.Item label={t('Description')}>{claim.description}</Descriptions.Item>
            <Descriptions.Item label={t('Montant réclamé')}>
              {formatAmount(claim.claimedAmount, claim.currency)}
            </Descriptions.Item>
            <Descriptions.Item label={t('Montant indemnisé')}>
              {formatAmount(claim.indemnifiedAmount, claim.currency)}
            </Descriptions.Item>
            <Descriptions.Item label={t('Franchise')}>
              {formatAmount(claim.deductible, claim.currency)}
            </Descriptions.Item>
            <Descriptions.Item label={t('Reste à charge')}>
              <span data-testid="out-of-pocket">{formatAmount(claim.outOfPocketAmount, claim.currency)}</span>
            </Descriptions.Item>
            {claim.ticketTitle && <Descriptions.Item label={t('Ticket lié')}>{claim.ticketTitle}</Descriptions.Item>}
            {claim.rejectionReason && (
              <Descriptions.Item label={t('Motif du rejet')}>{claim.rejectionReason}</Descriptions.Item>
            )}
          </Descriptions>

          {canEdit && (
            <div style={{ marginBlockStart: 16 }}>
              <ClaimTransitionActions tenantId={tenantId} claim={claim} onChanged={changed} />
            </div>
          )}

          <Divider>{t('Historique')}</Divider>
          <Timeline
            items={claim.history.map(entry => ({
              key: entry.id,
              children: (
                <>
                  <Typography.Text strong>{claimStatusLabel(entry.toStatus)}</Typography.Text>
                  <div>
                    {formatDateTime(entry.changedAt)}
                    {entry.changedByName ? ` · ${entry.changedByName}` : ''}
                  </div>
                  {entry.note && <Typography.Text type="secondary">{entry.note}</Typography.Text>}
                </>
              )
            }))}
          />

          <Divider>{t('Pièces')}</Divider>
          <ClaimDocuments tenantId={tenantId} claim={claim} canEdit={canEdit} onChanged={changed} />
        </>
      )}
    </Drawer>
  );
};
