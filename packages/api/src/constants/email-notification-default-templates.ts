/**
 * Templates par défaut (sujet + corps HTML) pour chaque notification email.
 * Utilisés pour afficher le modèle d'origine dans l'interface d'édition.
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
<p style="margin:0 0 20px 0;"><strong>{{renterName}}</strong> a créé une nouvelle demande de maintenance pour <strong>{{agencyName}}</strong>.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>Sujet :</strong> {{ticketTitle}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Propriété :</strong> {{propertyReference}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Date de création :</strong> {{ticketCreatedAt}}</td></tr>
</table>
<p style="margin:20px 0 0 0; padding:14px; background:#fff7e6; border-radius:8px; color:#ad6800; font-size:14px;"><a href="{{validationUrl}}" style="color:#fa8c16; font-weight:600; text-decoration:underline;">Connectez-vous pour consulter le ticket</a></p>`
  },
  MAINTENANCE_TICKET_CREATED_TENANT: {
    subject: 'Votre ticket a bien été enregistré - {{ticketTitle}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Ticket de maintenance enregistré</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{tenantName}},</p>
<p style="margin:0 0 20px 0;">Votre demande de maintenance a bien été enregistrée par <strong>{{agencyName}}</strong>.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>Sujet :</strong> {{ticketTitle}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Propriété :</strong> {{propertyReference}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Date de création :</strong> {{ticketCreatedAt}}</td></tr>
</table>
<p style="margin:20px 0 0 0; padding:14px; background:#e6f7ff; border-radius:8px; color:#0050b3; font-size:14px;"><a href="{{portalUrl}}" style="color:#1890ff; font-weight:600; text-decoration:underline;">Suivre votre ticket dans le portail locataire</a></p>`
  },
  MAINTENANCE_TICKET_CREATED_OWNER: {
    subject: 'Nouveau ticket sur votre bien - {{ticketTitle}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Ticket de maintenance sur votre bien</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Un ticket de maintenance a été créé par le locataire <strong>{{renterName}}</strong> pour votre bien géré par <strong>{{agencyName}}</strong>.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>Sujet :</strong> {{ticketTitle}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Propriété :</strong> {{propertyReference}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Date de création :</strong> {{ticketCreatedAt}}</td></tr>
</table>
<p style="margin:20px 0 0 0; font-size:14px; color:#555;">Votre agence vous tiendra informé de l'avancement.</p>`
  },
  MAINTENANCE_TICKET_STATUS_CHANGED_TENANT: {
    subject: 'Mise à jour de votre ticket - {{ticketTitle}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Mise à jour de votre ticket de maintenance</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{tenantName}},</p>
<p style="margin:0 0 20px 0;"><strong>{{agencyName}}</strong> a mis à jour le statut de votre demande.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>Sujet :</strong> {{ticketTitle}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Nouveau statut :</strong> {{newStatusLabel}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Date de création :</strong> {{ticketCreatedAt}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Date de mise à jour :</strong> {{ticketUpdatedAt}}</td></tr>
</table>
<p style="margin:20px 0 0 0; padding:14px; background:#e6f7ff; border-radius:8px; color:#0050b3; font-size:14px;"><a href="{{portalUrl}}" style="color:#1890ff; font-weight:600; text-decoration:underline;">Consultez votre ticket dans le portail locataire</a></p>`
  },
  MAINTENANCE_TICKET_STATUS_CHANGED_OWNER: {
    subject: 'Mise à jour du ticket de maintenance - {{ticketTitle}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Mise à jour du ticket de maintenance</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;"><strong>{{agencyName}}</strong> a mis à jour le statut du ticket de maintenance concernant votre bien.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>Sujet :</strong> {{ticketTitle}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Ancien statut :</strong> {{oldStatusLabel}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Nouveau statut :</strong> {{newStatusLabel}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Date de création :</strong> {{ticketCreatedAt}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Date de mise à jour :</strong> {{ticketUpdatedAt}}</td></tr>
</table>
<p style="margin:20px 0 0 0; font-size:14px; color:#555;">Contactez votre agence pour plus de détails.</p>`
  },
  PAYMENT_DECLARATION_AGENCY: {
    subject: 'Nouvelle déclaration de paiement - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1a1a2e;">Nouvelle déclaration de paiement</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{agencyUserName}},</p>
<p style="margin:0 0 20px 0;">Un locataire a déclaré un paiement en attente de validation pour <strong>{{agencyName}}</strong>.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>Déclarant :</strong> {{declarerName}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Bail :</strong> {{leaseLabel}}</td></tr>
</table>
<p style="margin:20px 0 0 0; padding:14px; background:#eff6ff; border-radius:8px; color:#1e40af; font-size:14px;">Connectez-vous à {{agencyName}} pour valider ou rejeter cette déclaration : <a href="{{validationUrl}}" style="color:#1e40af; font-weight:600;">{{validationUrl}}</a></p>`
  },
  PAYMENT_APPROVED_TENANT: {
    subject: 'Paiement approuvé - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement approuvé</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{tenantName}},</p>
<p style="margin:0 0 20px 0;">Votre déclaration de paiement a été <strong style="color:#166534;">approuvée</strong> par <strong>{{agencyName}}</strong>. Ce paiement a bien été enregistré.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Montant : {{amount}} FCFA. Bail : {{leaseLabel}}</p>
<p style="margin:16px 0 0 0; font-size:14px;"><a href="{{portalUrl}}" style="color:#166534; font-weight:600;">Consultez votre historique des paiements dans le portail locataire.</a></p>`
  },
  PAYMENT_APPROVED_OWNER: {
    subject: 'Paiement du locataire approuvé - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement du locataire approuvé</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">La déclaration de paiement de votre locataire <strong>{{renterName}}</strong> a été <strong style="color:#166534;">approuvée</strong> par <strong>{{agencyName}}</strong>.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Montant : {{amount}} FCFA. Bail : {{leaseLabel}}</p>`
  },
  PAYMENT_REJECTED_TENANT: {
    subject: 'Déclaration de paiement rejetée - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b91c1c;">Déclaration de paiement rejetée</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{tenantName}},</p>
<p style="margin:0 0 20px 0;">Votre déclaration de paiement a été <strong style="color:#b91c1c;">rejetée</strong> par <strong>{{agencyName}}</strong>.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Bail : {{leaseLabel}}. Montant : {{amount}} FCFA.</p>
<p style="margin:20px 0 0 0; font-size:14px;">{{reviewNotes}}</p>
<p><a href="{{portalUrl}}" style="color:#1e40af; font-weight:600;">Connectez-vous au portail locataire</a> pour plus de détails.</p>`
  },
  PAYMENT_REJECTED_OWNER: {
    subject: 'Déclaration de paiement du locataire rejetée - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b91c1c;">Déclaration de paiement du locataire rejetée</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">La déclaration de paiement de votre locataire <strong>{{renterName}}</strong> a été <strong style="color:#b91c1c;">rejetée</strong> par <strong>{{agencyName}}</strong>.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Bail : {{leaseLabel}}. Montant : {{amount}} FCFA.</p>
<p style="margin:20px 0 0 0;">{{reviewNotes}}</p>`
  },
  PAYMENT_ALLOCATED_TENANT: {
    subject: 'Paiement alloué aux échéances - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement alloué aux échéances</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{tenantName}},</p>
<p style="margin:0 0 20px 0;"><strong>{{agencyName}}</strong> a alloué un montant de <strong>{{amountAllocated}} FCFA</strong> de votre paiement aux échéances suivantes : {{installmentPeriods}}</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Bail : {{leaseLabel}}</p>
<p style="margin:16px 0 0 0; font-size:14px;"><a href="{{portalUrl}}" style="color:#166534; font-weight:600;">Consultez vos échéances dans le portail locataire.</a></p>`
  },
  PAYMENT_ALLOCATED_OWNER: {
    subject: 'Paiement du locataire alloué aux échéances - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement du locataire alloué aux échéances</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;"><strong>{{agencyName}}</strong> a alloué un montant de <strong>{{amountAllocated}} FCFA</strong> du paiement de votre locataire <strong>{{renterName}}</strong> aux échéances : {{installmentPeriods}}</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Bail : {{leaseLabel}}</p>`
  },
  DEPOSIT_MOVEMENT_TENANT: {
    subject: 'Dépôt de garantie - {{movementTypeLabel}} - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Mouvement sur votre dépôt de garantie</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{tenantName}},</p>
<p style="margin:0 0 20px 0;"><strong>{{agencyName}}</strong> a enregistré un mouvement sur le dépôt de garantie de votre bail.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>Type :</strong> {{movementTypeLabel}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Montant :</strong> {{amount}} {{currency}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Bail :</strong> {{leaseLabel}}</td></tr>
</table>
<p style="margin:20px 0 0 0; font-size:14px;"><a href="{{portalUrl}}" style="color:#1890ff; font-weight:600;">Consultez votre dépôt de garantie dans le portail locataire</a></p>`
  },
  DEPOSIT_MOVEMENT_OWNER: {
    subject: 'Dépôt de garantie - {{movementTypeLabel}} - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Mouvement sur le dépôt de garantie</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;"><strong>{{agencyName}}</strong> a enregistré un mouvement sur le dépôt de garantie du bail de votre locataire <strong>{{renterName}}</strong>.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
  <tr><td style="padding:8px 0;"><strong>Type :</strong> {{movementTypeLabel}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Montant :</strong> {{amount}} {{currency}}</td></tr>
  <tr><td style="padding:8px 0;"><strong>Bail :</strong> {{leaseLabel}}</td></tr>
</table>`
  },
  PAYMENT_RECEIVED: {
    subject: 'Paiement reçu - {{amount}} - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement reçu</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Nous vous confirmons la réception de votre paiement de <strong>{{amount}}</strong> pour le bail {{leaseLabel}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  PAYMENT_CONFIRMED: {
    subject: 'Paiement confirmé - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Paiement confirmé</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Votre paiement a été confirmé par <strong>{{agencyName}}</strong>. Montant : {{amount}}. Bail : {{leaseLabel}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  INSTALLMENT_DUE_REMINDER: {
    subject: 'Rappel : échéance le {{dueDate}} - {{dueAmount}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#d97706;">Rappel d'échéance</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Nous vous rappelons qu'une échéance de <strong>{{dueAmount}}</strong> est prévue le <strong>{{dueDate}}</strong> pour le bail {{leaseLabel}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  INSTALLMENT_OVERDUE: {
    subject: 'Échéance en retard - Bail {{leaseNumber}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b91c1c;">Échéance dépassée</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">L'échéance du <strong>{{dueDate}}</strong> (montant : {{dueAmount}}) pour le bail {{leaseLabel}} n'a pas été réglée. Merci de régulariser au plus tôt.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  LEASE_ACTIVATED: {
    subject: 'Votre bail est activé - {{leaseLabel}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#166534;">Bail activé</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Votre bail {{leaseLabel}} ({{propertyAddress}}) a été activé. Période : {{leaseStartDate}} à {{leaseEndDate}}. Loyer : {{rentAmount}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  LEASE_ENDING_SOON: {
    subject: 'Fin de bail prochaine - {{leaseLabel}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#d97706;">Fin de bail prochaine</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Votre bail {{leaseLabel}} arrive à échéance le <strong>{{leaseEndDate}}</strong>. Merci de prendre contact avec {{agencyName}} pour les suites à donner.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  DEAL_CREATED: {
    subject: 'Nouvelle affaire - {{dealId}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Nouvelle affaire créée</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Une nouvelle affaire a été créée pour vous par <strong>{{agencyName}}</strong>. Valeur : {{dealValue}}. Étape : {{dealStage}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  DEAL_STAGE_CHANGED: {
    subject: 'Mise à jour affaire - {{dealId}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Étape de l'affaire modifiée</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">L'affaire {{dealId}} a changé d'étape : <strong>{{dealStage}}</strong>. Valeur : {{dealValue}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  APPOINTMENT_REMINDER: {
    subject: 'Rappel : rendez-vous le {{appointmentDate}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#7c3aed;">Rappel de rendez-vous</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Nous vous rappelons votre rendez-vous prévu le <strong>{{appointmentDate}}</strong> à {{appointmentTime}} avec {{agencyName}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  PROPERTY_PUBLISHED: {
    subject: 'Propriété publiée - {{propertyAddress}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#059669;">Propriété publiée</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour,</p>
<p style="margin:0 0 20px 0;">La propriété <strong>{{propertyAddress}}</strong> ({{propertyType}}, {{propertyCity}}) a été publiée par {{agencyName}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  DOCUMENT_EXPIRING: {
    subject: 'Document bientôt expiré',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#d97706;">Document expirant</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">Un document associé à votre dossier arrive à expiration prochainement. Merci de le mettre à jour auprès de {{agencyName}}.</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  },
  CHARGE_CALL_ISSUED: {
    subject: 'Nouvel appel de charges - {{period}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1d4ed8;">Nouvel appel de charges</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Un nouvel appel de charges a été émis pour votre lot dans la copropriété <strong>{{syndicateName}}</strong>.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Période : {{period}}. Lot : {{lotLabel}}. Montant : {{amount}} {{currency}}. Échéance : {{dueDate}}.</p>`
  },
  CHARGE_CALL_REMINDER: {
    subject: 'Rappel d appel de charges - {{period}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b45309;">Rappel d appel de charges</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Rappel pour l appel de charges de la période <strong>{{period}}</strong> concernant votre lot {{lotLabel}}.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Montant restant : {{remainingAmount}} {{currency}}. Échéance : {{dueDate}}.</p>`
  },
  CHARGE_PAYMENT_RECEIPT: {
    subject: 'Reçu de paiement {{number}} - {{syndicateName}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#0f766e;">Reçu de paiement</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Nous avons bien reçu votre paiement de <strong>{{amount}}</strong> du {{paidAt}} pour le lot {{lotLabel}} de la copropriété <strong>{{syndicateName}}</strong>.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Reste dû sur les appels réglés : {{outstanding}}. Avance conservée : {{advance}}.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Vous trouverez en pièce jointe le reçu n° {{number}}.</p>`
  },
  CHARGE_CALL_SETTLED: {
    subject: 'Quittance de charges {{number}} - {{period}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#0f766e;">Quittance de charges</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">L'appel de charges de la période <strong>{{period}}</strong> pour le lot {{lotLabel}} de la copropriété <strong>{{syndicateName}}</strong> est entièrement réglé ({{amount}}).</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Vous trouverez en pièce jointe la quittance n° {{number}}.</p>`
  },
  GENERAL_MEETING_CONVOCATION: {
    subject: 'Convocation à l’assemblée générale du {{meetingDate}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#0f766e;">Convocation à l’assemblée générale</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Vous êtes convoqué à l'assemblée générale de la copropriété <strong>{{syndicateName}}</strong>.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Date : {{meetingDate}}. Heure : {{meetingTime}}. Lieu : {{meetingLocation}}.</p>`
  },
  GENERAL_MEETING_MINUTES: {
    subject: 'Procès-verbal de l’assemblée générale du {{meetingDate}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#0f766e;">Procès-verbal disponible</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Le procès-verbal de l'assemblée générale de la copropriété <strong>{{syndicateName}}</strong> est disponible.</p>
<p style="margin:20px 0 0 0; padding:14px; background:#ecfeff; border-radius:8px;"><a href="{{minutesUrl}}" style="color:#0f766e; font-weight:600;">Consulter le procès-verbal</a></p>`
  },
  CONTRACT_RENEWAL_ALERT: {
    subject: 'Alerte renouvellement contrat - {{contractNature}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#7c2d12;">Contrat arrivant à échéance</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{managerName}},</p>
<p style="margin:0 0 20px 0;">Le contrat <strong>{{contractNature}}</strong> du prestataire {{providerName}} pour la copropriété {{syndicateName}} arrive prochainement à échéance.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Date de fin : {{contractEndDate}}.</p>`
  },
  COMMON_AREA_INCIDENT: {
    subject: 'Nouvel incident partie commune - {{assetName}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b91c1c;">Incident partie commune</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{managerName}},</p>
<p style="margin:0 0 20px 0;">Un incident a été déclaré sur la partie commune ou l'équipement <strong>{{assetName}}</strong> de la copropriété {{syndicateName}}.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Description : {{incidentDescription}}</p>`
  },
  OWNER_STATEMENT_SENT: {
    subject: 'Votre relevé de gérance - {{period}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1d4ed8;">Relevé de gérance</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Votre relevé pour la période <strong>{{period}}</strong> est disponible.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Loyers appelés : {{totalRentDue}} {{currency}} - Loyers encaissés : {{totalRevenue}} {{currency}} - Restant dû par les locataires : {{totalArrears}} {{currency}}</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Honoraires de gestion : {{managementFees}} {{currency}} - TVA sur honoraires : {{managementFeesVat}} {{currency}} - Dépenses : {{totalExpenses}} {{currency}}</p>
<p style="margin:0 0 12px 0; font-size:15px;"><strong>Net à vous reverser : {{netAmount}} {{currency}}</strong></p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">{{statementLines}}</p>`
  },
  LOAN_MATURITY_ALERT: {
    subject: 'Alerte fin de prêt - {{propertyReference}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b45309;">Fin de prêt proche</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour,</p>
<p style="margin:0 0 20px 0;">Le prêt du bien <strong>{{propertyReference}}</strong> arrive à échéance le {{loanEndDate}}.</p>`
  },
  DOCUMENT_EXPIRY_ALERT: {
    subject: 'Document patrimoine expirant - {{documentTitle}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#b45309;">Document expirant</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{ownerName}},</p>
<p style="margin:0 0 20px 0;">Le document <strong>{{documentTitle}}</strong> ({{documentType}}) expire le {{expiresAt}}.</p>
<p style="margin:0 0 12px 0; font-size:14px; color:#555;">Bien: {{propertyReference}}</p>`
  },
  WORK_PROGRAM_REMINDER: {
    subject: 'Rappel travaux planifiés - {{propertyReference}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#0f766e;">Rappel programme de travaux</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour,</p>
<p style="margin:0 0 20px 0;">Le programme <strong>{{workProgramTitle}}</strong> du bien {{propertyReference}} est planifié le {{plannedDate}}.</p>`
  },
  INVITATION: {
    subject: 'Invitation - {{agencyName}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Vous êtes invité(e)</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour,</p>
<p style="margin:0 0 20px 0;"><strong>{{agencyName}}</strong> vous invite à rejoindre sa plateforme. Cliquez sur le lien ci-dessous pour accepter l'invitation.</p>
<p style="margin:20px 0 0 0; padding:14px; background:#e6f7ff; border-radius:8px;"><a href="{{invitationUrl}}" style="color:#1890ff; font-weight:600;">Accepter l'invitation</a></p>`
  },
  PASSWORD_RESET: {
    subject: 'Réinitialisation de votre mot de passe',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#1890ff;">Réinitialisation du mot de passe</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour,</p>
<p style="margin:0 0 20px 0;">Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le lien ci-dessous pour définir un nouveau mot de passe (lien valide limité dans le temps).</p>
<p style="margin:20px 0 0 0; padding:14px; background:#e6f7ff; border-radius:8px;"><a href="{{resetUrl}}" style="color:#1890ff; font-weight:600;">Réinitialiser mon mot de passe</a></p>
<p style="margin:16px 0 0 0; font-size:12px; color:#999;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`
  },
  CUSTOM: {
    subject: '{{subject}}',
    bodyHtml: `<h1 style="margin:0 0 8px 0; font-size:22px; color:#374151;">Notification</h1>
<p style="margin:0 0 20px 0; color:#666; font-size:15px;">Bonjour {{contactName}},</p>
<p style="margin:0 0 20px 0;">{{body}}</p>
<p style="margin:20px 0 0 0; font-size:14px;">Cordialement,<br/>{{agencyName}}</p>`
  }
};
