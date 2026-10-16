import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Input, InputNumber, Modal, Radio, Space, Typography } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { createChargeCallPaymentLink } from '../../services/syndic-online-payment-service';
import type {
  CreateChargeCallPaymentLinkBody,
  CreateChargeCallPaymentLinkResult
} from '../../services/syndic-online-payment-service';
import { formatMoney } from '../primitives';
import { activeLocale } from '../../i18n/format';
import { displayCurrency } from '../../utils/syndic-currency';
import { t } from '../../i18n/t';

const { Paragraph } = Typography;

export const DEFAULT_TTL_DAYS = 7;

type NotSentReason = 'NO_ELIGIBLE_CHANNEL' | 'EVENT_DISABLED' | 'SEND_FAILED' | 'RECIPIENT_NOT_FOUND';

/** Un appel accepte un lien tant qu'il reste à payer (ni soldé ni annulé). */
export function canOfferChargeCallPaymentLink(remaining: number, status?: string | null): boolean {
  return remaining > 0 && status !== 'PAID' && status !== 'CANCELED';
}

/** Message lisible d'une erreur API : codes métier connus d'abord, puis le texte renvoyé par le serveur. */
export function chargeCallLinkErrorText(e: any, fallback: string): string {
  const data = e?.response?.data;
  switch (data?.code) {
    case 'ONLINE_PAYMENT_UNAVAILABLE':
      return t('Paiement en ligne non configuré pour cette copropriété.');
    case 'ONLINE_PAYMENT_NOTHING_DUE':
      return t('Cet appel de charges est déjà soldé : il ne reste rien à payer.');
    default:
      return data?.message || data?.error || fallback;
  }
}

/** Copie dans le presse-papiers ; `false` si ni l'API moderne ni le repli ne fonctionnent. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // repli ci-dessous
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.insetInlineStart = '-9999px';
    document.body.appendChild(area);
    area.select();
    const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function notSentText(reason?: NotSentReason): string {
  switch (reason) {
    case 'NO_ELIGIBLE_CHANNEL':
      return t(
        'Aucun canal éligible : le copropriétaire n’a ni numéro WhatsApp ni e-mail utilisable, ou n’a pas donné son consentement.'
      );
    case 'EVENT_DISABLED':
      return t("Cet envoi est désactivé dans la configuration de l'agence.");
    case 'SEND_FAILED':
      return t("L'envoi a échoué : réessayez plus tard ou vérifiez la configuration des fournisseurs.");
    case 'RECIPIENT_NOT_FOUND':
      return t('Copropriétaire du lot introuvable : impossible de lui envoyer le lien.');
    default:
      return t("Le lien n'a pas été envoyé.");
  }
}

type SentResult = Extract<CreateChargeCallPaymentLinkResult, { sent: true }>;
type CopyResult = Extract<CreateChargeCallPaymentLinkResult, { url: string }>;

function sentText(result: SentResult): string {
  if (result.channel === 'WHATSAPP') return t('Lien de paiement envoyé par WhatsApp.');
  if (result.channel === 'EMAIL') return t('Lien de paiement envoyé par e-mail.');
  return t('Lien de paiement envoyé.');
}

export interface ChargeCallPaymentLinkModalProps {
  tenantId: string;
  syndicId: string;
  chargeId: string;
  open: boolean;
  onClose: () => void;
  /** Appelé après un envoi ou une création réussis (la liste des liens doit se recharger). */
  onChanged?: () => void;
  /** Libellé de l'appel, pour le titre (ex. « 2026-T1 »). */
  periodLabel?: string;
}

type Outcome = { type: 'success' | 'warning'; text: string } | null;

/** Fenêtre de création du lien : envoi au copropriétaire ou copie. L'URL n'est jamais relue après fermeture. */
export const ChargeCallPaymentLinkModal: React.FC<ChargeCallPaymentLinkModalProps> = ({
  tenantId,
  syndicId,
  chargeId,
  open,
  onClose,
  onChanged,
  periodLabel
}) => {
  const { message } = App.useApp();
  const [delivery, setDelivery] = useState<CreateChargeCallPaymentLinkBody['delivery']>('SEND');
  const [ttlDays, setTtlDays] = useState<number>(DEFAULT_TTL_DAYS);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // L'URL (jeton en clair) vit uniquement le temps que la fenêtre est ouverte.
  const [created, setCreated] = useState<CopyResult | null>(null);

  useEffect(() => {
    if (!open) {
      setCreated(null);
      setOutcome(null);
      setErrorMessage(null);
      setDelivery('SEND');
      setTtlDays(DEFAULT_TTL_DAYS);
    }
  }, [open]);

  const ttl = Number.isInteger(ttlDays) && ttlDays >= 1 && ttlDays <= 30 ? ttlDays : DEFAULT_TTL_DAYS;

  const submit = async () => {
    setSubmitting(true);
    setOutcome(null);
    setErrorMessage(null);
    setCreated(null);
    try {
      const result = await createChargeCallPaymentLink(tenantId, syndicId, chargeId, { delivery, ttlDays: ttl });
      if ('url' in result) {
        setCreated(result);
        onChanged?.();
      } else if (result.sent) {
        setOutcome({ type: 'success', text: sentText(result) });
        onChanged?.();
      } else {
        setOutcome({ type: 'warning', text: notSentText(result.reason) });
      }
    } catch (e: any) {
      setErrorMessage(chargeCallLinkErrorText(e, t('Échec de la création du lien de paiement')));
    } finally {
      setSubmitting(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    if (await copyToClipboard(created.url)) message.success(t('Lien de paiement copié dans le presse-papiers.'));
    else message.warning(t('Copie impossible : sélectionnez le lien et copiez-le manuellement.'));
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      destroyOnHidden
      title={periodLabel ? t('Payer cet appel · {{value}}', { value: periodLabel }) : t('Payer cet appel')}
      footer={
        created ? (
          <Button type="primary" onClick={onClose}>
            {t('Fermer')}
          </Button>
        ) : (
          <Space>
            <Button onClick={onClose}>{t('Annuler')}</Button>
            <Button type="primary" loading={submitting} onClick={() => void submit()}>
              {delivery === 'SEND' ? t('Envoyer le lien') : t('Créer le lien')}
            </Button>
          </Space>
        )
      }
    >
      {created ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message={t('Ce lien ne sera plus affiché après la fermeture de cette fenêtre.')}
          />
          <Space.Compact style={{ width: '100%' }}>
            <Input
              readOnly
              dir="ltr"
              value={created.url}
              aria-label={t('Lien de paiement')}
              onFocus={e => e.target.select()}
            />
            <Button type="primary" onClick={() => void copy()}>
              {t('Copier')}
            </Button>
          </Space.Compact>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            {t('Montant dû : {{amount}} — expire le {{date}}', {
              amount: formatMoney(created.amountDue, { currency: displayCurrency(created.currency) ?? undefined }),
              date: new Date(created.expiresAt).toLocaleString(activeLocale())
            })}
          </Paragraph>
        </Space>
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            {t(
              'Le copropriétaire paie le reste dû de cet appel par Mobile Money, sans se connecter. Le montant est recalculé au moment du paiement et n’apparaît pas dans le lien.'
            )}
          </Paragraph>
          <Radio.Group value={delivery} onChange={e => setDelivery(e.target.value)}>
            <Space direction="vertical">
              <Radio value="SEND">{t('Envoyer au copropriétaire (WhatsApp ou e-mail)')}</Radio>
              <Radio value="COPY">{t('Copier le lien')}</Radio>
            </Space>
          </Radio.Group>
          <div>
            <label htmlFor="lien-paiement-appel-duree">{t('Durée de validité (jours)')}</label>
            <div>
              <InputNumber
                id="lien-paiement-appel-duree"
                min={1}
                max={30}
                precision={0}
                value={ttlDays}
                onChange={v => setTtlDays(typeof v === 'number' ? v : DEFAULT_TTL_DAYS)}
              />
            </div>
          </div>
          {outcome ? <Alert type={outcome.type} showIcon message={outcome.text} /> : null}
          {errorMessage ? <Alert type="error" showIcon message={errorMessage} /> : null}
        </Space>
      )}
    </Modal>
  );
};

export interface ChargeCallPaymentLinkButtonProps {
  tenantId: string;
  syndicId: string;
  chargeId: string;
  /** Reste à payer de l'appel ; le bouton disparaît quand il est soldé. */
  remaining: number;
  /** Statut de l'appel ; un appel soldé n'offre pas de lien. */
  status?: string | null;
  /** Droit `SYNDIC_EDIT` ; vrai par défaut, l'API reste l'autorité. */
  canCreate?: boolean;
  onChanged?: () => void;
  periodLabel?: string;
  size?: 'small' | 'middle' | 'large';
}

/** Bouton « Payer cet appel » ouvrant la fenêtre de création du lien. */
export const ChargeCallPaymentLinkButton: React.FC<ChargeCallPaymentLinkButtonProps> = ({
  tenantId,
  syndicId,
  chargeId,
  remaining,
  status,
  canCreate = true,
  onChanged,
  periodLabel,
  size
}) => {
  const [open, setOpen] = useState(false);
  if (!canCreate || !canOfferChargeCallPaymentLink(remaining, status)) return null;
  return (
    <>
      <Button icon={<LinkOutlined />} size={size} onClick={() => setOpen(true)}>
        {t('Payer cet appel')}
      </Button>
      {/* Démonté à la fermeture : l'URL en clair ne survit pas dans le DOM. */}
      {open && (
        <ChargeCallPaymentLinkModal
          tenantId={tenantId}
          syndicId={syndicId}
          chargeId={chargeId}
          open
          onClose={() => setOpen(false)}
          onChanged={onChanged}
          periodLabel={periodLabel}
        />
      )}
    </>
  );
};
