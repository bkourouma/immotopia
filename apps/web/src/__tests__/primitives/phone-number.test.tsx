import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PhoneNumber } from '../../components/primitives';

describe('PhoneNumber', () => {
  it('isole le numéro en LTR', () => {
    const { container } = render(<PhoneNumber value="+225 07 07 07 07 07" className="x" />);
    const el = container.querySelector('bdi');
    expect(el).toHaveAttribute('dir', 'ltr');
    expect(el).toHaveClass('x');
    expect(el).toHaveTextContent('+225 07 07 07 07 07');
  });
});
