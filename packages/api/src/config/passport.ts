import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '../utils/database';
import { GlobalRole } from '@prisma/client';

export function configurePassport() {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn('Google OAuth credentials not found. Google login will be disabled.');
    return;
  }

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
}
