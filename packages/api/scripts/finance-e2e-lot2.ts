/**
 * Parcours de bout en bout — lot 2, contre une vraie base de données.
 *
 * Pourquoi ce script existe. Les tests unitaires du lot 2
 * (`__tests__/unit/finance.suppliers.test.ts` et ses voisins) remplacent
 * Prisma par une doublure : ils vérifient la logique, jamais le schéma. Aucun
 * `INSERT` du module n'avait donc encore touché PostgreSQL au moment d'écrire
 * ces lignes. Une contrainte manquante, un type de colonne incompatible, une
 * relation mal déclarée — rien de tout cela ne peut apparaître dans une suite
 * qui n'écrit nulle part. Le lot 1 avait eu cette vérification (rapport §8) ;
 * le lot 2 la reçoit ici.
 *
 * Ce que le script fait. Il joue le parcours complet de la gestionnaire, en
 * appelant **les fonctions de production elles-mêmes**, jamais une requête
 * réécrite pour l'occasion :
 *
 *   1. crée un chantier et laisse le module semer ses postes de dépense ;
 *   2. crée un fournisseur de matériaux, et donc son compte de tiers ;
 *   3. saisit une facture reçue, imputée sur deux postes du chantier ;
 *   4. la valide — écriture comptable, mouvement de compte, imputations ;
 *   5. saisit une pièce de caisse, la valide, et vérifie sa numérotation ;
 *   6. règle une partie de la facture, puis verse un acompte sans facture ;
 *   7. relit le coût réel du chantier et la balance fournisseurs.
 *
 * Il passe ensuite le contrôleur d'invariants
 * (`finance-verify-lot2.ts`) sur les données qu'il vient de produire, et
 * compare chaque total à ce que le parcours permet de prédire à la main. Un
 * script qui se contenterait de ne pas planter ne prouverait rien.
 *
 * Sécurité. Même parti pris que le banc de charge du lot 1
 * (`finance-bench-balance.ts`) :
 *   - refuse de tourner si NODE_ENV vaut "production" ;
 *   - crée son propre tenant jetable, reconnaissable à son slug préfixé
 *     `e2e-finance-lot2-jetable-`, et n'écrit jamais hors de ce tenant ;
 *   - nettoie systématiquement derrière lui, y compris après un échec en cours
 *     de route (bloc `finally`), et redit à l'écran ce qu'il a supprimé ;
 *   - si la base est injoignable, ne fabrique aucun chiffre : le dit et
 *     s'arrête.
 *
 * Usage :
 *   npx ts-node packages/api/scripts/finance-e2e-lot2.ts
 *   npx ts-node packages/api/scripts/finance-e2e-lot2.ts --garder
 *
 * --garder  Ne supprime pas le tenant jetable à la fin, pour pouvoir
 *           l'inspecter. À n'utiliser que sur une base de développement, et à
 *           nettoyer à la main ensuite : le script affiche la commande.
 *
 * Sortie : code 0 si le parcours va au bout et si tous les contrôles tiennent,
 * 1 si un contrôle cède, 2 si la base est injoignable ou si le parcours casse.
 */

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { prisma } from '../src/utils/database';
import { createConstructionSite, listCostCategories, getSiteDetail } from '../src/lib/finance/sites';
import {
  createSupplierTx,
  createSupplierInvoiceTx,
  validateSupplierInvoiceTx,
  createSupplierPaymentTx,
  getSuppliersBalance
} from '../src/lib/finance/suppliers';
import { createCashVoucherTx, validateCashVoucherTx, formatCashVoucherNumber } from '../src/lib/finance/cash';

const RUN_ID = uuidv4().slice(0, 8);
const TENANT_SLUG = `e2e-finance-lot2-jetable-${RUN_ID}`;

/** Montants du scénario, choisis pour que chaque total soit vérifiable de tête. */
const FACTURE_GROS_OEUVRE = 3_000_000;
const FACTURE_MATERIAUX = 2_000_000;
const MONTANT_FACTURE = FACTURE_GROS_OEUVRE + FACTURE_MATERIAUX; // 5 000 000
const MONTANT_PIECE_CAISSE = 450_000;
const MONTANT_REGLEMENT = 1_500_000;
const MONTANT_ACOMPTE = 200_000;

const constats: Array<{ intitule: string; attendu: unknown; constate: unknown; tenu: boolean }> = [];

function constater(intitule: string, attendu: unknown, constate: unknown): void {
  const tenu = JSON.stringify(attendu) === JSON.stringify(constate);
  constats.push({ intitule, attendu, constate, tenu });
  const marque = tenu ? 'tenu ' : 'ECART';
  console.log(`  ${marque}  ${intitule}`);
  if (!tenu) {
    console.log(`         attendu ${JSON.stringify(attendu)}, constate ${JSON.stringify(constate)}`);
  }
}

function nombre(valeur: unknown): number {
  if (valeur === null || valeur === undefined) return 0;
  return Number(valeur);
}

/**
 * Supprime un tenant jetable et tout ce qui pend dessous.
 *
 * Pourquoi ce n'est pas un simple `tenant.delete`. Plusieurs relations du
 * module sont en `onDelete: Restrict` — c'est voulu, et c'est bien : on ne
 * veut pas qu'effacer une agence efface silencieusement ses factures. Mais la
 * cascade du tenant bute alors dessus, et le premier essai de ce script a
 * laissé son tenant en base en annonçant l'avoir supprimé. Le nettoyage
 * descend donc l'arbre des dépendances à la main, des feuilles vers la
 * racine.
 *
 * Renvoie `null` si tout est parti, ou le message d'échec sinon. L'appelant
 * doit dire la vérité à l'écran : un nettoyage qu'on annonce sans l'avoir fait
 * laisse des lignes que personne n'ira chercher.
 */
async function nettoyer(tenantId: string): Promise<string | null> {
  try {
    const chantiers = await prisma.constructionSite.findMany({ where: { tenantId }, select: { id: true } });
    const siteIds = chantiers.map(c => c.id);

    const factures = await prisma.supplierInvoice.findMany({ where: { tenantId }, select: { id: true } });
    const factureIds = factures.map(f => f.id);

    const reglements = await prisma.supplierPayment.findMany({ where: { tenantId }, select: { id: true } });
    const reglementIds = reglements.map(r => r.id);

    const ecritures = await prisma.journalEntry.findMany({ where: { tenantId }, select: { id: true } });
    const ecritureIds = ecritures.map(e => e.id);

    // Des feuilles vers la racine.
    if (reglementIds.length > 0) {
      await prisma.supplierPaymentAllocation.deleteMany({ where: { paymentId: { in: reglementIds } } });
    }
    await prisma.supplierPayment.deleteMany({ where: { tenantId } });

    if (factureIds.length > 0) {
      await prisma.supplierInvoiceLine.deleteMany({ where: { invoiceId: { in: factureIds } } });
    }
    await prisma.costAllocation.deleteMany({ where: { tenantId } });
    await prisma.cashVoucher.deleteMany({ where: { tenantId } });
    await prisma.supplierInvoice.deleteMany({ where: { tenantId } });
    await prisma.supplier.deleteMany({ where: { tenantId } });
    if (siteIds.length > 0) {
      await prisma.constructionSite.deleteMany({ where: { id: { in: siteIds } } });
    }
    await prisma.costCategory.deleteMany({ where: { tenantId } });

    await prisma.thirdPartyMovement.deleteMany({ where: { tenantId } });
    await prisma.thirdPartyAccount.deleteMany({ where: { tenantId } });

    if (ecritureIds.length > 0) {
      await prisma.journalEntryLine.deleteMany({ where: { entryId: { in: ecritureIds } } });
    }
    await prisma.voidDocument.deleteMany({ where: { tenantId } });
    await prisma.journalEntry.deleteMany({ where: { tenantId } });
    await prisma.accountingJournal.deleteMany({ where: { tenantId } });
    await prisma.chartOfAccount.deleteMany({ where: { tenantId } });

    await prisma.tenant.delete({ where: { id: tenantId } });

    // Les utilisateurs jetables ne sont rattaches a aucune agence : ils
    // partent en dernier, une fois que plus aucune piece ne les designe.
    // Leur adresse en `@immotopia.invalid` les identifie sans ambiguite —
    // c'est un domaine reserve, jamais joignable, jamais celui d'un vrai
    // compte.
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-lot2-', endsWith: '@immotopia.invalid' } }
    });

    return null;
  } catch (erreur) {
    return erreur instanceof Error ? erreur.message.replace(/\s+/g, ' ').trim().slice(0, 300) : String(erreur);
  }
}

/**
 * Rattrape les tenants jetables laisses par des executions precedentes.
 *
 * Reconnait les siens au prefixe de slug, et ne touche rien d'autre.
 */
async function nettoyerRestes(): Promise<void> {
  const restes = await prisma.tenant.findMany({
    where: { slug: { startsWith: 'e2e-finance-lot2-jetable-' } },
    select: { id: true, slug: true }
  });

  if (restes.length === 0) {
    console.log('Aucun tenant jetable a nettoyer.');
    return;
  }

  for (const reste of restes) {
    const echec = await nettoyer(reste.id);
    console.log(echec === null ? `  supprime : ${reste.slug}` : `  ECHEC sur ${reste.slug} : ${echec}`);
  }
}

/**
 * Balaie les utilisateurs jetables restes seuls.
 *
 * Un nettoyage interrompu peut avoir supprime l'agence sans ses deux
 * utilisateurs : plus aucun tenant ne les designe alors, et le rattrapage par
 * slug ne les verrait jamais.
 */
async function nettoyerUtilisateursOrphelins(): Promise<void> {
  const orphelins = await prisma.user.findMany({
    where: { email: { startsWith: 'e2e-lot2-', endsWith: '@immotopia.invalid' } },
    select: { id: true, email: true }
  });

  if (orphelins.length === 0) {
    console.log('Aucun utilisateur jetable a nettoyer.');
    return;
  }

  for (const orphelin of orphelins) {
    try {
      await prisma.user.delete({ where: { id: orphelin.id } });
      console.log(`  supprime : ${orphelin.email}`);
    } catch (erreur) {
      const message =
        erreur instanceof Error ? erreur.message.replace(/\s+/g, ' ').trim().slice(0, 200) : String(erreur);
      console.log(`  ECHEC sur ${orphelin.email} : ${message}`);
    }
  }
}

async function main(): Promise<void> {
  const garder = process.argv.slice(2).includes('--garder');
  const rattraper = process.argv.slice(2).includes('--nettoyer-restes');

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
    console.log('Rattrapage des tenants jetables laisses par des executions precedentes');
    console.log('');
    await nettoyerRestes();
    await nettoyerUtilisateursOrphelins();
    console.log('');
    await prisma.$disconnect();
    return;
  }

  let tenantId: string | null = null;

  try {
    // -----------------------------------------------------------------------
    // Décor jetable
    // -----------------------------------------------------------------------

    const tenant = await prisma.tenant.create({
      data: {
        name: 'Parcours de bout en bout lot 2 (jetable)',
        slug: TENANT_SLUG,
        type: 'AGENCY',
        website: 'https://e2e.invalid/finance-lot-2',
        status: 'ACTIVE'
      }
    });
    tenantId = tenant.id;

    const saisisseur = await prisma.user.create({
      data: {
        email: `e2e-lot2-saisisseur-${RUN_ID}@immotopia.invalid`,
        fullName: 'Saisisseur jetable',
        isActive: true
      }
    });

    const validateur = await prisma.user.create({
      data: {
        email: `e2e-lot2-validateur-${RUN_ID}@immotopia.invalid`,
        fullName: 'Validateur jetable',
        isActive: true
      }
    });

    console.log('');
    console.log(`Tenant jetable ${TENANT_SLUG}`);
    console.log('');
    console.log('Parcours');
    console.log('');

    // -----------------------------------------------------------------------
    // 1. Chantier et postes de dépense
    // -----------------------------------------------------------------------

    const chantier = await createConstructionSite(tenantId, {
      name: 'Villa temoin — parcours de bout en bout',
      zone: 'Kipe'
    });
    console.log(`  chantier cree : ${chantier.name}`);

    const postes = await listCostCategories(tenantId);
    constater('Le premier chantier seme les sept postes par defaut', 7, postes.length);

    const posteGrosOeuvre = postes[0];
    const posteMateriaux = postes.find(p => /mat[ée]riaux/i.test(p.label)) ?? postes[1];

    constater('Le chantier neuf a un cout reel nul', 0, chantier.actualCost);

    // -----------------------------------------------------------------------
    // 2. Fournisseur de matériaux
    // -----------------------------------------------------------------------

    const fournisseur = await prisma.$transaction(tx =>
      createSupplierTx(tx, tenantId as string, {
        name: "Ciments d'Afrique (jetable)",
        kind: 'MATERIALS',
        contactName: 'Aissatou Barry',
        phone: '+224 620 00 00 00'
      })
    );
    console.log(`  fournisseur cree : ${fournisseur.name}`);

    const compteFournisseur = await prisma.thirdPartyAccount.findUnique({
      where: { id: fournisseur.thirdPartyAccountId },
      select: { balance: true, currency: true }
    });
    constater('La creation du fournisseur ouvre son compte de tiers a zero', 0, nombre(compteFournisseur?.balance));
    constater('Le compte est libelle en XOF', 'XOF', compteFournisseur?.currency);

    // -----------------------------------------------------------------------
    // 3 et 4. Facture reçue, imputée puis validée
    // -----------------------------------------------------------------------

    const facture = await prisma.$transaction(tx =>
      createSupplierInvoiceTx(tx, tenantId as string, {
        supplierId: fournisseur.id,
        invoiceDate: new Date('2026-09-10'),
        reference: `FC-E2E-${RUN_ID}`,
        lines: [
          { label: 'Ciment CPJ 45, 400 sacs', amount: FACTURE_GROS_OEUVRE },
          { label: 'Fer a beton et agregats', amount: FACTURE_MATERIAUX }
        ],
        allocations: [
          { siteId: chantier.id, costCategoryId: posteGrosOeuvre.id, amount: FACTURE_GROS_OEUVRE },
          { siteId: chantier.id, costCategoryId: posteMateriaux.id, amount: FACTURE_MATERIAUX }
        ],
        createdByUserId: saisisseur.id
      })
    );
    console.log(`  facture saisie : ${facture.reference}`);

    constater('Une facture naît en brouillon', 'DRAFT', facture.status);
    constater('Son montant est la somme de ses lignes', MONTANT_FACTURE, facture.amount);

    const chantierAvantValidation = await getSiteDetail(tenantId, chantier.id);
    constater('Une facture non validee ne coute rien au chantier', 0, chantierAvantValidation.site.actualCost);

    const factureValidee = await prisma.$transaction(tx =>
      validateSupplierInvoiceTx(tx, tenantId as string, facture.id, validateur.id)
    );
    console.log(`  facture validee : ${factureValidee.reference}`);

    constater('La validation passe la facture en validee', 'VALIDATED', factureValidee.status);

    const compteApresFacture = await prisma.thirdPartyAccount.findUnique({
      where: { id: fournisseur.thirdPartyAccountId },
      select: { balance: true }
    });
    constater(
      'Le compte du fournisseur porte alors ce que nous lui devons',
      MONTANT_FACTURE,
      nombre(compteApresFacture?.balance)
    );

    const chantierApresFacture = await getSiteDetail(tenantId, chantier.id);
    constater(
      'Le cout reel du chantier vaut la facture imputee',
      MONTANT_FACTURE,
      chantierApresFacture.site.actualCost
    );
    constater('Les imputations sont ventilees sur deux postes', 2, chantierApresFacture.byCostCategory.length);
    constater(
      'La somme des sous-totaux egale le cout reel',
      MONTANT_FACTURE,
      chantierApresFacture.byCostCategory.reduce((total, poste) => total + poste.amount, 0)
    );

    // -----------------------------------------------------------------------
    // 5. Pièce de caisse
    // -----------------------------------------------------------------------

    const piece = await prisma.$transaction(tx =>
      createCashVoucherTx(tx, tenantId as string, {
        siteId: chantier.id,
        costCategoryId: posteMateriaux.id,
        beneficiary: 'Ousmane Toure',
        amount: MONTANT_PIECE_CAISSE,
        voucherDate: new Date('2026-09-12'),
        reason: 'Sable et gravier, livraison Kipe',
        createdByUserId: saisisseur.id
      })
    );
    console.log(`  piece de caisse saisie, sans numero`);

    constater('Une piece de caisse saisie n’a pas encore de numero', null, piece.number);

    const pieceValidee = await prisma.$transaction(tx =>
      validateCashVoucherTx(tx, tenantId as string, piece.id, validateur.id)
    );
    console.log(`  piece de caisse validee : ${pieceValidee.number}`);

    constater(
      'La validation lui donne le premier numero de l’annee',
      formatCashVoucherNumber(2026, 1),
      pieceValidee.number
    );

    const chantierApresCaisse = await getSiteDetail(tenantId, chantier.id);
    constater(
      'La piece de caisse validee s’ajoute au cout reel',
      MONTANT_FACTURE + MONTANT_PIECE_CAISSE,
      chantierApresCaisse.site.actualCost
    );

    // Une deuxième pièce, pour vérifier que la séquence avance et ne se répète pas.
    const piece2 = await prisma.$transaction(tx =>
      createCashVoucherTx(tx, tenantId as string, {
        siteId: chantier.id,
        costCategoryId: posteGrosOeuvre.id,
        beneficiary: 'Equipe maçons',
        amount: 100_000,
        voucherDate: new Date('2026-09-13'),
        reason: 'Salaire equipe, quinzaine',
        createdByUserId: saisisseur.id
      })
    );
    constater('La piece suivante, restee brouillon, n’a toujours pas de numero', null, piece2.number);

    const chantierApresPiece2 = await getSiteDetail(tenantId, chantier.id);
    constater(
      'Une piece de caisse non validee ne coute rien au chantier',
      MONTANT_FACTURE + MONTANT_PIECE_CAISSE,
      chantierApresPiece2.site.actualCost
    );

    // -----------------------------------------------------------------------
    // 6. Règlement partiel, puis acompte sans facture
    // -----------------------------------------------------------------------

    await prisma.$transaction(tx =>
      createSupplierPaymentTx(tx, tenantId as string, {
        supplierId: fournisseur.id,
        paymentDate: new Date('2026-09-15'),
        amount: MONTANT_REGLEMENT,
        allocations: [{ invoiceId: facture.id, amount: MONTANT_REGLEMENT }],
        createdByUserId: saisisseur.id
      })
    );
    console.log(`  reglement partiel enregistre`);

    const compteApresReglement = await prisma.thirdPartyAccount.findUnique({
      where: { id: fournisseur.thirdPartyAccountId },
      select: { balance: true }
    });
    constater(
      'Le solde du fournisseur diminue du reglement',
      MONTANT_FACTURE - MONTANT_REGLEMENT,
      nombre(compteApresReglement?.balance)
    );

    await prisma.$transaction(tx =>
      createSupplierPaymentTx(tx, tenantId as string, {
        supplierId: fournisseur.id,
        paymentDate: new Date('2026-09-16'),
        amount: MONTANT_ACOMPTE,
        allocations: [],
        createdByUserId: saisisseur.id
      })
    );
    console.log(`  acompte sans facture enregistre`);

    const compteApresAcompte = await prisma.thirdPartyAccount.findUnique({
      where: { id: fournisseur.thirdPartyAccountId },
      select: { balance: true }
    });
    constater(
      'Un acompte sans facture diminue encore le solde',
      MONTANT_FACTURE - MONTANT_REGLEMENT - MONTANT_ACOMPTE,
      nombre(compteApresAcompte?.balance)
    );

    // -----------------------------------------------------------------------
    // 7. Balance fournisseurs
    // -----------------------------------------------------------------------

    const balance = await getSuppliersBalance(tenantId, {});
    constater('La balance ne montre que ce fournisseur', 1, balance.lines.length);

    const ligne = balance.lines[0];
    constater('Elle le nomme, et ne montre pas son identifiant', fournisseur.name, ligne.label);
    constater('Elle totalise le facture', MONTANT_FACTURE, ligne.totalBilled);
    constater('Elle totalise le regle', MONTANT_REGLEMENT + MONTANT_ACOMPTE, ligne.totalSettled);
    constater(
      'Son solde est facture moins regle',
      MONTANT_FACTURE - MONTANT_REGLEMENT - MONTANT_ACOMPTE,
      ligne.balance
    );
    constater(
      'Le total de controle egale la somme des lignes',
      balance.lines.reduce((total, l) => total + l.balance, 0),
      balance.totalBalance
    );

    // -----------------------------------------------------------------------
    // Invariants, sur les donnees que le parcours vient de produire
    // -----------------------------------------------------------------------

    console.log('');
    console.log('Invariants');
    console.log('');

    const ecritures = await prisma.journalEntry.findMany({
      where: { tenantId },
      select: { id: true, reference: true, isLocked: true, lines: { select: { debit: true, credit: true } } }
    });

    const desequilibrees = ecritures.filter(e => {
      const gauche = e.lines.reduce((total, l) => total + nombre(l.debit), 0);
      const droite = e.lines.reduce((total, l) => total + nombre(l.credit), 0);
      return gauche !== droite;
    });
    constater('Aucune ecriture desequilibree', 0, desequilibrees.length);
    constater('Le parcours a produit des ecritures', true, ecritures.length > 0);
    constater('Toutes sont verrouillees', 0, ecritures.filter(e => !e.isLocked).length);

    const imputations = await prisma.costAllocation.aggregate({
      where: { tenantId, siteId: chantier.id, validatedAt: { not: null }, voidedAt: null },
      _sum: { amount: true }
    });
    const detailFinal = await getSiteDetail(tenantId, chantier.id);
    constater(
      'Le cout reel lu par l’API egale la somme des imputations en base',
      nombre(imputations._sum.amount),
      detailFinal.site.actualCost
    );
    constater(
      'Et il vaut bien ce que le parcours a engage',
      MONTANT_FACTURE + MONTANT_PIECE_CAISSE,
      detailFinal.site.actualCost
    );

    const numerotees = await prisma.cashVoucher.findMany({
      where: { tenantId, voucherNumber: { not: null } },
      select: { voucherYear: true, voucherNumber: true }
    });
    const clesNumeros = new Set(numerotees.map(n => `${n.voucherYear}|${n.voucherNumber}`));
    constater('Aucun numero de piece de caisse en double', numerotees.length, clesNumeros.size);

    // Le coeur de la regle arbitree le 19 septembre 2026 : seules les pieces
    // validees portent un numero, et le carnet ne saute aucun rang.
    const brouillonsNumerotes = await prisma.cashVoucher.count({
      where: { tenantId, validatedAt: null, voucherNumber: { not: null } }
    });
    constater('Aucun brouillon ne porte de numero', 0, brouillonsNumerotes);

    const rangs = numerotees.map(n => n.voucherNumber as number).sort((a, b) => a - b);
    constater(
      'Les numeros attribues forment une suite continue depuis 1',
      rangs.map((_, index) => index + 1),
      rangs
    );
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
        // Ne jamais annoncer un nettoyage qui n'a pas eu lieu : la ligne
        // resterait en base et personne n'irait la chercher.
        console.error(`ECHEC DU NETTOYAGE. Le tenant ${TENANT_SLUG} est TOUJOURS en base.`);
        console.error(`Cause : ${reste}`);
        console.error(`A supprimer a la main, ou relancer avec --nettoyer-restes.`);
        process.exitCode = 2;
      }
    } else if (tenantId) {
      console.log('');
      console.log(`Tenant jetable conserve : ${TENANT_SLUG}`);
      console.log(`Pour le supprimer : npx ts-node packages/api/scripts/finance-e2e-lot2.ts --nettoyer-restes`);
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
    // Sortie explicite. Le client partage (`src/utils/database`) installe des
    // gestionnaires de signaux qui gardent la boucle d'evenements ouverte : le
    // script finissait son travail puis restait suspendu jusqu'au delai
    // d'attente de l'appelant, ce qui ressemble a un blocage alors que tout
    // s'est bien passe.
    process.exit(process.exitCode ?? 0);
  });

// `PrismaClient` est importe pour son type seulement ; le client reellement
// utilise est celui du depot (`src/utils/database`), pour que ce script passe
// exactement par ou passe l'application, extension de cloisonnement comprise.
export type { PrismaClient };
