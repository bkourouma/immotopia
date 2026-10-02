import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt-utils';
import { t } from '../i18n';
import { setAuditActor } from '../utils/request-context';

/** Renseigne l'acteur du journal d'audit à partir du jeton vérifié. */
function recordActor(user: { userId: string; email: string; globalRole: string }): void {
  setAuditActor({
    userId: user.userId,
    label: user.email,
    type: user.globalRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'USER'
  });
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  // Deja authentifie pour CETTE requete : on ne recommence pas.
  //
  // Ce n'est pas une micro-optimisation. Douze routeurs du module financier
  // sont montes sur `/api`, et chacun pose sa propre garde sur le prefixe
  // `/tenants/:tenantId/finance`. Express execute le `use` de CHAQUE routeur
  // dont le prefixe correspond, jusqu'a trouver la route : une seule requete
  // financiere verifiait donc le jeton jusqu'a douze fois.
  //
  // Le resultat est identique — le jeton d'une requete ne change pas en cours
  // de route — et le travail cryptographique est fait une fois.
  if (req.user) {
    next();
    return;
  }

  // Try to get token from cookies first (for browser requests)
  let token = req.cookies?.accessToken;

  // Fallback to Authorization header (for API clients)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      token = authHeader.split(' ')[1]; // Bearer <token>
    }
  }

  if (!token) {
    res.status(401).json({ message: t("Jeton d'authentification manquant.") });
    return;
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    // 401, et non 403 : un jeton expiré ou illisible est un défaut
    // d'authentification, pas un défaut de droits. L'intercepteur du client
    // ne rafraîchit la session que sur un 401 ; en 403, une écriture faite
    // avec un jeton périmé échouait sans message ni redirection.
    res.status(401).json({ message: t('Jeton invalide ou expiré.') });
    return;
  }

  // Attach user identity to request
  req.user = decoded;
  recordActor(decoded);
  next();
};

// Optional: Middleware to check if user is authenticated but not fail if not
export const optionalAuthenticate = (req: Request, _res: Response, next: NextFunction) => {
  // Try to get token from cookies first (for browser requests)
  let token = req.cookies?.accessToken;

  // Fallback to Authorization header (for API clients)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      token = authHeader.split(' ')[1];
    }
  }

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
      recordActor(decoded);
    }
  }
  next();
};
