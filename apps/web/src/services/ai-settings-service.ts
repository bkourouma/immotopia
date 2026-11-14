import apiClient from '../utils/api-client';
import type { AiModelsResponse, AiSettings, AiSettingsUpdate } from '../types/ai-settings';

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
