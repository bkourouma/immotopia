/**
 * File de validation — lot 2, décision D7 du plan (saisie et validation
 * séparées).
 *
 * Implémente `GetValidationQueue` du contrat gelé (`./types-lot2.ts`) :
 * « plusieurs saisisseuses, un validateur ». Cet écran est celui du
 * validateur ; sans le nom de la saisisseuse il ne sert qu'à cliquer, d'où
 * `createdByLabel` sur chaque ligne (US11, scénario 3).
 *
 * Regroupe les trois natures de pièces brouillon de ce lot — facture
 * fournisseur, règlement fournisseur, pièce de caisse — chacune lue
 * directement dans sa table, `SupplierInvoice` et `SupplierPayment` n'étant
 * pas dans le territoire de cet agent (elles appartiennent à `suppliers.ts`,
 * livré par un autre agent) mais faisant partie du schéma gelé commun : les
 * lire ici n'est pas différent de ce que ferait n'importe quel écran de
 * lecture transverse.
 *
 * Une pièce de caisse n'existe qu'à l'état brouillon avant sa validation
 * (`createCashVoucherTx` n'écrit ni écriture ni imputation, voir `cash.ts`) ;
 * une facture ou un règlement, de même, restent invisibles de toute balance
 * tant que `validatedAt`/`status` ne le dit pas — c'est exactement l'ensemble
 * que cette file doit montrer.
 */

import { prisma } from '../../utils/database';
import { toAmountOrZero } from './types';
import { formatCashVoucherNumber } from './cash';
import type { GetValidationQueue, PendingDocument } from './types-lot2';

interface CreatorLike {
  fullName: string | null;
  email: string;
}

/** Nom lisible de la saisisseuse, avec repli sur l'identifiant abrégé (même convention que `billing-run.ts`). */
function labelCreator(user: CreatorLike | null | undefined, userId: string): string {
  return user?.fullName || user?.email || `Utilisateur ${userId.slice(0, 8)}`;
}

const CREATOR_SELECT = { select: { fullName: true, email: true } } as const;

/** Voir `GetValidationQueue` dans `./types-lot2.ts`. */
export const getValidationQueue: GetValidationQueue = async (tenantId, filters) => {
  const createdByUserId = filters?.createdByUserId;
  const whereBase = { tenantId, ...(createdByUserId ? { createdByUserId } : {}) };

  const [invoices, payments, vouchers] = await Promise.all([
    prisma.supplierInvoice.findMany({
      where: { ...whereBase, status: 'DRAFT' },
      include: { supplier: { select: { name: true } }, createdBy: CREATOR_SELECT }
    }),
    prisma.supplierPayment.findMany({
      where: { ...whereBase, validatedAt: null },
      include: { supplier: { select: { name: true } }, createdBy: CREATOR_SELECT }
    }),
    prisma.cashVoucher.findMany({
      where: { ...whereBase, validatedAt: null },
      include: { createdBy: CREATOR_SELECT }
    })
  ]);

  const items: PendingDocument[] = [
    ...(invoices as Array<Record<string, any>>).map(invoice => ({
      documentType: 'SUPPLIER_INVOICE' as const,
      documentId: invoice.id,
      label: `Facture ${invoice.reference} — ${invoice.supplier?.name ?? 'fournisseur'}`,
      amount: toAmountOrZero(invoice.amount),
      currency: invoice.currency,
      createdAt: invoice.createdAt,
      createdByUserId: invoice.createdByUserId,
      createdByLabel: labelCreator(invoice.createdBy, invoice.createdByUserId)
    })),
    ...(payments as Array<Record<string, any>>).map(payment => ({
      documentType: 'SUPPLIER_PAYMENT' as const,
      documentId: payment.id,
      label: `Règlement fournisseur — ${payment.supplier?.name ?? 'fournisseur'}`,
      amount: toAmountOrZero(payment.amount),
      currency: payment.currency,
      createdAt: payment.createdAt,
      createdByUserId: payment.createdByUserId,
      createdByLabel: labelCreator(payment.createdBy, payment.createdByUserId)
    })),
    ...(vouchers as Array<Record<string, any>>).map(voucher => {
      // Cette file ne montre QUE des brouillons, et un brouillon n'a pas encore
      // de numero : il est attribue a la validation. On nomme donc la piece par
      // son beneficiaire et sa date, les deux seules choses qui la distinguent
      // a l'oeil du validateur. Le cas numerote reste ecrit pour une donnee
      // anterieure a la regle du 19 septembre 2026.
      const numero = formatCashVoucherNumber(voucher.voucherYear, voucher.voucherNumber);
      const jour = new Date(voucher.voucherDate).toLocaleDateString('fr-FR');

      return {
        documentType: 'CASH_VOUCHER' as const,
        documentId: voucher.id,
        label: numero
          ? `Bon de caisse ${numero} — ${voucher.beneficiaryName}`
          : `Bon de caisse du ${jour} — ${voucher.beneficiaryName}`,
        amount: toAmountOrZero(voucher.amount),
        currency: voucher.currency,
        createdAt: voucher.createdAt,
        createdByUserId: voucher.createdByUserId,
        createdByLabel: labelCreator(voucher.createdBy, voucher.createdByUserId)
      };
    })
  ];

  // Plus ancienne d'abord : c'est l'ordre dans lequel un validateur, seul face
  // à la file, doit les traiter pour ne pas laisser vieillir une pièce.
  return items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
};
