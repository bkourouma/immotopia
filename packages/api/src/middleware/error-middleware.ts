import { Request, Response, NextFunction, RequestHandler } from 'express';
import multer from 'multer';
import { logger } from '../utils/logger';
import { isProduction } from '../config/env';
import { t } from '../i18n';
// Effet de bord : bascule le message par défaut de Zod en français (voir
// `lib/zod-error-map.ts`). Importé ici — le point d'entrée le plus
// systématiquement chargé avant qu'une erreur de validation ne soit formatée
// — pour qu'aucun appelant n'ait à s'en souvenir.
import '../lib/zod-error-map';

/**
 * Single error response shape for the whole API.
 *
 * Controllers historically returned three different shapes ({ error },
 * { message }, { error, message }), so the frontend could not rely on one key.
 * Everything that goes through `errorHandler` now emits this.
 */
export interface ErrorResponse {
  success: false;
  message: string;
  /**
   * Alias retro-compatible de `message`.
   *
   * Avant l'unification (lot 2, controleurs syndic/biens/baux), chaque
   * controleur renvoyait lui-meme `{ success: false, error: message }` a la
   * main. De nombreux lecteurs — tests de caracterisation, et le front via
   * `err.response?.data?.error` — lisent encore cette cle. Plutot que de les
   * faire tous evoluer vers `message` d'un coup, `errorHandler` porte les
   * deux : un ancien lecteur continue de fonctionner, un nouveau peut migrer
   * vers `message` a son rythme.
   */
  error?: string;
  code?: string;
  errors?: Array<{ field: string; message: string }>;
  /**
   * Charge additionnelle, propre à un site d'erreur précis — par exemple
   * `{ codePaiement, checkoutUrl }` sur le 409 « paiement en ligne déjà en
   * cours » (lot 7). Volontairement rare : la plupart des erreurs n'en ont
   * pas besoin, `errors` suffit pour la validation de formulaire.
   */
  data?: unknown;
}

/** Machine-readable codes clients can branch on. */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL: 'INTERNAL',
  // Abonnements par packs (docs/architecture/PLAN-ABONNEMENTS.md).
  MODULE_NOT_INCLUDED: 'MODULE_NOT_INCLUDED',
  MODULE_READ_ONLY: 'MODULE_READ_ONLY',
  SUBSCRIPTION_READ_ONLY: 'SUBSCRIPTION_READ_ONLY',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED'
} as const;

/**
 * Base application error.
 *
 * Services should throw these instead of bare `new Error(...)`, so controllers
 * stop guessing the HTTP status by matching words in the message
 * (`error.message.includes('not found')`).
 */
export class AppError extends Error {
  statusCode: number;
  code?: string;
  errors?: Array<{ field: string; message: string }>;
  data?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    errors?: Array<{ field: string; message: string }>,
    data?: unknown
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.data = data;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Requête invalide.', errors?: Array<{ field: string; message: string }>) {
    super(message, 400, ErrorCode.BAD_REQUEST, errors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentification requise.') {
    super(message, 401, ErrorCode.UNAUTHORIZED);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Vous n'avez pas accès à cette ressource.") {
    super(message, 403, ErrorCode.FORBIDDEN);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Ressource introuvable.') {
    super(message, 404, ErrorCode.NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Cette ressource existe déjà.') {
    super(message, 409, ErrorCode.CONFLICT);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Les données fournies sont invalides.', errors?: Array<{ field: string; message: string }>) {
    super(message, 422, ErrorCode.VALIDATION_ERROR, errors);
  }
}

/**
 * Le module demande n'est pas compris dans l'abonnement de l'agence (403).
 * `data.moduleKey` porte le module, pour que le front propose le bon pack.
 */
export class ModuleNotIncludedError extends AppError {
  constructor(moduleKey: string, message = "Ce module n'est pas compris dans l'abonnement de votre agence.") {
    super(message, 403, ErrorCode.MODULE_NOT_INCLUDED, undefined, { moduleKey });
  }
}

/** Module retire de l'abonnement : ses donnees restent consultables et exportables, pas modifiables (D11, 403). */
export class ModuleReadOnlyError extends AppError {
  constructor(
    moduleKey: string,
    message = "Ce module a été retiré de l'abonnement : ses données restent consultables, mais ne peuvent plus être modifiées."
  ) {
    super(message, 403, ErrorCode.MODULE_READ_ONLY, undefined, { moduleKey });
  }
}

/** Abonnement echu (fin d'essai ou impaye au-dela de la grace, D8) : lecture seule (403). */
export class SubscriptionReadOnlyError extends AppError {
  constructor(
    reason: string | null,
    message = "L'abonnement de votre agence est en lecture seule : régularisez-le pour enregistrer des modifications."
  ) {
    super(message, 403, ErrorCode.SUBSCRIPTION_READ_ONLY, undefined, { reason });
  }
}

/** Capacite depassee sous la politique BLOCK (D4, 409). */
export class QuotaExceededError extends AppError {
  constructor(
    detail: { capacityKey: string; limit: number; used: number; requested: number },
    message = 'La capacité de votre abonnement est atteinte : ajoutez une extension pour continuer.'
  ) {
    super(message, 409, ErrorCode.QUOTA_EXCEEDED, undefined, detail);
  }
}

/**
 * Wrap an async route handler so rejections reach `errorHandler`.
 *
 * Express 4 does not await handlers: without this (or a try/catch in every
 * handler) a rejected promise leaves the request hanging forever.
 *
 *   router.get('/x', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    return Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Map a thrown value to the response we should send. */
function toErrorResponse(err: unknown): { status: number; body: ErrorResponse } {
  if (err instanceof AppError) {
    return {
      status: err.statusCode,
      body: {
        success: false,
        message: err.message,
        ...(err.code ? { code: err.code } : {}),
        ...(err.errors ? { errors: err.errors } : {}),
        ...(err.data !== undefined ? { data: err.data } : {})
      }
    };
  }

  // Multer (LIMIT_FILE_SIZE, champ inattendu…) : ce sont des erreurs de
  // validation de la requête, jamais des pannes serveur. `LIMIT_FILE_SIZE`
  // recoit son propre code 413 ; les autres (LIMIT_UNEXPECTED_FILE,
  // LIMIT_FILE_COUNT…) restent en 400. La limite configurée n'est pas portée
  // par l'erreur multer elle-même : le message reste générique plutôt que
  // d'inventer un chiffre.
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return {
        status: 413,
        body: {
          success: false,
          message: 'Le fichier envoyé dépasse la taille maximale autorisée.',
          code: ErrorCode.BAD_REQUEST
        }
      };
    }
    return {
      status: 400,
      body: {
        success: false,
        message: "Le fichier envoyé n'a pas pu être traité. Vérifiez son format et réessayez.",
        code: ErrorCode.BAD_REQUEST
      }
    };
  }

  const anyErr = err as any;

  // Zod
  if (anyErr?.name === 'ZodError') {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Les données fournies sont invalides.',
        code: ErrorCode.VALIDATION_ERROR,
        errors: anyErr.errors?.map((e: any) => ({
          field: Array.isArray(e.path) ? e.path.join('.') : String(e.path ?? ''),
          message: e.message
        }))
      }
    };
  }

  // Errors carrying a status, from the syndic/patrimoine helpers in lib/errors.
  const carriedStatus = Number(anyErr?.statusCode ?? anyErr?.status);
  if (Number.isInteger(carriedStatus) && carriedStatus >= 400 && carriedStatus < 600) {
    return {
      status: carriedStatus,
      body: {
        success: false,
        message: anyErr?.message || 'Une erreur est survenue.',
        ...(anyErr?.code ? { code: String(anyErr.code) } : {})
      }
    };
  }

  // Prisma known request errors
  if (anyErr?.name === 'PrismaClientKnownRequestError') {
    switch (anyErr.code) {
      case 'P2002':
        return {
          status: 409,
          body: { success: false, message: 'Cette ressource existe déjà.', code: ErrorCode.CONFLICT }
        };
      case 'P2025':
        return {
          status: 404,
          body: { success: false, message: 'Ressource introuvable.', code: ErrorCode.NOT_FOUND }
        };
      case 'P2003':
        return {
          status: 409,
          body: {
            success: false,
            message: 'Opération impossible : cette ressource est référencée ailleurs.',
            code: ErrorCode.CONFLICT
          }
        };
      default:
        break;
    }
  }

  // Une erreur Prisma non reconnue ci-dessus ne sort jamais telle quelle, meme
  // en developpement : son message porte le chemin absolu du fichier source du
  // serveur, le numero de ligne, un extrait de code et le nom technique des
  // colonnes. En recette, cette trace s'est affichee dans le navigateur d'un
  // utilisateur d'agence. Le detail reste entier dans les journaux, juste
  // en dessous.
  const nomErreur = String(anyErr?.name ?? '');
  if (nomErreur.startsWith('PrismaClient')) {
    return {
      status: 500,
      body: {
        success: false,
        message: "L'opération n'a pas pu être enregistrée. Réessayez, et signalez-le si cela se reproduit.",
        code: ErrorCode.INTERNAL
      }
    };
  }

  return {
    status: 500,
    body: {
      success: false,
      // Internal messages (Prisma, stack traces) must not reach clients in prod.
      message: isProduction
        ? 'Une erreur est survenue. Veuillez réessayer plus tard.'
        : (err as Error)?.message || 'Une erreur est survenue.',
      code: ErrorCode.INTERNAL
    }
  };
}

/**
 * Global error handling middleware. Must be registered after all routes.
 */
export function errorHandler(err: Error | AppError, req: Request, res: Response, next: NextFunction): void {
  // Delegate to Express if the response has already started streaming.
  if (res.headersSent) {
    next(err);
    return;
  }

  const { status, body } = toErrorResponse(err);

  // Les messages sont traduits ICI, et nulle part ailleurs.
  //
  // Les services levent leurs erreurs en francais, sans rien savoir de la
  // langue de l'appelant : la traduire au fond du code aurait voulu dire
  // transporter une langue a travers 87 sites de levee. La mise en forme finale
  // est le dernier endroit ou le message existe encore comme texte, et le seul
  // ou la langue de la requete est connue a coup sur.
  body.message = t(body.message);
  if (body.errors) {
    body.errors = body.errors.map(entry => ({ ...entry, message: t(entry.message) }));
  }
  // Voir le commentaire sur `ErrorResponse.error` : alias retro-compatible,
  // toujours pose ici, une fois le message traduit.
  body.error = body.message;

  // 4xx are expected client mistakes; only 5xx deserve error level.
  const log = status >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
  log('Request failed', {
    message: (err as Error)?.message,
    statusCode: status,
    code: body.code,
    method: req.method,
    // Avoid the query string: it carries one-time tokens (verify-email,
    // newsletter confirm/unsubscribe).
    path: req.path,
    ip: req.ip,
    ...(status >= 500 ? { stack: (err as Error)?.stack } : {})
  });

  res.status(status).json(body);
}
