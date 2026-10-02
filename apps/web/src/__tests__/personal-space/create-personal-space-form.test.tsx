import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import type { AuthContextType } from '../../types/auth-types';
import { CreatePersonalSpaceForm } from '../../components/personal-space/CreatePersonalSpaceForm';
import { isValidUemoaPhone, normalizePhone } from '../../services/personal-space-service';
import { resetTenantTypeCache } from '../../hooks/useTenantType';

/**
 * Formulaire « Créer mon espace » (lot 4C). Le service est mocké en gardant
 * les exports réels (constantes, `readApiError`) : un mock de module doit
 * couvrir chaque export utilisé par le composant.
 */

const createPersonalSpace = vi.fn();

vi.mock('../../services/personal-space-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/personal-space-service')>();
  return { ...actual, createPersonalSpace: (...a: unknown[]) => createPersonalSpace(...a) };
});

const refreshMembership = vi.fn().mockResolvedValue(undefined);
const switchTenant = vi.fn();

const auth = {
  user: { id: 'u1', email: 'awa@example.com', fullName: 'Awa Koné', globalRole: 'USER' },
  isAuthenticated: true,
  isLoading: false,
  tenantMembership: null,
  tenantClient: null,
  isLoadingMembership: false,
  refreshMembership,
  switchTenant
} as unknown as AuthContextType;

const Where: React.FC = () => <div data-testid="lieu">{useLocation().pathname}</div>;

function monter() {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<CreatePersonalSpaceForm />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetTenantTypeCache();
  refreshMembership.mockResolvedValue(undefined);
});

describe('validation du téléphone', () => {
  it('accepte un numéro international UEMOA, espaces tolérés', () => {
    expect(normalizePhone('+225 07 12 34 56 78')).toBe('+2250712345678');
    expect(isValidUemoaPhone('+225 07 12 34 56 78')).toBe(true);
    expect(isValidUemoaPhone('+221771234567')).toBe(true);
  });

  it('refuse un numéro sans indicatif, hors UEMOA, trop court ou trop long', () => {
    expect(isValidUemoaPhone('0712345678')).toBe(false);
    expect(isValidUemoaPhone('+33612345678')).toBe(false);
    expect(isValidUemoaPhone('+2251234')).toBe(false);
    expect(isValidUemoaPhone('+2251234567890123')).toBe(false);
  });
});

describe('<CreatePersonalSpaceForm>', () => {
  it('préremplit le nom affiché et propose le pays de l’UEMOA', () => {
    monter();
    expect(screen.getByLabelText('Nom affiché')).toHaveValue('Awa Koné');
    expect(screen.getByRole('button', { name: 'Créer mon espace' })).toBeInTheDocument();
  });

  it('refuse un téléphone invalide sans appeler l’API', async () => {
    const user = userEvent.setup();
    monter();
    await user.type(screen.getByLabelText(/^Téléphone/), '0712345678');
    await user.click(screen.getByRole('button', { name: 'Créer mon espace' }));
    expect(await screen.findByText(/format international attendu/)).toBeInTheDocument();
    expect(createPersonalSpace).not.toHaveBeenCalled();
  });

  it('exige un nom', async () => {
    const user = userEvent.setup();
    monter();
    await user.clear(screen.getByLabelText('Nom affiché'));
    await user.click(screen.getByRole('button', { name: 'Créer mon espace' }));
    expect(await screen.findByText('Le nom est obligatoire.')).toBeInTheDocument();
    expect(createPersonalSpace).not.toHaveBeenCalled();
  });

  it('crée l’espace avec une Idempotency-Key, bascule dessus et redirige vers la valeur nette', async () => {
    const user = userEvent.setup();
    createPersonalSpace.mockResolvedValue({ tenantId: 'espace-1', slug: 'awa-x', name: 'Awa Koné' });
    monter();
    await user.type(screen.getByLabelText(/^Téléphone/), '+225 07 12 34 56 78');
    await user.click(screen.getByRole('button', { name: 'Créer mon espace' }));

    await waitFor(() => expect(createPersonalSpace).toHaveBeenCalledTimes(1));
    const [payload, key] = createPersonalSpace.mock.calls[0];
    expect(payload).toEqual({ displayName: 'Awa Koné', country: 'CI', phone: '+2250712345678' });
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(8);

    await waitFor(() =>
      expect(screen.getByTestId('lieu')).toHaveTextContent('/tenant/espace-1/patrimoine/valeur-nette')
    );
    expect(refreshMembership).toHaveBeenCalled();
    expect(switchTenant).toHaveBeenCalledWith('espace-1');
  });

  it('omet le téléphone quand il est vide', async () => {
    const user = userEvent.setup();
    createPersonalSpace.mockResolvedValue({ tenantId: 'espace-1', slug: 's', name: 'n' });
    monter();
    await user.click(screen.getByRole('button', { name: 'Créer mon espace' }));
    await waitFor(() => expect(createPersonalSpace).toHaveBeenCalled());
    expect(createPersonalSpace.mock.calls[0][0]).toEqual({ displayName: 'Awa Koné', country: 'CI' });
  });

  it('redirige vers l’espace existant sur 409 PERSONAL_SPACE_EXISTS', async () => {
    const user = userEvent.setup();
    createPersonalSpace.mockRejectedValue({
      response: { status: 409, data: { code: 'PERSONAL_SPACE_EXISTS', data: { tenantId: 'deja-la' } } }
    });
    monter();
    await user.click(screen.getByRole('button', { name: 'Créer mon espace' }));
    await waitFor(() =>
      expect(screen.getByTestId('lieu')).toHaveTextContent('/tenant/deja-la/patrimoine/valeur-nette')
    );
    expect(switchTenant).toHaveBeenCalledWith('deja-la');
  });

  it('demande de vérifier l’e-mail sur 403 EMAIL_NOT_VERIFIED', async () => {
    const user = userEvent.setup();
    createPersonalSpace.mockRejectedValue({ response: { status: 403, data: { code: 'EMAIL_NOT_VERIFIED' } } });
    monter();
    await user.click(screen.getByRole('button', { name: 'Créer mon espace' }));
    expect(await screen.findByText('Vérifiez votre adresse e-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Nom affiché')).toHaveValue('Awa Koné');
  });

  it('annonce une indisponibilité sur 503 SIGNUP_UNAVAILABLE', async () => {
    const user = userEvent.setup();
    createPersonalSpace.mockRejectedValue({ response: { status: 503, data: { code: 'SIGNUP_UNAVAILABLE' } } });
    monter();
    await user.click(screen.getByRole('button', { name: 'Créer mon espace' }));
    expect(await screen.findByText('Création d’espace momentanément indisponible')).toBeInTheDocument();
  });

  it('réutilise la même clé après une coupure réseau, en change après une réponse du serveur', async () => {
    const user = userEvent.setup();
    createPersonalSpace
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce({ response: { status: 503, data: { code: 'SIGNUP_UNAVAILABLE' } } })
      .mockResolvedValue({ tenantId: 'e', slug: 's', name: 'n' });
    monter();
    const bouton = screen.getByRole('button', { name: 'Créer mon espace' });
    await user.click(bouton);
    await screen.findByText('Impossible de créer votre espace');
    await user.click(bouton);
    await screen.findByText('Création d’espace momentanément indisponible');
    await user.click(bouton);
    await waitFor(() => expect(createPersonalSpace).toHaveBeenCalledTimes(3));
    const keys = createPersonalSpace.mock.calls.map(call => call[1]);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});
