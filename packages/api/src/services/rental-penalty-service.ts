import { prisma } from '../utils/database';
import type { PrismaTransactionClient } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { RentalPenaltyMode, ThirdPartyMovementType } from '@prisma/client';
import {
  compteLocataireTx,
  libellePeriodeEcheance,
  remettrePenaliteTx,
  updateInstallmentStatus
} from './rental-installment-service';
import { appendThirdPartyMovementTx } from '../lib/finance/ledger';
import * as path from 'path';
import * as fs from 'fs/promises';
import { getProjectRoot } from '../utils/project-root';
import { runWithTenantContext } from '../utils/tenant-context';
import { t } from '../i18n';
import { NotFoundError, BadRequestError } from '../middleware/error-middleware';

// ---------------------------------------------------------------------------
// Pont vers le grand livre des comptes de tiers — lot 1, tâche 1.3
//
// Une pénalité appliquée est facturée au locataire (`PENALTY`), une pénalité
// remise lui est réglée (`WAIVER`). Les deux portent la clé de source du
// rétro-remplissage, `(RENTAL_PENALTY, id)`.
//
// `RentalInstallment.penalty_amount` n'entre jamais dans un mouvement : c'est
// un miroir dénormalisé de la somme des lignes `RentalPenalty` (voir
// `deletePenalty` plus bas, qui le recalcule ainsi). Le facturer en plus des
// lignes doublerait chaque pénalité au compte du locataire.
// ---------------------------------------------------------------------------

/**
 * Inscrit la pénalité au compte du locataire, puis ramène l'inscription au
 * montant courant de la pénalité si celui-ci a baissé depuis.
 *
 * Les deux gestes sont dans le même appel parce qu'ils répondent à la même
 * question — « que doit porter le compte pour cette pénalité ? » — et que le
 * chemin de recalcul (`calculatePenalty` sur une pénalité déjà existante) peut
 * emprunter l'un ou l'autre selon que la pénalité vient de naître ou qu'elle
 * est réévaluée.
 */
async function inscrirePenaliteTx(
  tx: PrismaTransactionClient,
  params: {
    tenantId: string;
    tenantClientId: string;
    penaltyId: string;
    montant: number;
    leaseId: string;
    periodYear?: number | null;
    periodMonth?: number | null;
    movementDate?: Date;
  }
): Promise<void> {
  const accountId = await compteLocataireTx(tx, params.tenantId, params.tenantClientId);
  const periode = libellePeriodeEcheance(params.periodYear, params.periodMonth);

  await appendThirdPartyMovementTx(tx, {
    accountId,
    tenantId: params.tenantId,
    type: ThirdPartyMovementType.PENALTY,
    billed: params.montant,
    label: periode ? `Pénalité de retard sur l'échéance ${periode}` : 'Pénalité de retard',
    sourceType: 'RENTAL_PENALTY',
    sourceId: params.penaltyId,
    leaseId: params.leaseId,
    movementDate: params.movementDate
  });

  await remettrePenaliteTx(tx, {
    tenantId: params.tenantId,
    accountId,
    penaltyId: params.penaltyId,
    montantRestant: params.montant,
    label: periode ? `Remise de la pénalité de retard sur l'échéance ${periode}` : 'Remise de la pénalité de retard',
    leaseId: params.leaseId,
    movementDate: params.movementDate
  });
}

/**
 * Get default penalty rule for tenant (or create default if none exists)
 * @param tenantId - Tenant ID
 * @returns Penalty rule
 */
export async function getDefaultPenaltyRule(tenantId: string) {
  let rule = await prisma.rentalPenaltyRule.findFirst({
    where: {
      tenant_id: tenantId,
      is_active: true
    },
    orderBy: {
      created_at: 'desc'
    }
  });

  // Create default rule if none exists
  if (!rule) {
    rule = await prisma.rentalPenaltyRule.create({
      data: {
        tenant_id: tenantId,
        is_active: true,
        grace_days: 0,
        mode: RentalPenaltyMode.PERCENT_OF_BALANCE,
        fixed_amount: 0,
        rate: 0.02, // 2% default
        cap_amount: null,
        min_balance_to_apply: null
      }
    });
  }

  return rule;
}

/**
 * Calculate penalty for an installment
 * @param tenantId - Tenant ID
 * @param installmentId - Installment ID
 * @param rule - Penalty rule to use (optional, will fetch default if not provided)
 * @param actorUserId - User triggering calculation (optional)
 * @returns Calculated penalty
 */
export async function calculatePenalty(tenantId: string, installmentId: string, rule?: any, actorUserId?: string) {
  // Get installment with tenant isolation
  const installment = await prisma.rentalInstallment.findFirst({
    where: {
      id: installmentId,
      tenant_id: tenantId
    },
    include: {
      lease: true
    }
  });

  if (!installment) {
    throw new NotFoundError(t('Échéance introuvable'));
  }

  // Get penalty rule (use provided or fetch default)
  const penaltyRule = rule || (await getDefaultPenaltyRule(tenantId));

  // Use lease penalty settings if available, otherwise use tenant rule
  const graceDays = installment.lease.penalty_grace_days ?? penaltyRule.grace_days;
  const mode = installment.lease.penalty_mode ?? penaltyRule.mode;
  const rate = Number(installment.lease.penalty_rate) || Number(penaltyRule.rate);
  const fixedAmount = Number(installment.lease.penalty_fixed_amount) || Number(penaltyRule.fixed_amount);
  const capAmount = installment.lease.penalty_cap_amount
    ? Number(installment.lease.penalty_cap_amount)
    : penaltyRule.cap_amount
      ? Number(penaltyRule.cap_amount)
      : null;

  // Check if installment is overdue (considering grace days)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(installment.due_date);
  dueDate.setHours(0, 0, 0, 0);
  const graceDate = new Date(dueDate);
  graceDate.setDate(graceDate.getDate() + graceDays);

  if (today <= graceDate) {
    throw new BadRequestError(t("Cette échéance n'est pas encore en retard (délai de grâce en cours)"));
  }

  // Calculate days late
  const daysLate = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

  // Calculate penalty amount based on mode
  let penaltyAmount = 0;

  if (mode === RentalPenaltyMode.FIXED_AMOUNT) {
    penaltyAmount = fixedAmount;
  } else if (mode === RentalPenaltyMode.PERCENT_OF_RENT) {
    const rentAmount = Number(installment.amount_rent);
    // Convert percentage to decimal (e.g., 10% becomes 0.10)
    penaltyAmount = rentAmount * (rate / 100);
  } else if (mode === RentalPenaltyMode.PERCENT_OF_BALANCE) {
    const totalDue =
      Number(installment.amount_rent) + Number(installment.amount_service) + Number(installment.amount_other_fees);
    const paid = Number(installment.amount_paid);
    const balance = totalDue - paid;
    // Convert percentage to decimal (e.g., 10% becomes 0.10)
    penaltyAmount = balance * (rate / 100);
  }

  // Apply cap if set
  if (capAmount && penaltyAmount > capAmount) {
    penaltyAmount = capAmount;
  }

  // Check minimum balance threshold if set
  if (penaltyRule.min_balance_to_apply) {
    const totalDue =
      Number(installment.amount_rent) + Number(installment.amount_service) + Number(installment.amount_other_fees);
    const paid = Number(installment.amount_paid);
    const balance = totalDue - paid;
    if (balance < Number(penaltyRule.min_balance_to_apply)) {
      penaltyAmount = 0; // No penalty if balance below threshold
    }
  }

  // Get or create penalty record
  const existingPenalty = await prisma.rentalPenalty.findFirst({
    where: {
      installment_id: installmentId,
      tenant_id: tenantId
    },
    orderBy: {
      calculated_at: 'desc'
    }
  });

  // La pénalité, le miroir qu'en garde l'échéance et le mouvement qui la
  // facture au locataire naissent ensemble ou pas du tout : une pénalité
  // enregistrée sans son mouvement resterait invisible du relevé, et un
  // mouvement sans sa pénalité ferait payer une dette sans pièce.
  const penalty = await prisma.$transaction(async tx => {
    let ligne;
    if (existingPenalty && !existingPenalty.is_manual_override) {
      // Update existing penalty
      ligne = await tx.rentalPenalty.update({
        where: {
          id: existingPenalty.id,
          tenant_id: tenantId
        },
        data: {
          calculated_at: new Date(),
          days_late: daysLate,
          mode: mode,
          rate: mode !== RentalPenaltyMode.FIXED_AMOUNT ? rate : null,
          fixed_amount: mode === RentalPenaltyMode.FIXED_AMOUNT ? fixedAmount : null,
          amount: penaltyAmount
        }
      });
    } else {
      // Create new penalty
      ligne = await tx.rentalPenalty.create({
        data: {
          tenant_id: tenantId,
          installment_id: installmentId,
          calculated_at: new Date(),
          days_late: daysLate,
          mode: mode,
          rate: mode !== RentalPenaltyMode.FIXED_AMOUNT ? rate : null,
          fixed_amount: mode === RentalPenaltyMode.FIXED_AMOUNT ? fixedAmount : null,
          amount: penaltyAmount,
          currency: installment.currency,
          is_manual_override: false,
          created_by_user_id: actorUserId || null
        }
      });
    }

    // Update installment penalty amount only if penalty was actually updated/created
    // Don't update if existing penalty has manual override (it wasn't recalculated)
    if (!existingPenalty || !existingPenalty.is_manual_override) {
      await tx.rentalInstallment.update({
        where: {
          id: installmentId,
          tenant_id: tenantId
        },
        data: {
          penalty_amount: penaltyAmount
        }
      });
    }

    await inscrirePenaliteTx(tx, {
      tenantId,
      tenantClientId: installment.lease.primary_renter_client_id,
      penaltyId: ligne.id,
      montant: penaltyAmount,
      leaseId: installment.lease_id,
      periodYear: installment.period_year,
      periodMonth: installment.period_month,
      movementDate: ligne.calculated_at
    });

    return ligne;
  });

  // Update installment status
  await updateInstallmentStatus(tenantId, installmentId);

  logger.info('Penalty calculated', {
    penaltyId: penalty.id,
    installmentId,
    tenantId,
    amount: penaltyAmount,
    daysLate
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: 'RENTAL_PENALTY_CALCULATED',
      entityType: 'RENTAL_PENALTY',
      entityId: penalty.id,
      payload: {
        installmentId,
        amount: penaltyAmount,
        daysLate,
        mode
      }
    });
  }

  return penalty;
}

/**
 * Calculate penalties for all overdue installments
 * @param tenantId - Tenant ID (optional, if not provided calculates for all tenants)
 * @param actorUserId - User triggering calculation (optional)
 * @returns Calculation results
 */
export async function calculatePenaltiesForOverdueInstallments(tenantId?: string, actorUserId?: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Échéances échues et non soldées. Les Brouillon en font partie : une échéance
  // générée mais jamais émise reste due à sa date (règle `computeInstallmentStatus`).
  const where: any = {
    status: {
      in: ['DRAFT', 'DUE', 'PARTIAL', 'OVERDUE']
    },
    due_date: { lt: today }
  };

  if (tenantId) {
    where.tenant_id = tenantId;
  }

  const installments = await prisma.rentalInstallment.findMany({
    where,
    include: {
      lease: true
    }
  });

  const results = {
    processed: 0,
    errors: [] as string[],
    penalties: [] as any[]
  };

  const graceParAgence = new Map<string, number>();

  for (const installment of installments) {
    // Lecture transverse ci-dessus ; chaque echeance est traitee dans le
    // contexte de SON agence, pour le garde-fou Prisma.
    await runWithTenantContext({ tenantId: installment.tenant_id }, async () => {
      try {
        // Check if there's already a manual override penalty for this installment
        const existingPenalty = await prisma.rentalPenalty.findFirst({
          where: {
            installment_id: installment.id,
            tenant_id: installment.tenant_id,
            is_manual_override: true
          },
          orderBy: {
            calculated_at: 'desc'
          }
        });

        // Skip calculation if there's a manual override penalty
        if (existingPenalty) {
          logger.debug('Skipping penalty calculation for installment with manual override', {
            installmentId: installment.id,
            penaltyId: existingPenalty.id
          });
          return;
        }

        const dueDate = new Date(installment.due_date);
        dueDate.setHours(0, 0, 0, 0);
        // Même délai de grâce que `calculatePenalty` : bail, sinon règle de l'agence.
        let graceDays = installment.lease.penalty_grace_days;
        if (graceDays === null || graceDays === undefined) {
          if (!graceParAgence.has(installment.tenant_id)) {
            const regle = await getDefaultPenaltyRule(installment.tenant_id);
            graceParAgence.set(installment.tenant_id, regle.grace_days ?? 0);
          }
          graceDays = graceParAgence.get(installment.tenant_id) ?? 0;
        }
        const graceDate = new Date(dueDate);
        graceDate.setDate(graceDate.getDate() + graceDays);

        // Only calculate if overdue (past grace period)
        if (today > graceDate) {
          const penalty = await calculatePenalty(installment.tenant_id, installment.id, undefined, actorUserId);
          results.penalties.push(penalty);
          results.processed++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Installment ${installment.id}: ${errorMsg}`);
        logger.error('Error calculating penalty for installment', {
          installmentId: installment.id,
          error: errorMsg
        });
      }
    });
  }

  logger.info('Penalty calculation job completed', {
    tenantId: tenantId || 'all',
    processed: results.processed,
    errors: results.errors.length
  });

  return results;
}

/**
 * Update penalty manually (override)
 * @param tenantId - Tenant ID
 * @param penaltyId - Penalty ID
 * @param amount - New penalty amount
 * @param reason - Override reason
 * @param actorUserId - User updating the penalty
 * @returns Updated penalty
 */
export async function updatePenalty(
  tenantId: string,
  penaltyId: string,
  amount: number,
  reason: string,
  actorUserId: string
) {
  const penalty = await prisma.rentalPenalty.findFirst({
    where: {
      id: penaltyId,
      tenant_id: tenantId
    },
    include: {
      installment: true
    }
  });

  if (!penalty) {
    throw new NotFoundError(t('Pénalité introuvable'));
  }

  // Le geste commercial de la gestionnaire et sa trace au compte du locataire
  // sont indivisibles : une pénalité ramenée à zéro dont le compte garderait le
  // débit laisserait le locataire débiteur d'une pénalité qu'on lui a remise.
  const updatedPenalty = await prisma.$transaction(async tx => {
    // Update penalty
    const ligne = await tx.rentalPenalty.update({
      where: {
        id: penaltyId,
        tenant_id: tenantId
      },
      data: {
        amount: amount,
        is_manual_override: true,
        override_reason: reason,
        created_by_user_id: actorUserId
      }
    });

    // Update installment penalty amount
    await tx.rentalInstallment.update({
      where: {
        id: penalty.installment_id,
        tenant_id: tenantId
      },
      data: {
        penalty_amount: amount
      }
    });

    const bail = await tx.rentalLease.findFirst({
      where: { id: penalty.installment.lease_id, tenant_id: tenantId },
      select: { primary_renter_client_id: true }
    });

    if (bail) {
      await inscrirePenaliteTx(tx, {
        tenantId,
        tenantClientId: bail.primary_renter_client_id,
        penaltyId,
        montant: amount,
        leaseId: penalty.installment.lease_id,
        periodYear: penalty.installment.period_year,
        periodMonth: penalty.installment.period_month,
        movementDate: ligne.calculated_at
      });
    }

    return ligne;
  });

  // Update installment status
  await updateInstallmentStatus(tenantId, penalty.installment_id);

  logger.info('Penalty manually updated', {
    penaltyId,
    tenantId,
    amount
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'RENTAL_PENALTY_UPDATED',
    entityType: 'RENTAL_PENALTY',
    entityId: penaltyId,
    payload: {
      oldAmount: Number(penalty.amount),
      newAmount: amount,
      reason
    }
  });

  return updatedPenalty;
}

/**
 * Get penalty by ID
 * @param tenantId - Tenant ID
 * @param penaltyId - Penalty ID
 * @returns Penalty or null
 */
export async function getPenaltyById(tenantId: string, penaltyId: string) {
  const penalty = await prisma.rentalPenalty.findFirst({
    where: {
      id: penaltyId,
      tenant_id: tenantId
    },
    include: {
      installment: {
        include: {
          lease: {
            select: {
              id: true,
              lease_number: true
            }
          }
        }
      },
      createdBy: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    }
  });

  return penalty;
}

/**
 * List penalties with filters
 * @param tenantId - Tenant ID
 * @param filters - Optional filters
 * @returns List of penalties
 */
export async function listPenalties(
  tenantId: string,
  filters?: {
    leaseId?: string;
    installmentId?: string;
  }
) {
  const where: any = {
    tenant_id: tenantId
  };

  if (filters?.leaseId) {
    where.installment = {
      lease_id: filters.leaseId
    };
  }

  if (filters?.installmentId) {
    where.installment_id = filters.installmentId;
  }

  const penalties = await prisma.rentalPenalty.findMany({
    where,
    include: {
      installment: {
        include: {
          lease: {
            select: {
              id: true,
              lease_number: true
            }
          }
        }
      },
      createdBy: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    },
    orderBy: {
      calculated_at: 'desc'
    }
  });

  return penalties;
}

/**
 * Delete penalty
 * @param tenantId - Tenant ID
 * @param penaltyId - Penalty ID
 * @param actorUserId - User deleting the penalty
 * @returns Deleted penalty
 */
export async function deletePenalty(tenantId: string, penaltyId: string, actorUserId: string) {
  const penalty = await prisma.rentalPenalty.findFirst({
    where: {
      id: penaltyId,
      tenant_id: tenantId
    },
    include: {
      installment: true
    }
  });

  if (!penalty) {
    throw new NotFoundError(t('Pénalité introuvable'));
  }

  // La suppression et la remise qu'elle vaut au compte du locataire sont
  // indivisibles : une pénalité supprimée dont le débit resterait inscrit
  // rendrait le solde faux sans que rien ne le signale.
  await prisma.$transaction(async tx => {
    // Delete penalty
    await tx.rentalPenalty.delete({
      where: {
        id: penaltyId,
        tenant_id: tenantId
      }
    });

    // Recalculate installment penalty amount (set to 0 if no other penalties)
    const remainingPenalties = await tx.rentalPenalty.findMany({
      where: {
        installment_id: penalty.installment_id,
        tenant_id: tenantId
      }
    });

    const totalPenaltyAmount = remainingPenalties.reduce((sum, p) => sum + Number(p.amount), 0);

    // Update installment penalty amount
    await tx.rentalInstallment.update({
      where: {
        id: penalty.installment_id,
        tenant_id: tenantId
      },
      data: {
        penalty_amount: totalPenaltyAmount
      }
    });

    const bail = await tx.rentalLease.findFirst({
      where: { id: penalty.installment.lease_id, tenant_id: tenantId },
      select: { primary_renter_client_id: true }
    });

    if (!bail) {
      return;
    }

    const periode = libellePeriodeEcheance(penalty.installment.period_year, penalty.installment.period_month);

    await remettrePenaliteTx(tx, {
      tenantId,
      accountId: await compteLocataireTx(tx, tenantId, bail.primary_renter_client_id),
      penaltyId,
      montantRestant: 0,
      label: periode ? `Remise de la pénalité de retard sur l'échéance ${periode}` : 'Remise de la pénalité de retard',
      leaseId: penalty.installment.lease_id,
      movementDate: new Date()
    });
  });

  // Update installment status
  await updateInstallmentStatus(tenantId, penalty.installment_id);

  logger.info('Penalty deleted', {
    penaltyId,
    tenantId,
    actorUserId
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'RENTAL_PENALTY_DELETED',
    entityType: 'RENTAL_PENALTY',
    entityId: penaltyId,
    payload: {
      installmentId: penalty.installment_id,
      amount: Number(penalty.amount)
    }
  });

  return penalty;
}

/**
 * Upload justification document for a penalty
 * @param tenantId - Tenant ID
 * @param penaltyId - Penalty ID
 * @param file - Uploaded file (from multer)
 * @param actorUserId - User uploading the document
 * @returns Updated penalty with justification URL
 */
export async function uploadPenaltyJustification(
  tenantId: string,
  penaltyId: string,
  file: Express.Multer.File,
  actorUserId: string
) {
  const penalty = await prisma.rentalPenalty.findFirst({
    where: {
      id: penaltyId,
      tenant_id: tenantId
    }
  });

  if (!penalty) {
    throw new NotFoundError(t('Pénalité introuvable'));
  }

  // Validate file type (PDF, images, documents)
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/jpg'
  ];

  if (!file.mimetype || !allowedTypes.includes(file.mimetype)) {
    throw new BadRequestError(
      t('Type de fichier invalide. Formats acceptés : {{types}}', { types: allowedTypes.join(', ') })
    );
  }

  // Generate file path
  const projectRoot = getProjectRoot();
  const uploadDir = path.join(projectRoot, 'uploads', 'rental', 'penalties', penaltyId);
  await fs.mkdir(uploadDir, { recursive: true });

  const fileExtension = path.extname(file.originalname);
  const fileName = `justification-${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
  const filePath = path.join(uploadDir, fileName);

  // Save file
  await fs.writeFile(filePath, file.buffer);

  const fileUrl = `/uploads/rental/penalties/${penaltyId}/${fileName}`;

  // Store justification info in override_reason as JSON
  // Format: { "reason": "...", "justification": { "fileUrl": "...", "fileName": "...", ... } }
  let justificationInfo: any = {};
  if (penalty.override_reason) {
    try {
      justificationInfo = JSON.parse(penalty.override_reason);
    } catch {
      // If not JSON, store original reason
      justificationInfo = { reason: penalty.override_reason };
    }
  }

  justificationInfo.justification = {
    fileUrl,
    fileName: file.originalname,
    uploadedAt: new Date().toISOString(),
    uploadedBy: actorUserId
  };

  const updatedPenalty = await prisma.rentalPenalty.update({
    where: {
      id: penaltyId,
      tenant_id: tenantId
    },
    data: {
      override_reason: JSON.stringify(justificationInfo)
    }
  });

  logger.info('Penalty justification uploaded', {
    penaltyId,
    tenantId,
    fileName: file.originalname,
    fileUrl
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'RENTAL_PENALTY_JUSTIFICATION_UPLOADED',
    entityType: 'RENTAL_PENALTY',
    entityId: penaltyId,
    payload: {
      fileName: file.originalname,
      fileUrl
    }
  });

  return { ...updatedPenalty, justificationFileUrl: fileUrl };
}
