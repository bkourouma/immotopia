import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PropertyTypeSelector } from '../../components/properties/PropertyTypeSelector';
import { PropertyType } from '../../types/property-types';

/** BUG-2026-09-30-016 : la boutique (bail commercial) doit pouvoir être créée depuis l'écran. */
describe('PropertyTypeSelector', () => {
  it('propose « Boutique / Commercial » à la création', () => {
    render(<PropertyTypeSelector onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Boutique/i })).toBeInTheDocument();
  });

  it('garde masqués la colocation et le lot de programme neuf', () => {
    render(<PropertyTypeSelector onSelect={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Colocation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Programme neuf/i })).not.toBeInTheDocument();
  });

  it('appelle onSelect avec BOUTIQUE_COMMERCIAL', () => {
    const onSelect = vi.fn();
    render(<PropertyTypeSelector onSelect={onSelect} />);
    screen.getByRole('button', { name: /Boutique/i }).click();
    expect(onSelect).toHaveBeenCalledWith(PropertyType.BOUTIQUE_COMMERCIAL);
  });
});
