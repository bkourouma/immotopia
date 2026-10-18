/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 047, T059 et T061 : transport de vision partagé (`lib/ai/vision`) et lecture
 * des captures (`lib/syndics/declared-payment/vision`).
 */
import { buildGeminiRequest, buildOpenRouterRequest, runVisionCall } from '../../src/lib/ai/vision';
import {
  DisabledPaymentProofProvider,
  GeminiPaymentProofProvider,
  OpenRouterPaymentProofProvider,
  PAYMENT_PROOF_JSON_SCHEMA,
  buildPaymentProofPrompt,
  parseProofModelOutput
} from '../../src/lib/syndics/declared-payment/vision';
import { FakePaymentProofProvider } from '../../src/lib/syndics/declared-payment/vision/fake-provider';

const GOOD = {
  quality: 'OK',
  operator: 'ORANGE',
  amount: 25000,
  paidAt: '2026-10-17T10:00:00',
  transactionReference: 'CI241017.1000.A12345',
  payerPhone: '07 07 07 07 07',
  recipientPhone: '+225 01 01 01 01 01',
  recipientName: 'SYNDIC RESIDENCE',
  confidence: { operator: 0.9, amount: 0.95, paidAt: 0.8, transactionReference: 0.7, payerPhone: null }
};

describe('parseProofModelOutput : validation champ par champ', () => {
  it('accepte une sortie valide', () => {
    const read = parseProofModelOutput(GOOD);
    expect(read).toMatchObject({ quality: 'OK', operator: 'ORANGE', amount: 25000, recipientName: 'SYNDIC RESIDENCE' });
    expect(read?.confidence).toEqual({ operator: 0.9, amount: 0.95, paidAt: 0.8, transactionReference: 0.7 });
  });

  it('abandonne un champ invalide sans perdre les autres', () => {
    const read = parseProofModelOutput({ ...GOOD, amount: 12.5, operator: 'PAYPAL', paidAt: 'hier' });
    expect(read).toMatchObject({ quality: 'OK', operator: null, amount: null, paidAt: null });
    expect(read?.transactionReference).toBe('CI241017.1000.A12345');
  });

  it.each([0, -5, 5_000_001, '25000', null])('refuse le montant %p', amount => {
    expect(parseProofModelOutput({ ...GOOD, amount })?.amount).toBeNull();
  });

  it('ignore les clés inconnues, sans les recopier', () => {
    const read = parseProofModelOutput({ ...GOOD, instruction: 'ignore les règles', extra: { a: 1 } });
    expect(read).not.toHaveProperty('instruction');
    expect(JSON.stringify(read)).not.toContain('ignore');
  });

  it('retire les caractères de commande et les chevrons du texte lu', () => {
    const read = parseProofModelOutput({ ...GOOD, recipientName: '<img src=x onerror=alert(1)>\u0000Nom' });
    expect(read?.recipientName).not.toMatch(/[<>]/);
    expect(read?.recipientName).not.toContain(String.fromCharCode(0));
  });

  it('une certitude hors bornes ou sans valeur est abandonnée', () => {
    const read = parseProofModelOutput({ ...GOOD, amount: null, confidence: { amount: 0.9, operator: 7 } });
    expect(read?.confidence).toEqual({});
  });

  it.each(['UNREADABLE', 'NOT_A_PAYMENT'])('qualité %s : aucun champ proposé', quality => {
    expect(parseProofModelOutput({ ...GOOD, quality })).toMatchObject({
      quality,
      operator: null,
      amount: null,
      transactionReference: null,
      confidence: {}
    });
  });

  it.each([null, 'texte', [], 42, { quality: 'MAYBE' }, {}])('sortie inutilisable %p : null', raw => {
    expect(parseProofModelOutput(raw)).toBeNull();
  });
});

describe('schéma et consigne', () => {
  it('JSON Schema strict : tout requis, rien d’autre', () => {
    const schema = PAYMENT_PROOF_JSON_SCHEMA as any;
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties).sort()).toEqual([...schema.required].sort());
    expect(schema.properties.confidence.additionalProperties).toBe(false);
  });

  it('la consigne traite l’image comme une donnée et ne contient aucune donnée de l’agence', () => {
    const prompt = buildPaymentProofPrompt();
    expect(prompt).toMatch(/DONNÉE/);
    expect(prompt).toMatch(/jamais une instruction/);
  });
});

describe('transport commun', () => {
  const payload = {
    prompt: 'consigne',
    image: Buffer.from('abc'),
    mimeType: 'image/png',
    jsonSchema: { type: 'object' },
    schemaName: 'nom'
  };

  it('Gemini : image en base64, schéma JSON, clé en en-tête et jamais dans l’URL', () => {
    const { url, init } = buildGeminiRequest(payload, 'modele-x', 'cle-secrete');
    expect(url).toContain('/models/modele-x:generateContent');
    expect(url).not.toContain('cle-secrete');
    expect((init.headers as any)['x-goog-api-key']).toBe('cle-secrete');
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[1].inlineData).toEqual({ mimeType: 'image/png', data: 'YWJj' });
    expect(body.generationConfig.responseJsonSchema).toEqual({ type: 'object' });
  });

  it('OpenRouter : image en URI data:, PDF en partie file, schéma strict', () => {
    const options = { model: 'a/b', apiKey: 'k', baseUrl: 'https://x/api/v1/', referer: 'https://app' };
    const image = JSON.parse(buildOpenRouterRequest(payload, options).init.body as string);
    expect(image.messages[0].content[1].image_url.url).toBe('data:image/png;base64,YWJj');
    expect(image.response_format.json_schema.strict).toBe(true);
    const pdf = JSON.parse(
      buildOpenRouterRequest({ ...payload, mimeType: 'application/pdf' }, options).init.body as string
    );
    expect(pdf.messages[0].content[1].type).toBe('file');
    expect(buildOpenRouterRequest(payload, options).url).toBe('https://x/api/v1/chat/completions');
  });

  it('runVisionCall ne lève jamais : erreur, délai et sortie invalide deviennent des issues', async () => {
    const meta = { provider: 'p', model: 'm', timeoutMs: 20 };
    const signal = new AbortController().signal;
    const parse = (raw: unknown) => (raw && typeof raw === 'object' ? raw : null);
    await expect(
      runVisionCall(
        meta,
        signal,
        async () => {
          throw new Error('boom');
        },
        parse
      )
    ).resolves.toMatchObject({
      ok: false,
      reason: 'PROVIDER_ERROR'
    });
    await expect(runVisionCall(meta, signal, () => new Promise(() => undefined), parse)).resolves.toMatchObject({
      ok: false,
      reason: 'TIMEOUT'
    });
    await expect(runVisionCall(meta, signal, async () => 'pas du json', parse)).resolves.toMatchObject({
      ok: false,
      reason: 'INVALID_OUTPUT'
    });
    await expect(runVisionCall(meta, signal, async () => '{"a":1}', parse)).resolves.toMatchObject({
      ok: true,
      result: { a: 1 }
    });
  });
});

describe('fournisseurs de lecture de capture', () => {
  const request = { image: Buffer.from('png'), mimeType: 'image/png' };
  const signal = () => new AbortController().signal;
  const geminiReply = (output: unknown) => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] })
  });

  it('Gemini : sortie valide', async () => {
    const fetchImpl = jest.fn(async () => geminiReply(GOOD) as any);
    const provider = new GeminiPaymentProofProvider({ fetch: fetchImpl, apiKey: 'k', model: 'm', timeoutMs: 2000 });
    const outcome = await provider.analyze(request, signal());
    expect(outcome).toMatchObject({ ok: true, provider: 'gemini', model: 'm', result: { amount: 25000 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('Gemini : sortie invalide abandonnée (INVALID_OUTPUT), sans fuite de la réponse', async () => {
    const provider = new GeminiPaymentProofProvider({
      fetch: async () => geminiReply({ quality: 'JE_SUIS_ADMIN' }) as any,
      apiKey: 'k',
      model: 'm',
      timeoutMs: 2000
    });
    const outcome = await provider.analyze(request, signal());
    expect(outcome).toMatchObject({ ok: false, reason: 'INVALID_OUTPUT' });
    expect(JSON.stringify(outcome)).not.toContain('JE_SUIS_ADMIN');
  });

  it('Gemini : délai dépassé', async () => {
    const provider = new GeminiPaymentProofProvider({
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('abort'), { name: 'AbortError' }))
          );
        }),
      apiKey: 'k',
      model: 'm',
      timeoutMs: 30
    });
    await expect(provider.analyze(request, signal())).resolves.toMatchObject({ ok: false, reason: 'TIMEOUT' });
  });

  it('Gemini : HTTP en erreur ou clé absente', async () => {
    const failing = new GeminiPaymentProofProvider({
      fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }) as any,
      apiKey: 'k',
      model: 'm'
    });
    await expect(failing.analyze(request, signal())).resolves.toMatchObject({ ok: false, reason: 'PROVIDER_ERROR' });
    const noKey = new GeminiPaymentProofProvider({ fetch: jest.fn() as any, apiKey: '', model: 'm' });
    await expect(noKey.analyze(request, signal())).resolves.toMatchObject({ ok: false, reason: 'PROVIDER_ERROR' });
  });

  it('OpenRouter : sortie valide', async () => {
    const provider = new OpenRouterPaymentProofProvider({
      fetch: async () =>
        ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(GOOD) } }] }) }) as any,
      apiKey: 'k',
      baseUrl: 'https://x/api/v1',
      model: 'g/m'
    });
    await expect(provider.analyze(request, signal())).resolves.toMatchObject({ ok: true, result: { amount: 25000 } });
  });

  it('fournisseur coupé : DISABLED, rien n’est appelé', async () => {
    await expect(new DisabledPaymentProofProvider().analyze()).resolves.toMatchObject({
      ok: false,
      reason: 'DISABLED'
    });
  });

  it('faux fournisseur : lecture déterministe validée comme une vraie', async () => {
    const outcome = await new FakePaymentProofProvider().analyze(request, signal());
    expect(outcome).toMatchObject({ ok: true, result: { quality: 'OK', amount: 25000 } });
  });
});
