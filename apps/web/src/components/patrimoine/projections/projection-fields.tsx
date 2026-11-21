import React from 'react';
import { Input, InputNumber } from 'antd';
import { moneyInputProps } from '../actifs/form-helpers';

const ERROR_STYLE: React.CSSProperties = { color: 'var(--color-error, #cf1322)' };

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
  error?: string;
  /** Unité affichée dans le champ (« % », « ans »…). */
  unit?: string;
  /** Montant : milliers séparés et devise en suffixe (la valeur reste un nombre en chaîne). */
  money?: boolean;
}> = ({ id, label, value, onChange, min, max, step = 'any', hint, error, unit, money }) => (
  <div style={{ flex: '1 1 160px', minWidth: 140 }}>
    <label htmlFor={id} style={{ display: 'block', marginBottom: 4 }}>
      {label}
    </label>
    {money ? (
      <InputNumber
        id={id}
        stringMode
        controls={false}
        inputMode="decimal"
        style={{ width: '100%' }}
        min={min === undefined ? undefined : String(min)}
        value={value === '' ? null : value}
        status={error ? 'error' : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={next => onChange(next === null || next === undefined ? '' : String(next))}
        {...moneyInputProps(unit ?? 'FCFA')}
      />
    ) : (
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        suffix={unit}
        status={error ? 'error' : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={event => onChange(event.target.value)}
      />
    )}
    {error && (
      <div id={`${id}-error`} role="alert" style={ERROR_STYLE}>
        {error}
      </div>
    )}
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
  error?: string;
}> = ({ id, label, value, onChange, options, placeholder, error }) => (
  <div style={{ flex: '1 1 200px', minWidth: 160 }}>
    <label htmlFor={id} style={{ display: 'block', marginBottom: 4 }}>
      {label}
    </label>
    <select
      id={id}
      value={value}
      onChange={event => onChange(event.target.value)}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      style={{
        width: '100%',
        height: 40,
        padding: '0 8px',
        borderRadius: 6,
        border: `1px solid ${error ? 'var(--color-error, #cf1322)' : 'var(--color-border, #d9d9d9)'}`,
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
    {error && (
      <div id={`${id}-error`} role="alert" style={ERROR_STYLE}>
        {error}
      </div>
    )}
  </div>
);
