/**
 * Frontière réseau du module financier — lot 4, cinquième sous-lot : la
 * retenue de garantie.
 *
 * Contrat gelé : les écrans appellent ces fonctions et rien d'autre. Aucun
 * écran ne construit d'URL ni n'appelle `apiClient` directement.
 *
 * Fichier séparé de `finance-service.ts`, `finance-lot2-service.ts`,
 * `finance-lot3-service.ts`, `finance-lot4-service.ts`,
 * `finance-partnerships-service.ts`, `finance-salaries-service.ts` et
 * `finance-contractors-service.ts`, tous gelés. `base()` et `toQuery()` sont
 * recopiées plutôt qu'importées d'un sous-lot précédent, pour la même raison
 * qu'aux sous-lots précédents : la frontière de ce sous-lot doit pouvoir
 * évoluer sans dépendre du détail d'implémentation d'un autre.
 *
 * ---------------------------------------------------------------------------
 * Aucun corps ne répète un identifiant que le chemin porte déjà
 * ---------------------------------------------------------------------------
 *
 * Les schémas Zod du serveur (`packages/api/src/lib/finance/schemas-retentions.ts`)
 * sont `.strict()` : un champ en trop est un 400. Deux conséquences directes,
 * épinglées par `__tests__/finance/corps-des-requetes.test.ts` :
 *
 * - `releaseRetention` poste un corps **VIDE**. `releaseRetentionSchema` est
 *   `z.object({}).strict()` : `retentionId` est dans le CHEMIN, et un corps
 *   qui le répéterait serait refusé bruyamment. C'est le défaut qui cassait
 *   cinq créations des lots 2, 3 et 4.
 * - `createRetention` n'envoie **aucun montant**. Le montant retenu se dérive
 *   du taux côté serveur (principe P-4) ; `createRetentionSchema` ne déclare
 *   pas `amount`, et un appelant qui en enverrait un recevrait un 400 plutôt
 *   que de croire son montant pris en compte.
 *
 * Comme aux lots précédents, c'est aussi le point d'insertion de l'atelier :
 * la fausse API se branche sous `apiClient`, au niveau de l'adaptateur axios.
 *
 * Routes : `packages/api/src/routes/finance-retentions-routes.ts`. Contrat :
 * `packages/api/src/lib/finance/types-lot4-retentions.ts`, et son dérivé web
 * `types/finance-retentions-types.ts`.
 */

import apiClient from '../utils/api-client';
import type {
  CreateRetentionInput,
  ListRetentionsFilters,
  RetentionGuarantee,
  RetentionSummary,
  RetentionSummaryFilters
} from '../types/finance-retentions-types';

type ApiResponse<T> = { success: boolean; data: T };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/finance`;
}

function toQuery(filters?: Record<string, string | number | boolean | undefined>): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

/**
 * Route C. Liste filtrée. Les quatre filtres partent en paramètres de
 * REQUÊTE, jamais dans le chemin.
 */
export async function listRetentions(tenantId: string, filters?: ListRetentionsFilters): Promise<RetentionGuarantee[]> {
  const response = await apiClient.get<ApiResponse<RetentionGuarantee[]>>(
    `${base(tenantId)}/retentions${toQuery(filters as Record<string, string | undefined>)}`
  );
  return response.data.data;
}

/**
 * Route D. Ce qui est détenu, ce qui a été libéré, et ce qui est en retard.
 *
 * **Les trois montants arrivent tout faits.** L'écran n'en additionne aucun :
 * le résumé porte sur toutes les retenues de l'agence (filtrées au plus par
 * chantier), pas sur la page affichée, et les recalculer à partir de la liste
 * donnerait un chiffre différent dès qu'un filtre est posé.
 *
 * Côté serveur, cette route est déclarée AVANT `retentions/:retentionId` :
 * sans cela, Express ferait capturer la chaîne `summary` par le paramètre. La
 * remarque est notée ici parce qu'elle explique pourquoi l'adresse ci-dessous
 * ne peut pas être « améliorée » en `retentions?summary=1`.
 */
export async function getRetentionSummary(
  tenantId: string,
  filters?: RetentionSummaryFilters
): Promise<RetentionSummary> {
  const response = await apiClient.get<ApiResponse<RetentionSummary>>(
    `${base(tenantId)}/retentions/summary${toQuery(filters as Record<string, string | undefined>)}`
  );
  return response.data.data;
}

/** Route E. Détail d'une retenue. */
export async function getRetention(tenantId: string, retentionId: string): Promise<RetentionGuarantee> {
  const response = await apiClient.get<ApiResponse<RetentionGuarantee>>(`${base(tenantId)}/retentions/${retentionId}`);
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Les deux gestes
// ---------------------------------------------------------------------------

/**
 * Route A. Pose une retenue sur une pièce **déjà validée**.
 *
 * Le corps ne porte que les quatre champs du schéma serveur : `sourceType`,
 * `sourceId`, `ratePercent`, `plannedReleaseDate`. **Aucun montant** — il se
 * dérive du taux (principe P-4), et le schéma `.strict()` refuserait un champ
 * de plus.
 *
 * Le serveur refuse, chaque fois avec un message qu'on peut lire tel quel :
 * pièce non validée, retenue déjà posée, taux hors de ]0, 100[, montant nul
 * après arrondi, et — pour une facture seulement — règlement déjà affecté.
 * L'écran relaie ce message, il ne le devine pas.
 */
export async function createRetention(tenantId: string, params: CreateRetentionInput): Promise<RetentionGuarantee> {
  const response = await apiClient.post<ApiResponse<RetentionGuarantee>>(`${base(tenantId)}/retentions`, {
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    ratePercent: params.ratePercent,
    plannedReleaseDate: params.plannedReleaseDate
  });
  return response.data.data;
}

/**
 * Route B. Libère une retenue : l'argent redevient exigible.
 *
 * **Ce n'est pas un versement.** Le tiers redevient créancier du montant
 * détenu et se sert ensuite par le chemin ordinaire du fournisseur ou du
 * tâcheron. Aucune pièce de sortie de caisse ne naît ici, et l'écran ne doit
 * pas laisser croire le contraire.
 *
 * Le corps est **vide** : `retentionId` est dans le chemin, il n'y a ni
 * montant (pas de libération partielle) ni date (`releasedAt` est l'instant de
 * l'acte). `releaseRetentionSchema` étant `z.object({}).strict()`, tout champ
 * ajouté ici deviendrait un 400.
 */
export async function releaseRetention(tenantId: string, retentionId: string): Promise<RetentionGuarantee> {
  const response = await apiClient.post<ApiResponse<RetentionGuarantee>>(
    `${base(tenantId)}/retentions/${retentionId}/release`,
    {}
  );
  return response.data.data;
}
