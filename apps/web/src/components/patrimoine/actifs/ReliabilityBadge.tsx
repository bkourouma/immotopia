import React from 'react';
import { Tag, Tooltip } from 'antd';
import type { Reliability, ReliabilityReason } from '../../../services/patrimoine-assets-service';
import { t } from '../../../i18n/t';
import { reliabilityLabel, reliabilityReasonLabel } from './asset-classes';

const COLORS: Record<Reliability, string> = { HIGH: 'success', MEDIUM: 'warning', LOW: 'error' };

/**
 * Badge de fiabilité d'une valeur. Le niveau est toujours écrit en toutes
 * lettres (la couleur ne porte jamais seule le sens) ; les raisons calculées
 * par le serveur s'affichent en infobulle. `null` (valeur antérieure au lot 2)
 * se lit comme « Faible ».
 */
export const ReliabilityBadge: React.FC<{
  reliability: Reliability | null | undefined;
  reasons?: ReliabilityReason[];
}> = ({ reliability, reasons }) => {
  const level: Reliability = reliability ?? 'LOW';
  const keys: string[] = reasons && reasons.length > 0 ? reasons : reliability ? [] : ['METHOD_MANUAL_NO_SOURCE'];
  const tag = (
    <Tag color={COLORS[level]} tabIndex={keys.length > 0 ? 0 : undefined} style={{ marginInlineEnd: 0 }}>
      {reliabilityLabel(level)}
    </Tag>
  );
  if (keys.length === 0) return tag;
  return (
    <Tooltip
      title={
        <div>
          <strong>{t('Fiabilité')}</strong>
          <ul style={{ margin: 0, paddingInlineStart: 16 }}>
            {keys.map(key => (
              <li key={key}>{reliabilityReasonLabel(key)}</li>
            ))}
          </ul>
        </div>
      }
    >
      {tag}
    </Tooltip>
  );
};

/**
 * Pastille « Valeur périmée » (seuil de péremption de la classe, décidé par le
 * serveur). Jamais affichée pour un actif qui n'est pas `ACTIVE`, même si le
 * serveur la fournit.
 */
export const StaleTag: React.FC<{ status?: string }> = ({ status = 'ACTIVE' }) =>
  status === 'ACTIVE' ? (
    <Tag color="orange" style={{ marginInlineEnd: 0 }}>
      {t('Valeur périmée')}
    </Tag>
  ) : null;
