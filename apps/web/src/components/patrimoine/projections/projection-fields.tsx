import React from 'react';
import { Input } from 'antd';

/** Champ numérique étiqueté (valeur en chaîne : le formulaire convertit au moment d'envoyer). */
export const NumField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
  hint?: string;
}> = ({ id, label, value, onChange, min, max, step = 'any', hint }) => (
  <div style={{ flex: '1 1 160px', minWidth: 140 }}>
    <label htmlFor={id} style={{ display: 'block', marginBottom: 4 }}>
      {label}
    </label>
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={event => onChange(event.target.value)}
    />
    {hint && <div style={{ fontSize: 'var(--font-size-sm)', opacity: 0.7 }}>{hint}</div>}
  </div>
);

/** Liste déroulante native étiquetée : accessible, sans dépendance, et sans effet sur le sens d'écriture. */
export const SelectField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}> = ({ id, label, value, onChange, options, placeholder }) => (
  <div style={{ flex: '1 1 200px', minWidth: 160 }}>
    <label htmlFor={id} style={{ display: 'block', marginBottom: 4 }}>
      {label}
    </label>
    <select
      id={id}
      value={value}
      onChange={event => onChange(event.target.value)}
      style={{
        width: '100%',
        height: 32,
        padding: '0 8px',
        borderRadius: 6,
        border: '1px solid var(--color-border, #d9d9d9)',
        background: 'transparent',
        color: 'inherit'
      }}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);
