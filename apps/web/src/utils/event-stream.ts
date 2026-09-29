import type { InternalAxiosRequestConfig } from 'axios';
import { API_URL } from '../config/api';
import i18next from '../i18n';
import { t } from '../i18n/t';
import { redirectToLogin, refreshSession } from './api-client';
import { parseSseStream } from './sse-parser';
import { TENANT_SUSPENDED_EVENT } from './tenant-events';

/** Erreur levée par `postEventStream` avant l'ouverture du flux. */
export interface EventStreamError {
  status: number;
  code: string;
  message: string;
}

export interface EventStreamOptions {
  signal?: AbortSignal;
  onEvent(e: { event: string; data: string }): void;
}

/**
 * POST dont la réponse est un flux `text/event-stream` (ImmoCopilot).
 *
 * axios ne sait pas lire un corps en flux dans le navigateur : on passe par
 * `fetch`, en reprenant à la main les trois mécanismes de cette instance —
 * cookies (`credentials: 'include'`), langue de l'interface, et
 * rafraîchissement de session sur 401 (un seul, via `refreshSession`, puis une
 * seule nouvelle tentative). Un 403 `TENANT_SUSPENDED` déclenche le même
 * évènement DOM que l'intercepteur axios.
 *
 * Lève `{ status, code, message }` si la réponse n'est pas un succès. Les
 * erreurs survenues après l'ouverture du flux arrivent, elles, en évènement
 * `error` (voir `sse-parser.ts`).
 */
export async function postEventStream(path: string, body: unknown, opts: EventStreamOptions): Promise<void> {
  const send = () =>
    fetch(`${API_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      signal: opts.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'Accept-Language': i18next.resolvedLanguage ?? i18next.language
      },
      body: JSON.stringify(body)
    });

  let response = await send();

  if (response.status === 401) {
    try {
      await refreshSession();
    } catch {
      redirectToLogin();
      throw { status: 401, code: 'UNAUTHORIZED', message: t('Session expirée') } satisfies EventStreamError;
    }
    response = await send();
  }

  if (!response.ok) {
    let data: { code?: string; message?: string } | undefined;
    try {
      data = (await response.json()) as { code?: string; message?: string };
    } catch {
      data = undefined;
    }
    if (response.status === 403 && data?.code === 'TENANT_SUSPENDED' && typeof window !== 'undefined') {
      const { deduireTenantIdSuspendu } = await import('./tenant-suspended-detection');
      const tenantId = deduireTenantIdSuspendu({ url: path } as InternalAxiosRequestConfig);
      window.dispatchEvent(new CustomEvent(TENANT_SUSPENDED_EVENT, { detail: { tenantId } }));
    }
    throw {
      status: response.status,
      code: data?.code ?? 'HTTP_ERROR',
      message: data?.message ?? t('Requête refusée')
    } satisfies EventStreamError;
  }

  if (!response.body) {
    throw { status: response.status, code: 'NO_STREAM', message: t('Requête refusée') } satisfies EventStreamError;
  }

  await parseSseStream(response.body, opts.onEvent);
}
