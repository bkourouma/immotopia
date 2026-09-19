/**
 * Parcours de bout en bout — lot 4, baux de terrain, contre une vraie base.
 *
 * Même parti pris qu'aux lots 2 et 3, et pour la même raison : les tests
 * unitaires remplacent Prisma par une doublure, et une suite qui simule sa
 * base ne peut rien dire de sa base.
 *
 * Il prouve les cinq critères de sortie du sous-lot
 * (`specs/019-finance-baux-terrain/data-model.md` §7), dont le plus important
 * n'y figurait pas au départ : **le loyer entre bien dans le coût réel du
 * chantier**. C'est ce que le PRD demande, et c'est ce que le schéma gelé à
 * moitié empêchait — la constatation ne pouvait produire aucune imputation.
 *
 * Sécurité, identique aux lots précédents : refus en production, tenant
 * jetable au slug reconnaissable, nettoyage systématique, et jamais de
 * prétention d'avoir nettoyé ce qui ne l'a pas été.
 *
 * Usage :
 *   npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot4.ts
 *   npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot4.ts --nettoyer-restes
 */

import { v4 as uuidv4 } from 'uuid';

import { prisma } from '../src/utils/database';
import { createConstructionSite, listCostCategories, getSiteDetail } from '../src/lib/finance/sites';
import { sumSiteActualCost } from '../src/lib/finance/site-cost';
import {
  createLandLeaseTx,
  attachSiteToLandLeaseTx,
  getLandLease,
  createLandLeasePaymentTx,
  validateLandLeasePaymentTx,
  recordLandLeaseAccrualTx,
  listLandLeaseAccruals
} from '../src/lib/finance/land-leases';

const RUN_ID = uuidv4().slice(0, 8);
const TENANT_SLUG = `e2e-finance-lot4-jetable-${RUN_ID}`;

/** Un montant qui ne tombe PAS juste sur douze : c'est tout l'intérêt. */
const LOYER_ANNUEL = 1_000_000;

const constats: Array<{ intitule: string; tenu: boolean }> = [];

function constater(intitule: string, attendu: unknown, constate: unknown): void {
  const tenu = JSON.stringify(attendu) === JSON.stringify(constate);
  constats.push({ intitule, tenu });
  console.log(`  ${tenu ? 'tenu ' : 'ECART'}  ${intitule}`);
  if (!tenu) {
    console.log(`         attendu ${JSON.stringify(attendu)}, constate ${JSON.stringify(constate)}`);
  }
}

function nombre(valeur: unknown): number {
  return valeur === null || valeur === undefined ? 0 : Number(valeur);
}

async function soldeBailleur(landLeaseId: string): Promise<number> {
  const bail = await prisma.landLease.findUnique({
    where: { id: landLeaseId },
    select: { landlordAccount: { select: { balance: true } } }
  });
  return nombre(bail?.landlordAccount?.balance);
}

async function nettoyer(tenantId: string): Promise<string | null> {
  try {
    const baux = await prisma.landLease.findMany({ where: { tenantId }, select: { id: true } });
    const chantiers = await prisma.constructionSite.findMany({ where: { tenantId }, select: { id: true } });
    const ecritures = await prisma.journalEntry.findMany({ where: { tenantId }, select: { id: true } });

    await prisma.landLeaseAccrual.deleteMany({ where: { tenantId } });
    await prisma.landLeasePayment.deleteMany({ where: { tenantId } });
    // Les chantiers designent le bail : le lien tombe avant lui.
    await prisma.constructionSite.updateMany({ where: { tenantId }, data: { landLeaseId: null } });
    if (baux.length) {
      await prisma.landLease.deleteMany({ where: { id: { in: baux.map(b => b.id) } } });
    }

    await prisma.costAllocation.deleteMany({ where: { tenantId } });
    if (chantiers.length) {
      await prisma.constructionSite.deleteMany({ where: { id: { in: chantiers.map(c => c.id) } } });
    }
    await prisma.costCategory.deleteMany({ where: { tenantId } });
    await prisma.thirdPartyMovement.deleteMany({ where: { tenantId } });
    await prisma.thirdPartyAccount.deleteMany({ where: { tenantId } });
    if (ecritures.length) {
      await prisma.journalEntryLine.deleteMany({ where: { entryId: { in: ecritures.map(e => e.id) } } });
    }
    await prisma.journalEntry.deleteMany({ where: { tenantId } });
    await prisma.accountingJournal.deleteMany({ where: { tenantId } });
    await prisma.chartOfAccount.deleteMany({ where: { tenantId } });

    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-lot4-', endsWith: '@immotopia.invalid' } }
    });
    return null;
  } catch (erreur) {
    return erreur instanceof Error ? erreur.message.replace(/\s+/g, ' ').trim().slice(0, 300) : String(erreur);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const rattraper = args.includes('--nettoyer-restes');

  if (process.env.NODE_ENV === 'production') {
    console.error('Refus de tourner en production.');
    process.exitCode = 2;
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (erreur) {
    console.error("Base de donnees injoignable. Aucun chiffre n'est produit.");
    console.error(erreur instanceof Error ? erreur.message : String(erreur));
    process.exitCode = 2;
    await prisma.$disconnect();
    return;
  }

  if (rattraper) {
    const restes = await prisma.tenant.findMany({
      where: { slug: { startsWith: 'e2e-finance-lot4-jetable-' } },
      select: { id: true, slug: true }
    });
    for (const reste of restes) {
      const echec = await nettoyer(reste.id);
      console.log(echec === null ? `  supprime : ${reste.slug}` : `  ECHEC sur ${reste.slug} : ${echec}`);
    }
    if (restes.length === 0) {
      console.log('Aucun tenant jetable a nettoyer.');
    }
    await prisma.$disconnect();
    return;
  }

  let tenantId: string | null = null;

  try {
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Parcours de bout en bout lot 4 (jetable)',
        slug: TENANT_SLUG,
        type: 'AGENCY',
        website: 'https://e2e.invalid/finance-lot-4',
        status: 'ACTIVE'
      }
    });
    tenantId = tenant.id;

    const saisisseur = await prisma.user.create({
      data: { email: `e2e-lot4-saisisseur-${RUN_ID}@immotopia.invalid`, fullName: 'Saisisseur jetable', isActive: true }
    });
    const dirigeant = await prisma.user.create({
      data: { email: `e2e-lot4-dirigeant-${RUN_ID}@immotopia.invalid`, fullName: 'Dirigeant jetable', isActive: true }
    });

    console.log('');
    console.log(`Tenant jetable ${TENANT_SLUG}`);
    console.log('');
    console.log('Le bail et son paiement');
    console.log('');

    // -----------------------------------------------------------------------
    // 1. Le bail, ses chantiers, son paiement annuel
    // -----------------------------------------------------------------------

    // Un chantier d'abord : c'est lui qui seme les postes de depense.
    const chantierA = await createConstructionSite(tenantId, { name: 'Villa A — terrain loue', zone: 'Nongo' });
    const postes = await listCostCategories(tenantId);
    const posteDivers = postes.find(p => /divers/i.test(p.label)) ?? postes[postes.length - 1];

    const bail = await prisma.$transaction(tx =>
      createLandLeaseTx(tx, tenantId as string, {
        landlordName: 'Famille Camara',
        landLabel: 'Terrain de Nongo, 800 m2',
        annualAmount: LOYER_ANNUEL,
        costCategoryId: posteDivers.id,
        startDate: new Date('2026-01-01')
      })
    );

    constater('Le bail nait avec le compte de son bailleur, a zero', 0, await soldeBailleur(bail.id));
    constater('Son douzieme mensuel est calcule, jamais saisi', Math.round(LOYER_ANNUEL / 12), bail.monthlyAmount);
    constater('Et il nomme son poste de depense', posteDivers.label, bail.costCategoryLabel);

    // Trois chantiers : un nombre qui ne divise pas le douzieme, a dessein.
    const chantierB = await createConstructionSite(tenantId, { name: 'Villa B — terrain loue', zone: 'Nongo' });
    const chantierC = await createConstructionSite(tenantId, { name: 'Villa C — terrain loue', zone: 'Nongo' });
    for (const site of [chantierA, chantierB, chantierC]) {
      await prisma.$transaction(tx => attachSiteToLandLeaseTx(tx, tenantId as string, site.id, bail.id));
    }

    const bailRelu = await getLandLease(tenantId, bail.id);
    constater('Les trois chantiers sont rattaches', 3, bailRelu.sites.length);

    const paiement = await prisma.$transaction(tx =>
      createLandLeasePaymentTx(tx, tenantId as string, {
        landLeaseId: bail.id,
        paymentDate: new Date('2026-01-05'),
        amount: LOYER_ANNUEL,
        coverageStartDate: new Date('2026-01-01'),
        coverageEndDate: new Date('2026-12-31'),
        createdByUserId: saisisseur.id
      })
    );

    constater('Un paiement nait brouillon', 'DRAFT', paiement.status);
    constater('Et un brouillon ne bouge aucun solde', 0, await soldeBailleur(bail.id));

    await prisma.$transaction(tx => validateLandLeasePaymentTx(tx, tenantId as string, paiement.id, dirigeant.id));

    // Paye d'avance : le bailleur nous doit de la jouissance, donc solde
    // NEGATIF — meme convention qu'un acompte verse a un fournisseur au lot 2.
    constater('La validation rend le bailleur debiteur du montant verse', -LOYER_ANNUEL, await soldeBailleur(bail.id));

    // -----------------------------------------------------------------------
    // 2. La constatation, et ce qu'elle impute
    // -----------------------------------------------------------------------

    console.log('');
    console.log('La constatation mensuelle');
    console.log('');

    const coutAvant = await sumSiteActualCost(prisma, tenantId, chantierA.id);
    constater('Avant toute constatation, le chantier ne coute rien', 0, coutAvant);

    const janvier = await prisma.$transaction(tx =>
      recordLandLeaseAccrualTx(tx, tenantId as string, { landLeaseId: bail.id, periodYear: 2026, periodMonth: 1 })
    );

    constater('Le premier mois vaut le douzieme arrondi', Math.round(LOYER_ANNUEL / 12), janvier.amount);
    constater('Il est reparti sur les trois chantiers', 3, janvier.allocations.length);

    // LE PIEGE DE L'ARRONDI : trois chantiers ne divisent pas 83 333.
    const sommeImputee = janvier.allocations.reduce((total, a) => total + a.amount, 0);
    constater('La somme des imputations egale EXACTEMENT la charge', janvier.amount, sommeImputee);

    // LE CONSTAT LE PLUS IMPORTANT DU PARCOURS. Sans lui, tout le sous-lot
    // serait cosmetique : le loyer s'afficherait sans jamais entrer dans le
    // cout du chantier, ce que le PRD demande pourtant.
    const coutApres = await sumSiteActualCost(prisma, tenantId, chantierA.id);
    const partA = janvier.allocations.find(a => a.siteId === chantierA.id)?.amount ?? 0;
    constater('LE LOYER ENTRE DANS LE COUT REEL DU CHANTIER', partA, coutApres);
    constater(
      'Et le detail du chantier le montre',
      partA,
      (await getSiteDetail(tenantId, chantierA.id)).site.actualCost
    );

    constater(
      'Le solde du bailleur remonte du montant constate',
      -LOYER_ANNUEL + janvier.amount,
      await soldeBailleur(bail.id)
    );

    // -----------------------------------------------------------------------
    // 3. L'idempotence
    // -----------------------------------------------------------------------

    const soldeAvantRejeu = await soldeBailleur(bail.id);
    const imputationsAvantRejeu = await prisma.costAllocation.count({ where: { tenantId } });

    const rejeu = await prisma.$transaction(tx =>
      recordLandLeaseAccrualTx(tx, tenantId as string, { landLeaseId: bail.id, periodYear: 2026, periodMonth: 1 })
    );

    constater('Rejouer un mois deja constate rend la meme piece', janvier.id, rejeu.id);
    constater('Sans bouger le solde', soldeAvantRejeu, await soldeBailleur(bail.id));
    constater(
      'Ni creer une imputation de plus',
      imputationsAvantRejeu,
      await prisma.costAllocation.count({ where: { tenantId } })
    );

    // -----------------------------------------------------------------------
    // 4. Les douze mois, et le zero
    // -----------------------------------------------------------------------

    console.log('');
    console.log('Les douze mois');
    console.log('');

    for (let mois = 2; mois <= 12; mois += 1) {
      await prisma.$transaction(tx =>
        recordLandLeaseAccrualTx(tx, tenantId as string, { landLeaseId: bail.id, periodYear: 2026, periodMonth: mois })
      );
    }

    // LE CRITERE DE SORTIE. Douze douziemes doivent faire un an, exactement :
    // le reliquat d'arrondi est porte par le douzieme mois, sans quoi le
    // compte du bailleur n'atteindrait jamais zero.
    constater('APRES DOUZE CONSTATATIONS, LE COMPTE DU BAILLEUR EST A ZERO', 0, await soldeBailleur(bail.id));

    const toutes = await listLandLeaseAccruals(tenantId, bail.id);
    constater('Douze constatations, pas une de plus', 12, toutes.length);
    constater(
      'Leur somme vaut le loyer annuel',
      LOYER_ANNUEL,
      toutes.reduce((total, a) => total + a.amount, 0)
    );

    // -----------------------------------------------------------------------
    // 5. Un bail sans chantier actif
    // -----------------------------------------------------------------------

    console.log('');
    console.log('Un bail sans chantier');
    console.log('');

    const bailSeul = await prisma.$transaction(tx =>
      createLandLeaseTx(tx, tenantId as string, {
        landlordName: 'Monsieur Bangoura',
        landLabel: 'Terrain de Kipe, sans chantier',
        annualAmount: 600_000,
        costCategoryId: posteDivers.id,
        startDate: new Date('2026-01-01')
      })
    );

    const constatationSeule = await prisma.$transaction(tx =>
      recordLandLeaseAccrualTx(tx, tenantId as string, { landLeaseId: bailSeul.id, periodYear: 2026, periodMonth: 1 })
    );

    // La charge a bien eu lieu ; elle n'est simplement imputable a rien.
    constater('Un bail sans chantier se constate quand meme', 50_000, constatationSeule.amount);
    constater('Sans produire aucune imputation', 0, constatationSeule.allocations.length);
    constater('Et son bailleur remonte tout de meme', 50_000, await soldeBailleur(bailSeul.id));
  } catch (erreur) {
    console.error('');
    console.error('Le parcours a casse :');
    console.error(erreur instanceof Error ? `${erreur.name} : ${erreur.message}` : String(erreur));
    if (erreur instanceof Error && erreur.stack) {
      console.error(erreur.stack.split('\n').slice(1, 6).join('\n'));
    }
    process.exitCode = 2;
  } finally {
    if (tenantId) {
      const reste = await nettoyer(tenantId);
      console.log('');
      if (reste === null) {
        console.log(`Tenant jetable ${TENANT_SLUG} supprime, avec tout ce qui pendait dessous.`);
      } else {
        console.error(`ECHEC DU NETTOYAGE. Le tenant ${TENANT_SLUG} est TOUJOURS en base.`);
        console.error(`Cause : ${reste}`);
        process.exitCode = 2;
      }
    }
    await prisma.$disconnect();
  }

  const ecarts = constats.filter(c => !c.tenu);
  console.log('');
  if (constats.length === 0) {
    console.log("Aucun constat : le parcours n'est pas alle assez loin pour prouver quoi que ce soit.");
    process.exitCode = process.exitCode ?? 2;
  } else if (ecarts.length === 0) {
    console.log(`${constats.length} constats, tous tenus, contre une vraie base.`);
  } else {
    console.log(`${ecarts.length} ecart(s) sur ${constats.length} constats.`);
    process.exitCode = 1;
  }
  console.log('');
}

main()
  .catch(async erreur => {
    console.error(erreur);
    await prisma.$disconnect();
    process.exitCode = 2;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
