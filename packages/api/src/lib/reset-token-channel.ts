import crypto from 'crypto';

/**
 * Canal de livraison d'un jeton de réinitialisation de mot de passe.
 *
 * Utiliser le lien prouve le contrôle de l'adresse e-mail seulement si le lien
 * a été livré à cette adresse. Un lien communiqué par un autre canal (WhatsApp
 * vers un numéro saisi par l'agence) prouve seulement le contrôle de ce canal :
 * il ne doit jamais valider l'e-mail du compte, sinon le collaborateur qui
 * saisit l'e-mail d'un tiers et son propre numéro s'approprie le compte.
 *
 * Le schéma ne porte pas le canal ; le jeton le porte : le préfixe `wa-`
 * marque un jeton partagé hors e-mail. Par défaut (sans préfixe), le jeton est
 * réputé livré par e-mail, comme le « mot de passe oublié ».
 */
export const SHARED_OUT_OF_BAND_PREFIX = 'wa-';

/** Jeton qui sera aussi communiqué hors e-mail (WhatsApp, lien affiché à l'agence). */
export function newOutOfBandResetToken(): string {
  return `${SHARED_OUT_OF_BAND_PREFIX}${crypto.randomUUID()}`;
}

/** Vrai si l'usage de ce jeton peut valider l'adresse e-mail du compte. */
export function provesEmailOwnership(token: string): boolean {
  return !token.startsWith(SHARED_OUT_OF_BAND_PREFIX);
}
