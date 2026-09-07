/**
 * Variables disponibles pour les templates de communication (email / WhatsApp).
 * Utiliser la syntaxe {{nomVariable}} dans le corps ou le sujet du template.
 * Ces variables sont remplacées au moment de l'envoi selon le contexte de l'événement.
 * @see docs/communication/TEMPLATE_VARIABLES.md
 */

export interface TemplateVariable {
  name: string;
  label: string;
  description: string;
  category: 'common' | 'payment' | 'lease' | 'property' | 'ticket' | 'crm';
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  // Contexte commun
  { name: 'contactName', label: 'Nom du destinataire', description: 'Nom du contact (locataire, propriétaire, etc.)', category: 'common' },
  { name: 'contactEmail', label: 'Email du destinataire', description: 'Adresse email du destinataire', category: 'common' },
  { name: 'contactPhone', label: 'Téléphone du destinataire', description: 'Numéro de téléphone du destinataire', category: 'common' },
  { name: 'agencyName', label: 'Nom de l\'agence', description: 'Nom du tenant (agence)', category: 'common' },
  { name: 'agencyPhone', label: 'Téléphone de l\'agence', description: 'Numéro de l\'agence', category: 'common' },
  { name: 'agencyEmail', label: 'Email de l\'agence', description: 'Email de contact de l\'agence', category: 'common' },
  { name: 'currentDate', label: 'Date du jour', description: 'Date actuelle au format local', category: 'common' },
  { name: 'currentTime', label: 'Heure actuelle', description: 'Heure actuelle', category: 'common' },
  { name: 'event', label: 'Type d\'événement', description: 'Événement déclencheur (ex: PAYMENT_RECEIVED)', category: 'common' },
  // Paiements
  { name: 'amount', label: 'Montant', description: 'Montant du paiement ou de l\'échéance', category: 'payment' },
  { name: 'paymentDate', label: 'Date du paiement', description: 'Date à laquelle le paiement a été reçu', category: 'payment' },
  { name: 'paymentMethod', label: 'Moyen de paiement', description: 'Virement, chèque, etc.', category: 'payment' },
  { name: 'paymentReference', label: 'Référence du paiement', description: 'Référence ou identifiant du paiement', category: 'payment' },
  { name: 'leaseId', label: 'ID du bail', description: 'Identifiant du bail', category: 'lease' },
  { name: 'dueDate', label: 'Date d\'échéance', description: 'Date d\'échéance du loyer ou de l\'échéance', category: 'payment' },
  { name: 'dueAmount', label: 'Montant dû', description: 'Montant à payer pour l\'échéance', category: 'payment' },
  { name: 'installmentNumber', label: 'Numéro d\'échéance', description: 'Numéro de l\'échéance', category: 'payment' },
  { name: 'remainingBalance', label: 'Solde restant', description: 'Solde restant à payer', category: 'payment' },
  // Baux
  { name: 'leaseStartDate', label: 'Début du bail', description: 'Date de début du bail', category: 'lease' },
  { name: 'leaseEndDate', label: 'Fin du bail', description: 'Date de fin du bail', category: 'lease' },
  { name: 'rentAmount', label: 'Montant du loyer', description: 'Loyer mensuel ou périodique', category: 'lease' },
  { name: 'depositAmount', label: 'Montant de la caution', description: 'Dépôt de garantie', category: 'lease' },
  // Propriétés
  { name: 'propertyAddress', label: 'Adresse du bien', description: 'Adresse complète du bien immobilier', category: 'property' },
  { name: 'propertyCity', label: 'Ville du bien', description: 'Ville du bien', category: 'property' },
  { name: 'propertyZipCode', label: 'Code postal', description: 'Code postal du bien', category: 'property' },
  { name: 'propertyType', label: 'Type de bien', description: 'Appartement, Maison, etc.', category: 'property' },
  // Maintenance / Tickets
  { name: 'ticketId', label: 'Numéro du ticket', description: 'Identifiant du ticket de maintenance', category: 'ticket' },
  { name: 'ticketSubject', label: 'Sujet du ticket', description: 'Sujet ou titre du ticket', category: 'ticket' },
  { name: 'ticketDescription', label: 'Description du ticket', description: 'Description du problème', category: 'ticket' },
  { name: 'ticketPriority', label: 'Priorité du ticket', description: 'Haute, Moyenne, Basse', category: 'ticket' },
  { name: 'ticketStatus', label: 'Statut du ticket', description: 'Nouveau, En cours, Résolu', category: 'ticket' },
  { name: 'createdAt', label: 'Date de création', description: 'Date de création du ticket ou de l\'élément', category: 'ticket' },
  { name: 'ticketCreatedAt', label: 'Date de création du ticket', description: 'Date et heure de création du ticket (formatée)', category: 'ticket' },
  { name: 'ticketUpdatedAt', label: 'Date de mise à jour du ticket', description: 'Date et heure de dernière mise à jour du ticket (formatée)', category: 'ticket' },
  // CRM
  { name: 'dealId', label: 'ID du deal', description: 'Identifiant du deal CRM', category: 'crm' },
  { name: 'dealStage', label: 'Étape du deal', description: 'Stade actuel du deal', category: 'crm' },
  { name: 'dealValue', label: 'Valeur du deal', description: 'Montant ou valeur du deal', category: 'crm' },
  { name: 'appointmentDate', label: 'Date du rendez-vous', description: 'Date du RDV', category: 'crm' },
  { name: 'appointmentTime', label: 'Heure du rendez-vous', description: 'Heure du RDV', category: 'crm' },
];

/** Libellé court des catégories pour l'affichage */
export const VARIABLE_CATEGORY_LABELS: Record<TemplateVariable['category'], string> = {
  common: 'Commun',
  payment: 'Paiements & échéances',
  lease: 'Baux',
  property: 'Propriétés',
  ticket: 'Maintenance',
  crm: 'CRM & rendez-vous',
};

/** Retourne la syntaxe à insérer dans le template : {{nomVariable}} */
export function getVariablePlaceholder(name: string): string {
  return `{{${name}}}`;
}
