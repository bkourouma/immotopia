/**
 * Identifiant de requête d'une écriture terrain du stock (spec B3-R2, ecrans
 * §3.7).
 *
 * Le contrat exige un UUID (`ClientRequestId`, `format: uuid`) :
 * `crypto.randomUUID()` quand il existe, **sinon un UUID v4 construit avec
 * `crypto.getRandomValues`**. `randomUUID` manque sur les navigateurs Android
 * anciens et hors contexte sécurisé — exactement la cible de l'écran Magasin —
 * et le repli « identifiant + Math.random() » d'autres écrans n'est pas un UUID
 * (le serveur le refuserait).
 *
 * Cycle de vie, dans tous les formulaires d'écriture : tiré à l'ouverture,
 * gardé tel quel à chaque nouvel essai (y compris après une coupure réseau),
 * jeté après un succès ou après un refus qui oblige à modifier le formulaire.
 */

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
};

function cryptoSource(): CryptoLike | undefined {
  return (globalThis as unknown as { crypto?: CryptoLike }).crypto;
}

function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  const source = cryptoSource();
  if (source && typeof source.getRandomValues === 'function') {
    source.getRandomValues(bytes);
    return bytes;
  }
  // Dernier recours, sans API cryptographique du tout : l'identifiant ne sert
  // qu'à reconnaître un rejeu de la même personne, pas à protéger un secret.
  for (let index = 0; index < count; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/** Un UUID v4 construit à la main (version 4, variante RFC 4122). */
export function uuidV4FromRandomBytes(bytes: Uint8Array): string {
  const octets = Uint8Array.from(bytes.slice(0, 16));
  octets[6] = (octets[6] & 0x0f) | 0x40;
  octets[8] = (octets[8] & 0x3f) | 0x80;
  const hex = Array.from(octets, octet => octet.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Un nouvel identifiant de requête (UUID v4). */
export function nouvelIdentifiantDeRequete(): string {
  const source = cryptoSource();
  if (source && typeof source.randomUUID === 'function') {
    return source.randomUUID();
  }
  return uuidV4FromRandomBytes(randomBytes(16));
}
