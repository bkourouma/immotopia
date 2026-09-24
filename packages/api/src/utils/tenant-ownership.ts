import type { PrismaTransactionClient } from './database';
import { NotFoundError } from '../middleware/error-middleware';

/**
 * Garde-fou générique contre les références inter-agences (IDOR) — audit
 * multi-tenant du 24 septembre 2026, lot B7.
 *
 * `packages/api/src/utils/property-tenant-guard.ts` fait la même chose pour
 * un seul modèle (`Property`) : cette version généralise le geste à tout
 * modèle du schéma qui porte un champ d'agence, pour remplacer les
 * `findFirst({ where: { id, tenantId } })` recopiés à la main dans les
 * services de finance et de trésorerie.
 *
 * `client` accepte indifféremment le client Prisma complet ou un client de
 * transaction (`tx`) : les deux exposent les mêmes délégués de modèle
 * (`client.supplier`, `client.constructionSite`…), seul le premier porte en
 * plus les méthodes de cycle de vie que `PrismaTransactionClient` retire.
 */

/** Un délégué de modèle Prisma minimal : tout ce dont cette garde a besoin. */
interface TenantOwnedDelegate {
  findFirst(args: {
    where: Record<string, unknown>;
    select?: Record<string, unknown>;
  }): Promise<{ id: string } | null>;
}

/** Les noms de délégué du client de transaction qui exposent `findFirst` — donc utilisables ici. */
export type TenantOwnedModel = {
  [K in keyof PrismaTransactionClient]: PrismaTransactionClient[K] extends TenantOwnedDelegate ? K : never;
}[keyof PrismaTransactionClient];

export interface AssertBelongsToTenantOptions {
  /**
   * Nom du champ qui porte l'agence sur ce modèle. La quasi-totalité du
   * schéma porte `tenantId` (camelCase côté client Prisma, quelle que soit la
   * colonne SQL sous-jacente) ; quelques modèles plus anciens portent le champ
   * non mappé `tenant_id`. Par défaut `'tenantId'`.
   */
  tenantField?: 'tenantId' | 'tenant_id';
  /**
   * Message de l'erreur levée, au singulier français — ex. `'Chantier
   * introuvable.'`. Par défaut un message générique.
   */
  message?: string;
}

/**
 * Vérifie qu'un enregistrement identifié par `id` appartient à l'agence
 * `tenantId`, et lève `NotFoundError` sinon — la même erreur qu'un
 * enregistrement qui n'existe pas du tout, pour ne jamais confirmer
 * l'existence d'une ressource d'une autre agence (même principe que
 * `getPropertyForTenant`).
 *
 * `id` `null`/`undefined` : rien à vérifier, la fonction ne lève pas. C'est à
 * l'appelant de décider si le champ est par ailleurs obligatoire — cette
 * garde ne s'occupe que de l'appartenance à l'agence.
 *
 * @param client   Client Prisma ou client de transaction.
 * @param model    Nom du délégué Prisma à interroger, ex. `'constructionSite'`.
 * @param id       Identifiant reçu (typiquement du corps de la requête).
 * @param tenantId Agence de l'appelant.
 */
export async function assertBelongsToTenant<M extends TenantOwnedModel>(
  client: PrismaTransactionClient,
  model: M,
  id: string | null | undefined,
  tenantId: string,
  options?: AssertBelongsToTenantOptions
): Promise<void> {
  if (id === null || id === undefined) {
    return;
  }

  const tenantField = options?.tenantField ?? 'tenantId';
  const delegate = client[model] as unknown as TenantOwnedDelegate;

  const found = await delegate.findFirst({
    where: { id, [tenantField]: tenantId },
    select: { id: true }
  });

  if (!found) {
    throw new NotFoundError(options?.message ?? 'Ressource introuvable.');
  }
}
