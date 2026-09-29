import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { AiSettingsPage } from '../../pages/admin/AiSettings';

/** Page super-admin « Assistant IA ». Le service est mocké en entier. */

const getAiSettings = vi.fn();
const updateAiSettings = vi.fn();
const listAiModels = vi.fn();

vi.mock('../../services/ai-settings-service', () => ({
  getAiSettings: (...a: unknown[]) => getAiSettings(...a),
  updateAiSettings: (...a: unknown[]) => updateAiSettings(...a),
  listAiModels: (...a: unknown[]) => listAiModels(...a)
}));

const SETTINGS = {
  provider: 'openrouter',
  model: 'openai/gpt-4o',
  effort: 'medium',
  refusalFallback: false,
  updatedAt: '2026-09-28T10:00:00.000Z',
  updatedByName: 'Awa Koné',
  providers: [
    { id: 'disabled', label: 'Désactivé', available: true },
    { id: 'openrouter', label: 'OpenRouter', available: true },
    { id: 'anthropic', label: 'Anthropic', available: false, reason: 'ANTHROPIC_API_KEY absente du serveur' },
    { id: 'fake', label: 'Faux', available: true }
  ],
  keys: { openrouter: true, anthropic: false },
  source: 'database'
};

/** Ouvre la liste déroulante du modèle et choisit l'option dont le texte contient `label`. */
async function pickModel(label: string) {
  const combo = await screen.findByRole('combobox', { name: 'Modèle' });
  fireEvent.mouseDown(combo);
  const option = await screen.findByText(label, { selector: '.ant-select-item-option-content' });
  fireEvent.click(option);
}

function mount() {
  return render(
    <AntApp>
      <AiSettingsPage />
    </AntApp>
  );
}

describe('AiSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAiSettings.mockResolvedValue(SETTINGS);
    listAiModels.mockResolvedValue({
      models: [
        { id: 'openai/gpt-4o', name: 'GPT-4o', contextLength: 128000 },
        { id: 'mistralai/mistral-large', name: 'Mistral Large', contextLength: 32000 }
      ],
      unavailable: false
    });
  });

  it('affiche les réglages, les clés et la dernière modification', async () => {
    mount();
    expect(await screen.findByText('Clé configurée')).toBeInTheDocument();
    expect(screen.getByText('Clé manquante')).toBeInTheDocument();
    expect(screen.getByText(/Awa Koné/)).toBeInTheDocument();
    expect(screen.getByText('Base de données')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled();
  });

  it('désactive un fournisseur indisponible et affiche sa raison', async () => {
    mount();
    expect(await screen.findByText('ANTHROPIC_API_KEY absente du serveur')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Anthropic/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /OpenRouter/ })).toBeEnabled();
  });

  it('envoie le bon corps au PUT', async () => {
    updateAiSettings.mockResolvedValue({ ...SETTINGS, model: 'mistralai/mistral-large' });
    mount();
    await pickModel('Mistral Large (mistralai/mistral-large)');
    const save = screen.getByRole('button', { name: /Enregistrer/ });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() =>
      expect(updateAiSettings).toHaveBeenCalledWith({
        provider: 'openrouter',
        model: 'mistralai/mistral-large',
        effort: 'medium',
        refusalFallback: false
      })
    );
  });

  it('affiche une erreur de chargement distincte', async () => {
    getAiSettings.mockRejectedValue(new Error('Serveur en panne'));
    mount();
    expect(await screen.findByText('Impossible de charger les réglages de l’assistant IA')).toBeInTheDocument();
    expect(screen.getByText('Serveur en panne')).toBeInTheDocument();
    expect(screen.queryByText('Clé configurée')).not.toBeInTheDocument();
  });

  it('signale une liste de modèles indisponible', async () => {
    listAiModels.mockResolvedValue({ models: [], unavailable: true });
    mount();
    await waitFor(
      () => expect(screen.getByText('Liste indisponible, saisissez l’identifiant à la main')).toBeInTheDocument(),
      { timeout: 8000 }
    );
  });

  it('affiche l’erreur de l’API à l’enregistrement', async () => {
    updateAiSettings.mockRejectedValue(new Error('Modèle refusé'));
    mount();
    await pickModel('Mistral Large (mistralai/mistral-large)');
    const save = screen.getByRole('button', { name: /Enregistrer/ });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(await screen.findByText('Modèle refusé')).toBeInTheDocument();
  });
});
