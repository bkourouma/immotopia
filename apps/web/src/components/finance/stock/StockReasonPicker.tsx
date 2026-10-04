import React, { useId } from 'react';
import { Input, Radio, Space, Typography } from 'antd';
import {
  STOCK_REASON_HELP,
  STOCK_REASON_LABELS,
  type StockReasonCode
} from '../../../types/finance-stock-controle-types';
import { t } from '../../../i18n/t';

const { Text } = Typography;

/** Le motif choisi et sa précision. */
export interface StockReasonValue {
  reasonCode: StockReasonCode | null;
  reason: string;
}

export interface StockReasonPickerProps {
  /** La liste fermée du contexte, telle que le serveur la donne (`FieldContext.reasonCodes`). */
  codes: StockReasonCode[];
  value: StockReasonValue;
  onChange: (value: StockReasonValue) => void;
  disabled?: boolean;
}

/** Longueur maximale de la précision (contrat : 500 caractères). */
export const STOCK_REASON_MAX_LENGTH = 500;

/**
 * Vrai quand le motif est complet : un code choisi, et une précision de 1 à
 * 500 caractères pour « Autre ». Les écrans s'en servent pour fermer le bouton
 * d'envoi.
 */
export function isStockReasonComplete(value: StockReasonValue): boolean {
  if (!value.reasonCode) return false;
  const precision = value.reason.trim();
  if (precision.length > STOCK_REASON_MAX_LENGTH) return false;
  return value.reasonCode !== 'OTHER' || precision.length > 0;
}

/**
 * Motif d'une liste fermée (ecrans §4, spec §4) : gros boutons radio, une
 * option par ligne (48 px), libellé et aide, puis la précision. « Autre » rend
 * la précision obligatoire. `OPENING_BALANCE`, posé par le système, n'est
 * jamais proposé, même si la liste le portait. Jamais de champ libre seul.
 */
export const StockReasonPicker: React.FC<StockReasonPickerProps> = ({ codes, value, onChange, disabled }) => {
  const precisionId = useId();
  const proposes = codes.filter(code => code !== 'OPENING_BALANCE');
  const autre = value.reasonCode === 'OTHER';
  const precisionManquante = autre && value.reason.trim().length === 0;

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Radio.Group
        value={value.reasonCode ?? undefined}
        disabled={disabled}
        onChange={event => onChange({ ...value, reasonCode: event.target.value as StockReasonCode })}
        style={{ width: '100%' }}
        aria-label={t('Motif')}
      >
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {proposes.map(code => (
            <Radio key={code} value={code} style={{ minHeight: 48, alignItems: 'center', display: 'flex' }}>
              <span>
                {STOCK_REASON_LABELS[code]}
                {STOCK_REASON_HELP[code] ? (
                  <Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
                    {STOCK_REASON_HELP[code]}
                  </Text>
                ) : null}
              </span>
            </Radio>
          ))}
        </Space>
      </Radio.Group>

      <div>
        <label htmlFor={precisionId}>
          <Text>{autre ? t('Précision (obligatoire)') : t('Précision (facultative)')}</Text>
        </label>
        <Input.TextArea
          id={precisionId}
          value={value.reason}
          disabled={disabled}
          maxLength={STOCK_REASON_MAX_LENGTH}
          autoSize={{ minRows: 2, maxRows: 5 }}
          status={precisionManquante ? 'warning' : undefined}
          onChange={event => onChange({ ...value, reason: event.target.value })}
        />
        {precisionManquante ? (
          <Text type="secondary" role="note">
            {t('Précisez le motif : il est obligatoire pour « Autre ».')}
          </Text>
        ) : null}
      </div>
    </Space>
  );
};

export default StockReasonPicker;
