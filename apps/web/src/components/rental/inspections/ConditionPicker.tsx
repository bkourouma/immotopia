import React from 'react';
import { Button } from 'antd';
import { InspectionCondition } from '../../../services/lease-inspections-service';
import { CONDITION_ORDER, conditionColor, conditionLabel } from './inspection-constants';

interface ConditionPickerProps {
  value: InspectionCondition | null;
  onChange: (value: InspectionCondition) => void;
  disabled?: boolean;
}

/**
 * Boutons segmentés larges pour choisir l'état d'un élément.
 *
 * Volontairement pas un `<Select>` : l'outil sert souvent sur téléphone, dans
 * le logement, pendant la visite — un choix à cinq valeurs doit tenir en un
 * seul geste, pas en trois (ouvrir, faire défiler, viser une petite ligne).
 */
export const ConditionPicker: React.FC<ConditionPickerProps> = ({ value, onChange, disabled = false }) => {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {CONDITION_ORDER.map(condition => {
        const selected = value === condition;
        const color = conditionColor(condition);
        return (
          <Button
            key={condition}
            disabled={disabled}
            onClick={() => onChange(condition)}
            style={{
              flex: '1 1 18%',
              minWidth: 64,
              minHeight: 44,
              fontWeight: selected ? 600 : 400,
              backgroundColor: selected ? color : undefined,
              borderColor: color,
              color: selected ? '#fff' : color
            }}
          >
            {conditionLabel(condition)}
          </Button>
        );
      })}
    </div>
  );
};

export default ConditionPicker;
