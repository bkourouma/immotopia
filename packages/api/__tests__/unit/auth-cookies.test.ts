/**
 * Cookies d'authentification (audit 2026-11-09, AUTH-11 c) : le refreshToken
 * est posé sur /api/auth, l'accessToken sur /, et l'ancien refreshToken de
 * chemin / est effacé à la pose et à la déconnexion.
 */
import express from 'express';
import request from 'supertest';
import { setAuthCookies, clearAuthCookies } from '../../src/utils/auth-cookies';

const app = express();
app.post('/set', (_req, res) => {
  setAuthCookies(res, 'ACCESS', 'REFRESH');
  res.json({ ok: true });
});
app.post('/clear', (_req, res) => {
  clearAuthCookies(res);
  res.json({ ok: true });
});

function cookies(res: request.Response): string[] {
  return (res.headers['set-cookie'] as unknown as string[]) ?? [];
}
const find = (list: string[], name: string, path: string) =>
  list.filter(c => c.startsWith(`${name}=`) && c.includes(`Path=${path};`));
const expired = (c: string) => /Expires=Thu, 01 Jan 1970/.test(c);

describe("cookies d'authentification", () => {
  it('pose refreshToken sur /api/auth et accessToken sur /', async () => {
    const list = cookies(await request(app).post('/set'));
    const refresh = find(list, 'refreshToken', '/api/auth').find(c => c.startsWith('refreshToken=REFRESH'));
    const access = find(list, 'accessToken', '/').find(c => c.startsWith('accessToken=ACCESS'));
    expect(refresh).toBeDefined();
    expect(refresh).toMatch(/HttpOnly/i);
    expect(access).toBeDefined();
  });

  it("efface l'ancien refreshToken de chemin / à la pose", async () => {
    const list = cookies(await request(app).post('/set'));
    const legacy = find(list, 'refreshToken', '/');
    expect(legacy).toHaveLength(1);
    expect(expired(legacy[0])).toBe(true);
  });

  it('efface refreshToken sur les deux chemins et accessToken sur / à la déconnexion', async () => {
    const list = cookies(await request(app).post('/clear'));
    expect(find(list, 'refreshToken', '/api/auth').filter(expired)).toHaveLength(1);
    expect(find(list, 'refreshToken', '/').filter(expired)).toHaveLength(1);
    expect(find(list, 'accessToken', '/').filter(expired)).toHaveLength(1);
  });
});
