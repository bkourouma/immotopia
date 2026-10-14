import { promises as dns } from 'dns';
import net from 'net';
import { MediaFetchError } from '../types';

/**
 * Garde SSRF du téléchargement des médias WhatsApp (lot 041, spec W6-R9).
 *
 * Seule l'URL rendue par `GET /{version}/{media-id}` de l'API Graph est suivie,
 * jamais une URL venue du corps du webhook. Elle doit :
 * - être en `https`, sans identifiants, sur le port 443 ;
 * - avoir pour hôte EXACT l'un de `META_WA_MEDIA_HOSTS` ;
 * - ne résoudre vers AUCUNE adresse privée, de bouclage, de lien local,
 *   multidiffusion ou réservée.
 * Les redirections ne sont jamais suivies (`redirect: 'manual'` à l'appel).
 *
 * Limite assumée : la résolution DNS est contrôlée avant l'appel, puis refaite
 * par le client HTTP (rebinding DNS entre les deux non couvert). L'hôte est de
 * toute façon restreint à une liste blanche de noms Meta.
 */

export type HostLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

/** Résolution DNS réelle : toutes les adresses de l'hôte. */
export const systemHostLookup: HostLookup = async hostname => dns.lookup(hostname, { all: true, verbatim: true });

function ipv4ToInt(address: string): number {
  return address.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const IPV4_BLOCKED_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8], // « ce réseau »
  ['10.0.0.0', 8], // privé
  ['100.64.0.0', 10], // NAT des opérateurs
  ['127.0.0.0', 8], // bouclage
  ['169.254.0.0', 16], // lien local (métadonnées des clouds)
  ['172.16.0.0', 12], // privé
  ['192.0.0.0', 24], // réservé IETF
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // privé
  ['198.18.0.0', 15], // bancs d'essai
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multidiffusion
  ['240.0.0.0', 4] // réservé, diffusion comprise
];

function isBlockedIpv4(address: string): boolean {
  const value = ipv4ToInt(address);
  return IPV4_BLOCKED_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

/** Développe une adresse IPv6 en huit groupes de 16 bits ; `null` si illisible. */
function expandIpv6(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf('%');
  if (zone >= 0) text = text.slice(0, zone);
  // Forme mixte `::ffff:1.2.3.4` : les deux derniers groupes viennent de l'IPv4.
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  let trailing: number[] = [];
  if (net.isIPv4(tail)) {
    const v4 = ipv4ToInt(tail);
    trailing = [(v4 >>> 16) & 0xffff, v4 & 0xffff];
    text = `${text.slice(0, lastColon + 1)}0:0`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string): number[] =>
    part.length === 0 ? [] : part.split(':').map(group => parseInt(group, 16));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...new Array(missing).fill(0), ...rest];
  if (groups.length !== 8 || groups.some(group => Number.isNaN(group) || group < 0 || group > 0xffff)) return null;
  if (trailing.length === 2) {
    groups[6] = trailing[0];
    groups[7] = trailing[1];
  }
  return groups;
}

function isBlockedIpv6(address: string): boolean {
  const groups = expandIpv6(address);
  if (!groups) return true;
  const allZeroUntil = (index: number) => groups.slice(0, index).every(group => group === 0);
  // :: et ::1
  if (allZeroUntil(7) && (groups[7] === 0 || groups[7] === 1)) return true;
  // ::ffff:a.b.c.d (IPv4 mappée) et ::a.b.c.d (compatible, obsolète) : règle IPv4.
  if (allZeroUntil(5) && (groups[5] === 0xffff || groups[5] === 0)) {
    const v4 = `${groups[6] >>> 8}.${groups[6] & 0xff}.${groups[7] >>> 8}.${groups[7] & 0xff}`;
    return isBlockedIpv4(v4);
  }
  // 64:ff9b::/96 (NAT64) : l'IPv4 embarquée décide.
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every(group => group === 0)) {
    const v4 = `${groups[6] >>> 8}.${groups[6] & 0xff}.${groups[7] >>> 8}.${groups[7] & 0xff}`;
    return isBlockedIpv4(v4);
  }
  const first = groups[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7, adresses uniques locales
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10, lien local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10, site local (obsolète)
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8, multidiffusion
  if (first === 0x2001 && groups[1] === 0x0db8) return true; // documentation
  return false;
}

/** Vrai si l'adresse IP ne doit jamais être jointe par le serveur. Une valeur illisible est refusée. */
export function isBlockedAddress(address: string): boolean {
  if (net.isIPv4(address)) return isBlockedIpv4(address);
  if (net.isIPv6(address)) return isBlockedIpv6(address);
  return true;
}

/**
 * Vérifie l'URL d'un média avant tout appel réseau vers elle. Rend l'URL
 * analysée ; lève `MediaFetchError('HOST_NOT_ALLOWED')` sinon. Le message
 * d'erreur ne contient jamais l'URL (elle est signée).
 */
export async function assertMediaUrlAllowed(
  rawUrl: string,
  allowedHosts: readonly string[],
  lookup: HostLookup = systemHostLookup
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new MediaFetchError('HOST_NOT_ALLOWED', 'URL de média illisible.');
  }
  if (url.protocol !== 'https:') {
    throw new MediaFetchError('HOST_NOT_ALLOWED', 'URL de média hors https.');
  }
  if (url.username || url.password) {
    throw new MediaFetchError('HOST_NOT_ALLOWED', 'URL de média avec identifiants.');
  }
  if (url.port !== '' && url.port !== '443') {
    throw new MediaFetchError('HOST_NOT_ALLOWED', 'URL de média sur un port autre que 443.');
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (net.isIP(hostname.replace(/^\[|\]$/g, '')) !== 0) {
    throw new MediaFetchError('HOST_NOT_ALLOWED', 'URL de média sur une adresse IP.');
  }
  const allowed = allowedHosts.map(host => host.toLowerCase());
  if (!allowed.includes(hostname)) {
    throw new MediaFetchError('HOST_NOT_ALLOWED', 'Hôte de média hors de la liste autorisée.');
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname);
  } catch {
    throw new MediaFetchError('HTTP', "Résolution DNS de l'hôte de média impossible.");
  }
  if (addresses.length === 0 || addresses.some(entry => isBlockedAddress(entry.address))) {
    throw new MediaFetchError('HOST_NOT_ALLOWED', 'Hôte de média résolu vers une adresse interdite.');
  }
  return url;
}
