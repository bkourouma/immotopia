import React from 'react';
import { Alert, Collapse, Typography } from 'antd';
import type {
  PrenotificationSummaryDto,
  ReturnState,
  ReturnSummaryDto,
  SkippedMandateDto
} from '../../../services/direct-debit-service';
import { formatMoney } from '../../primitives';
import { returnStateLabel, skipReasonLabel } from './direct-debit-shared';
import { t } from '../../../i18n/t';

const { Text } = Typography;

/**
 * État des avis de prélèvement d'une remise validée : toujours relu depuis la
 * remise. Vert seulement si toutes les lignes ont reçu leur avis ; tant que
 * l'envoi se poursuit en arrière-plan, le message le dit.
 */
export const PrenotificationSummaryAlert: React.FC<{
  summary: PrenotificationSummaryDto;
  lineCount: number;
  scope?: 'RENTAL_LEASE' | 'SYNDIC_LOT';
}> = ({ summary, lineCount, scope }) => {
  const allSent = summary.sent >= lineCount;
  return (
    <Alert
      type={allSent ? 'success' : 'warning'}
      showIcon
      message={summary.pending > 0 ? t('Envoi des avis en cours…') : t('Avis de prélèvement')}
      description={
        <div>
          <div>
            {t(
              'Envoyés : {{sent}} · En cours : {{pending}} · Sans e-mail : {{noEmail}} · Désactivés : {{disabled}} · En échec : {{failed}}',
              {
                sent: summary.sent,
                pending: summary.pending,
                noEmail: summary.noEmail,
                disabled: summary.disabled,
                failed: summary.failed
              }
            )}
          </div>
          {summary.recipients && (
            <div>
              {t(
                'Adresses des avis : compte portail : {{account}} · fiche contact : {{contact}} · sans adresse : {{none}}',
                {
                  account: summary.recipients.account,
                  contact: summary.recipients.contact,
                  none: summary.recipients.none
                }
              )}
            </div>
          )}
          <div>
            <Text type="secondary">
              {scope === 'SYNDIC_LOT'
                ? t("Les avis partent à l'adresse de la fiche contact du copropriétaire.")
                : t(
                    "Les avis partent à l'adresse du compte portail du locataire quand il en a un, sinon à celle de sa fiche contact."
                  )}
            </Text>
          </div>
        </div>
      }
    />
  );
};

/**
 * Avancement du retour de la banque (spec 042, P3, §8.7) : état, lignes en
 * attente, réglées, rejetées et leurs montants.
 */
export const ReturnSummaryAlert: React.FC<{ summary: ReturnSummaryDto; state: ReturnState }> = ({ summary, state }) => (
  <Alert
    type={state === 'COMPLETE' ? 'success' : state === 'PARTIAL' ? 'warning' : 'info'}
    showIcon
    message={t('Retour de la banque : {{state}}', { state: returnStateLabel(state) })}
    description={t(
      'En attente : {{pending}} · Réglées : {{settled}} ({{settledAmount}}) · Rejetées : {{rejected}} ({{rejectedAmount}})',
      {
        pending: summary.pending,
        settled: summary.settled,
        settledAmount: formatMoney(summary.settledAmount),
        rejected: summary.rejected,
        rejectedAmount: formatMoney(summary.rejectedAmount)
      }
    )}
  />
);

/**
 * Mandats du créancier que la remise en brouillon ne retient pas, relus par
 * l'API à chaque lecture (spec 042 §8.12) : section dépliable, toujours visible.
 */
export const DraftSkippedMandatesSection: React.FC<{
  skipped: SkippedMandateDto[] | undefined;
  scope?: 'RENTAL_LEASE' | 'SYNDIC_LOT';
}> = ({ skipped, scope }) => {
  if (!skipped || skipped.length === 0) return null;
  return (
    <Collapse
      size="small"
      items={[
        {
          key: 'skipped',
          label: t('Mandats non retenus ({{n}})', { n: skipped.length }),
          children: (
            <ul style={{ margin: 0, paddingInlineStart: 20 }}>
              {skipped.map(item => (
                <li key={item.mandateId}>
                  <bdi dir="ltr">{item.mandateReference}</bdi>
                  {item.debtorName ? ` — ${item.debtorName}` : ''}
                  {item.leaseNumber ? ` (${item.leaseNumber})` : ''}
                  {item.lotNumber ? ` (${t('Lot {{lot}}', { lot: item.lotNumber })})` : ''} :{' '}
                  {skipReasonLabel(item.reason, scope)}
                </li>
              ))}
            </ul>
          )
        }
      ]}
    />
  );
};

/** Mandats actifs qui n'ont pas été retenus dans la remise, avec la raison. */
export const SkippedMandatesAlert: React.FC<{
  skipped: SkippedMandateDto[];
  onClose?: () => void;
  scope?: 'RENTAL_LEASE' | 'SYNDIC_LOT';
}> = ({ skipped, onClose, scope }) => {
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
              {item.leaseNumber ? ` (${item.leaseNumber})` : ''}
              {item.lotNumber ? ` (${t('Lot {{lot}}', { lot: item.lotNumber })})` : ''} :{' '}
              {skipReasonLabel(item.reason, scope)}
            </li>
          ))}
        </ul>
      }
    />
  );
};
