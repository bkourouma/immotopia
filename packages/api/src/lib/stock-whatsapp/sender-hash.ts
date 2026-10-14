import crypto from 'crypto';
import { env } from '../../config/env';

/**
 * Empreinte de l'expéditeur d'un message WhatsApp (lot 041, spec W6-R8).
 *
 * `WhatsappCloudEvent` est un modèle GLOBAL (l'agence n'est pas connue à la
 * réception) : il ne porte jamais le numéro en clair, seulement cette
 * empreinte, qui sert à ne répondre M01 qu'une fois par 24 heures à un
 * inconnu (W7-R1).
 *
 * HMAC-SHA256 du numéro E.164 avec `META_WA_APP_SECRET`, en hexadécimal
 * (64 caractères, colonne `sender_hash CHAR(64)`). Avec le transport `meta`, la
 * clé est toujours présente (`src/config/env.ts` l'exige). Hors `meta`
 * (transport `log`, simulateur, tests) et sans clé, une clé de repli fixe
 * `'dev'` est utilisée : l'empreinte n'y protège que des numéros de recette.
 */
const DEV_FALLBACK_KEY = 'dev';

function senderHashKey(): string {
  if (env.META_WA_APP_SECRET) return env.META_WA_APP_SECRET;
  if (env.WHATSAPP_INVENTORY_TRANSPORT === 'meta') {
    // Inatteignable : la configuration refuse de démarrer sans la clé en `meta`.
    throw new Error('META_WA_APP_SECRET requis avec WHATSAPP_INVENTORY_TRANSPORT=meta');
  }
  return DEV_FALLBACK_KEY;
}

/** HMAC-SHA256(META_WA_APP_SECRET, e164) en hexadécimal ; clé de repli `'dev'` seulement hors `meta`. */
export function hashSender(e164: string): string {
  return crypto.createHmac('sha256', senderHashKey()).update(e164, 'utf8').digest('hex');
}
