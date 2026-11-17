import type { ReactNode } from 'react';
import AuthContext from '../../context/AuthContext';
import type { AuthContextType } from '../../types/auth-types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFormModes = vi.fn();
const getPortalFormModes = vi.fn();

vi.mock('../../services/form-settings-service', () => ({
  getFormModes: (...a: unknown[]) => getFormModes(...a),
  getPortalFormModes: (...a: unknown[]) => getPortalFormModes(...a)
}));

import { invalidateFormFieldModes, useFormFieldModes } from '../../hooks/useFormFieldModes';

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthContext.Provider value={{ activeTenantId: 'tenant-1' } as unknown as AuthContextType}>
    {children}
  </AuthContext.Provider>
);

describe('useFormFieldModes', () => {
  beforeEach(() => {
    invalidateFormFieldModes();
    getFormModes.mockReset();
    getPortalFormModes.mockReset();
  });

  it("garde le comportement actuel tant que la réponse n'est pas arrivée", () => {
    getFormModes.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useFormFieldModes('syndic.a'), { wrapper });
    expect(result.current.loading).toBe(true);
    expect(result.current.isRequired('x', true)).toBe(true);
    expect(result.current.isRequired('x', false)).toBe(false);
    expect(result.current.isVisible('x')).toBe(true);
    expect(result.current.mode('x', 'REQUIRED')).toBe('REQUIRED');
  });

  it('applique les modes reçus', async () => {
    getFormModes.mockResolvedValue({ formKey: 'syndic.a', fields: { x: 'HIDDEN', y: 'REQUIRED' } });
    const { result } = renderHook(() => useFormFieldModes('syndic.a'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isVisible('x')).toBe(false);
    expect(result.current.isRequired('y', false)).toBe(true);
    expect(result.current.isRequired('z', true)).toBe(true);
  });

  it("retombe sur le fallback en cas d'erreur, sans bloquer", async () => {
    getFormModes.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useFormFieldModes('syndic.a'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isRequired('x', true)).toBe(true);
    expect(result.current.isVisible('x')).toBe(true);
  });

  it('met en cache par formKey et relit après invalidation', async () => {
    getFormModes.mockResolvedValue({ formKey: 'syndic.a', fields: { x: 'HIDDEN' } });
    const first = renderHook(() => useFormFieldModes('syndic.a'), { wrapper });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    const second = renderHook(() => useFormFieldModes('syndic.a'), { wrapper });
    expect(second.result.current.loading).toBe(false);
    expect(getFormModes).toHaveBeenCalledTimes(1);

    getFormModes.mockResolvedValue({ formKey: 'syndic.a', fields: { x: 'OPTIONAL' } });
    act(() => invalidateFormFieldModes('syndic.a'));
    await waitFor(() => expect(first.result.current.isVisible('x')).toBe(true));
    expect(getFormModes).toHaveBeenCalledTimes(2);
  });

  it('appelle la route du portail avec portal: coowner', async () => {
    getPortalFormModes.mockResolvedValue({ formKey: 'syndic.p', fields: { x: 'HIDDEN' } });
    const { result } = renderHook(() => useFormFieldModes('syndic.p', { portal: 'coowner' }), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getPortalFormModes).toHaveBeenCalledWith('syndic.p');
    expect(getFormModes).not.toHaveBeenCalled();
    expect(result.current.isVisible('x')).toBe(false);
  });

  it("préfère l'agence de l'URL à l'agence active", async () => {
    getFormModes.mockResolvedValue({ formKey: 'syndic.a', fields: {} });
    const routed = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/tenant/tenant-url/x']}>
        <Routes>
          <Route
            path="/tenant/:tenantId/x"
            element={
              <AuthContext.Provider value={{ activeTenantId: 'tenant-1' } as unknown as AuthContextType}>
                {children}
              </AuthContext.Provider>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    const { result } = renderHook(() => useFormFieldModes('syndic.a'), { wrapper: routed });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getFormModes).toHaveBeenCalledWith('tenant-url', 'syndic.a');
  });

  it('cloisonne le cache du portail par agence', async () => {
    getPortalFormModes.mockResolvedValue({ formKey: 'syndic.p', fields: {} });
    const make =
      (tenantId: string) =>
      ({ children }: { children: ReactNode }) => (
        <AuthContext.Provider value={{ activeTenantId: tenantId } as unknown as AuthContextType}>
          {children}
        </AuthContext.Provider>
      );
    const a = renderHook(() => useFormFieldModes('syndic.p', { portal: 'coowner' }), { wrapper: make('t-a') });
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    const b = renderHook(() => useFormFieldModes('syndic.p', { portal: 'coowner' }), { wrapper: make('t-b') });
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(getPortalFormModes).toHaveBeenCalledTimes(2);
  });
});
