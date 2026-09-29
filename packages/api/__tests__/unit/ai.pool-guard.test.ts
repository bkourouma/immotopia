/**
 * lib/ai/pool-guard.ts — lecture de `connection_limit` et avertissements
 * (jamais bloquants) sur le pool et les limiteurs par instance.
 */
import {
  AI_POOL_CONNECTIONS,
  MAX_CONCURRENT_EXCLUSIVE_SECTIONS,
  RECOMMENDED_CONNECTION_LIMIT,
  connectionLimitWarnings,
  parseConnectionLimit,
  perInstanceLimitersWarning
} from '../../src/lib/ai/pool-guard';

const BASE = 'postgresql://user:s3cret@db.example.com:5432/immo';

describe('parseConnectionLimit', () => {
  it('absent : pas de paramètre, ou paramètre voisin', () => {
    expect(parseConnectionLimit(BASE)).toEqual({ kind: 'absent' });
    expect(parseConnectionLimit(`${BASE}?schema=public`)).toEqual({ kind: 'absent' });
    expect(parseConnectionLimit(`${BASE}?my_connection_limit=3`)).toEqual({ kind: 'absent' });
  });

  it('valide : entier > 0, quelle que soit sa position', () => {
    expect(parseConnectionLimit(`${BASE}?connection_limit=12`)).toEqual({ kind: 'ok', value: 12 });
    expect(parseConnectionLimit(`${BASE}?schema=public&connection_limit=7&pool_timeout=5`)).toEqual({
      kind: 'ok',
      value: 7
    });
  });

  it.each(['abc', '0', '-3', '', '4.5', '1e1', '0x10', '10abc', '99999999999999999999'])('invalide : %p', raw => {
    expect(parseConnectionLimit(`${BASE}?connection_limit=${raw}`)).toEqual({ kind: 'invalid', raw });
  });

  it('ne lève jamais, même sur une chaîne qui n est pas une URL', () => {
    expect(() => parseConnectionLimit('pas une url ?connection_limit=abc')).not.toThrow();
    expect(() => parseConnectionLimit('')).not.toThrow();
  });
});

describe('connectionLimitWarnings', () => {
  it('assistant coupé : silence, sauf valeur invalide', () => {
    expect(connectionLimitWarnings(BASE, false)).toEqual([]);
    expect(connectionLimitWarnings(`${BASE}?connection_limit=2`, false)).toEqual([]);
    expect(connectionLimitWarnings(`${BASE}?connection_limit=abc`, false)).toHaveLength(1);
  });

  it('assistant actif : avertit si connection_limit manque', () => {
    const [message, ...rest] = connectionLimitWarnings(BASE, true);
    expect(rest).toEqual([]);
    expect(message).toContain('ne fixe pas connection_limit');
    expect(message).toContain(`connection_limit=${RECOMMENDED_CONNECTION_LIMIT}`);
  });

  it('assistant actif : avertit si la valeur est sous le minimum recommandé', () => {
    const [message] = connectionLimitWarnings(`${BASE}?connection_limit=${RECOMMENDED_CONNECTION_LIMIT - 1}`, true);
    expect(message).toContain('trop bas');
    expect(message).toContain('P2024');
  });

  it('assistant actif : valeur suffisante -> aucun avertissement', () => {
    expect(connectionLimitWarnings(`${BASE}?connection_limit=${RECOMMENDED_CONNECTION_LIMIT}`, true)).toEqual([]);
    expect(connectionLimitWarnings(`${BASE}?connection_limit=50`, true)).toEqual([]);
  });

  it.each(['abc', '0', '-1'])('valeur %p : signalée clairement, assistant actif ou non', raw => {
    for (const aiEnabled of [true, false]) {
      const [message] = connectionLimitWarnings(`${BASE}?connection_limit=${raw}`, aiEnabled);
      expect(message).toContain('entier strictement positif');
    }
  });

  it('ne recopie jamais l URL (mot de passe) dans un message', () => {
    for (const url of [BASE, `${BASE}?connection_limit=abc`, `${BASE}?connection_limit=2`]) {
      expect(connectionLimitWarnings(url, true).join('\n')).not.toContain('s3cret');
    }
  });

  it('le minimum recommandé couvre les sections exclusives (2 connexions chacune) plus du trafic', () => {
    expect(AI_POOL_CONNECTIONS).toBe(MAX_CONCURRENT_EXCLUSIVE_SECTIONS * 2);
    expect(RECOMMENDED_CONNECTION_LIMIT).toBeGreaterThan(AI_POOL_CONNECTIONS);
  });
});

describe('perInstanceLimitersWarning', () => {
  it('annonce les plafonds configurés et la multiplication par le nombre d instances', () => {
    const message = perInstanceLimitersWarning({ tenantMinute: 100, tenantDaily: 3000 });
    expect(message).toContain('EN MÉMOIRE');
    expect(message).toContain('100/min');
    expect(message).toContain('3000/jour');
    expect(message).toContain('N × la valeur configurée');
  });
});
