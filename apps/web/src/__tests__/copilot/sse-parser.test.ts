import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AxiosAdapter } from 'axios';
import apiClient from '../../utils/api-client';
import { postEventStream } from '../../utils/event-stream';
import { TENANT_SUSPENDED_EVENT } from '../../utils/tenant-events';
import { createSseParser, parseSseStream, type RawSseEvent } from '../../utils/sse-parser';

function collect(chunks: string[]): RawSseEvent[] {
  const out: RawSseEvent[] = [];
  const p = createSseParser(e => out.push(e));
  chunks.forEach(c => p.push(c));
  p.end();
  return out;
}

describe('createSseParser', () => {
  it('lit un événement complet', () => {
    expect(collect(['event: text_delta\ndata: {"text":"a"}\n\n'])).toEqual([
      { event: 'text_delta', data: '{"text":"a"}' }
    ]);
  });

  it('recolle un événement coupé au milieu', () => {
    const out = collect(['eve', 'nt: text_delta\nda', 'ta: {"text":', '"salut"}\n', '\nevent: done\ndata: {}\n\n']);
    expect(out).toEqual([
      { event: 'text_delta', data: '{"text":"salut"}' },
      { event: 'done', data: '{}' }
    ]);
  });

  it('joint les données multilignes par un saut de ligne', () => {
    expect(collect(['event: x\ndata: a\ndata: b\n\n'])).toEqual([{ event: 'x', data: 'a\nb' }]);
  });

  it('ignore les commentaires ping', () => {
    expect(collect([': ping\n\nevent: x\n: ping\ndata: 1\n\n'])).toEqual([{ event: 'x', data: '1' }]);
  });

  it('accepte CRLF, même coupé entre \\r et \\n', () => {
    expect(collect(['event: x\r\ndata: 1\r', '\n\r\n'])).toEqual([{ event: 'x', data: '1' }]);
  });

  it("n'émet rien pour un événement sans données", () => {
    expect(collect(['event: x\n\n'])).toEqual([]);
  });

  it('émet le dernier événement non terminé à la fin du flux', () => {
    expect(collect(['event: x\ndata: 1'])).toEqual([{ event: 'x', data: '1' }]);
  });
});

describe('parseSseStream', () => {
  it("décode des octets UTF-8 coupés au milieu d'un caractère", async () => {
    const bytes = new TextEncoder().encode('event: x\ndata: é\n\n');
    const cut = bytes.indexOf(0xc3) + 1;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut));
        c.enqueue(bytes.slice(cut));
        c.close();
      }
    });
    const out: RawSseEvent[] = [];
    await parseSseStream(stream, e => out.push(e));
    expect(out).toEqual([{ event: 'x', data: 'é' }]);
  });
});

describe('postEventStream', () => {
  const originalAdapter = apiClient.defaults.adapter;
  afterEach(() => {
    vi.unstubAllGlobals();
    apiClient.defaults.adapter = originalAdapter;
  });

  const sseResponse = (text: string) =>
    new Response(text, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('poste avec cookies, langue et Accept, puis livre les événements', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(': ping\n\nevent: done\ndata: {"reason":"end_turn"}\n\n'));
    vi.stubGlobal('fetch', fetchMock);
    const events: RawSseEvent[] = [];
    await postEventStream('/tenants/t1/ai/chat', { a: 1 }, { onEvent: e => events.push(e) });
    expect(events).toEqual([{ event: 'done', data: '{"reason":"end_turn"}' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/tenants\/t1\/ai\/chat$/);
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('POST');
    expect(init.headers.Accept).toBe('text/event-stream');
    expect(init.headers['Accept-Language']).toBeTruthy();
    expect(init.body).toBe('{"a":1}');
  });

  it('401 : un seul rafraîchissement puis une nouvelle tentative', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(sseResponse('event: done\ndata: {}\n\n'));
    vi.stubGlobal('fetch', fetchMock);
    const refresh = vi.fn().mockResolvedValue({ data: {}, status: 200, statusText: '', headers: {}, config: {} });
    apiClient.defaults.adapter = refresh as unknown as AxiosAdapter;
    const events: RawSseEvent[] = [];
    await postEventStream('/tenants/t1/ai/chat', {}, { onEvent: e => events.push(e) });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
  });

  it('401 après rafraîchissement : lève sans boucler', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse(401, { code: 'UNAUTHORIZED', message: 'non' }));
    vi.stubGlobal('fetch', fetchMock);
    apiClient.defaults.adapter = vi
      .fn()
      .mockResolvedValue({ data: {}, status: 200, statusText: '', headers: {}, config: {} }) as unknown as AxiosAdapter;
    await expect(postEventStream('/tenants/t1/ai/chat', {}, { onEvent: () => {} })).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED'
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lève {status, code, message} sur une erreur typée', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(503, { code: 'AI_DISABLED', message: 'Désactivé' })));
    await expect(postEventStream('/x', {}, { onEvent: () => {} })).rejects.toEqual({
      status: 503,
      code: 'AI_DISABLED',
      message: 'Désactivé'
    });
  });

  it("403 TENANT_SUSPENDED déclenche l'événement existant", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(403, { code: 'TENANT_SUSPENDED', message: 'Suspendue' }))
    );
    const listener = vi.fn();
    window.addEventListener(TENANT_SUSPENDED_EVENT, listener);
    await expect(postEventStream('/tenants/t9/ai/chat', {}, { onEvent: () => {} })).rejects.toMatchObject({
      status: 403,
      code: 'TENANT_SUSPENDED'
    });
    window.removeEventListener(TENANT_SUSPENDED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ tenantId: 't9' });
  });

  it("propage le signal d'abandon à fetch", async () => {
    const fetchMock = vi.fn().mockImplementation((_u: string, init: RequestInit) => {
      return new Promise((_res, rej) => {
        init.signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')));
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const ctrl = new AbortController();
    const p = postEventStream('/x', {}, { signal: ctrl.signal, onEvent: () => {} });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});
