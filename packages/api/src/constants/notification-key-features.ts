/**
 * Fonctionnalité d'abonnement dont dépend chaque événement de notification
 * (e-mail et WhatsApp). Une clé absente relève du socle (`CORE`) : maintenance,
 * documents, invitations, réinitialisation de mot de passe, message libre…
 *
 * Sert à ne proposer, en mode `enforce`, que les événements des modules que
 * l'agence possède (`lib/subscription/notification-feature-gate.ts`).
 */
import type { Feature } from '../lib/subscription/features';

export const NOTIFICATION_KEY_FEATURES: Readonly<Record<string, Feature>> = {
  // Gestion locative
  PAYMENT_DECLARATION_AGENCY: 'RENTAL',
  PAYMENT_APPROVED_TENANT: 'RENTAL',
  PAYMENT_APPROVED_OWNER: 'RENTAL',
  PAYMENT_REJECTED_TENANT: 'RENTAL',
  PAYMENT_REJECTED_OWNER: 'RENTAL',
  PAYMENT_ALLOCATED_TENANT: 'RENTAL',
  PAYMENT_ALLOCATED_OWNER: 'RENTAL',
  INSTALLMENT_DUE_REMINDER: 'RENTAL',
  INSTALLMENT_OVERDUE: 'RENTAL',
  LEASE_ACTIVATED: 'RENTAL',
  LEASE_ENDING_SOON: 'RENTAL',
  DEPOSIT_MOVEMENT_TENANT: 'RENTAL',
  DEPOSIT_MOVEMENT_OWNER: 'RENTAL',
  OWNER_STATEMENT_SENT: 'RENTAL',
  // CRM
  DEAL_CREATED: 'CRM',
  DEAL_STAGE_CHANGED: 'CRM',
  APPOINTMENT_REMINDER: 'CRM',
  CRM_CONTACT_GROUP_INVITE: 'CRM',
  PROPERTY_PUBLISHED_GROUP_BROADCAST: 'CRM',
  // Syndic
  CHARGE_CALL_ISSUED: 'SYNDIC',
  CHARGE_CALL_REMINDER: 'SYNDIC',
  CHARGE_PAYMENT_RECEIPT: 'SYNDIC',
  CHARGE_CALL_SETTLED: 'SYNDIC',
  GENERAL_MEETING_CONVOCATION: 'SYNDIC',
  GENERAL_MEETING_MINUTES: 'SYNDIC',
  CONTRACT_RENEWAL_ALERT: 'SYNDIC',
  COMMON_AREA_INCIDENT: 'SYNDIC',
  // Patrimoine (alertes d'échéance et rapport mensuel du propriétaire inclus)
  LOAN_MATURITY_ALERT: 'PATRIMOINE',
  DOCUMENT_EXPIRY_ALERT: 'PATRIMOINE',
  WORK_PROGRAM_REMINDER: 'PATRIMOINE',
  LAND_STEP_OVERDUE_ALERT: 'PATRIMOINE',
  OWNER_LEASE_ENDING_SOON: 'PATRIMOINE',
  OWNER_DOCUMENT_EXPIRY_ALERT: 'PATRIMOINE',
  OWNER_MONTHLY_REPORT_SENT: 'PATRIMOINE'
};

export function featureOfNotificationKey(key: string): Feature {
  return NOTIFICATION_KEY_FEATURES[key] ?? 'CORE';
}
