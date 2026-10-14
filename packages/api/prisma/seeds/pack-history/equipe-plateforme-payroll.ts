/**
 * RH et paie des agences à activité de construction (Promoteur, Opérateur intégré) :
 * salariés, notes de salaire mensuelles (36 mois) et règlements, par les VRAIS
 * services du module financier (`lib/finance/salaries.ts`) : compte de tiers de
 * l'employé, écritures 661/422/caisse, imputation au coût du chantier en cours.
 * Seules les dates (qu'aucun service ne laisse choisir) sont ramenées dans le passé.
 *
 * L'écran « Main-d'œuvre > Salaires » n'existe que pour la fonctionnalité
 * CONSTRUCTION (`route-features.ts`) : les autres packs n'ont ni salariés ni paie.
 *
 * Idempotent : une agence qui porte déjà des salariés est laissée telle quelle.
 */
import { MembershipStatus } from '@prisma/client';

import { between } from './types';
import type { HistoryContext } from './types';
import { EMPLOYEE_PLANS, monthDate } from './equipe-plateforme-data';

type SalaryServices = typeof import('../../../src/lib/finance/salaries');
type Tx = Parameters<SalaryServices['createEmployeeTx']>[0];

/** Arrondi aux 500 F CFA : un salaire ne se paie pas au franc près. */
const roundSalary = (value: number): number => Math.round(value / 500) * 500;

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export interface PayrollResult {
  employees: number;
  notes: number;
  payments: number;
}

export async function seedPayroll(ctx: HistoryContext): Promise<PayrollResult> {
  const { prisma, tenantId, adminUserId, start, end, rng, log } = ctx;
  const result: PayrollResult = { employees: 0, notes: 0, payments: 0 };

  const hasConstruction = await prisma.tenantModule.count({
    where: { tenantId, moduleKey: 'MODULE_PROMOTER', enabled: true }
  });
  if (hasConstruction === 0) return result;
  const already = await prisma.employee.count({ where: { tenantId } });
  if (already > 0) {
    log(`paie : ${already} salarié(s) déjà présent(s), non régénérée.`);
    return result;
  }

  const salaries: SalaryServices = await import('../../../src/lib/finance/salaries');

  // Qui saisit et qui valide : le comptable de l'agence saisit, l'administrateur valide.
  const accountant = await prisma.membership.findFirst({
    where: {
      tenantId,
      status: MembershipStatus.ACTIVE,
      user: { userRoles: { some: { tenantId, role: { key: 'TENANT_ACCOUNTANT' } } } }
    },
    select: { userId: true },
    orderBy: { createdAt: 'asc' }
  });
  const creatorId = accountant?.userId ?? adminUserId;
  const validatorId = adminUserId;

  // Chantier en cours (charges imputées à son coût) et poste « Main-d'œuvre ».
  const site = await prisma.constructionSite.findFirst({
    where: { tenantId, status: 'IN_PROGRESS' },
    orderBy: { startDate: 'asc' },
    select: { id: true, startDate: true }
  });
  const labour = await prisma.costCategory.findFirst({
    where: { tenantId, isActive: true, label: { contains: "Main-d'œuvre" } },
    select: { id: true }
  });
  const siteStart = site?.startDate ?? null;

  const currentMonthIndex = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const employees: Array<{ id: string; plan: (typeof EMPLOYEE_PLANS)[number] }> = [];

  for (const plan of EMPLOYEE_PLANS) {
    // eslint-disable-next-line no-await-in-loop -- une transaction par salarié.
    const record = await prisma.$transaction(tx =>
      salaries.createEmployeeTx(tx as unknown as Tx, tenantId, { fullName: plan.fullName, role: plan.role })
    );
    const hiredAt = monthDate(start, plan.hireMonth, 3, 9);
    // eslint-disable-next-line no-await-in-loop -- une écriture par salarié.
    await prisma.employee.update({
      where: { id: record.id },
      data: { createdAt: hiredAt, isActive: plan.leaveMonth === undefined || plan.leaveMonth > currentMonthIndex }
    });
    // eslint-disable-next-line no-await-in-loop -- une écriture par salarié.
    await prisma.thirdPartyAccount.update({ where: { id: record.thirdPartyAccountId }, data: { createdAt: hiredAt } });
    employees.push({ id: record.id, plan });
    result.employees += 1;
  }

  for (let m = 0; m <= currentMonthIndex; m += 1) {
    const periodDate = monthDate(start, m, 1);
    const year = periodDate.getUTCFullYear();
    const monthIndex = periodDate.getUTCMonth();
    const isCurrent = m === currentMonthIndex;
    for (const { id, plan } of employees) {
      if (m < plan.hireMonth || (plan.leaveMonth !== undefined && m >= plan.leaveMonth)) continue;
      const raise = 1 + 0.05 * Math.floor(m / 12);
      const amount = roundSalary(plan.baseSalary * raise);
      const siteActive =
        plan.onSite &&
        site &&
        labour &&
        siteStart !== null &&
        periodDate.getTime() >= siteStart.getTime() - 15 * 86_400_000;
      const noteDay = Math.min(between(rng, 24, 27), lastDayOfMonth(year, monthIndex));
      const createdAt = new Date(Date.UTC(year, monthIndex, noteDay, between(rng, 8, 16)));
      const validatedAt = new Date(createdAt.getTime() + between(rng, 1, 2) * 86_400_000 + 3_600_000);

      // eslint-disable-next-line no-await-in-loop -- séquentiel : une note à la fois, validée aussitôt.
      const note = await prisma.$transaction(async tx => {
        const draft = await salaries.createSalaryNoteTx(tx as unknown as Tx, tenantId, {
          employeeId: id,
          periodYear: year,
          periodMonth: monthIndex + 1,
          amount,
          siteId: siteActive ? site.id : null,
          costCategoryId: siteActive ? labour.id : null,
          createdByUserId: creatorId
        });
        if (isCurrent) return { id: draft.id, journalEntryId: null as string | null };
        const validated = await salaries.validateSalaryNoteTx(tx as unknown as Tx, tenantId, draft.id, validatorId);
        return { id: validated.id, journalEntryId: null as string | null };
      });
      result.notes += 1;
      if (!isCurrent) {
        // eslint-disable-next-line no-await-in-loop -- une écriture par note.
        await prisma.salaryNote.update({ where: { id: note.id }, data: { createdAt, validatedAt } });
      } else {
        // Brouillon du mois en cours : saisi ces derniers jours.
        // eslint-disable-next-line no-await-in-loop -- une écriture par note.
        await prisma.salaryNote.update({
          where: { id: note.id },
          data: { createdAt: new Date(end.getTime() - between(rng, 2, 36) * 3_600_000) }
        });
      }

      if (!isCurrent) {
        const payDay = Math.min(between(rng, 27, 30), lastDayOfMonth(year, monthIndex));
        const paymentDate = new Date(Date.UTC(year, monthIndex, payDay, 12));
        // eslint-disable-next-line no-await-in-loop -- séquentiel : un règlement à la fois, validé aussitôt.
        const payment = await prisma.$transaction(async tx => {
          const draft = await salaries.createSalaryPaymentTx(tx as unknown as Tx, tenantId, {
            employeeId: id,
            paymentDate,
            amount,
            createdByUserId: creatorId
          });
          return salaries.validateSalaryPaymentTx(tx as unknown as Tx, tenantId, draft.id, validatorId);
        });
        // eslint-disable-next-line no-await-in-loop -- une écriture par règlement.
        await prisma.salaryPayment.update({
          where: { id: payment.id },
          data: { createdAt: paymentDate, validatedAt: new Date(paymentDate.getTime() + 2 * 3_600_000) }
        });
        result.payments += 1;
      }
    }
  }

  // Avances sur salaire du mois en cours (le compte de l'employé devient débiteur) et un règlement en brouillon.
  const advances: Array<{ planName: string; amount: number; day: number; validate: boolean }> = [
    { planName: 'Dago Cyrille', amount: 50000, day: 3, validate: true },
    { planName: 'Yéo Lacina', amount: 30000, day: 4, validate: true },
    { planName: 'Koffi Désiré', amount: 40000, day: 5, validate: false }
  ];
  for (const advance of advances) {
    const target = employees.find(e => e.plan.fullName === advance.planName);
    if (!target) continue;
    const paymentDate = new Date(Date.UTC(end.getFullYear(), end.getMonth(), Math.min(advance.day, end.getDate()), 11));
    // eslint-disable-next-line no-await-in-loop -- trois avances.
    const payment = await prisma.$transaction(async tx => {
      const draft = await salaries.createSalaryPaymentTx(tx as unknown as Tx, tenantId, {
        employeeId: target.id,
        paymentDate,
        amount: advance.amount,
        createdByUserId: creatorId
      });
      return advance.validate
        ? salaries.validateSalaryPaymentTx(tx as unknown as Tx, tenantId, draft.id, validatorId)
        : draft;
    });
    // eslint-disable-next-line no-await-in-loop -- trois avances.
    await prisma.salaryPayment.update({
      where: { id: payment.id },
      data: {
        createdAt: paymentDate,
        ...(advance.validate ? { validatedAt: new Date(paymentDate.getTime() + 2 * 3_600_000) } : {})
      }
    });
    result.payments += 1;
  }

  // Horodatage des pièces dérivées (écritures, mouvements de compte) : au jour de la pièce, pas au jour du seed.
  await prisma.$executeRaw`
    UPDATE journal_entries SET created_at = entry_date + interval '10 hours', updated_at = entry_date + interval '10 hours'
    WHERE tenant_id = ${tenantId} AND document_type IN ('SALARY_NOTE', 'SALARY_PAYMENT')`;
  await prisma.$executeRaw`
    UPDATE third_party_movements SET created_at = movement_date + interval '10 hours'
    WHERE tenant_id = ${tenantId} AND source_type IN ('SALARY_NOTE', 'SALARY_PAYMENT')`;

  log(`paie : ${result.employees} salariés, ${result.notes} notes, ${result.payments} règlements.`);
  return result;
}
