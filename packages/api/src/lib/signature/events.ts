import { Prisma } from '@prisma/client';
import { prisma, type PrismaTransactionClient } from '../../utils/database';
import { sha256Hex } from './evidence';
import type { SignatureEventType } from './types';

/**
 * Piste de preuve append-only et chaînée (spec 044, SG-R8). Chaque événement
 * porte le hachage du précédent (`prevHash`) : modifier ou retirer un événement
 * rompt la chaîne, ce que `verifyEventChain` détecte. `seq` est unique par
 * demande ; l'ajout verrouille la ligne de la demande (`FOR UPDATE`), si bien
 * que deux ajouts simultanés se sérialisent au lieu de bifurquer. Un
 * déclencheur SQL refuse en outre toute modification (migration noyau).
 *
 * Les payloads ne portent ni contact, ni IP en clair, ni jeton, ni code.
 */

export type ChainedEvent = {
  seq: number;
  type: string;
  signerId: string | null;
  payload: unknown;
  createdAt: Date;
  prevHash: string | null;
  eventHash: string;
};

/** JSON canonique : clés triées, pour un hachage reproductible après un aller-retour en base. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function computeEventHash(event: Omit<ChainedEvent, 'eventHash'>): string {
  return sha256Hex(
    canonicalJson({
      prevHash: event.prevHash,
      seq: event.seq,
      type: event.type,
      signerId: event.signerId,
      payload: event.payload ?? null,
      createdAt: event.createdAt.toISOString()
    })
  );
}

/** Vérifie une liste d'événements triée par `seq` : chaînage et empreintes. */
export function verifyEventChain(events: ChainedEvent[]): { ok: true } | { ok: false; brokenAtSeq: number } {
  let previous: string | null = null;
  for (const event of events) {
    if (event.prevHash !== previous) return { ok: false, brokenAtSeq: event.seq };
    if (computeEventHash(event) !== event.eventHash) return { ok: false, brokenAtSeq: event.seq };
    previous = event.eventHash;
  }
  return { ok: true };
}

export interface AppendEventInput {
  tenantId: string;
  requestId: string;
  signerId?: string | null;
  type: SignatureEventType;
  payload?: Record<string, unknown> | null;
  now?: Date;
}

/** Ajoute un événement DANS la transaction `tx` (la demande est verrouillée pour la sérialisation). */
export async function appendSignatureEvent(tx: PrismaTransactionClient, input: AppendEventInput) {
  await tx.$queryRaw`SELECT id FROM signature_requests WHERE id = ${input.requestId}::uuid FOR UPDATE`;
  const last = await tx.signatureEvent.findFirst({
    where: { tenantId: input.tenantId, requestId: input.requestId },
    orderBy: { seq: 'desc' },
    select: { seq: true, eventHash: true }
  });
  const base = {
    seq: (last?.seq ?? 0) + 1,
    type: input.type,
    signerId: input.signerId ?? null,
    payload: input.payload ?? null,
    createdAt: input.now ?? new Date(),
    prevHash: last?.eventHash ?? null
  };
  const eventHash = computeEventHash(base);
  return tx.signatureEvent.create({
    data: {
      tenantId: input.tenantId,
      requestId: input.requestId,
      signerId: base.signerId,
      seq: base.seq,
      type: base.type,
      payload: base.payload === null ? Prisma.DbNull : (base.payload as Prisma.InputJsonValue),
      prevHash: base.prevHash,
      eventHash,
      createdAt: base.createdAt
    }
  });
}

/** Ajoute un événement dans sa propre transaction. */
export async function appendSignatureEventStandalone(input: AppendEventInput) {
  return prisma.$transaction(tx => appendSignatureEvent(tx, input));
}

/** Événements d'une demande, dans l'ordre de la chaîne. */
export async function listChainedEvents(tenantId: string, requestId: string): Promise<ChainedEvent[]> {
  return prisma.signatureEvent.findMany({
    where: { tenantId, requestId },
    orderBy: { seq: 'asc' },
    select: { seq: true, type: true, signerId: true, payload: true, createdAt: true, prevHash: true, eventHash: true }
  });
}
