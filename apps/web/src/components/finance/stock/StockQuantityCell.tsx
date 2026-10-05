import React from 'react';
import { Tooltip } from 'antd';
import { StatusTag } from '../../primitives/StatusTag';
import { formatQuantity } from '../../../types/finance-stock-inventaire-types';
import { t } from '../../../i18n/t';

export interface StockQuantityCellProps {
  /** `null` : le lieu est en comptage à l'aveugle, le serveur masque la quantité. */
  quantity: number | null | undefined;
  unit?: string | null;
}

/**
 * Une quantité de stock (ecrans §3.4, §4) : la quantité mise en forme, ou
 * l'état « Comptage en cours » quand le serveur l'a masquée (lieu en
 * comptage). Jamais « 0 » ni « — » à la place d'une quantité masquée : un
 * tiret se lit « rien ». L'écran ne recalcule jamais la quantité.
 */
export const StockQuantityCell: React.FC<StockQuantityCellProps> = ({ quantity, unit }) => {
  if (quantity === null || quantity === undefined) {
    return (
      <Tooltip
        title={t('Un inventaire est en cours sur ce lieu : la quantité reste masquée jusqu’à la clôture du comptage.')}
      >
        <span>
          <StatusTag status="STOCK_COUNT_IN_PROGRESS" tone="info" label={t('Comptage en cours')} />
        </span>
      </Tooltip>
    );
  }
  return <span>{formatQuantity(quantity, unit)}</span>;
};

export default StockQuantityCell;
