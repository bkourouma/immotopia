/**
 * Parcours de bout en bout — lot 5, le stock, contre une vraie base.
 *
 * ---------------------------------------------------------------------------
 * Ce qu'il prouve, et pourquoi aucun test unitaire ne le pouvait
 * ---------------------------------------------------------------------------
 *
 * Le principe P-7 dit que **le stock redéfinit le coût, il ne s'y ajoute
 * pas**. Concrètement : dès qu'un chantier est passé au stock, la facture de
 * ses matériaux cesse de s'imputer à son coût, et c'est la sortie de magasin
 * qui impute.
 *
 * Le défaut qui guette est le **double comptage** : la facture impute ET la
 * sortie impute, le chantier paraît coûter le double de ce qu'il coûte, et le
 * dirigeant décide là-dessus. Rien ne le signalerait — les deux imputations
 * sont légitimes prises séparément, et la balance reste équilibrée.
 *
 * Aucun test unitaire ne pouvait le voir : ceux du fournisseur remplacent le
 * moteur comptable et le plan de comptes par des doublures, ceux du stock ne
 * connaissent pas la facture. Les deux moitiés se répondent sans jamais se
 * rencontrer. C'est exactement l'angle mort des lots 2, 3 et 4, et c'est ce
 * script qui le couvre.
 *
 * Il vérifie, dans l'ordre d'une vraie vie de chantier :
 *
 *   1. Avant bascule, une facture imputée fait monter le coût. Le comportement
 *      d'hier, inchangé.
 *   2. Basculer crée le lieu de stockage du chantier.
 *   3. **Après bascule, la même facture ne fait plus monter le coût** — le
 *      constat central.
 *   4. La réception valorise le stock sans écrire d'écriture.
 *   5. **La sortie fait monter le coût**, d'exactement la valeur sortie.
 *   6. Un transfert ne fait monter aucun coût.
 *   7. Un écart d'inventaire ne s'impute à aucun chantier.
 *   8. Le rapprochement montre l'écart entre facturé et reçu.
 *
 * Sécurité, identique aux parcours précédents : refus en production, tenant
 * jetable au slug reconnaissable, nettoyage systématique, et jamais de
 * prétention d'avoir nettoyé ce qui ne l'a pas été.
 *
 * Usage :
 *   npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot5.ts
 *   npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot5.ts --nettoyer-restes
 */

import { v4 as uuidv4 } from 'uuid';

import { prisma } from '../src/utils/database';
import { createConstructionSite, listCostCategories } from '../src/lib/finance/sites';
import { sumSiteActualCost } from '../src/lib/finance/site-cost';
import { createSupplierTx, createSupplierInvoiceTx, validateSupplierInvoiceTx } from '../src/lib/finance/suppliers';
import { createStockItemTx, createStockLocationTx } from '../src/lib/finance/stock-referentiel';
import { recordStockReceiptTx, recordStockIssueTx, listStockBalances } from '../src/lib/finance/stock-mouvements';
import {
  recordStockTransferTx,
  createStockCountTx,
  setStockCountLineTx,
  validateStockCountTx
} from '../src/lib/finance/stock-inventaire';
import { enableStockOnSiteTx, getSiteStockReconciliation } from '../src/lib/finance/stock-rapprochement';

const RUN_ID = uuidv4().slice(0, 8);
const TENANT_SLUG = `e2e-finance-lot5-jetable-${RUN_ID}`;

/** Cent sacs de ciment à dix mille francs. Des chiffres qui se vérifient de tête. */
const QUANTITE = 100;
const PRIX_UNITAIRE = 10_000;
const MONTANT_FACTURE = QUANTITE * PRIX_UNITAIRE;

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

/** Solde d'un compte du plan operationnel, lu depuis les lignes d'ecriture. */
async function soldeDuCompte(tenantId: string, numero: string): Promise<number> {
  const compte = await prisma.chartOfAccount.findFirst({
    where: { tenantId, accountNumber: numero, scope: 'OPERATIONS' as any },
    select: { id: true }
  });
  if (!compte) {
    return 0;
  }
  const lignes = await prisma.journalEntryLine.aggregate({
    where: { accountId: compte.id },
    _sum: { debit: true, credit: true }
  });
  return nombre(lignes._sum.debit) - nombre(lignes._sum.credit);
}

async function nettoyer(tenantId: string): Promise<string | null> {
  try {
    const chantiers = await prisma.constructionSite.findMany({ where: { tenantId }, select: { id: true } });
    const ecritures = await prisma.journalEntry.findMany({ where: { tenantId }, select: { id: true } });
    const comptages = await prisma.stockCount.findMany({ where: { tenantId }, select: { id: true } });

    await prisma.stockMovement.deleteMany({ where: { tenantId } });
    if (comptages.length) {
      await prisma.stockCountLine.deleteMany({ where: { countId: { in: comptages.map(c => c.id) } } });
    }
    await prisma.stockCount.deleteMany({ where: { tenantId } });
    await prisma.stockBalance.deleteMany({ where: { tenantId } });
    await prisma.stockLocation.deleteMany({ where: { tenantId } });
    await prisma.stockItem.deleteMany({ where: { tenantId } });
    await prisma.stockSettings.deleteMany({ where: { tenantId } });

    await prisma.supplierInvoiceLine.deleteMany({ where: { invoice: { tenantId } } });
    await prisma.supplierInvoice.deleteMany({ where: { tenantId } });
    await prisma.supplier.deleteMany({ where: { tenantId } });

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
      where: { email: { startsWith: 'e2e-lot5-', endsWith: '@immotopia.invalid' } }
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
      where: { slug: { startsWith: 'e2e-finance-lot5-jetable-' } },
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
        name: 'Agence jetable — stock (lot 5)',
        slug: TENANT_SLUG,
        type: 'AGENCY',
        website: 'https://e2e.invalid/finance-lot5',
        status: 'ACTIVE'
      }
    });
    tenantId = tenant.id;
    const tid = tenant.id;

    const gestionnaire = await prisma.user.create({
      data: {
        email: `e2e-lot5-gestionnaire-${RUN_ID}@immotopia.invalid`,
        fullName: 'Gestionnaire jetable',
        isActive: true
      }
    });

    const postes = await listCostCategories(tid);
    const poste = postes[0];

    const fournisseur = await prisma.$transaction(tx =>
      createSupplierTx(tx, tid, { name: 'Cimenterie de Conakry', kind: 'MATERIALS' as any })
    );

    /** Facture un chantier, et la valide. Rend le montant impute. */
    async function facturer(siteId: string, reference: string, date: Date): Promise<void> {
      await prisma.$transaction(async tx => {
        const facture = await createSupplierInvoiceTx(tx, tid, {
          supplierId: fournisseur.id,
          invoiceDate: date,
          reference,
          lines: [{ label: 'Ciment CPJ 45, 100 sacs', amount: MONTANT_FACTURE }],
          allocations: [{ siteId, costCategoryId: poste.id, amount: MONTANT_FACTURE }],
          createdByUserId: gestionnaire.id
        });
        await validateSupplierInvoiceTx(tx, tid, facture.id, gestionnaire.id);
      });
    }

    // -----------------------------------------------------------------------
    // 1. Avant la bascule : le comportement d'hier
    // -----------------------------------------------------------------------
    console.log("\nAvant la bascule — le comportement d'hier");

    const chantierClassique = await createConstructionSite(tid, { name: 'Villa sans stock', zone: 'Kipe' });
    await facturer(chantierClassique.id, `FAC-CLASSIQUE-${RUN_ID}`, new Date('2026-06-10T00:00:00.000Z'));

    constater(
      'une facture imputee fait monter le cout',
      MONTANT_FACTURE,
      await sumSiteActualCost(prisma, tid, chantierClassique.id)
    );

    // -----------------------------------------------------------------------
    // 2. La bascule
    // -----------------------------------------------------------------------
    console.log('\nLa bascule');

    const chantierAuStock = await createConstructionSite(tid, { name: 'Villa au stock', zone: 'Nongo' });
    const bascule = await prisma.$transaction(tx =>
      enableStockOnSiteTx(tx, tid, chantierAuStock.id, { enabledAt: new Date('2026-07-01T00:00:00.000Z') })
    );

    constater('la bascule est datee', true, Boolean(bascule.stockEnabledAt));
    constater('elle a cree le lieu de stockage du chantier', true, Boolean(bascule.stockLocationId));
    constater(
      'une seconde bascule est refusee',
      true,
      await prisma
        .$transaction(tx => enableStockOnSiteTx(tx, tid, chantierAuStock.id, { enabledAt: new Date() }))
        .then(() => false)
        .catch(() => true)
    );

    // -----------------------------------------------------------------------
    // 3. LE CONSTAT CENTRAL : apres bascule, la facture n'impute plus
    // -----------------------------------------------------------------------
    console.log('\nApres la bascule — la facture n impute plus');

    const stockAvant = await soldeDuCompte(tid, '311');
    await facturer(chantierAuStock.id, `FAC-STOCK-${RUN_ID}`, new Date('2026-07-10T00:00:00.000Z'));

    // Si ce constat tombe, le ciment est compte deux fois et le chantier
    // parait couter le double de ce qu'il coute.
    constater(
      'le cout du chantier au stock n a PAS monte',
      0,
      await sumSiteActualCost(prisma, tid, chantierAuStock.id)
    );
    constater(
      'la valeur est entree au compte de stock',
      MONTANT_FACTURE,
      (await soldeDuCompte(tid, '311')) - stockAvant
    );
    constater(
      'le chantier sans stock, lui, est inchange',
      MONTANT_FACTURE,
      await sumSiteActualCost(prisma, tid, chantierClassique.id)
    );

    // -----------------------------------------------------------------------
    // 4. La reception
    // -----------------------------------------------------------------------
    console.log('\nLa reception');

    const magasin = await prisma.$transaction(tx =>
      createStockLocationTx(tx, tid, { kind: 'WAREHOUSE' as any, label: 'Magasin central' })
    );
    const ciment = await prisma.$transaction(tx =>
      createStockItemTx(tx, tid, {
        reference: `CIM-${RUN_ID}`,
        label: 'Ciment CPJ 45',
        unit: 'sac',
        defaultCostCategoryId: poste.id
      })
    );

    const factureStock = await prisma.supplierInvoice.findFirst({
      where: { tenantId: tid, reference: `FAC-STOCK-${RUN_ID}` },
      select: { id: true }
    });

    const ecrituresAvantReception = await prisma.journalEntry.count({ where: { tenantId: tid } });

    await prisma.$transaction(tx =>
      recordStockReceiptTx(tx, tid, {
        locationId: magasin.id,
        supplierInvoiceId: factureStock!.id,
        receiptDate: new Date('2026-07-11T00:00:00.000Z'),
        lines: [{ itemId: ciment.id, quantity: QUANTITE, unitCost: PRIX_UNITAIRE }],
        createdByUserId: gestionnaire.id
      })
    );

    const soldes = await listStockBalances(tid, { locationId: magasin.id });
    constater('le stock porte la quantite recue', QUANTITE, soldes[0]?.quantity);
    constater('et sa valeur', MONTANT_FACTURE, soldes[0]?.value);
    constater('le cout moyen est le prix unitaire', PRIX_UNITAIRE, soldes[0]?.averageUnitCost);
    constater(
      'la reception n a ecrit AUCUNE ecriture',
      ecrituresAvantReception,
      await prisma.journalEntry.count({ where: { tenantId: tid } })
    );

    // -----------------------------------------------------------------------
    // 5. LA SORTIE IMPUTE
    // -----------------------------------------------------------------------
    console.log('\nLa sortie');

    const sortie = await prisma.$transaction(tx =>
      recordStockIssueTx(tx, tid, {
        locationId: magasin.id,
        itemId: ciment.id,
        quantity: 40,
        siteId: chantierAuStock.id,
        costCategoryId: poste.id,
        requestedBy: 'Chef de chantier Camara',
        issueDate: new Date('2026-07-15T00:00:00.000Z'),
        createdByUserId: gestionnaire.id
      })
    );

    constater('la sortie vaut quarante sacs au cout moyen', 400_000, sortie.totalValue);
    // C'EST L'AUTRE MOITIE DU CONSTAT CENTRAL. Le cout vient de la sortie, et
    // de la sortie seulement.
    constater(
      'le cout du chantier monte de la valeur sortie, pas davantage',
      400_000,
      await sumSiteActualCost(prisma, tid, chantierAuStock.id)
    );
    constater(
      'le stock restant est de soixante sacs',
      60,
      (await listStockBalances(tid, { itemId: ciment.id, locationId: magasin.id }))[0]?.quantity
    );

    // -----------------------------------------------------------------------
    // 6. Un transfert n'impute rien
    // -----------------------------------------------------------------------
    console.log('\nLe transfert');

    const coutAvantTransfert = await sumSiteActualCost(prisma, tid, chantierAuStock.id);
    await prisma.$transaction(tx =>
      recordStockTransferTx(tx, tid, {
        fromLocationId: magasin.id,
        toLocationId: bascule.stockLocationId as string,
        itemId: ciment.id,
        quantity: 20,
        transferDate: new Date('2026-07-16T00:00:00.000Z'),
        createdByUserId: gestionnaire.id
      })
    );

    // Livrer sur un chantier RESSEMBLE a une depense. Ce n'en est pas une :
    // les sacs dorment encore sous la bache.
    constater(
      'livrer sur le chantier ne fait monter aucun cout',
      coutAvantTransfert,
      await sumSiteActualCost(prisma, tid, chantierAuStock.id)
    );
    const soldesApres = await listStockBalances(tid, { itemId: ciment.id });
    const valeurTotale = soldesApres.reduce((somme, s) => somme + s.value, 0);
    constater('transferer ne cree ni ne detruit de valeur', 600_000, valeurTotale);

    // -----------------------------------------------------------------------
    // 7. Un ecart d'inventaire ne s'impute a aucun chantier
    // -----------------------------------------------------------------------
    console.log('\nL inventaire');

    const coutAvantInventaire = await sumSiteActualCost(prisma, tid, chantierAuStock.id);
    const comptage = await prisma.$transaction(tx =>
      createStockCountTx(tx, tid, {
        locationId: magasin.id,
        countedAt: new Date('2026-07-20T00:00:00.000Z'),
        createdByUserId: gestionnaire.id
      })
    );
    await prisma.$transaction(tx =>
      setStockCountLineTx(tx, tid, comptage.id, {
        itemId: ciment.id,
        countedQuantity: 38,
        reason: 'Casse au dechargement'
      })
    );
    await prisma.$transaction(tx => validateStockCountTx(tx, tid, comptage.id, gestionnaire.id));

    constater(
      'un ecart ne s impute a aucun chantier',
      coutAvantInventaire,
      await sumSiteActualCost(prisma, tid, chantierAuStock.id)
    );
    constater(
      'le stock du magasin vaut ce qu on a compte',
      38,
      (await listStockBalances(tid, { itemId: ciment.id, locationId: magasin.id }))[0]?.quantity
    );

    // -----------------------------------------------------------------------
    // 8. Le rapprochement
    // -----------------------------------------------------------------------
    console.log('\nLe rapprochement');

    const rapprochement = await getSiteStockReconciliation(tid, chantierAuStock.id);
    constater('le facture depuis la bascule', MONTANT_FACTURE, rapprochement.invoicedAmount);
    // La reception est entree au MAGASIN, pas au lieu du chantier : rien n'est
    // « recu » de son point de vue, et l'ecart vaut donc toute la facture.
    // C'est le comportement documente, et il se lit.
    constater('le consomme est la valeur sortie', 400_000, rapprochement.issuedValue);
    // Du point de vue du CHANTIER, seul le transfert est entre : vingt sacs au
    // cout moyen de dix mille, soit deux cent mille. La reception, elle, est
    // allee au magasin central.
    constater('le recu est ce qui est entre au lieu du chantier', 200_000, rapprochement.receivedValue);
    // Chiffre en dur, et non `MONTANT_FACTURE - receivedValue` : un attendu
    // calcule depuis le constate ne peut pas echouer, et un test qui ne peut
    // pas echouer ne prouve rien. C'est le reproche fait aux tests unitaires
    // de la campagne de facturation au lot 4 ; il vaut aussi pour moi.
    constater('l ecart est expose, jamais interprete', 800_000, rapprochement.unreconciledAmount);
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
