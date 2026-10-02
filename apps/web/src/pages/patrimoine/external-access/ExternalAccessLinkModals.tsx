import React, { useState } from 'react';
import { Alert, App, Button, Checkbox, Form, InputNumber, Modal, Space, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { sendExternalAccessLink } from '../../../services/external-access-service';
import type {
  ExternalAccessEmailResult,
  ExternalAccessGrantSummary,
  ExternalAccessLink
} from '../../../types/external-access';
import { apiErrorMessage } from '../../../components/patrimoine/patrimoine-labels';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { emailOutcomeMessage } from './external-access-labels';

const { Paragraph, Text } = Typography;

/** Lien fraîchement émis : l'URL n'est connue que de cet écran, et une seule fois. */
export interface RevealedLink {
  recipientName: string;
  link: ExternalAccessLink;
  email: ExternalAccessEmailResult;
}

/** Copie dans le presse-papiers ; `false` si le navigateur refuse. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface RevealProps {
  revealed: RevealedLink | null;
  onClose: () => void;
}

/**
 * Affiche l'URL d'un accès UNE seule fois, avec un bouton « Copier ». Fermée, la
 * fenêtre n'en garde aucune trace : l'URL n'existe plus nulle part côté agence.
 */
export const ExternalAccessLinkReveal: React.FC<RevealProps> = ({ revealed, onClose }) => {
  const { message } = App.useApp();

  const handleCopy = async () => {
    if (!revealed) return;
    if (await copyToClipboard(revealed.link.url)) message.success(t('Lien copié.'));
    else message.error(t('Copie impossible : sélectionnez le lien et copiez-le à la main.'));
  };

  // Monté seulement tant qu'un lien est à montrer : fermé, plus rien de l'URL ne reste dans la page.
  if (!revealed) return null;

  return (
    <Modal
      open
      title={t('Lien d’accès')}
      onCancel={onClose}
      destroyOnHidden
      mask={{ closable: false }}
      footer={
        <Button type="primary" onClick={onClose}>
          {t('J’ai copié le lien, fermer')}
        </Button>
      }
    >
      {revealed ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            title={t(
              'Ce lien ne sera plus affiché. Copiez-le maintenant : vous pourrez toujours en renvoyer un nouveau.'
            )}
          />
          <Text>{emailOutcomeMessage(revealed.email, revealed.recipientName)}</Text>
          <Paragraph
            data-testid="external-access-url"
            code
            style={{ wordBreak: 'break-all', marginBottom: 0 }}
            // Une URL est toujours lue de gauche à droite, même dans une interface arabe.
            dir="ltr"
          >
            {revealed.link.url}
          </Paragraph>
          <Button icon={<CopyOutlined />} onClick={handleCopy}>
            {t('Copier le lien')}
          </Button>
          <Text type="secondary">
            {t('Ce lien est valable jusqu’au {{date}}.', {
              date: new Date(revealed.link.expiresAt).toLocaleString(activeLocale())
            })}
          </Text>
        </Space>
      ) : null}
    </Modal>
  );
};

interface SendProps {
  tenantId: string;
  grant: ExternalAccessGrantSummary | null;
  maxLinkTtlDays: number;
  onClose: () => void;
  /** L'agence a émis un lien : à elle de l'afficher. */
  onSent: (revealed: RevealedLink) => void;
}

/** « Renvoyer un lien » : durée du lien, révocation des anciens liens, envoi par e-mail. */
export const ExternalAccessSendLinkModal: React.FC<SendProps> = ({
  tenantId,
  grant,
  maxLinkTtlDays,
  onClose,
  onSent
}) => {
  const { message } = App.useApp();
  const [ttl, setTtl] = useState<number>(Math.min(7, maxLinkTtlDays));
  const [revokePrevious, setRevokePrevious] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleOk = async () => {
    if (!grant) return;
    setSubmitting(true);
    try {
      const result = await sendExternalAccessLink(tenantId, grant.id, {
        linkTtlDays: ttl,
        revokePreviousLinks: revokePrevious,
        sendEmail
      });
      onSent({ recipientName: grant.recipientName, link: result.link, email: result.email });
    } catch (error) {
      message.error(apiErrorMessage(error, t('Impossible d’émettre un nouveau lien.')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={grant !== null}
      title={t('Renvoyer un lien')}
      onCancel={onClose}
      onOk={handleOk}
      okText={t('Générer le lien')}
      cancelText={t('Annuler')}
      confirmLoading={submitting}
      destroyOnHidden
    >
      {grant ? (
        <Form layout="vertical">
          <Paragraph>{t('Un nouveau lien d’accès sera émis pour {{name}}.', { name: grant.recipientName })}</Paragraph>
          <Form.Item label={t('Durée de validité du lien (jours)')}>
            <InputNumber
              min={1}
              max={Math.max(1, maxLinkTtlDays)}
              value={ttl}
              onChange={value => setTtl(typeof value === 'number' ? value : ttl)}
              aria-label={t('Durée de validité du lien (jours)')}
            />
          </Form.Item>
          <Form.Item>
            <Checkbox checked={sendEmail} onChange={event => setSendEmail(event.target.checked)}>
              {t('Envoyer le lien par e-mail au bénéficiaire')}
            </Checkbox>
          </Form.Item>
          <Form.Item>
            <Checkbox checked={revokePrevious} onChange={event => setRevokePrevious(event.target.checked)}>
              {t('Révoquer les liens précédents')}
            </Checkbox>
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  );
};
