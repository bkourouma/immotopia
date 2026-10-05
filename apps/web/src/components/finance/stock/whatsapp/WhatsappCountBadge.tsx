import React from 'react';
import { WhatsAppOutlined } from '@ant-design/icons';
import { StatusTag } from '../../../primitives/StatusTag';
import type { CountCaptureLine, StockCountSource } from '../../../../types/finance-stock-whatsapp-types';
import { t } from '../../../../i18n/t';

export type WhatsappCountBadgeProps =
  /** À côté du statut de l'inventaire : « Ouvert par WhatsApp » si `source = WHATSAPP`. */
  | { variant: 'count'; source: StockCountSource | null | undefined }
  /** Dans la cellule de l'article d'une ligne (point d'extension du lot 040) : « WhatsApp » si la ligne a une capture. */
  | { variant: 'line'; line: CountCaptureLine | null | undefined };

/**
 * Pastilles de l'inventaire du lot 040 (ecrans §6, point d'accroche W-E4).
 *
 * Composant autonome : l'écran de l'inventaire le pose sans rien changer à
 * ses attendus, écarts, justifications ni à sa validation. Ne rend rien
 * quand l'inventaire ou la ligne ne vient pas de WhatsApp.
 */
export const WhatsappCountBadge: React.FC<WhatsappCountBadgeProps> = props => {
  if (props.variant === 'count') {
    if (props.source !== 'WHATSAPP') return null;
    return (
      <span data-testid="whatsapp-count-badge">
        <StatusTag status="WHATSAPP" tone="info" label={t('Ouvert par WhatsApp')} />
      </span>
    );
  }
  if (!props.line) return null;
  return (
    <span data-testid="whatsapp-line-badge" style={{ marginInlineStart: 4 }}>
      <WhatsAppOutlined aria-hidden style={{ marginInlineEnd: 4 }} />
      <StatusTag status="WHATSAPP" tone="info" label={t('WhatsApp')} />
    </span>
  );
};

export default WhatsappCountBadge;
