import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WritePlanChangesTable } from '../../components/copilot/WritePlanChangesTable';

describe('WritePlanChangesTable — noms de champs', () => {
  it('affiche un nom lisible, garde le nom technique en infobulle, isole les valeurs', () => {
    render(<WritePlanChangesTable changes={[{ field: 'internalNotes', before: 'ancien', after: '-5 Villa' }]} />);
    const label = screen.getByText('Internal notes');
    expect(label.closest('span')).toHaveAttribute('title', 'internalNotes');
    expect(screen.queryByText('internalNotes')).not.toBeInTheDocument();
    expect(screen.getByText('-5 Villa').closest('bdi')).not.toBeNull();
  });
});
