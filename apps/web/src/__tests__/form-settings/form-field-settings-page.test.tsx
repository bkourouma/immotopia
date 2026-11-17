import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FormFieldSettingsPage } from '../../pages/settings/FormFieldSettingsPage';

const getFormSettings = vi.fn();
const updateFormSettings = vi.fn();
const invalidateFormFieldModes = vi.fn();
const useMyMenuAccess = vi.fn();

vi.mock('../../services/form-settings-service', () => ({
  getFormSettings: (...a: unknown[]) => getFormSettings(...a),
  updateFormSettings: (...a: unknown[]) => updateFormSettings(...a)
}));
vi.mock('../../hooks/useFormFieldModes', () => ({
  invalidateFormFieldModes: (...a: unknown[]) => invalidateFormFieldModes(...a)
}));
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: (...a: unknown[]) => useMyMenuAccess(...a)
}));

const field = (key: string, label: string, extra: Record<string, unknown> = {}) => ({
  key,
  label,
  consequence: 'Conséquence',
  fieldClass: 'OPEN',
  defaultMode: 'REQUIRED',
  allowedModes: ['REQUIRED', 'OPTIONAL', 'HIDDEN'],
  mode: 'REQUIRED',
  storedMode: null,
  unlocked: false,
  ...extra
});

const RESPONSE = {
  forms: [
    {
      formKey: 'syndic.declared-payment-manager',
      module: 'syndic',
      label: 'Paiement déclaré (gestionnaire)',
      audience: 'agency',
      fields: [field('transactionReference', 'Référence de transaction')]
    },
    {
      formKey: 'syndic.meeting',
      module: 'syndic',
      label: 'Assemblée générale',
      audience: 'agency',
      fields: [field('location', 'Lieu de la réunion')]
    }
  ]
};

function renderPage() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/t1/settings/formulaires']}>
        <Routes>
          <Route path="/tenant/:tenantId/settings/formulaires" element={<FormFieldSettingsPage />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

async function openModule() {
  fireEvent.click(await screen.findByText('Syndic de copropriété'));
}

describe('FormFieldSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMyMenuAccess.mockReturnValue({ permissions: null, ready: true });
    getFormSettings.mockResolvedValue(RESPONSE);
    updateFormSettings.mockResolvedValue(undefined);
  });

  it('charge les formulaires groupés par module', async () => {
    renderPage();
    await openModule();
    expect(getFormSettings).toHaveBeenCalledWith('t1');
    expect(await screen.findByText('Paiement déclaré (gestionnaire)')).toBeInTheDocument();
    expect(screen.getByText('Assemblée générale')).toBeInTheDocument();
  });

  it('filtre par nom de champ', async () => {
    renderPage();
    await screen.findByText('Syndic de copropriété');
    fireEvent.change(screen.getByLabelText('Rechercher un formulaire ou un champ'), { target: { value: 'lieu' } });
    expect(await screen.findByText('Assemblée générale')).toBeInTheDocument();
    expect(screen.queryByText('Paiement déclaré (gestionnaire)')).not.toBeInTheDocument();
  });

  it('active Enregistrer après un changement, enregistre puis invalide le cache', async () => {
    renderPage();
    await openModule();
    fireEvent.click(await screen.findByText('Paiement déclaré (gestionnaire)'));
    expect(await screen.findByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    fireEvent.click(await screen.findByText('Facultatif'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(updateFormSettings).toHaveBeenCalledWith('t1', 'syndic.declared-payment-manager', {
        transactionReference: 'OPTIONAL'
      })
    );
    expect(invalidateFormFieldModes).toHaveBeenCalledWith('syndic.declared-payment-manager');
    expect(await screen.findByText('Réglages du formulaire enregistrés.')).toBeInTheDocument();
  });

  it('reste en lecture seule sans TENANT_SETTINGS_EDIT', async () => {
    useMyMenuAccess.mockReturnValue({ permissions: new Set(['TENANT_SETTINGS_VIEW']), ready: true });
    renderPage();
    await openModule();
    expect(await screen.findByText('Lecture seule')).toBeInTheDocument();
    fireEvent.click(await screen.findByText('Paiement déclaré (gestionnaire)'));
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
  });
});
