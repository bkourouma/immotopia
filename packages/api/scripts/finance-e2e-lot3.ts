/**
 * Parcours de bout en bout — lot 3, contre une vraie base de données.
 *
 * Même parti pris qu'au lot 2 (`finance-e2e-lot2.ts`), et pour la même raison :
 * les tests unitaires du lot remplacent Prisma par une doublure, et une suite
 * qui simule sa base ne peut rien dire de sa base. C'est ce parcours-là qui,
 * au lot 2, a trouvé du premier essai que la création d'une pièce de caisse
 * échouait à tous les coups pendant que trente tests la déclaraient bonne.
 *
 * Il prouve les trois critères de sortie du lot (`data-model.md` §7) :
 *
 *   1. l'engagé égale le réalisé plus le reste à facturer des bons émis,
 *      **sans double compte** quand une facture est rapprochée d'un bon ;
 *   2. aucune grandeur calculée n'est écrite : total d'un budget, budget
 *      révisé, état de facturation d'un bon ;
 *   3. `ConstructionSite.progressPercent` suit la dernière saisie **au sens de
 *      la date de saisie**, pas de la date d'enregistrement.
 *
 * Il vérifie en plus l'alerte de dépassement, qui n'existe qu'ici : elle est
 * levée par trois chemins d'écriture différents et ne se voit nulle part
 * ailleurs en entier.
 *
 * Sécurité, identique au lot 2 :
 *   - refuse de tourner si NODE_ENV vaut "production" ;
 *   - crée son propre tenant jetable, au slug préfixé
 *     `e2e-finance-lot3-jetable-`, et n'écrit jamais hors de ce tenant ;
 *   - nettoie systématiquement derrière lui, y compris après un échec en cours
 *     de route, et ne prétend JAMAIS avoir nettoyé ce qu'il n'a pas nettoyé ;
 *   - si la base est injoignable, ne fabrique aucun chiffre.
 *
 * Usage :
 *   npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot3.ts
 *   npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot3.ts --garder
 *   npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot3.ts --nettoyer-restes
 */

import { v4 as uuidv4 } from 'uuid';

import { prisma } from '../src/utils/database';
import { createConstructionSite, listCostCategories, getSiteDetail } from '../src/lib/finance/sites';
import { createSupplierTx, createSupplierInvoiceTx, validateSupplierInvoiceTx } from '../src/lib/finance/suppliers';
import {
  createSiteBudgetTx,
  validateSiteBudgetTx,
  getValidatedSiteBudget,
  createBudgetAmendmentTx,
  validateBudgetAmendmentTx
} from '../src/lib/finance/budgets';
import {
  createPurchaseOrderTx,
  issuePurchaseOrderTx,
  linkInvoiceToPurchaseOrderTx,
  getSiteEngagement,
  getPurchaseOrder
} from '../src/lib/finance/purchase-orders';
import { recordSiteProgressTx, listSiteProgress } from '../src/lib/finance/site-progress';
import { listOpenBudgetAlerts } from '../src/lib/finance/budget-alerts';
import { getSitesDashboard } from '../src/lib/finance/site-dashboard';
import { setCostCategoryAccount } from '../src/lib/finance/sites';
import { createOperationalAccountTx } from '../src/lib/finance/accounting';
import { createCashVoucherTx, validateCashVoucherTx } from '../src/lib/finance/cash';

const RUN_ID = uuidv4().slice(0, 8);
const TENANT_SLUG = `e2e-finance-lot3-jetable-${RUN_ID}`;

/** Montants choisis pour que chaque total se vérifie de tête. */
const BUDGET_GROS_OEUVRE = 6_000_000;
const BUDGET_MATERIAUX = 4_000_000;
const BUDGET_INITIAL = BUDGET_GROS_OEUVRE + BUDGET_MATERIAUX; // 10 000 000
const AVENANT_DELTA = 2_000_000;
const BUDGET_REVISE = BUDGET_INITIAL + AVENANT_DELTA; // 12 000 000
const MONTANT_BON = 1_000_000;
const MONTANT_FACTURE = 400_000;

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

/**
 * Supprime un tenant jetable et tout ce qui pend dessous.
 *
 * Plusieurs relations du module sont en `onDelete: Restrict` — c'est voulu, on
 * ne veut pas qu'effacer une agence efface ses factures en silence. La cascade
 * du tenant bute donc dessus : on descend l'arbre a la main, des feuilles vers
 * la racine. Renvoie `null` si tout est parti, le message d'echec sinon.
 */
async function nettoyer(tenantId: string): Promise<string | null> {
  try {
    const bons = await prisma.purchaseOrder.findMany({ where: { tenantId }, select: { id: true } });
    const budgets = await prisma.siteBudget.findMany({ where: { tenantId }, select: { id: true } });
    const avenants = await prisma.budgetAmendment.findMany({ where: { tenantId }, select: { id: true } });
    const factures = await prisma.supplierInvoice.findMany({ where: { tenantId }, select: { id: true } });
    const ecritures = await prisma.journalEntry.findMany({ where: { tenantId }, select: { id: true } });
    const chantiers = await prisma.constructionSite.findMany({ where: { tenantId }, select: { id: true } });

    // Lot 3, des feuilles vers la racine.
    await prisma.siteBudgetAlert.deleteMany({ where: { tenantId } });
    await prisma.siteProgressEntry.deleteMany({ where: { tenantId } });
    if (avenants.length) {
      await prisma.budgetAmendmentLine.deleteMany({ where: { amendmentId: { in: avenants.map(a => a.id) } } });
    }
    await prisma.budgetAmendment.deleteMany({ where: { tenantId } });
    if (budgets.length) {
      await prisma.siteBudgetLine.deleteMany({ where: { budgetId: { in: budgets.map(b => b.id) } } });
    }
    await prisma.siteBudget.deleteMany({ where: { tenantId } });

    // Le rapprochement doit tomber avant le bon qu'il designe.
    await prisma.supplierInvoice.updateMany({ where: { tenantId }, data: { purchaseOrderId: null } });
    if (bons.length) {
      await prisma.purchaseOrderLine.deleteMany({ where: { orderId: { in: bons.map(o => o.id) } } });
    }
    await prisma.purchaseOrder.deleteMany({ where: { tenantId } });

    // Lot 2.
    const reglements = await prisma.supplierPayment.findMany({ where: { tenantId }, select: { id: true } });
    if (reglements.length) {
      await prisma.supplierPaymentAllocation.deleteMany({ where: { paymentId: { in: reglements.map(r => r.id) } } });
    }
    await prisma.supplierPayment.deleteMany({ where: { tenantId } });
    if (factures.length) {
      await prisma.supplierInvoiceLine.deleteMany({ where: { invoiceId: { in: factures.map(f => f.id) } } });
    }
    await prisma.costAllocation.deleteMany({ where: { tenantId } });
    await prisma.cashVoucher.deleteMany({ where: { tenantId } });
    await prisma.supplierInvoice.deleteMany({ where: { tenantId } });
    await prisma.supplier.deleteMany({ where: { tenantId } });
    if (chantiers.length) {
      await prisma.constructionSite.deleteMany({ where: { id: { in: chantiers.map(c => c.id) } } });
    }
    await prisma.costCategory.deleteMany({ where: { tenantId } });
    await prisma.thirdPartyMovement.deleteMany({ where: { tenantId } });
    await prisma.thirdPartyAccount.deleteMany({ where: { tenantId } });
    if (ecritures.length) {
      await prisma.journalEntryLine.deleteMany({ where: { entryId: { in: ecritures.map(e => e.id) } } });
    }
    await prisma.voidDocument.deleteMany({ where: { tenantId } });
    await prisma.journalEntry.deleteMany({ where: { tenantId } });
    await prisma.accountingJournal.deleteMany({ where: { tenantId } });
    await prisma.chartOfAccount.deleteMany({ where: { tenantId } });

    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-lot3-', endsWith: '@immotopia.invalid' } }
    });
    return null;
  } catch (erreur) {
    return erreur instanceof Error ? erreur.message.replace(/\s+/g, ' ').trim().slice(0, 300) : String(erreur);
  }
}

async function nettoyerRestes(): Promise<void> {
  const restes = await prisma.tenant.findMany({
    where: { slug: { startsWith: 'e2e-finance-lot3-jetable-' } },
    select: { id: true, slug: true }
  });
  if (restes.length === 0) {
    console.log('Aucun tenant jetable a nettoyer.');
  }
  for (const reste of restes) {
    const echec = await nettoyer(reste.id);
    console.log(echec === null ? `  supprime : ${reste.slug}` : `  ECHEC sur ${reste.slug} : ${echec}`);
  }

  const orphelins = await prisma.user.findMany({
    where: { email: { startsWith: 'e2e-lot3-', endsWith: '@immotopia.invalid' } },
    select: { id: true, email: true }
  });
  for (const orphelin of orphelins) {
    await prisma.user.delete({ where: { id: orphelin.id } }).catch(() => undefined);
    console.log(`  supprime : ${orphelin.email}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const garder = args.includes('--garder');
  const rattraper = args.includes('--nettoyer-restes');

  if (process.env.NODE_ENV === 'production') {
    console.error("Refus de tourner en production. Ce script ecrit en base, meme s'il nettoie derriere lui.");
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
    console.log('');
    console.log('Rattrapage des tenants jetables du lot 3');
    console.log('');
    await nettoyerRestes();
    console.log('');
    await prisma.$disconnect();
    return;
  }

  let tenantId: string | null = null;

  try {
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Parcours de bout en bout lot 3 (jetable)',
        slug: TENANT_SLUG,
        type: 'AGENCY',
        website: 'https://e2e.invalid/finance-lot-3',
        status: 'ACTIVE'
      }
    });
    tenantId = tenant.id;

    const saisisseur = await prisma.user.create({
      data: { email: `e2e-lot3-saisisseur-${RUN_ID}@immotopia.invalid`, fullName: 'Saisisseur jetable', isActive: true }
    });
    const dirigeant = await prisma.user.create({
      data: { email: `e2e-lot3-dirigeant-${RUN_ID}@immotopia.invalid`, fullName: 'Dirigeant jetable', isActive: true }
    });

    console.log('');
    console.log(`Tenant jetable ${TENANT_SLUG}`);
    console.log('');
    console.log('Budget');
    console.log('');

    // -----------------------------------------------------------------------
    // 1. Chantier, postes, budget initial
    // -----------------------------------------------------------------------

    const chantier = await createConstructionSite(tenantId, { name: 'Villa temoin lot 3', zone: 'Kipe' });
    const postes = await listCostCategories(tenantId);
    const posteGrosOeuvre = postes[0];
    const posteMateriaux = postes.find(p => /mat[ée]riaux/i.test(p.label)) ?? postes[1];

    const brouillon = await prisma.$transaction(tx =>
      createSiteBudgetTx(tx, tenantId as string, {
        siteId: chantier.id,
        label: 'Budget initial 2026',
        lines: [
          { costCategoryId: posteGrosOeuvre.id, label: 'Fondations et murs', amountForecast: BUDGET_GROS_OEUVRE },
          { costCategoryId: posteMateriaux.id, label: 'Materiaux', amountForecast: BUDGET_MATERIAUX }
        ]
      })
    );

    constater('Un budget nait brouillon', 'DRAFT', brouillon.status);
    constater('Son total est la somme de ses lignes, jamais saisi', BUDGET_INITIAL, brouillon.totalForecast);
    constater('Sans avenant, le revise vaut l’initial', BUDGET_INITIAL, brouillon.revisedTotal);

    const budget = await prisma.$transaction(tx =>
      validateSiteBudgetTx(tx, tenantId as string, brouillon.id, dirigeant.id)
    );
    constater('La validation en fait le budget initial du chantier', 'VALIDATED', budget.status);
    constater('Et elle nomme qui a valide', 'Dirigeant jetable', budget.validatedByLabel);

    // Un second budget valide sur le meme chantier est un conflit, pas un
    // remplacement : on amende un budget valide.
    const second = await prisma.$transaction(tx =>
      createSiteBudgetTx(tx, tenantId as string, {
        siteId: chantier.id,
        label: 'Tentative de second budget',
        lines: [{ costCategoryId: posteGrosOeuvre.id, label: 'Autre', amountForecast: 1_000_000 }]
      })
    );
    let refuse = false;
    try {
      await prisma.$transaction(tx => validateSiteBudgetTx(tx, tenantId as string, second.id, dirigeant.id));
    } catch {
      refuse = true;
    }
    constater('Un chantier ne peut pas avoir deux budgets valides', true, refuse);

    // -----------------------------------------------------------------------
    // 2. Avenant
    // -----------------------------------------------------------------------

    const avenant = await prisma.$transaction(tx =>
      createBudgetAmendmentTx(tx, tenantId as string, {
        budgetId: budget.id,
        amendmentDate: new Date('2026-06-01'),
        reason: 'Surcout sur les fondations',
        lines: [{ costCategoryId: posteGrosOeuvre.id, amountDelta: AVENANT_DELTA }],
        createdByUserId: saisisseur.id
      })
    );

    const avantValidation = await getValidatedSiteBudget(tenantId, chantier.id);
    constater('Un avenant en brouillon ne compte pas dans le revise', BUDGET_INITIAL, avantValidation?.revisedTotal);

    await prisma.$transaction(tx => validateBudgetAmendmentTx(tx, tenantId as string, avenant.id, dirigeant.id));

    const apresValidation = await getValidatedSiteBudget(tenantId, chantier.id);
    constater(
      'L’initial ne bouge jamais : on amende, on ne reecrit pas',
      BUDGET_INITIAL,
      apresValidation?.totalForecast
    );
    constater('Le revise vaut l’initial plus l’avenant valide', BUDGET_REVISE, apresValidation?.revisedTotal);

    // -----------------------------------------------------------------------
    // 3. Bon de commande et engage — le piege du lot
    // -----------------------------------------------------------------------

    console.log('');
    console.log('Engage');
    console.log('');

    const fournisseur = await prisma.$transaction(tx =>
      createSupplierTx(tx, tenantId as string, { name: 'Ciments temoin lot 3', kind: 'MATERIALS' })
    );

    const bon = await prisma.$transaction(tx =>
      createPurchaseOrderTx(tx, tenantId as string, {
        siteId: chantier.id,
        supplierId: fournisseur.id,
        reference: `BC-E2E-${RUN_ID}`,
        orderDate: new Date('2026-06-10'),
        lines: [{ costCategoryId: posteMateriaux.id, label: 'Ciment et agregats', amount: MONTANT_BON }],
        createdByUserId: saisisseur.id
      })
    );

    const engageAvantEmission = await getSiteEngagement(tenantId, chantier.id);
    constater('Un bon en brouillon n’engage rien', 0, engageAvantEmission.engagedAmount);

    await prisma.$transaction(tx => issuePurchaseOrderTx(tx, tenantId as string, bon.id, dirigeant.id));

    const engageApresEmission = await getSiteEngagement(tenantId, chantier.id);
    constater('L’emission fait entrer le bon dans l’engage', MONTANT_BON, engageApresEmission.engagedAmount);
    constater('Rien n’est encore realise', 0, engageApresEmission.actualCost);

    // La facture, rapprochee AVANT sa validation : une facture validee ne se
    // rapproche plus (P-6).
    const facture = await prisma.$transaction(tx =>
      createSupplierInvoiceTx(tx, tenantId as string, {
        supplierId: fournisseur.id,
        invoiceDate: new Date('2026-06-20'),
        reference: `FC-E2E-${RUN_ID}`,
        lines: [{ label: 'Premiere livraison', amount: MONTANT_FACTURE }],
        allocations: [{ siteId: chantier.id, costCategoryId: posteMateriaux.id, amount: MONTANT_FACTURE }],
        createdByUserId: saisisseur.id
      })
    );

    await prisma.$transaction(tx => linkInvoiceToPurchaseOrderTx(tx, tenantId as string, facture.id, bon.id));
    await prisma.$transaction(tx => validateSupplierInvoiceTx(tx, tenantId as string, facture.id, dirigeant.id));

    const bonRelu = await getPurchaseOrder(tenantId, bon.id);
    constater('Le bon sait ce qui lui a ete facture', MONTANT_FACTURE, bonRelu.invoicedAmount);
    constater('Et ce qui lui reste a facturer', MONTANT_BON - MONTANT_FACTURE, bonRelu.remainingAmount);
    constater('Son etat de facturation est derive, jamais stocke', 'PARTIALLY_INVOICED', bonRelu.invoicingState);

    const engageFinal = await getSiteEngagement(tenantId, chantier.id);
    constater('Le realise vaut la facture validee', MONTANT_FACTURE, engageFinal.actualCost);
    constater(
      'Le reste a facturer du bon vaut la difference',
      MONTANT_BON - MONTANT_FACTURE,
      engageFinal.openCommitments
    );

    // LE PIEGE. Sans le reste a facturer, la facture compterait deux fois :
    // une fois dans le realise, une fois dans le bon.
    constater('L’ENGAGE NE COMPTE PAS DEUX FOIS LA FACTURE RAPPROCHEE', MONTANT_BON, engageFinal.engagedAmount);

    // -----------------------------------------------------------------------
    // 4. Avancement physique
    // -----------------------------------------------------------------------

    console.log('');
    console.log('Avancement');
    console.log('');

    await prisma.$transaction(tx =>
      recordSiteProgressTx(tx, tenantId as string, {
        siteId: chantier.id,
        entryDate: new Date('2026-06-30'),
        percent: 40,
        createdByUserId: saisisseur.id
      })
    );

    const apresPremier = await prisma.constructionSite.findUnique({
      where: { id: chantier.id },
      select: { progressPercent: true }
    });
    constater('La saisie se recopie sur le chantier', 40, apresPremier?.progressPercent);

    // Une saisie ANTERIEURE ajoutee apres coup ne doit pas ecraser un point
    // plus recent : la copie suit la date de saisie, pas celle d'enregistrement.
    await prisma.$transaction(tx =>
      recordSiteProgressTx(tx, tenantId as string, {
        siteId: chantier.id,
        entryDate: new Date('2026-05-15'),
        percent: 20,
        note: 'Point retrouve dans un carnet',
        createdByUserId: saisisseur.id
      })
    );

    const apresRetard = await prisma.constructionSite.findUnique({
      where: { id: chantier.id },
      select: { progressPercent: true }
    });
    constater(
      'Une saisie anterieure ajoutee apres coup n’ecrase pas un point plus recent',
      40,
      apresRetard?.progressPercent
    );

    const historique = await listSiteProgress(tenantId, chantier.id);
    constater('L’historique conserve les deux points', 2, historique.length);
    constater('Et il nomme qui a saisi', 'Saisisseur jetable', historique[0]?.createdByLabel);

    // -----------------------------------------------------------------------
    // 5. Alerte de depassement
    // -----------------------------------------------------------------------

    console.log('');
    console.log('Alerte');
    console.log('');

    const sansSeuil = await listOpenBudgetAlerts(tenantId);
    constater('Sans seuil configure, aucune alerte', 0, sansSeuil.length);

    // Seuil bas : l'engage (1 000 000) represente deja plus de 5 % du revise
    // (12 000 000). L'alerte se leve a la prochaine ecriture qui fait monter
    // l'engage.
    await prisma.constructionSite.update({
      where: { id: chantier.id },
      data: { budgetThresholdPercent: 5 }
    });

    const deuxiemeBon = await prisma.$transaction(tx =>
      createPurchaseOrderTx(tx, tenantId as string, {
        siteId: chantier.id,
        supplierId: fournisseur.id,
        reference: `BC-E2E-${RUN_ID}-2`,
        orderDate: new Date('2026-07-01'),
        lines: [{ costCategoryId: posteGrosOeuvre.id, label: 'Ferraillage', amount: 500_000 }],
        createdByUserId: saisisseur.id
      })
    );
    await prisma.$transaction(tx => issuePurchaseOrderTx(tx, tenantId as string, deuxiemeBon.id, dirigeant.id));

    const alertes = await listOpenBudgetAlerts(tenantId);
    constater('L’emission d’un bon au-dela du seuil leve une alerte', 1, alertes.length);
    constater('L’alerte nomme le chantier, jamais son identifiant seul', chantier.name, alertes[0]?.siteLabel);
    constater('Elle compare a l’engage courant', MONTANT_BON + 500_000, alertes[0]?.engagedAmount);
    constater('Contre le budget REVISE, pas l’initial', BUDGET_REVISE, alertes[0]?.budgetAmount);

    // Une seconde ecriture ne doit pas empiler une seconde alerte.
    const troisiemeBon = await prisma.$transaction(tx =>
      createPurchaseOrderTx(tx, tenantId as string, {
        siteId: chantier.id,
        supplierId: fournisseur.id,
        reference: `BC-E2E-${RUN_ID}-3`,
        orderDate: new Date('2026-07-05'),
        lines: [{ costCategoryId: posteGrosOeuvre.id, label: 'Coffrage', amount: 300_000 }],
        createdByUserId: saisisseur.id
      })
    );
    await prisma.$transaction(tx => issuePurchaseOrderTx(tx, tenantId as string, troisiemeBon.id, dirigeant.id));

    const alertesApres = await listOpenBudgetAlerts(tenantId);
    constater('Une seule alerte non acquittee par budget', 1, alertesApres.length);

    // -----------------------------------------------------------------------
    // 6. Tableau de bord
    // -----------------------------------------------------------------------

    console.log('');
    console.log('Tableau de bord');
    console.log('');

    const tableau = await getSitesDashboard(tenantId, {});
    const ligne = tableau.rows.find(r => r.siteId === chantier.id);

    constater('Le chantier figure au tableau de bord', true, ligne !== undefined);
    constater('Avec son budget initial', BUDGET_INITIAL, ligne?.initialBudget);
    constater('Et son budget revise', BUDGET_REVISE, ligne?.revisedBudget);
    constater('Son engage', MONTANT_BON + 500_000 + 300_000, ligne?.engagedAmount);
    constater('Son realise', MONTANT_FACTURE, ligne?.actualCost);
    constater('Son avancement, recopie de la derniere saisie', 40, ligne?.progressPercent);
    constater('Son ecart, contre le revise', BUDGET_REVISE - (MONTANT_BON + 800_000), ligne?.variance);
    constater('Et son alerte ouverte', true, ligne?.openAlert !== null);

    // -----------------------------------------------------------------------
    // 7. Le compte de charge suit le POSTE
    // -----------------------------------------------------------------------
    //
    // La dette consignee au lot 2, promise au lot 3 par son rapport, oubliee de
    // sa specification, et tenue le 19 septembre 2026. Sans ce lien, toute
    // depense de chantier frappait le meme compte : le grand livre ne
    // distinguait pas le ciment de la main-d'oeuvre.

    console.log('');
    console.log('Compte de charge par poste');
    console.log('');

    const compteMainOeuvre = await prisma.$transaction(tx =>
      createOperationalAccountTx(tx, tenantId as string, {
        accountNumber: '661',
        accountName: "Main-d'oeuvre de chantier",
        accountClass: 6,
        accountType: 'EXPENSE' as any
      })
    );

    const posteMainOeuvre = postes.find(p => /main/i.test(p.label)) ?? postes[4];
    const posteRattache = await setCostCategoryAccount(tenantId, posteMainOeuvre.id, compteMainOeuvre.id);

    constater('Le poste porte desormais son compte', compteMainOeuvre.id, posteRattache.chartOfAccountId);
    constater(
      'Et il le NOMME, jamais son identifiant seul',
      "661 — Main-d'oeuvre de chantier",
      posteRattache.chartOfAccountLabel
    );

    // Une piece de caisse sur ce poste doit frapper CE compte, pas le defaut.
    const pieceMainOeuvre = await prisma.$transaction(tx =>
      createCashVoucherTx(tx, tenantId as string, {
        siteId: chantier.id,
        costCategoryId: posteMainOeuvre.id,
        beneficiary: 'Equipe maçons',
        amount: 150_000,
        voucherDate: new Date('2026-07-10'),
        reason: 'Salaire quinzaine',
        createdByUserId: saisisseur.id
      })
    );
    const pieceValidee = await prisma.$transaction(tx =>
      validateCashVoucherTx(tx, tenantId as string, pieceMainOeuvre.id, dirigeant.id)
    );

    const ecriture = await prisma.journalEntry.findFirst({
      where: { tenantId, documentType: 'CASH_VOUCHER', documentId: pieceValidee.id },
      include: { lines: { select: { accountId: true, debit: true, credit: true } } }
    });
    const ligneDeCharge = ecriture?.lines.find(l => nombre(l.debit) > 0);

    constater('L’ecriture de la piece frappe le compte DU POSTE', compteMainOeuvre.id, ligneDeCharge?.accountId);
    constater('Pour le montant de la piece', 150_000, nombre(ligneDeCharge?.debit));

    // Et un poste SANS compte retombe sur le defaut : c'est ce qui garantit
    // qu'aucune donnee existante ne change de comportement.
    const posteSansCompte = postes.find(p => p.id !== posteMainOeuvre.id) as (typeof postes)[number];
    const pieceDefaut = await prisma.$transaction(tx =>
      createCashVoucherTx(tx, tenantId as string, {
        siteId: chantier.id,
        costCategoryId: posteSansCompte.id,
        beneficiary: 'Fournisseur divers',
        amount: 50_000,
        voucherDate: new Date('2026-07-11'),
        reason: 'Petit materiel',
        createdByUserId: saisisseur.id
      })
    );
    const pieceDefautValidee = await prisma.$transaction(tx =>
      validateCashVoucherTx(tx, tenantId as string, pieceDefaut.id, dirigeant.id)
    );

    const ecritureDefaut = await prisma.journalEntry.findFirst({
      where: { tenantId, documentType: 'CASH_VOUCHER', documentId: pieceDefautValidee.id },
      include: { lines: { select: { accountId: true, debit: true } } }
    });
    const ligneDefaut = ecritureDefaut?.lines.find(l => nombre(l.debit) > 0);
    const compte605 = await prisma.chartOfAccount.findFirst({
      where: { tenantId, scope: 'OPERATIONS', accountNumber: '605' },
      select: { id: true }
    });

    constater('Un poste sans compte retombe sur le compte de charge par defaut', compte605?.id, ligneDefaut?.accountId);

    // -----------------------------------------------------------------------
    // Invariants
    // -----------------------------------------------------------------------

    console.log('');
    console.log('Invariants');
    console.log('');

    // Relu MAINTENANT, et non compare a la capture faite plus haut : les deux
    // pieces de caisse de la section precedente ont fait monter le realise
    // depuis. Comparer a une capture perimee ferait echouer un invariant qui
    // tient, ce qui est pire qu'un invariant absent.
    const detailFinal = await getSiteDetail(tenantId, chantier.id);
    const engagementRelu = await getSiteEngagement(tenantId, chantier.id);
    constater(
      'Le cout reel du chantier egale le realise de l’engagement',
      detailFinal.site.actualCost,
      engagementRelu.actualCost
    );

    const derniere = await prisma.siteProgressEntry.findFirst({
      where: { tenantId, siteId: chantier.id },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      select: { percent: true }
    });
    const siteFinal = await prisma.constructionSite.findUnique({
      where: { id: chantier.id },
      select: { progressPercent: true }
    });
    constater(
      'La copie d’avancement dit exactement ce que dit la derniere saisie',
      derniere?.percent,
      siteFinal?.progressPercent
    );

    const brouillonsNumerotes = await prisma.siteBudget.count({
      where: { tenantId, status: 'VALIDATED' }
    });
    constater('Un seul budget valide en base pour ce chantier', 1, brouillonsNumerotes);
  } catch (erreur) {
    console.error('');
    console.error('Le parcours a casse :');
    console.error(erreur instanceof Error ? `${erreur.name} : ${erreur.message}` : String(erreur));
    if (erreur instanceof Error && erreur.stack) {
      console.error(erreur.stack.split('\n').slice(1, 6).join('\n'));
    }
    process.exitCode = 2;
  } finally {
    if (tenantId && !garder) {
      const reste = await nettoyer(tenantId);
      console.log('');
      if (reste === null) {
        console.log(`Tenant jetable ${TENANT_SLUG} supprime, avec tout ce qui pendait dessous.`);
      } else {
        console.error(`ECHEC DU NETTOYAGE. Le tenant ${TENANT_SLUG} est TOUJOURS en base.`);
        console.error(`Cause : ${reste}`);
        console.error('A supprimer a la main, ou relancer avec --nettoyer-restes.');
        process.exitCode = 2;
      }
    } else if (tenantId) {
      console.log('');
      console.log(`Tenant jetable conserve : ${TENANT_SLUG}`);
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
    // Sortie explicite : le client partage installe des gestionnaires de
    // signaux qui gardent la boucle d'evenements ouverte.
    process.exit(process.exitCode ?? 0);
  });
