import { z, ZodIssueCode } from 'zod';

/**
 * Lien web saisi par un utilisateur (logo, photo, document, justificatif).
 *
 * `z.string().url()` accepte tout schema d'URL : `javascript:`, `file:`,
 * `data:`… Un tel lien, stocke puis rendu dans un `href` ou suivi par un
 * traitement serveur (export complet d'agence, lot S7), sert de vecteur
 * d'attaque. Ici, seuls `http://` et `https://` passent.
 *
 * Aucun champ qui utilise ce validateur ne recoit de chemin interne
 * `/uploads/...` par cette voie : les services d'upload ecrivent ces chemins
 * directement en base, sans repasser par le schema (et `z.string().url()`
 * les refusait deja).
 *
 * L'erreur reprend le code Zod d'une URL invalide (`invalid_string`/`url`) :
 * le message par defaut, traduit, est celui de `lib/zod-error-map.ts`.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function httpUrl(message?: string) {
  return z.string().superRefine((value, ctx) => {
    if (!isHttpUrl(value)) {
      ctx.addIssue({ code: ZodIssueCode.invalid_string, validation: 'url', ...(message ? { message } : {}) });
    }
  });
}
