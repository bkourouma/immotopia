/**
 * Parcours de bout en bout — lot 4, lots, coût de revient et clôture, contre
 * une vraie base.
 *
 * ---------------------------------------------------------------------------
 * Ce qu'il prouve, et pourquoi les 105 tests du sous-lot n'y suffisaient pas
 * ---------------------------------------------------------------------------
 *
 * `assertSiteOpenTx` était écrite, exportée, documentée et testée chez elle —
 * et **branchée nulle part**. Une garde qu'on n'appelle pas ne protège rien,
 * et aucun test du sous-lot ne pouvait le dire : ils testaient la fonction,
 * pas ses appelants.
 *
 * C'est elle qui rend `finalCost` vrai. Sans elle, une pièce validée le
 * lendemain d'une clôture fait diverger le coût figé du coût réel, en
 * silence : les deux chiffres se contredisent, et rien ne le signale. Un
 * dirigeant vend alors ses lots sur un coût de revient faux.
 *
 * Ce script vérifie le branchement là où il compte, contre la vraie base :
 *
 *   1. Le coût réel monte quand une pièce de caisse est validée.
 *   2. La somme des coûts de revient vaut exactement le coût du chantier,
 *      reliquat d'arrondi compris. **Sur la clé `EQUAL` seulement** : les
 *      trois clés sont éprouvées par les tests unitaires du sous-lot, ce
 *      parcours ne vérifie que celle qui produit le reliquat le plus net.
 *   3. Clôturer fige le coût.
 *   4. **Un chantier clos refuse une nouvelle dépense** — le constat central.
 *   5. Rouvrir libère le coût et rend les dépenses de nouveau possibles.
 *   6. La bascule au patrimoine crée un bien portant le coût de revient du
 *      lot en valeur d'acquisition, et ne se fait qu'une fois.
 *
 * Sécurité, identique aux parcours précédents : refus en production, tenant
 * jetable au slug reconnaissable, nettoyage systématique, et jamais de
 * prétention d'avoir nettoyé ce qui ne l'a pas été.
 *
 * Usage :
 *   npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot4-cloture.ts
 *   npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot4-cloture.ts --nettoyer-restes
 */

import { v4 as uuidv4 } from 'uuid';

import { prisma } from '../src/utils/database';
import { createConstructionSite, listCostCategories } from '../src/lib/finance/sites';
import { sumSiteActualCost } from '../src/lib/finance/site-cost';
import { createCashVoucherTx, validateCashVoucherTx } from '../src/lib/finance/cash';
import {
  capitalizeSiteLotTx,
  closeSiteTx,
  createSiteLotTx,
  getSiteClosureBlockers,
  getSiteCostBreakdown,
  reopenSiteTx,
  setLotAllocationMethodTx
} from '../src/lib/finance/site-closing';

const RUN_ID = uuidv4().slice(0, 8);
const TENANT_SLUG = `e2e-finance-lot4-cloture-jetable-${RUN_ID}`;

/**
 * Un coût qui ne se divise PAS par trois. C'est tout l'intérêt : 1 000 000 / 3
 * vaut 333 333,33, et la somme des trois arrondis ne fait pas le compte sans
 * la règle du reliquat.
 */
const DEPENSE = 1_000_000;

const constats: Array<{ intitule: string; tenu: boolean }> = [];

function constater(intitule: string, attendu: unknown, constate: unknown): void {
  const tenu = JSON.stringify(attendu) === JSON.stringify(constate);
  constats.push({ intitule, tenu });
  console.log(`  ${tenu ? 'OK  ' : 'ECHEC'} ${intitule}`);
  if (!tenu) {
    console.log(`        attendu  : ${JSON.stringify(attendu)}`);
    console.log(`        constate : ${JSON.stringify(constate)}`);
  }
}

function nombre(valeur: unknown): number {
  return valeur === null || valeur === undefined ? 0 : Number(valeur);
}

/** Vrai si l'appel a été refusé. On ne regarde pas le texte : seul le refus compte. */
async function refuse(action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action();
    return false;
  } catch {
    return true;
  }
}

async function nettoyer(tenantId: string): Promise<string | null> {
  try {
    const chantiers = await prisma.constructionSite.findMany({ where: { tenantId }, select: { id: true } });
    const ecritures = await prisma.journalEntry.findMany({ where: { tenantId }, select: { id: true } });
    const biens = await prisma.property.findMany({ where: { tenantId }, select: { id: true } });

    // Le lot designe le bien : le lien tombe avant lui.
    await prisma.siteLot.updateMany({ where: { tenantId }, data: { propertyId: null } });
    await prisma.assetValuation.deleteMany({ where: { tenantId } });
    if (biens.length) {
      await prisma.property.deleteMany({ where: { id: { in: biens.map(b => b.id) } } });
    }
    await prisma.siteLot.deleteMany({ where: { tenantId } });

    await prisma.cashVoucher.deleteMany({ where: { tenantId } });
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
    // `User` ne porte pas de `tenantId` : le prefixe de courriel est le seul
    // moyen de les retrouver.
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-lot4-cloture-', endsWith: '@immotopia.invalid' } }
    });
    return null;
  } catch (erreur) {
    return erreur instanceof Error ? erreur.message.replace(/\s+/g, ' ').trim().slice(0, 300) : String(erreur);
  }
}

async function main(): Promise<void> {
  const rattraper = process.argv.slice(2).includes('--nettoyer-restes');

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
      where: { slug: { startsWith: 'e2e-finance-lot4-cloture-jetable-' } },
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
        name: 'Agence jetable — cloture (lot 4)',
        slug: TENANT_SLUG,
        type: 'AGENCY',
        website: 'https://e2e.invalid/finance-lot4-cloture',
        status: 'ACTIVE'
      }
    });
    tenantId = tenant.id;
    const tid = tenant.id;

    const dirigeant = await prisma.user.create({
      data: {
        email: `e2e-lot4-cloture-dirigeant-${RUN_ID}@immotopia.invalid`,
        fullName: 'Dirigeant jetable',
        isActive: true
      }
    });

    // -----------------------------------------------------------------------
    // 1. Un chantier qui a coute
    // -----------------------------------------------------------------------
    console.log('\nLe chantier et sa depense');

    const chantier = await createConstructionSite(tid, { name: 'Residence Akwaba', zone: 'Kipe' });
    const postes = await listCostCategories(tid);
    const poste = postes[0];

    const piece = await prisma.$transaction(async tx => {
      const brouillon = await createCashVoucherTx(tx, tid, {
        siteId: chantier.id,
        costCategoryId: poste.id,
        beneficiary: 'Fournisseur de sable',
        amount: DEPENSE,
        voucherDate: new Date('2026-06-15T00:00:00.000Z'),
        reason: 'Approvisionnement en sable et gravier',
        createdByUserId: dirigeant.id
      });
      return validateCashVoucherTx(tx, tid, brouillon.id, dirigeant.id);
    });

    constater('la piece est validee', true, Boolean(piece.validatedAt));
    constater('le cout reel du chantier a monte', DEPENSE, await sumSiteActualCost(prisma, tid, chantier.id));

    // -----------------------------------------------------------------------
    // 2. Trois lots, parts egales, et le reliquat
    // -----------------------------------------------------------------------
    console.log('\nLes lots et le cout de revient');

    for (const nom of ['Villa 1', 'Villa 2', 'Villa 3']) {
      await prisma.$transaction(tx => createSiteLotTx(tx, tid, { siteId: chantier.id, name: nom }));
    }
    await prisma.$transaction(tx => setLotAllocationMethodTx(tx, tid, chantier.id, 'EQUAL'));

    const repartition = await getSiteCostBreakdown(tid, chantier.id);
    const couts = repartition.lots.map(l => l.costPrice);

    constater('trois lots', 3, repartition.lots.length);
    constater('le total reparti est le cout reel', DEPENSE, repartition.totalCost);
    // LE constat de la repartition : un million divise par trois ne tombe pas
    // juste, et la somme doit valoir le million au franc pres.
    constater(
      'la somme des couts de revient vaut le cout du chantier',
      DEPENSE,
      couts.reduce((a, b) => a + b, 0)
    );
    constater('le reliquat va au premier lot', [333_334, 333_333, 333_333], couts);
    constater('rien ne reste non reparti', 0, repartition.unallocatedCost);
    constater("le chantier n'est pas encore clos", false, repartition.isClosed);

    // -----------------------------------------------------------------------
    // 3. La cloture
    // -----------------------------------------------------------------------
    console.log('\nLa cloture');

    const bloqueurs = await getSiteClosureBlockers(tid, chantier.id);
    constater('aucun bloqueur : toutes les pieces sont validees', 0, bloqueurs.length);

    const cloture = await prisma.$transaction(tx =>
      closeSiteTx(tx, tid, chantier.id, { closedByUserId: dirigeant.id })
    );
    constater('le cout est fige a ce qu il valait', DEPENSE, cloture.finalCost);

    const enBase = await prisma.constructionSite.findUnique({
      where: { id: chantier.id },
      select: { status: true, closedAt: true, finalCost: true }
    });
    constater('le statut passe a CLOSED', 'CLOSED', enBase?.status);
    constater('la date de cloture est posee', true, Boolean(enBase?.closedAt));
    constater('finalCost porte le cout fige', DEPENSE, nombre(enBase?.finalCost));

    // -----------------------------------------------------------------------
    // 4. LE constat central : un chantier clos refuse une depense
    // -----------------------------------------------------------------------
    console.log('\nCe qu un chantier clos refuse');

    const depenseRefusee = await refuse(() =>
      prisma.$transaction(async tx => {
        const brouillon = await createCashVoucherTx(tx, tid, {
          siteId: chantier.id,
          costCategoryId: poste.id,
          beneficiary: 'Fournisseur tardif',
          amount: 250_000,
          voucherDate: new Date('2026-07-01T00:00:00.000Z'),
          reason: 'Facture arrivee apres la cloture',
          createdByUserId: dirigeant.id
        });
        return validateCashVoucherTx(tx, tid, brouillon.id, dirigeant.id);
      })
    );

    // Si ce constat tombe, la garde n'est branchee nulle part et `finalCost`
    // ment des la premiere piece en retard.
    constater('une depense sur chantier clos est refusee', true, depenseRefusee);
    constater('le cout reel n a pas bouge', DEPENSE, await sumSiteActualCost(prisma, tid, chantier.id));
    constater(
      'une seconde cloture est refusee',
      true,
      await refuse(() => prisma.$transaction(tx => closeSiteTx(tx, tid, chantier.id, { closedByUserId: dirigeant.id })))
    );

    // -----------------------------------------------------------------------
    // 5. La bascule au patrimoine
    // -----------------------------------------------------------------------
    console.log('\nLa bascule au patrimoine');

    const premierLot = (await getSiteCostBreakdown(tid, chantier.id)).lots[0];

    const bascule = await prisma.$transaction(tx =>
      capitalizeSiteLotTx(tx, tid, premierLot.id, {
        internalReference: `E2E-LOT-${RUN_ID}`,
        propertyType: 'MAISON_VILLA',
        ownershipType: 'TENANT',
        title: 'Villa 1 — Residence Akwaba',
        description: 'Bien produit par le chantier, bascule au patrimoine.',
        address: 'Kipe, Conakry',
        acquisitionDate: new Date('2026-07-05T00:00:00.000Z')
      })
    );

    constater('la valeur d acquisition est le cout de revient du lot', premierLot.costPrice, bascule.acquisitionCost);

    const evaluation = await prisma.assetValuation.findFirst({
      where: { tenantId: tid, propertyId: bascule.propertyId },
      select: { acquisitionCost: true }
    });
    constater('l evaluation porte la valeur d acquisition', premierLot.costPrice, nombre(evaluation?.acquisitionCost));

    constater(
      'un lot ne bascule pas deux fois',
      true,
      await refuse(() =>
        prisma.$transaction(tx =>
          capitalizeSiteLotTx(tx, tid, premierLot.id, {
            internalReference: `E2E-LOT-BIS-${RUN_ID}`,
            propertyType: 'MAISON_VILLA',
            ownershipType: 'TENANT',
            title: 'Villa 1 — doublon',
            description: 'Ne doit jamais exister.',
            address: 'Kipe, Conakry',
            acquisitionDate: new Date('2026-07-06T00:00:00.000Z')
          })
        )
      )
    );

    // -----------------------------------------------------------------------
    // 6. La reouverture, refusee parce qu'un lot a bascule
    // -----------------------------------------------------------------------
    console.log('\nLa reouverture');

    constater(
      'rouvrir est refuse des qu un lot a bascule',
      true,
      await refuse(() => prisma.$transaction(tx => reopenSiteTx(tx, tid, chantier.id)))
    );

    // Sur un chantier dont aucun lot n'a bascule, la reouverture doit marcher :
    // cloturer trop tot est une erreur courante, et sans retour possible la
    // seule issue serait une intervention en base.
    const chantierBis = await createConstructionSite(tid, { name: 'Chantier temoin', zone: 'Kipe' });
    await prisma.$transaction(tx => closeSiteTx(tx, tid, chantierBis.id, { closedByUserId: dirigeant.id }));
    await prisma.$transaction(tx => reopenSiteTx(tx, tid, chantierBis.id));

    const apresReouverture = await prisma.constructionSite.findUnique({
      where: { id: chantierBis.id },
      select: { status: true, closedAt: true, finalCost: true }
    });
    constater('rouvrir remet le chantier en cours', 'IN_PROGRESS', apresReouverture?.status);
    constater('rouvrir efface le cout fige', null, apresReouverture?.finalCost);
    constater('rouvrir efface la date de cloture', null, apresReouverture?.closedAt);

    // Et la depense redevient possible.
    const depenseRedevenuePossible = !(await refuse(() =>
      prisma.$transaction(async tx => {
        const brouillon = await createCashVoucherTx(tx, tid, {
          siteId: chantierBis.id,
          costCategoryId: poste.id,
          beneficiary: 'Fournisseur du temoin',
          amount: 50_000,
          voucherDate: new Date('2026-07-10T00:00:00.000Z'),
          reason: 'Depense apres reouverture',
          createdByUserId: dirigeant.id
        });
        return validateCashVoucherTx(tx, tid, brouillon.id, dirigeant.id);
      })
    ));
    constater('apres reouverture, la depense repasse', true, depenseRedevenuePossible);
  } catch (erreur) {
    console.error('\nLe parcours a echoue avant son terme.');
    console.error(erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur));
    process.exitCode = 1;
  } finally {
    let echecDuNettoyage: string | null = null;
    if (tenantId) {
      echecDuNettoyage = await nettoyer(tenantId);
    }

    const tenus = constats.filter(c => c.tenu).length;
    console.log(`\n${tenus} / ${constats.length} constats tenus.`);

    if (echecDuNettoyage) {
      console.error(`\nNETTOYAGE INCOMPLET — le tenant ${TENANT_SLUG} subsiste.`);
      console.error(`  cause : ${echecDuNettoyage}`);
      console.error('  reprendre avec : --nettoyer-restes');
      process.exitCode = 1;
    } else if (tenantId) {
      console.log(`Tenant jetable ${TENANT_SLUG} supprime.`);
    }

    if (constats.length === 0) {
      console.error("Aucun constat n'a ete produit : ce parcours ne dit rien.");
      process.exitCode = 1;
    } else if (tenus !== constats.length) {
      process.exitCode = 1;
    }

    await prisma.$disconnect();
  }
}

void main();
