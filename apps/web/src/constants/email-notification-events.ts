/**
 * Retourne le groupe d'événement pour un key (ex: MAINTENANCE_TICKET_CREATED_AGENCY -> MAINTENANCE_TICKET_CREATED).
 * Permet de grouper les configs par événement et d'appliquer un template à plusieurs destinataires.
 */
export function getEventGroupKey(key: string): string {
  if (key.endsWith('_AGENCY')) return key.slice(0, -7);
  if (key.endsWith('_TENANT')) return key.slice(0, -7);
  if (key.endsWith('_OWNER')) return key.slice(0, -6);
  return key;
}

/**
 * Variables suggérées par type d'événement pour les notifications email.
 * Les noms correspondent à la syntaxe {{nomVariable}} utilisée dans les templates.
 */
export const VARIABLES_BY_EVENT_KEY: Record<string, string[]> = {
  MAINTENANCE_TICKET_CREATED_AGENCY: [
    'agencyUserName',
    'renterName',
    'agencyName',
    'ticketTitle',
    'ticketId',
    'propertyReference',
    'ticketCreatedAt',
    'validationUrl'
  ],
  MAINTENANCE_TICKET_CREATED_TENANT: [
    'tenantName',
    'agencyName',
    'ticketTitle',
    'ticketId',
    'propertyReference',
    'ticketCreatedAt',
    'portalUrl'
  ],
  MAINTENANCE_TICKET_CREATED_OWNER: [
    'ownerName',
    'agencyName',
    'renterName',
    'ticketTitle',
    'ticketId',
    'propertyReference',
    'ticketCreatedAt'
  ],
  MAINTENANCE_TICKET_STATUS_CHANGED_TENANT: [
    'tenantName',
    'agencyName',
    'ticketTitle',
    'newStatusLabel',
    'ticketCreatedAt',
    'ticketUpdatedAt',
    'portalUrl'
  ],
  MAINTENANCE_TICKET_STATUS_CHANGED_OWNER: [
    'ownerName',
    'agencyName',
    'ticketTitle',
    'oldStatusLabel',
    'newStatusLabel',
    'ticketCreatedAt',
    'ticketUpdatedAt'
  ],
  PAYMENT_DECLARATION_AGENCY: ['agencyUserName', 'agencyName', 'declarerName', 'leaseLabel', 'validationUrl'],
  PAYMENT_APPROVED_TENANT: ['tenantName', 'agencyName', 'amount', 'leaseLabel', 'portalUrl'],
  PAYMENT_APPROVED_OWNER: ['ownerName', 'agencyName', 'renterName', 'amount', 'leaseLabel'],
  PAYMENT_REJECTED_TENANT: ['tenantName', 'agencyName', 'leaseLabel', 'amount', 'reviewNotes', 'portalUrl'],
  PAYMENT_REJECTED_OWNER: ['ownerName', 'agencyName', 'renterName', 'leaseLabel', 'amount', 'reviewNotes'],
  PAYMENT_ALLOCATED_TENANT: [
    'tenantName',
    'agencyName',
    'amountAllocated',
    'installmentPeriods',
    'leaseLabel',
    'portalUrl'
  ],
  PAYMENT_ALLOCATED_OWNER: [
    'ownerName',
    'agencyName',
    'renterName',
    'amountAllocated',
    'installmentPeriods',
    'leaseLabel'
  ],
  DEPOSIT_MOVEMENT_TENANT: [
    'tenantName',
    'agencyName',
    'movementTypeLabel',
    'amount',
    'currency',
    'leaseLabel',
    'portalUrl'
  ],
  DEPOSIT_MOVEMENT_OWNER: [
    'ownerName',
    'agencyName',
    'renterName',
    'movementTypeLabel',
    'amount',
    'currency',
    'leaseLabel'
  ],
  PAYMENT_RECEIVED: ['contactName', 'amount', 'leaseLabel', 'agencyName'],
  PAYMENT_CONFIRMED: ['contactName', 'agencyName', 'amount', 'leaseLabel'],
  INSTALLMENT_DUE_REMINDER: ['contactName', 'dueDate', 'dueAmount', 'leaseLabel', 'agencyName'],
  INSTALLMENT_OVERDUE: ['contactName', 'dueDate', 'dueAmount', 'leaseLabel', 'agencyName'],
  LEASE_ACTIVATED: [
    'contactName',
    'leaseLabel',
    'propertyAddress',
    'leaseStartDate',
    'leaseEndDate',
    'rentAmount',
    'agencyName'
  ],
  LEASE_ENDING_SOON: ['contactName', 'leaseLabel', 'leaseEndDate', 'agencyName'],
  DEAL_CREATED: ['contactName', 'agencyName', 'dealId', 'dealValue', 'dealStage'],
  DEAL_STAGE_CHANGED: ['contactName', 'agencyName', 'dealId', 'dealStage', 'dealValue'],
  APPOINTMENT_REMINDER: ['contactName', 'agencyName', 'appointmentDate', 'appointmentTime'],
  PROPERTY_PUBLISHED: ['agencyName', 'propertyAddress', 'propertyType', 'propertyCity'],
  DOCUMENT_EXPIRING: ['contactName', 'agencyName'],
  INVITATION: ['agencyName', 'invitationUrl'],
  PASSWORD_RESET: ['resetUrl'],
  CUSTOM: ['contactName', 'agencyName', 'subject', 'body'],
  // Lot 040 (spec B7-R6, ecrans §10.7) : récapitulatif des alertes de stock,
  // sans aucun nom de personne. Le libellé de l'événement, « Alertes de stock
  // (récapitulatif) », vient du serveur avec la liste des événements.
  STOCK_ALERT_AGENCY: ['agencyName', 'alertsCount', 'alertsSummary', 'controlUrl']
};
