import React from 'react';
import { App, Button, Card, Space, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { PhoneNumber } from '../../primitives';
import { t } from '../../../i18n/t';

import type { DeclarePaymentReceivingNumber } from '../../../types/rental-declared-payment';
import { formatPhoneForDisplay, operatorLabel } from './labels';

/**
 * Numéros de réception mobile money de l'agence (spec 049, étape 1 du parcours
 * « J'ai payé par mobile money »). La consigne de l'agence est rendue en texte
 * brut : jamais de HTML issu de l'agence.
 */

export interface ReceivingNumbersCardProps {
  numbers: DeclarePaymentReceivingNumber[];
  /** Texte d'aide libre de l'agence (peut être null). */
  instructions: string | null;
  extra?: React.ReactNode;
  /** Sans cadre ni titre quand la carte est posée dans une fenêtre. */
  bordered?: boolean;
}

const TOUCH_TARGET = 40;

/** « +2250707070707 » donne « 0707070707 » ; tout autre motif est copié tel quel. */
function nationalNumber(e164: string): string {
  const match = /^\+225(\d{10})$/.exec(e164);
  return match ? match[1] : e164;
}

async function copyText(
  text: string,
  successMessage: string,
  message: ReturnType<typeof App.useApp>['message']
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    message.success(successMessage);
  } catch {
    message.error(t('Copie impossible, recopiez le numéro à la main.'));
  }
}

export function ReceivingNumbersCard({
  numbers,
  instructions,
  extra,
  bordered = true
}: ReceivingNumbersCardProps): React.ReactElement | null {
  const { message } = App.useApp();
  if (numbers.length === 0) return null;
  const consigne = instructions?.trim() ? instructions : null;

  return (
    <Card size="small" variant={bordered ? 'outlined' : 'borderless'} title={t('Numéros pour payer par mobile money')}>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          {t('Faites votre transfert depuis votre téléphone vers l’un de ces numéros, puis déclarez-le ici.')}
        </Typography.Paragraph>

        {numbers.map(n => (
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
              <PhoneNumber value={formatPhoneForDisplay(n.phone)} />
            </div>
            <Button
              icon={<CopyOutlined />}
              style={{ minHeight: TOUCH_TARGET }}
              onClick={() => void copyText(nationalNumber(n.phone), t('Numéro copié'), message)}
            >
              {t('Copier le numéro')}
            </Button>
          </div>
        ))}

        {consigne ? (
          <div
            style={{
              background: 'var(--ant-color-fill-quaternary, #fafafa)',
              borderRadius: 8,
              padding: 12
            }}
          >
            <Typography.Text strong>{t("Consigne de l'agence")}</Typography.Text>
            <div style={{ whiteSpace: 'pre-wrap', margin: '4px 0 8px', overflowWrap: 'anywhere' }}>{consigne}</div>
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
