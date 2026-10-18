import React from 'react';
import { Alert } from 'antd';
import type { PrenotificationSummaryDto, SkippedMandateDto } from '../../../services/direct-debit-service';
import { skipReasonLabel } from './direct-debit-shared';
import { t } from '../../../i18n/t';

/**
 * État des avis de prélèvement d'une remise validée : toujours relu depuis la
 * remise. Vert seulement si toutes les lignes ont reçu leur avis ; tant que
 * l'envoi se poursuit en arrière-plan, le message le dit.
 */
export const PrenotificationSummaryAlert: React.FC<{ summary: PrenotificationSummaryDto; lineCount: number }> = ({
  summary,
  lineCount
}) => {
  const allSent = summary.sent >= lineCount;
  return (
    <Alert
      type={allSent ? 'success' : 'warning'}
      showIcon
      message={summary.pending > 0 ? t('Envoi des avis en cours…') : t('Avis de prélèvement')}
      description={t(
        'Envoyés : {{sent}} · En cours : {{pending}} · Sans e-mail : {{noEmail}} · Désactivés : {{disabled}} · En échec : {{failed}}',
        {
          sent: summary.sent,
          pending: summary.pending,
          noEmail: summary.noEmail,
          disabled: summary.disabled,
          failed: summary.failed
        }
      )}
    />
  );
};

/** Mandats actifs qui n'ont pas été retenus dans la remise, avec la raison. */
export const SkippedMandatesAlert: React.FC<{ skipped: SkippedMandateDto[]; onClose?: () => void }> = ({
  skipped,
  onClose
}) => {
  if (skipped.length === 0) return null;
  return (
    <Alert
      type="info"
      showIcon
      closable={Boolean(onClose)}
      onClose={onClose}
      message={t('Mandats non retenus : {{n}}', { n: skipped.length })}
      description={
        <ul style={{ margin: 0, paddingInlineStart: 20 }}>
          {skipped.map(item => (
            <li key={item.mandateId}>
              <bdi dir="ltr">{item.mandateReference}</bdi>
              {item.debtorName ? ` — ${item.debtorName}` : ''}
              {item.leaseNumber ? ` (${item.leaseNumber})` : ''} : {skipReasonLabel(item.reason)}
            </li>
          ))}
        </ul>
      }
    />
  );
};
