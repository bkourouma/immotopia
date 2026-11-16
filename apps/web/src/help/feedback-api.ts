import apiClient from '../utils/api-client';
import type { HelpLanguage } from './types';

export interface HelpFeedbackPayload {
  helpId: string;
  useful?: boolean;
  question?: string;
  path?: string;
  locale: HelpLanguage;
}

const QUESTION_MAX_CHARS = 1000;

/** Envoie un avis (utile / pas utile) ou une question sans reponse. Les erreurs remontent. */
export async function sendHelpFeedback(payload: HelpFeedbackPayload): Promise<{ id: string }> {
  const body: HelpFeedbackPayload = { ...payload };
  if (typeof body.question === 'string') {
    body.question = body.question.trim().slice(0, QUESTION_MAX_CHARS);
  }
  const response = await apiClient.post('/help/feedback', body);
  const data = response.data as { id?: string; data?: { id?: string } } | undefined;
  return { id: (data?.data?.id ?? data?.id) as string };
}
