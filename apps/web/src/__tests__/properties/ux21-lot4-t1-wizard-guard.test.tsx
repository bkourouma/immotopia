import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { PropertyFormWizard } from '../../components/properties/PropertyFormWizard';

vi.mock('../../services/property-service', () => ({
  __esModule: true,
  getTemplate: vi.fn(async () => null),
  createProperty: vi.fn(),
  updateProperty: vi.fn(),
  uploadMedia: vi.fn()
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' }, user: { email: 'a@b.c' } })
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'xl', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(async () => ({ data: { success: true, data: [] } })), post: vi.fn() }
}));
vi.mock('../../components/ui/location-selector', () => ({
  LocationSelector: () => <div data-testid="selecteur-localisation" />
}));
vi.mock('../../components/properties/PropertyMediaUpload', () => ({
  PropertyMediaUpload: () => <div />
}));
vi.mock('../../components/properties/PropertyMediaGallery', () => ({
  PropertyMediaGallery: () => <div />
}));

function monter(onCancel: () => void, onDirtyChange?: (d: boolean) => void) {
  return render(
    <AntApp>
      <MemoryRouter>
        <PropertyFormWizard tenantId="agence-1" onCancel={onCancel} onDirtyChange={onDirtyChange} />
      </MemoryRouter>
    </AntApp>
  );
}

describe('Assistant de création — garde de sortie (lot 4 UX)', () => {
  it('quitte sans confirmation tant que rien n’est saisi', async () => {
    const onCancel = vi.fn();
    monter(onCancel);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('demande confirmation avant d’abandonner une saisie, et la conserve si on continue', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onDirty = vi.fn();
    monter(onCancel, onDirty);

    await user.type(screen.getByLabelText('Titre'), 'Villa des Palmiers');
    await waitFor(() => expect(onDirty).toHaveBeenLastCalledWith(true));

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect((await screen.findAllByText('Abandonner la saisie de ce bien ?')).length).toBeGreaterThan(0);
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Continuer la saisie' }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Titre')).toHaveValue('Villa des Palmiers');
  });

  it('abandonne la saisie quand on confirme', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    monter(onCancel);
    await user.type(screen.getByLabelText('Titre'), 'Villa');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(await screen.findByRole('button', { name: 'Abandonner la saisie' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });
});
