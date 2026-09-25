import { t } from '../i18n/t';
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

export function TEMPLATE_VARIABLES(): TemplateVariable[] {
  return [
    // Contexte commun
    {
      name: 'contactName',
      label: t('Nom du destinataire'),
      description: t('Nom du contact (locataire, propriétaire, etc.)'),
      category: 'common'
    },
    {
      name: 'contactEmail',
      label: t('Email du destinataire'),
      description: t('Adresse email du destinataire'),
      category: 'common'
    },
    {
      name: 'contactPhone',
      label: t('Téléphone du destinataire'),
      description: t('Numéro de téléphone du destinataire'),
      category: 'common'
    },
    { name: 'agencyName', label: t("Nom de l'agence"), description: t('Nom du tenant (agence)'), category: 'common' },
    {
      name: 'agencyPhone',
      label: t("Téléphone de l'agence"),
      description: t("Numéro de l'agence"),
      category: 'common'
    },
    {
      name: 'agencyEmail',
      label: t("Email de l'agence"),
      description: t("Email de contact de l'agence"),
      category: 'common'
    },
    {
      name: 'currentDate',
      label: t('Date du jour'),
      description: t('Date actuelle au format local'),
      category: 'common'
    },
    { name: 'currentTime', label: t('Heure actuelle'), description: t('Heure actuelle'), category: 'common' },
    {
      name: 'event',
      label: t("Type d'événement"),
      description: t('Événement déclencheur (ex: PAYMENT_RECEIVED)'),
      category: 'common'
    },
    // Paiements
    {
      name: 'amount',
      label: t('Montant'),
      description: t("Montant du paiement ou de l'échéance"),
      category: 'payment'
    },
    {
      name: 'paymentDate',
      label: t('Date du paiement'),
      description: t('Date à laquelle le paiement a été reçu'),
      category: 'payment'
    },
    {
      name: 'paymentMethod',
      label: t('Moyen de paiement'),
      description: t('Virement, chèque, etc.'),
      category: 'payment'
    },
    {
      name: 'paymentReference',
      label: t('Référence du paiement'),
      description: t('Référence ou identifiant du paiement'),
      category: 'payment'
    },
    { name: 'leaseId', label: t('ID du bail'), description: t('Identifiant du bail'), category: 'lease' },
    {
      name: 'dueDate',
      label: t("Date d'échéance"),
      description: t("Date d'échéance du loyer ou de l'échéance"),
      category: 'payment'
    },
    {
      name: 'dueAmount',
      label: t('Montant dû'),
      description: t("Montant à payer pour l'échéance"),
      category: 'payment'
    },
    {
      name: 'installmentNumber',
      label: t("Numéro d'échéance"),
      description: t("Numéro de l'échéance"),
      category: 'payment'
    },
    {
      name: 'remainingBalance',
      label: t('Solde restant'),
      description: t('Solde restant à payer'),
      category: 'payment'
    },
    // Baux
    { name: 'leaseStartDate', label: t('Début du bail'), description: t('Date de début du bail'), category: 'lease' },
    { name: 'leaseEndDate', label: t('Fin du bail'), description: t('Date de fin du bail'), category: 'lease' },
    {
      name: 'rentAmount',
      label: t('Montant du loyer'),
      description: t('Loyer mensuel ou périodique'),
      category: 'lease'
    },
    {
      name: 'depositAmount',
      label: t('Montant de la caution'),
      description: t('Dépôt de garantie'),
      category: 'lease'
    },
    // Propriétés
    {
      name: 'propertyAddress',
      label: t('Adresse du bien'),
      description: t('Adresse complète du bien immobilier'),
      category: 'property'
    },
    { name: 'propertyCity', label: t('Ville du bien'), description: t('Ville du bien'), category: 'property' },
    { name: 'propertyZipCode', label: t('Code postal'), description: t('Code postal du bien'), category: 'property' },
    {
      name: 'propertyType',
      label: t('Type de bien'),
      description: t('Appartement, Maison, etc.'),
      category: 'property'
    },
    // Maintenance / Tickets
    {
      name: 'ticketId',
      label: t('Numéro du ticket'),
      description: t('Identifiant du ticket de maintenance'),
      category: 'ticket'
    },
    {
      name: 'ticketSubject',
      label: t('Sujet du ticket'),
      description: t('Sujet ou titre du ticket'),
      category: 'ticket'
    },
    {
      name: 'ticketDescription',
      label: t('Description du ticket'),
      description: t('Description du problème'),
      category: 'ticket'
    },
    {
      name: 'ticketPriority',
      label: t('Priorité du ticket'),
      description: t('Haute, Moyenne, Basse'),
      category: 'ticket'
    },
    {
      name: 'ticketStatus',
      label: t('Statut du ticket'),
      description: t('Nouveau, En cours, Résolu'),
      category: 'ticket'
    },
    {
      name: 'createdAt',
      label: t('Date de création'),
      description: t("Date de création du ticket ou de l'élément"),
      category: 'ticket'
    },
    {
      name: 'ticketCreatedAt',
      label: t('Date de création du ticket'),
      description: t('Date et heure de création du ticket (formatée)'),
      category: 'ticket'
    },
    {
      name: 'ticketUpdatedAt',
      label: t('Date de mise à jour du ticket'),
      description: t('Date et heure de dernière mise à jour du ticket (formatée)'),
      category: 'ticket'
    },
    // CRM
    { name: 'dealId', label: t('ID du deal'), description: t('Identifiant du deal CRM'), category: 'crm' },
    { name: 'dealStage', label: t('Étape du deal'), description: t('Stade actuel du deal'), category: 'crm' },
    { name: 'dealValue', label: t('Valeur du deal'), description: t('Montant ou valeur du deal'), category: 'crm' },
    { name: 'appointmentDate', label: t('Date du rendez-vous'), description: t('Date du RDV'), category: 'crm' },
    { name: 'appointmentTime', label: t('Heure du rendez-vous'), description: t('Heure du RDV'), category: 'crm' }
  ];
}

/** Libellé court des catégories pour l'affichage */
export function VARIABLE_CATEGORY_LABELS(): Record<TemplateVariable['category'], string> {
  return {
    common: t('Commun'),
    payment: t('Paiements & échéances'),
    lease: t('Baux'),
    property: t('Propriétés'),
    ticket: t('Maintenance'),
    crm: t('CRM & rendez-vous')
  };
}

/** Retourne la syntaxe à insérer dans le template : {{nomVariable}} */
export function getVariablePlaceholder(name: string): string {
  return `{{${name}}}`;
}
