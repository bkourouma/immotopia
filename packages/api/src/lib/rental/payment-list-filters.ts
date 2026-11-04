/**
 * Filtres de recherche des listes Paiements et Déclarations de paiement
 * (module locatif).
 *
 * Tout est ici pour garder les contrôleurs et services existants intacts :
 * ils appellent une ou deux lignes de ce module.
 *
 * - Paiements : `search` couvre la référence et la transaction du prestataire,
 *   le n° de bail, le bien (titre, adresse, référence) et le locataire (nom,
 *   e-mail) ; `minAmount` / `maxAmount` bornent le montant ; `startDate` /
 *   `endDate` (jours réels) bornent la date, fin incluse.
 * - Déclarations : `search` couvre la référence, le n° de bail, le bien et le
 *   déclarant ; `method` filtre le moyen de paiement ; `startDate` / `endDate`
 *   bornent la date de paiement, fin incluse.
 *
 * Les conditions sont combinées dans `where.AND` : un `where.OR` existant
 * n'est jamais écrasé. `tenant_id` est posé par l'appelant, avant.
 */
import type { Request } from 'express';
import { z } from 'zod';
import { RentalPaymentMethod } from '@prisma/client';
import { BadRequestError } from '../../middleware/error-middleware';
import {
  dayEnd,
  dayOrderRefinement,
  dayStart,
  emptyToUndefined,
  zAmount,
  zDay,
  zSearch
} from '../../utils/list-query-schemas';
import { t } from '../../i18n';

export interface PaymentListExtras {
  search?: string;
  minAmount?: number;
  maxAmount?: number;
  /** Début du jour demandé (UTC). */
  startDate?: Date;
  /** Fin du jour demandé (UTC, 23:59:59.999) : borne inclusive. */
  endDate?: Date;
}

export interface DeclarationListExtras {
  search?: string;
  method?: RentalPaymentMethod;
  startDate?: Date;
  endDate?: Date;
}

const amountOrder = (data: Record<string, unknown>, ctx: z.RefinementCtx): void => {
  const { minAmount, maxAmount } = data;
  if (typeof minAmount === 'number' && typeof maxAmount === 'number' && minAmount > maxAmount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxAmount'],
      message: t('Paramètres de recherche invalides.')
    });
  }
};

const paymentExtrasSchema = z
  .object({
    search: zSearch(),
    startDate: zDay,
    endDate: zDay,
    minAmount: zAmount(),
    maxAmount: zAmount()
  })
  .superRefine(dayOrderRefinement('startDate', 'endDate'))
  .superRefine(amountOrder);

const declarationExtrasSchema = z
  .object({
    search: zSearch(),
    method: z.preprocess(emptyToUndefined, z.nativeEnum(RentalPaymentMethod).optional()),
    startDate: zDay,
    endDate: zDay
  })
  .superRefine(dayOrderRefinement('startDate', 'endDate'));

function parseOrThrow<S extends z.ZodTypeAny>(schema: S, query: Request['query']): z.output<S> {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestError(
      t('Paramètres de recherche invalides.'),
      parsed.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message }))
    );
  }
  return parsed.data;
}

/** Ne garde que les clés définies et convertit les jours en bornes `Date` (fin de jour incluse). */
function compact<T extends object>(values: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

/**
 * Valide `search`, `minAmount`, `maxAmount`, `startDate` et `endDate` d'une
 * liste de paiements (400 si invalide, dont un jour impossible comme
 * `2026-02-31`). Le résultat s'étale dans les filtres du service.
 */
export function parsePaymentListExtras(query: Request['query']): PaymentListExtras {
  const parsed = parseOrThrow(paymentExtrasSchema, query);
  return compact<PaymentListExtras>({
    search: parsed.search,
    minAmount: parsed.minAmount,
    maxAmount: parsed.maxAmount,
    startDate: parsed.startDate ? dayStart(parsed.startDate) : undefined,
    endDate: parsed.endDate ? dayEnd(parsed.endDate) : undefined
  });
}

/** Valide `search`, `method`, `startDate` et `endDate` d'une liste de déclarations (400 si invalide). */
export function parseDeclarationListExtras(query: Request['query']): DeclarationListExtras {
  const parsed = parseOrThrow(declarationExtrasSchema, query);
  return compact<DeclarationListExtras>({
    search: parsed.search,
    method: parsed.method,
    startDate: parsed.startDate ? dayStart(parsed.startDate) : undefined,
    endDate: parsed.endDate ? dayEnd(parsed.endDate) : undefined
  });
}

function addAnd(where: any, condition: unknown): void {
  where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), condition];
}

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

/** Bien et locataire principal d'un bail, tels que la liste les affiche. */
function leaseColumns(search: string) {
  return [
    { lease_number: contains(search) },
    { property: { title: contains(search) } },
    { property: { address: contains(search) } },
    { property: { internalReference: contains(search) } }
  ];
}

/**
 * Ajoute au `where` d'une liste de paiements la recherche libre et l'intervalle
 * de montants. Les dates (`startDate`, `endDate`) restent traitées par le
 * service, qui reçoit déjà des bornes `Date` valides.
 */
export function applyPaymentListExtras(where: any, extras: PaymentListExtras): void {
  const { search, minAmount, maxAmount } = extras;
  if (search) {
    addAnd(where, {
      OR: [
        { psp_reference: contains(search) },
        { psp_transaction_id: contains(search) },
        ...leaseColumns(search).map(condition => ({ lease: condition })),
        { lease: { primaryRenter: { user: { fullName: contains(search) } } } },
        { lease: { primaryRenter: { user: { email: contains(search) } } } },
        { renterClient: { user: { fullName: contains(search) } } },
        { renterClient: { user: { email: contains(search) } } }
      ]
    });
  }
  if (minAmount !== undefined || maxAmount !== undefined) {
    where.amount = {
      ...(minAmount !== undefined ? { gte: minAmount } : {}),
      ...(maxAmount !== undefined ? { lte: maxAmount } : {})
    };
  }
}

/** Ajoute au `where` d'une liste de déclarations la recherche libre et le moyen de paiement. */
export function applyDeclarationListExtras(where: any, extras: DeclarationListExtras): void {
  const { search, method } = extras;
  if (search) {
    addAnd(where, {
      OR: [
        { reference: contains(search) },
        ...leaseColumns(search).map(condition => ({ lease: condition })),
        { declarer: { user: { fullName: contains(search) } } },
        { declarer: { user: { email: contains(search) } } }
      ]
    });
  }
  if (method) where.payment_method = method;
}
