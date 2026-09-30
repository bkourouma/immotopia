import { currentLanguage, Language, t } from '../i18n';

/**
 * Gabarits d'e-mail du module d'authentification et des notifications.
 *
 * Chaque fonction prend une **langue** en dernier parametre. Par defaut, celle
 * de la requete en cours : un e-mail de verification part dans la langue de
 * l'ecran qui vient de le declencher. Les envois hors requete (jobs, relances)
 * passent la langue du destinataire, lue dans `users.preferred_language`.
 *
 * Le francais reste la langue source : `t()` renvoie son argument quand aucune
 * traduction n'existe, si bien qu'un gabarit non traduit part en francais
 * plutot que vide.
 */

/** Attributs `lang` et `dir` du document, et sens du texte pour le corps. */
function documentDirection(language: Language): { lang: string; dir: 'ltr' | 'rtl' } {
  return { lang: language, dir: language === 'ar' ? 'rtl' : 'ltr' };
}

/** Locale BCP-47 pour les dates du corps de l'e-mail. */
function locale(language: Language): string {
  return language === 'fr' ? 'fr-FR' : language === 'en' ? 'en-US' : 'ar';
}

/**
 * Echappe les valeurs interpolees dans un template HTML.
 * Le nom de l'agence et les libelles de roles proviennent de donnees saisies :
 * ils ne doivent pas pouvoir injecter de balises dans l'email.
 */
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Email verification template
 * @param verificationUrl - Full URL with token for email verification
 * @param userName - User's full name
 * @param language - Langue de l'e-mail
 * @returns HTML email template
 */
export function getEmailVerificationTemplate(
  verificationUrl: string,
  userName: string,
  language: Language = currentLanguage()
): string {
  const { lang, dir } = documentDirection(language);
  return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('Vérification de votre adresse email', undefined, language)}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; direction: ${dir};">
  <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
    <h1 style="color: #2c3e50;">${t('Bienvenue sur ImmoTopia !', undefined, language)}</h1>
    <p>${t('Bonjour {{name}},', { name: escapeHtml(userName) }, language)}</p>
    <p>${t(
      'Merci de vous être inscrit sur notre plateforme. Pour activer votre compte, veuillez vérifier votre adresse email en cliquant sur le lien ci-dessous :',
      undefined,
      language
    )}</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${escapeHtml(verificationUrl)}" style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">${t('Vérifier mon email', undefined, language)}</a>
    </div>
    <p>${t('Ou copiez et collez ce lien dans votre navigateur :', undefined, language)}</p>
    <p style="word-break: break-all; color: #3498db; direction: ltr;">${escapeHtml(verificationUrl)}</p>
    <p><strong>${t('Ce lien expire dans 24 heures.', undefined, language)}</strong></p>
    <p>${t("Si vous n'avez pas créé de compte sur notre plateforme, vous pouvez ignorer cet email.", undefined, language)}</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="font-size: 12px; color: #777;">${t('Cet email a été envoyé automatiquement, merci de ne pas y répondre.', undefined, language)}</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Password reset email template
 * @param resetUrl - Full URL with token for password reset
 * @param userName - User's full name
 * @param language - Langue de l'e-mail
 * @returns HTML email template
 */
export function getPasswordResetTemplate(
  resetUrl: string,
  userName: string,
  language: Language = currentLanguage()
): string {
  const { lang, dir } = documentDirection(language);
  return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('Réinitialisation de votre mot de passe', undefined, language)}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; direction: ${dir};">
  <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
    <h1 style="color: #2c3e50;">${t('Réinitialisation de mot de passe', undefined, language)}</h1>
    <p>${t('Bonjour {{name}},', { name: escapeHtml(userName) }, language)}</p>
    <p>${t(
      'Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le lien ci-dessous pour créer un nouveau mot de passe :',
      undefined,
      language
    )}</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${escapeHtml(resetUrl)}" style="background-color: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">${t('Réinitialiser mon mot de passe', undefined, language)}</a>
    </div>
    <p>${t('Ou copiez et collez ce lien dans votre navigateur :', undefined, language)}</p>
    <p style="word-break: break-all; color: #e74c3c; direction: ltr;">${escapeHtml(resetUrl)}</p>
    <p><strong>${t('Ce lien expire dans 1 heure.', undefined, language)}</strong></p>
    <p>${t(
      "Si vous n'avez pas demandé de réinitialisation de mot de passe, vous pouvez ignorer cet email. Votre mot de passe restera inchangé.",
      undefined,
      language
    )}</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="font-size: 12px; color: #777;">${t('Cet email a été envoyé automatiquement, merci de ne pas y répondre.', undefined, language)}</p>
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
 * @param language - Langue de l'e-mail
 */
export function getAccountCreationTemplate(
  resetUrl: string,
  userName: string,
  tenantName: string,
  leaseNumber: string,
  propertyAddress: string | null,
  clientType: 'RENTER' | 'OWNER',
  language: Language = currentLanguage()
): string {
  const { lang, dir } = documentDirection(language);
  // Les deux branches appellent `t()` separement : l'extracteur ne lit que des
  // litteraux, et `t(condition ? 'a' : 'b')` ne lui aurait rien donne a recenser.
  const accountType =
    clientType === 'RENTER' ? t('locataire', undefined, language) : t('propriétaire', undefined, language);
  const accountTypeCapitalized =
    clientType === 'RENTER' ? t('Locataire', undefined, language) : t('Propriétaire', undefined, language);

  return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('Votre compte ImmoTopia a été créé', undefined, language)}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; direction: ${dir};">
  <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
    <h1 style="color: #2c3e50;">${t('Votre compte ImmoTopia a été créé', undefined, language)}</h1>
    <p>${t('Bonjour {{name}},', { name: escapeHtml(userName) }, language)}</p>
    <p>${t(
      'Un compte {{accountType}} a été créé pour vous sur la plateforme ImmoTopia par {{agency}}.',
      { accountType, agency: `<strong>${escapeHtml(tenantName)}</strong>` },
      language
    )}</p>

    <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 20px 0; border-inline-start: 4px solid #3498db;">
      <h2 style="color: #2c3e50; margin-top: 0; font-size: 18px;">${t('Informations sur votre bail', undefined, language)}</h2>
      <p><strong>${t('Type de compte :', undefined, language)}</strong> ${accountTypeCapitalized}</p>
      <p><strong>${t('Numéro de bail :', undefined, language)}</strong> ${escapeHtml(leaseNumber)}</p>
      ${propertyAddress ? `<p><strong>${t('Propriété :', undefined, language)}</strong> ${escapeHtml(propertyAddress)}</p>` : ''}
    </div>

    <p>${t('Pour activer votre compte et définir votre mot de passe, cliquez sur le lien ci-dessous :', undefined, language)}</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${escapeHtml(resetUrl)}" style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">${t('Définir mon mot de passe', undefined, language)}</a>
    </div>
    <p>${t('Ou copiez et collez ce lien dans votre navigateur :', undefined, language)}</p>
    <p style="word-break: break-all; color: #3498db; direction: ltr;">${escapeHtml(resetUrl)}</p>
    <p><strong>${t('Ce lien expire dans 7 jours.', undefined, language)}</strong></p>

    <p>${t(
      'Une fois votre mot de passe défini, vous pourrez vous connecter à votre espace {{accountType}} pour consulter les informations relatives à votre bail.',
      { accountType },
      language
    )}</p>

    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="font-size: 12px; color: #777;">${t(
      'Cet email a été envoyé automatiquement par {{agency}}, merci de ne pas y répondre.',
      { agency: escapeHtml(tenantName) },
      language
    )}</p>
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
  agencyName?: string,
  language: Language = currentLanguage()
): string {
  const { lang, dir } = documentDirection(language);
  const agencyLabel = escapeHtml(agencyName || 'ImmoTopia');
  return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('Nouveau ticket de maintenance', undefined, language)}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; direction: ${dir};">
  <div style="background-color: #fff7e6; border: 1px solid #ffd591; padding: 20px; border-radius: 8px;">
    <h2 style="color: #fa8c16; margin-top: 0;">${t('Nouveau ticket de maintenance', undefined, language)}</h2>
    <p>${t(
      'Un locataire a créé une nouvelle demande de maintenance pour {{agency}}.',
      { agency: `<strong>${agencyLabel}</strong>` },
      language
    )}</p>
    <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding:8px 0; color:#666;"><strong>${t('Sujet :', undefined, language)}</strong></td><td style="padding:8px 0;">${escapeHtml(ticketTitle)}</td></tr>
      <tr><td style="padding:8px 0; color:#666;"><strong>${t('Référence :', undefined, language)}</strong></td><td style="padding:8px 0;">${escapeHtml(ticketId)}</td></tr>
      <tr><td style="padding:8px 0; color:#666;"><strong>${t('Propriété :', undefined, language)}</strong></td><td style="padding:8px 0;">${escapeHtml(propertyReference)}</td></tr>
    </table>
    <p><a href="${ticketUrl}" style="background-color: #fa8c16; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">${t('Voir le ticket', undefined, language)}</a></p>
    <hr style="border: none; border-top: 1px solid #ffe7ba; margin: 20px 0;">
    <p style="font-size: 12px; color: #777;">${t(
      'Cet email a été envoyé automatiquement par {{agency}}.',
      { agency: agencyLabel },
      language
    )}</p>
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
  agencyName?: string,
  language: Language = currentLanguage()
): string {
  const { lang, dir } = documentDirection(language);
  const agencyLabel = agencyName ? escapeHtml(agencyName) : t("l'agence", undefined, language);
  return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('Mise à jour ticket de maintenance', undefined, language)}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; direction: ${dir};">
  <div style="background-color: #e6f7ff; border: 1px solid #91d5ff; padding: 20px; border-radius: 8px;">
    <h2 style="color: #1890ff; margin-top: 0;">${t('Mise à jour de votre ticket de maintenance', undefined, language)}</h2>
    <p>${t(
      '{{agency}} a mis à jour le statut de votre demande de maintenance.',
      { agency: `<strong>${agencyLabel}</strong>` },
      language
    )}</p>
    <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding:8px 0; color:#666;"><strong>${t('Sujet :', undefined, language)}</strong></td><td style="padding:8px 0;">${escapeHtml(ticketTitle)}</td></tr>
      <tr><td style="padding:8px 0; color:#666;"><strong>${t('Ancien statut :', undefined, language)}</strong></td><td style="padding:8px 0;">${t(oldStatusLabel, undefined, language)}</td></tr>
      <tr><td style="padding:8px 0; color:#666;"><strong>${t('Nouveau statut :', undefined, language)}</strong></td><td style="padding:8px 0;"><strong>${t(newStatusLabel, undefined, language)}</strong></td></tr>
    </table>
    <p><a href="${ticketUrl}" style="background-color: #1890ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">${t('Voir le ticket', undefined, language)}</a></p>
    <hr style="border: none; border-top: 1px solid #bae7ff; margin: 20px 0;">
    <p style="font-size: 12px; color: #777;">${t('Cet email a été envoyé automatiquement.', undefined, language)}</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Invitation d'un collaborateur a rejoindre une agence
 * @param inviteUrl - URL complete d'acceptation (avec le token)
 * @param tenantName - Nom de l'agence qui invite
 * @param roleLabels - Libelles francais des roles attribues (peut etre vide)
 * @param expiresAt - Date d'expiration de l'invitation
 * @param language - Langue de l'e-mail
 * @returns HTML email template
 */
export function getInvitationTemplate(
  inviteUrl: string,
  tenantName: string,
  roleLabels: string[],
  expiresAt: Date,
  language: Language = currentLanguage()
): string {
  const { lang, dir } = documentDirection(language);
  const agency = escapeHtml(tenantName);
  // L'arabe separe une enumeration par sa propre virgule (U+060C), pas par ','.
  const listSeparator = language === 'ar' ? '، ' : ', ';
  const roles =
    roleLabels.length > 0
      ? roleLabels.map(label => escapeHtml(t(label, undefined, language))).join(listSeparator)
      : t('Collaborateur', undefined, language);
  const expiry = expiresAt.toLocaleDateString(locale(language), {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  const rolesLabel =
    roleLabels.length > 1 ? t('Rôles attribués', undefined, language) : t('Rôle attribué', undefined, language);

  return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('Invitation à rejoindre {{agency}}', { agency }, language)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #eef2f7;">
  <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px 16px; direction: ${dir};">

    <div style="background-color: #2c3e50; padding: 28px 32px; border-radius: 8px 8px 0 0; text-align: center;">
      <p style="margin: 0; color: #ffffff; font-size: 22px; font-weight: bold; letter-spacing: 0.5px;">ImmoTopia</p>
      <p style="margin: 6px 0 0; color: #aebfd0; font-size: 13px;">${t('Plateforme de gestion immobilière', undefined, language)}</p>
    </div>

    <div style="background-color: #ffffff; padding: 32px; border-radius: 0 0 8px 8px;">
      <h1 style="color: #2c3e50; font-size: 21px; margin: 0 0 20px;">${t('Invitation à rejoindre {{agency}}', { agency }, language)}</h1>

      <p style="margin: 0 0 16px;">${t('Madame, Monsieur,', undefined, language)}</p>
      <p style="margin: 0 0 16px;">
        ${t(
          "L'agence {{agency}} vous invite à rejoindre son espace de travail sur ImmoTopia. Vous y gérerez ses biens, ses baux et ses encaissements selon les droits qui vous sont attribués.",
          { agency: `<strong>${agency}</strong>` },
          language
        )}
      </p>

      <table style="width: 100%; border-collapse: collapse; background-color: #f7f9fc; border-inline-start: 4px solid #3498db; border-radius: 4px; margin: 24px 0;">
        <tr>
          <td style="padding: 14px 16px 4px; color: #6b7c8f; font-size: 13px;">${t('Agence', undefined, language)}</td>
        </tr>
        <tr>
          <td style="padding: 0 16px 12px; font-size: 15px;"><strong>${agency}</strong></td>
        </tr>
        <tr>
          <td style="padding: 0 16px 4px; color: #6b7c8f; font-size: 13px;">${rolesLabel}</td>
        </tr>
        <tr>
          <td style="padding: 0 16px 14px; font-size: 15px;"><strong>${roles}</strong></td>
        </tr>
      </table>

      <p style="margin: 0 0 8px;">${t('Pour activer votre accès, définissez votre mot de passe en cliquant ci-dessous :', undefined, language)}</p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${inviteUrl}" style="background-color: #3498db; color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 15px;">${t("Accepter l'invitation", undefined, language)}</a>
      </div>

      <p style="margin: 0 0 6px; font-size: 14px; color: #6b7c8f;">${t('Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :', undefined, language)}</p>
      <p style="margin: 0 0 20px; word-break: break-all; font-size: 13px; direction: ltr;"><a href="${inviteUrl}" style="color: #3498db;">${inviteUrl}</a></p>

      <p style="margin: 0 0 16px; background-color: #fff8e6; border-inline-start: 4px solid #f0ad4e; padding: 12px 16px; border-radius: 4px; font-size: 14px;">
        <strong>${t('Cette invitation expire le {{expiry}}.', { expiry }, language)}</strong> ${t("Passé ce délai, demandez à l'agence de vous la renvoyer.", undefined, language)}
      </p>

      <p style="margin: 0; font-size: 14px; color: #6b7c8f;">
        ${t(
          "Si vous n'attendiez pas cette invitation, ignorez simplement ce message : aucun compte ne sera créé tant que vous n'aurez pas défini de mot de passe.",
          undefined,
          language
        )}
      </p>

      <hr style="border: none; border-top: 1px solid #e6ebf1; margin: 28px 0 16px;">
      <p style="margin: 0; font-size: 12px; color: #98a6b5; text-align: center;">
        ${t(
          "Cet email vous a été envoyé automatiquement à la demande de l'agence {{agency}}, merci de ne pas y répondre.",
          { agency },
          language
        )}
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
 * @param params.language - Langue de l'e-mail, celle du destinataire
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
  language?: Language;
}): string {
  const language = params.language ?? currentLanguage();
  const { lang, dir } = documentDirection(language);
  const name = escapeHtml(params.recipientName);
  const agency = escapeHtml(params.agencyName);
  const lease = escapeHtml(params.leaseNumber);
  const address = escapeHtml(params.propertyAddress);
  const isRenter = params.recipientRole === 'RENTER';

  const intro = isRenter
    ? t(
        "Votre bail de location vient d'être activé par l'agence {{agency}}. Vous trouverez ci-dessous les informations essentielles de votre contrat.",
        { agency: `<strong>${agency}</strong>` },
        language
      )
    : t(
        "Le bail de location de votre bien vient d'être activé par l'agence {{agency}}. Vous pouvez désormais suivre les encaissements et les reversements depuis votre espace.",
        { agency: `<strong>${agency}</strong>` },
        language
      );

  const portalLine = isRenter
    ? t(
        'Votre espace locataire vous permet de consulter vos échéances, de déclarer vos paiements et de télécharger vos quittances.',
        undefined,
        language
      )
    : t(
        'Votre espace propriétaire vous permet de suivre les loyers encaissés, les reversements et les incidents déclarés sur votre bien.',
        undefined,
        language
      );

  const accessBlock = params.isNewAccount
    ? `<p style="margin: 0 0 8px;">${t('Pour activer votre accès, définissez votre mot de passe :', undefined, language)}</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${params.accessUrl}" style="background-color: #166534; color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 15px;">${t('Définir mon mot de passe', undefined, language)}</a>
      </div>
      <p style="margin: 0 0 4px; font-size: 14px; color: #6b7c8f;">${t('Si le bouton ne fonctionne pas, copiez ce lien :', undefined, language)}</p>
      <p style="margin: 0 0 20px; word-break: break-all; font-size: 13px; direction: ltr;"><a href="${params.accessUrl}" style="color: #166534;">${params.accessUrl}</a></p>`
    : `<p style="margin: 0 0 8px;">${t('Votre compte existe déjà : connectez-vous pour consulter votre dossier.', undefined, language)}</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${params.accessUrl}" style="background-color: #166534; color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 15px;">${t('Accéder à mon espace', undefined, language)}</a>
      </div>
      <p style="margin: 0 0 20px; font-size: 14px; color: #6b7c8f;">${t('Mot de passe oublié ?', undefined, language)} <a href="${params.forgotPasswordUrl}" style="color: #166534;">${t('Réinitialisez-le ici', undefined, language)}</a>.</p>`;

  const row = (label: string, value: string) => `
        <tr>
          <td style="padding: 10px 16px; color: #6b7c8f; font-size: 13px; border-bottom: 1px solid #e6ebf1; width: 45%;">${label}</td>
          <td style="padding: 10px 16px; font-size: 14px; border-bottom: 1px solid #e6ebf1;"><strong>${value}</strong></td>
        </tr>`;

  return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('Bail activé', undefined, language)} — ${lease}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #eef2f7;">
  <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px 16px; direction: ${dir};">

    <div style="background-color: #166534; padding: 28px 32px; border-radius: 8px 8px 0 0; text-align: center;">
      <p style="margin: 0; color: #ffffff; font-size: 22px; font-weight: bold; letter-spacing: 0.5px;">${agency}</p>
      <p style="margin: 6px 0 0; color: #b7d4be; font-size: 13px;">${t('Gestion locative', undefined, language)}</p>
    </div>

    <div style="background-color: #ffffff; padding: 32px; border-radius: 0 0 8px 8px;">
      <h1 style="color: #166534; font-size: 21px; margin: 0 0 20px;">${t('Votre bail est activé', undefined, language)}</h1>

      <p style="margin: 0 0 16px;">${t('Bonjour {{name}},', { name }, language)}</p>
      <p style="margin: 0 0 24px;">${intro}</p>

      <table style="width: 100%; border-collapse: collapse; background-color: #f7f9fc; border-radius: 4px; margin: 0 0 24px;">
        ${row(t('Référence du bail', undefined, language), lease)}
        ${address ? row(t('Bien concerné', undefined, language), address) : ''}
        ${row(
          t('Période', undefined, language),
          t('{{start}} au {{end}}', { start: params.leaseStartDate, end: params.leaseEndDate }, language)
        )}
        ${row(
          isRenter ? t('Loyer mensuel', undefined, language) : t('Loyer perçu', undefined, language),
          params.rentAmount
        )}
        ${params.serviceChargeAmount ? row(t('Charges', undefined, language), params.serviceChargeAmount) : ''}
        ${
          params.dueDayOfMonth
            ? row(
                t('Échéance', undefined, language),
                t('le {{day}} de chaque mois', { day: params.dueDayOfMonth }, language)
              )
            : ''
        }
      </table>

      ${accessBlock}

      <p style="margin: 0 0 16px; font-size: 14px; color: #6b7c8f;">${portalLine}</p>

      <hr style="border: none; border-top: 1px solid #e6ebf1; margin: 28px 0 16px;">
      <p style="margin: 0 0 4px; font-size: 13px; color: #6b7c8f;">${t('Cordialement,', undefined, language)}<br><strong>${agency}</strong></p>
      <p style="margin: 12px 0 0; font-size: 12px; color: #98a6b5;">
        ${t('Cet email vous a été envoyé automatiquement, merci de ne pas y répondre.', undefined, language)}
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}

/**
 * Invitation au portail coproprietaire (lot « portail coproprietaire »).
 *
 * @param params.accessUrl - Lien de definition du mot de passe (compte neuf ou
 *   jamais active) ou de connexion (compte deja utilise)
 * @param params.isActivation - true si le destinataire doit encore definir son mot de passe
 * @param params.lots - Lots ouverts au portail, pour que le destinataire sache de quoi il s'agit
 * @param params.language - Langue de l'e-mail
 */
export function getCoOwnerPortalInvitationTemplate(params: {
  accessUrl: string;
  userName: string;
  agencyName: string;
  lots: Array<{ syndicateName: string; lotNumber: string }>;
  isActivation: boolean;
  language?: Language;
}): string {
  const language = params.language ?? currentLanguage();
  const { lang, dir } = documentDirection(language);
  const agency = escapeHtml(params.agencyName);
  const userName = escapeHtml(params.userName);
  const accessUrl = escapeHtml(params.accessUrl);
  const lotRows = params.lots
    .map(
      lot =>
        `<li style="margin: 0 0 4px;">${escapeHtml(lot.syndicateName)} — ${t('lot {{lotNumber}}', { lotNumber: escapeHtml(lot.lotNumber) }, language)}</li>`
    )
    .join('');
  const intro = params.isActivation
    ? t('Pour activer votre accès, définissez votre mot de passe en cliquant ci-dessous :', undefined, language)
    : t(
        'Vous avez déjà un compte ImmoTopia : connectez-vous avec votre adresse e-mail et votre mot de passe habituels.',
        undefined,
        language
      );
  const cta = params.isActivation
    ? t('Définir mon mot de passe', undefined, language)
    : t('Accéder à mon espace', undefined, language);

  return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('Votre espace copropriétaire', undefined, language)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #eef2f7;">
  <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px 16px; direction: ${dir};">
    <div style="background-color: #ffffff; padding: 32px; border-radius: 8px;">
      <h1 style="color: #2c3e50; font-size: 21px; margin: 0 0 20px;">${t('Votre espace copropriétaire', undefined, language)}</h1>
      <p style="margin: 0 0 16px;">${t('Bonjour {{name}},', { name: escapeHtml(userName) }, language)}</p>
      <p style="margin: 0 0 16px;">${t(
        "L'agence {{agency}} vous ouvre un accès en lecture à votre espace copropriétaire : vos lots, le compte de chaque lot, vos appels de charges, les documents et les assemblées générales de votre copropriété.",
        { agency: `<strong>${agency}</strong>` },
        language
      )}</p>
      ${lotRows ? `<ul style="margin: 0 0 20px; padding-inline-start: 20px;">${lotRows}</ul>` : ''}
      <p style="margin: 0 0 8px;">${intro}</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${accessUrl}" style="background-color: #3498db; color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 15px;">${cta}</a>
      </div>
      <p style="margin: 0 0 6px; font-size: 14px; color: #6b7c8f;">${t('Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :', undefined, language)}</p>
      <p style="margin: 0 0 20px; word-break: break-all; font-size: 13px; direction: ltr;"><a href="${accessUrl}" style="color: #3498db;">${accessUrl}</a></p>
      ${params.isActivation ? `<p style="margin: 0 0 16px;"><strong>${t('Ce lien expire dans 7 jours.', undefined, language)}</strong></p>` : ''}
      <hr style="border: none; border-top: 1px solid #e6ebf1; margin: 28px 0 16px;">
      <p style="margin: 0; font-size: 12px; color: #98a6b5; text-align: center;">${t(
        "Cet email vous a été envoyé automatiquement à la demande de l'agence {{agency}}, merci de ne pas y répondre.",
        { agency },
        language
      )}</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
