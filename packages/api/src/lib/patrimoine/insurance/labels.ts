import type { MaintenanceLogCategory } from '@prisma/client';
import type { ClaimStatus } from './claim-status';

/**
 * Libellés français du lot assurances (spec 032), partagés par l'export CSV,
 * les alertes et les messages d'erreur. Alignés sur ceux de l'écran web.
 */

export const MAINTENANCE_LOG_CATEGORY_LABELS: Record<MaintenanceLogCategory, string> = {
  PLUMBING: 'Plomberie',
  ELECTRICAL: 'Électricité',
  AIR_CONDITIONING: 'Climatisation',
  GENERATOR: 'Groupe électrogène',
  ROOF_WATERPROOFING: 'Toiture et étanchéité',
  PAINTING: 'Peinture',
  OTHER: 'Autre'
};

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  DECLARED: 'Déclaré',
  INSURER_NOTIFIED: 'Assureur prévenu',
  EXPERTISE: 'Expertise',
  SETTLED: 'Indemnisé',
  REJECTED: 'Rejeté',
  CLOSED: 'Clos'
};
