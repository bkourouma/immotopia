import React from 'react';
import { Tooltip, Typography } from 'antd';
import { t } from '../../../i18n/t';

const { Text } = Typography;

/** « N avis non envoyé(s) », avec la remarque de l'exécution en infobulle quand il y en a une. */
export function NotificationsSkipped({ count, notes }: { count: number; notes: string | null }) {
  if (!count) return <>—</>;
  const label = t('{{count}} avis non envoyé(s)', { count });
  return notes ? (
    <Tooltip title={notes}>
      <Text type="warning" style={{ textDecoration: 'underline dotted', cursor: 'help' }}>
        {label}
      </Text>
    </Tooltip>
  ) : (
    <Text type="warning">{label}</Text>
  );
}
