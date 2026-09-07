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
