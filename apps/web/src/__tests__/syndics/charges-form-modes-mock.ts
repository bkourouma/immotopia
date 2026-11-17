/**
 * Simulation de `useFormFieldModes` pour les tests d'écrans : le test fixe les
 * modes par champ (`formModes.current = { fundId: 'HIDDEN' }`), le hook rend le
 * même résultat que le vrai (fallback = comportement actuel quand rien n'est réglé).
 */
type Mode = 'REQUIRED' | 'OPTIONAL' | 'HIDDEN';

export const formModes: { current: Record<string, Mode> } = { current: {} };

export const formModesModule = {
  useFormFieldModes: () => ({
    loading: false,
    mode: (key: string, fallback: Mode = 'OPTIONAL') => formModes.current[key] ?? fallback,
    isVisible: (key: string) => formModes.current[key] !== 'HIDDEN',
    isRequired: (key: string, fallbackRequired: boolean) =>
      key in formModes.current ? formModes.current[key] === 'REQUIRED' : fallbackRequired
  }),
  invalidateFormFieldModes: () => undefined
};

/** Contexte d authentification minimal des ecrans testes (agence tenant-1). */
export const authValue = {
  user: { id: 'user-1', email: 't@example.com', fullName: 'T', globalRole: 'USER', isActive: true },
  isAuthenticated: true,
  isLoading: false,
  error: null,
  tenantMembership: {
    id: 'm',
    tenantId: 'tenant-1',
    tenant: { id: 'tenant-1', name: 'T', slug: 't' },
    status: 'ACTIVE'
  },
  tenantClient: null,
  isLoadingMembership: false,
  login: async () => undefined,
  logout: async () => undefined,
  register: async () => undefined,
  refreshToken: async () => undefined,
  clearError: () => undefined,
  refreshMembership: async () => undefined,
  availableTenants: [],
  activeTenantId: null,
  switchTenant: () => undefined
} as never;
