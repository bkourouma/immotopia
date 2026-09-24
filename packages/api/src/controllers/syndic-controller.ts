import { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  listSyndicatesByTenant,
  getSyndicateWithLotsAndStats,
  createSyndicateWithDefaults,
  createSyndicateLot,
  importLotsFromPropertiesBySyndicate,
  updateSyndicateLotByTenant,
  addLotTenantBySyndicate,
  deactivateLotTenantAssignmentBySyndicate,
  updateSyndicateByTenant,
  archiveSyndicateByTenant,
  listChargeCallsBySyndicate,
  getChargeCallByTenant,
  createChargeCallAndUpdateStatus,
  recordChargePaymentWithStatusUpdate,
  listMeetingsBySyndicate,
  getMeetingByTenant,
  createMeetingWithResolutions,
  updateMeetingByTenant,
  addResolutionToMeeting,
  castVoteAndRecomputeResolutionCounters,
  addAgendaItemToMeeting,
  updateAgendaItemByTenant,
  deleteAgendaItemByTenant,
  listServiceProvidersBySyndicate,
  listMaintenanceContractsBySyndicate,
  linkMaintenanceContractBySyndicate,
  listLinkedMaintenanceContractsBySyndicate,
  createMaintenanceContract,
  getMaintenanceContractByTenant,
  updateMaintenanceContractByTenant,
  deleteMaintenanceContractByTenant,
  listDocumentsBySyndicate,
  createDocumentForSyndicate,
  getFinanceSummaryBySyndicate,
  listCommonAssetsBySyndicate,
  listOverdueDashboardBySyndicate,
  listPaymentRemindersBySyndicate,
  createManualReminderForChargeCall,
  runReminderBatchForSyndicate,
  listLatePaymentPenaltiesBySyndicate,
  listPaymentSchedulesBySyndicate,
  createLatePaymentPenaltyForChargeCall,
  waiveLatePaymentPenaltyByTenant,
  createPaymentScheduleForChargeCall,
  createOwnerAccountAdjustmentByLot,
  getOwnerAccountByLot,
  getOwnerAccountStatementByLot,
  listOwnerAccountTransactionsByLot,
  listChartOfAccountsBySyndicate,
  createChartOfAccountBySyndicate,
  listAccountingJournalsBySyndicate,
  createAccountingJournalBySyndicate,
  listJournalEntriesBySyndicate,
  createJournalEntryBySyndicate,
  lockJournalEntryBySyndicate,
  getTrialBalanceBySyndicate,
  getGeneralLedgerBySyndicate,
  listBudgetsBySyndicate,
  createBudgetBySyndicate,
  updateBudgetBySyndicate,
  recomputeBudgetAllocationsByBudget,
  listChargeCallBatchesBySyndicate,
  createChargeCallBatchBySyndicate,
  generateChargeCallsFromBudget,
  listLotOwnerProfilesBySyndicate,
  createLotOwnerProfileBySyndicate,
  updateLotOwnerProfileBySyndicate,
  listLotTenantProfilesBySyndicate,
  createLotTenantProfileBySyndicate,
  updateLotTenantProfileBySyndicate,
  linkMaintenanceRequestBySyndicate,
  listIncidentsBySyndicate,
  createIncidentBySyndicate,
  updateIncidentBySyndicate,
  addIncidentImputationBySyndicate
} from '../lib/syndics/queries';
import {
  createSyndicateSchema,
  createLotSchema,
  importLotsFromPropertiesSchema,
  updateLotSchema,
  updateSyndicateSchema,
  createChargeCallSchema,
  createChargeCallBatchSchema,
  createBudgetSchema,
  updateBudgetSchema,
  generateBudgetChargeCallsSchema,
  budgetListQuerySchema,
  createLotOwnerProfileSchema,
  updateLotOwnerProfileSchema,
  createLotTenantProfileSchema,
  updateLotTenantProfileSchema,
  createLotTenantAssignmentSchema,
  linkMaintenanceRequestSchema,
  linkMaintenanceContractSchema,
  createIncidentSchema,
  updateIncidentSchema,
  createIncidentImputationSchema,
  createChargePaymentSchema,
  createMeetingSchema,
  updateMeetingSchema,
  createResolutionSchema,
  castVoteSchema,
  createAgendaItemSchema,
  updateAgendaItemSchema,
  createContractSchema,
  createDocumentSchema,
  updateContractSchema,
  createManualReminderSchema,
  createPenaltyRequestSchema,
  waivePenaltySchema,
  createScheduleRequestSchema,
  createOwnerAccountAdjustmentSchema,
  ownerAccountStatementQuerySchema,
  createChartOfAccountSchema,
  createAccountingJournalSchema,
  createJournalEntrySchema,
  accountingEntriesQuerySchema,
  lockJournalEntrySchema,
  accountingRangeQuerySchema
} from '../lib/syndics/schemas';
import { notifyChargeCall, notifyChargeCallReminder, notifyMeetingConvocation } from '../lib/syndics/notifications';
import { badRequest, notFound } from '../lib/errors';
import { logger } from '../utils/logger';
import { buildMeetingMinutesDocx } from '../lib/syndics/minutes-generator';
import { buildOwnerAccountStatementPdf } from '../lib/syndics/owner-account-statement';

export async function listSyndicsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des coproprietes');
    }

    const syndics = await listSyndicatesByTenant(tenantId);

    res.json({
      success: true,
      data: syndics
    });
  } catch (error: any) {
    logger.error('Error listing syndicates', { error });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec du listing des coproprietes'
    });
  }
}

export async function createSyndicHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation de copropriete');
    }

    const parsed = createSyndicateSchema.parse(req.body);
    const syndic = await createSyndicateWithDefaults(tenantId, parsed);

    res.status(201).json({
      success: true,
      data: syndic
    });
  } catch (error: any) {
    logger.error('Error creating syndicate', { error, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de la creation de copropriete'
    });
  }
}

export async function getSyndicHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour le detail de copropriete');
    }

    const syndic = await getSyndicateWithLotsAndStats(tenantId, syndicId);

    if (!syndic) {
      throw notFound('Copropriete introuvable ou inaccessible');
    }

    res.json({
      success: true,
      data: syndic
    });
  } catch (error: any) {
    logger.error('Error getting syndicate', { error, syndicId: req.params.syndicId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec de la recuperation de la copropriete'
    });
  }
}

export async function updateSyndicHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la mise a jour de copropriete');
    }

    const parsed = updateSyndicateSchema.parse(req.body);
    const syndic = await updateSyndicateByTenant(tenantId, syndicId, parsed);

    res.json({
      success: true,
      data: syndic
    });
  } catch (error: any) {
    logger.error('Error updating syndicate', { error, syndicId: req.params.syndicId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de la mise a jour de la copropriete'
    });
  }
}

export async function archiveSyndicHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour l archivage de copropriete');
    }

    const syndic = await archiveSyndicateByTenant(tenantId, syndicId);

    res.json({
      success: true,
      message: 'Copropriete supprimee',
      data: syndic
    });
  } catch (error: any) {
    logger.error('Error archiving syndicate', { error, syndicId: req.params.syndicId });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de l archivage de la copropriete'
    });
  }
}

export async function listSyndicLotsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des lots');
    }

    const syndic = await getSyndicateWithLotsAndStats(tenantId, syndicId);

    if (!syndic) {
      throw notFound('Copropriete introuvable ou inaccessible');
    }

    res.json({
      success: true,
      data: syndic.lots || []
    });
  } catch (error: any) {
    logger.error('Error listing syndic lots', { error, syndicId: req.params.syndicId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec du listing des lots'
    });
  }
}

export async function createSyndicLotHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation de lot');
    }

    const parsed = createLotSchema.parse({
      ...req.body,
      syndicateId
    });

    const lot = await createSyndicateLot(tenantId, parsed);

    res.status(201).json({
      success: true,
      data: lot
    });
  } catch (error: any) {
    logger.error('Error creating syndic lot', { error, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de la creation du lot'
    });
  }
}

export async function importSyndicLotsFromPropertiesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest("TenantId manquant pour l'import des lots");
    }

    const parsed = importLotsFromPropertiesSchema.parse(req.body ?? {});
    const result = await importLotsFromPropertiesBySyndicate(tenantId, syndicateId, parsed.propertyIds);

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('Error importing syndic lots from properties', { error, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || "Echec de l'import des lots"
    });
  }
}

export async function updateSyndicLotHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const lotId = req.params.lotId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la mise a jour du lot');
    }

    const parsed = updateLotSchema.parse(req.body);
    const lot = await updateSyndicateLotByTenant(tenantId, syndicateId, lotId, parsed);

    res.json({
      success: true,
      data: lot
    });
  } catch (error: any) {
    logger.error('Error updating syndic lot', {
      error,
      syndicId: req.params.syndicId,
      lotId: req.params.lotId,
      body: req.body
    });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de la mise a jour du lot'
    });
  }
}

export async function addLotTenantHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const lotId = req.params.lotId;

    if (!tenantId) {
      throw badRequest("TenantId manquant pour l'affectation locataire");
    }

    const parsed = createLotTenantAssignmentSchema.parse(req.body ?? {});
    const assignment = await addLotTenantBySyndicate(tenantId, syndicateId, lotId, parsed);

    res.status(201).json({
      success: true,
      data: assignment
    });
  } catch (error: any) {
    logger.error('Error creating lot tenant assignment', { error, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || "Echec d'affectation du locataire"
    });
  }
}

export async function deactivateLotTenantAssignmentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const lotId = req.params.lotId;
    const assignmentId = req.params.assignmentId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la desactivation locataire');
    }

    const assignment = await deactivateLotTenantAssignmentBySyndicate(tenantId, syndicateId, lotId, assignmentId);
    res.json({
      success: true,
      data: assignment
    });
  } catch (error: any) {
    logger.error('Error deactivating lot tenant assignment', { error, assignmentId: req.params.assignmentId });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de desactivation de l assignation locataire'
    });
  }
}

export async function listChargeCallsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des appels de charges');
    }

    const chargeCalls = await listChargeCallsBySyndicate(tenantId, syndicateId, {
      period: req.query.period as string | undefined,
      status: req.query.status as 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | undefined,
      pagination: {
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      }
    });

    res.json({
      success: true,
      data: chargeCalls
    });
  } catch (error: any) {
    logger.error('Error listing charge calls', { error, syndicId: req.params.syndicId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec du listing des appels de charges'
    });
  }
}

export async function createChargeCallHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation d appel de charges');
    }

    const parsed = createChargeCallSchema.parse({
      ...req.body,
      syndicateId
    });

    const result = await createChargeCallAndUpdateStatus(tenantId, parsed);

    if (result && typeof result === 'object' && 'id' in result) {
      try {
        await notifyChargeCall(result.id as string);
      } catch (notificationError: any) {
        logger.warn('Charge call created but notification failed', {
          chargeCallId: result.id,
          error: notificationError?.message || String(notificationError)
        });
      }
    } else if (result && typeof result === 'object' && 'chargeCalls' in result) {
      await Promise.allSettled(
        result.chargeCalls.map(async (chargeCall: any) => {
          try {
            await notifyChargeCall(chargeCall.id);
          } catch (notificationError: any) {
            logger.warn('Charge call created but notification failed', {
              chargeCallId: chargeCall.id,
              error: notificationError?.message || String(notificationError)
            });
          }
        })
      );
    }

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('Error creating charge call', { error, syndicId: req.params.syndicId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de la creation de l appel de charges'
    });
  }
}

export async function getChargeCallHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const chargeCallId = req.params.chargeId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour le detail de l appel de charges');
    }

    const chargeCall = await getChargeCallByTenant(tenantId, syndicateId, chargeCallId);

    if (!chargeCall) {
      throw notFound('Appel de charges introuvable ou inaccessible');
    }

    res.json({
      success: true,
      data: chargeCall
    });
  } catch (error: any) {
    logger.error('Error getting charge call', { error, chargeId: req.params.chargeId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec de la recuperation de l appel de charges'
    });
  }
}

export async function payChargeCallHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const chargeCallId = req.params.chargeId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour le paiement d appel de charges');
    }

    const parsed = createChargePaymentSchema.parse({
      ...req.body,
      chargeCallId
    });

    const payment = await recordChargePaymentWithStatusUpdate(tenantId, parsed);

    res.status(201).json({
      success: true,
      data: payment
    });
  } catch (error: any) {
    logger.error('Error paying charge call', { error, chargeId: req.params.chargeId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de l enregistrement du paiement'
    });
  }
}

export async function listChargeCallBatchesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des batches');
    }

    const batches = await listChargeCallBatchesBySyndicate(tenantId, syndicateId, {
      status: req.query.status as any,
      period: typeof req.query.period === 'string' ? req.query.period : undefined
    });

    res.json({
      success: true,
      data: batches
    });
  } catch (error: any) {
    logger.error('Error listing charge call batches', { error, syndicId: req.params.syndicId, query: req.query });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec du listing des batches'
    });
  }
}

export async function createChargeCallBatchHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation du batch');
    }

    const parsed = createChargeCallBatchSchema.parse({
      ...req.body,
      syndicateId
    });

    const batch = await createChargeCallBatchBySyndicate(tenantId, syndicateId, {
      label: parsed.label,
      period: parsed.period,
      dueDate: parsed.dueDate,
      batchType: parsed.batchType,
      budgetId: parsed.budgetId,
      totalAmount: parsed.totalAmount,
      currency: parsed.currency
    });

    res.status(201).json({
      success: true,
      data: batch
    });
  } catch (error: any) {
    logger.error('Error creating charge call batch', { error, syndicId: req.params.syndicId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de creation du batch'
    });
  }
}

export async function listBudgetsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des budgets');
    }

    const parsed = budgetListQuerySchema.parse(req.query ?? {});
    const budgets = await listBudgetsBySyndicate(tenantId, syndicateId, parsed);

    res.json({
      success: true,
      data: budgets
    });
  } catch (error: any) {
    logger.error('Error listing budgets', { error, syndicId: req.params.syndicId, query: req.query });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec du listing des budgets'
    });
  }
}

export async function createBudgetHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation du budget');
    }

    const parsed = createBudgetSchema.parse({
      ...req.body,
      syndicateId
    });

    const budget = await createBudgetBySyndicate(tenantId, syndicateId, parsed);
    logger.info('Audit: budget created', {
      tenantId,
      syndicateId,
      budgetId: budget?.id,
      actorUserId: req.user?.userId
    });

    res.status(201).json({
      success: true,
      data: budget
    });
  } catch (error: any) {
    logger.error('Error creating budget', { error, syndicId: req.params.syndicId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de creation du budget'
    });
  }
}

export async function updateBudgetHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const budgetId = req.params.budgetId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la mise a jour du budget');
    }

    const parsed = updateBudgetSchema.parse(req.body ?? {});
    const budget = await updateBudgetBySyndicate(tenantId, syndicateId, budgetId, parsed);
    logger.info('Audit: budget updated', { tenantId, syndicateId, budgetId, actorUserId: req.user?.userId });

    res.json({
      success: true,
      data: budget
    });
  } catch (error: any) {
    logger.error('Error updating budget', {
      error,
      syndicId: req.params.syndicId,
      budgetId: req.params.budgetId,
      body: req.body
    });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de mise a jour du budget'
    });
  }
}

export async function recomputeBudgetAllocationsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const budgetId = req.params.budgetId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour le recalcul des allocations budgetaires');
    }

    const allocations = await recomputeBudgetAllocationsByBudget(tenantId, syndicateId, budgetId);
    logger.info('Audit: budget allocations recomputed', {
      tenantId,
      syndicateId,
      budgetId,
      allocations: allocations.length,
      actorUserId: req.user?.userId
    });
    res.json({
      success: true,
      data: allocations
    });
  } catch (error: any) {
    logger.error('Error recomputing budget allocations', {
      error,
      syndicId: req.params.syndicId,
      budgetId: req.params.budgetId
    });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec du recalcul des allocations budgetaires'
    });
  }
}

export async function generateBudgetChargeCallsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const budgetId = req.params.budgetId;

    if (!tenantId) {
      throw badRequest("TenantId manquant pour la generation d'appels depuis budget");
    }

    const parsed = generateBudgetChargeCallsSchema.parse(req.body ?? {});
    const batch = await generateChargeCallsFromBudget(tenantId, syndicateId, budgetId, parsed);

    const generatedChargeCalls = Array.isArray((batch as any)?.chargeCalls) ? (batch as any).chargeCalls : [];
    if (generatedChargeCalls.length > 0) {
      const notificationResults = await Promise.allSettled(
        generatedChargeCalls.map(async (chargeCall: any) => {
          try {
            return await notifyChargeCall(chargeCall.id);
          } catch (notificationError: any) {
            logger.warn('Budget charge call generated but notification failed', {
              chargeCallId: chargeCall.id,
              batchId: (batch as any)?.id,
              error: notificationError?.message || String(notificationError)
            });
            throw notificationError;
          }
        })
      );

      const notified = notificationResults.filter(result => result.status === 'fulfilled').length;
      const failed = notificationResults.length - notified;
      logger.info('Budget charge call notifications completed', {
        tenantId,
        syndicateId,
        budgetId,
        batchId: (batch as any)?.id,
        total: notificationResults.length,
        notified,
        failed
      });
    }

    logger.info('Audit: charge calls generated from budget', {
      tenantId,
      syndicateId,
      budgetId,
      batchId: batch?.id,
      actorUserId: req.user?.userId
    });
    res.status(201).json({
      success: true,
      data: batch
    });
  } catch (error: any) {
    logger.error('Error generating charge calls from budget', {
      error,
      syndicId: req.params.syndicId,
      budgetId: req.params.budgetId,
      body: req.body
    });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de generation des appels depuis budget'
    });
  }
}

export async function listMeetingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des assemblees');
    }

    const meetings = await listMeetingsBySyndicate(tenantId, syndicateId, {
      status: req.query.status as 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | undefined
    });

    res.json({
      success: true,
      data: meetings
    });
  } catch (error: any) {
    logger.error('Error listing meetings', { error, syndicId: req.params.syndicId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec du listing des assemblees'
    });
  }
}

export async function createMeetingHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation d assemblee');
    }

    const meetingBase = createMeetingSchema.parse({
      ...req.body,
      syndicateId
    });

    const resolutions = Array.isArray(req.body.resolutions)
      ? req.body.resolutions.map((resolution: any) =>
          createResolutionSchema.omit({ meetingId: true }).parse(resolution)
        )
      : [];

    const meeting = await createMeetingWithResolutions(tenantId, {
      ...meetingBase,
      resolutions
    });
    try {
      if (meeting?.id) {
        await notifyMeetingConvocation(meeting.id);
      }
    } catch (notificationError: any) {
      logger.warn('Meeting created but convocation notification failed', {
        meetingId: meeting?.id,
        error: notificationError?.message || String(notificationError)
      });
    }

    res.status(201).json({
      success: true,
      data: meeting
    });
  } catch (error: any) {
    logger.error('Error creating meeting', { error, syndicId: req.params.syndicId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de la creation de l assemblee'
    });
  }
}

export async function updateMeetingHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const meetingId = req.params.meetingId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la mise a jour de l assemblee');
    }

    const parsed = updateMeetingSchema.parse(req.body);
    const updatedMeeting = await updateMeetingByTenant(tenantId, syndicateId, meetingId, parsed);

    res.json({
      success: true,
      data: updatedMeeting
    });
  } catch (error: any) {
    logger.error('Error updating meeting', { error, meetingId: req.params.meetingId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de la mise a jour de l assemblee'
    });
  }
}

export async function getMeetingHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const meetingId = req.params.meetingId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour le detail de l assemblee');
    }

    const meeting = await getMeetingByTenant(tenantId, syndicateId, meetingId);

    if (!meeting) {
      throw notFound('Assemblee generale introuvable ou inaccessible');
    }

    res.json({
      success: true,
      data: meeting
    });
  } catch (error: any) {
    logger.error('Error getting meeting', { error, meetingId: req.params.meetingId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec de la recuperation de l assemblee'
    });
  }
}

export async function addResolutionHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const meetingId = req.params.meetingId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation de resolution');
    }

    const parsed = createResolutionSchema.parse({
      ...req.body,
      meetingId
    });

    const resolution = await addResolutionToMeeting(tenantId, syndicateId, parsed);

    res.status(201).json({
      success: true,
      data: resolution
    });
  } catch (error: any) {
    logger.error('Error adding resolution', { error, meetingId: req.params.meetingId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de la creation de la resolution'
    });
  }
}

export async function addAgendaItemHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const meetingId = req.params.meetingId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation d un point d ordre du jour');
    }

    const parsed = createAgendaItemSchema.parse({
      ...req.body,
      meetingId
    });

    const agendaItem = await addAgendaItemToMeeting(tenantId, syndicateId, parsed);

    res.status(201).json({
      success: true,
      data: agendaItem
    });
  } catch (error: any) {
    logger.error('Error adding agenda item', { error, meetingId: req.params.meetingId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de la creation du point d ordre du jour'
    });
  }
}

export async function updateAgendaItemHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const agendaItemId = req.params.agendaItemId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la mise a jour du point d ordre du jour');
    }

    const parsed = updateAgendaItemSchema.parse(req.body);
    const agendaItem = await updateAgendaItemByTenant(tenantId, syndicateId, agendaItemId, parsed);

    res.json({
      success: true,
      data: agendaItem
    });
  } catch (error: any) {
    logger.error('Error updating agenda item', { error, agendaItemId: req.params.agendaItemId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de la mise a jour du point d ordre du jour'
    });
  }
}

export async function deleteAgendaItemHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const agendaItemId = req.params.agendaItemId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la suppression du point d ordre du jour');
    }

    const deleted = await deleteAgendaItemByTenant(tenantId, syndicateId, agendaItemId);

    res.json({
      success: true,
      data: deleted
    });
  } catch (error: any) {
    logger.error('Error deleting agenda item', { error, agendaItemId: req.params.agendaItemId });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de la suppression du point d ordre du jour'
    });
  }
}

export async function castVoteHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const resolutionId = req.params.resolutionId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour le vote');
    }

    const parsed = castVoteSchema.parse({
      ...req.body,
      resolutionId
    });

    const meeting = await castVoteAndRecomputeResolutionCounters(
      tenantId,
      syndicateId,
      parsed.resolutionId,
      parsed.lotId,
      parsed.vote
    );

    res.json({
      success: true,
      data: meeting
    });
  } catch (error: any) {
    logger.error('Error casting vote', { error, resolutionId: req.params.resolutionId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de l enregistrement du vote'
    });
  }
}

export async function generateMeetingMinutesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const meetingId = req.params.meetingId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la generation du compte rendu');
    }

    const meeting = await getMeetingByTenant(tenantId, syndicateId, meetingId);

    if (!meeting) {
      throw notFound('Assemblee generale introuvable ou inaccessible');
    }

    const buffer = await buildMeetingMinutesDocx(meeting, tenantId);
    const filename = `compte-rendu-${meetingId}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (error: any) {
    logger.error('Error generating meeting minutes', { error, meetingId: req.params.meetingId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec de la generation du compte rendu'
    });
  }
}

export async function listProvidersHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des prestataires');
    }

    const [providers, contracts, assets] = await Promise.all([
      listServiceProvidersBySyndicate(tenantId, syndicateId),
      listMaintenanceContractsBySyndicate(tenantId, syndicateId),
      listCommonAssetsBySyndicate(tenantId, syndicateId)
    ]);

    res.json({
      success: true,
      data: {
        providers,
        contracts,
        commonAssets: assets
      }
    });
  } catch (error: any) {
    logger.error('Error listing providers/contracts', { error, syndicId: req.params.syndicId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec du listing des prestataires et contrats'
    });
  }
}

export async function listContractsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des contrats');
    }

    const contracts = await listLinkedMaintenanceContractsBySyndicate(tenantId, syndicateId);

    res.json({
      success: true,
      data: contracts
    });
  } catch (error: any) {
    logger.error('Error listing contracts', { error, syndicId: req.params.syndicId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec du listing des contrats'
    });
  }
}

export async function linkContractHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liaison de contrat');
    }

    const parsed = linkMaintenanceContractSchema.parse(req.body ?? {});
    const contractLink = await linkMaintenanceContractBySyndicate(tenantId, syndicateId, parsed);

    res.status(201).json({
      success: true,
      data: contractLink
    });
  } catch (error: any) {
    logger.error('Error linking maintenance contract', { error, syndicId: req.params.syndicId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de liaison du contrat maintenance'
    });
  }
}

export async function createContractHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation de contrat');
    }

    const parsed = createContractSchema.parse({
      ...req.body,
      syndicateId
    });

    const contract = await createMaintenanceContract(tenantId, parsed);

    res.status(201).json({
      success: true,
      data: contract
    });
  } catch (error: any) {
    logger.error('Error creating contract', { error, syndicId: req.params.syndicId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de la creation du contrat'
    });
  }
}

export async function getContractHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const contractId = req.params.contractId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour le detail du contrat');
    }

    const contract = await getMaintenanceContractByTenant(tenantId, syndicateId, contractId);

    if (!contract) {
      throw notFound('Contrat introuvable ou inaccessible');
    }

    res.json({
      success: true,
      data: contract
    });
  } catch (error: any) {
    logger.error('Error getting contract', {
      error,
      syndicId: req.params.syndicId,
      contractId: req.params.contractId
    });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec de la recuperation du contrat'
    });
  }
}

export async function updateContractHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const contractId = req.params.contractId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la mise a jour du contrat');
    }

    const parsed = updateContractSchema.parse(req.body);
    const contract = await updateMaintenanceContractByTenant(tenantId, syndicateId, contractId, parsed);

    res.json({
      success: true,
      data: contract
    });
  } catch (error: any) {
    logger.error('Error updating contract', {
      error,
      syndicId: req.params.syndicId,
      contractId: req.params.contractId,
      body: req.body
    });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de la mise a jour du contrat'
    });
  }
}

export async function deleteContractHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const contractId = req.params.contractId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la suppression du contrat');
    }

    const contract = await deleteMaintenanceContractByTenant(tenantId, syndicateId, contractId);

    res.json({
      success: true,
      message: 'Contrat supprime',
      data: contract
    });
  } catch (error: any) {
    logger.error('Error deleting contract', {
      error,
      syndicId: req.params.syndicId,
      contractId: req.params.contractId
    });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de la suppression du contrat'
    });
  }
}

export async function listDocumentsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const rawType = typeof req.query.type === 'string' ? req.query.type : undefined;
    const mappedType =
      rawType === 'SYNDICATE_PV'
        ? 'GENERAL_MEETING_MINUTES'
        : rawType === 'SYNDICATE_BUDGET'
          ? 'BUDGET'
          : rawType === 'SYNDICATE_CONTRAT'
            ? 'OTHER'
            : rawType === 'SYNDICATE_REGL_COPRO'
              ? 'REGULATION'
              : rawType;
    const allowedTypes = new Set([
      'REGULATION',
      'GENERAL_MEETING_MINUTES',
      'DIAGNOSTIC',
      'INSURANCE',
      'BUDGET',
      'OTHER'
    ]);
    const normalizedType = mappedType && allowedTypes.has(mappedType) ? mappedType : undefined;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des documents');
    }

    const documents = await listDocumentsBySyndicate(tenantId, syndicateId, {
      type: normalizedType as
        'REGULATION' | 'GENERAL_MEETING_MINUTES' | 'DIAGNOSTIC' | 'INSURANCE' | 'BUDGET' | 'OTHER' | undefined
    });

    res.json({
      success: true,
      data: documents
    });
  } catch (error: any) {
    logger.error('Error listing syndic documents', { error, syndicId: req.params.syndicId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec du listing des documents'
    });
  }
}

export async function createDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation de document');
    }

    const parsed = createDocumentSchema.parse({
      ...req.body,
      syndicateId
    });

    let fileUrl = parsed.fileUrl;
    if (req.file) {
      const cwd = process.cwd();
      const projectRoot =
        path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages' ? path.resolve(cwd, '..') : cwd;
      const uploadDir = path.join(projectRoot, 'uploads', 'syndics', syndicateId, 'documents');
      await fs.mkdir(uploadDir, { recursive: true });

      const extension = path.extname(req.file.originalname) || '';
      const safeType = parsed.type.toLowerCase();
      const fileName = `${safeType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
      const filePath = path.join(uploadDir, fileName);

      await fs.writeFile(filePath, req.file.buffer);
      fileUrl = `/uploads/syndics/${syndicateId}/documents/${fileName}`;
    }

    if (!fileUrl) {
      throw badRequest('Aucun fichier fourni');
    }

    const document = await createDocumentForSyndicate(tenantId, {
      ...parsed,
      fileUrl
    });

    res.status(201).json({
      success: true,
      data: document
    });
  } catch (error: any) {
    logger.error('Error creating syndic document', { error, syndicId: req.params.syndicId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de la creation du document'
    });
  }
}

export async function getFinanceSummaryHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la synthese financiere');
    }

    const summary = await getFinanceSummaryBySyndicate(tenantId, syndicateId);

    res.json({
      success: true,
      data: summary
    });
  } catch (error: any) {
    logger.error('Error getting finance summary', { error, syndicId: req.params.syndicId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec de la recuperation de la synthese financiere'
    });
  }
}

export async function getOverdueDashboardHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour le dashboard des retards');
    }

    const dashboard = await listOverdueDashboardBySyndicate(tenantId, syndicateId);

    res.json({
      success: true,
      data: dashboard
    });
  } catch (error: any) {
    logger.error('Error getting overdue dashboard', { error, syndicId: req.params.syndicId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec de recuperation du dashboard des retards'
    });
  }
}

export async function listRemindersHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des relances');
    }

    const reminders = await listPaymentRemindersBySyndicate(tenantId, syndicateId, {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined
    });

    res.json({
      success: true,
      data: reminders
    });
  } catch (error: any) {
    logger.error('Error listing reminders', { error, syndicId: req.params.syndicId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec du listing des relances'
    });
  }
}

export async function createManualReminderHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const chargeCallId = req.params.chargeId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation de relance');
    }

    const parsed = createManualReminderSchema.parse(req.body ?? {});
    const reminder = await createManualReminderForChargeCall(tenantId, syndicateId, chargeCallId, parsed);
    try {
      await notifyChargeCallReminder(reminder.id);
    } catch (notifyError) {
      logger.warn('Manual reminder created but notification failed', {
        reminderId: reminder.id,
        chargeId: chargeCallId,
        notifyError
      });
    }

    res.status(201).json({
      success: true,
      data: reminder
    });
  } catch (error: any) {
    logger.error('Error creating manual reminder', { error, chargeId: req.params.chargeId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de creation de la relance'
    });
  }
}

export async function runReminderBatchHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour le batch de relances');
    }

    const result = await runReminderBatchForSyndicate(tenantId, syndicateId);
    logger.info('Audit: reminder batch executed', {
      tenantId,
      syndicateId,
      processedCalls: result.processedCalls,
      remindersCreated: result.remindersCreated,
      actorUserId: req.user?.userId
    });
    for (const reminderId of result.createdReminderIds) {
      try {
        await notifyChargeCallReminder(reminderId);
      } catch (notifyError) {
        logger.warn('Batch reminder created but notification failed', {
          reminderId,
          syndicId: syndicateId,
          notifyError
        });
      }
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('Error running reminder batch', { error, syndicId: req.params.syndicId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec du batch de relances'
    });
  }
}

export async function listPenaltiesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des penalites');
    }

    const penalties = await listLatePaymentPenaltiesBySyndicate(tenantId, syndicateId, {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined
    });

    res.json({
      success: true,
      data: penalties
    });
  } catch (error: any) {
    logger.error('Error listing penalties', { error, syndicId: req.params.syndicId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec du listing des penalites'
    });
  }
}

export async function createPenaltyHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const chargeCallId = req.params.chargeId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation de penalite');
    }

    const parsed = createPenaltyRequestSchema.parse(req.body);
    const penalty = await createLatePaymentPenaltyForChargeCall(tenantId, syndicateId, chargeCallId, parsed);
    logger.info('Audit: late penalty created', {
      tenantId,
      syndicateId,
      chargeCallId,
      penaltyId: penalty.id,
      amount: penalty.penaltyAmount,
      actorUserId: req.user?.userId
    });

    res.status(201).json({
      success: true,
      data: penalty
    });
  } catch (error: any) {
    logger.error('Error creating penalty', { error, chargeId: req.params.chargeId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de creation de la penalite'
    });
  }
}

export async function waivePenaltyHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const penaltyId = req.params.penaltyId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la remise de penalite');
    }

    const parsed = waivePenaltySchema.parse(req.body);
    const penalty = await waiveLatePaymentPenaltyByTenant(tenantId, syndicateId, penaltyId, parsed.waivedReason);
    logger.info('Audit: late penalty waived', { tenantId, syndicateId, penaltyId, actorUserId: req.user?.userId });

    res.json({
      success: true,
      data: penalty
    });
  } catch (error: any) {
    logger.error('Error waiving penalty', { error, penaltyId: req.params.penaltyId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de remise de la penalite'
    });
  }
}

export async function createPaymentScheduleHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const chargeCallId = req.params.chargeId;

    if (!tenantId) {
      throw badRequest("TenantId manquant pour la creation d'echeancier");
    }

    const parsed = createScheduleRequestSchema.parse(req.body);
    const schedule = await createPaymentScheduleForChargeCall(tenantId, syndicateId, chargeCallId, parsed);
    logger.info('Audit: payment schedule created', {
      tenantId,
      syndicateId,
      chargeCallId,
      scheduleId: schedule?.id ?? null,
      actorUserId: req.user?.userId
    });

    res.status(201).json({
      success: true,
      data: schedule
    });
  } catch (error: any) {
    logger.error('Error creating payment schedule', { error, chargeId: req.params.chargeId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || "Echec de creation de l'echeancier"
    });
  }
}

export async function listPaymentSchedulesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des echeanciers');
    }

    const schedules = await listPaymentSchedulesBySyndicate(tenantId, syndicateId, {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined
    });

    res.json({
      success: true,
      data: schedules
    });
  } catch (error: any) {
    logger.error('Error listing payment schedules', { error, syndicId: req.params.syndicId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec du listing des echeanciers'
    });
  }
}

export async function getLotOwnerAccountHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const lotId = req.params.lotId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la consultation du compte lot');
    }

    const account = await getOwnerAccountByLot(tenantId, syndicateId, lotId);

    res.json({
      success: true,
      data: account
    });
  } catch (error: any) {
    logger.error('Error getting owner account', { error, lotId: req.params.lotId });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec de recuperation du compte lot'
    });
  }
}

export async function listLotOwnerAccountTransactionsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const lotId = req.params.lotId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des transactions compte lot');
    }

    const parsedRange = ownerAccountStatementQuerySchema.safeParse(req.query ?? {});
    const range = parsedRange.success ? parsedRange.data : {};

    const transactions = await listOwnerAccountTransactionsByLot(tenantId, syndicateId, lotId, {
      range,
      pagination: {
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      }
    });

    res.json({
      success: true,
      data: transactions
    });
  } catch (error: any) {
    logger.error('Error listing owner account transactions', { error, lotId: req.params.lotId, query: req.query });
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Echec de recuperation des transactions compte lot'
    });
  }
}

export async function createLotOwnerAccountAdjustmentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const lotId = req.params.lotId;

    if (!tenantId) {
      throw badRequest("TenantId manquant pour la creation d'ajustement compte lot");
    }

    const parsed = createOwnerAccountAdjustmentSchema.parse(req.body ?? {});
    const transaction = await createOwnerAccountAdjustmentByLot(tenantId, syndicateId, lotId, parsed);

    res.status(201).json({
      success: true,
      data: transaction
    });
  } catch (error: any) {
    logger.error('Error creating owner account adjustment', { error, lotId: req.params.lotId, body: req.body });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || "Echec de creation de l'ajustement compte lot"
    });
  }
}

export async function downloadLotOwnerAccountStatementHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const lotId = req.params.lotId;

    if (!tenantId) {
      throw badRequest('TenantId manquant pour la generation du releve compte lot');
    }

    const parsedRange = ownerAccountStatementQuerySchema.parse(req.query ?? {});
    const statement = await getOwnerAccountStatementByLot(tenantId, syndicateId, lotId, parsedRange);

    const ownerName =
      [statement.account.contact?.firstName ?? '', statement.account.contact?.lastName ?? ''].join(' ').trim() ||
      statement.account.contact?.legalName ||
      'Proprietaire';

    const pdfBuffer = await buildOwnerAccountStatementPdf({
      syndicateName: statement.account.syndicate?.name || 'Copropriete',
      lotNumber: statement.account.lot?.lotNumber || lotId,
      ownerName,
      currency: statement.account.currency || 'XOF',
      openingBalance: statement.summary.openingBalance,
      closingBalance: statement.summary.closingBalance,
      transactions: statement.transactions.map(tx => ({
        transactionDate: tx.transactionDate,
        type: tx.type,
        label: tx.label,
        debit: tx.debit ? Number(tx.debit) : null,
        credit: tx.credit ? Number(tx.credit) : null,
        balanceAfter: Number(tx.balanceAfter)
      }))
    });

    const filename = `releve-compte-lot-${lotId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(pdfBuffer);
  } catch (error: any) {
    logger.error('Error generating owner account statement pdf', { error, lotId: req.params.lotId, query: req.query });
    res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Echec de generation du releve compte lot'
    });
  }
}

export async function listLotOwnerProfilesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des profils proprietaires');
    }
    const lotId = typeof req.query.lotId === 'string' ? req.query.lotId : undefined;
    const profiles = await listLotOwnerProfilesBySyndicate(tenantId, syndicateId, lotId);
    res.json({ success: true, data: profiles });
  } catch (error: any) {
    logger.error('Error listing owner profiles', { error, syndicId: req.params.syndicId, query: req.query });
    res
      .status(error.status || 500)
      .json({ success: false, error: error.message || 'Echec du listing des profils proprietaires' });
  }
}

export async function createLotOwnerProfileHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation du profil proprietaire');
    }
    const parsed = createLotOwnerProfileSchema.parse(req.body ?? {});
    const profile = await createLotOwnerProfileBySyndicate(tenantId, syndicateId, parsed);
    logger.info('Audit: owner profile created', {
      tenantId,
      syndicateId,
      profileId: profile.id,
      actorUserId: req.user?.userId
    });
    res.status(201).json({ success: true, data: profile });
  } catch (error: any) {
    logger.error('Error creating owner profile', { error, syndicId: req.params.syndicId, body: req.body });
    res
      .status(error.status || 400)
      .json({ success: false, error: error.message || 'Echec de creation du profil proprietaire' });
  }
}

export async function updateLotOwnerProfileHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const profileId = req.params.ownerProfileId;
    if (!tenantId) {
      throw badRequest('TenantId manquant pour la mise a jour du profil proprietaire');
    }
    const parsed = updateLotOwnerProfileSchema.parse(req.body ?? {});
    const profile = await updateLotOwnerProfileBySyndicate(tenantId, syndicateId, profileId, parsed);
    logger.info('Audit: owner profile updated', { tenantId, syndicateId, profileId, actorUserId: req.user?.userId });
    res.json({ success: true, data: profile });
  } catch (error: any) {
    logger.error('Error updating owner profile', {
      error,
      syndicId: req.params.syndicId,
      ownerProfileId: req.params.ownerProfileId,
      body: req.body
    });
    res
      .status(error.status || 400)
      .json({ success: false, error: error.message || 'Echec de mise a jour du profil proprietaire' });
  }
}

export async function listLotTenantProfilesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des profils locataires');
    }
    const lotId = typeof req.query.lotId === 'string' ? req.query.lotId : undefined;
    const profiles = await listLotTenantProfilesBySyndicate(tenantId, syndicateId, lotId);
    res.json({ success: true, data: profiles });
  } catch (error: any) {
    logger.error('Error listing tenant profiles', { error, syndicId: req.params.syndicId, query: req.query });
    res
      .status(error.status || 500)
      .json({ success: false, error: error.message || 'Echec du listing des profils locataires' });
  }
}

export async function createLotTenantProfileHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation du profil locataire');
    }
    const parsed = createLotTenantProfileSchema.parse(req.body ?? {});
    const profile = await createLotTenantProfileBySyndicate(tenantId, syndicateId, parsed);
    logger.info('Audit: tenant profile created', {
      tenantId,
      syndicateId,
      profileId: profile.id,
      actorUserId: req.user?.userId
    });
    res.status(201).json({ success: true, data: profile });
  } catch (error: any) {
    logger.error('Error creating tenant profile', { error, syndicId: req.params.syndicId, body: req.body });
    res
      .status(error.status || 400)
      .json({ success: false, error: error.message || 'Echec de creation du profil locataire' });
  }
}

export async function updateLotTenantProfileHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const profileId = req.params.tenantProfileId;
    if (!tenantId) {
      throw badRequest('TenantId manquant pour la mise a jour du profil locataire');
    }
    const parsed = updateLotTenantProfileSchema.parse(req.body ?? {});
    const profile = await updateLotTenantProfileBySyndicate(tenantId, syndicateId, profileId, parsed);
    logger.info('Audit: tenant profile updated', { tenantId, syndicateId, profileId, actorUserId: req.user?.userId });
    res.json({ success: true, data: profile });
  } catch (error: any) {
    logger.error('Error updating tenant profile', {
      error,
      syndicId: req.params.syndicId,
      tenantProfileId: req.params.tenantProfileId,
      body: req.body
    });
    res
      .status(error.status || 400)
      .json({ success: false, error: error.message || 'Echec de mise a jour du profil locataire' });
  }
}

export async function listIncidentsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des incidents');
    }
    const incidents = await listIncidentsBySyndicate(tenantId, syndicateId);
    res.json({ success: true, data: incidents });
  } catch (error: any) {
    logger.error('Error listing incidents', { error, syndicId: req.params.syndicId, query: req.query });
    res.status(error.status || 500).json({ success: false, error: error.message || 'Echec du listing des incidents' });
  }
}

export async function linkIncidentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    if (!tenantId) {
      throw badRequest("TenantId manquant pour la liaison d'incident maintenance");
    }
    const parsed = linkMaintenanceRequestSchema.parse(req.body ?? {});
    const link = await linkMaintenanceRequestBySyndicate(tenantId, syndicateId, parsed);
    res.status(201).json({ success: true, data: link });
  } catch (error: any) {
    logger.error('Error linking maintenance request to syndic', {
      error,
      syndicId: req.params.syndicId,
      body: req.body
    });
    res
      .status(error.status || 400)
      .json({ success: false, error: error.message || "Echec de liaison de l'incident maintenance" });
  }
}

export async function createIncidentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    if (!tenantId) {
      throw badRequest("TenantId manquant pour la creation de l'incident");
    }
    const parsed = createIncidentSchema.parse({
      ...req.body,
      syndicateId
    });
    const incident = await createIncidentBySyndicate(tenantId, syndicateId, parsed);
    logger.info('Audit: incident created', {
      tenantId,
      syndicateId,
      incidentId: incident.id,
      actorUserId: req.user?.userId
    });
    res.status(201).json({ success: true, data: incident });
  } catch (error: any) {
    logger.error('Error creating incident', { error, syndicId: req.params.syndicId, body: req.body });
    res.status(error.status || 400).json({ success: false, error: error.message || "Echec de creation de l'incident" });
  }
}

export async function updateIncidentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const incidentId = req.params.incidentId;
    if (!tenantId) {
      throw badRequest("TenantId manquant pour la mise a jour de l'incident");
    }
    const parsed = updateIncidentSchema.parse(req.body ?? {});
    const incident = await updateIncidentBySyndicate(tenantId, syndicateId, incidentId, parsed);
    logger.info('Audit: incident updated', { tenantId, syndicateId, incidentId, actorUserId: req.user?.userId });
    res.json({ success: true, data: incident });
  } catch (error: any) {
    logger.error('Error updating incident', {
      error,
      syndicId: req.params.syndicId,
      incidentId: req.params.incidentId,
      body: req.body
    });
    res
      .status(error.status || 400)
      .json({ success: false, error: error.message || "Echec de mise a jour de l'incident" });
  }
}

export async function addIncidentImputationHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const incidentId = req.params.incidentId;
    if (!tenantId) {
      throw badRequest("TenantId manquant pour l'imputation d'incident");
    }
    const parsed = createIncidentImputationSchema.parse({
      ...req.body,
      incidentId
    });
    const imputation = await addIncidentImputationBySyndicate(tenantId, syndicateId, incidentId, parsed);
    logger.info('Audit: incident imputation created', {
      tenantId,
      syndicateId,
      incidentId,
      imputationId: imputation.id,
      actorUserId: req.user?.userId
    });
    res.status(201).json({ success: true, data: imputation });
  } catch (error: any) {
    logger.error('Error creating incident imputation', {
      error,
      syndicId: req.params.syndicId,
      incidentId: req.params.incidentId,
      body: req.body
    });
    res.status(error.status || 400).json({ success: false, error: error.message || "Echec d'imputation d'incident" });
  }
}

export async function listChartOfAccountsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des comptes comptables');
    }

    const onlyActive = req.query.onlyActive !== 'false';
    const accounts = await listChartOfAccountsBySyndicate(tenantId, syndicateId, onlyActive);
    res.json({ success: true, data: accounts });
  } catch (error: any) {
    logger.error('Error listing chart of accounts', { error, syndicId: req.params.syndicId });
    res
      .status(error.status || 500)
      .json({ success: false, error: error.message || 'Echec du listing des comptes comptables' });
  }
}

export async function createChartOfAccountHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation du compte comptable');
    }

    const parsed = createChartOfAccountSchema.parse(req.body ?? {});
    const account = await createChartOfAccountBySyndicate(tenantId, syndicateId, parsed);
    res.status(201).json({ success: true, data: account });
  } catch (error: any) {
    logger.error('Error creating chart of account', { error, syndicId: req.params.syndicId, body: req.body });
    res
      .status(error.status || 400)
      .json({ success: false, error: error.message || 'Echec de creation du compte comptable' });
  }
}

export async function listAccountingJournalsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des journaux comptables');
    }

    const fiscalYear = req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined;
    const journals = await listAccountingJournalsBySyndicate(tenantId, syndicateId, fiscalYear);
    res.json({ success: true, data: journals });
  } catch (error: any) {
    logger.error('Error listing accounting journals', { error, syndicId: req.params.syndicId, query: req.query });
    res
      .status(error.status || 500)
      .json({ success: false, error: error.message || 'Echec du listing des journaux comptables' });
  }
}

export async function createAccountingJournalHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    if (!tenantId) {
      throw badRequest('TenantId manquant pour la creation du journal comptable');
    }

    const parsed = createAccountingJournalSchema.parse(req.body ?? {});
    const journal = await createAccountingJournalBySyndicate(tenantId, syndicateId, parsed);
    res.status(201).json({ success: true, data: journal });
  } catch (error: any) {
    logger.error('Error creating accounting journal', { error, syndicId: req.params.syndicId, body: req.body });
    res
      .status(error.status || 400)
      .json({ success: false, error: error.message || 'Echec de creation du journal comptable' });
  }
}

export async function listAccountingEntriesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    if (!tenantId) {
      throw badRequest('TenantId manquant pour la liste des ecritures comptables');
    }

    const parsed = accountingEntriesQuerySchema.parse(req.query ?? {});
    const entries = await listJournalEntriesBySyndicate(tenantId, syndicateId, {
      journalId: parsed.journalId,
      range: { from: parsed.from, to: parsed.to },
      pagination: { page: parsed.page, limit: parsed.limit }
    });

    res.json({ success: true, data: entries });
  } catch (error: any) {
    logger.error('Error listing accounting entries', { error, syndicId: req.params.syndicId, query: req.query });
    res
      .status(error.status || 500)
      .json({ success: false, error: error.message || 'Echec du listing des ecritures comptables' });
  }
}

export async function createAccountingEntryHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    if (!tenantId) {
      throw badRequest("TenantId manquant pour la creation de l'ecriture comptable");
    }

    const parsed = createJournalEntrySchema.parse(req.body ?? {});
    const entry = await createJournalEntryBySyndicate(tenantId, syndicateId, parsed as any);
    logger.info('Audit: accounting entry created', {
      tenantId,
      syndicateId,
      entryId: entry?.id,
      actorUserId: req.user?.userId
    });

    res.status(201).json({ success: true, data: entry });
  } catch (error: any) {
    logger.error('Error creating accounting entry', { error, syndicId: req.params.syndicId, body: req.body });
    res
      .status(error.status || 400)
      .json({ success: false, error: error.message || "Echec de creation de l'ecriture comptable" });
  }
}

export async function lockAccountingEntryHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    const entryId = req.params.entryId;
    if (!tenantId) {
      throw badRequest("TenantId manquant pour le verrouillage de l'ecriture");
    }

    lockJournalEntrySchema.parse(req.body ?? { lock: true });
    const entry = await lockJournalEntryBySyndicate(tenantId, syndicateId, entryId);
    logger.info('Audit: accounting entry locked', { tenantId, syndicateId, entryId, actorUserId: req.user?.userId });
    res.json({ success: true, data: entry });
  } catch (error: any) {
    logger.error('Error locking accounting entry', {
      error,
      syndicId: req.params.syndicId,
      entryId: req.params.entryId
    });
    res
      .status(error.status || 400)
      .json({ success: false, error: error.message || "Echec de verrouillage de l'ecriture" });
  }
}

export async function getTrialBalanceHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    if (!tenantId) {
      throw badRequest('TenantId manquant pour la balance comptable');
    }
    const parsed = accountingRangeQuerySchema.parse(req.query ?? {});
    const balance = await getTrialBalanceBySyndicate(tenantId, syndicateId, {
      from: parsed.from,
      to: parsed.to
    });
    res.json({ success: true, data: balance });
  } catch (error: any) {
    logger.error('Error computing trial balance', { error, syndicId: req.params.syndicId, query: req.query });
    res
      .status(error.status || 400)
      .json({ success: false, error: error.message || 'Echec de generation de la balance comptable' });
  }
}

export async function getGeneralLedgerHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const syndicateId = req.params.syndicId;
    if (!tenantId) {
      throw badRequest('TenantId manquant pour le grand livre');
    }
    const parsed = accountingRangeQuerySchema.parse(req.query ?? {});
    const ledger = await getGeneralLedgerBySyndicate(tenantId, syndicateId, {
      accountId: parsed.accountId,
      range: { from: parsed.from, to: parsed.to },
      pagination: { page: parsed.page, limit: parsed.limit }
    });
    res.json({ success: true, data: ledger });
  } catch (error: any) {
    logger.error('Error listing general ledger', { error, syndicId: req.params.syndicId, query: req.query });
    res
      .status(error.status || 400)
      .json({ success: false, error: error.message || 'Echec de recuperation du grand livre' });
  }
}
