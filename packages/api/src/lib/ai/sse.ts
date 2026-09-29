import type { Request, Response } from 'express';
import type { CopilotSseEvent } from './contracts';

/**
 * Flux Server-Sent Events d'ImmoCopilot (plan, décision 5).
 *
 * Fil : `event: <type>\ndata: <JSON de l'événement>\n\n`, plus un commentaire
 * `: ping` toutes les 15 s pour tenir la connexion à travers les proxys.
 * En-têtes : `no-transform` évite que le middleware de compression ne
 * bufferise le flux ; `X-Accel-Buffering: no` fait de même côté nginx.
 *
 * Abandon : la fermeture de la connexion se détecte sur la RÉPONSE
 * (`res.on('close')`), pas sur la requête. Depuis Node 16, l'événement `close`
 * de `IncomingMessage` part dès que le corps est entièrement lu : sur un POST,
 * il coupait le flux avant la première réponse.
 */

export const SSE_PING_INTERVAL_MS = 15_000;

export interface SseStream {
  /** Signal d'abandon : déclenché quand le client ferme la connexion. */
  readonly signal: AbortSignal;
  /** Vrai après la fin normale ou la fermeture par le client. */
  readonly closed: boolean;
  send(event: CopilotSseEvent): void;
  end(): void;
}

export function formatSseEvent(event: CopilotSseEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

type FlushableResponse = Response & { flush?: () => void };

/**
 * Ouvre le flux : écrit les en-têtes et les envoie (`flushHeaders`). À
 * appeler seulement une fois la requête validée : avant cet appel, une erreur
 * se répond en JSON typé ; après, en événement `error`.
 */
export function openSseStream(_req: Request, res: Response, options: { pingIntervalMs?: number } = {}): SseStream {
  const out = res as FlushableResponse;
  const controller = new AbortController();
  let closed = false;

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const write = (chunk: string): void => {
    if (closed || res.writableEnded || res.destroyed) return;
    res.write(chunk);
    out.flush?.();
  };

  const pingTimer = setInterval(() => write(': ping\n\n'), options.pingIntervalMs ?? SSE_PING_INTERVAL_MS);
  pingTimer.unref?.();

  const onClose = (): void => {
    clearInterval(pingTimer);
    if (!closed) {
      closed = true;
      // Fermeture avant la fin de la réponse : le client est parti.
      if (!res.writableFinished) controller.abort();
    }
  };
  res.on('close', onClose);

  return {
    signal: controller.signal,
    get closed() {
      return closed;
    },
    send(event) {
      write(formatSseEvent(event));
    },
    end() {
      clearInterval(pingTimer);
      if (!closed) {
        closed = true;
        if (!res.writableEnded) res.end();
      }
    }
  };
}
