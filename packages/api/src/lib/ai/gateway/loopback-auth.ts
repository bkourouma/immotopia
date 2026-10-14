import type { Request } from 'express';

/**
 * Rejoue, pour la passerelle, l'authentification de la requête de chat : même
 * jeton (cookie `accessToken` en priorité, sinon `Authorization: Bearer`, comme
 * `middleware/auth-middleware.ts`), donc même identité et mêmes droits. Aucun
 * compte de service.
 *
 * Renvoie une FONCTION : le jeton n'est lisible ni sur le contexte d'outil
 * (`JSON.stringify`, journaux) ni dans un résultat renvoyé au modèle.
 * `X-Forwarded-For` reprend l'IP de l'appelant pour que les limiteurs et le
 * journal d'audit voient l'utilisateur, pas 127.0.0.1 (`trust proxy` actif).
 */
export function loopbackHeadersFor(req: Request): (() => Record<string, string>) | undefined {
  const cookieToken = typeof req.cookies?.accessToken === 'string' ? req.cookies.accessToken : undefined;
  const header = req.headers.authorization;
  const token = cookieToken || (header ? header.split(' ')[1] : undefined);
  if (!token) return undefined;
  const ip = req.ip;
  return () => ({ Authorization: `Bearer ${token}`, ...(ip ? { 'X-Forwarded-For': ip } : {}) });
}
