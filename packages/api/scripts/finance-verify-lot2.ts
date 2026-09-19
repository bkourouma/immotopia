/**
 * Contrôleur d'invariants — lot 2 (fournisseurs, chantiers, caisse).
 *
 * Le plan (§6.4) fixe deux critères de sortie au lot 2 :
 *
 *   1. le coût réel d'un chantier égale la somme de ses imputations, **sur la
 *      base de démonstration** — pas seulement dans un test à données forgées ;
 *   2. aucune route ne permet d'écrire ce coût réel.
 *
 * Le second se lit dans le code, et plus radicalement encore dans le schéma :
 * `ConstructionSite` n'a **aucune colonne** de coût réel. Il n'y a donc rien à
 * écrire, ni par une route ni autrement — `getSiteActualCost` (sites.ts:112)
 * le recalcule à chaque lecture. Le premier critère, lui, ne se lit nulle
 * part : il se constate en base. C'est l'objet de ce script.
 *
 * D'où porte le risque de dérive. Puisque le chantier ne stocke rien, le seul
 * coût réel **recopié** du module est celui du programme de travaux du
 * Patrimoine, quand il est rattaché à un chantier : `syncWorkProgramCostTx`
 * l'y réécrit à chaque validation et à chaque annulation d'imputation. Une
 * copie peut se désynchroniser de sa source ; un calcul, non. I1 contrôle donc
 * cette copie, la seule qui puisse mentir.
 *
 * Six invariants, vérifiés chacun indépendamment. Le script poursuit après un
 * échec plutôt que de s'arrêter au premier : un rapport qui dit tout ce qui ne
 * va pas vaut mieux qu'un rapport complet sur le premier défaut.
 *
 *   I1  Coût recopié sur un programme de travaux = somme des imputations
 *       de son chantier                                             (P-4)
 *   I2  Toute écriture comptable est équilibrée
 *   I3  Somme des imputations d'une pièce validée = montant de la pièce
 *   I4  Numéro de pièce de caisse unique par agence et par année
 *   I5  Solde d'un compte fournisseur = facturé moins réglé
 *   I6  Une pièce validée porte une écriture verrouillée            (P-6)
 *
 * Le filtre des imputations est partout le même que celui du code de
 * production — validées **et non annulées** (`validatedAt` renseigné,
 * `voidedAt` nul). Un contrôle qui filtrerait autrement que le code qu'il
 * contrôle ne contrôlerait rien.
 *
 * **Lecture seule.** Ce script n'écrit pas une ligne, ne crée aucun tenant
 * jetable et n'a donc rien à nettoyer. Il peut tourner sur n'importe quelle
 * base, y compris une base de démonstration qu'on veut garder intacte.
 *
 * Usage :
 *   npx ts-node packages/api/scripts/finance-verify-lot2.ts
 *   npx ts-node packages/api/scripts/finance-verify-lot2.ts --json
 *
 * Sortie : code 0 si tous les invariants tiennent, 1 si l'un cède, 2 si la
 * base est injoignable. Si la base ne contient aucune donnée de lot 2, le
 * script le dit au lieu d'annoncer six succès sur zéro ligne — un contrôle qui
 * ne contrôle rien n'est pas un contrôle qui passe, et son code de sortie ne
 * doit pas laisser croire le contraire.
 *
 * Comme les autres scripts de ce dossier, il lit `DATABASE_URL` via Prisma et
 * ne charge pas `src/config/env.ts` : il n'a besoin que d'une base joignable,
 * pas des secrets de l'application.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Verdict {
  code: string;
  intitule: string;
  /** Nombre de lignes réellement examinées. Zéro n'est pas un succès. */
  examinees: number;
  ecarts: string[];
}

const verdicts: Verdict[] = [];

function enregistrer(code: string, intitule: string, examinees: number, ecarts: string[]): void {
  verdicts.push({ code, intitule, examinees, ecarts });
}

/** Les montants arrivent en Decimal ; on compare en unités entières de XOF. */
function nombre(valeur: unknown): number {
  if (valeur === null || valeur === undefined) return 0;
  return Number(valeur);
}

/**
 * Somme des imputations d'un chantier, au filtre exact du code de production
 * (`getSiteActualCost`, sites.ts:112, et `syncWorkProgramCostTx`,
 * cost-allocation.ts:61). Validées, non annulées, agrégées en SQL.
 */
async function sommeImputations(tenantId: string, siteId: string): Promise<number> {
  const resultat = await prisma.costAllocation.aggregate({
    where: { tenantId, siteId, validatedAt: { not: null }, voidedAt: null },
    _sum: { amount: true }
  });
  return nombre(resultat._sum.amount);
}

/** Les pièces annulées portent une ligne dans `VoidDocument`, pas un statut. */
async function estAnnulee(documentType: 'SUPPLIER_PAYMENT' | 'CASH_VOUCHER', documentId: string): Promise<boolean> {
  const annulation = await prisma.voidDocument.findFirst({
    where: { documentType, documentId },
    select: { id: true }
  });
  return annulation !== null;
}

// ---------------------------------------------------------------------------
// I1 — Coût recopié sur un programme de travaux = somme des imputations
// ---------------------------------------------------------------------------

async function verifierCoutRecopie(): Promise<void> {
  const programmes = await prisma.workProgram.findMany({
    where: { constructionSiteId: { not: null } },
    select: { id: true, title: true, tenantId: true, constructionSiteId: true, actualCost: true }
  });

  const ecarts: string[] = [];

  for (const programme of programmes) {
    if (!programme.constructionSiteId) continue;

    const attendu = await sommeImputations(programme.tenantId, programme.constructionSiteId);
    const constate = nombre(programme.actualCost);

    if (attendu !== constate) {
      ecarts.push(
        `programme "${programme.title}" : coût recopié ${constate}, ` +
          `somme des imputations de son chantier ${attendu} (écart ${constate - attendu})`
      );
    }
  }

  enregistrer(
    'I1',
    'Coût recopié sur un programme de travaux = somme des imputations de son chantier',
    programmes.length,
    ecarts
  );
}

// ---------------------------------------------------------------------------
// I2 — Toute écriture comptable est équilibrée
// ---------------------------------------------------------------------------

async function verifierEquilibre(): Promise<void> {
  const ecritures = await prisma.journalEntry.findMany({
    select: {
      id: true,
      reference: true,
      lines: { select: { debit: true, credit: true } }
    }
  });

  const ecarts: string[] = [];

  for (const ecriture of ecritures) {
    const gauche = ecriture.lines.reduce((total, ligne) => total + nombre(ligne.debit), 0);
    const droite = ecriture.lines.reduce((total, ligne) => total + nombre(ligne.credit), 0);

    if (gauche !== droite) {
      ecarts.push(`écriture ${ecriture.reference ?? ecriture.id} : ${gauche} d'un côté, ${droite} de l'autre`);
    }
  }

  enregistrer('I2', 'Toute écriture comptable est équilibrée', ecritures.length, ecarts);
}

// ---------------------------------------------------------------------------
// I3 — Somme des imputations d'une pièce validée = montant de la pièce
// ---------------------------------------------------------------------------

async function verifierVentilationComplete(): Promise<void> {
  const ecarts: string[] = [];
  let examinees = 0;

  // Une facture de prestation peut n'avoir aucune imputation : seules celles
  // qui en portent sont contrôlées. Une facture de matériaux sans imputation
  // n'aurait pas pu être validée — c'est la règle du service, pas d'ici.
  const factures = await prisma.supplierInvoice.findMany({
    where: { status: 'VALIDATED' },
    select: { id: true, reference: true, amount: true, tenantId: true }
  });

  for (const facture of factures) {
    const somme = await prisma.costAllocation.aggregate({
      where: {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: facture.id,
        validatedAt: { not: null },
        voidedAt: null
      },
      _sum: { amount: true },
      _count: true
    });

    if (somme._count === 0) continue;
    examinees += 1;

    const ventile = nombre(somme._sum.amount);
    const montant = nombre(facture.amount);
    if (ventile !== montant) {
      ecarts.push(`facture ${facture.reference} : montant ${montant}, imputé ${ventile}`);
    }
  }

  // Une pièce de caisse porte une imputation et une seule, pour son montant.
  const pieces = await prisma.cashVoucher.findMany({
    where: { validatedAt: { not: null } },
    select: { id: true, voucherYear: true, voucherNumber: true, amount: true }
  });

  for (const piece of pieces) {
    if (await estAnnulee('CASH_VOUCHER', piece.id)) continue;
    examinees += 1;

    const somme = await prisma.costAllocation.aggregate({
      where: {
        sourceType: 'CASH_VOUCHER',
        sourceId: piece.id,
        validatedAt: { not: null },
        voidedAt: null
      },
      _sum: { amount: true },
      _count: true
    });

    const numero = `PC-${piece.voucherYear}-${String(piece.voucherNumber).padStart(4, '0')}`;
    const ventile = nombre(somme._sum.amount);
    const montant = nombre(piece.amount);

    if (somme._count === 0) {
      ecarts.push(`pièce de caisse ${numero} : validée mais sans imputation`);
    } else if (ventile !== montant) {
      ecarts.push(`pièce de caisse ${numero} : montant ${montant}, imputé ${ventile}`);
    }
  }

  enregistrer('I3', "Somme des imputations d'une pièce validée = montant de la pièce", examinees, ecarts);
}

// ---------------------------------------------------------------------------
// I4 — Numéro de pièce de caisse unique par agence et par année
// ---------------------------------------------------------------------------

/**
 * Un index unique `(tenantId, voucherYear, voucherNumber)` porte déjà l'unicité
 * en base. Ce contrôle ne la remplace pas : il la constate, il compte les
 * pièces — ce qui distingue « aucun doublon » de « aucune pièce » — et il
 * vérifie en plus les deux règles que l'index ne peut pas exprimer.
 *
 * **Seules les pièces validées portent un numéro.** Depuis la décision du
 * 19 septembre 2026, il est attribué à la validation : un brouillon numéroté
 * serait le signe que l'ancienne règle est revenue par une porte dérobée.
 *
 * **Les brouillons sont exclus du contrôle d'unicité.** Leurs deux colonnes
 * sont nulles, et PostgreSQL traite deux NULL comme distincts : les compter
 * ensemble ferait voir autant de « doublons » qu'il y a de brouillons.
 */
async function verifierNumerotation(): Promise<void> {
  const numerotees = await prisma.cashVoucher.findMany({
    where: { voucherNumber: { not: null } },
    select: { tenantId: true, voucherYear: true, voucherNumber: true }
  });

  const vus = new Map<string, number>();
  for (const piece of numerotees) {
    const cle = `${piece.tenantId}|${piece.voucherYear}|${piece.voucherNumber}`;
    vus.set(cle, (vus.get(cle) ?? 0) + 1);
  }

  const ecarts: string[] = [];
  for (const [cle, compte] of vus) {
    if (compte > 1) {
      const [, annee, numero] = cle.split('|');
      ecarts.push(`numéro ${numero} de ${annee} porté par ${compte} pièces d'une même agence`);
    }
  }

  const brouillonsNumerotes = await prisma.cashVoucher.count({
    where: { validatedAt: null, voucherNumber: { not: null } }
  });
  if (brouillonsNumerotes > 0) {
    ecarts.push(`${brouillonsNumerotes} brouillon(s) portent déjà un numéro : il doit être attribué à la validation`);
  }

  const validesSansNumero = await prisma.cashVoucher.count({
    where: { validatedAt: { not: null }, voucherNumber: null }
  });
  if (validesSansNumero > 0) {
    ecarts.push(`${validesSansNumero} pièce(s) validée(s) sans numéro`);
  }

  const total = await prisma.cashVoucher.count();
  enregistrer('I4', 'Numéro attribué à la validation, et unique par agence et par année', total, ecarts);
}

// ---------------------------------------------------------------------------
// I5 — Solde d'un compte fournisseur = facturé moins réglé
// ---------------------------------------------------------------------------

async function verifierSoldesFournisseurs(): Promise<void> {
  const fournisseurs = await prisma.supplier.findMany({
    select: { id: true, name: true, thirdPartyAccountId: true }
  });

  const ecarts: string[] = [];

  for (const fournisseur of fournisseurs) {
    const compte = await prisma.thirdPartyAccount.findUnique({
      where: { id: fournisseur.thirdPartyAccountId },
      select: { balance: true }
    });
    if (!compte) {
      ecarts.push(`fournisseur "${fournisseur.name}" : compte de tiers introuvable`);
      continue;
    }

    const facture = await prisma.supplierInvoice.aggregate({
      where: { supplierId: fournisseur.id, status: 'VALIDATED' },
      _sum: { amount: true }
    });

    // Les règlements n'ont pas de colonne de statut : validés et non annulés.
    const reglements = await prisma.supplierPayment.findMany({
      where: { supplierId: fournisseur.id, validatedAt: { not: null } },
      select: { id: true, amount: true }
    });

    let regle = 0;
    for (const reglement of reglements) {
      if (await estAnnulee('SUPPLIER_PAYMENT', reglement.id)) continue;
      regle += nombre(reglement.amount);
    }

    const attendu = nombre(facture._sum.amount) - regle;
    const constate = nombre(compte.balance);

    if (attendu !== constate) {
      ecarts.push(
        `fournisseur "${fournisseur.name}" : solde ${constate}, facturé moins réglé ${attendu} ` +
          `(écart ${constate - attendu})`
      );
    }
  }

  enregistrer('I5', 'Solde de compte fournisseur = facturé moins réglé', fournisseurs.length, ecarts);
}

// ---------------------------------------------------------------------------
// I6 — Une pièce validée porte une écriture verrouillée
// ---------------------------------------------------------------------------

async function verifierVerrouillage(): Promise<void> {
  const ecarts: string[] = [];
  let examinees = 0;

  async function controler(libelle: string, journalEntryId: string | null): Promise<void> {
    examinees += 1;
    if (!journalEntryId) {
      ecarts.push(`${libelle} : validée sans écriture comptable`);
      return;
    }
    const ecriture = await prisma.journalEntry.findUnique({
      where: { id: journalEntryId },
      select: { isLocked: true }
    });
    if (!ecriture) {
      ecarts.push(`${libelle} : écriture comptable introuvable`);
    } else if (!ecriture.isLocked) {
      ecarts.push(`${libelle} : écriture non verrouillée`);
    }
  }

  const factures = await prisma.supplierInvoice.findMany({
    where: { status: 'VALIDATED' },
    select: { id: true, reference: true, journalEntryId: true }
  });
  for (const facture of factures) {
    await controler(`facture ${facture.reference}`, facture.journalEntryId);
  }

  const pieces = await prisma.cashVoucher.findMany({
    where: { validatedAt: { not: null } },
    select: { id: true, voucherYear: true, voucherNumber: true, journalEntryId: true }
  });
  for (const piece of pieces) {
    if (await estAnnulee('CASH_VOUCHER', piece.id)) continue;
    const numero = `PC-${piece.voucherYear}-${String(piece.voucherNumber).padStart(4, '0')}`;
    await controler(`pièce de caisse ${numero}`, piece.journalEntryId);
  }

  const reglements = await prisma.supplierPayment.findMany({
    where: { validatedAt: { not: null } },
    select: { id: true, paymentDate: true, journalEntryId: true }
  });
  for (const reglement of reglements) {
    if (await estAnnulee('SUPPLIER_PAYMENT', reglement.id)) continue;
    const jour = reglement.paymentDate.toISOString().slice(0, 10);
    await controler(`règlement du ${jour}`, reglement.journalEntryId);
  }

  enregistrer('I6', 'Une pièce validée porte une écriture verrouillée', examinees, ecarts);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const jsonSeul = process.argv.slice(2).includes('--json');

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (erreur) {
    console.error("Base de données injoignable. Aucun chiffre n'est produit.");
    console.error(erreur instanceof Error ? erreur.message : String(erreur));
    process.exitCode = 2;
    await prisma.$disconnect();
    return;
  }

  await verifierCoutRecopie();
  await verifierEquilibre();
  await verifierVentilationComplete();
  await verifierNumerotation();
  await verifierSoldesFournisseurs();
  await verifierVerrouillage();

  await prisma.$disconnect();

  const totalEcarts = verdicts.reduce((total, verdict) => total + verdict.ecarts.length, 0);
  const totalExaminees = verdicts.reduce((total, verdict) => total + verdict.examinees, 0);

  if (jsonSeul) {
    console.log(JSON.stringify({ verdicts, totalEcarts, totalExaminees }, null, 2));
  } else {
    console.log('');
    console.log('Invariants du lot 2 — fournisseurs, chantiers, caisse');
    console.log('');
    for (const verdict of verdicts) {
      const etat = verdict.ecarts.length > 0 ? 'ECART ' : verdict.examinees === 0 ? 'a vide' : 'tenu  ';
      console.log(`  ${verdict.code}  ${etat}  ${verdict.intitule}`);
      console.log(`              ${verdict.examinees} ligne(s) examinee(s)`);
      for (const ecart of verdict.ecarts) {
        console.log(`              -> ${ecart}`);
      }
    }
    console.log('');
    if (totalExaminees === 0) {
      console.log('Aucune donnee de lot 2 en base : les six controles ont tourne a vide.');
      console.log("Ce n'est pas un succes. Il faut une base contenant des pieces validees.");
    } else if (totalEcarts === 0) {
      console.log(`Les six invariants tiennent, sur ${totalExaminees} lignes examinees.`);
    } else {
      console.log(`${totalEcarts} ecart(s) sur ${totalExaminees} lignes examinees.`);
    }
    console.log('');
  }

  process.exitCode = totalEcarts > 0 ? 1 : 0;
}

main().catch(async erreur => {
  console.error(erreur);
  await prisma.$disconnect();
  process.exitCode = 2;
});
