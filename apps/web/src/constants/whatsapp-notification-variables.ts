/**
 * Variables suggérées par type d'événement pour les notifications WhatsApp.
 * Syntaxe {{nomVariable}} dans le message.
 */
export const WHATSAPP_VARIABLES_BY_KEY: Record<string, string[]> = {
  MAINTENANCE_TICKET_CREATED_AGENCY: [
    'agencyUserName',
    'renterName',
    'ticketTitle',
    'propertyReference',
    'ticketCreatedAt',
    'agencyName'
  ],
  MAINTENANCE_TICKET_CREATED_TENANT: [
    'tenantName',
    'ticketTitle',
    'agencyName',
    'propertyReference',
    'ticketCreatedAt'
  ],
  MAINTENANCE_TICKET_STATUS_CHANGED_TENANT: [
    'tenantName',
    'ticketTitle',
    'newStatusLabel',
    'agencyName',
    'ticketCreatedAt',
    'ticketUpdatedAt'
  ],
  PAYMENT_APPROVED_TENANT: ['tenantName', 'agencyName'],
  PAYMENT_REJECTED_TENANT: ['tenantName', 'agencyName'],
  PAYMENT_ALLOCATED_TENANT: ['tenantName', 'amountAllocated', 'leaseLabel', 'agencyName'],
  INSTALLMENT_DUE_REMINDER: ['tenantName', 'dueDate', 'amount', 'agencyName'],
  INSTALLMENT_OVERDUE: ['tenantName', 'dueDate', 'agencyName'],
  LEASE_ACTIVATED: ['tenantName', 'agencyName'],
  LEASE_ENDING_SOON: ['tenantName', 'endDate', 'agencyName'],
  DEPOSIT_MOVEMENT_TENANT: ['tenantName', 'movementTypeLabel', 'amount', 'currency', 'leaseLabel', 'agencyName'],
  APPOINTMENT_REMINDER: ['appointmentDate', 'agencyName'],
  DEAL_STAGE_CHANGED: ['contactName', 'stageLabel', 'agencyName'],
  CRM_CONTACT_GROUP_INVITE: ['contactName', 'inviteLink'],
  PROPERTY_PUBLISHED_GROUP_BROADCAST: [
    'propertyTitle',
    'propertySummary',
    'propertyType',
    'propertyTypeLabel',
    'propertyReference',
    'propertyAddress',
    'locationZone',
    'propertyPrice',
    'transactionModesLabel',
    'surfaceAreaLabel',
    'roomsLabel',
    'bedroomsLabel',
    'bathroomsLabel',
    'furnishingStatusLabel',
    'availabilityLabel',
    'publishedAtLabel',
    'propertyPublicUrl'
  ],
  OWNER_STATEMENT_SENT: [
    'ownerName',
    'period',
    'totalRentDue',
    'totalRevenue',
    'totalArrears',
    'managementFees',
    'managementFeesVat',
    'totalExpenses',
    'netAmount',
    'currency'
  ],
  OWNER_LEASE_ENDING_SOON: ['ownerName', 'leaseLabel', 'leaseEndDate', 'agencyName'],
  OWNER_DOCUMENT_EXPIRY_ALERT: ['ownerName', 'documentTitle', 'documentType', 'propertyReference', 'expiresAt'],
  OWNER_MONTHLY_REPORT_SENT: ['ownerName', 'period', 'reportUrl', 'expiresAt', 'agencyName']
};

export function getVariablePlaceholder(name: string): string {
  return `{{${name}}}`;
}
