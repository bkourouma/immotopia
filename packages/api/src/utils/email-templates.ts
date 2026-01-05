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
