import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Input, InputNumber, Modal, Radio, Space, Typography } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import {
  createInstallmentPaymentLinkToCopy,
  sendInstallmentPaymentLink
} from '../../services/installment-payment-link-service';
import type {
  InstallmentLinkNotSentReason,
  InstallmentPaymentLinkCopyResult,
  InstallmentPaymentLinkDelivery,
  InstallmentPaymentLinkSendResult
} from '../../types/installment-payment-link-types';
import { formatMoney } from '../primitives';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Paragraph } = Typography;

export const DEFAULT_TTL_DAYS = 7;

/** Une échéance accepte un lien tant qu'il reste à payer et qu'elle n'est pas annulée. */
export function canOfferPaymentLink(remaining: number, status?: string | null): boolean {
  return remaining > 0 && status !== 'CANCELED';
}

function errorText(e: any, fallback: string): string {
  return e?.response?.data?.error || e?.response?.data?.message || fallback;
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

function notSentText(reason?: InstallmentLinkNotSentReason): string {
  switch (reason) {
    case 'NO_ELIGIBLE_CHANNEL':
      return t(
        'Aucun canal éligible : le locataire n’a ni numéro WhatsApp ni e-mail utilisable, ou n’a pas donné son consentement.'
      );
    case 'EVENT_DISABLED':
      return t("Cet envoi est désactivé dans la configuration de l'agence.");
    case 'SEND_FAILED':
      return t("L'envoi a échoué : réessayez plus tard ou vérifiez la configuration des fournisseurs.");
    case 'RENTER_CONTACT_NOT_FOUND':
      return t('Fiche du locataire introuvable : impossible de lui envoyer le lien.');
    default:
      return t("Le lien n'a pas été envoyé.");
  }
}

function sentText(result: InstallmentPaymentLinkSendResult): string {
  if (result.channel === 'WHATSAPP') return t('Lien de paiement envoyé par WhatsApp.');
  if (result.channel === 'EMAIL') return t('Lien de paiement envoyé par e-mail.');
  return t('Lien de paiement envoyé.');
}

export interface InstallmentPaymentLinkModalProps {
  tenantId: string;
  installmentId: string;
  open: boolean;
  onClose: () => void;
  /** Appelé après un envoi ou une création réussis (la liste des liens doit se recharger). */
  onChanged?: () => void;
  /** Libellé de l'échéance, pour le titre (ex. « 09/2026 »). */
  periodLabel?: string;
}

type Outcome = { type: 'success' | 'warning'; text: string } | null;

/** Fenêtre de création du lien : envoi au locataire ou copie. L'URL n'est jamais relue après fermeture. */
export const InstallmentPaymentLinkModal: React.FC<InstallmentPaymentLinkModalProps> = ({
  tenantId,
  installmentId,
  open,
  onClose,
  onChanged,
  periodLabel
}) => {
  const { message } = App.useApp();
  const [delivery, setDelivery] = useState<InstallmentPaymentLinkDelivery>('SEND');
  const [ttlDays, setTtlDays] = useState<number>(DEFAULT_TTL_DAYS);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  // L'URL (jeton en clair) vit uniquement le temps que la fenêtre est ouverte.
  const [created, setCreated] = useState<InstallmentPaymentLinkCopyResult | null>(null);

  useEffect(() => {
    if (!open) {
      setCreated(null);
      setOutcome(null);
      setDelivery('SEND');
      setTtlDays(DEFAULT_TTL_DAYS);
    }
  }, [open]);

  const ttl = Number.isInteger(ttlDays) && ttlDays >= 1 && ttlDays <= 30 ? ttlDays : DEFAULT_TTL_DAYS;

  const submit = async () => {
    setSubmitting(true);
    setOutcome(null);
    setCreated(null);
    try {
      if (delivery === 'SEND') {
        const result = await sendInstallmentPaymentLink(tenantId, installmentId, ttl);
        setOutcome(
          result.sent
            ? { type: 'success', text: sentText(result) }
            : { type: 'warning', text: notSentText(result.reason) }
        );
        if (result.sent) onChanged?.();
      } else {
        setCreated(await createInstallmentPaymentLinkToCopy(tenantId, installmentId, ttl));
        onChanged?.();
      }
    } catch (e: any) {
      message.error(errorText(e, t('Échec de la création du lien de paiement')));
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
      title={periodLabel ? t('Lien de paiement · échéance {{value}}', { value: periodLabel }) : t('Lien de paiement')}
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
              amount: formatMoney(created.amountDue, { currency: created.currency }),
              date: new Date(created.expiresAt).toLocaleString(activeLocale())
            })}
          </Paragraph>
        </Space>
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            {t(
              'Le locataire paie le reste dû par Mobile Money. Le montant est recalculé au moment du paiement et n’apparaît pas dans le lien.'
            )}
          </Paragraph>
          <Radio.Group value={delivery} onChange={e => setDelivery(e.target.value)}>
            <Space direction="vertical">
              <Radio value="SEND">{t('Envoyer au locataire (WhatsApp ou e-mail)')}</Radio>
              <Radio value="COPY">{t('Copier le lien')}</Radio>
            </Space>
          </Radio.Group>
          <div>
            <label htmlFor="lien-paiement-duree">{t('Durée de validité (jours)')}</label>
            <div>
              <InputNumber
                id="lien-paiement-duree"
                min={1}
                max={30}
                precision={0}
                value={ttlDays}
                onChange={v => setTtlDays(typeof v === 'number' ? v : DEFAULT_TTL_DAYS)}
              />
            </div>
          </div>
          {outcome ? <Alert type={outcome.type} showIcon message={outcome.text} /> : null}
        </Space>
      )}
    </Modal>
  );
};

export interface InstallmentPaymentLinkButtonProps {
  tenantId: string;
  installmentId: string;
  /** Reste à payer de l'échéance ; le bouton disparaît quand elle est soldée. */
  remaining: number;
  /** Statut de l'échéance ; une échéance annulée n'offre pas de lien. */
  status?: string | null;
  /** Droit de création de paiement locatif (`RENTAL_PAYMENTS_CREATE`) ; vrai par défaut, l'API reste l'autorité. */
  canCreate?: boolean;
  onChanged?: () => void;
  periodLabel?: string;
  size?: 'small' | 'middle' | 'large';
}

/** Bouton « Envoyer un lien de paiement » ouvrant la fenêtre de création. */
export const InstallmentPaymentLinkButton: React.FC<InstallmentPaymentLinkButtonProps> = ({
  tenantId,
  installmentId,
  remaining,
  status,
  canCreate = true,
  onChanged,
  periodLabel,
  size
}) => {
  const [open, setOpen] = useState(false);
  if (!canCreate || !canOfferPaymentLink(remaining, status)) return null;
  return (
    <>
      <Button icon={<LinkOutlined />} size={size} onClick={() => setOpen(true)}>
        {t('Envoyer un lien de paiement')}
      </Button>
      {/* Démonté à la fermeture : l'URL en clair ne survit pas dans le DOM. */}
      {open && (
        <InstallmentPaymentLinkModal
          tenantId={tenantId}
          installmentId={installmentId}
          open
          onClose={() => setOpen(false)}
          onChanged={onChanged}
          periodLabel={periodLabel}
        />
      )}
    </>
  );
};
