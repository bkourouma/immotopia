import { PhoneNumber } from '../../primitives';
import React from 'react';
import { Button, Card, Space, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { t } from '../../../i18n/t';
import { feedback } from '../../../lib/feedback';
import type { ReceivingNumber } from '../../../services/coowner-portal-service';
import { formatPhoneForDisplay, operatorLabel } from './labels';

/**
 * Numéros de réception mobile money d'une copropriété (spec 047, étape 1 du
 * parcours « J'ai payé par mobile money »). Le texte de la consigne est rendu
 * en texte brut : jamais de HTML issu du syndic.
 */

export interface ReceivingNumbersCardProps {
  numbers: ReceivingNumber[];
  payerInstructions: string | null;
  syndicateName?: string;
  extra?: React.ReactNode;
}

const TOUCH_TARGET = 40;

/** « +2250707070707 » donne « 0707070707 » ; tout autre motif est copié tel quel. */
function nationalNumber(e164: string): string {
  const match = /^\+225(\d{10})$/.exec(e164);
  return match ? match[1] : e164;
}

async function copyText(text: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    feedback.success(successMessage);
  } catch {
    feedback.error(t('Copie impossible, recopiez le numéro à la main.'));
  }
}

export function ReceivingNumbersCard({
  numbers,
  payerInstructions,
  syndicateName,
  extra
}: ReceivingNumbersCardProps): React.ReactElement | null {
  const active = numbers.filter(n => n.isActive !== false);
  if (active.length === 0) return null;

  const instructions = payerInstructions?.trim() ? payerInstructions : null;
  const title = syndicateName
    ? `${t('Numéros pour payer par mobile money')} — ${syndicateName}`
    : t('Numéros pour payer par mobile money');

  return (
    <Card title={title}>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          {t('Faites votre transfert depuis votre téléphone vers l’un de ces numéros, puis déclarez-le ici.')}
        </Typography.Paragraph>

        {active.map(n => (
          <div
            key={n.id}
            style={{
              border: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
              borderRadius: 8,
              padding: 12
            }}
          >
            <Typography.Text strong>{operatorLabel(n.operator)}</Typography.Text>
            {n.label ? <Typography.Text type="secondary"> · {n.label}</Typography.Text> : null}
            <div style={{ fontSize: 22, fontWeight: 600, margin: '4px 0', overflowWrap: 'anywhere' }}>
              <PhoneNumber value={formatPhoneForDisplay(n.phoneNumber)} />
            </div>
            <div style={{ marginBottom: 8 }}>
              {t('Titulaire :')} {n.holderName}
            </div>
            <Button
              icon={<CopyOutlined />}
              style={{ minHeight: TOUCH_TARGET }}
              onClick={() => void copyText(nationalNumber(n.phoneNumber), t('Numéro copié'))}
            >
              {t('Copier le numéro')}
            </Button>
          </div>
        ))}

        {instructions ? (
          <div
            style={{
              background: 'var(--ant-color-fill-quaternary, #fafafa)',
              borderRadius: 8,
              padding: 12
            }}
          >
            <Typography.Text strong>{t('Consigne du syndic')}</Typography.Text>
            <div style={{ whiteSpace: 'pre-wrap', margin: '4px 0 8px', overflowWrap: 'anywhere' }}>{instructions}</div>
            <Button
              icon={<CopyOutlined />}
              style={{ minHeight: TOUCH_TARGET }}
              onClick={() => void copyText(instructions, t('Consigne copiée'))}
            >
              {t('Copier la consigne')}
            </Button>
          </div>
        ) : null}

        {extra ? (
          <Space wrap style={{ width: '100%' }}>
            {extra}
          </Space>
        ) : null}
      </Space>
    </Card>
  );
}

export default ReceivingNumbersCard;
