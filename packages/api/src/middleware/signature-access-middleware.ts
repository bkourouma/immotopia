import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { SignatureDocumentKind } from '@prisma/client';
import { ForbiddenError } from './error-middleware';
import { requireFeature } from './subscription-feature-middleware';
import { findSignatureSource, registeredSignatureKinds } from '../lib/signature/sources';
import { hasPermission } from '../services/permission-service';
import { prisma } from '../utils/database';

/**
 * Droits d'accès à la signature selon le TYPE de document (spec 044). Les routes
 * `/api/signatures` restent authentifiées et cloisonnées par agence
 * (`authenticate` + `requireTenantAccess`) ; ce middleware ajoute, APRÈS elles, la
 * permission RBAC et la fonctionnalité d'abonnement que la source du type
 * déclare (`viewPermission` / `editPermission` / `feature`) :
 *
 * - `body`    : type lu dans le corps (création) ;
 * - `request` : type de la demande `:id`, lu EN BASE dans l'agence (accès refusé si
 *               l'utilisateur n'a pas la permission du type de CETTE demande) ;
 * - `param`   : type lu dans `:kind` (contexte d'une cible).
 *
 * Un type absent, inconnu ou sans source, ou une demande introuvable, ne donne
 * aucun accès : la requête continue et le contrôleur ou le service répond 400 ou
 * 404 sans rien lire. Aucune garde n'est affaiblie : cette vérification s'ajoute.
 */

export type KindAccessMode = 'view' | 'edit';
export type KindOrigin = 'body' | 'request' | 'param';

const kindSchema = z.nativeEnum(SignatureDocumentKind);

async function resolveKind(req: Request, origin: KindOrigin): Promise<string | null> {
  if (origin === 'body') {
    const parsed = kindSchema.safeParse(req.body?.kind);
    return parsed.success ? parsed.data : null;
  }
  if (origin === 'param') {
    const parsed = kindSchema.safeParse(req.params.kind);
    return parsed.success ? parsed.data : null;
  }
  const id = z.string().uuid().safeParse(req.params.id);
  const tenantId = req.tenantContext?.tenantId;
  if (!id.success || !tenantId) return null;
  const request = await prisma.signatureRequest.findFirst({
    where: { id: id.data, tenantId },
    select: { kind: true }
  });
  return request?.kind ?? null;
}

export function requireSignatureKindAccess(mode: KindAccessMode, origin: KindOrigin) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kind = await resolveKind(req, origin);
      const source = kind ? findSignatureSource(kind) : undefined;
      if (!source) {
        next();
        return;
      }
      const permission = mode === 'edit' ? source.editPermission : source.viewPermission;
      const userId = req.user?.userId;
      const tenantId = req.tenantContext?.tenantId;
      if (!userId || !(await hasPermission(userId, permission, tenantId))) {
        next(new ForbiddenError());
        return;
      }
      // Fonctionnalité d'abonnement du type (lecture ou écriture déduite de la méthode HTTP).
      requireFeature(source.feature)(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Types de document que l'utilisateur peut LIRE dans l'agence (filtre de la
 * liste) ; en mode `'edit'`, ceux qu'il peut ÉDITER (relancer, annuler : champ
 * `canEdit` des réponses).
 */
export async function permittedSignatureKinds(
  userId: string,
  tenantId: string,
  mode: KindAccessMode = 'view'
): Promise<SignatureDocumentKind[]> {
  const permitted: SignatureDocumentKind[] = [];
  for (const kind of registeredSignatureKinds()) {
    const source = findSignatureSource(kind);
    if (!source) continue;
    const permission = mode === 'edit' ? source.editPermission : source.viewPermission;
    if (await hasPermission(userId, permission, tenantId)) permitted.push(kind);
  }
  return permitted;
}
