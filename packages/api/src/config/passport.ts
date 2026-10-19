import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '../utils/database';
import { GlobalRole } from '@prisma/client';
import { env } from './env';
import { logger } from '../utils/logger';
import { logAuthEvent } from '../services/audit-auth-events';
import { AuditActionKey } from '../types/audit-types';

/**
 * La stratégie Google a-t-elle été enregistrée au démarrage ?
 *
 * Sans cet indicateur, les routes appelaient `passport.authenticate('google')`
 * quelles que soient les circonstances. Faute d'identifiants, passport levait
 * `Unknown authentication strategy "google"` et l'utilisateur recevait un 500
 * `INTERNAL` opaque au lieu d'apprendre que le fournisseur n'est pas configuré.
 */
let googleOAuthEnabled = false;

export function isGoogleOAuthEnabled(): boolean {
  return googleOAuthEnabled;
}

/** Champs du compte lus par la connexion Google — jamais `passwordHash`. */
const GOOGLE_USER_SELECT = {
  id: true,
  email: true,
  globalRole: true,
  isActive: true,
  emailVerified: true,
  googleId: true,
  avatarUrl: true
} as const;

export type GoogleUser = {
  id: string;
  email: string;
  globalRole: GlobalRole;
  isActive: boolean;
  emailVerified: boolean;
  googleId: string | null;
  avatarUrl: string | null;
};

/** Sous-ensemble du profil passport-google-oauth20 réellement lu. */
export interface GoogleProfileLike {
  id: string;
  displayName?: string;
  emails?: Array<{ value?: string; verified?: boolean | string }>;
  photos?: Array<{ value?: string }>;
  _json?: { email_verified?: boolean | string };
}

/**
 * Même forme que la connexion par mot de passe : `loginSchema`
 * (`middleware/validation-middleware.ts`) applique `.toLowerCase().trim()`.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Google a-t-il vérifié l'adresse ? Les deux formes du profil sont lues :
 * `emails[0].verified` (posé par passport-google-oauth20 depuis l'OpenID
 * Connect) et `_json.email_verified` (réponse brute). Booléen ou chaîne
 * `"true"` selon la version. L'adresse n'est tenue pour vérifiée que si au
 * moins une forme est présente et qu'AUCUNE ne dit autre chose que vrai.
 */
export function isGoogleEmailVerified(profile: GoogleProfileLike): boolean {
  const values = [profile.emails?.[0]?.verified, profile._json?.email_verified].filter(v => v !== undefined);
  return values.length > 0 && values.every(v => v === true || v === 'true');
}

function auditGoogleRefusal(user: GoogleUser, reason: 'account_disabled' | 'email_not_verified'): void {
  void logAuthEvent({
    actorUserId: user.id,
    actorLabel: user.email,
    actionKey: AuditActionKey.AUTH_LOGIN_FAILED,
    entityType: 'User',
    entityId: user.id,
    outcome: 'DENIED',
    payload: { method: 'google', reason }
  });
}

/**
 * Retrouve ou crée le compte d'un profil Google ; `null` = connexion refusée.
 *
 * Refus : pas d'adresse, adresse non vérifiée par Google, compte désactivé,
 * ou plusieurs comptes ne différant que par la casse (rattachement ambigu).
 * La recherche est insensible à la casse, comme `acceptInvitation`
 * (`services/invitation-service.ts`) : un compte enregistré avant la
 * normalisation des adresses est retrouvé au lieu d'être doublé.
 *
 * Un `googleId` déjà posé n'est jamais écrasé. Rattacher Google à un compte
 * dont l'adresse n'avait jamais été vérifiée le reprend comme le fait une
 * nouvelle inscription (`takeOverUnverifiedAccount`) : le mot de passe posé par
 * un tiers qui aurait pré-inscrit l'adresse est effacé et ses sessions révoquées.
 */
export async function resolveGoogleUser(profile: GoogleProfileLike): Promise<GoogleUser | null> {
  const rawEmail = profile.emails?.[0]?.value;
  if (!rawEmail || !normalizeEmail(rawEmail)) {
    logger.warn('Connexion Google refusée : profil sans adresse e-mail');
    return null;
  }
  const email = normalizeEmail(rawEmail);
  const verified = isGoogleEmailVerified(profile);

  const candidates: GoogleUser[] = await prisma.user.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: GOOGLE_USER_SELECT,
    take: 2
  });
  const existing = candidates.find(c => c.email === email) ?? (candidates.length === 1 ? candidates[0] : null);

  if (!verified) {
    logger.warn('Connexion Google refusée : adresse non vérifiée par Google', { userId: existing?.id });
    if (existing) auditGoogleRefusal(existing, 'email_not_verified');
    return null;
  }

  if (!existing && candidates.length > 1) {
    logger.warn('Connexion Google refusée : plusieurs comptes pour la même adresse à la casse près', {
      userIds: candidates.map(c => c.id)
    });
    return null;
  }

  if (existing) {
    if (!existing.isActive) {
      logger.warn('Connexion Google refusée : compte désactivé', { userId: existing.id });
      auditGoogleRefusal(existing, 'account_disabled');
      return null;
    }
    if (existing.googleId) {
      if (existing.googleId !== profile.id) {
        // Conservé tel quel (jamais écrasé) ; l'adresse est vérifiée par Google.
        logger.warn('Connexion Google : identifiant Google différent de celui rattaché au compte', {
          userId: existing.id
        });
      }
      return existing;
    }
    // Premier rattachement Google de ce compte.
    return prisma.$transaction(async tx => {
      const linked = await tx.user.update({
        where: { id: existing.id },
        data: {
          googleId: profile.id,
          avatarUrl: existing.avatarUrl || profile.photos?.[0]?.value,
          emailVerified: true,
          ...(existing.emailVerified ? {} : { passwordHash: null })
        },
        select: GOOGLE_USER_SELECT
      });
      if (!existing.emailVerified) {
        await tx.refreshToken.updateMany({
          where: { userId: existing.id, revoked: false },
          data: { revoked: true, revokedAt: new Date() }
        });
      }
      return linked;
    });
  }

  return prisma.user.create({
    data: {
      email,
      googleId: profile.id,
      fullName: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
      globalRole: GlobalRole.USER,
      emailVerified: true,
      isActive: true
    },
    select: GOOGLE_USER_SELECT
  });
}

export function configurePassport() {
  const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

  // Déduite de BACKEND_URL quand elle n'est pas fournie. L'ancien repli était
  // `http://localhost:3000/api/auth/google/callback` : en production, renseigner
  // seulement l'identifiant et le secret suffisait à obtenir un `redirect_uri`
  // pointant sur la machine du visiteur, et Google refusait l'échange avec un
  // `redirect_uri_mismatch` impossible à relier à sa cause.
  const GOOGLE_CALLBACK_URL =
    (process.env.GOOGLE_CALLBACK_URL || '').trim() || `${env.BACKEND_URL.replace(/\/$/, '')}/api/auth/google/callback`;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    logger.warn(
      'Connexion Google désactivée : GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET sont absents ou vides. ' +
        'Le bouton reste affiché ; /api/auth/google renvoie vers l’écran de connexion.'
    );
    return;
  }

  // Journalisée telle quelle : c'est l'URL EXACTE à déclarer dans les URI de
  // redirection autorisés de la console Google, au caractère près.
  logger.info(`Connexion Google activée. URI de redirection attendue : ${GOOGLE_CALLBACK_URL}`);

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
        passReqToCallback: true
      },
      async (_req, _accessToken, _refreshToken, profile, done) => {
        try {
          // `false` : refus sans détail, même redirection `auth_failed` que
          // tout autre échec du callback (l'existence du compte n'est pas dite).
          const user = await resolveGoogleUser(profile);
          return done(null, user ?? false);
        } catch (error) {
          return done(error as Error, undefined);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      // Jamais l'objet User complet : il porte `passwordHash`.
      const user = await prisma.user.findUnique({ where: { id }, select: GOOGLE_USER_SELECT });
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  googleOAuthEnabled = true;
}
