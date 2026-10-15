import crypto from 'crypto';
import { env } from '../../config/env';
import { replaceControlChars } from './text';

/**
 * Éléments de preuve : empreintes de texte et d'IP (spec 043, SG-R5, SG-R7).
 * L'IP n'est jamais stockée en clair : HMAC-SHA256 à clé dérivée de `JWT_SECRET`
 * (une empreinte sans secret se retrouverait par balayage des adresses) et une
 * forme tronquée (/24 en IPv4, /48 en IPv6) pour le certificat.
 */

export function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function derivedKey(label: string): Buffer {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(label).digest();
}

/** Empreinte HMAC hexadécimale de l'IP du signataire. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return crypto.createHmac('sha256', derivedKey('immotopia:signature:ip:v1')).update(ip, 'utf8').digest('hex');
}

/** IPv4 -> `a.b.c.0/24` ; IPv6 -> 3 premiers groupes `/48` ; sinon `null`. */
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v4 = ip.replace(/^::ffff:/i, '');
  const m4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(v4);
  if (m4) return `${m4[1]}.${m4[2]}.${m4[3]}.0/24`;
  if (ip.includes(':')) {
    const groups = ip.split(':').filter(Boolean).slice(0, 3);
    return groups.length > 0 ? `${groups.join(':')}::/48` : null;
  }
  return null;
}

export function truncateUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  return replaceControlChars(userAgent).slice(0, 200);
}
