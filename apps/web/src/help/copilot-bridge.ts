/**
 * Pont aide -> ImmoCopilot.
 *
 * Le panneau d'aide ne connait pas le tiroir du Copilot : il emet un
 * `CustomEvent` ecoute par `CopilotRoot`, qui ouvre le tiroir avec une question
 * pre-remplie (jamais envoyee automatiquement) et le contexte de la fiche.
 */

export const COPILOT_OPEN_EVENT = 'immotopia:copilot-open';

/** Taille maximale du texte de fiche transmis au serveur. */
export const HELP_EXCERPT_MAX_CHARS = 4000;

export interface CopilotOpenRequest {
  /** Question pre-remplie dans la zone de saisie. */
  draft?: string;
  helpId?: string;
  /** Texte brut de la fiche, deja tronque a `HELP_EXCERPT_MAX_CHARS`. */
  helpExcerpt?: string;
}

export function truncateHelpExcerpt(text: string): string {
  return text.length > HELP_EXCERPT_MAX_CHARS ? text.slice(0, HELP_EXCERPT_MAX_CHARS) : text;
}

export function requestCopilotOpen(request: CopilotOpenRequest): void {
  window.dispatchEvent(
    new CustomEvent<CopilotOpenRequest>(COPILOT_OPEN_EVENT, {
      detail: { ...request, helpExcerpt: request.helpExcerpt ? truncateHelpExcerpt(request.helpExcerpt) : undefined }
    })
  );
}

/** S'abonne aux demandes d'ouverture ; renvoie la fonction de desabonnement. */
export function onCopilotOpenRequest(handler: (request: CopilotOpenRequest) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<CopilotOpenRequest>).detail ?? {});
  window.addEventListener(COPILOT_OPEN_EVENT, listener);
  return () => window.removeEventListener(COPILOT_OPEN_EVENT, listener);
}
