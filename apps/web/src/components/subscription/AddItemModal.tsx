import React, { useEffect, useRef, useState } from 'react';
import { Alert, App, Descriptions, InputNumber, Modal, Space, Spin, Typography } from 'antd';
import {
  addAccountItem,
  quoteAddItem,
  type AddItemQuote,
  type CatalogOffer
} from '../../services/subscription-account-service';
import { formatMoney, StatusTag } from '../primitives';
import { formatLongDate, apiErrorMessage, moduleLabel } from './subscription-account-labels';
import { t } from '../../i18n/t';

const { Text, Paragraph } = Typography;

interface Props {
  tenantId: string;
  offer: CatalogOffer | null;
  /** Période de facturation, pour libeller le montant récurrent d'un abonnement annuel. */
  billingCycle: 'MONTHLY' | 'ANNUAL' | null;
  onClose: () => void;
  /** Appelé après l'ajout confirmé et accepté par l'API. */
  onAdded: () => Promise<void> | void;
}

const QUOTE_DEBOUNCE_MS = 250;

/**
 * Fenêtre d'ajout d'un pack ou d'une extension : quantité, devis à blanc
 * (`/items/quote`), récapitulatif, puis confirmation explicite (`/items`).
 * Rien n'est écrit tant que « Confirmer l'ajout » n'est pas cliqué.
 */
export const AddItemModal: React.FC<Props> = ({ tenantId, offer, billingCycle, onClose, onAdded }) => {
  const { message } = App.useApp();
  const [quantity, setQuantity] = useState(1);
  const [quote, setQuote] = useState<AddItemQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const requestId = useRef(0);

  const code = offer?.code;
  useEffect(() => {
    if (code) {
      setQuantity(1);
      setQuote(null);
      setQuoteError(null);
      setSubmitError(null);
    }
  }, [code]);

  useEffect(() => {
    if (!code) return undefined;
    const current = ++requestId.current;
    setQuoting(true);
    setQuoteError(null);
    const timer = setTimeout(() => {
      quoteAddItem(tenantId, { code, quantity })
        .then(result => {
          if (current === requestId.current) setQuote(result);
        })
        .catch(err => {
          if (current !== requestId.current) return;
          setQuote(null);
          setQuoteError(apiErrorMessage(err, t('Impossible de calculer le devis.')));
        })
        .finally(() => {
          if (current === requestId.current) setQuoting(false);
        });
    }, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [tenantId, code, quantity]);

  const confirm = async () => {
    if (!offer || !quote) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await addAccountItem(tenantId, { code: offer.code, quantity });
      message.success(t('{{name}} ajouté à votre abonnement', { name: offer.name }));
      await onAdded();
      onClose();
    } catch (err) {
      setSubmitError(apiErrorMessage(err, t("Erreur lors de l'ajout")));
    } finally {
      setSubmitting(false);
    }
  };

  const isExtension = offer?.kind === 'EXTENSION';

  return (
    <Modal
      open={Boolean(offer)}
      title={offer ? t('Ajouter : {{name}}', { name: offer.name }) : ''}
      onCancel={onClose}
      onOk={confirm}
      okText={t("Confirmer l'ajout")}
      cancelText={t('Annuler')}
      okButtonProps={{ disabled: !quote || quoting, loading: submitting }}
      cancelButtonProps={{ disabled: submitting }}
      maskClosable={false}
      destroyOnClose
      width={560}
      style={{ maxWidth: 'calc(100vw - 32px)' }}
    >
      {offer && (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {isExtension && offer.maxQuantity > 1 && (
            <div>
              <label htmlFor="add-item-quantity">
                <Text strong>{t('Quantité')}</Text>
              </label>
              <div>
                <InputNumber<number>
                  id="add-item-quantity"
                  min={1}
                  max={offer.maxQuantity}
                  precision={0}
                  value={quantity}
                  onChange={value => setQuantity(value ?? 1)}
                  style={{ width: 160 }}
                />
              </div>
            </div>
          )}

          {quoteError && <Alert type="error" showIcon message={quoteError} />}
          {quoting && !quote && !quoteError && <Spin />}
          {quote && <QuoteSummary quote={quote} billingCycle={billingCycle} stale={quoting} />}
          {submitError && <Alert type="error" showIcon message={submitError} />}
          {quote && (
            <Paragraph type="secondary" style={{ margin: 0 }}>
              {t(
                'En confirmant, l’élément est actif immédiatement et le montant ci-dessus est ajouté à votre prochaine facture.'
              )}
            </Paragraph>
          )}
        </Space>
      )}
    </Modal>
  );
};

const QuoteSummary: React.FC<{ quote: AddItemQuote; billingCycle: 'MONTHLY' | 'ANNUAL' | null; stale: boolean }> = ({
  quote,
  billingCycle,
  stale
}) => (
  <div style={{ opacity: stale ? 0.5 : 1 }} aria-busy={stale}>
    <Descriptions column={1} size="small" bordered>
      <Descriptions.Item label={t('Quantité')}>{quote.quantity}</Descriptions.Item>
      {quote.segments.length > 1 &&
        quote.segments.map((segment, index) => (
          <Descriptions.Item key={index} label={t('{{quantity}} unité(s) à', { quantity: segment.quantity })}>
            {t('{{price}} HT / mois', { price: formatMoney(segment.unitMonthlyPrice) })}
          </Descriptions.Item>
        ))}
      <Descriptions.Item label={t('Montant mensuel ajouté (HT)')}>
        <Text strong>{formatMoney(quote.monthlyAmount)}</Text>
      </Descriptions.Item>
      {billingCycle === 'ANNUAL' && (
        <Descriptions.Item label={t('Montant ajouté par période de facturation (HT)')}>
          {formatMoney(quote.cycleAmount)}
        </Descriptions.Item>
      )}
      {quote.prorata && (
        <Descriptions.Item
          label={t('Prorata jusqu’au {{date}} (HT)', { date: formatLongDate(quote.prorata.periodEnd) })}
        >
          {formatMoney(quote.prorata.amount)}
          <br />
          <Text type="secondary">
            {t('{{remaining}} jours restants sur {{total}}', {
              remaining: quote.prorata.remainingDays,
              total: quote.prorata.totalDays
            })}
          </Text>
        </Descriptions.Item>
      )}
      {quote.comboDiscountDelta !== 0 && (
        <Descriptions.Item label={t('Variation de la remise de combinaison (HT)')}>
          {formatMoney(quote.comboDiscountDelta)}
        </Descriptions.Item>
      )}
      <Descriptions.Item label={t('Ajouté à la prochaine facture (TTC, TVA {{rate}} %)', { rate: quote.taxRate })}>
        <Text strong>{formatMoney(quote.dueOnNextInvoiceInclTax)}</Text>
      </Descriptions.Item>
      <Descriptions.Item label={t('Modules ouverts')}>
        {quote.modulesOpened.length > 0 ? (
          <Space wrap>
            {quote.modulesOpened.map(key => (
              <StatusTag key={key} status="ACTIVE" label={moduleLabel(key)} />
            ))}
          </Space>
        ) : (
          t('Aucun nouveau module')
        )}
      </Descriptions.Item>
    </Descriptions>
    {quote.trial && (
      <Alert
        style={{ marginBlockStart: 'var(--space-3)' }}
        type="info"
        showIcon
        message={t('Pendant votre essai, aucun prorata n’est facturé pour cet ajout.')}
      />
    )}
  </div>
);
