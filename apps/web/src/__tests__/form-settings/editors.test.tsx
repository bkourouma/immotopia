import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FieldModesEditor, UnlockFieldsEditor } from '../../components/form-settings';
import type { FormSettingsField, FormSettingsForm, FormUnlockEntry } from '../../services/form-settings-service';

const field = (over: Partial<FormSettingsField>): FormSettingsField => ({
  key: 'ref',
  label: 'Référence de transaction',
  consequence: 'Le rapprochement devient manuel.',
  fieldClass: 'OPEN',
  defaultMode: 'REQUIRED',
  allowedModes: ['REQUIRED', 'OPTIONAL'],
  mode: 'REQUIRED',
  storedMode: null,
  unlocked: false,
  ...over
});
const form = (fields: FormSettingsField[]): FormSettingsForm => ({
  formKey: 'syndic.f',
  module: 'syndic',
  label: 'Paiement déclaré',
  audience: 'agency',
  fields
});

describe('FieldModesEditor', () => {
  it('ne propose que les modes permis et marque le défaut', () => {
    render(<FieldModesEditor form={form([field({})])} editable onChange={vi.fn()} />);
    const row = screen.getByTestId('field-row-ref');
    expect(within(row).getByText('Obligatoire (Par défaut)')).toBeInTheDocument();
    expect(within(row).getByText('Facultatif')).toBeInTheDocument();
    expect(within(row).queryByText('Masqué')).not.toBeInTheDocument();
    expect(within(row).getByText('Le rapprochement devient manuel.')).toBeInTheDocument();
  });

  it('émet le mode choisi', () => {
    const onChange = vi.fn();
    render(<FieldModesEditor form={form([field({})])} editable onChange={onChange} />);
    fireEvent.click(screen.getByText('Facultatif'));
    expect(onChange).toHaveBeenCalledWith('ref', 'OPTIONAL');
  });

  it('verrouille un champ GATED non déverrouillé', () => {
    const onChange = vi.fn();
    render(<FieldModesEditor form={form([field({ fieldClass: 'GATED' })])} editable onChange={onChange} />);
    expect(screen.getByText('Sous condition')).toBeInTheDocument();
    expect(screen.getByText('Réglage soumis à ImmoTopia')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Facultatif'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('autorise un champ GATED déverrouillé', () => {
    const onChange = vi.fn();
    render(
      <FieldModesEditor form={form([field({ fieldClass: 'GATED', unlocked: true })])} editable onChange={onChange} />
    );
    expect(screen.queryByText('Réglage soumis à ImmoTopia')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Facultatif'));
    expect(onChange).toHaveBeenCalledWith('ref', 'OPTIONAL');
  });

  it('revient au défaut avec null', () => {
    const onChange = vi.fn();
    render(
      <FieldModesEditor
        form={form([field({ mode: 'OPTIONAL', storedMode: 'OPTIONAL' })])}
        editable
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText('Revenir au défaut'));
    expect(onChange).toHaveBeenCalledWith('ref', null);
  });

  it('est inerte quand editable est faux', () => {
    const onChange = vi.fn();
    render(<FieldModesEditor form={form([field({ storedMode: 'OPTIONAL' })])} editable={false} onChange={onChange} />);
    fireEvent.click(screen.getByText('Facultatif'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Revenir au défaut')).not.toBeInTheDocument();
  });
});

describe('UnlockFieldsEditor', () => {
  const entry: FormUnlockEntry = {
    formKey: 'syndic.f',
    formLabel: 'Paiement déclaré',
    module: 'syndic',
    fieldKey: 'ref',
    fieldLabel: 'Référence de transaction',
    consequence: 'Le rapprochement devient manuel.',
    unlocked: false
  };

  it('affiche la conséquence et bascule avec le motif', () => {
    const onToggle = vi.fn();
    render(<UnlockFieldsEditor entries={[entry]} onToggle={onToggle} />);
    expect(screen.getByText('Le rapprochement devient manuel.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Motif du déverrouillage/), { target: { value: 'Demande client' } });
    fireEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith('syndic.f', 'ref', true, 'Demande client');
  });

  it('affiche un message sans entrée', () => {
    render(<UnlockFieldsEditor entries={[]} onToggle={vi.fn()} />);
    expect(screen.getByText('Aucun champ sous condition.')).toBeInTheDocument();
  });
});
