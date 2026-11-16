import React, { useEffect, useState } from 'react';
import { Alert, DatePicker, Descriptions, Input, Modal, Radio, Space, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { formatMoney } from '../../primitives';
import type { RentalOnlinePaymentRowDto, ResolveOnlinePaymentResultDto } from '../../../types/rental-online-payment';
import { resolveRentalOnlinePayment } from '../../../services/rental-online-payment-service';
import { t } from '../../../i18n/t';
import { HelpSectionTitle } from '../../../help';
import { allowedDecisions, apiErrorMessage, formatDateTime, periodLabel, reviewKindLabel } from './helpers';

const { Text } = Typography;

export interface RentalReviewDecisionModalProps {
  tenantId: string;
  /** Paiement à trancher ; `null` = modale fermée. */
  checkout: RentalOnlinePaymentRowDto | null;
  onClose: () => void;
  onDecided: (result: ResolveOnlinePaymentResultDto) => void;
}

type Decision = 'ACCEPT' | 'REJECT';

/** Décision du gestionnaire sur un paiement en REVIEW (contrat 049 §2.5 et §2.6). */
export const RentalReviewDecisionModal: React.FC<RentalReviewDecisionModalProps> = ({
  tenantId,
  checkout,
  onClose,
  onDecided
}) => {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const [paidAt, setPaidAt] = useState<Dayjs>(() => dayjs());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = checkout ? allowedDecisions(checkout) : { accept: true, reject: true };

  useEffect(() => {
    setNote('');
    setPaidAt(dayjs());
    setError(null);
    setSubmitting(false);
    setDecision(allowed.accept && !allowed.reject ? 'ACCEPT' : allowed.reject && !allowed.accept ? 'REJECT' : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout?.id]);

  if (!checkout) return null;

  const kind = checkout.reviewKind;
  const currency = checkout.currency === 'XOF' ? 'FCFA' : checkout.currency;
  const money = (value: number) => formatMoney(value, { currency });
  const noteOk = note.trim().length > 0;
  const canSubmit = decision !== null && (decision === 'ACCEPT' || noteOk);
  const alreadyCollected = kind === 'CONTRARY_STATE' && checkout.collected;

  const explanation = (() => {
    switch (kind) {
      case 'AMOUNT_MISMATCH':
        return (
          <>
            <div>
              {t('Le locataire a payé {{received}} au lieu de {{expected}}.', {
                received:
                  checkout.receivedAmount === null ? t('un montant non rapporté') : money(checkout.receivedAmount),
                expected: money(checkout.amount)
              })}
            </div>
            <div>
              {t(
                'Accepter encaisse le montant reçu : un trop-perçu reste non alloué, un montant inférieur laisse un reste dû.'
              )}
            </div>
          </>
        );
      case 'CONTRARY_STATE':
        return (
          <>
            <div>
              {checkout.collected
                ? t('L’argent est déjà encaissé dans ImmoTopia.')
                : t('L’argent n’est pas encaissé dans ImmoTopia.')}
            </div>
            <div>{t('Vérifiez chez PaySecureHub l’état réel de la transaction avant de trancher.')}</div>
          </>
        );
      case 'DUPLICATE_TRANSACTION':
        return (
          <div>{t('Cette transaction est déjà enregistrée sur un autre paiement : seul le refus est possible.')}</div>
        );
      case 'INSTALLMENT_UNAVAILABLE':
        return (
          <>
            <div>
              {t('Échéances concernées : {{list}}', {
                list: checkout.installments.map(i => periodLabel(i.periodYear, i.periodMonth)).join(', ') || '—'
              })}
            </div>
            <div>{t('Accepter encaisse ce qui reste ouvert.')}</div>
          </>
        );
      default:
        return null;
    }
  })();

  const submit = async () => {
    if (!decision || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmed = note.trim();
      const result = await resolveRentalOnlinePayment(tenantId, checkout.id, {
        decision,
        ...(trimmed ? { note: trimmed } : {}),
        ...(decision === 'ACCEPT' ? { paidAt: paidAt.format('YYYY-MM-DD') } : {})
      });
      onDecided(result);
    } catch (e) {
      setError(apiErrorMessage(e, t('La décision n’a pas pu être enregistrée')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={
        <HelpSectionTitle
          title={t('Trancher le paiement {{code}}', { code: checkout.codePaiement })}
          helpId="locatif.enligne.decision"
        />
      }
      onCancel={onClose}
      onOk={() => void submit()}
      okText={t('Enregistrer la décision')}
      cancelText={t('Annuler')}
      okButtonProps={{ disabled: !canSubmit, loading: submitting }}
      destroyOnClose
      width={640}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {kind ? (
          <Alert
            type="warning"
            showIcon
            message={reviewKindLabel(kind)}
            description={
              <>
                {checkout.reviewReason ? <div>{checkout.reviewReason}</div> : null}
                {explanation}
              </>
            }
          />
        ) : null}

        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={t('Montant demandé')}>{money(checkout.amount)}</Descriptions.Item>
          <Descriptions.Item label={t('Montant reçu')}>
            {checkout.receivedAmount === null ? t('Non rapporté') : money(checkout.receivedAmount)}
          </Descriptions.Item>
          <Descriptions.Item label={t('Bail')}>
            {checkout.leaseReference ?? '—'}
            {checkout.propertyLabel ? ` — ${checkout.propertyLabel}` : ''}
          </Descriptions.Item>
          <Descriptions.Item label={t('Locataire')}>{checkout.renter?.name ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('Moyen de paiement')}>{checkout.providerServiceName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('Transaction fournisseur')}>
            {checkout.providerTransactionId ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label={t('Dernière vérification')}>
            {formatDateTime(checkout.lastCheckedAt)}
          </Descriptions.Item>
        </Descriptions>

        <div>
          <Text strong>{t('Décision')}</Text>
          <Radio.Group
            style={{ display: 'block', marginTop: 8 }}
            value={decision}
            onChange={event => setDecision(event.target.value)}
          >
            <Space direction="vertical">
              <Radio value="ACCEPT" disabled={!allowed.accept}>
                {alreadyCollected
                  ? t('Accepter : l’encaissement est déjà enregistré, clore le suivi')
                  : t('Accepter : enregistrer l’encaissement')}
              </Radio>
              {!allowed.accept ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('Impossible d’accepter : cette transaction est déjà enregistrée sur un autre paiement.')}
                </Text>
              ) : null}
              <Radio value="REJECT" disabled={!allowed.reject}>
                {t('Refuser : ne rien enregistrer')}
              </Radio>
              {!allowed.reject ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('Impossible de refuser : l’encaissement est déjà enregistré et ne peut pas être annulé ici.')}
                </Text>
              ) : null}
            </Space>
          </Radio.Group>
        </div>

        {decision === 'REJECT' ? (
          <Alert
            type="info"
            showIcon
            message={t('L’argent reste chez PaySecureHub : aucun remboursement n’est fait ici.')}
          />
        ) : null}

        {decision === 'ACCEPT' ? (
          <div>
            <label htmlFor="rental-review-paid-at">
              <Text strong>{t('Date de paiement')}</Text>
            </label>
            <DatePicker
              id="rental-review-paid-at"
              allowClear={false}
              style={{ display: 'block', marginTop: 8, width: '100%' }}
              format="DD/MM/YYYY"
              value={paidAt}
              onChange={value => value && setPaidAt(value)}
              disabledDate={date => date.isAfter(dayjs(), 'day')}
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="rental-review-note">
            <Text strong>{decision === 'REJECT' ? t('Note (obligatoire)') : t('Note (facultative)')}</Text>
          </label>
          <Input.TextArea
            id="rental-review-note"
            style={{ marginTop: 8 }}
            rows={3}
            maxLength={500}
            showCount
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder={t('Motif de la décision, conservé dans le journal d’audit')}
          />
        </div>

        {error ? <Alert type="error" showIcon message={error} /> : null}
      </Space>
    </Modal>
  );
};

export default RentalReviewDecisionModal;
