import { Request, Response } from 'express';
import {
  registerUser,
  REGISTRATION_ACCEPTED_MESSAGE,
  verifyEmail,
  resendVerificationEmail,
  loginUser,
  refreshAccessToken,
  getCurrentUser,
  logoutUser,
  forgotPassword,
  resetPassword,
  setPreferredLanguage
} from '../services/auth-service';
import { RegisterRequest, LoginRequest } from '../types/auth-types';
import { setAuthCookies, setAccessTokenCookie, clearAuthCookies } from '../utils/auth-cookies';
import { isLanguage, t } from '../i18n';
import { logger } from '../utils/logger';
import { BadRequestError, UnauthorizedError } from '../middleware/error-middleware';

/**
 * Register a new user
 * POST /api/auth/register
 */
export async function register(req: Request, res: Response): Promise<void> {
  const data: RegisterRequest = {
    email: req.body.email,
    password: req.body.password,
    fullName: req.body.fullName
  };

  await registerUser(data);

  // Même réponse que l'adresse existe déjà ou non : aucun compte n'est révélé.
  res.status(201).json({ success: true, message: t(REGISTRATION_ACCEPTED_MESSAGE) });
}

/**
 * Verify email with token
 * GET /api/auth/verify-email?token=XXX
 */
export async function verifyEmailHandler(req: Request, res: Response): Promise<void> {
  const token = typeof req.query.token === 'string' ? req.query.token : '';

  if (!token) {
    throw new BadRequestError('Token de vérification requis.');
  }

  // Les refus métier (jeton invalide, expiré) sont des BadRequestError levées
  // par le service : 400 avec leur texte. Une panne imprévue devient un 500
  // générique via `errorHandler`, sans message interne.
  const user = await verifyEmail(token);

  res.status(200).json({
    success: true,
    message: 'Email vérifié avec succès !',
    user
  });
}

/**
 * Resend verification email
 * POST /api/auth/resend-verification
 */
export async function resendVerification(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;
    await resendVerificationEmail(email);
  } catch (error) {
    // Reponse identique dans tous les cas (pas d'enumeration de comptes) ;
    // le detail reste dans les journaux.
    logger.error('Resend verification failed', { error });
  }
  res.status(200).json({
    success: true,
    message: "Si cette adresse email existe et n'est pas encore vérifiée, un nouvel email de vérification a été envoyé."
  });
}

/**
 * Login user
 * POST /api/auth/login
 */
export async function login(req: Request, res: Response): Promise<void> {
  const data: LoginRequest = {
    email: req.body.email,
    password: req.body.password
  };

  // Échec métier : BadRequestError (400), le limiteur `loginRateLimiter` compte
  // les réponses >= 400. Panne imprévue : 500 générique via `errorHandler`.
  const result = await loginUser(data, { ip: req.ip });

  setAuthCookies(res, result.accessToken, result.refreshToken);

  res.status(200).json({
    success: true,
    message: 'Connexion réussie.',
    user: result.user
  });
}

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
export async function refresh(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    res.status(401).json({ success: false, message: 'Refresh token manquant.' });
    return;
  }

  try {
    const result = await refreshAccessToken(refreshToken, req.headers['user-agent']);

    if (result.refreshToken === null) {
      // Doublon toléré (autre onglet) : le cookie de rafraîchissement de la requête gagnante
      // reste celui du navigateur, on ne pose que le nouvel accessToken.
      setAccessTokenCookie(res, result.accessToken);
    } else {
      // The refresh token is rotated on every use: both cookies must be replaced.
      setAuthCookies(res, result.accessToken, result.refreshToken);
    }

    res.status(200).json({ success: true, message: 'Token rafraîchi avec succès.' });
  } catch (error) {
    // Seul un refus d'authentification (erreur typée) efface les cookies et
    // répond 401. Une panne (base indisponible...) remonte au middleware
    // d'erreurs (500) sans toucher aux cookies : le client réessaiera au lieu
    // de perdre une session valable.
    if (!(error instanceof UnauthorizedError)) throw error;
    clearAuthCookies(res);
    res.status(401).json({ success: false, message: error.message });
  }
}

/**
 * Get current user
 * GET /api/auth/me
 */
export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.user.userId) {
    res.status(401).json({ success: false, message: 'Authentification requise.' });
    return;
  }

  const user = await getCurrentUser(req.user.userId);
  res.status(200).json({ success: true, user });
}

/**
 * Enregistre la langue preferee du compte.
 * PATCH /api/auth/me/language
 *
 * Cette preference ne sert PAS a traduire les reponses de l'API : le navigateur
 * dit deja sa langue a chaque appel (`Accept-Language`). Elle sert a ce que le
 * navigateur ne peut pas faire — ecrire un e-mail dans la bonne langue quand
 * personne n'est connecte — et a retrouver son choix depuis un autre appareil.
 */
export async function updateMyLanguage(req: Request, res: Response): Promise<void> {
  if (!req.user?.userId) {
    throw new UnauthorizedError();
  }

  const { language } = req.body ?? {};
  if (!isLanguage(language)) {
    throw new BadRequestError('Langue non prise en charge.');
  }

  const user = await setPreferredLanguage(req.user.userId, language);
  res.status(200).json({ success: true, user });
}

/**
 * Logout user
 * POST /api/auth/logout
 */
export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await logoutUser(refreshToken);
    }
    clearAuthCookies(res);
    res.status(200).json({ success: true, message: 'Déconnexion réussie.' });
  } catch (error) {
    clearAuthCookies(res);
    res.status(200).json({ success: true, message: 'Déconnexion réussie.' });
  }
}

/**
 * Forgot password
 * POST /api/auth/forgot-password
 */
export async function forgotPasswordHandler(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;
    await forgotPassword({ email });
    res.status(200).json({
      success: true,
      message: 'Si cette adresse email existe, un email de réinitialisation de mot de passe a été envoyé.'
    });
  } catch (error) {
    res.status(200).json({
      success: true,
      message: 'Si cette adresse email existe, un email de réinitialisation de mot de passe a été envoyé.'
    });
  }
}

/**
 * Reset password
 * POST /api/auth/reset-password
 */
export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  // Échec métier : BadRequestError (400) levée par le service ; panne : 500 générique.
  await resetPassword(req.body);
  res.status(200).json({
    success: true,
    message: 'Mot de passe réinitialisé avec succès ! Vous pouvez maintenant vous connecter.'
  });
}
