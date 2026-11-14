import apiClient from '../utils/api-client';
import { filenameFromDisposition, saveBlob } from '../utils/save-blob';
import type { AiMode, AiModelsResponse, AiProviderId, AiSettings, AiSettingsUpdate } from '../types/ai-settings';

/** Les réponses de l'API sont `{ success, data }` ; on tolère aussi le corps nu. */
function unwrap<T>(body: unknown): T {
  const b = body as { data?: T } | undefined;
  return (b && typeof b === 'object' && 'data' in b ? b.data : body) as T;
}

export async function getAiSettings(): Promise<AiSettings> {
  const response = await apiClient.get('/platform/ai-settings');
  return unwrap<AiSettings>(response.data);
}

export async function updateAiSettings(payload: AiSettingsUpdate): Promise<AiSettings> {
  const response = await apiClient.put('/platform/ai-settings', payload);
  return unwrap<AiSettings>(response.data);
}

export async function listAiModels(): Promise<AiModelsResponse> {
  const response = await apiClient.get('/platform/ai-settings/models');
  const data = unwrap<Partial<AiModelsResponse> | undefined>(response.data);
  return { models: data?.models ?? [], unavailable: Boolean(data?.unavailable) };
}

export interface AssistantFeedbackEntry {
  id: number;
  agency: string;
  updatedAt: string;
  helpful: boolean;
  comment: string;
  excerpt: string;
}

export async function listAssistantFeedback(
  offset: number,
  rating: 'all' | 'helpful' | 'unhelpful',
  signal: AbortSignal
) {
  const response = await apiClient.get('/platform/ai-settings/feedback', { params: { offset, rating }, signal });
  return unwrap<{ items: AssistantFeedbackEntry[]; hasNext: boolean }>(response.data);
}

export type AssistantUsageMode = AiMode | 'rewrite';
export type AssistantUsageProvider = 'anthropic' | 'openrouter' | 'fake';
export type AssistantUsageStatus = 'ok' | 'error' | 'aborted' | 'refused' | 'truncated';
export interface AssistantUsageFilters {
  from?: string;
  to?: string;
  tenantId?: string;
  userId?: string;
  provider?: AssistantUsageProvider;
  model?: string;
  mode?: AssistantUsageMode;
  status?: AssistantUsageStatus;
}

export interface AssistantUsageItem {
  tenantId: string;
  userId: string | null;
  agency: string | null;
  account: string | null;
  provider: AssistantUsageProvider;
  model: string | null;
  mode: AssistantUsageMode;
  status: AssistantUsageStatus;
  calls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  averageDurationMs: number | null;
  costUsd: string | null;
  unknownCosts: number;
}

export interface AssistantUsageReport {
  from: string;
  to: string;
  items: AssistantUsageItem[];
  hasNext: boolean;
}

export async function listAiUsage(filters: AssistantUsageFilters, offset: number, signal: AbortSignal) {
  const response = await apiClient.get('/platform/ai-settings/usage', { params: { ...filters, offset }, signal });
  return unwrap<AssistantUsageReport>(response.data);
}

export async function downloadAiUsage(filters: AssistantUsageFilters) {
  const response = await apiClient.get<Blob>('/platform/ai-settings/usage/export', {
    params: filters,
    responseType: 'blob'
  });
  saveBlob(response.data, filenameFromDisposition(response.headers['content-disposition'], 'immotopia-usage-ia.csv'));
}

export async function testAiConnection(mode: AiMode) {
  const response = await apiClient.post('/platform/ai-settings/connection-test', { mode });
  return unwrap<{ provider: AiProviderId; model: string | null; simulated: boolean; durationMs: number }>(
    response.data
  );
}
