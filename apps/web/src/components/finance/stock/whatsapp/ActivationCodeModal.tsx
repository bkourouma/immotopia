import React from 'react';
import { Alert, App, Button, Modal, Space, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { RegistrationWithCode } from '../../../../types/finance-stock-whatsapp-types';
import { t } from '../../../../i18n/t';
import { formatDateTime } from './whatsapp-labels';

export interface ActivationCodeModalProps {
  /**
   * L'inscription telle que la création ou la régénération l'a rendue. Le
   * parent la garde le temps de l'affichage et l'oublie à la fermeture : le
   * code n'est relisible nulle part ailleurs (ecrans §0.4).
   */
  registration: RegistrationWithCode | null;
  /** Numéro du bot de la vue d'ensemble, si l'inscription n'en porte pas. */
  fallbackBotNumber?: string | null;
  onClose: () => void;
}

/** « 482913 » → « 482 913 ». */
function groupCode(code: string): string {
  const chiffres = code.replace(/\s+/g, '');
  return chiffres.length === 6 ? `${chiffres.slice(0, 3)} ${chiffres.slice(3)}` : chiffres;
}

/**
 * Affichage UNIQUE du code d'activation (ecrans §5.2). Fermer la fenêtre le
 * perd ; l'écran le dit et renvoie vers « Régénérer le code ».
 */
export const ActivationCodeModal: React.FC<ActivationCodeModalProps> = ({
  registration,
  fallbackBotNumber,
  onClose
}) => {
  const { message } = App.useApp();
  const open = Boolean(registration);
  const code = registration?.activationCode ?? '';
  const botNumber = registration?.botNumber ?? fallbackBotNumber ?? null;
  const numeroAffiche = botNumber ?? t('numéro WhatsApp d’ImmoTopia');
  const consigne = t('Ouvrez WhatsApp, écrivez au {{botNumber}} et envoyez ce code : {{code}}.', {
    botNumber: numeroAffiche,
    code
  });

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(consigne);
      message.success(t('Consigne copiée'));
    } catch {
      message.error(t('La copie a échoué.'));
    }
  };

  // Démonté dès la fermeture, sans animation de sortie : le code ne reste pas
  // un instant de plus dans la page.
  if (!registration) return null;

  return (
    <Modal
      open={open}
      title={t('Code d’activation')}
      onCancel={onClose}
      footer={[
        <Button key="fermer" type="primary" onClick={onClose}>
          {t('Fermer')}
        </Button>
      ]}
      destroyOnHidden
      maskClosable={false}
    >
      {registration && (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Text>{t('Chef de chantier : {{name}}', { name: registration.userLabel })}</Typography.Text>
          <div
            data-testid="activation-code"
            aria-label={t('Code d’activation')}
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 40,
              letterSpacing: 4,
              textAlign: 'center',
              padding: '12px 0',
              borderRadius: 8,
              background: 'var(--surface-sunken, #f5f5f5)'
            }}
          >
            {groupCode(code)}
          </div>
          <Typography.Text>{t('Numéro du bot : {{botNumber}}', { botNumber: numeroAffiche })}</Typography.Text>
          <Typography.Text type="secondary">
            {registration.activationExpiresAt
              ? t('Valable 72 heures (jusqu’au {{date}}), 5 essais.', {
                  date: formatDateTime(registration.activationExpiresAt)
                })
              : t('Valable 72 heures, 5 essais.')}
          </Typography.Text>
          <div>
            <Typography.Paragraph style={{ marginBlockEnd: 8 }}>{consigne}</Typography.Paragraph>
            <Button icon={<CopyOutlined />} onClick={() => void copier()}>
              {t('Copier la consigne')}
            </Button>
          </div>
          <Alert
            type="warning"
            showIcon
            title={t('Ce code ne sera plus affiché. Notez-le ou régénérez-en un plus tard.')}
          />
        </Space>
      )}
    </Modal>
  );
};

export default ActivationCodeModal;
