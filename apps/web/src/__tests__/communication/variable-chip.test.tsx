import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { VariableChip } from '../../components/communication/VariableChip';

describe('VariableChip', () => {
  it('s’active au clavier (Entrée et Espace) comme au clic', () => {
    const onActivate = vi.fn();
    render(<VariableChip name="contactName" onActivate={onActivate} />);
    const chip = screen.getByRole('button', { name: /Insérer la variable contactName/ });
    expect(chip).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(chip, { key: 'Enter' });
    fireEvent.keyDown(chip, { key: ' ' });
    fireEvent.click(chip);
    expect(onActivate).toHaveBeenCalledTimes(3);
  });

  it('reste une simple étiquette, sans rôle bouton, en lecture seule', () => {
    render(<VariableChip name="contactName" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('{{contactName}}')).toBeTruthy();
  });
});
