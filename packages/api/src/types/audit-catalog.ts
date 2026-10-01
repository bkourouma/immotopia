import { AuditActionKey, AuditCategoryValue, AuditVisibilityValue } from './audit-types';

/**
 * Catalogue des actions auditées (ADR-006, specs/023-audit-deux-niveaux §4).
 *
 * Chaque `AuditActionKey` déclare ici de quel niveau elle relève :
 *   - `visibility` : `TENANT` = l'agence concernée peut la lire ;
 *     `PLATFORM_ONLY` = réservée à la plateforme (réglages internes, marqueurs
 *     techniques) ;
 *   - `category` : famille d'action, pour filtrer ;
 *   - `critical` : la trace doit être écrite DANS la transaction métier
 *     (`recordAuditEvent(tx, …)`), pas dans la file asynchrone ;
 *   - `redact` : clés supplémentaires à masquer dans `payload` / `changes`, en
 *     plus des clés sensibles masquées partout (`audit-entry-builder.ts`).
 *
 * `Record<AuditActionKey, …>` : le compilateur refuse une clé sans entrée, et
 * `__tests__/unit/audit-catalog.test.ts` le vérifie aussi à l'exécution.
 */
export interface AuditCatalogEntry {
  category: AuditCategoryValue;
  visibility: AuditVisibilityValue;
  critical?: boolean;
  redact?: string[];
}

type Extra = Pick<AuditCatalogEntry, 'critical' | 'redact'>;

/** Visible de l'agence concernée. */
const tenant = (category: AuditCategoryValue, extra: Extra = {}): AuditCatalogEntry => ({
  category,
  visibility: 'TENANT',
  ...extra
});

/** Réservée à la plateforme : jamais montrée à l'agence. */
const internal = (category: AuditCategoryValue, extra: Extra = {}): AuditCatalogEntry => ({
  category,
  visibility: 'PLATFORM_ONLY',
  ...extra
});

export const AUDIT_CATALOG: Record<AuditActionKey, AuditCatalogEntry> = {
  // Authentification
  [AuditActionKey.AUTH_LOGIN_SUCCEEDED]: tenant('AUTH'),
  [AuditActionKey.AUTH_LOGIN_FAILED]: tenant('AUTH'),
  [AuditActionKey.AUTH_LOGOUT]: tenant('AUTH'),
  [AuditActionKey.AUTH_GOOGLE_LOGIN]: tenant('AUTH'),
  [AuditActionKey.AUTH_TOKEN_REFRESHED]: tenant('AUTH'),
  [AuditActionKey.AUTH_TOKEN_REUSE_DETECTED]: tenant('SECURITY', { critical: true }),
  [AuditActionKey.AUTH_PASSWORD_RESET_REQUESTED]: tenant('AUTH'),
  [AuditActionKey.AUTH_PASSWORD_RESET_COMPLETED]: tenant('SECURITY', { critical: true }),
  [AuditActionKey.AUTH_EMAIL_VERIFIED]: tenant('AUTH'),

  // Agences
  [AuditActionKey.TENANT_CREATED]: tenant('ADMIN'),
  [AuditActionKey.TENANT_UPDATED]: tenant('ADMIN'),
  [AuditActionKey.TENANT_SUSPENDED]: tenant('ADMIN', { critical: true }),
  [AuditActionKey.TENANT_ACTIVATED]: tenant('ADMIN', { critical: true }),
  [AuditActionKey.TENANT_DATA_EXPORT_REQUESTED]: tenant('EXPORT', { critical: true }),
  [AuditActionKey.TENANT_DATA_EXPORT_DOWNLOADED]: tenant('EXPORT', { critical: true }),
  [AuditActionKey.TENANT_DATA_EXPORT_DELETED]: tenant('EXPORT'),

  // Modules
  [AuditActionKey.MODULE_ENABLED]: tenant('ADMIN'),
  [AuditActionKey.MODULE_DISABLED]: tenant('ADMIN'),

  // Utilisateurs et rôles
  [AuditActionKey.USER_INVITED]: tenant('ADMIN'),
  [AuditActionKey.USER_CREATED]: tenant('ADMIN'),
  [AuditActionKey.USER_UPDATED]: tenant('ADMIN'),
  [AuditActionKey.USER_DISABLED]: tenant('ADMIN', { critical: true }),
  [AuditActionKey.USER_ENABLED]: tenant('ADMIN', { critical: true }),
  [AuditActionKey.ROLE_ASSIGNED]: tenant('SECURITY', { critical: true }),
  [AuditActionKey.ROLE_REMOVED]: tenant('SECURITY', { critical: true }),
  [AuditActionKey.PASSWORD_RESET]: tenant('SECURITY', { critical: true }),
  [AuditActionKey.SESSIONS_REVOKED]: tenant('SECURITY', { critical: true }),

  // Abonnements
  [AuditActionKey.SUBSCRIPTION_CREATED]: tenant('BILLING'),
  [AuditActionKey.SUBSCRIPTION_UPDATED]: tenant('BILLING'),
  [AuditActionKey.SUBSCRIPTION_CANCELED]: tenant('BILLING', { critical: true }),
  [AuditActionKey.SUBSCRIPTION_ITEM_ADDED]: tenant('BILLING'),
  [AuditActionKey.SUBSCRIPTION_ITEM_REMOVED]: tenant('BILLING'),
  [AuditActionKey.SUBSCRIPTION_PACK_CHANGED]: tenant('BILLING'),
  [AuditActionKey.SUBSCRIPTION_SETTINGS_UPDATED]: internal('BILLING'),
  [AuditActionKey.SUBSCRIPTION_MIGRATED_TO_PACKS]: internal('BILLING'),
  [AuditActionKey.CAPACITY_OVERRIDE_GRANTED]: internal('BILLING', { critical: true }),
  [AuditActionKey.CAPACITY_OVERRIDE_REVOKED]: internal('BILLING', { critical: true }),
  [AuditActionKey.SUBSCRIPTION_MANUAL_READ_ONLY_SET]: tenant('BILLING', { critical: true }),
  [AuditActionKey.SUBSCRIPTION_MANUAL_READ_ONLY_CLEARED]: tenant('BILLING', { critical: true }),
  [AuditActionKey.CATALOG_ITEM_UPDATED]: internal('BILLING'),
  [AuditActionKey.MODULE_OVERRIDE_CLEARED]: internal('BILLING'),
  [AuditActionKey.SUBSCRIPTION_ITEM_UPDATED]: tenant('BILLING'),
  [AuditActionKey.SUBSCRIPTION_EXTENSION_REQUESTED]: tenant('BILLING'),
  [AuditActionKey.SUBSCRIPTION_EXTENSION_REQUEST_HANDLED]: tenant('BILLING'),
  [AuditActionKey.PLATFORM_PAYMENT_STARTED]: tenant('BILLING'),

  // Factures
  [AuditActionKey.INVOICE_CREATED]: tenant('BILLING'),
  [AuditActionKey.INVOICE_MARKED_PAID]: tenant('BILLING', { critical: true }),
  [AuditActionKey.INVOICE_CANCELED]: tenant('BILLING', { critical: true }),
  [AuditActionKey.INVOICE_ISSUED]: tenant('BILLING'),
  [AuditActionKey.INVOICE_CREDIT_NOTE_ISSUED]: tenant('BILLING', { critical: true }),

  // CRM
  [AuditActionKey.CRM_FOLLOWUP_RESCHEDULED]: tenant('DATA'),
  [AuditActionKey.CRM_FOLLOWUP_MARKED_DONE]: tenant('DATA'),

  // Biens
  [AuditActionKey.PROPERTY_CREATED]: tenant('DATA'),
  [AuditActionKey.PROPERTY_UPDATED]: tenant('DATA'),
  [AuditActionKey.PROPERTY_DELETED]: tenant('DATA', { critical: true }),
  [AuditActionKey.PROPERTY_PUBLISHED]: tenant('DATA'),
  [AuditActionKey.PROPERTY_UNPUBLISHED]: tenant('DATA'),
  [AuditActionKey.PROPERTY_STATUS_CHANGED]: tenant('DATA'),
  [AuditActionKey.PROPERTY_MEDIA_UPLOADED]: tenant('DATA'),
  [AuditActionKey.PROPERTY_DOCUMENT_UPLOADED]: tenant('DATA'),
  [AuditActionKey.PROPERTY_MANDATE_CREATED]: tenant('DATA'),
  [AuditActionKey.PROPERTY_MANDATE_REVOKED]: tenant('DATA', { critical: true }),
  [AuditActionKey.PROPERTY_VISIT_SCHEDULED]: tenant('DATA'),

  // Syndic
  [AuditActionKey.SYNDICATE_FUND_CREATED]: tenant('DATA'),
  [AuditActionKey.SYNDICATE_FUND_RENAMED]: tenant('DATA'),
  [AuditActionKey.SYNDICATE_FUND_BALANCE_ADJUSTED]: tenant('DATA', { critical: true }),
  [AuditActionKey.SYNDICATE_FUND_ASSIGNMENT_CHANGED]: tenant('DATA'),
  [AuditActionKey.SYNDIC_PROVIDER_INVOICE_FILE_ATTACHED]: tenant('DATA'),
  [AuditActionKey.SYNDIC_PROVIDER_INVOICE_FILE_REPLACED]: tenant('DATA'),
  [AuditActionKey.SYNDIC_PROVIDER_INVOICE_FILE_REMOVED]: tenant('DATA'),
  [AuditActionKey.SYNDIC_COOWNER_PORTAL_INVITED]: tenant('ADMIN'),
  [AuditActionKey.SYNDIC_COOWNER_PORTAL_REVOKED]: tenant('SECURITY', { critical: true }),
  [AuditActionKey.SYNDIC_CHARGE_RECEIPT_EMAIL_RESENT]: tenant('DATA'),

  // Identité des documents
  [AuditActionKey.DOCUMENT_SIGNATURE_UPLOADED]: tenant('DATA'),
  [AuditActionKey.DOCUMENT_SIGNATURE_REMOVED]: tenant('DATA'),

  // Patrimoine : marqueurs anti-doublon des alertes d'échéance (`entityType` /
  // `entityId`), pas des actions d'un utilisateur : jamais montrés à l'agence.
  [AuditActionKey.PATRIMOINE_LEASE_END_ALERT_SENT]: internal('SYSTEM'),
  [AuditActionKey.PATRIMOINE_LOAN_MATURITY_ALERT_SENT]: internal('SYSTEM'),
  [AuditActionKey.PATRIMOINE_WORK_UPCOMING_ALERT_SENT]: internal('SYSTEM'),

  // ImmoCopilot
  [AuditActionKey.AI_CHAT_TURN]: tenant('AI'),
  [AuditActionKey.AI_TOOL_CALLED]: tenant('AI'),
  [AuditActionKey.AI_TOOL_DENIED]: tenant('SECURITY'),
  [AuditActionKey.AI_PROPOSAL_ISSUED]: tenant('AI'),
  [AuditActionKey.AI_PROPOSAL_REDEEMED]: tenant('AI'),
  [AuditActionKey.AI_ACTION_EXECUTED]: tenant('AI', { critical: true }),
  [AuditActionKey.AI_ACTION_REJECTED]: tenant('AI'),
  [AuditActionKey.AI_SETTINGS_UPDATED]: internal('AI', { critical: true }),

  // CRM (clés historiques, longtemps passées en chaîne libre)
  [AuditActionKey.CRM_ACTIVITY_CREATED]: tenant('DATA'),
  [AuditActionKey.CRM_CONTACT_CREATED]: tenant('DATA'),
  [AuditActionKey.CRM_CONTACT_UPDATED]: tenant('DATA'),
  [AuditActionKey.CRM_CONTACT_DELETED]: tenant('DATA', { critical: true }),
  [AuditActionKey.CRM_CONTACT_CONVERTED]: tenant('DATA'),
  [AuditActionKey.CRM_CONTACT_ROLES_UPDATED]: tenant('DATA'),
  [AuditActionKey.CRM_CONTACT_ROLE_DELETED]: tenant('DATA'),
  [AuditActionKey.CRM_DEAL_CREATED]: tenant('DATA'),

  // Documents
  [AuditActionKey.DOCUMENT_GENERATED]: tenant('DATA'),
  [AuditActionKey.DOCUMENT_REGENERATED]: tenant('DATA'),
  [AuditActionKey.DOCUMENT_TEMPLATE_UPLOADED]: tenant('ADMIN'),
  [AuditActionKey.DOCUMENT_TEMPLATE_ACTIVATED]: tenant('ADMIN'),
  [AuditActionKey.DOCUMENT_TEMPLATE_DEACTIVATED]: tenant('ADMIN'),
  [AuditActionKey.DOCUMENT_TEMPLATE_SET_DEFAULT]: tenant('ADMIN'),
  [AuditActionKey.DOCUMENT_TEMPLATE_DELETED]: tenant('ADMIN', { critical: true }),

  // Maintenance
  [AuditActionKey.MAINTENANCE_TICKET_CREATED]: tenant('DATA'),
  [AuditActionKey.MAINTENANCE_VENDOR_CREATED]: tenant('DATA'),
  [AuditActionKey.MAINTENANCE_VENDOR_UPDATED]: tenant('DATA'),
  [AuditActionKey.MAINTENANCE_VENDOR_DEACTIVATED]: tenant('DATA'),
  [AuditActionKey.MAINTENANCE_VENDOR_DELETED]: tenant('DATA', { critical: true }),

  // Location
  [AuditActionKey.RENTAL_LEASE_CREATED]: tenant('DATA'),
  [AuditActionKey.RENTAL_LEASE_UPDATED]: tenant('DATA'),
  [AuditActionKey.RENTAL_LEASE_STATUS_UPDATED]: tenant('DATA'),
  [AuditActionKey.RENTAL_LEASE_DELETED]: tenant('DATA', { critical: true }),
  [AuditActionKey.RENTAL_LEASE_CO_RENTER_ADDED]: tenant('DATA'),
  [AuditActionKey.RENTAL_LEASE_CO_RENTER_REMOVED]: tenant('DATA'),
  [AuditActionKey.RENTAL_LEASE_RENT_REVISED]: tenant('DATA'),
  [AuditActionKey.RENTAL_LEASE_RENEWED]: tenant('DATA'),
  [AuditActionKey.RENTAL_LEASE_AMENDED]: tenant('DATA'),
  [AuditActionKey.RENTAL_LEASE_TERMINATED]: tenant('DATA', { critical: true }),
  [AuditActionKey.RENTAL_DOCUMENT_GENERATED]: tenant('DATA'),
  [AuditActionKey.RENTAL_DOCUMENT_STATUS_UPDATED]: tenant('DATA'),
  [AuditActionKey.RENTAL_DEPOSIT_CREATED]: tenant('DATA'),
  [AuditActionKey.RENTAL_DEPOSIT_MOVEMENT_CREATED]: tenant('DATA', { critical: true }),
  [AuditActionKey.RENTAL_INSTALLMENT_MARKED_OVERDUE]: tenant('SYSTEM'),
  [AuditActionKey.RENTAL_PENALTY_CALCULATED]: tenant('SYSTEM'),
  [AuditActionKey.RENTAL_PENALTY_UPDATED]: tenant('DATA'),
  [AuditActionKey.RENTAL_PENALTY_DELETED]: tenant('DATA', { critical: true }),
  [AuditActionKey.RENTAL_PENALTY_JUSTIFICATION_UPLOADED]: tenant('DATA'),

  // Divers
  [AuditActionKey.LOT_REGISTRY_RECONCILED]: internal('SYSTEM'),
  [AuditActionKey.PATRIMOINE_WORK_PROGRAM_COST_OVERRIDDEN]: tenant('DATA'),
  [AuditActionKey.SUBSCRIPTION_PROVISIONED]: tenant('BILLING'),
  [AuditActionKey.TENANT_PROVISIONED]: tenant('ADMIN'),
  [AuditActionKey.SYNDIC_MEETING_CONVOCATION_DELIVERY]: internal('SYSTEM'),

  // Audit de l'audit : consulter le journal est tracé, mais n'est pas montré à l'agence.
  [AuditActionKey.AUDIT_VIEWED]: internal('SECURITY')
};

/** Entrée du catalogue pour une clé, ou `undefined` si la clé est libre (hors enum). */
export function getAuditCatalogEntry(actionKey: string): AuditCatalogEntry | undefined {
  return (AUDIT_CATALOG as Record<string, AuditCatalogEntry | undefined>)[actionKey];
}
