import React from 'react';
import { Alert } from 'antd';
import type { PrenotificationSummaryDto, SkippedMandateDto } from '../../../services/direct-debit-service';
import { skipReasonLabel } from './direct-debit-shared';
import { t } from '../../../i18n/t';

/** Résumé des prénotifications envoyées après une validation ou un renvoi. */
export const PrenotificationSummaryAlert: React.FC<{ summary: PrenotificationSummaryDto; onClose?: () => void }> = ({
  summary,
  onClose
}) => {
  const needsAttention = summary.failed > 0 || summary.noEmail > 0;
  return (
    <Alert
      type={needsAttention ? 'warning' : 'success'}
      showIcon
      closable={Boolean(onClose)}
      onClose={onClose}
      message={t('Prénotifications')}
      description={t(
        'Envoyées : {{sent}} · Sans e-mail : {{noEmail}} · Désactivées : {{disabled}} · En échec : {{failed}}',
        {
          sent: summary.sent,
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
