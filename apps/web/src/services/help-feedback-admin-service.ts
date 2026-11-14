import apiClient from '../utils/api-client';

/** Une question posée depuis une fiche d'aide (texte brut saisi par l'utilisateur). */
export interface HelpFeedbackQuestion {
  text: string;
  createdAt: string;
  locale: 'fr' | 'en' | 'ar';
  /** Nom de l'agence : renseigné côté plateforme seulement, toujours null côté agence. */
  tenantName: string | null;
}

export interface HelpFeedbackItem {
  helpId: string;
  useful: number;
  notUseful: number;
  questionsCount: number;
  lastAt: string;
  questions: HelpFeedbackQuestion[];
}

export interface HelpFeedbackSummary {
  items: HelpFeedbackItem[];
}

/** Le corps du serveur est `{ items }`, sans enveloppe `success`. */
function toSummary(body: unknown): HelpFeedbackSummary {
  const items = (body as { items?: HelpFeedbackItem[] } | undefined)?.items;
  return { items: Array.isArray(items) ? items : [] };
}

export async function fetchPlatformHelpFeedback(days: number): Promise<HelpFeedbackSummary> {
  const response = await apiClient.get('/admin/help-feedback', { params: { days } });
  return toSummary(response.data);
}

export async function fetchTenantHelpFeedback(tenantId: string, days: number): Promise<HelpFeedbackSummary> {
  const response = await apiClient.get(`/tenants/${tenantId}/help-feedback`, { params: { days } });
  return toSummary(response.data);
}
