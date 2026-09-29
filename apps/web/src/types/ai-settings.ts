/**
 * Réglages d'ImmoCopilot côté plateforme — miroir du contrat de
 * `/api/platform/ai-settings` (packages/api). À garder aligné.
 */

export type AiProviderId = 'disabled' | 'fake' | 'anthropic' | 'openrouter';
export type AiEffort = 'low' | 'medium' | 'high';
export type AiSettingsSource = 'database' | 'environment';

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
  updatedAt: string | null;
  updatedByName: string | null;
  providers: AiProviderInfo[];
  keys: { openrouter: boolean; anthropic: boolean };
  source: AiSettingsSource;
}

export interface AiSettingsUpdate {
  provider: AiProviderId;
  model: string;
  effort: AiEffort;
  refusalFallback: boolean;
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
