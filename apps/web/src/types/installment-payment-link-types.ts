/** Types du lien de paiement Mobile Money d'une échéance de loyer (spec 039, lot C5). */

export type InstallmentPaymentLinkDelivery = 'SEND' | 'COPY';

export type InstallmentPaymentLinkStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export type InstallmentPaymentLinkPaymentStatus =
  'NONE' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED' | 'EXPIRED' | 'REVIEW';

export type InstallmentLinkNotSentReason =
  'NO_ELIGIBLE_CHANNEL' | 'EVENT_DISABLED' | 'SEND_FAILED' | 'RENTER_CONTACT_NOT_FOUND';

/** Réponse de la création en mode COPY : l'URL (jeton en clair) n'est renvoyée qu'ici, une seule fois. */
export interface InstallmentPaymentLinkCopyResult {
  linkId: string;
  url: string;
  expiresAt: string;
  amountDue: number;
  currency: string;
}

/** Réponse de la création en mode SEND. */
export interface InstallmentPaymentLinkSendResult {
  sent: boolean;
  channel?: 'WHATSAPP' | 'EMAIL' | null;
  reason?: InstallmentLinkNotSentReason;
  linkId?: string;
  expiresAt?: string;
  amountDue?: number;
  currency?: string;
}

export interface InstallmentPaymentLinkSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: InstallmentPaymentLinkStatus;
  viewCount: number;
  lastViewedAt: string | null;
  createdByUserId: string | null;
  payment: {
    status: InstallmentPaymentLinkPaymentStatus;
    amount: number | null;
    updatedAt: string | null;
  };
}
