/**
 * Email templates for authentication module
 * All templates are in French as per project requirements
 */

/**
 * Email verification template
 * @param verificationUrl - Full URL with token for email verification
 * @param userName - User's full name
 * @returns HTML email template
 */
export function getEmailVerificationTemplate(verificationUrl: string, userName: string): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vérification de votre adresse email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
    <h1 style="color: #2c3e50;">Bienvenue sur ImmoTopia !</h1>
    <p>Bonjour ${userName},</p>
    <p>Merci de vous être inscrit sur notre plateforme. Pour activer votre compte, veuillez vérifier votre adresse email en cliquant sur le lien ci-dessous :</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationUrl}" style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Vérifier mon email</a>
    </div>
    <p>Ou copiez et collez ce lien dans votre navigateur :</p>
    <p style="word-break: break-all; color: #3498db;">${verificationUrl}</p>
    <p><strong>Ce lien expire dans 24 heures.</strong></p>
    <p>Si vous n'avez pas créé de compte sur notre plateforme, vous pouvez ignorer cet email.</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="font-size: 12px; color: #777;">Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Password reset email template
 * @param resetUrl - Full URL with token for password reset
 * @param userName - User's full name
 * @returns HTML email template
 */
export function getPasswordResetTemplate(resetUrl: string, userName: string): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Réinitialisation de votre mot de passe</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
    <h1 style="color: #2c3e50;">Réinitialisation de mot de passe</h1>
    <p>Bonjour ${userName},</p>
    <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le lien ci-dessous pour créer un nouveau mot de passe :</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="background-color: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Réinitialiser mon mot de passe</a>
    </div>
    <p>Ou copiez et collez ce lien dans votre navigateur :</p>
    <p style="word-break: break-all; color: #e74c3c;">${resetUrl}</p>
    <p><strong>Ce lien expire dans 1 heure.</strong></p>
    <p>Si vous n'avez pas demandé de réinitialisation de mot de passe, vous pouvez ignorer cet email. Votre mot de passe restera inchangé.</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="font-size: 12px; color: #777;">Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Account creation email template for lease assignment
 * @param resetUrl - Full URL with token for password reset
 * @param userName - User's full name
 * @param tenantName - Name of the tenant organization
 * @param leaseNumber - Lease number
 * @param propertyAddress - Property address
 * @param clientType - Type of client (RENTER or OWNER)
 * @returns HTML email template
 */
export function getAccountCreationTemplate(
  resetUrl: string,
  userName: string,
  tenantName: string,
  leaseNumber: string,
  propertyAddress: string | null,
  clientType: 'RENTER' | 'OWNER'
): string {
  const accountType = clientType === 'RENTER' ? 'locataire' : 'propriétaire';
  const accountTypeCapitalized = clientType === 'RENTER' ? 'Locataire' : 'Propriétaire';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Votre compte ImmoTopia a été créé</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
    <h1 style="color: #2c3e50;">Votre compte ImmoTopia a été créé</h1>
    <p>Bonjour ${userName},</p>
    <p>Un compte ${accountType} a été créé pour vous sur la plateforme ImmoTopia par <strong>${tenantName}</strong>.</p>
    
    <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #3498db;">
      <h2 style="color: #2c3e50; margin-top: 0; font-size: 18px;">Informations sur votre bail</h2>
      <p><strong>Type de compte :</strong> ${accountTypeCapitalized}</p>
      <p><strong>Numéro de bail :</strong> ${leaseNumber}</p>
      ${propertyAddress ? `<p><strong>Propriété :</strong> ${propertyAddress}</p>` : ''}
    </div>
    
    <p>Pour activer votre compte et définir votre mot de passe, cliquez sur le lien ci-dessous :</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Définir mon mot de passe</a>
    </div>
    <p>Ou copiez et collez ce lien dans votre navigateur :</p>
    <p style="word-break: break-all; color: #3498db;">${resetUrl}</p>
    <p><strong>Ce lien expire dans 7 jours.</strong></p>
    
    <p>Une fois votre mot de passe défini, vous pourrez vous connecter à votre espace ${accountType} pour consulter les informations relatives à votre bail.</p>
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="font-size: 12px; color: #777;">Cet email a été envoyé automatiquement par ${tenantName}, merci de ne pas y répondre.</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Maintenance ticket created - notify agency admins
 */
export function getMaintenanceTicketCreatedTemplate(
  ticketTitle: string,
  ticketId: string,
  propertyReference: string,
  ticketUrl: string,
  agencyName?: string
): string {
  const agencyLabel = agencyName || 'ImmoTopia';
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nouveau ticket de maintenance</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #fff7e6; border: 1px solid #ffd591; padding: 20px; border-radius: 8px;">
    <h2 style="color: #fa8c16; margin-top: 0;">Nouveau ticket de maintenance</h2>
    <p>Un locataire a créé une nouvelle demande de maintenance pour <strong>${agencyLabel}</strong>.</p>
    <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding:8px 0; color:#666;"><strong>Sujet :</strong></td><td style="padding:8px 0;">${ticketTitle}</td></tr>
      <tr><td style="padding:8px 0; color:#666;"><strong>Référence :</strong></td><td style="padding:8px 0;">${ticketId}</td></tr>
      <tr><td style="padding:8px 0; color:#666;"><strong>Propriété :</strong></td><td style="padding:8px 0;">${propertyReference}</td></tr>
    </table>
    <p><a href="${ticketUrl}" style="background-color: #fa8c16; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Voir le ticket</a></p>
    <hr style="border: none; border-top: 1px solid #ffe7ba; margin: 20px 0;">
    <p style="font-size: 12px; color: #777;">Cet email a été envoyé automatiquement par ${agencyLabel}.</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Maintenance ticket status changed - notify tenant
 */
export function getMaintenanceTicketStatusChangedTemplate(
  ticketTitle: string,
  oldStatusLabel: string,
  newStatusLabel: string,
  ticketUrl: string,
  agencyName?: string
): string {
  const agencyLabel = agencyName || "l'agence";
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mise à jour ticket de maintenance</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #e6f7ff; border: 1px solid #91d5ff; padding: 20px; border-radius: 8px;">
    <h2 style="color: #1890ff; margin-top: 0;">Mise à jour de votre ticket de maintenance</h2>
    <p><strong>${agencyLabel}</strong> a mis à jour le statut de votre demande de maintenance.</p>
    <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding:8px 0; color:#666;"><strong>Sujet :</strong></td><td style="padding:8px 0;">${ticketTitle}</td></tr>
      <tr><td style="padding:8px 0; color:#666;"><strong>Ancien statut :</strong></td><td style="padding:8px 0;">${oldStatusLabel}</td></tr>
      <tr><td style="padding:8px 0; color:#666;"><strong>Nouveau statut :</strong></td><td style="padding:8px 0;"><strong>${newStatusLabel}</strong></td></tr>
    </table>
    <p><a href="${ticketUrl}" style="background-color: #1890ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Voir le ticket</a></p>
    <hr style="border: none; border-top: 1px solid #bae7ff; margin: 20px 0;">
    <p style="font-size: 12px; color: #777;">Cet email a été envoyé automatiquement.</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Echappe les valeurs interpolees dans un template HTML.
 * Le nom de l'agence et les libelles de roles proviennent de donnees saisies :
 * ils ne doivent pas pouvoir injecter de balises dans l'email.
 */
function escapeHtml(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Invitation d'un collaborateur a rejoindre une agence
 * @param inviteUrl - URL complete d'acceptation (avec le token)
 * @param tenantName - Nom de l'agence qui invite
 * @param roleLabels - Libelles francais des roles attribues (peut etre vide)
 * @param expiresAt - Date d'expiration de l'invitation
 * @returns HTML email template
 */
export function getInvitationTemplate(
  inviteUrl: string,
  tenantName: string,
  roleLabels: string[],
  expiresAt: Date
): string {
  const agency = escapeHtml(tenantName);
  const roles = roleLabels.length > 0 ? roleLabels.map(escapeHtml).join(', ') : 'Collaborateur';
  const expiry = expiresAt.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation à rejoindre ${agency}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #eef2f7;">
  <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px 16px;">

    <div style="background-color: #2c3e50; padding: 28px 32px; border-radius: 8px 8px 0 0; text-align: center;">
      <p style="margin: 0; color: #ffffff; font-size: 22px; font-weight: bold; letter-spacing: 0.5px;">ImmoTopia</p>
      <p style="margin: 6px 0 0; color: #aebfd0; font-size: 13px;">Plateforme de gestion immobilière</p>
    </div>

    <div style="background-color: #ffffff; padding: 32px; border-radius: 0 0 8px 8px;">
      <h1 style="color: #2c3e50; font-size: 21px; margin: 0 0 20px;">Invitation à rejoindre ${agency}</h1>

      <p style="margin: 0 0 16px;">Madame, Monsieur,</p>
      <p style="margin: 0 0 16px;">
        L'agence <strong>${agency}</strong> vous invite à rejoindre son espace de travail sur ImmoTopia.
        Vous y gérerez ses biens, ses baux et ses encaissements selon les droits qui vous sont attribués.
      </p>

      <table style="width: 100%; border-collapse: collapse; background-color: #f7f9fc; border-left: 4px solid #3498db; border-radius: 4px; margin: 24px 0;">
        <tr>
          <td style="padding: 14px 16px 4px; color: #6b7c8f; font-size: 13px;">Agence</td>
        </tr>
        <tr>
          <td style="padding: 0 16px 12px; font-size: 15px;"><strong>${agency}</strong></td>
        </tr>
        <tr>
          <td style="padding: 0 16px 4px; color: #6b7c8f; font-size: 13px;">Rôle${roleLabels.length > 1 ? 's' : ''} attribué${roleLabels.length > 1 ? 's' : ''}</td>
        </tr>
        <tr>
          <td style="padding: 0 16px 14px; font-size: 15px;"><strong>${roles}</strong></td>
        </tr>
      </table>

      <p style="margin: 0 0 8px;">Pour activer votre accès, définissez votre mot de passe en cliquant ci-dessous :</p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${inviteUrl}" style="background-color: #3498db; color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 15px;">Accepter l'invitation</a>
      </div>

      <p style="margin: 0 0 6px; font-size: 14px; color: #6b7c8f;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :</p>
      <p style="margin: 0 0 20px; word-break: break-all; font-size: 13px;"><a href="${inviteUrl}" style="color: #3498db;">${inviteUrl}</a></p>

      <p style="margin: 0 0 16px; background-color: #fff8e6; border-left: 4px solid #f0ad4e; padding: 12px 16px; border-radius: 4px; font-size: 14px;">
        <strong>Cette invitation expire le ${expiry}.</strong> Passé ce délai, demandez à l'agence de vous la renvoyer.
      </p>

      <p style="margin: 0; font-size: 14px; color: #6b7c8f;">
        Si vous n'attendiez pas cette invitation, ignorez simplement ce message : aucun compte ne sera créé
        tant que vous n'aurez pas défini de mot de passe.
      </p>

      <hr style="border: none; border-top: 1px solid #e6ebf1; margin: 28px 0 16px;">
      <p style="margin: 0; font-size: 12px; color: #98a6b5; text-align: center;">
        Cet email vous a été envoyé automatiquement à la demande de l'agence ${agency}, merci de ne pas y répondre.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}

/**
 * Activation d'un bail - notification au locataire et au proprietaire
 * @param params.recipientName - Nom reel du destinataire (jamais un libelle generique)
 * @param params.recipientRole - RENTER ou OWNER, change le texte d'accompagnement
 * @param params.accessUrl - Lien de definition du mot de passe (compte neuf) ou de connexion
 * @param params.isNewAccount - true si le destinataire doit encore definir son mot de passe
 * @returns HTML email template
 */
export function getLeaseActivatedTemplate(params: {
  recipientName: string;
  recipientRole: 'RENTER' | 'OWNER';
  agencyName: string;
  leaseNumber: string;
  propertyAddress: string;
  leaseStartDate: string;
  leaseEndDate: string;
  rentAmount: string;
  serviceChargeAmount?: string;
  dueDayOfMonth?: number;
  accessUrl: string;
  forgotPasswordUrl: string;
  isNewAccount: boolean;
}): string {
  const name = escapeHtml(params.recipientName);
  const agency = escapeHtml(params.agencyName);
  const lease = escapeHtml(params.leaseNumber);
  const address = escapeHtml(params.propertyAddress);
  const isRenter = params.recipientRole === 'RENTER';

  const intro = isRenter
    ? `Votre bail de location vient d'être activé par l'agence <strong>${agency}</strong>. Vous trouverez ci-dessous les informations essentielles de votre contrat.`
    : `Le bail de location de votre bien vient d'être activé par l'agence <strong>${agency}</strong>. Vous pouvez désormais suivre les encaissements et les reversements depuis votre espace.`;

  const portalLine = isRenter
    ? 'Votre espace locataire vous permet de consulter vos échéances, de déclarer vos paiements et de télécharger vos quittances.'
    : 'Votre espace propriétaire vous permet de suivre les loyers encaissés, les reversements et les incidents déclarés sur votre bien.';

  const accessBlock = params.isNewAccount
    ? `<p style="margin: 0 0 8px;">Pour activer votre accès, définissez votre mot de passe :</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${params.accessUrl}" style="background-color: #166534; color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 15px;">Définir mon mot de passe</a>
      </div>
      <p style="margin: 0 0 4px; font-size: 14px; color: #6b7c8f;">Si le bouton ne fonctionne pas, copiez ce lien :</p>
      <p style="margin: 0 0 20px; word-break: break-all; font-size: 13px;"><a href="${params.accessUrl}" style="color: #166534;">${params.accessUrl}</a></p>`
    : `<p style="margin: 0 0 8px;">Votre compte existe déjà : connectez-vous pour consulter votre dossier.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${params.accessUrl}" style="background-color: #166534; color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 15px;">Accéder à mon espace</a>
      </div>
      <p style="margin: 0 0 20px; font-size: 14px; color: #6b7c8f;">Mot de passe oublié ? <a href="${params.forgotPasswordUrl}" style="color: #166534;">Réinitialisez-le ici</a>.</p>`;

  const row = (label: string, value: string) => `
        <tr>
          <td style="padding: 10px 16px; color: #6b7c8f; font-size: 13px; border-bottom: 1px solid #e6ebf1; width: 45%;">${label}</td>
          <td style="padding: 10px 16px; font-size: 14px; border-bottom: 1px solid #e6ebf1;"><strong>${value}</strong></td>
        </tr>`;

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bail activé — ${lease}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #eef2f7;">
  <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px 16px;">

    <div style="background-color: #166534; padding: 28px 32px; border-radius: 8px 8px 0 0; text-align: center;">
      <p style="margin: 0; color: #ffffff; font-size: 22px; font-weight: bold; letter-spacing: 0.5px;">${agency}</p>
      <p style="margin: 6px 0 0; color: #b7d4be; font-size: 13px;">Gestion locative</p>
    </div>

    <div style="background-color: #ffffff; padding: 32px; border-radius: 0 0 8px 8px;">
      <h1 style="color: #166534; font-size: 21px; margin: 0 0 20px;">Votre bail est activé</h1>

      <p style="margin: 0 0 16px;">Bonjour ${name},</p>
      <p style="margin: 0 0 24px;">${intro}</p>

      <table style="width: 100%; border-collapse: collapse; background-color: #f7f9fc; border-radius: 4px; margin: 0 0 24px;">
        ${row('Référence du bail', lease)}
        ${address ? row('Bien concerné', address) : ''}
        ${row('Période', `${params.leaseStartDate} au ${params.leaseEndDate}`)}
        ${row(isRenter ? 'Loyer mensuel' : 'Loyer perçu', params.rentAmount)}
        ${params.serviceChargeAmount ? row('Charges', params.serviceChargeAmount) : ''}
        ${params.dueDayOfMonth ? row('Échéance', `le ${params.dueDayOfMonth} de chaque mois`) : ''}
      </table>

      ${accessBlock}

      <p style="margin: 0 0 16px; font-size: 14px; color: #6b7c8f;">${portalLine}</p>

      <hr style="border: none; border-top: 1px solid #e6ebf1; margin: 28px 0 16px;">
      <p style="margin: 0 0 4px; font-size: 13px; color: #6b7c8f;">Cordialement,<br><strong>${agency}</strong></p>
      <p style="margin: 12px 0 0; font-size: 12px; color: #98a6b5;">
        Cet email vous a été envoyé automatiquement, merci de ne pas y répondre.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}
