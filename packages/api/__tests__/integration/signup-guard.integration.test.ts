/**
 * Lot 4E : limiteur d'inscription en base (`signup_attempts`).
 * Exige une base dédiée (`DATABASE_URL_TEST`, voir `npm run test:isolation`) ;
 * sans elle, la suite est ignorée.
 */

import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/utils/database';
import {
  assertSignupAllowed,
  hashSignupIp,
  resetSignupPurgeThrottle,
  SIGNUP_MAX_PER_WINDOW,
  SIGNUP_RETENTION_MS,
  SIGNUP_WINDOW_MS
} from '../../src/services/signup-guard-service';
import { registrationRateLimiter } from '../../src/middleware/rate-limit-middleware';
import { errorHandler } from '../../src/middleware/error-middleware';
import { logger } from '../../src/utils/logger';

const suite = process.env.DATABASE_URL_TEST ? describe : describe.skip;

suite('signup guard (PostgreSQL)', () => {
  const IP = '203.0.113.7';
  const OTHER_IP = '203.0.113.8';

  beforeEach(async () => {
    await prisma.$executeRaw`DELETE FROM "signup_attempts"`;
    resetSignupPurgeThrottle();
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM "signup_attempts"`;
    await prisma.$disconnect();
  });

  it('accepte 3 inscriptions par heure puis refuse la 4e avec 429 SIGNUP_RATE_LIMITED', async () => {
    for (let i = 0; i < SIGNUP_MAX_PER_WINDOW; i += 1) {
      await expect(assertSignupAllowed(IP)).resolves.toBeUndefined();
    }
    await expect(assertSignupAllowed(IP)).rejects.toMatchObject({ statusCode: 429, code: 'SIGNUP_RATE_LIMITED' });
  });

  it('un refus ne s’enregistre pas (le blocage ne se prolonge pas)', async () => {
    for (let i = 0; i < SIGNUP_MAX_PER_WINDOW + 2; i += 1) {
      await assertSignupAllowed(IP).catch(() => undefined);
    }
    const [{ n }] = await prisma.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM "signup_attempts"`;
    expect(n).toBe(SIGNUP_MAX_PER_WINDOW);
  });

  it('une autre IP n’est pas affectée', async () => {
    for (let i = 0; i < SIGNUP_MAX_PER_WINDOW; i += 1) await assertSignupAllowed(IP);
    await expect(assertSignupAllowed(OTHER_IP)).resolves.toBeUndefined();
  });

  it('fenêtre glissante : une tentative de plus d’une heure ne compte plus', async () => {
    const t0 = new Date('2026-10-04T10:00:00.000Z');
    await assertSignupAllowed(IP, t0);
    await assertSignupAllowed(IP, new Date(t0.getTime() + 20 * 60 * 1000));
    await assertSignupAllowed(IP, new Date(t0.getTime() + 40 * 60 * 1000));
    // 50 min après t0 : 3 tentatives dans l'heure, refus.
    await expect(assertSignupAllowed(IP, new Date(t0.getTime() + 50 * 60 * 1000))).rejects.toMatchObject({
      code: 'SIGNUP_RATE_LIMITED'
    });
    // 61 min après t0 : la première est sortie de la fenêtre, une place se libère.
    await expect(
      assertSignupAllowed(IP, new Date(t0.getTime() + SIGNUP_WINDOW_MS + 60 * 1000))
    ).resolves.toBeUndefined();
  });

  it('purge les lignes de plus de 24 h, au plus une fois par minute et par processus', async () => {
    const t0 = new Date('2026-10-04T10:00:00.000Z');
    await assertSignupAllowed(IP, t0);
    const later = new Date(t0.getTime() + SIGNUP_RETENTION_MS + 60 * 1000);
    await assertSignupAllowed(OTHER_IP, later);
    const rows = await prisma.$queryRaw<Array<{ ip_hash: string }>>`SELECT "ip_hash" FROM "signup_attempts"`;
    expect(rows.map(r => r.ip_hash)).toEqual([hashSignupIp(OTHER_IP)]);

    // Moins d'une minute plus tard, pas de nouvelle purge : une ligne périmée insérée à la main survit.
    const stale = new Date(later.getTime() - SIGNUP_RETENTION_MS - 1000);
    await prisma.$executeRaw`INSERT INTO "signup_attempts" ("ip_hash", "created_at") VALUES (${'stale'}, ${stale}::timestamp)`;
    await assertSignupAllowed(OTHER_IP, new Date(later.getTime() + 10 * 1000));
    const [{ n }] = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM "signup_attempts" WHERE "ip_hash" = 'stale'`;
    expect(n).toBe(1);
    // Une minute après la dernière purge, elle est balayée.
    await assertSignupAllowed(OTHER_IP, new Date(later.getTime() + 2 * 60 * 1000));
    const [{ m }] = await prisma.$queryRaw<Array<{ m: number }>>`
      SELECT COUNT(*)::int AS m FROM "signup_attempts" WHERE "ip_hash" = 'stale'`;
    expect(m).toBe(0);
  });

  it('IPv6 : les adresses d’un même préfixe /64 partagent un compteur, un autre /64 non', async () => {
    const base = '2001:db8:aaaa:bbbb';
    await assertSignupAllowed(`${base}::1`);
    await assertSignupAllowed(`${base}:1:2:3:4`);
    await assertSignupAllowed(`${base}:ffff:ffff:ffff:ffff`);
    await expect(assertSignupAllowed(`${base}::99`)).rejects.toMatchObject({ code: 'SIGNUP_RATE_LIMITED' });
    await expect(assertSignupAllowed('2001:db8:aaaa:cccc::1')).resolves.toBeUndefined();
  });

  it('ne stocke ni ne journalise l’IP en clair', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    for (let i = 0; i <= SIGNUP_MAX_PER_WINDOW; i += 1) await assertSignupAllowed(IP).catch(() => undefined);
    const rows = await prisma.$queryRaw<Array<{ ip_hash: string }>>`SELECT "ip_hash" FROM "signup_attempts"`;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.ip_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.ip_hash).not.toContain(IP);
    }
    expect(JSON.stringify(warn.mock.calls)).not.toContain(IP);
    warn.mockRestore();
  });

  it('fail-open avec avertissement quand la base est indisponible', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const spy = jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connexion perdue'));
    await expect(assertSignupAllowed(IP)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(IP);
    spy.mockRestore();
    warn.mockRestore();
  });

  it('middleware : la 4e requête de la même IP répond 429 avec le code', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.post('/register', registrationRateLimiter, (_req, res) => res.status(201).json({ success: true }));
    app.use(errorHandler);

    for (let i = 0; i < SIGNUP_MAX_PER_WINDOW; i += 1) {
      const ok = await request(app).post('/register').set('X-Forwarded-For', IP);
      expect(ok.status).toBe(201);
    }
    const blocked = await request(app).post('/register').set('X-Forwarded-For', IP);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('SIGNUP_RATE_LIMITED');
    const other = await request(app).post('/register').set('X-Forwarded-For', OTHER_IP);
    expect(other.status).toBe(201);
  });
});
