/**
 * Tenant Portal Validators
 * Zod schemas for tenant portal request validation
 */

import { z } from 'zod';

// Payment Declaration Validation
export const declarePaymentSchema = z
  .object({
    amount: z
      .number({
        required_error: 'Le montant est requis.',
        invalid_type_error: 'Le montant doit être un nombre.'
      })
      .positive('Le montant doit être positif.'),
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
export const validatePaymentProofFile = (file: Express.Multer.File | undefined): { valid: boolean; error?: string } => {
  if (!file) {
    return { valid: true }; // File is optional
  }

  // Check file size (5MB max)
  const maxSize = 5 * 1024 * 1024; // 5MB in bytes
  if (file.size > maxSize) {
    return { valid: false, error: 'Le fichier ne doit pas dépasser 5MB.' };
  }

  // Check file type (images and PDFs only)
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return { valid: false, error: 'Le fichier doit être une image (JPEG, PNG, WebP) ou un PDF.' };
  }

  return { valid: true };
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
export const validateMaintenanceAttachment = (
  file: Express.Multer.File | undefined
): { valid: boolean; error?: string } => {
  if (!file) {
    return { valid: false, error: 'Le fichier est requis.' };
  }

  // Check file size (5MB max)
  const maxSize = 5 * 1024 * 1024; // 5MB in bytes
  if (file.size > maxSize) {
    return { valid: false, error: 'Le fichier ne doit pas dépasser 5MB.' };
  }

  // Check file type (images and PDFs only)
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return { valid: false, error: 'Le fichier doit être une image (JPEG, PNG, WebP) ou un PDF.' };
  }

  return { valid: true };
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
