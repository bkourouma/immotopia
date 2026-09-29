/**
 * Analyseur de flux Server-Sent Events (`text/event-stream`).
 *
 * Format visé : `event: <type>\ndata: <JSON>\n\n`, commentaires `: ping`
 * ignorés, plusieurs lignes `data:` concaténées par `\n`. Les fins de ligne
 * `\n`, `\r\n` et `\r` sont acceptées, et un événement peut être coupé
 * n'importe où entre deux morceaux réseau.
 */

export interface RawSseEvent {
  event: string;
  data: string;
}

export interface SseParser {
  /** Ajoute un morceau de texte ; émet les événements complets. */
  push(chunk: string): void;
  /** Fin du flux : émet un éventuel dernier événement non terminé. */
  end(): void;
}

export function createSseParser(onEvent: (e: RawSseEvent) => void): SseParser {
  let buffer = '';
  let event = '';
  let data: string[] = [];
  let hasData = false;
  let skipLf = false;

  const dispatch = () => {
    if (hasData) onEvent({ event: event || 'message', data: data.join('\n') });
    event = '';
    data = [];
    hasData = false;
  };

  const handleLine = (line: string) => {
    if (line === '') return dispatch();
    if (line.startsWith(':')) return; // commentaire (ping)
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') {
      data.push(value);
      hasData = true;
    }
    // `id`, `retry` et champs inconnus : ignorés.
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const c = buffer[i];
        if (skipLf) {
          skipLf = false;
          if (c === '\n' && i === start) {
            start = i + 1;
            continue;
          }
        }
        if (c === '\n' || c === '\r') {
          handleLine(buffer.slice(start, i));
          start = i + 1;
          if (c === '\r') {
            if (buffer[i + 1] === '\n') {
              i++;
              start = i + 1;
            } else if (i + 1 >= buffer.length) {
              skipLf = true;
            }
          }
        }
      }
      buffer = buffer.slice(start);
    },
    end() {
      if (buffer) handleLine(buffer);
      buffer = '';
      dispatch();
    }
  };
}

/** Lit un `ReadableStream` d'octets jusqu'à sa fin. */
export async function parseSseStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (e: RawSseEvent) => void
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser(onEvent);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } finally {
    reader.releaseLock();
  }
}
