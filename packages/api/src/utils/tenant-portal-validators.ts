/**
 * Tenant Portal Validators
 * Zod schemas for tenant portal request validation
 */

import { z } from 'zod';
import { detectMandateScanKind } from '../lib/direct-debit/mandate-files';
import { auPlusDeuxDecimales } from './montant';

/**
 * Plafond d'un montant déclaré : la colonne est un `Decimal(12, 2)` (au plus
 * 9 999 999 999,99). Au-delà, la base lève une erreur qui devenait un 500 ;
 * le plafond métier est volontairement plus bas qu'une limite technique.
 */
export const MAX_DECLARED_AMOUNT = 1_000_000_000;

// Messages de validation : traduits par le middleware d'erreur à l'exécution.
// @i18n-keys
const MSG_MONTANT_POSITIF = 'Le montant doit être positif.';
// @i18n-keys
const MSG_MONTANT_NOMBRE = 'Le montant doit être un nombre.';
// @i18n-keys
const MSG_MONTANT_DECIMALES = 'Le montant ne peut pas avoir plus de deux décimales.';
// @i18n-keys
const MSG_MONTANT_TROP_ELEVE = 'Le montant est trop élevé.';
// @i18n-keys
const MSG_CONTENU_FICHIER = 'Le contenu du fichier ne correspond pas à son type (JPEG, PNG, WebP ou PDF attendu).';

// Payment Declaration Validation
export const declarePaymentSchema = z
  .object({
    amount: z
      .number({
        required_error: 'Le montant est requis.',
        invalid_type_error: 'Le montant doit être un nombre.'
      })
      .positive(MSG_MONTANT_POSITIF)
      .finite(MSG_MONTANT_NOMBRE)
      .max(MAX_DECLARED_AMOUNT, MSG_MONTANT_TROP_ELEVE)
      .refine(auPlusDeuxDecimales, MSG_MONTANT_DECIMALES),
    paymentDate: z
      .string({
        required_error: 'La date de paiement est requise.'
      })
      .refine(
        date => {
          const paymentDate = new Date(date);
          const today = new Date();
          today.setHours(23, 59, 59, 999); // End of today
          return paymentDate <= today;
        },
        { message: 'La date de paiement ne peut pas être dans le futur.' }
      ),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY', 'CARD', 'OTHER'], {
      required_error: 'La méthode de paiement est requise.',
      invalid_type_error: 'Méthode de paiement invalide.'
    }),
    transactionPhone: z
      .string()
      .max(50, 'Le numéro ne peut pas dépasser 50 caractères.')
      .optional()
      .transform(v => (v === '' || v == null ? undefined : v)),
    mobileOperator: z
      .enum(['ORANGE', 'MTN', 'MOOV', 'WAVE', 'OTHER'], {
        invalid_type_error: 'Opérateur mobile invalide.'
      })
      .optional(),
    reference: z.string().max(255, 'La référence ne peut pas dépasser 255 caractères.').optional(),
    installmentId: z.string().uuid("ID d'échéance invalide.").optional(),
    notes: z.string().max(1000, 'Les notes ne peuvent pas dépasser 1000 caractères.').optional()
  })
  .refine(
    data => {
      if (data.paymentMethod === 'MOBILE_MONEY' && !data.mobileOperator) {
        return false;
      }
      return true;
    },
    { message: "L'opérateur mobile est requis pour les paiements mobile money.", path: ['mobileOperator'] }
  )
  .refine(
    data => {
      if (data.paymentMethod === 'MOBILE_MONEY') {
        const phone = data.transactionPhone?.trim();
        return !!phone && phone.length > 0;
      }
      return true;
    },
    {
      message: 'Le numéro de téléphone ayant servi à la transaction est requis pour les paiements mobile money.',
      path: ['transactionPhone']
    }
  );

// File Upload Validation
type FileCheck = { valid: boolean; error?: string };
type ProofKind = 'pdf' | 'png' | 'jpg' | 'webp';

const ALLOWED_PROOF_KINDS: Record<string, ProofKind> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
};

/** WebP : conteneur RIFF (`RIFF....WEBP`). PDF, PNG et JPEG : lecteur déjà utilisé pour les scans de mandat. */
function detectProofKind(buffer: Buffer): ProofKind | null {
  const kind = detectMandateScanKind(buffer);
  if (kind) return kind;
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/**
 * Taille, type déclaré ET signature réelle du fichier : un faux `.png` (texte,
 * HTML…) envoyé avec `image/png` est refusé.
 */
function validateImageOrPdf(file: Express.Multer.File): FileCheck {
  const maxSize = 5 * 1024 * 1024; // 5MB in bytes
  if (file.size > maxSize) {
    return { valid: false, error: 'Le fichier ne doit pas dépasser 5MB.' };
  }

  const declaredKind = ALLOWED_PROOF_KINDS[file.mimetype];
  if (!declaredKind) {
    return { valid: false, error: 'Le fichier doit être une image (JPEG, PNG, WebP) ou un PDF.' };
  }

  const realKind = file.buffer ? detectProofKind(file.buffer) : null;
  if (realKind !== declaredKind) {
    return {
      valid: false,
      error: MSG_CONTENU_FICHIER
    };
  }

  return { valid: true };
}

export const validatePaymentProofFile = (file: Express.Multer.File | undefined): FileCheck => {
  if (!file) {
    return { valid: true }; // File is optional
  }
  return validateImageOrPdf(file);
};

// Maintenance Ticket Creation Validation
export const createMaintenanceTicketSchema = z.object({
  category: z
    .string({
      required_error: 'La catégorie est requise.'
    })
    .min(1, 'La catégorie est requise.'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], {
    required_error: 'La priorité est requise.',
    invalid_type_error: 'Priorité invalide. Valeurs autorisées: LOW, MEDIUM, HIGH, URGENT.'
  }),
  title: z
    .string({
      required_error: 'Le titre est requis.'
    })
    .min(1, 'Le titre est requis.')
    .max(200, 'Le titre ne peut pas dépasser 200 caractères.'),
  description: z
    .string({
      required_error: 'La description est requise.'
    })
    .min(1, 'La description est requise.')
    .max(5000, 'La description ne peut pas dépasser 5000 caractères.'),
  locationDetails: z.string().max(500, 'Les détails de localisation ne peuvent pas dépasser 500 caractères.').optional()
});

// File Upload Validation for Maintenance Attachments
export const validateMaintenanceAttachment = (file: Express.Multer.File | undefined): FileCheck => {
  if (!file) {
    return { valid: false, error: 'Le fichier est requis.' };
  }
  return validateImageOrPdf(file);
};

// Add Comment Validation
export const addCommentSchema = z.object({
  comment: z
    .string({
      required_error: 'Le commentaire est requis.'
    })
    .min(1, 'Le commentaire est requis.')
    .max(2000, 'Le commentaire ne peut pas dépasser 2000 caractères.')
});
