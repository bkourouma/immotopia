/**
 * Réglages d'ImmoCopilot côté plateforme — miroir du contrat de
 * `/api/platform/ai-settings` (packages/api). À garder aligné.
 */

export type AiProviderId = 'disabled' | 'fake' | 'anthropic' | 'openrouter';
export type AiEffort = 'low' | 'medium' | 'high';
export type AiSettingsSource = 'database' | 'environment';
export type AiMode = 'standard' | 'deep' | 'fast';
export type AiModelsByMode = Partial<Record<Exclude<AiMode, 'standard'>, string>>;
export type TranscriptionProvider = 'openai' | 'google';
export type TranscriptionSettings = { provider: 'disabled' } | { provider: TranscriptionProvider; model: string };

export interface AiProviderInfo {
  id: AiProviderId;
  label: string;
  available: boolean;
  reason?: string;
}

export interface AiSettings {
  provider: AiProviderId;
  model: string | null;
  effort: AiEffort;
  refusalFallback: boolean;
  modelsByMode?: AiModelsByMode;
  updatedAt: string | null;
  updatedByName: string | null;
  providers: AiProviderInfo[];
  keys: { openrouter: boolean; anthropic: boolean };
  transcription?: TranscriptionSettings;
  transcriptionKeys?: Record<TranscriptionProvider, boolean>;
  source: AiSettingsSource;
}

export interface AiSettingsUpdate {
  provider: AiProviderId;
  model: string;
  effort: AiEffort;
  refusalFallback: boolean;
  modelsByMode?: AiModelsByMode;
  transcription?: TranscriptionSettings;
}

export interface AiModelOption {
  id: string;
  name: string;
  contextLength: number | null;
}

export interface AiModelsResponse {
  models: AiModelOption[];
  unavailable: boolean;
}
