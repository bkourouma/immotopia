/**
 * Owner Portal Validators
 * Zod schemas for owner portal request validation
 */

import { z } from 'zod';

// Property Filters
export const propertyFiltersSchema = z.object({
  status: z
    .enum(['DRAFT', 'UNDER_REVIEW', 'AVAILABLE', 'RESERVED', 'UNDER_OFFER', 'RENTED', 'SOLD', 'ARCHIVED'], {
      invalid_type_error: 'Statut de propriété invalide.'
    })
    .optional(),
  propertyType: z.string().optional(),
  transactionMode: z
    .enum(['SALE', 'RENTAL', 'SHORT_TERM'], {
      invalid_type_error: 'Mode de transaction invalide.'
    })
    .optional()
});

// Lease Filters
export const leaseFiltersSchema = z.object({
  status: z
    .enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'ENDED', 'CANCELED'], {
      invalid_type_error: 'Statut de bail invalide.'
    })
    .optional(),
  propertyId: z.string().uuid('ID de propriété invalide.').optional()
});

// Date Range Filters
export const dateRangeSchema = z
  .object({
    startDate: z
      .string({
        required_error: 'La date de début est requise.'
      })
      .refine(
        date => {
          const parsedDate = new Date(date);
          return !isNaN(parsedDate.getTime());
        },
        { message: 'Date de début invalide.' }
      ),
    endDate: z
      .string({
        required_error: 'La date de fin est requise.'
      })
      .refine(
        date => {
          const parsedDate = new Date(date);
          return !isNaN(parsedDate.getTime());
        },
        { message: 'Date de fin invalide.' }
      )
  })
  .refine(
    data => {
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);
      return endDate >= startDate;
    },
    { message: 'La date de fin doit être postérieure ou égale à la date de début.', path: ['endDate'] }
  );

// Revenue Filters
export const revenueFiltersSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  propertyId: z.string().uuid('ID de propriété invalide.').optional(),
  groupBy: z
    .enum(['month', 'year', 'property'], {
      invalid_type_error: 'Groupement invalide. Valeurs autorisées: month, year, property.'
    })
    .optional()
});

// Installment Filters
export const installmentFiltersSchema = z.object({
  status: z
    .enum(['DRAFT', 'DUE', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELED'], {
      invalid_type_error: "Statut d'échéance invalide."
    })
    .optional(),
  propertyId: z.string().uuid('ID de propriété invalide.').optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
});

// Payment Filters
export const paymentFiltersSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  propertyId: z.string().uuid('ID de propriété invalide.').optional(),
  method: z
    .enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY', 'CARD', 'OTHER'], {
      invalid_type_error: 'Méthode de paiement invalide.'
    })
    .optional()
});

// Maintenance Ticket Filters
export const maintenanceFiltersSchema = z.object({
  status: z
    .enum(['DECLARED', 'IN_PROGRESS', 'ASSIGNED', 'RESOLVED', 'CANCELED'], {
      invalid_type_error: 'Statut de ticket invalide.'
    })
    .optional(),
  propertyId: z.string().uuid('ID de propriété invalide.').optional(),
  category: z.string().optional(),
  priority: z
    .enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], {
      invalid_type_error: 'Priorité invalide.'
    })
    .optional()
});

// Document Filters
export const documentFiltersSchema = z.object({
  documentType: z.string().optional(),
  propertyId: z.string().uuid('ID de propriété invalide.').optional(),
  leaseId: z.string().uuid('ID de bail invalide.').optional()
});

// Report Generation Params
export const revenueReportParamsSchema = z.object({
  startDate: z.string({
    required_error: 'La date de début est requise.'
  }),
  endDate: z.string({
    required_error: 'La date de fin est requise.'
  }),
  propertyId: z.string().uuid('ID de propriété invalide.').optional(),
  format: z.enum(['pdf', 'csv', 'excel'], {
    required_error: 'Le format est requis.',
    invalid_type_error: 'Format invalide. Valeurs autorisées: pdf, csv, excel.'
  })
});

export const occupancyReportParamsSchema = z.object({
  asOfDate: z.string({
    required_error: 'La date est requise.'
  }),
  format: z.enum(['pdf', 'csv', 'excel'], {
    required_error: 'Le format est requis.',
    invalid_type_error: 'Format invalide. Valeurs autorisées: pdf, csv, excel.'
  })
});

export const exportDataParamsSchema = z.object({
  entityType: z.enum(['payments', 'installments', 'leases'], {
    required_error: "Le type d'entité est requis.",
    invalid_type_error: "Type d'entité invalide. Valeurs autorisées: payments, installments, leases."
  }),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  propertyId: z.string().uuid('ID de propriété invalide.').optional(),
  format: z.enum(['csv', 'excel'], {
    required_error: 'Le format est requis.',
    invalid_type_error: 'Format invalide. Valeurs autorisées: csv, excel.'
  })
});
