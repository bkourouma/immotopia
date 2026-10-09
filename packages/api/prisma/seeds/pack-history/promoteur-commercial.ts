/**
 * PROMOTEUR : CRM, ventes de lots, biens publiés, visites, maintenance, patrimoine des lots basculés.
 *
 * 2e vague (recette « aucun écran vide » des comptes « 3 ans »). Ne s'exécute que pour le
 * profil 3y ; IDEMPOTENT PAR BLOC ; règles de `types.ts` ; fichiers réels via `seed-files.ts`.
 *
 * Blocs (fichiers annexes) :
 *  - `promoteur-commercial-biens.ts`       lots mis en commercialisation, sociétés de projet, mandats ;
 *  - `promoteur-commercial-crm.ts`         contacts, étiquettes, notes, recherches, affaires, relances, visites ;
 *  - `promoteur-commercial-ventes.ts`      mandats de vente, offres, compromis par jalons, actes, commissions ;
 *  - `promoteur-commercial-maintenance.ts` prestataires et tickets de garantie ;
 *  - `promoteur-commercial-patrimoine.ts`  lots conservés : baux, valorisations, prêts, assurances, travaux.
 *
 * Le volet commercial (biens, CRM, ventes, maintenance) ne s'écrit que sur un tenant
 * qui n'a pas déjà son CRM, ses ventes et ses tickets : l'opérateur intégré les tient
 * déjà de son module Agence, ses blocs se sautent proprement. Le volet patrimoine
 * (lots conservés) a ses propres gardes par bloc.
 */
import { MembershipStatus } from '@prisma/client';
import { runWithTenantContext } from '../../../src/utils/tenant-context';
import { neutralizeOutbound } from './types';
import type { HistoryContext } from './types';
import type { PEnv } from './promoteur-commercial-data';
import {
  loadSites,
  planLots,
  seedProgramBrochures,
  seedProgramProperties,
  seedSpvClients
} from './promoteur-commercial-biens';
import {
  resetContactCounter,
  seedColdAndArchived,
  seedCrmFollowUps,
  seedCrmNotes,
  seedCrmSavedSearches,
  seedCrmTags,
  seedCrmTargetZones,
  seedProfessionalContacts,
  seedProspectDeals
} from './promoteur-commercial-crm';
import { seedPromoteurVentes } from './promoteur-commercial-ventes';
import { seedTemoinVisits } from './promoteur-commercial-temoin';
import { ensureVendorProviders, seedWarrantyMaintenance } from './promoteur-commercial-maintenance';
import { seedConservedPatrimoine } from './promoteur-commercial-patrimoine';
import { seedPropertyImages } from './property-images';

export async function seedPromoteurCommercial(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  const { prisma, tenantId, log } = ctx;

  const sitesCount = await prisma.constructionSite.count({ where: { tenantId } });
  if (sitesCount === 0) {
    log('seedPromoteurCommercial : aucun chantier (module promoteur non peuplé), rien à compléter.');
    return;
  }
  neutralizeOutbound();

  const members = await prisma.membership.findMany({
    where: { tenantId, status: MembershipStatus.ACTIVE },
    select: { userId: true }
  });
  const staff = Array.from(new Set([ctx.adminUserId, ...members.map(m => m.userId)]));
  const env: PEnv = {
    ctx,
    prisma,
    tenantId,
    adminUserId: ctx.adminUserId,
    staff,
    rng: ctx.rng,
    log,
    tag: tenantId.replace(/-/g, '').slice(0, 6)
  };
  const started = Date.now();

  await runWithTenantContext({ tenantId, userId: ctx.adminUserId }, async () => {
    const step = async (label: string, run: () => Promise<void>): Promise<void> => {
      try {
        await run();
      } catch (error) {
        log(
          `seedPromoteurCommercial : bloc « ${label} » en échec — ${error instanceof Error ? error.stack : String(error)}`
        );
      }
    };

    // ── volet commercial : seulement si le tenant n'a pas déjà CRM, ventes et programme.
    const programProps = await prisma.property.count({
      where: { tenantId, internalReference: { in: ['ANG-TEMOIN', 'VAL-TEMOIN'] } }
    });
    const [deals, mandates, tickets] = await Promise.all([
      prisma.crmDeal.count({ where: { tenantId } }),
      prisma.saleMandate.count({ where: { tenantId } }),
      prisma.maintenanceTicket.count({ where: { tenant_id: tenantId } })
    ]);
    if (programProps > 0) {
      log('promoteur-commercial : le programme commercial est déjà en place, volet commercial sauté.');
    } else if (deals > 0 || mandates > 0) {
      log(
        `promoteur-commercial : CRM (${deals} affaires) et ventes (${mandates} mandats) déjà présents — volet commercial sauté.`
      );
    } else {
      resetContactCounter(12_000 + Math.floor(ctx.rng() * 100) * 100);
      await step('commercial', async () => {
        const sites = await loadSites(env);
        const units = await planLots(env, sites);
        const spv = await seedSpvClients(env, Array.from(new Set(units.map(u => u.prog))));
        await seedProgramProperties(env, sites, units, spv);
        await seedProgramBrochures(env);
        const pros = await seedProfessionalContacts(env);
        const cold = await seedColdAndArchived(env);
        const sales = await seedPromoteurVentes(env, sites, units, spv);
        const prospects = await seedProspectDeals(env, units);
        const all = [...pros, ...cold, ...sales.contacts, ...prospects];
        await seedTemoinVisits(
          env,
          all.filter(c => c.kind !== 'PRO' && c.kind !== 'ARCHIVED')
        );
        await seedCrmTags(env, all);
        await seedCrmNotes(env, all, units);
        await seedCrmSavedSearches(env);
        await seedCrmFollowUps(env);
        await seedCrmTargetZones(env, all);
        env.log(`promoteur-commercial : ${all.length} contacts CRM créés.`);
        if (tickets === 0) await seedWarrantyMaintenance(env, units);
      });
    }

    await step('prestataires visibles', () => ensureVendorProviders(env));
    await step('patrimoine des lots conservés', () => seedConservedPatrimoine(env));
    await step('images des biens', () => seedPropertyImages(ctx));
  });
  log(`seedPromoteurCommercial terminé en ${Math.round((Date.now() - started) / 1000)} s.`);
}
