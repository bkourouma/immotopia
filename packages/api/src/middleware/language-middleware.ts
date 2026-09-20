import { Request, Response, NextFunction } from 'express';
import { DEFAULT_LANGUAGE, Language, negotiateLanguage, runWithLanguage } from '../i18n';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Langue resolue pour cette requete. Toujours renseignee. */
      language?: Language;
    }
  }
}

/**
 * Resout la langue de la requete, puis execute la suite de la chaine dans son
 * contexte (`runWithLanguage`), pour que `t()` la retrouve sans qu'aucun
 * service n'ait a la transporter.
 *
 * La langue vient de l'en-tete **`Accept-Language`**, et de lui seul.
 *
 * On pourrait croire qu'il faut lire `preferredLanguage` en base pour honorer
 * le choix de l'utilisateur. Ce n'est pas necessaire : le navigateur *connait*
 * deja ce choix — c'est lui qui l'affiche — et `utils/api-client` pose
 * l'en-tete sur chaque appel. Aller le relire ajouterait une requete SQL a
 * chaque appel d'API pour retrouver une information que l'appelant vient de
 * nous donner. La colonne sert a ce que le navigateur ne peut pas faire :
 * ecrire un e-mail dans la bonne langue quand personne n'est connecte
 * (`jobs/`, relances, notifications).
 *
 * A poser AVANT les routes : l'authentification est montee routeur par routeur
 * (`router.use(authenticate)`), et un middleware global place apres n'existe
 * pas.
 */
export function resolveLanguage(req: Request, res: Response, next: NextFunction): void {
  const language = negotiateLanguage(req.headers['accept-language']) ?? DEFAULT_LANGUAGE;

  req.language = language;
  res.setHeader('Content-Language', language);

  runWithLanguage(language, () => next());
}
