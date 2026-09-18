import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '../utils/database';
import { GlobalRole } from '@prisma/client';
import { env } from './env';
import { logger } from '../utils/logger';

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
          const email = profile.emails?.[0]?.value;

          if (!email) {
            return done(new Error('No email provided from Google'), undefined);
          }

          // Check if user exists
          let user = await prisma.user.findUnique({
            where: { email }
          });

          if (user) {
            // Update googleId if not present (merge account)
            if (!user.googleId) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: {
                  googleId: profile.id,
                  avatarUrl: user.avatarUrl || profile.photos?.[0]?.value,
                  emailVerified: true // Trust Google verification
                }
              });
            }
          } else {
            // Create new user
            user = await prisma.user.create({
              data: {
                email,
                googleId: profile.id,
                fullName: profile.displayName,
                avatarUrl: profile.photos?.[0]?.value,
                globalRole: GlobalRole.USER,
                emailVerified: true,
                isActive: true
              }
            });
          }

          return done(null, user);
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
      const user = await prisma.user.findUnique({ where: { id } });
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  googleOAuthEnabled = true;
}
