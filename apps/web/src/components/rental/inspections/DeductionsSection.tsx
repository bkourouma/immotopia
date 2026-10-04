import React from 'react';
import { Button, Input, InputNumber, Space, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { InspectionDeduction } from '../../../services/lease-inspections-service';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../../lib/utils';
import { t } from '../../../i18n/t';

const { Text } = Typography;

interface DeductionsSectionProps {
  deductions: InspectionDeduction[];
  readOnly: boolean;
  onChange?: (deductions: InspectionDeduction[]) => void;
  onProposeFromDamages?: () => void;
}

/**
 * Retenues sur le dépôt de garantie — uniquement pour un état des lieux de
 * sortie (le contrat impose `deductions: []` sur une entrée).
 *
 * Une ligne proposée depuis un manquant (spec 040, M5) garde le montant
 * proposé : s'il a été modifié, il reste affiché en secondaire. Le total et le
 * solde de tout compte prennent toujours le montant saisi.
 */

function amountHint(deduction: InspectionDeduction): string | null {
  const proposed = deduction.proposedAmount;
  if (proposed !== null && proposed !== undefined) {
    if (Number(deduction.amount) === proposed) return null;
    return t('Proposé : {{montant}} FCFA', { montant: formatNumberWithSpaces(String(proposed)) });
  }
  if (deduction.source === 'MISSING') return t('Valeur de remplacement non renseignée : montant à saisir');
  return null;
}
export const DeductionsSection: React.FC<DeductionsSectionProps> = ({
  deductions,
  readOnly,
  onChange,
  onProposeFromDamages
}) => {
  const total = deductions.reduce((sum, deduction) => sum + (Number(deduction.amount) || 0), 0);

  const updateLine = (id: string, patch: Partial<InspectionDeduction>) => {
    if (!onChange) return;
    onChange(deductions.map(deduction => (deduction.id === id ? { ...deduction, ...patch } : deduction)));
  };

  const handleAddLine = () => {
    if (!onChange) return;
    onChange([
      ...deductions,
      {
        id: crypto.randomUUID(),
        label: '',
        amount: 0,
        roomId: null,
        itemId: null,
        source: 'MANUAL',
        proposedAmount: null
      }
    ]);
  };

  const handleRemoveLine = (id: string) => {
    if (!onChange) return;
    onChange(deductions.filter(deduction => deduction.id !== id));
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="small">
      {deductions.length === 0 && <Text type="secondary">{t('Aucune retenue pour le moment.')}</Text>}

      {deductions.map(deduction => {
        const hint = amountHint(deduction);
        return (
          <Space key={deduction.id} style={{ width: '100%' }} align="start">
            {readOnly ? (
              <Text style={{ minWidth: 200 }}>{deduction.label}</Text>
            ) : (
              <Input
                style={{ minWidth: 200 }}
                placeholder={t('Libellé de la retenue')}
                value={deduction.label}
                onChange={e => updateLine(deduction.id, { label: e.target.value })}
              />
            )}

            <div>
              {readOnly ? (
                <Text>{formatNumberWithSpaces(String(deduction.amount))} FCFA</Text>
              ) : (
                <InputNumber
                  aria-label={t('Montant de la retenue')}
                  min={0}
                  step={1000}
                  value={deduction.amount}
                  formatter={value => formatNumberWithSpaces(value?.toString() || '')}
                  parser={
                    (value => {
                      if (!value) return 0;
                      const parsed = parseFloat(parseFormattedNumber(value));
                      return isNaN(parsed) ? 0 : parsed;
                    }) as (displayValue: string | undefined) => number
                  }
                  onChange={value => updateLine(deduction.id, { amount: Number(value) || 0 })}
                />
              )}
              {hint && (
                <Text type="secondary" style={{ display: 'block', fontSize: 'var(--font-size-sm)' }}>
                  {hint}
                </Text>
              )}
            </div>

            {!readOnly && (
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={t('Supprimer cette retenue')}
                onClick={() => handleRemoveLine(deduction.id)}
              />
            )}
          </Space>
        );
      })}

      {!readOnly && (
        <Space wrap>
          <Button icon={<PlusOutlined />} onClick={handleAddLine}>
            {t('Ajouter une ligne')}
          </Button>
          {onProposeFromDamages && (
            <Button icon={<ThunderboltOutlined />} onClick={onProposeFromDamages}>
              {t('Proposer depuis les dégradations et manquants')}
            </Button>
          )}
        </Space>
      )}

      <Text strong>{t('Total : {{montant}} FCFA', { montant: formatNumberWithSpaces(String(total)) })}</Text>
    </Space>
  );
};

export default DeductionsSection;
