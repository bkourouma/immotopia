import { z } from 'zod';

// Maintenance Ticket Category enum
export enum MaintenanceTicketCategory {
  PLUMBING = 'PLUMBING',
  ELECTRICITY = 'ELECTRICITY',
  AC = 'AC',
  OTHER = 'OTHER'
}

// Maintenance Ticket Priority enum
export enum MaintenanceTicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

// Maintenance Ticket Status enum
export enum MaintenanceTicketStatus {
  DECLARED = 'DECLARED',
  IN_PROGRESS = 'IN_PROGRESS',
  ASSIGNED = 'ASSIGNED',
  RESOLVED = 'RESOLVED',
  CANCELED = 'CANCELED'
}

// Maintenance Ticket Comment Author Type enum
export enum MaintenanceTicketCommentAuthorType {
  TENANT = 'TENANT',
  MANAGER = 'MANAGER',
  SYSTEM = 'SYSTEM'
}

// Zod schemas for request validation

/**
 * Schema for creating a maintenance ticket
 */
export const createTicketSchema = z.object({
  title: z
    .string()
    .min(3, 'Le titre doit contenir au moins 3 caractères')
    .max(200, 'Le titre ne peut pas dépasser 200 caractères'),
  category: z.enum(['PLUMBING', 'ELECTRICITY', 'AC', 'OTHER'], {
    errorMap: () => ({ message: 'Catégorie invalide. Valeurs autorisées: PLUMBING, ELECTRICITY, AC, OTHER' })
  }),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], {
    errorMap: () => ({ message: 'Priorité invalide. Valeurs autorisées: LOW, MEDIUM, HIGH, URGENT' })
  }),
  description: z
    .string()
    .min(10, 'La description doit contenir au moins 10 caractères')
    .max(5000, 'La description ne peut pas dépasser 5000 caractères'),
  locationDetails: z.string().max(500, 'Les détails de localisation ne peuvent pas dépasser 500 caractères').optional(),
  propertyId: z.string().uuid("L'ID de la propriété doit être un UUID valide"),
  leaseId: z.string().uuid("L'ID du bail doit être un UUID valide").optional()
});

/**
 * Schema for updating a maintenance ticket (admin/manager)
 */
export const updateTicketSchema = z.object({
  status: z.enum(['DECLARED', 'IN_PROGRESS', 'ASSIGNED', 'RESOLVED', 'CANCELED']).optional(),
  assignedVendorId: z.string().uuid("L'ID du prestataire doit être un UUID valide").optional(),
  assignedToUserId: z.string().uuid("L'ID de l'utilisateur doit être un UUID valide").optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  resolutionNotes: z.string().max(1000, 'Les notes de résolution ne peuvent pas dépasser 1000 caractères').optional()
});

/**
 * Schema for updating a maintenance ticket by tenant
 * Tenants can only update title, description, category, priority, and locationDetails
 * Only if ticket status is DECLARED
 */
export const updateTenantTicketSchema = z.object({
  title: z
    .string()
    .min(3, 'Le titre doit contenir au moins 3 caractères')
    .max(200, 'Le titre ne peut pas dépasser 200 caractères')
    .optional(),
  category: z
    .enum(['PLUMBING', 'ELECTRICITY', 'AC', 'OTHER'], {
      errorMap: () => ({ message: 'Catégorie invalide. Valeurs autorisées: PLUMBING, ELECTRICITY, AC, OTHER' })
    })
    .optional(),
  priority: z
    .enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], {
      errorMap: () => ({ message: 'Priorité invalide. Valeurs autorisées: LOW, MEDIUM, HIGH, URGENT' })
    })
    .optional(),
  description: z
    .string()
    .min(10, 'La description doit contenir au moins 10 caractères')
    .max(5000, 'La description ne peut pas dépasser 5000 caractères')
    .optional(),
  locationDetails: z.string().max(500, 'Les détails de localisation ne peuvent pas dépasser 500 caractères').optional()
});

/**
 * Schema for creating a comment on a ticket
 */
export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, 'Le commentaire ne peut pas être vide')
    .max(5000, 'Le commentaire ne peut pas dépasser 5000 caractères')
});

/**
 * Schema for creating a maintenance vendor
 */
export const createVendorSchema = z.object({
  name: z
    .string()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(200, 'Le nom ne peut pas dépasser 200 caractères'),
  phone: z.string().max(50, 'Le numéro de téléphone ne peut pas dépasser 50 caractères').optional(),
  email: z
    .string()
    .email("L'adresse email doit être valide")
    .max(255, "L'email ne peut pas dépasser 255 caractères")
    .optional()
    .or(z.literal('')),
  address: z.string().max(1000, "L'adresse ne peut pas dépasser 1000 caractères").optional(),
  specialties: z
    .array(z.string().max(50, 'Chaque spécialité ne peut pas dépasser 50 caractères'))
    .optional()
    .default([])
});

/**
 * Schema for updating a maintenance vendor
 */
export const updateVendorSchema = z.object({
  name: z
    .string()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(200, 'Le nom ne peut pas dépasser 200 caractères')
    .optional(),
  phone: z.string().max(50, 'Le numéro de téléphone ne peut pas dépasser 50 caractères').optional(),
  email: z
    .string()
    .email("L'adresse email doit être valide")
    .max(255, "L'email ne peut pas dépasser 255 caractères")
    .optional()
    .or(z.literal('')),
  address: z.string().max(1000, "L'adresse ne peut pas dépasser 1000 caractères").optional(),
  specialties: z.array(z.string().max(50, 'Chaque spécialité ne peut pas dépasser 50 caractères')).optional(),
  isActive: z.boolean().optional()
});

// TypeScript types inferred from Zod schemas

export type CreateTicketRequest = z.infer<typeof createTicketSchema>;
export type UpdateTicketRequest = z.infer<typeof updateTicketSchema>;
export type UpdateTenantTicketRequest = z.infer<typeof updateTenantTicketSchema>;
export type CreateCommentRequest = z.infer<typeof createCommentSchema>;
export type CreateVendorRequest = z.infer<typeof createVendorSchema>;
export type UpdateVendorRequest = z.infer<typeof updateVendorSchema>;
