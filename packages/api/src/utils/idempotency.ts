/**
 * Idempotence en memoire, courte duree, pour des operations HTTP couteuses
 * qu'un double clic ou un retry client ne doit pas rejouer (ex. creation
 * d'agence : POST /api/admin/tenants).
 *
 * Design volontairement simple :
 *   - une Map en memoire du processus, cle = `${scope}:${actorId}:${key}`,
 *     avec expiration (24h par defaut) ;
 *   - PAS de nouveau modele Prisma (hors perimetre du lot F, pas de migration) ;
 *   - resiste a un double clic sur UNE instance du serveur. Un cluster multi-
 *     instance sans store partage pourrait laisser passer un doublon entre deux
 *     instances differentes : c'est une limite connue, acceptee pour ce lot
 *     (voir rapport de l'agent). L'appelant (tenant-provisioning-service) ajoute
 *     une seconde barriere, en base celle-la : il refuse aussi une agence de
 *     meme nom + meme e-mail admin creee par le meme super-admin il y a moins
 *     de 24h (recherche dans AuditLog), qui resiste, elle, au redemarrage du
 *     process et au multi-instance.
 */

import { createHash } from 'crypto';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Un magasin par "scope" (ex. 'tenant-provisioning'), pour ne jamais mélanger deux familles d'opérations. */
class IdempotencyStore<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number = DEFAULT_TTL_MS) {}

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private buildKey(actorId: string, idempotencyKey: string): string {
    return `${actorId}:${idempotencyKey}`;
  }

  /** La valeur deja enregistree pour cette cle+acteur, si elle n'a pas expire. */
  get(actorId: string, idempotencyKey: string): T | undefined {
    this.sweep();
    const entry = this.entries.get(this.buildKey(actorId, idempotencyKey));
    if (!entry || entry.expiresAt <= Date.now()) {
      return undefined;
    }
    return entry.value;
  }

  /** Enregistre le resultat pour que le rejeu de la meme cle+acteur le renvoie tel quel. */
  set(actorId: string, idempotencyKey: string, value: T): void {
    this.sweep();
    this.entries.set(this.buildKey(actorId, idempotencyKey), { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Oublie la cle (ex. creation echouee : un reessai doit pouvoir recommencer). */
  delete(actorId: string, idempotencyKey: string): void {
    this.entries.delete(this.buildKey(actorId, idempotencyKey));
  }

  /** Oublie toutes les entrees dont la valeur satisfait le predicat (ex. ressource supprimee entre-temps). */
  deleteWhere(predicate: (value: T) => boolean): void {
    for (const [key, entry] of this.entries) {
      if (predicate(entry.value)) {
        this.entries.delete(key);
      }
    }
  }

  /** Pour les tests uniquement. */
  clear(): void {
    this.entries.clear();
  }
}

/** Magasin dedie a la creation d'agence (F1). Un module = une instance = un seul magasin partage par tous les appels. */
export const tenantProvisioningIdempotencyStore = new IdempotencyStore<unknown>();

/**
 * Magasin de la creation d'assemblee (POST .../assemblees). Stocke la PROMESSE de
 * creation : un reessai qui arrive pendant que la premiere requete tourne encore
 * attend le meme resultat au lieu de creer un doublon.
 */
export const meetingCreationIdempotencyStore = new IdempotencyStore<Promise<unknown>>();

/** Magasin de l'ajout de resolution a une assemblee (POST .../resolutions) : meme principe que ci-dessus. */
export interface ResolutionIdempotencyEntry {
  /** Empreinte du corps de la premiere requete : une meme cle avec un autre corps est refusee (422). */
  fingerprint: string;
  /** Identifiant d'AG (tenant:copropriete:AG), pour purger les entrees d'une resolution supprimee. */
  meetingKey: string;
  promise: Promise<unknown>;
  /** Renseigne quand la creation a abouti. */
  resolutionId?: string;
}

export const meetingResolutionIdempotencyStore = new IdempotencyStore<ResolutionIdempotencyEntry>();

/** Empreinte stable (ordre des cles fige, undefined = null) d'un corps de requete. */
export function fingerprintBody(fields: Record<string, unknown>): string {
  const normalized = Object.keys(fields)
    .sort()
    .map(key => [key, fields[key] === undefined ? null : fields[key]]);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/** Longueur max de l'en-tete `Idempotency-Key` accepte (voir F2). */
export const IDEMPOTENCY_KEY_MAX_LENGTH = 100;
