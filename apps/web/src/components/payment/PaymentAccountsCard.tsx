import React, { useState } from 'react';
import { Alert, Button, Card, Space, Typography } from 'antd';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import { t } from '../../i18n/t';
import { feedback } from '../../lib/feedback';
import type { ReceivingAccountPublic } from '../../services/receiving-account-service';
import { ReceivingAccountQr } from './ReceivingAccountQr';

const { Text, Paragraph } = Typography;

const TOUCH_TARGET = 40;

export interface PaymentAccountsCardProps {
  accounts: ReceivingAccountPublic[];
  /** Motif à recopier, composé par l'écran avec ses données déjà chargées (ex. « Loyer janvier — Appartement 3 »). */
  suggestedReason?: string | null;
  /** Ouvre ou fait défiler vers le formulaire de déclaration existant ; absent : pas de bouton. */
  onDeclare?: () => void;
  /** Nom de l'agence ou de la copropriété, ajouté au titre. */
  subjectName?: string;
}

function CopyButton({ text, label, ariaLabel }: { text: string; label: string; ariaLabel: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      feedback.success(t('Copié'));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      feedback.error(t('Copie impossible, recopiez le texte à la main.'));
    }
  };

  return (
    <Button
      icon={copied ? <CheckOutlined aria-hidden /> : <CopyOutlined aria-hidden />}
      style={{ minHeight: TOUCH_TARGET }}
      aria-label={ariaLabel}
      onClick={() => void copy()}
    >
      {copied ? t('Copié') : label}
    </Button>
  );
}

function AccountBlock({ account }: { account: ReceivingAccountPublic }) {
  return (
    <div
      role="group"
      aria-label={account.institution}
      style={{
        border: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
        borderRadius: 8,
        padding: 12
      }}
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Text strong style={{ fontSize: 16 }}>
          {account.institution}
        </Text>
        {account.scannableWith ? (
          <Text type="secondary">{t('À scanner avec : {{apps}}', { apps: account.scannableWith })}</Text>
        ) : null}

        {account.hasQr && account.qrPath ? (
          <ReceivingAccountQr qrPath={account.qrPath} institution={account.institution} />
        ) : null}

        {account.alias ? (
          <div>
            <Text type="secondary">{t('Alias à saisir')}</Text>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                margin: '2px 0 6px',
                overflowWrap: 'anywhere',
                direction: 'ltr',
                unicodeBidi: 'isolate'
              }}
              dir="ltr"
            >
              {account.alias}
            </div>
            <CopyButton
              text={account.alias}
              label={t("Copier l'alias")}
              ariaLabel={t("Copier l'alias {{institution}}", { institution: account.institution })}
            />
          </div>
        ) : null}

        <div>
          <Text type="secondary">{t('Nom attendu du bénéficiaire')} : </Text>
          <Text strong>{account.holderName}</Text>
        </div>

        {account.instructions ? (
          <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{account.instructions}</div>
        ) : null}
      </Space>
    </div>
  );
}

/**
 * Coordonnées de paiement de l'agence ou de la copropriété (spec 048, lot Q).
 * ImmoTopia ne génère aucun QR et ne préremplit aucun montant : le payeur
 * saisit lui-même le montant dans son application, puis déclare son paiement.
 * Tous les textes venant de l'agence sont rendus en texte brut. Rien n'est
 * affiché s'il n'y a aucun compte.
 */
export function PaymentAccountsCard({
  accounts,
  suggestedReason,
  onDeclare,
  subjectName
}: PaymentAccountsCardProps): React.ReactElement | null {
  if (accounts.length === 0) return null;

  const title = subjectName ? `${t('Payer l’agence')} — ${subjectName}` : t('Payer l’agence');
  const reason = suggestedReason?.trim() ? suggestedReason.trim() : null;

  return (
    <Card title={title} extra={<Text type="secondary">{t('Coordonnées de paiement')}</Text>}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {accounts.map(account => (
          <AccountBlock key={account.id} account={account} />
        ))}

        <div>
          <Text strong>{t('Comment payer')}</Text>
          <ol style={{ margin: '4px 0 0', paddingInlineStart: 20 }}>
            <li>{t('Ouvrez votre application de paiement ou de banque.')}</li>
            <li>{t('Choisissez de scanner le QR ou de saisir l’alias.')}</li>
            <li>{t('Saisissez vous-même le montant à payer.')}</li>
            <li>{t('Vérifiez que le nom affiché correspond au nom attendu du bénéficiaire.')}</li>
            <li>{t('Validez le paiement.')}</li>
          </ol>
        </div>

        <Alert
          type="warning"
          showIcon
          message={t('Avant de payer')}
          description={
            <ul style={{ margin: 0, paddingInlineStart: 20 }}>
              <li>{t('Un paiement instantané est irrévocable : il ne peut pas être annulé.')}</li>
              <li>{t('Si le nom affiché diffère du nom attendu, ne payez pas.')}</li>
              <li>{t('Après votre paiement, prévenez l’agence en déclarant votre paiement.')}</li>
            </ul>
          }
        />

        {reason ? (
          <div>
            <Text type="secondary">{t('Motif suggéré à recopier')}</Text>
            <Paragraph style={{ margin: '2px 0 6px', overflowWrap: 'anywhere' }} strong>
              {reason}
            </Paragraph>
            <CopyButton text={reason} label={t('Copier le motif')} ariaLabel={t('Copier le motif de paiement')} />
          </div>
        ) : null}

        {onDeclare ? (
          <Button type="primary" style={{ minHeight: TOUCH_TARGET }} onClick={onDeclare}>
            {t('J’ai payé : déclarer mon paiement')}
          </Button>
        ) : null}
      </Space>
    </Card>
  );
}

export default PaymentAccountsCard;
