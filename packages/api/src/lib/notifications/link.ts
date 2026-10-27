/**
 * Normalisation des liens de notification.
 *
 * - Un lien absolu vers l'origine de l'application (FRONTEND_URL / CLIENT_URL)
 *   est ramene a son chemin relatif.
 * - Un lien absolu vers une autre origine, ou protocol-relatif, ou d'un autre
 *   schema (javascript:, data:...), est supprime (null) : un lien de
 *   notification ne sort jamais de l'application.
 * L'environnement est lu via `config/env`, jamais `process.env` directement.
 */
import { env } from '../../config/env';

function appOrigins(): string[] {
  const origins: string[] = [];
  for (const raw of [env.FRONTEND_URL, env.CLIENT_URL]) {
    if (!raw) continue;
    try {
      origins.push(new URL(raw).origin);
    } catch {
      // URL de configuration invalide : ignoree.
    }
  }
  return origins;
}

// Caractere de controle ou espace : jamais dans un lien (injection d'en-tete, contournement de filtre).
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000-\u001F\u007F\s]/;
// Chemin relatif final : un seul « / » initial, jamais « // » ni « /\ », sans espace.
const SAFE_RELATIVE_PATH = /^\/(?![/\\])[^\s]*$/;

export function normalizeLink(link: string | null | undefined): string | null {
  const normalized = normalizeLinkLoose(link);
  if (!normalized) return null;
  if (FORBIDDEN_CHARS.test(normalized) || !SAFE_RELATIVE_PATH.test(normalized)) return null;
  return normalized;
}

function normalizeLinkLoose(link: string | null | undefined): string | null {
  // Pas de trim silencieux : un caractere de controle ou un espace interne/final est refuse.
  const value = link;
  if (!value) return null;
  if (FORBIDDEN_CHARS.test(value)) return null;
  // protocol-relatif ("//hote", "\\hote", "/\hote") : autre origine
  if (value.startsWith('//') || value.startsWith('\\\\') || value.startsWith('/\\') || value.startsWith('\\/')) {
    return null;
  }
  if (value.startsWith('/')) return value;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!appOrigins().includes(url.origin)) return null;
      return `${url.pathname}${url.search}${url.hash}` || '/';
    } catch {
      return null;
    }
  }
  // Autre schema (javascript:, data:, mailto:...) : refuse ; chemin relatif nu : conserve.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  return value;
}

/** Lien utilisable hors de l'application (e-mail, SMS) : chemin relatif -> URL absolue. */
export function toAbsoluteLink(link: string | null | undefined): string | null {
  if (!link) return null;
  if (!link.startsWith('/')) return link;
  const origin = appOrigins()[0];
  return origin ? `${origin}${link}` : link;
}
