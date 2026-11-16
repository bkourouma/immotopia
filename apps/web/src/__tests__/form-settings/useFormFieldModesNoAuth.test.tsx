import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getFormModes = vi.fn();
const getPortalFormModes = vi.fn();

vi.mock('../../services/form-settings-service', () => ({
  getFormModes: (...a: unknown[]) => getFormModes(...a),
  getPortalFormModes: (...a: unknown[]) => getPortalFormModes(...a)
}));

import { useFormFieldModes } from '../../hooks/useFormFieldModes';

describe('useFormFieldModes sans AuthProvider', () => {
  it('retombe sur le comportement actuel, sans exception ni appel réseau', () => {
    const { result } = renderHook(() => useFormFieldModes('syndic.a'));
    expect(result.current.loading).toBe(false);
    expect(result.current.isVisible('x')).toBe(true);
    expect(result.current.isRequired('x', true)).toBe(true);
    expect(result.current.isRequired('x', false)).toBe(false);
    expect(getFormModes).not.toHaveBeenCalled();
  });
});
