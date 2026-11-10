/**
 * Verrou de connexion (audit AUTH-01) : verrou dur par paire (e-mail, IP /64),
 * verrou global court et fixe par e-mail, clés HMAC, fenêtre glissante,
 * backoff exponentiel, mémoire bornée.
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

import { logger } from '../../src/utils/logger';
import {
  LOGIN_THROTTLE_BASE_LOCK_MS,
  LOGIN_THROTTLE_GLOBAL_LOCK_MS,
  LOGIN_THROTTLE_GLOBAL_MAX_FAILURES,
  LOGIN_THROTTLE_GLOBAL_MAX_LOCK_MS,
  LOGIN_THROTTLE_TRUSTED_PAIR_MS,
  LOGIN_THROTTLE_MAX_ENTRIES,
  LOGIN_THROTTLE_MAX_FAILURES,
  LOGIN_THROTTLE_MAX_LOCK_MS,
  LOGIN_THROTTLE_WINDOW_MS,
  clearEmailThrottle,
  clearLoginFailures,
  globalLockDurationMs,
  isLoginLocked,
  loginTrustedPairCount,
  loginThrottleEmailCount,
  loginThrottleSize,
  recordLoginFailure,
  resetLoginThrottle
} from '../../src/services/login-throttle-service';

const T0 = 1_700_000_000_000;
const OWNER_IP = '203.0.113.7';
const fail = (email: string, n: number, at = T0, ip: string | undefined = OWNER_IP) => {
  for (let i = 0; i < n; i++) recordLoginFailure(email, ip, at);
};
const locked = (email: string, at = T0, ip: string | undefined = OWNER_IP) => isLoginLocked(email, ip, at);

beforeEach(() => {
  resetLoginThrottle();
  jest.clearAllMocks();
});

describe('verrou dur par paire (e-mail, IP)', () => {
  it('ne verrouille pas avant le seuil, verrouille au 10e échec', () => {
    fail('a@b.test', LOGIN_THROTTLE_MAX_FAILURES - 1);
    expect(locked('a@b.test')).toBe(false);
    fail('a@b.test', 1);
    expect(locked('a@b.test')).toBe(true);
  });

  it('le verrou expire après 15 s, puis double à chaque échec suivant (plafond 15 min)', () => {
    fail('a@b.test', LOGIN_THROTTLE_MAX_FAILURES);
    expect(locked('a@b.test', T0 + LOGIN_THROTTLE_BASE_LOCK_MS - 1)).toBe(true);
    expect(locked('a@b.test', T0 + LOGIN_THROTTLE_BASE_LOCK_MS)).toBe(false);

    const t1 = T0 + LOGIN_THROTTLE_BASE_LOCK_MS;
    fail('a@b.test', 1, t1); // 11e échec : 30 s
    expect(locked('a@b.test', t1 + 29_999)).toBe(true);
    expect(locked('a@b.test', t1 + 30_000)).toBe(false);

    fail('a@b.test', 30, t1);
    expect(locked('a@b.test', t1 + LOGIN_THROTTLE_MAX_LOCK_MS - 1)).toBe(true);
    expect(locked('a@b.test', t1 + LOGIN_THROTTLE_MAX_LOCK_MS)).toBe(false);
  });

  it('un e-mail jamais vu (compte inexistant) est verrouillé comme un autre', () => {
    fail('inconnu@nulle-part.test', LOGIN_THROTTLE_MAX_FAILURES);
    expect(locked('inconnu@nulle-part.test')).toBe(true);
  });

  it('la fenêtre expirée remet le compteur à zéro', () => {
    fail('a@b.test', LOGIN_THROTTLE_MAX_FAILURES - 1);
    const later = T0 + LOGIN_THROTTLE_WINDOW_MS + 1;
    fail('a@b.test', 1, later); // repart de 1
    fail('a@b.test', LOGIN_THROTTLE_MAX_FAILURES - 2, later);
    expect(locked('a@b.test', later)).toBe(false);
    fail('a@b.test', 1, later);
    expect(locked('a@b.test', later)).toBe(true);
  });

  it('deux e-mails sont indépendants', () => {
    fail('a@b.test', LOGIN_THROTTLE_MAX_FAILURES);
    expect(locked('a@b.test')).toBe(true);
    expect(locked('autre@b.test')).toBe(false);
  });

  it('casse et espaces de bord sont normalisés', () => {
    fail('  A@B.Test ', 5);
    fail('a@b.test', 5);
    expect(locked('A@b.TEST')).toBe(true);
    expect(loginThrottleSize()).toBe(1);
  });

  it('clearLoginFailures remet à zéro la paire et le compteur global', () => {
    fail('a@b.test', LOGIN_THROTTLE_MAX_FAILURES);
    clearLoginFailures('a@b.test', OWNER_IP);
    expect(locked('a@b.test')).toBe(false);
    expect(loginThrottleSize()).toBe(0);
    expect(loginThrottleEmailCount()).toBe(0);
  });

  it('clearEmailThrottle efface toutes les paires de l’e-mail (toutes IP) et le global', () => {
    fail('a@b.test', LOGIN_THROTTLE_MAX_FAILURES, T0, '198.51.100.1');
    fail('a@b.test', LOGIN_THROTTLE_MAX_FAILURES, T0, '198.51.100.2');
    fail('autre@b.test', LOGIN_THROTTLE_MAX_FAILURES, T0, '198.51.100.1');
    clearEmailThrottle('A@b.test');
    expect(locked('a@b.test', T0, '198.51.100.1')).toBe(false);
    expect(locked('a@b.test', T0, '198.51.100.2')).toBe(false);
    expect(locked('autre@b.test', T0, '198.51.100.1')).toBe(true);
  });

  it('les entrées expirées sont purgées à l’écriture', () => {
    fail('a@b.test', 1);
    fail('b@b.test', 1);
    fail('c@b.test', 1, T0 + LOGIN_THROTTLE_WINDOW_MS + 120_000);
    expect(loginThrottleSize()).toBe(1);
    expect(loginThrottleEmailCount()).toBe(1);
  });

  it('journalise un avertissement sans e-mail ni IP en clair quand un verrou s’enclenche', () => {
    fail('secret.personne@b.test', LOGIN_THROTTLE_MAX_FAILURES);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify((logger.warn as jest.Mock).mock.calls[0]);
    expect(logged).not.toContain('secret.personne');
    expect(logged).not.toContain(OWNER_IP);
  });
});

describe('IP : regroupement /64 et absence d’IP', () => {
  it('deux IPv6 du même /64 comptent comme la même paire', () => {
    for (let i = 0; i < LOGIN_THROTTLE_MAX_FAILURES; i++) {
      recordLoginFailure('a@b.test', `2001:db8:abcd:12:${i}::${i + 1}`, T0);
    }
    expect(isLoginLocked('a@b.test', '2001:db8:abcd:12:ffff::1', T0)).toBe(true);
    expect(isLoginLocked('a@b.test', '2001:db8:abcd:13::1', T0)).toBe(false);
    expect(loginThrottleSize()).toBe(1);
  });

  it('sans IP, la clé « inconnue » est commune', () => {
    for (let i = 0; i < LOGIN_THROTTLE_MAX_FAILURES; i++) recordLoginFailure('a@b.test', undefined, T0);
    expect(isLoginLocked('a@b.test', undefined, T0)).toBe(true);
    expect(isLoginLocked('a@b.test', OWNER_IP, T0)).toBe(false);
  });
});

describe('résistance au verrouillage par un tiers', () => {
  it('un attaquant d’un autre /64 qui échoue 200 fois ne verrouille jamais le titulaire', () => {
    const attackerIp = '2001:db8:dead:beef::99';
    for (let second = 0; second < 200; second++) {
      const now = T0 + second * 1000;
      if (!isLoginLocked('chef@agence.test', attackerIp, now)) {
        recordLoginFailure('chef@agence.test', attackerIp, now);
      }
      expect(isLoginLocked('chef@agence.test', OWNER_IP, now)).toBe(false);
    }
  });

  /** Une tranche de 50 échecs depuis 50 IP distinctes (attaque distribuée). */
  const wave = (at: number, block: number) => {
    for (let i = 0; i < LOGIN_THROTTLE_GLOBAL_MAX_FAILURES; i++) {
      recordLoginFailure('chef@agence.test', `198.51.${block}.${i + 1}`, at);
    }
  };

  it('attaque distribuée : premier verrou global de 15 s, titulaire libre ensuite', () => {
    wave(T0, 100);
    expect(isLoginLocked('chef@agence.test', OWNER_IP, T0)).toBe(true);
    expect(isLoginLocked('chef@agence.test', OWNER_IP, T0 + LOGIN_THROTTLE_GLOBAL_LOCK_MS)).toBe(false);
  });

  it('le verrou global ESCALADE d’un engagement à l’autre (15 s, 30 s, 60 s…) jusqu’à 5 min', () => {
    let now = T0;
    const durations: number[] = [];
    for (let engagement = 1; engagement <= 8; engagement++) {
      wave(now, 100 + engagement);
      let lockMs = 0;
      while (isLoginLocked('chef@agence.test', OWNER_IP, now + lockMs)) lockMs += 1000;
      durations.push(lockMs);
      now += lockMs;
    }
    expect(durations).toEqual([15_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000, 300_000]);
    expect(globalLockDurationMs(1)).toBe(LOGIN_THROTTLE_GLOBAL_LOCK_MS);
    expect(globalLockDurationMs(50)).toBe(LOGIN_THROTTLE_GLOBAL_MAX_LOCK_MS);
  });

  it('l’escalade retombe après une fenêtre entière sans échec', () => {
    wave(T0, 100);
    wave(T0 + LOGIN_THROTTLE_GLOBAL_LOCK_MS, 101); // 2e engagement : 30 s
    const later = T0 + LOGIN_THROTTLE_GLOBAL_LOCK_MS + LOGIN_THROTTLE_WINDOW_MS + 1;
    wave(later, 102);
    expect(isLoginLocked('chef@agence.test', OWNER_IP, later + LOGIN_THROTTLE_GLOBAL_LOCK_MS)).toBe(false);
  });

  it('pendant le verrou global, aucun échec n’est compté ni ne prolonge le verrou', () => {
    clearLoginFailures('chef@agence.test', OWNER_IP, T0 - 1000); // paire sûre, qui peut encore essayer
    wave(T0, 100);
    for (let i = 0; i < 3 * LOGIN_THROTTLE_GLOBAL_MAX_FAILURES; i++) {
      recordLoginFailure('chef@agence.test', OWNER_IP, T0 + 1000);
    }
    expect(isLoginLocked('chef@agence.test', '192.0.2.200', T0 + LOGIN_THROTTLE_GLOBAL_LOCK_MS)).toBe(false);
  });
});

describe('paire sûre : exemption du verrou global', () => {
  const wave = (at: number) => {
    for (let i = 0; i < LOGIN_THROTTLE_GLOBAL_MAX_FAILURES; i++) {
      recordLoginFailure('chef@agence.test', `198.51.100.${i + 1}`, at);
    }
  };

  it('une paire qui a réussi récemment n’est pas enfermée par le verrou global ; les autres le sont', () => {
    clearLoginFailures('chef@agence.test', OWNER_IP, T0 - 24 * 3600_000);
    wave(T0);
    expect(isLoginLocked('chef@agence.test', OWNER_IP, T0)).toBe(false);
    expect(isLoginLocked('chef@agence.test', '192.0.2.200', T0)).toBe(true);
    expect(loginTrustedPairCount()).toBe(1);
  });

  it('l’exemption expire après 30 jours', () => {
    clearLoginFailures('chef@agence.test', OWNER_IP, T0 - LOGIN_THROTTLE_TRUSTED_PAIR_MS);
    wave(T0);
    expect(isLoginLocked('chef@agence.test', OWNER_IP, T0)).toBe(true);
  });

  it('le verrou de la paire elle-même s’applique toujours', () => {
    clearLoginFailures('chef@agence.test', OWNER_IP, T0 - 1000);
    fail('chef@agence.test', LOGIN_THROTTLE_MAX_FAILURES);
    expect(isLoginLocked('chef@agence.test', OWNER_IP, T0)).toBe(true);
  });

  it('la paire sûre est propre à l’e-mail et à l’IP (/64)', () => {
    clearLoginFailures('chef@agence.test', OWNER_IP, T0 - 1000);
    wave(T0);
    expect(isLoginLocked('chef@agence.test', '203.0.113.8', T0)).toBe(true);
    for (let i = 0; i < LOGIN_THROTTLE_GLOBAL_MAX_FAILURES; i++) {
      recordLoginFailure('autre@agence.test', `198.51.100.${i + 1}`, T0);
    }
    expect(isLoginLocked('autre@agence.test', OWNER_IP, T0)).toBe(true);
  });

  it('clearEmailThrottle (mot de passe réinitialisé) retire aussi les paires sûres de l’e-mail', () => {
    clearLoginFailures('chef@agence.test', OWNER_IP, T0 - 1000);
    clearLoginFailures('autre@agence.test', OWNER_IP, T0 - 1000);
    clearEmailThrottle('chef@agence.test');
    expect(loginTrustedPairCount()).toBe(1);
    wave(T0);
    expect(isLoginLocked('chef@agence.test', OWNER_IP, T0)).toBe(true);
  });
});

describe('mémoire bornée', () => {
  it('les plus anciennes entrées sont évincées (paires et compteur global)', () => {
    for (let i = 0; i < LOGIN_THROTTLE_MAX_ENTRIES + 25; i++) recordLoginFailure(`u${i}@b.test`, OWNER_IP, T0);
    expect(loginThrottleSize()).toBe(LOGIN_THROTTLE_MAX_ENTRIES);
    expect(loginThrottleEmailCount()).toBe(LOGIN_THROTTLE_MAX_ENTRIES);
    expect(isLoginLocked('u0@b.test', OWNER_IP, T0)).toBe(false);
  });
});
