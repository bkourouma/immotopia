/**
 * Templates par dÃ©faut (sujet + corps HTML) pour chaque notification email.
 * UtilisÃ©s pour afficher le modÃ¨le d'origine dans l'interface d'Ã©dition.
 * Les variables sont au format {{nom}} (ex: {{ticketTitle}}, {{agencyName}}).
 */
import type { EmailNotificationKey } from './email-notification-keys';

export interface DefaultEmailTemplate {
  subject: string;
  bodyHtml: string;
}

export const EMAIL_NOTIFICATION_DEFAULT_TEMPLATES: Record<EmailNotificationKey, DefaultEmailTemplate> = {
  MAINTENANCE_TICKET_CREATED_AGENCY: {
    subject: 'Nouveau ticket de maintenance - {{ticketTitle}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#fa8c16;">Nouveau ticket de maintenance</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{agencyUserName}},</p>
<p style="margin:0 0 20px 0;"><strong>{{renterName}}</strong> a crÃ©Ã© une nouvelle demande de maintenance pour <strong>{{agencyName}}</strong>.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>Sujet :</strong> {{ticketTitle}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>PropriÃ©tÃ© :</strong> {{propertyReference}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Date de crÃ©ation :</strong> {{ticketCreatedAt}}</td></tr>
</table>
<p style="margin:20px 0 0 0; padding:14px; background:#fff7e6; border-radius:8px; color:#ad6800; font-size:14px;"><a href="{{validationUrl}}" style="color:#fa8c16; font-weight:600; text-decoration:underline;">Connectez-vous pour consulter le ticket</a></p>`
  },
  MAINTENANCE_TICKET_CREATED_TENANT: {
    subject: 'Votre ticket a bien Ã©tÃ© enregistrÃ© - {{ticketTitle}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Ticket de maintenance enregistrÃ©</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{tenantName}},</p>
<p style="margin:0 0 20px 0;">Votre demande de maintenance a bien Ã©tÃ© enregistrÃ©e par <strong>{{agencyName}}</strong>.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>Sujet :</strong> {{ticketTitle}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>PropriÃ©tÃ© :</strong> {{propertyReference}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Date de crÃ©ation :</strong> {{ticketCreatedAt}}</td></tr>
</table>
<p style="margin:20px 0 0 0; padding:14px; background:#e6f7ff; border-radius:8px; color:#0050b3; font-size:14px;"><a href="{{portalUrl}}" style="color:#1890ff; font-weight:600; text-decoration:underline;">Suivre votre ticket dans le portail locataire</a></p>`
  },
  MAINTENANCE_TICKET_CREATED_OWNER: {
    subject: 'Nouveau ticket sur votre bien - {{ticketTitle}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Ticket de maintenance sur votre bien</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Un ticket de maintenance a Ã©tÃ© crÃ©Ã© par le locataire <strong>{{renterName}}</strong> pour votre bien gÃ©rÃ© par <strong>{{agencyName}}</strong>.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>Sujet :</strong> {{ticketTitle}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>PropriÃ©tÃ© :</strong> {{propertyReference}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Date de crÃ©ation :</strong> {{ticketCreatedAt}}</td></tr>
</table>
<p style="margin:20px 0 0 0; font-size:14px; color:#555;">Votre agence vous tiendra informÃ© de l'avancement.</p>`
  },
  MAINTENANCE_TICKET_STATUS_CHANGED_TENANT: {
    subject: 'Mise Ã  jour de votre ticket - {{ticketTitle}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Mise Ã  jour de votre ticket de maintenance</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{tenantName}},</p>
<p style="margin:0 0 20px 0;"><strong>{{agencyName}}</strong> a mis Ã  jour le statut de votre demande.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>Sujet :</strong> {{ticketTitle}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Nouveau statut :</strong> {{newStatusLabel}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Date de crÃ©ation :</strong> {{ticketCreatedAt}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Date de mise Ã  jour :</strong> {{ticketUpdatedAt}}</td></tr>
</table>
<p style="margin:20px 0 0 0; padding:14px; background:#e6f7ff; border-radius:8px; color:#0050b3; font-size:14px;"><a href="{{portalUrl}}" style="color:#1890ff; font-weight:600; text-decoration:underline;">Consultez votre ticket dans le portail locataire</a></p>`
  },
  MAINTENANCE_TICKET_STATUS_CHANGED_OWNER: {
    subject: 'Mise Ã  jour du ticket de maintenance - {{ticketTitle}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Mise Ã  jour du ticket de maintenance</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;"><strong>{{agencyName}}</strong> a mis Ã  jour le statut du ticket de maintenance concernant votre bien.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>Sujet :</strong> {{ticketTitle}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Ancien statut :</strong> {{oldStatusLabel}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Nouveau statut :</strong> {{newStatusLabel}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Date de crÃ©ation :</strong> {{ticketCreatedAt}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Date de mise Ã  jour :</strong> {{ticketUpdatedAt}}</td></tr>
</table>
<p style="margin:20px 0 0 0; font-size:14px; color:#555;">Contactez votre agence pour plus de dÃ©tails.</p>`
  },
  PAYMENT_DECLARATION_AGENCY: {
    subject: 'Nouvelle dÃ©claration de paiement - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1a1a2e;">Nouvelle dÃ©claration de paiement</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{agencyUserName}},</p>
<p style="margin:0 0 20px 0;">Un locataire a dÃ©clarÃ© un paiement en attente de validation pour <strong>{{agencyName}}</strong>.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>DÃ©clarant :</strong> {{declarerName}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Bail :</strong> {{leaseLabel}}</td></tr>
</table>
<p style="margin:20px 0 0 0; padding:14px; background:#eff6ff; border-radius:8px; color:#1e40af; font-size:14px;">Connectez-vous Ã  {{agencyName}} pour valider ou rejeter cette dÃ©claration : <a href="{{validationUrl}}" style="color:#1e40af; font-weight:600;">{{validationUrl}}</a></p>`
  },
  PAYMENT_APPROVED_TENANT: {
    subject: 'Paiement approuvÃ© - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement approuvÃ©</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{tenantName}},</p>
<p style="margin:0 0 20px 0;">Votre dÃ©claration de paiement a Ã©tÃ© <strong style="color:#166534;">approuvÃ©e</strong> par <strong>{{agencyName}}</strong>. Ce paiement a bien Ã©tÃ© enregistrÃ©.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Montant : {{amount}} FCFA. Bail : {{leaseLabel}}</p>
<p style="margin:16px 0 0 0; font-size:14px;"><a href="{{portalUrl}}" style="color:#166534; font-weight:600;">Consultez votre historique des paiements dans le portail locataire.</a></p>`
  },
  PAYMENT_APPROVED_OWNER: {
    subject: 'Paiement du locataire approuvÃ© - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement du locataire approuvÃ©</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">La dÃ©claration de paiement de votre locataire <strong>{{renterName}}</strong> a Ã©tÃ© <strong style="color:#166534;">approuvÃ©e</strong> par <strong>{{agencyName}}</strong>.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Montant : {{amount}} FCFA. Bail : {{leaseLabel}}</p>`
  },
  PAYMENT_REJECTED_TENANT: {
    subject: 'DÃ©claration de paiement rejetÃ©e - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b91c1c;">DÃ©claration de paiement rejetÃ©e</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{tenantName}},</p>
<p style="margin:0 0 20px 0;">Votre dÃ©claration de paiement a Ã©tÃ© <strong style="color:#b91c1c;">rejetÃ©e</strong> par <strong>{{agencyName}}</strong>.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Bail : {{leaseLabel}}. Montant : {{amount}} FCFA.</p>
<p style="margin:20px 0 0 0; font-size:14px;">{{reviewNotes}}</p>
<p><a href="{{portalUrl}}" style="color:#1e40af; font-weight:600;">Connectez-vous au portail locataire</a> pour plus de dÃ©tails.</p>`
  },
  PAYMENT_REJECTED_OWNER: {
    subject: 'DÃ©claration de paiement du locataire rejetÃ©e - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b91c1c;">DÃ©claration de paiement du locataire rejetÃ©e</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">La dÃ©claration de paiement de votre locataire <strong>{{renterName}}</strong> a Ã©tÃ© <strong style="color:#b91c1c;">rejetÃ©e</strong> par <strong>{{agencyName}}</strong>.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Bail : {{leaseLabel}}. Montant : {{amount}} FCFA.</p>
<p style="margin:20px 0 0 0;">{{reviewNotes}}</p>`
  },
  PAYMENT_ALLOCATED_TENANT: {
    subject: 'Paiement allouÃ© aux Ã©chÃ©ances - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement allouÃ© aux Ã©chÃ©ances</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{tenantName}},</p>
<p style="margin:0 0 20px 0;"><strong>{{agencyName}}</strong> a allouÃ© un montant de <strong>{{amountAllocated}} FCFA</strong> de votre paiement aux Ã©chÃ©ances suivantes : {{installmentPeriods}}</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Bail : {{leaseLabel}}</p>
<p style="margin:16px 0 0 0; font-size:14px;"><a href="{{portalUrl}}" style="color:#166534; font-weight:600;">Consultez vos Ã©chÃ©ances dans le portail locataire.</a></p>`
  },
  PAYMENT_ALLOCATED_OWNER: {
    subject: 'Paiement du locataire allouÃ© aux Ã©chÃ©ances - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement du locataire allouÃ© aux Ã©chÃ©ances</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;"><strong>{{agencyName}}</strong> a allouÃ© un montant de <strong>{{amountAllocated}} FCFA</strong> du paiement de votre locataire <strong>{{renterName}}</strong> aux Ã©chÃ©ances : {{installmentPeriods}}</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Bail : {{leaseLabel}}</p>`
  },
  DEPOSIT_MOVEMENT_TENANT: {
    subject: 'DÃ©pÃ´t de garantie - {{movementTypeLabel}} - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Mouvement sur votre dÃ©pÃ´t de garantie</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{tenantName}},</p>
<p style="margin:0 0 20px 0;"><strong>{{agencyName}}</strong> a enregistrÃ© un mouvement sur le dÃ©pÃ´t de garantie de votre bail.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>Type :</strong> {{movementTypeLabel}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Montant :</strong> {{amount}} {{currency}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Bail :</strong> {{leaseLabel}}</td></tr>
</table>
<p style="margin:20px 0 0 0; font-size:14px;"><a href="{{portalUrl}}" style="color:#1890ff; font-weight:600;">Consultez votre dÃ©pÃ´t de garantie dans le portail locataire</a></p>`
  },
  DEPOSIT_MOVEMENT_OWNER: {
    subject: 'DÃ©pÃ´t de garantie - {{movementTypeLabel}} - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Mouvement sur le dÃ©pÃ´t de garantie</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;"><strong>{{agencyName}}</strong> a enregistrÃ© un mouvement sur le dÃ©pÃ´t de garantie du bail de votre locataire <strong>{{renterName}}</strong>.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>Type :</strong> {{movementTypeLabel}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Montant :</strong> {{amount}} {{currency}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Bail :</strong> {{leaseLabel}}</td></tr>
</table>`
  },
  PAYMENT_RECEIVED: {
    subject: 'Paiement reÃ§u - {{amount}} - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement reÃ§u</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Nous vous confirmons la rÃ©ception de votre paiement de <strong>{{amount}}</strong> pour le bail {{leaseLabel}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  PAYMENT_CONFIRMED: {
    subject: 'Paiement confirmÃ© - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement confirmÃ©</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Votre paiement a Ã©tÃ© confirmÃ© par <strong>{{agencyName}}</strong>. Montant : {{amount}}. Bail : {{leaseLabel}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  INSTALLMENT_DUE_REMINDER: {
    subject: 'Rappel : Ã©chÃ©ance le {{dueDate}} - {{dueAmount}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#d97706;">Rappel d'Ã©chÃ©ance</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Nous vous rappelons qu'une Ã©chÃ©ance de <strong>{{dueAmount}}</strong> est prÃ©vue le <strong>{{dueDate}}</strong> pour le bail {{leaseLabel}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  INSTALLMENT_OVERDUE: {
    subject: 'Ã‰chÃ©ance en retard - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b91c1c;">Ã‰chÃ©ance dÃ©passÃ©e</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">L'Ã©chÃ©ance du <strong>{{dueDate}}</strong> (montant : {{dueAmount}}) pour le bail {{leaseLabel}} n'a pas Ã©tÃ© rÃ©glÃ©e. Merci de rÃ©gulariser au plus tÃ´t.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  LEASE_ACTIVATED: {
    subject: 'Votre bail est activÃ© - {{leaseLabel}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Bail activÃ©</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Votre bail {{leaseLabel}} ({{propertyAddress}}) a Ã©tÃ© activÃ©. PÃ©riode : {{leaseStartDate}} Ã  {{leaseEndDate}}. Loyer : {{rentAmount}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  LEASE_ENDING_SOON: {
    subject: 'Fin de bail prochaine - {{leaseLabel}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#d97706;">Fin de bail prochaine</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Votre bail {{leaseLabel}} arrive Ã  Ã©chÃ©ance le <strong>{{leaseEndDate}}</strong>. Merci de prendre contact avec {{agencyName}} pour les suites Ã  donner.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  DEAL_CREATED: {
    subject: 'Nouvelle affaire - {{dealId}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Nouvelle affaire crÃ©Ã©e</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Une nouvelle affaire a Ã©tÃ© crÃ©Ã©e pour vous par <strong>{{agencyName}}</strong>. Valeur : {{dealValue}}. Ã‰tape : {{dealStage}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  DEAL_STAGE_CHANGED: {
    subject: 'Mise Ã  jour affaire - {{dealId}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Ã‰tape de l'affaire modifiÃ©e</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">L'affaire {{dealId}} a changÃ© d'Ã©tape : <strong>{{dealStage}}</strong>. Valeur : {{dealValue}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  APPOINTMENT_REMINDER: {
    subject: 'Rappel : rendez-vous le {{appointmentDate}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#7c3aed;">Rappel de rendez-vous</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Nous vous rappelons votre rendez-vous prÃ©vu le <strong>{{appointmentDate}}</strong> Ã  {{appointmentTime}} avec {{agencyName}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  PROPERTY_PUBLISHED: {
    subject: 'PropriÃ©tÃ© publiÃ©e - {{propertyAddress}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#059669;">PropriÃ©tÃ© publiÃ©e</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour,</p>
<p style="margin:0 0 20px 0;">La propriÃ©tÃ© <strong>{{propertyAddress}}</strong> ({{propertyType}}, {{propertyCity}}) a Ã©tÃ© publiÃ©e par {{agencyName}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  DOCUMENT_EXPIRING: {
    subject: 'Document bientÃ´t expirÃ©',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#d97706;">Document expirant</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Un document associÃ© Ã  votre dossier arrive Ã  expiration prochainement. Merci de le mettre Ã  jour auprÃ¨s de {{agencyName}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  CHARGE_CALL_ISSUED: {
    subject: 'Nouvel appel de charges - {{period}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1d4ed8;">Nouvel appel de charges</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Un nouvel appel de charges a Ã©tÃ© Ã©mis pour votre lot dans la copropriÃ©tÃ© <strong>{{syndicateName}}</strong>.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">PÃ©riode : {{period}}. Lot : {{lotLabel}}. Montant : {{amount}} {{currency}}. Ã‰chÃ©ance : {{dueDate}}.</p>`
  },
  CHARGE_CALL_REMINDER: {
    subject: 'Rappel d appel de charges - {{period}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b45309;">Rappel d appel de charges</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Rappel pour l appel de charges de la pÃ©riode <strong>{{period}}</strong> concernant votre lot {{lotLabel}}.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Montant restant : {{remainingAmount}} {{currency}}. Ã‰chÃ©ance : {{dueDate}}.</p>`
  },
  GENERAL_MEETING_CONVOCATION: {
    subject: 'Convocation a l assemblee generale du {{meetingDate}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#0f766e;">Convocation Assemblee Generale</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Vous etes convoque a l'Assemblee Generale de la copropriete <strong>{{syndicateName}}</strong>.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Date : {{meetingDate}}. Heure : {{meetingTime}}. Lieu : {{meetingLocation}}.</p>`
  },
  GENERAL_MEETING_MINUTES: {
    subject: 'Proces-verbal de l assemblee generale du {{meetingDate}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#0f766e;">Proces-verbal disponible</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Le proces-verbal de l'Assemblee Generale de la copropriete <strong>{{syndicateName}}</strong> est disponible.</p>
<p style="margin:20px 0 0 0; padding:14px; background:#ecfeff; border-radius:8px;"><a href="{{minutesUrl}}" style="color:#0f766e; font-weight:600;">Consulter le proces-verbal</a></p>`
  },
  CONTRACT_RENEWAL_ALERT: {
    subject: 'Alerte renouvellement contrat - {{contractNature}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#7c2d12;">Contrat arrivant a echeance</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{managerName}},</p>
<p style="margin:0 0 20px 0;">Le contrat <strong>{{contractNature}}</strong> du prestataire {{providerName}} pour la copropriete {{syndicateName}} arrive prochainement a echeance.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Date de fin : {{contractEndDate}}.</p>`
  },
  COMMON_AREA_INCIDENT: {
    subject: 'Nouvel incident partie commune - {{assetName}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b91c1c;">Incident partie commune</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{managerName}},</p>
<p style="margin:0 0 20px 0;">Un incident a ete declare sur la partie commune ou l'equipement <strong>{{assetName}}</strong> de la copropriete {{syndicateName}}.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Description : {{incidentDescription}}</p>`
  },
  OWNER_STATEMENT_SENT: {
    subject: 'Votre relevÃ© de gÃ©rance - {{period}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1d4ed8;">RelevÃ© de gÃ©rance</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Votre relevÃ© pour la pÃ©riode <strong>{{period}}</strong> est disponible.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Total des revenus : {{totalRevenue}} {{currency}} - Total des charges : {{totalExpenses}} {{currency}} - Net : {{netAmount}} {{currency}}</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">{{statementLines}}</p>`
  },
  LOAN_MATURITY_ALERT: {
    subject: 'Alerte fin de pret - {{propertyReference}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b45309;">Fin de pret proche</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour,</p>
<p style="margin:0 0 20px 0;">Le pret du bien <strong>{{propertyReference}}</strong> arrive a echeance le {{loanEndDate}}.</p>`
  },
  DOCUMENT_EXPIRY_ALERT: {
    subject: 'Document patrimoine expirant - {{documentTitle}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b45309;">Document expirant</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Le document <strong>{{documentTitle}}</strong> ({{documentType}}) expire le {{expiresAt}}.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Bien: {{propertyReference}}</p>`
  },
  WORK_PROGRAM_REMINDER: {
    subject: 'Rappel travaux planifies - {{propertyReference}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#0f766e;">Rappel programme de travaux</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour,</p>
<p style="margin:0 0 20px 0;">Le programme <strong>{{workProgramTitle}}</strong> du bien {{propertyReference}} est planifie le {{plannedDate}}.</p>`
  },
  INVITATION: {
    subject: 'Invitation - {{agencyName}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Vous Ãªtes invitÃ©(e)</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour,</p>
<p style="margin:0 0 20px 0;"><strong>{{agencyName}}</strong> vous invite Ã  rejoindre sa plateforme. Cliquez sur le lien ci-dessous pour accepter l'invitation.</p>
<p style="margin:20px 0 0 0; padding:14px; background:#e6f7ff; border-radius:8px;"><a href="{{invitationUrl}}" style="color:#1890ff; font-weight:600;">Accepter l'invitation</a></p>`
  },
  PASSWORD_RESET: {
    subject: 'RÃ©initialisation de votre mot de passe',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">RÃ©initialisation du mot de passe</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour,</p>
<p style="margin:0 0 20px 0;">Vous avez demandÃ© la rÃ©initialisation de votre mot de passe. Cliquez sur le lien ci-dessous pour dÃ©finir un nouveau mot de passe (lien valide limitÃ© dans le temps).</p>
<p style="margin:20px 0 0 0; padding:14px; background:#e6f7ff; border-radius:8px;"><a href="{{resetUrl}}" style="color:#1890ff; font-weight:600;">RÃ©initialiser mon mot de passe</a></p>
<p style="margin:16px 0 0 0; font-size:12px; color:#999;">Si vous n'Ãªtes pas Ã  l'origine de cette demande, ignorez cet email.</p>`
  },
  CUSTOM: {
    subject: '{{subject}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#374151;">Notification</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">{{body}}</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  }
};

