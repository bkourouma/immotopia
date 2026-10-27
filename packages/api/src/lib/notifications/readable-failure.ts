/**
 * Motif d'echec LISIBLE et traduit pour le journal des notifications (admin
 * d'agence, plateforme). La base garde le motif technique borne de
 * `describeFailure` (« Error EAUTH ») ou un texte fixe d'un canal : cette
 * fonction le traduit a la lecture, ce qui couvre aussi les lignes deja
 * ecrites. Meme sens que les notes d'execution des programmations
 * (`lib/syndics/email-error.ts`).
 */
import { t } from '../../i18n';

const SMTP_REJECTED_CODES = /\b(EAUTH|EENVELOPE|EMESSAGE)\b/;
const TIMEOUT_CODES = /\b(ETIMEDOUT|ETIMEOUT|ESOCKETTIMEDOUT|ECONNRESET|ECONNECTION)\b/;
const UNREACHABLE_CODES = /\b(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EDNS)\b/;
/** Forme produite par `describeFailure` : un nom d'erreur (`Error`, `TypeError`...), eventuellement suivi d'un code. */
const TECHNICAL = /^(?:[A-Za-z][A-Za-z0-9_.]{0,54})?(?:Error|Exception)(?: ([A-Za-z0-9_.-]{1,40}))?$/;

/** Textes fixes ecrits par les canaux d'envoi (`deliver.ts`, `notify.ts`, WhatsApp). */
function knownReason(raw: string): string | null {
  switch (raw) {
    case 'Aucune adresse e-mail pour ce destinataire.':
      return t('Aucune adresse e-mail pour ce destinataire.');
    case 'Gabarit WhatsApp non fourni.':
      return t('Gabarit WhatsApp non fourni.');
    case 'WhatsApp non envoye (desactive, sans consentement ou sans numero).':
      return t('WhatsApp non envoyé (désactivé, sans consentement ou sans numéro).');
    case 'Aucun numero de telephone valide pour ce destinataire.':
      return t('Aucun numéro de téléphone valide pour ce destinataire.');
    case 'Canal SMS non active.':
      return t('Canal SMS non activé.');
    case "Echec d'envoi du SMS.":
      return t("Échec d'envoi du SMS.");
    case 'Canal inconnu.':
      return t('Canal inconnu.');
    case 'Destinataire sans compte : pas de boite de reception.':
      return t('Destinataire sans compte : pas de boîte de réception.');
    case 'Fournisseur WhatsApp non configure.':
      return t('Fournisseur WhatsApp non configuré.');
    case 'Message WhatsApp vide apres rendu du gabarit.':
      return t('Message WhatsApp vide après rendu du gabarit.');
    case 'Erreur inconnue':
    case 'echec':
      return t("L'envoi a échoué.");
    default:
      return null;
  }
}

function readableSingle(raw: string): string {
  const reason = raw.trim();
  const known = knownReason(reason);
  if (known) return known;
  if (SMTP_REJECTED_CODES.test(reason)) return t("Le serveur de messagerie a refusé l'e-mail.");
  if (TIMEOUT_CODES.test(reason)) return t("Le serveur de messagerie n'a pas répondu à temps.");
  if (UNREACHABLE_CODES.test(reason)) return t("Le serveur d'envoi est injoignable.");
  const technical = TECHNICAL.exec(reason);
  if (technical) {
    return technical[1]
      ? t("L'envoi a échoué (erreur technique {{code}}).", { code: technical[1] })
      : t("L'envoi a échoué (erreur technique).");
  }
  // Texte deja lisible (ou inconnu) : rendu tel quel.
  return reason;
}

function channelName(channel: string): string | null {
  switch (channel) {
    case 'IN_APP':
      return t("Dans l'application");
    case 'EMAIL':
      return t('E-mail');
    case 'WHATSAPP':
      return t('WhatsApp');
    case 'SMS':
      return t('SMS');
    default:
      return null;
  }
}

/**
 * Traduit un motif stocke. Le motif agrege d'une notification
 * (« EMAIL : Error EAUTH ; SMS : ... », voir `aggregateStatus`) est traduit
 * canal par canal.
 */
export function readableFailureReason(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return raw ?? null;
  return raw
    .split(' ; ')
    .map(part => {
      const match = /^([A-Z_]+) : (.*)$/s.exec(part);
      const name = match ? channelName(match[1]) : null;
      return match && name ? `${name} : ${readableSingle(match[2])}` : readableSingle(part);
    })
    .join(' ; ');
}
