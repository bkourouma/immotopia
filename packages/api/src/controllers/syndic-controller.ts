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
  deleteEmptySyndicateByTenant,
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
  listMeetingProxiesByTenant,
  createMeetingProxyByTenant,
  deleteMeetingProxyByTenant,
  addAgendaItemToMeeting,
  updateAgendaItemByTenant,
  deleteAgendaItemByTenant,
  listServiceProvidersBySyndicate,
  createServiceProvider,
  updateServiceProviderByTenant,
  deleteServiceProviderByTenant,
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
  addIncidentImputationBySyndicate,
  listFundsBySyndicate,
  createSyndicateFundBySyndicate,
  renameSyndicateFundByTenant,
  adjustSyndicateFundBalanceByTenant
} from '../lib/syndics/queries';
import {
  paginationQuerySchema,
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
  createMeetingProxySchema,
  createAgendaItemSchema,
  updateAgendaItemSchema,
  createServiceProviderSchema,
  updateServiceProviderSchema,
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
  accountingRangeQuerySchema,
  createSyndicateFundSchema,
  renameSyndicateFundSchema,
  adjustSyndicateFundBalanceSchema
} from '../lib/syndics/schemas';
import { notifyChargeCall, notifyMeetingConvocation } from '../lib/syndics/notifications';
import { deliverReminderNotification } from '../lib/syndics/reminder-delivery';
import { badRequest, notFound } from '../lib/errors';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/error-middleware';
import { buildMeetingMinutesDocx } from '../lib/syndics/minutes-generator';
import { buildOwnerAccountStatementPdf } from '../lib/syndics/owner-account-statement';
import { resolveDocumentBranding } from '../lib/documents/document-branding';
import { toSyndicateResponse } from '../lib/documents/syndicate-branding-view';
import {
  getSyndicateDocumentFileForTenant,
  syndicateDocumentFileUrl,
  syndicateDocumentsDir
} from '../lib/syndics/document-files';

export const listSyndicsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;

  if (!tenantId) {
    throw badRequest('TenantId manquant pour la liste des coproprietes');
  }

  // Ecart recette (lot syndic-ecarts, T1) : `page`/`limit` valides ici (400
  // sur une valeur non entiere, < 1 ou un `limit` > 100) plutot que
  // coerces en silence vers la valeur par defaut.
  const { page, limit } = paginationQuerySchema.parse(req.query);
  const { items, total, totalPages } = await listSyndicatesByTenant(tenantId, { page, limit });

  res.json({
    success: true,
    data: items.map(toSyndicateResponse),
    pagination: { page, limit, total, totalPages }
  });
});

export const createSyndicHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;

  if (!tenantId) {
    throw badRequest('TenantId manquant pour la creation de copropriete');
  }

  const parsed = createSyndicateSchema.parse(req.body);
  const syndic = await createSyndicateWithDefaults(tenantId, parsed);

  res.status(201).json({
    success: true,
    data: toSyndicateResponse(syndic)
  });
});

export const getSyndicHandler = asyncHandler(async (req: Request, res: Response) => {
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
    data: toSyndicateResponse(syndic)
  });
});

export const updateSyndicHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicId = req.params.syndicId;

  if (!tenantId) {
    throw badRequest('TenantId manquant pour la mise a jour de copropriete');
  }

  const parsed = updateSyndicateSchema.parse(req.body);
  const syndic = await updateSyndicateByTenant(tenantId, syndicId, parsed);

  res.json({
    success: true,
    data: toSyndicateResponse(syndic)
  });
});

export const deleteSyndicHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicId = req.params.syndicId;

  if (!tenantId) {
    throw badRequest('TenantId manquant pour la suppression de copropriete');
  }

  const syndic = await deleteEmptySyndicateByTenant(tenantId, syndicId);

  res.json({
    success: true,
    message: 'Copropriete supprimee',
    data: toSyndicateResponse(syndic)
  });
});

export const listSyndicLotsHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const createSyndicLotHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const importSyndicLotsFromPropertiesHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const updateSyndicLotHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const addLotTenantHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const deactivateLotTenantAssignmentHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const listChargeCallsHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const createChargeCallHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;

  if (!tenantId) {
    throw badRequest('TenantId manquant pour la creation d appel de charges');
  }

  const parsed = createChargeCallSchema.parse({
    ...req.body,
    syndicateId
  });

  const result = await createChargeCallAndUpdateStatus(tenantId, { ...parsed, actorUserId: req.user?.userId ?? null });

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
});

export const getChargeCallHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const payChargeCallHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const chargeCallId = req.params.chargeId;

  if (!tenantId) {
    throw badRequest('TenantId manquant pour le paiement d appel de charges');
  }

  const parsed = createChargePaymentSchema.parse({
    ...req.body,
    chargeCallId
  });

  // Lot S2 : l'appel doit aussi appartenir a la copropriete du chemin ; le
  // trop-percu devient une avance du lot (voir recordChargePaymentWithStatusUpdate).
  const payment = await recordChargePaymentWithStatusUpdate(tenantId, {
    ...parsed,
    syndicateId: req.params.syndicId,
    actorUserId: req.user?.userId ?? null
  });

  res.status(201).json({
    success: true,
    data: payment
  });
});

export const listChargeCallBatchesHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const createChargeCallBatchHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const listBudgetsHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const createBudgetHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const updateBudgetHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const recomputeBudgetAllocationsHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const generateBudgetChargeCallsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  const budgetId = req.params.budgetId;

  if (!tenantId) {
    throw badRequest("TenantId manquant pour la generation d'appels depuis budget");
  }

  const parsed = generateBudgetChargeCallsSchema.parse(req.body ?? {});
  const batch = await generateChargeCallsFromBudget(tenantId, syndicateId, budgetId, {
    ...parsed,
    actorUserId: req.user?.userId ?? null
  });

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
});

export const listMeetingsHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const createMeetingHandler = asyncHandler(async (req: Request, res: Response) => {
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
    ? req.body.resolutions.map((resolution: any) => createResolutionSchema.omit({ meetingId: true }).parse(resolution))
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
});

export const updateMeetingHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const getMeetingHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const addResolutionHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const addAgendaItemHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const updateAgendaItemHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const deleteAgendaItemHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const castVoteHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const listMeetingProxiesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  const meetingId = req.params.meetingId;

  if (!tenantId) {
    throw badRequest('TenantId manquant pour la liste des pouvoirs');
  }

  const proxies = await listMeetingProxiesByTenant(tenantId, syndicateId, meetingId);

  res.json({
    success: true,
    data: proxies
  });
});

export const createMeetingProxyHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  const meetingId = req.params.meetingId;

  if (!tenantId) {
    throw badRequest('TenantId manquant pour la creation du pouvoir');
  }

  const parsed = createMeetingProxySchema.parse({
    ...req.body,
    meetingId
  });

  const proxy = await createMeetingProxyByTenant(tenantId, syndicateId, parsed);

  res.status(201).json({
    success: true,
    data: proxy
  });
});

export const deleteMeetingProxyHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  const meetingId = req.params.meetingId;
  const proxyId = req.params.proxyId;

  if (!tenantId) {
    throw badRequest('TenantId manquant pour le retrait du pouvoir');
  }

  const deleted = await deleteMeetingProxyByTenant(tenantId, syndicateId, meetingId, proxyId);

  res.json({
    success: true,
    data: deleted
  });
});

export const generateMeetingMinutesHandler = asyncHandler(async (req: Request, res: Response) => {
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

  const branding = await resolveDocumentBranding(tenantId, syndicateId);
  const buffer = await buildMeetingMinutesDocx(meeting, tenantId, branding);
  const filename = `compte-rendu-${meetingId}.docx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Content-Length', buffer.length.toString());
  res.send(buffer);
});

export const listProvidersHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const createProviderHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;

  if (!tenantId) {
    throw badRequest('TenantId manquant pour la creation de prestataire');
  }

  const parsed = createServiceProviderSchema.parse(req.body);
  const provider = await createServiceProvider(tenantId, parsed);

  res.status(201).json({
    success: true,
    data: provider
  });
});

export const updateProviderHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const providerId = req.params.providerId;

  if (!tenantId) {
    throw badRequest('TenantId manquant pour la mise a jour du prestataire');
  }

  const parsed = updateServiceProviderSchema.parse(req.body);
  const provider = await updateServiceProviderByTenant(tenantId, providerId, parsed);

  res.json({
    success: true,
    data: provider
  });
});

export const deleteProviderHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const providerId = req.params.providerId;

  if (!tenantId) {
    throw badRequest('TenantId manquant pour la suppression du prestataire');
  }

  const provider = await deleteServiceProviderByTenant(tenantId, providerId);

  res.json({
    success: true,
    message: 'Prestataire supprime',
    data: provider
  });
});

export const listContractsHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const linkContractHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const createContractHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const getContractHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const updateContractHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const deleteContractHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const listDocumentsHandler = asyncHandler(async (req: Request, res: Response) => {
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
  const allowedTypes = new Set(['REGULATION', 'GENERAL_MEETING_MINUTES', 'DIAGNOSTIC', 'INSURANCE', 'BUDGET', 'OTHER']);
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
});

export const createDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
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
    // Racine de reference (`UPLOADS_DIR`, sinon `<monorepo>/uploads`). Le
    // calcul fait ici ne remontait que d'un niveau et ecrivait dans
    // `packages/uploads` : ces fichiers-la restent lus, voir
    // lib/syndics/document-files.ts. Le fichier n'est jamais servi en
    // statique, seulement par `downloadDocumentHandler` ci-dessous.
    const uploadDir = syndicateDocumentsDir(syndicateId);
    await fs.mkdir(uploadDir, { recursive: true });

    const extension = path.extname(req.file.originalname) || '';
    const safeType = parsed.type.toLowerCase();
    const fileName = `${safeType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
    const filePath = path.join(uploadDir, fileName);

    await fs.writeFile(filePath, req.file.buffer);
    fileUrl = syndicateDocumentFileUrl(syndicateId, fileName);
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
});

/**
 * Telechargement d'un document de copropriete, cote gestion. Le document doit
 * appartenir a une copropriete de l'agence ; sinon 404, comme un document
 * inexistant. Remplace l'ouverture directe de `/uploads/syndics/...`, que le
 * service statique refuse desormais.
 */
export const downloadDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) {
    throw badRequest('TenantId manquant pour le telechargement de document');
  }

  const file = await getSyndicateDocumentFileForTenant(tenantId, req.params.syndicId, req.params.documentId);

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.setHeader('Content-Length', file.buffer.length.toString());
  res.send(file.buffer);
});

export const getFinanceSummaryHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const getOverdueDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const listRemindersHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const createManualReminderHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  const chargeCallId = req.params.chargeId;

  if (!tenantId) {
    throw badRequest('TenantId manquant pour la creation de relance');
  }

  const parsed = createManualReminderSchema.parse(req.body ?? {});
  const reminder = await createManualReminderForChargeCall(tenantId, syndicateId, chargeCallId, parsed);
  // Un échec d'envoi n'annule pas la relance : elle passe à FAILED et la réponse le dit.
  const { notificationFailed } = await deliverReminderNotification(reminder.id, tenantId);

  res.status(201).json({
    success: true,
    data: notificationFailed ? { ...reminder, status: 'FAILED' } : reminder,
    notificationFailed
  });
});

export const runReminderBatchHandler = asyncHandler(async (req: Request, res: Response) => {
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
  let notificationsFailed = 0;
  for (const reminderId of result.createdReminderIds) {
    const { notificationFailed } = await deliverReminderNotification(reminderId, tenantId);
    if (notificationFailed) notificationsFailed += 1;
  }

  res.json({
    success: true,
    data: { ...result, notificationsFailed }
  });
});

export const listPenaltiesHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const createPenaltyHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const waivePenaltyHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const createPaymentScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const listPaymentSchedulesHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const getLotOwnerAccountHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const listLotOwnerAccountTransactionsHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const createLotOwnerAccountAdjustmentHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const downloadLotOwnerAccountStatementHandler = asyncHandler(async (req: Request, res: Response) => {
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
    'Propriétaire';

  // Lot S1 : en-tete et signature du mandant de la copropriete, sinon de l'agence.
  const branding = await resolveDocumentBranding(tenantId, syndicateId);
  const pdfBuffer = await buildOwnerAccountStatementPdf(
    {
      syndicateName: statement.account.syndicate?.name || 'Copropriété',
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
    },
    branding
  );

  const filename = `releve-compte-lot-${lotId}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(pdfBuffer);
});

export const listLotOwnerProfilesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  if (!tenantId) {
    throw badRequest('TenantId manquant pour la liste des profils proprietaires');
  }
  const lotId = typeof req.query.lotId === 'string' ? req.query.lotId : undefined;
  const profiles = await listLotOwnerProfilesBySyndicate(tenantId, syndicateId, lotId);
  res.json({ success: true, data: profiles });
});

export const createLotOwnerProfileHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const updateLotOwnerProfileHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const listLotTenantProfilesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  if (!tenantId) {
    throw badRequest('TenantId manquant pour la liste des profils locataires');
  }
  const lotId = typeof req.query.lotId === 'string' ? req.query.lotId : undefined;
  const profiles = await listLotTenantProfilesBySyndicate(tenantId, syndicateId, lotId);
  res.json({ success: true, data: profiles });
});

export const createLotTenantProfileHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const updateLotTenantProfileHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const listIncidentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  if (!tenantId) {
    throw badRequest('TenantId manquant pour la liste des incidents');
  }
  const incidents = await listIncidentsBySyndicate(tenantId, syndicateId);
  res.json({ success: true, data: incidents });
});

export const linkIncidentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  if (!tenantId) {
    throw badRequest("TenantId manquant pour la liaison d'incident maintenance");
  }
  const parsed = linkMaintenanceRequestSchema.parse(req.body ?? {});
  const link = await linkMaintenanceRequestBySyndicate(tenantId, syndicateId, parsed);
  res.status(201).json({ success: true, data: link });
});

export const createIncidentHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const updateIncidentHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const addIncidentImputationHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const listChartOfAccountsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  if (!tenantId) {
    throw badRequest('TenantId manquant pour la liste des comptes comptables');
  }

  const onlyActive = req.query.onlyActive !== 'false';
  const accounts = await listChartOfAccountsBySyndicate(tenantId, syndicateId, onlyActive);
  res.json({ success: true, data: accounts });
});

export const createChartOfAccountHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  if (!tenantId) {
    throw badRequest('TenantId manquant pour la creation du compte comptable');
  }

  const parsed = createChartOfAccountSchema.parse(req.body ?? {});
  const account = await createChartOfAccountBySyndicate(tenantId, syndicateId, parsed);
  res.status(201).json({ success: true, data: account });
});

export const listAccountingJournalsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  if (!tenantId) {
    throw badRequest('TenantId manquant pour la liste des journaux comptables');
  }

  const fiscalYear = req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined;
  const journals = await listAccountingJournalsBySyndicate(tenantId, syndicateId, fiscalYear);
  res.json({ success: true, data: journals });
});

export const createAccountingJournalHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  if (!tenantId) {
    throw badRequest('TenantId manquant pour la creation du journal comptable');
  }

  const parsed = createAccountingJournalSchema.parse(req.body ?? {});
  const journal = await createAccountingJournalBySyndicate(tenantId, syndicateId, parsed);
  res.status(201).json({ success: true, data: journal });
});

export const listAccountingEntriesHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const createAccountingEntryHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const lockAccountingEntryHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const getTrialBalanceHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const getGeneralLedgerHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

export const listFundsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  if (!tenantId) {
    throw badRequest('TenantId manquant pour la liste des fonds');
  }
  const funds = await listFundsBySyndicate(tenantId, syndicateId);
  res.json({ success: true, data: funds });
});

export const createFundHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  if (!tenantId) {
    throw badRequest('TenantId manquant pour la creation du fonds');
  }
  const parsed = createSyndicateFundSchema.parse(req.body ?? {});
  const fund = await createSyndicateFundBySyndicate(tenantId, syndicateId, parsed, req.user?.userId);
  res.status(201).json({ success: true, data: fund });
});

export const renameFundHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  const fundId = req.params.fundId;
  if (!tenantId) {
    throw badRequest('TenantId manquant pour le renommage du fonds');
  }
  const parsed = renameSyndicateFundSchema.parse(req.body ?? {});
  const fund = await renameSyndicateFundByTenant(tenantId, syndicateId, fundId, parsed, req.user?.userId);
  res.json({ success: true, data: fund });
});

export const adjustFundBalanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const syndicateId = req.params.syndicId;
  const fundId = req.params.fundId;
  if (!tenantId) {
    throw badRequest("TenantId manquant pour l'ajustement du fonds");
  }
  const parsed = adjustSyndicateFundBalanceSchema.parse(req.body ?? {});
  const fund = await adjustSyndicateFundBalanceByTenant(tenantId, syndicateId, fundId, parsed, req.user?.userId);
  res.json({ success: true, data: fund });
});
