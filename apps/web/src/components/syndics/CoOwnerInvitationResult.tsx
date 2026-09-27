import React from 'react';
import { Alert, Button, Input, Space, Tag, Typography } from 'antd';
import { CheckCircleFilled, CopyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { t } from '../../i18n/t';
import { feedback } from '../../lib/feedback';
import type { CoOwnerPortalInvitation } from '../../types/syndic-types';

const { Title, Text } = Typography;

/**
 * `<CoOwnerInvitationResult>` — ce qu'affiche « Inviter au portail » sur la
 * fiche propriétaire d'un lot, sur le modèle de `<TenantCreatedResult>` (création
 * d'agence) : le lien reste affiché et copiable même quand l'e-mail est
 * parti — il peut atterrir en spam, et le gestionnaire le transmet souvent
 * plus vite lui-même (WhatsApp personnel, remise en main propre).
 */
export const CoOwnerInvitationResult: React.FC<{ invitation: CoOwnerPortalInvitation }> = ({ invitation }) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(invitation.invitationUrl);
      feedback.success(t('Lien copié.'));
    } catch {
      feedback.error(t('Impossible de copier le lien — copiez-le manuellement.'));
    }
  };

  const isActivation = invitation.accountStatus !== 'EXISTING_ACCOUNT';

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Alert
        type="success"
        showIcon
        icon={<CheckCircleFilled />}
        message={t('Accès au portail ouvert')}
        description={t('{{name}} ({{email}}) peut consulter {{count}} lot(s) en lecture seule.', {
          name: invitation.contactName,
          email: invitation.email,
          count: invitation.openedLots
        })}
      />

      <div>
        <Space wrap style={{ marginBottom: 8 }}>
          <Title level={5} style={{ margin: 0 }}>
            {isActivation ? t("Lien d'invitation") : t('Lien de connexion')}
          </Title>
          {invitation.accountStatus === 'EXISTING_ACCOUNT' ? <Tag color="blue">{t('Compte existant')}</Tag> : null}
        </Space>
        <Space.Compact style={{ width: '100%' }}>
          <Input readOnly value={invitation.invitationUrl} aria-label={t("Lien d'invitation")} />
          <Button icon={<CopyOutlined />} onClick={() => void handleCopy()}>
            {t('Copier')}
          </Button>
        </Space.Compact>
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          {isActivation
            ? t('Le copropriétaire définit son mot de passe avec ce lien, valable jusqu’au {{date}}.', {
                date: invitation.expiresAt ? dayjs(invitation.expiresAt).format('DD/MM/YYYY') : '—'
              })
            : t(
                'Ce contact a déjà un compte ImmoTopia : il se connecte avec son adresse e-mail et son mot de passe habituels (« Mot de passe oublié » au besoin).'
              )}
        </Text>
      </div>

      {invitation.emailSent ? (
        <Text type="secondary">{t("E-mail d'invitation envoyé.")}</Text>
      ) : (
        <Alert
          type="warning"
          showIcon
          message={t("L'e-mail n'a pas pu être envoyé — copiez le lien et transmettez-le vous-même.")}
        />
      )}
    </Space>
  );
};
