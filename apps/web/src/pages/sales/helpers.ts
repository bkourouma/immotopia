import type { CrmContact } from '../../services/crm-service';
import type { Property } from '../../types/property-types';
import type {
  SaleCommissionMode,
  SaleCommissionPayer,
  SaleDepositHolder,
  SaleFinancing,
  SaleMandateType,
  SaleOfferAction
} from '../../services/sales-service';
import { t } from '../../i18n/t';
import { activeLocale } from '../../i18n/format';

/**
 * Petits utilitaires partagés par les écrans du lot 9 (ventes) : libellés des
 * énumérations du contrat et construction des libellés affichés dans les
 * sélecteurs cherchables (bien, contact CRM).
 */

export function contactLabel(contact: Pick<CrmContact, 'firstName' | 'lastName' | 'legalName' | 'email'>): string {
  const nom = contact.legalName || `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim();
  return contact.email ? `${nom} (${contact.email})` : nom || t('Contact sans nom');
}

export function propertyLabel(property: Pick<Property, 'internalReference' | 'title'>): string {
  return `${property.internalReference} · ${property.title}`;
}

export const MANDATE_TYPE_LABELS: Record<SaleMandateType, string> = {
  SIMPLE: t('Simple'),
  EXCLUSIVE: t('Exclusif')
};

export const COMMISSION_MODE_LABELS: Record<SaleCommissionMode, string> = {
  PERCENT: t('Pourcentage'),
  FIXED: t('Forfait')
};

export const COMMISSION_PAYER_LABELS: Record<SaleCommissionPayer, string> = {
  SELLER: t('Vendeur'),
  BUYER: t('Acquéreur')
};

export const FINANCING_LABELS: Record<SaleFinancing, string> = {
  CASH: t('Comptant'),
  LOAN: t('Crédit'),
  MIXED: t('Mixte')
};

export const DEPOSIT_HOLDER_LABELS: Record<SaleDepositHolder, string> = {
  NOTARY: t('Notaire'),
  SELLER: t('Vendeur')
};

export const OFFER_ACTION_LABELS: Record<SaleOfferAction, string> = {
  COUNTER: t('Contre-offre'),
  ACCEPT: t('Accepter'),
  REJECT: t('Refuser'),
  WITHDRAW: t('Retirer')
};

/** Moyens de paiement d'un règlement de commission — mêmes valeurs que les paiements locatifs. */
export const SALE_PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: t('Espèces'),
  BANK_TRANSFER: t('Virement'),
  MOBILE_MONEY: t('Mobile Money'),
  CHECK: t('Chèque'),
  CARD: t('Carte'),
  OTHER: t('Autre')
};

export function dateCourte(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(activeLocale());
}
