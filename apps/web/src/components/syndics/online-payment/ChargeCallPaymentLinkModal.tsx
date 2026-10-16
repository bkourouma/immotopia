import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Input, InputNumber, Modal, Radio, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ConfirmAction, formatMoney } from '../../primitives';
import {
  ChargeCallPaymentLinkSummary,
  CreateChargeCallPaymentLinkResult,
  createChargeCallPaymentLink,
  listChargeCallPaymentLinks,
  revokeChargeCallPaymentLink
} from '../../../services/syndic-online-payment-service';
import type { ChargeCall } from '../../../types/syndic-types';
import { displayCurrency } from '../../../utils/syndic-currency';
import { copyToClipboard } from '../../../utils/copy-to-clipboard';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { apiErrorMessage, statusLabel } from './helpers';

const { Paragraph, Text } = Typography;

export const DEFAULT_LINK_TTL_DAYS = 7;

type Delivery = 'SEND' | 'COPY';
type NotSentReason = 'NO_ELIGIBLE_CHANNEL' | 'EVENT_DISABLED' | 'SEND_FAILED' | 'RECIPIENT_NOT_FOUND';
type CopyResult = Extract<CreateChargeCallPaymentLinkResult, { url: string }>;
type Outcome = { type: 'success' | 'warning' | 'error'; text: string } | null;

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString(activeLocale()) : '—';
}

function notSentText(reason: NotSentReason): string {
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
      return t('Fiche du copropriétaire introuvable : impossible de lui envoyer le lien.');
  }
}

function sentText(channel: 'EMAIL' | 'WHATSAPP'): string {
  return channel === 'WHATSAPP' ? t('Lien de paiement envoyé par WhatsApp.') : t('Lien de paiement envoyé par e-mail.');
}

const LINK_STATUS: Record<ChargeCallPaymentLinkSummary['status'], { color: string; label: () => string }> = {
  ACTIVE: { color: 'success', label: () => t('Actif') },
  EXPIRED: { color: 'default', label: () => t('Expiré') },
  REVOKED: { color: 'default', label: () => t('Révoqué') }
};

export interface ChargeCallPaymentLinkModalProps {
  tenantId: string;
  syndicId: string;
  /** Appel visé : un lien = un appel. */
  charge: Pick<ChargeCall, 'id' | 'period'>;
  open: boolean;
  /** `SYNDIC_EDIT` : créer, envoyer et révoquer. Sans lui, la liste reste consultable (`SYNDIC_VIEW`). */
  canEdit: boolean;
  onClose: () => void;
}

/**
 * Lien « Payer cet appel » d'un appel de charges (spec 042, contrat §1.10) :
 * le gestionnaire le copie ou l'envoie au copropriétaire (e-mail, WhatsApp),
 * voit les liens de l'appel et les révoque.
 *
 * L'URL (jeton en clair) n'est renvoyée qu'UNE fois : elle vit uniquement dans
 * l'état de cette fenêtre, que l'appelant démonte à la fermeture.
 */
export const ChargeCallPaymentLinkModal: React.FC<ChargeCallPaymentLinkModalProps> = ({
  tenantId,
  syndicId,
  charge,
  open,
  canEdit,
  onClose
}) => {
  const { message } = App.useApp();
  const [delivery, setDelivery] = useState<Delivery>('SEND');
  const [ttlDays, setTtlDays] = useState<number>(DEFAULT_LINK_TTL_DAYS);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [created, setCreated] = useState<CopyResult | null>(null);

  const [links, setLinks] = useState<ChargeCallPaymentLinkSummary[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLinksLoading(true);
    setLinksError(null);
    try {
      setLinks(await listChargeCallPaymentLinks(tenantId, syndicId, charge.id));
    } catch (error) {
      setLinksError(apiErrorMessage(error, t('Impossible de charger les liens de paiement')));
    } finally {
      setLinksLoading(false);
    }
  }, [tenantId, syndicId, charge.id]);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  // L'URL à jeton ne survit ni à la fermeture, ni à un changement d'appel ou de copropriété.
  useEffect(() => {
    setCreated(null);
    setOutcome(null);
  }, [open, tenantId, syndicId, charge.id]);

  const ttl = Number.isInteger(ttlDays) && ttlDays >= 1 && ttlDays <= 30 ? ttlDays : DEFAULT_LINK_TTL_DAYS;

  const submit = async () => {
    setSubmitting(true);
    setOutcome(null);
    setCreated(null);
    try {
      const result = await createChargeCallPaymentLink(tenantId, syndicId, charge.id, { delivery, ttlDays: ttl });
      if ('url' in result) {
        setCreated(result);
      } else if (result.sent) {
        setOutcome({ type: 'success', text: sentText(result.channel) });
      } else {
        setOutcome({ type: 'warning', text: notSentText(result.reason) });
      }
      // Un lien a pu être créé (copie ou envoi réussi) : la liste doit le refléter.
      if ('url' in result || result.sent) await reload();
    } catch (error) {
      setOutcome({ type: 'error', text: apiErrorMessage(error, t('Échec de la création du lien de paiement')) });
    } finally {
      setSubmitting(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    if (await copyToClipboard(created.url)) message.success(t('Lien de paiement copié dans le presse-papiers.'));
    else message.warning(t('Copie impossible : sélectionnez le lien et copiez-le manuellement.'));
  };

  const revoke = async (linkId: string) => {
    setRevokingId(linkId);
    try {
      await revokeChargeCallPaymentLink(tenantId, syndicId, charge.id, linkId);
      message.success(t('Lien révoqué.'));
      await reload();
    } catch (error) {
      message.error(apiErrorMessage(error, t('Échec de la révocation du lien')));
    } finally {
      setRevokingId(null);
    }
  };

  const visibleLinks = showAll ? links : links.filter(link => link.status === 'ACTIVE');

  const columns: ColumnsType<ChargeCallPaymentLinkSummary> = [
    { title: t('Créé le'), dataIndex: 'createdAt', key: 'createdAt', render: (value: string) => formatDateTime(value) },
    {
      title: t('Expire le'),
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (value: string) => formatDateTime(value)
    },
    {
      title: t('Origine'),
      key: 'origin',
      render: (_: unknown, link) => (link.createdByUserId ? t('Gestionnaire') : t('Joint à un avis ou une relance'))
    },
    {
      title: t('Consultations'),
      dataIndex: 'viewCount',
      key: 'viewCount',
      align: 'end',
      render: (value: number) => value.toLocaleString(activeLocale())
    },
    {
      title: t('Paiement'),
      key: 'payment',
      render: (_: unknown, link) =>
        link.payment.status === 'NONE' ? <Text type="secondary">—</Text> : <Tag>{statusLabel(link.payment.status)}</Tag>
    },
    {
      title: t('Statut'),
      key: 'status',
      render: (_: unknown, link) => <Tag color={LINK_STATUS[link.status].color}>{LINK_STATUS[link.status].label()}</Tag>
    },
    ...(canEdit
      ? [
          {
            title: '',
            key: 'actions',
            align: 'end' as const,
            render: (_: unknown, link: ChargeCallPaymentLinkSummary) =>
              link.status === 'ACTIVE' ? (
                <ConfirmAction
                  title={t('Révoquer ce lien de paiement ?')}
                  description={t('Le copropriétaire ne pourra plus payer cet appel avec ce lien.')}
                  okText={t('Révoquer')}
                  cancelText={t('Annuler')}
                  danger
                  onConfirm={() => revoke(link.id)}
                >
                  <Button size="small" danger loading={revokingId === link.id}>
                    {t('Révoquer')}
                  </Button>
                </ConfirmAction>
              ) : null
          }
        ]
      : [])
  ];

  const createdAmount = created ? formatMoney(created.amountDue, { currency: displayCurrency(created.currency) }) : '';

  return (
    <Modal
      open={open}
      onCancel={onClose}
      destroyOnHidden
      // Un clic à côté pendant que l'URL est affichée la perdrait : le lien resterait actif sans que personne
      // n'en connaisse le jeton. La croix et « Fermer » restent disponibles.
      mask={{ closable: !created }}
      width={760}
      title={t('Lien de paiement · appel {{period}}', { period: charge.period })}
      footer={
        <Button type="primary" onClick={onClose}>
          {t('Fermer')}
        </Button>
      }
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {canEdit ? (
          created ? (
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <Alert
                type="warning"
                showIcon
                title={t('Ce lien ne sera plus affiché après la fermeture de cette fenêtre.')}
              />
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  readOnly
                  dir="ltr"
                  value={created.url}
                  aria-label={t('Lien de paiement')}
                  onFocus={event => event.target.select()}
                />
                <Button type="primary" onClick={() => void copy()}>
                  {t('Copier')}
                </Button>
              </Space.Compact>
              <Paragraph type="secondary" style={{ margin: 0 }}>
                {t('Montant dû : {{amount}} — expire le {{date}}', {
                  amount: createdAmount,
                  date: formatDateTime(created.expiresAt)
                })}
              </Paragraph>
              <div>
                <Button onClick={() => setCreated(null)}>{t('Créer un autre lien')}</Button>
              </div>
            </Space>
          ) : (
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <Paragraph type="secondary" style={{ margin: 0 }}>
                {t(
                  'Le copropriétaire paie le reste dû de cet appel par Mobile Money, sans se connecter. Le montant est recalculé au moment du paiement et n’apparaît pas dans le lien.'
                )}
              </Paragraph>
              <Radio.Group value={delivery} onChange={event => setDelivery(event.target.value)}>
                <Space orientation="vertical">
                  <Radio value="SEND">{t('Envoyer au copropriétaire (WhatsApp ou e-mail)')}</Radio>
                  <Radio value="COPY">{t('Copier le lien')}</Radio>
                </Space>
              </Radio.Group>
              <div>
                <label htmlFor="lien-appel-duree">{t('Durée de validité (jours)')}</label>
                <div>
                  <InputNumber
                    id="lien-appel-duree"
                    min={1}
                    max={30}
                    precision={0}
                    value={ttlDays}
                    onChange={value => setTtlDays(typeof value === 'number' ? value : DEFAULT_LINK_TTL_DAYS)}
                  />
                </div>
              </div>
              {outcome ? <Alert type={outcome.type} showIcon title={outcome.text} /> : null}
              <div>
                <Button type="primary" loading={submitting} onClick={() => void submit()}>
                  {delivery === 'SEND' ? t('Envoyer le lien') : t('Créer le lien')}
                </Button>
              </div>
            </Space>
          )
        ) : (
          <Alert
            type="info"
            showIcon
            title={t('Vous pouvez consulter les liens de cet appel, mais pas en créer ni en révoquer.')}
          />
        )}

        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {t('Liens de cet appel')}
          </Typography.Title>
          <Space>
            <Switch id="liens-historique" checked={showAll} onChange={setShowAll} />
            <label htmlFor="liens-historique">{t('Afficher aussi les liens expirés et révoqués')}</label>
          </Space>
        </Space>
        {linksError ? (
          <Alert
            type="error"
            showIcon
            title={linksError}
            action={
              <Button size="small" onClick={() => void reload()}>
                {t('Réessayer')}
              </Button>
            }
          />
        ) : null}
        <Table<ChargeCallPaymentLinkSummary>
          rowKey="id"
          size="small"
          loading={linksLoading}
          columns={columns}
          dataSource={visibleLinks}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: showAll ? t('Aucun lien pour cet appel.') : t('Aucun lien actif.') }}
        />
      </Space>
    </Modal>
  );
};

export default ChargeCallPaymentLinkModal;
