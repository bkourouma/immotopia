import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { AiSettingsPage } from '../../pages/admin/AiSettings';

/** Page super-admin « Assistant IA ». Le service est mocké en entier. */

const getAiSettings = vi.fn();
const updateAiSettings = vi.fn();
const listAiModels = vi.fn();
const listAssistantFeedback = vi.fn();
const listAiUsage = vi.fn();
const downloadAiUsage = vi.fn();
const testAiConnection = vi.fn();

vi.mock('../../services/ai-settings-service', () => ({
  listAssistantFeedback: (...a: unknown[]) => listAssistantFeedback(...a),
  listAiUsage: (...a: unknown[]) => listAiUsage(...a),
  downloadAiUsage: (...a: unknown[]) => downloadAiUsage(...a),
  testAiConnection: (...a: unknown[]) => testAiConnection(...a),
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

  it('charge les avis en ouvrant la section et permet de changer de page', async () => {
    listAssistantFeedback
      .mockResolvedValueOnce({
        items: [
          {
            id: 0,
            agency: 'Agence A',
            helpful: false,
            excerpt: 'Extrait court',
            comment: 'À préciser',
            updatedAt: '2026-11-14T10:00:00Z'
          }
        ],
        hasNext: true
      })
      .mockResolvedValueOnce({ items: [], hasNext: false });
    mount();
    expect(listAssistantFeedback).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByText('Avis sur les réponses de l’assistant'));
    expect(await screen.findByRole('cell', { name: 'Extrait court' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'À préciser' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(await screen.findByText('Aucun avis')).toBeVisible();
    expect(listAssistantFeedback).toHaveBeenLastCalledWith(25, 'all', expect.any(AbortSignal));
  });

  it('affiche les réglages, les clés et la dernière modification', async () => {
    mount();
    expect(await screen.findByText('Clé configurée')).toBeInTheDocument();
    expect(screen.getByText('Clé manquante')).toBeInTheDocument();
    expect(screen.getByText(/Awa Koné/)).toBeInTheDocument();
    expect(screen.getByText('Base de données')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled();
  });

  it('choisit le moteur de dictée indépendamment du fournisseur de chat', async () => {
    const settings = {
      ...SETTINGS,
      transcription: { provider: 'disabled' },
      transcriptionKeys: { google: true, openai: false }
    };
    const transcription = { provider: 'google', model: 'gemini-3.5-transcribe' };
    getAiSettings.mockResolvedValue(settings);
    updateAiSettings.mockResolvedValue({ ...settings, transcription });
    mount();
    expect(await screen.findByRole('radio', { name: /OpenAI/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Google Gemini' }));
    expect(screen.getByRole('textbox', { name: 'Modèle de transcription' })).toHaveValue(transcription.model);
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() =>
      expect(updateAiSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openrouter',
          transcription
        })
      )
    );
  });

  it('enregistre le modèle rapide et teste uniquement le réglage sauvegardé', async () => {
    const modelsByMode = { fast: 'openai/quick' };
    updateAiSettings.mockResolvedValue({ ...SETTINGS, modelsByMode });
    testAiConnection.mockResolvedValue({
      provider: 'openrouter',
      model: 'openai/gpt-4o',
      simulated: false,
      durationMs: 15
    });
    mount();
    const input = await screen.findByRole('combobox', { name: 'Modèle rapide' });
    fireEvent.change(input, { target: { value: 'openai/quick' } });
    const test = screen.getByRole('button', { name: 'Tester la connexion' });
    expect(test).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => expect(updateAiSettings).toHaveBeenCalledWith(expect.objectContaining({ modelsByMode })));
    await waitFor(() => expect(test).toBeEnabled());
    fireEvent.click(test);
    expect(testAiConnection).toHaveBeenCalledWith('standard');
  });

  it('affiche le coût inconnu et exporte la sélection de compte', async () => {
    listAiUsage.mockResolvedValue({
      from: '2026-09-01',
      to: '2026-09-28',
      hasNext: false,
      items: [
        {
          tenantId: 'agency-id',
          userId: 'member-id',
          agency: 'Agence A',
          account: 'Membre A',
          model: 'claude',
          provider: 'anthropic',
          mode: 'deep',
          status: 'ok',
          calls: 1,
          inputTokens: 5,
          outputTokens: 3,
          cacheReadTokens: 0,
          cacheWriteTokens: null,
          averageDurationMs: 212,
          costUsd: null,
          unknownCosts: 1
        }
      ]
    });
    downloadAiUsage.mockResolvedValue(undefined);
    mount();
    expect(listAiUsage).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByText('Usages de l’assistant'));
    expect(await screen.findByText('Inconnu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Membre A' }));
    await waitFor(() =>
      expect(listAiUsage).toHaveBeenLastCalledWith({ userId: 'member-id' }, 0, expect.any(AbortSignal))
    );
    const exportButton = screen.getByRole('button', { name: 'Exporter en CSV' });
    await waitFor(() => expect(exportButton).toBeEnabled());
    fireEvent.click(exportButton);
    expect(downloadAiUsage).toHaveBeenCalledWith({ userId: 'member-id', from: '2026-09-01', to: '2026-09-28' });
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
