/**
 * Générateur d'historique du module SYNDIC (MODULE_SYNDIC) pour une agence de
 * test du staging.
 *
 * - profil `6m` : 1 copropriété de 12 lots, ~2 trimestres d'appels, 1 AG ;
 * - profil `3y` : 3 copropriétés (12, 30 et 50 lots), ~12 trimestres, 3 AG
 *   annuelles + 1 AGE travaux chacune, budgets qui évoluent de 6 % par an,
 *   impayés chroniques, fonds de travaux, changement de gardien.
 *
 * Les lignes sont calculées en mémoire par `syndic-plan.ts` (pur, testable sans
 * base), puis écrites ici copropriété par copropriété, dans une transaction.
 *
 * Idempotent : si l'agence porte déjà une copropriété, on ne touche à rien.
 * Aucun envoi sortant (les relances sont des traces historiques) ; aucun
 * fichier écrit (pas de PDF ni de pièce jointe : `UPLOADS_DIR` n'est pas utilisé).
 */
import type { PlanInput } from './syndic-plan';
import { buildCoproPlan, type CoproPlan, type ProviderRow } from './syndic-plan';
import { coprosForProfile } from './syndic-data';
import type { HistoryContext, HistorySeeder } from './types';

const TX_OPTIONS = { maxWait: 60_000, timeout: 10 * 60_000 } as const;

export const seedSyndicHistory: HistorySeeder = async (ctx: HistoryContext): Promise<void> => {
  const { prisma, tenantId, log } = ctx;

  const existing = await prisma.syndicate.count({ where: { tenantId } });
  if (existing > 0) {
    log(`syndic : ${existing} copropriété(s) déjà présente(s), rien à faire`);
    return;
  }

  const providers = new Map<string, ProviderRow>();
  const defs = coprosForProfile(ctx.profile);
  // Plans calculés d'abord (pur) : une incohérence lève avant toute écriture.
  const plans: CoproPlan[] = defs.map((def, index) => {
    const input: PlanInput = {
      def,
      index,
      tenantId,
      adminUserId: ctx.adminUserId,
      profile: ctx.profile,
      start: ctx.start,
      end: ctx.end,
      rng: ctx.rng,
      providers
    };
    return buildCoproPlan(input);
  });

  // Prestataires du tenant : réutilise un prestataire de même nom s'il existe.
  const providerIds = new Map<string, string>();
  for (const row of providers.values()) {
    const found = await prisma.serviceProvider.findFirst({
      where: { tenantId, name: row.name },
      select: { id: true }
    });
    if (found) providerIds.set(row.id, found.id);
    else
      await prisma.serviceProvider.create({
        data: {
          id: row.id,
          tenantId,
          name: row.name,
          specialty: row.specialty,
          email: row.email,
          phone: row.phone
        }
      });
  }
  const resolveProvider = <T extends { providerId?: string | null }>(r: T): T =>
    r.providerId && providerIds.has(r.providerId) ? { ...r, providerId: providerIds.get(r.providerId)! } : r;

  for (const plan of plans) {
    await prisma.$transaction(async tx => {
      await tx.crmContact.createMany({ data: plan.contacts });
      await tx.crmContactRole.createMany({ data: plan.roles });
      await tx.syndicate.create({ data: plan.syndicate });
      await tx.syndicateLot.createMany({ data: plan.lots });
      await tx.lotOwnerProfile.createMany({ data: plan.ownerProfiles });
      await tx.ownerAccount.createMany({ data: plan.ownerAccounts });
      await tx.syndicateFund.createMany({ data: plan.funds });

      await tx.generalMeeting.createMany({ data: plan.meetings });
      await tx.gMAgendaItem.createMany({ data: plan.agendaItems });
      await tx.gMResolution.createMany({ data: plan.resolutions });
      await tx.gMVote.createMany({ data: plan.votes });
      await tx.gMProxy.createMany({ data: plan.proxies });

      await tx.syndicateBudget.createMany({ data: plan.budgets });
      await tx.chartOfAccount.createMany({ data: plan.accounts.slice(0, plan.accountParentCount) });
      await tx.chartOfAccount.createMany({ data: plan.accounts.slice(plan.accountParentCount) });
      await tx.budgetLineItem.createMany({ data: plan.budgetLines });
      await tx.budgetAllocation.createMany({ data: plan.budgetAllocations });

      await tx.chargeCallBatch.createMany({ data: plan.batches });
      await tx.chargeCall.createMany({ data: plan.calls });
      await tx.chargePayment.createMany({ data: plan.payments });
      await tx.chargePaymentAllocation.createMany({ data: plan.allocations });
      await tx.paymentReminder.createMany({ data: plan.reminders });
      await tx.paymentSchedule.createMany({ data: plan.schedules });
      await tx.paymentScheduleInstalment.createMany({ data: plan.instalments });
      await tx.ownerAccountTransaction.createMany({ data: plan.ownerTransactions });
      await tx.reminderConfig.createMany({ data: plan.reminderConfigs });
      await tx.syndicPaymentMethod.createMany({ data: plan.paymentMethods });

      await tx.accountingJournal.createMany({ data: plan.journals });
      await tx.journalEntry.createMany({ data: plan.entries });
      await tx.journalEntryLine.createMany({ data: plan.entryLines });
      // pénalités après leurs écritures (journalEntryId)
      await tx.latePaymentPenalty.createMany({ data: plan.penalties });

      await tx.maintenanceContract.createMany({ data: plan.contracts.map(resolveProvider) });
      await tx.commonAreaAsset.createMany({ data: plan.assets });
      await tx.syndicateIncident.createMany({ data: plan.incidents.map(resolveProvider) });
      await tx.syndicProviderInvoice.createMany({ data: plan.invoices.map(resolveProvider) });
      await tx.syndicProviderPayment.createMany({ data: plan.invoicePayments });
      await tx.syndicateFundMovement.createMany({ data: plan.fundMovements });
    }, TX_OPTIONS);

    const s = plan.stats;
    log(
      `syndic : « ${plan.name} » — ${s.lots} lots, ${s.trimestres} trimestres, ${s.appels} appels, ${s.paiements} paiements, ` +
        `${s.relances} relances, ${s.penalites} pénalités, ${s.assemblees} AG, ${s.factures} factures, ${s.incidents} incidents`
    );
  }
};
