import { Request, Response } from 'express';
import {
  registerUser,
  verifyEmail,
  resendVerificationEmail,
  loginUser,
  refreshAccessToken,
  getCurrentUser,
  logoutUser,
  forgotPassword,
  resetPassword
} from '../services/auth-service';
import { RegisterRequest, LoginRequest } from '../types/auth-types';

/**
 * Register a new user
 * POST /api/auth/register
 */
export async function register(req: Request, res: Response): Promise<void> {
  try {
    // Explicit cast or validation should ideally happen in middleware
    const data: RegisterRequest = {
      email: req.body.email,
      password: req.body.password,
      fullName: req.body.fullName
    };

    const user = await registerUser(data);

    res.status(201).json({
      success: true,
      message: 'Inscription réussie ! Veuillez vérifier votre email.',
      user
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Une erreur est survenue lors de l'inscription.";
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Verify email with token
 * GET /api/auth/verify-email?token=XXX
 */
export async function verifyEmailHandler(req: Request, res: Response): Promise<void> {
  try {
    const token = req.query.token as string;

    if (!token) {
      res.status(400).json({ success: false, message: 'Token de vérification requis.' });
      return;
    }

    const user = await verifyEmail(token);

    res.status(200).json({
      success: true,
      message: 'Email vérifié avec succès !',
      user
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue lors de la vérification.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Resend verification email
 * POST /api/auth/resend-verification
 */
export async function resendVerification(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;
    await resendVerificationEmail(email);
    res.status(200).json({
      success: true,
      message:
        "Si cette adresse email existe et n'est pas encore vérifiée, un nouvel email de vérification a été envoyé."
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Login user
 * POST /api/auth/login
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const data: LoginRequest = {
      email: req.body.email,
      password: req.body.password
    };

    const result = await loginUser(data);

    // Set cookies
    const isProduction = process.env.NODE_ENV === 'production';

    // Access token cookie (15 minutes)
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax', // Changed from 'strict' to 'lax' for better compatibility
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: '/'
    });

    // Refresh token cookie (7 days)
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax', // Changed from 'strict' to 'lax' for better compatibility
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });

    res.status(200).json({
      success: true,
      message: 'Connexion réussie.',
      user: result.user
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue lors de la connexion.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ success: false, message: 'Refresh token manquant.' });
      return;
    }

    const result = await refreshAccessToken(refreshToken);

    // Set new access token cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax', // Changed from 'strict' to 'lax' for better compatibility
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: '/'
    });

    res.status(200).json({ success: true, message: 'Token rafraîchi avec succès.' });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Une erreur est survenue lors du rafraîchissement du token.';
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.status(401).json({ success: false, message: errorMessage });
  }
}

/**
 * Get current user
 * GET /api/auth/me
 */
export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user || !req.user.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const user = await getCurrentUser(req.user.userId);
    res.status(200).json({ success: true, user });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
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
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    res.status(200).json({ success: true, message: 'Déconnexion réussie.' });
  } catch (error) {
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
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
  try {
    await resetPassword(req.body);
    res.status(200).json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès ! Vous pouvez maintenant vous connecter.'
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Une erreur est survenue lors de la réinitialisation.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}
