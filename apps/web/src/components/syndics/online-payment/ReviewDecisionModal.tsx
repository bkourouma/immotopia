import React, { useEffect, useState } from 'react';
import { Alert, DatePicker, Descriptions, Input, Modal, Radio, Space, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { formatMoney } from '../../primitives';
import {
  DecideSyndicCheckoutResult,
  SyndicOnlineCheckoutRow,
  decideSyndicOnlineCheckout
} from '../../../services/syndic-online-payment-service';
import { displayCurrency } from '../../../utils/syndic-currency';
import { t } from '../../../i18n/t';
import { allowedDecisions, apiErrorMessage, formatDateTime, reviewKindLabel } from './helpers';

const { Text, Paragraph } = Typography;

export interface ReviewDecisionModalProps {
  tenantId: string;
  syndicId: string;
  /** Paiement à trancher ; `null` = modale fermée. */
  checkout: SyndicOnlineCheckoutRow | null;
  onClose: () => void;
  onDecided: (result: DecideSyndicCheckoutResult) => void;
}

type Decision = 'ACCEPT' | 'REJECT';

/**
 * Décision du gestionnaire sur un paiement `REVIEW` (contrat §1.7, règles R20 à
 * R22). L'option interdite pour le motif est désactivée ici ; le serveur la
 * refuse de toute façon (409). Refuser ne rembourse pas le payeur.
 */
export const ReviewDecisionModal: React.FC<ReviewDecisionModalProps> = ({
  tenantId,
  syndicId,
  checkout,
  onClose,
  onDecided
}) => {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const [paidAt, setPaidAt] = useState<Dayjs | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kind = checkout?.reviewKind ?? null;
  const allowed = allowedDecisions(kind, checkout?.chargePaymentId);

  useEffect(() => {
    // Remise à zéro à chaque ouverture ; l'unique option permise est présélectionnée.
    setNote('');
    setPaidAt(null);
    setError(null);
    setSubmitting(false);
    const only = allowed.accept && !allowed.reject ? 'ACCEPT' : allowed.reject && !allowed.accept ? 'REJECT' : null;
    setDecision(only);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout?.id]);

  if (!checkout) return null;

  const currency = displayCurrency(checkout.currency) ?? 'FCFA';
  const received = checkout.receivedAmount;
  // CONTRARY_STATE avec encaissement : accepter ne fait que clore le suivi.
  // Sans encaissement (succès tardif), accepter encaisse comme les autres motifs.
  const alreadyRecorded = kind === 'CONTRARY_STATE' && Boolean(checkout.chargePaymentId);
  const recordsPayment = decision === 'ACCEPT' && !alreadyRecorded;
  const noteOk = note.trim().length > 0;

  const submit = async () => {
    if (!decision || !noteOk) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await decideSyndicOnlineCheckout(tenantId, syndicId, checkout.id, {
        decision,
        note: note.trim(),
        ...(recordsPayment && paidAt ? { paidAt: paidAt.format('YYYY-MM-DD') } : {})
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
      title={t('Trancher le paiement {{code}}', { code: checkout.codePaiement })}
      onCancel={onClose}
      onOk={() => void submit()}
      okText={t('Enregistrer la décision')}
      cancelText={t('Annuler')}
      okButtonProps={{ disabled: !decision || !noteOk, loading: submitting }}
      destroyOnClose
      width={640}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {kind ? (
          <Alert
            type="warning"
            showIcon
            message={reviewKindLabel(kind, checkout.chargePaymentId)}
            description={checkout.reviewReason ?? undefined}
          />
        ) : null}

        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={t('Montant demandé')}>
            {formatMoney(checkout.amount, { currency })}
          </Descriptions.Item>
          <Descriptions.Item label={t('Montant reçu')}>
            {received === null ? t('Non rapporté') : formatMoney(received, { currency })}
          </Descriptions.Item>
          <Descriptions.Item label={t('Lot')}>{checkout.lot.lotNumber}</Descriptions.Item>
          <Descriptions.Item label={t('Payeur')}>{checkout.payer?.name ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('Appels visés')}>
            {checkout.chargeCalls.map(call => call.period).join(', ') || '—'}
          </Descriptions.Item>
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
                {alreadyRecorded
                  ? t('Accepter : l’encaissement est déjà enregistré, clore le suivi')
                  : t('Accepter : enregistrer l’encaissement du montant reçu')}
              </Radio>
              {recordsPayment && received === null ? (
                <Text type="warning" style={{ fontSize: 12 }}>
                  {t('Montant non rapporté par le fournisseur : le montant demandé ({{amount}}) sera enregistré.', {
                    amount: formatMoney(checkout.amount, { currency })
                  })}
                </Text>
              ) : null}
              {!allowed.accept ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('Impossible d’accepter : cette transaction est déjà enregistrée sur un autre paiement.')}
                </Text>
              ) : null}
              <Radio value="REJECT" disabled={!allowed.reject}>
                {kind === 'CONTRARY_STATE' && !alreadyRecorded
                  ? t('Refuser : la tentative reste en échec, rien n’est encaissé')
                  : t('Refuser : ne rien enregistrer')}
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
            message={t('Refuser ne rembourse pas le payeur')}
            description={t(
              'L’argent reste chez PaySecureHub. Le remboursement se fait en dehors d’ImmoTopia, directement avec le fournisseur.'
            )}
          />
        ) : null}

        {recordsPayment ? (
          <div>
            <label htmlFor="review-paid-at">
              <Text strong>{t('Date d’encaissement')}</Text>
            </label>
            <DatePicker
              id="review-paid-at"
              style={{ display: 'block', marginTop: 8, width: '100%' }}
              format="DD/MM/YYYY"
              value={paidAt}
              onChange={value => setPaidAt(value)}
              disabledDate={date => date.isAfter(dayjs(), 'day')}
              placeholder={t('Aujourd’hui')}
            />
            <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
              {kind === 'FISCAL_YEAR_CLOSED'
                ? t('L’exercice est clos à la date du paiement : choisissez une date dans un exercice ouvert.')
                : t('Laissée vide, la date du jour est utilisée.')}
            </Paragraph>
          </div>
        ) : null}

        <div>
          <label htmlFor="review-note">
            <Text strong>{t('Note (obligatoire)')}</Text>
          </label>
          <Input.TextArea
            id="review-note"
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

export default ReviewDecisionModal;
