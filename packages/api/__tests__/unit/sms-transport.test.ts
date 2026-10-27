/**
 * Transport SMS (signature, lot S7) : disabled, log, orange (fetch mocké, aucun
 * appel réseau), fabrique et validation croisée de la configuration.
 */
jest.mock('dotenv/config', () => ({}));

jest.mock('../../src/config/env', () => ({
  env: {
    SMS_PROVIDER: 'disabled',
    ORANGE_SMS_CLIENT_ID: 'client-id-secret-xyz',
    ORANGE_SMS_CLIENT_SECRET: 'client-secret-xyz',
    ORANGE_SMS_API_BASE_URL: 'https://api.orange.test/',
    ORANGE_SMS_SENDER_ADDRESS: 'tel:+2250000',
    ORANGE_SMS_SENDER_NAME: undefined
  }
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { env } from '../../src/config/env';
import { logger } from '../../src/utils/logger';
import { getSmsTransport, isSmsAvailable, resetSmsTransportForTests, takeLoggedSmsMessages } from '../../src/lib/sms';
import { createDisabledSmsTransport } from '../../src/lib/sms/disabled';
import { createLogSmsTransport } from '../../src/lib/sms/log';
import { createOrangeSmsTransport } from '../../src/lib/sms/orange';

const mutableEnv = env as unknown as Record<string, unknown>;
const PHONE = '+2250712345678';
const TEXT = 'Votre code de signature est 482913';

function loggedPayload(): string {
  const mocked = logger as unknown as Record<string, jest.Mock>;
  return JSON.stringify(['info', 'warn', 'error', 'debug'].map(level => mocked[level].mock.calls));
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const tokenBody = { token_type: 'Bearer', access_token: 'tok-abc-123', expires_in: '3600' };
const sendBody = {
  outboundSMSMessageRequest: {
    resourceURL: 'https://api.orange.test/smsmessaging/v1/outbound/tel:+2250000/requests/res42'
  }
};

const originalFetch = globalThis.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mutableEnv.SMS_PROVIDER = 'disabled';
  mutableEnv.ORANGE_SMS_SENDER_NAME = undefined;
  resetSmsTransportForTests();
  takeLoggedSmsMessages();
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('transport disabled', () => {
  it('refuse sans rien envoyer', async () => {
    expect(await createDisabledSmsTransport().send({ to: PHONE, text: TEXT })).toEqual({
      ok: false,
      reason: 'DISABLED'
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('transport log', () => {
  it('remplit le tampon et ne journalise ni le texte ni le numéro', async () => {
    const result = await createLogSmsTransport().send({ to: PHONE, text: TEXT });
    expect(result.ok).toBe(true);
    expect(result.ok && result.providerMessageId).toMatch(/^log-/);
    expect(takeLoggedSmsMessages()).toEqual([{ to: PHONE, text: TEXT }]);
    expect(takeLoggedSmsMessages()).toEqual([]);
    const logs = loggedPayload();
    expect(logs).not.toContain('482913');
    expect(logs).not.toContain('2250712345678');
    expect(logs).not.toContain(TEXT);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('borne le tampon à 50 messages', async () => {
    const transport = createLogSmsTransport();
    for (let i = 0; i < 60; i += 1) await transport.send({ to: PHONE, text: `m${i}` });
    const kept = takeLoggedSmsMessages();
    expect(kept).toHaveLength(50);
    expect(kept[0].text).toBe('m10');
  });
});

describe('transport orange', () => {
  it('obtient un jeton puis envoie, avec un corps conforme', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, tokenBody)).mockResolvedValueOnce(jsonResponse(201, sendBody));
    const result = await createOrangeSmsTransport().send({ to: PHONE, text: TEXT });
    expect(result).toEqual({ ok: true, providerMessageId: 'res42' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://api.orange.test/oauth/v3/token');
    expect(tokenInit.body).toBe('grant_type=client_credentials');
    expect(tokenInit.headers.Authorization).toMatch(/^Basic /);

    const [sendUrl, sendInit] = fetchMock.mock.calls[1];
    expect(sendUrl).toBe('https://api.orange.test/smsmessaging/v1/outbound/tel%3A%2B2250000/requests');
    expect(sendInit.headers.Authorization).toBe('Bearer tok-abc-123');
    expect(JSON.parse(sendInit.body)).toEqual({
      outboundSMSMessageRequest: {
        address: 'tel:+2250712345678',
        senderAddress: 'tel:+2250000',
        outboundSMSTextMessage: { message: TEXT }
      }
    });
  });

  it("ajoute senderName seulement s'il est configuré", async () => {
    mutableEnv.ORANGE_SMS_SENDER_NAME = 'ImmoTopia';
    fetchMock.mockResolvedValueOnce(jsonResponse(200, tokenBody)).mockResolvedValueOnce(jsonResponse(201, sendBody));
    await createOrangeSmsTransport().send({ to: PHONE, text: TEXT });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).outboundSMSMessageRequest.senderName).toBe('ImmoTopia');
  });

  it('met le jeton en cache entre deux envois', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, tokenBody))
      .mockResolvedValueOnce(jsonResponse(201, sendBody))
      .mockResolvedValueOnce(jsonResponse(201, sendBody));
    const transport = createOrangeSmsTransport();
    await transport.send({ to: PHONE, text: TEXT });
    await transport.send({ to: PHONE, text: TEXT });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(call => String(call[0]).includes('/oauth/')).length).toBe(1);
  });

  it.each([400, 403, 500, 503])("renvoie SEND_FAILED sans lever sur un HTTP %i à l'envoi", async status => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, tokenBody))
      .mockResolvedValueOnce(jsonResponse(status, { code: 1 }));
    expect(await createOrangeSmsTransport().send({ to: PHONE, text: TEXT })).toEqual({
      ok: false,
      reason: 'SEND_FAILED'
    });
  });

  it("renvoie SEND_FAILED quand l'authentification est refusée", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: 41 }));
    expect(await createOrangeSmsTransport().send({ to: PHONE, text: TEXT })).toEqual({
      ok: false,
      reason: 'SEND_FAILED'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('oublie le jeton après un 401 à l’envoi', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, tokenBody))
      .mockResolvedValueOnce(jsonResponse(401, { code: 42 }))
      .mockResolvedValueOnce(jsonResponse(200, tokenBody))
      .mockResolvedValueOnce(jsonResponse(201, sendBody));
    const transport = createOrangeSmsTransport();
    expect((await transport.send({ to: PHONE, text: TEXT })).ok).toBe(false);
    expect((await transport.send({ to: PHONE, text: TEXT })).ok).toBe(true);
  });

  it('renvoie SEND_FAILED sur une erreur réseau, sans secret ni texte dans les journaux', async () => {
    fetchMock.mockRejectedValue(new TypeError(`fetch failed ${TEXT} ${PHONE} client-secret-xyz`));
    expect(await createOrangeSmsTransport().send({ to: PHONE, text: TEXT })).toEqual({
      ok: false,
      reason: 'SEND_FAILED'
    });
    const logs = loggedPayload();
    for (const forbidden of ['client-secret-xyz', 'client-id-secret-xyz', '482913', '2250712345678', 'tok-abc-123']) {
      expect(logs).not.toContain(forbidden);
    }
  });

  it('ne journalise que le code HTTP sur un échec, jamais jeton ni texte', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, tokenBody))
      .mockResolvedValueOnce(jsonResponse(400, { text: TEXT }));
    await createOrangeSmsTransport().send({ to: PHONE, text: TEXT });
    const logs = loggedPayload();
    expect(logs).toContain('HTTP 400');
    for (const forbidden of ['client-secret-xyz', 'tok-abc-123', '482913', '2250712345678']) {
      expect(logs).not.toContain(forbidden);
    }
  });

  it('renvoie SEND_FAILED sans identifiants configurés', async () => {
    const saved = mutableEnv.ORANGE_SMS_CLIENT_SECRET;
    mutableEnv.ORANGE_SMS_CLIENT_SECRET = undefined;
    try {
      expect(await createOrangeSmsTransport().send({ to: PHONE, text: TEXT })).toEqual({
        ok: false,
        reason: 'SEND_FAILED'
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      mutableEnv.ORANGE_SMS_CLIENT_SECRET = saved;
    }
  });
});

describe('fabrique getSmsTransport', () => {
  it('suit env.SMS_PROVIDER après réinitialisation et met en cache par identifiant', () => {
    expect(getSmsTransport().id).toBe('disabled');
    mutableEnv.SMS_PROVIDER = 'log';
    resetSmsTransportForTests();
    const log = getSmsTransport();
    expect(log.id).toBe('log');
    expect(getSmsTransport()).toBe(log);
    mutableEnv.SMS_PROVIDER = 'orange';
    resetSmsTransportForTests();
    expect(getSmsTransport().id).toBe('orange');
  });

  it('isSmsAvailable est faux seulement pour disabled', () => {
    expect(isSmsAvailable()).toBe(false);
    mutableEnv.SMS_PROVIDER = 'log';
    expect(isSmsAvailable()).toBe(true);
    mutableEnv.SMS_PROVIDER = 'orange';
    expect(isSmsAvailable()).toBe(true);
  });
});

describe('validation de la configuration SMS', () => {
  const BASE: Record<string, string> = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_SECRET: 'a'.repeat(48),
    FRONTEND_URL: 'https://app.example.com',
    BACKEND_URL: 'https://api.example.com'
  };
  const saved = { ...process.env };

  function load(extra: Record<string, string>) {
    process.env = { ...saved, ...BASE, ...extra };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('ORANGE_SMS_') && !(key in extra)) delete process.env[key];
    }
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    let loaded: Record<string, unknown> | undefined;
    jest.isolateModules(() => {
      try {
        loaded = jest.requireActual('../../src/config/env').env;
      } catch {
        // process.exit simulé : configuration refusée.
      }
    });
    const result = { env: loaded, exited: exit.mock.calls.length > 0, errors: error.mock.calls.flat().join('\n') };
    jest.restoreAllMocks();
    return result;
  }

  afterAll(() => {
    process.env = saved;
  });

  it('refuse orange sans identifiants ni adresse d’expéditeur', () => {
    const { exited, errors } = load({ SMS_PROVIDER: 'orange', NODE_ENV: 'production' });
    expect(exited).toBe(true);
    for (const name of ['ORANGE_SMS_CLIENT_ID', 'ORANGE_SMS_CLIENT_SECRET', 'ORANGE_SMS_SENDER_ADDRESS']) {
      expect(errors).toContain(name);
    }
  });

  it('accepte orange complet', () => {
    const { exited } = load({
      SMS_PROVIDER: 'orange',
      NODE_ENV: 'production',
      ORANGE_SMS_CLIENT_ID: 'id',
      ORANGE_SMS_CLIENT_SECRET: 'secret',
      ORANGE_SMS_SENDER_ADDRESS: 'tel:+2250000'
    });
    expect(exited).toBe(false);
  });

  it('refuse log hors development/test, l’accepte en test, et disabled est le défaut', () => {
    expect(load({ SMS_PROVIDER: 'log', NODE_ENV: 'production' }).exited).toBe(true);
    expect(load({ SMS_PROVIDER: 'log', NODE_ENV: 'test' }).exited).toBe(false);
    const { env: loaded, exited } = load({ NODE_ENV: 'production' });
    expect(exited).toBe(false);
    expect(loaded?.SMS_PROVIDER).toBe('disabled');
  });
});
