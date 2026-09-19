/**
 * Parcours de bout en bout — lot 4, associations, contre une vraie base.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi ce script existe, alors que 50 tests couvrent déjà les associations
 * ---------------------------------------------------------------------------
 *
 * Parce qu'aucun d'eux ne prouve ce qui compte le plus : **que la campagne de
 * facturation appelle la ventilation**.
 *
 * Le service a été écrit, testé, ses routes montées — et personne ne
 * l'appelait. `distributeInstallmentToPartnersTx` n'était référencée nulle
 * part hors de son propre fichier et de ses tests. L'agence n'aurait jamais
 * rien dû à personne, et la seule chose qui l'aurait signalé est un associé
 * qui finit par réclamer son argent.
 *
 * Le test unitaire de la campagne ne peut pas le dire : il remplace Prisma par
 * une doublure, et la ventilation, qui **ne lève jamais** par contrat, y passe
 * en silence sans rien trouver. Un test qui ne peut pas échouer ne prouve
 * rien. C'est le même angle mort qu'aux lots 2 et 3, et c'est ce script qui
 * le couvre.
 *
 * ---------------------------------------------------------------------------
 * Ce qu'il prouve
 * ---------------------------------------------------------------------------
 *
 *   1. La campagne ventile : les deux associés voient leur compte crédité.
 *   2. Le locataire doit le loyer ENTIER. Ce qui se répartit est le produit,
 *      jamais la créance — et une agence qui se tromperait là-dessus
 *      réclamerait 60 % du loyer à son locataire.
 *   3. La somme des parts vaut le montant réparti, au franc près, reliquat
 *      d'arrondi compris.
 *   4. Rejouer la campagne ne redistribue rien. Sans cette idempotence, une
 *      campagne relancée doublerait ce que l'agence doit à ses associés.
 *   5. Un bien sans association ne produit aucune ventilation, et sa
 *      facturation se déroule normalement.
 *
 * Sécurité, identique aux lots précédents : refus en production, tenant
 * jetable au slug reconnaissable, nettoyage systématique, et jamais de
 * prétention d'avoir nettoyé ce qui ne l'a pas été.
 *
 * Usage :
 *   npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot4-associations.ts
 *   npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot4-associations.ts --nettoyer-restes
 */

import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { prisma } from '../src/utils/database';
import { runRentBilling } from '../src/lib/finance/billing-run';
import {
  addPartnershipShareTx,
  attachPropertyToPartnershipTx,
  createPartnershipTx,
  getPartnerStatement
} from '../src/lib/finance/partnerships';

const RUN_ID = uuidv4().slice(0, 8);
const TENANT_SLUG = `e2e-finance-lot4-assoc-jetable-${RUN_ID}`;
const PREFIXE_COURRIEL = `e2e-lot4-assoc-${RUN_ID}-`;

/**
 * Un loyer qui ne se divise PAS proprement par les quotes-parts choisies.
 *
 * 333 333 à 60 / 40 donne 199 999,8 et 133 333,2 : le reliquat est inévitable,
 * et c'est tout l'intérêt. Un montant qui tomberait juste ne prouverait rien
 * de la règle d'arrondi.
 */
const LOYER = 333_333;
const PART_CAMARA = 60;
const PART_DIALLO = 40;

const PERIODE = { annee: 2026, mois: 7 };

const constats: Array<{ intitule: string; tenu: boolean }> = [];

function constater(intitule: string, attendu: unknown, constate: unknown): void {
  const tenu = JSON.stringify(attendu) === JSON.stringify(constate);
  constats.push({ intitule, tenu });
  const marque = tenu ? 'OK  ' : 'ECHEC';
  console.log(`  ${marque} ${intitule}`);
  if (!tenu) {
    console.log(`        attendu  : ${JSON.stringify(attendu)}`);
    console.log(`        constate : ${JSON.stringify(constate)}`);
  }
}

function nombre(valeur: unknown): number {
  return valeur === null || valeur === undefined ? 0 : Number(valeur);
}

async function soldeDeCompte(accountId: string): Promise<number> {
  const compte = await prisma.thirdPartyAccount.findUnique({
    where: { id: accountId },
    select: { balance: true }
  });
  return nombre(compte?.balance);
}

async function nettoyer(tenantId: string): Promise<string | null> {
  try {
    const clients = await prisma.tenantClient.findMany({ where: { tenantId }, select: { id: true, userId: true } });
    const ecritures = await prisma.journalEntry.findMany({ where: { tenantId }, select: { id: true } });

    await prisma.partnershipDistribution.deleteMany({ where: { tenantId } });
    await prisma.rentalInstallment.deleteMany({ where: { tenant_id: tenantId } });
    await prisma.rentalLease.deleteMany({ where: { tenant_id: tenantId } });
    await prisma.rentBillingRun.deleteMany({ where: { tenantId } });

    // Les biens portent le lien vers l'association : il tombe avant elle.
    await prisma.property.updateMany({ where: { tenantId }, data: { partnershipId: null } });
    await prisma.partnershipShare.deleteMany({ where: { partnership: { tenantId } } });
    await prisma.partnership.deleteMany({ where: { tenantId } });

    await prisma.thirdPartyMovement.deleteMany({ where: { tenantId } });
    await prisma.thirdPartyAccount.deleteMany({ where: { tenantId } });

    if (ecritures.length) {
      await prisma.journalEntryLine.deleteMany({ where: { entryId: { in: ecritures.map(e => e.id) } } });
    }
    await prisma.journalEntry.deleteMany({ where: { tenantId } });
    await prisma.accountingJournal.deleteMany({ where: { tenantId } });
    await prisma.chartOfAccount.deleteMany({ where: { tenantId } });

    await prisma.property.deleteMany({ where: { tenantId } });
    if (clients.length) {
      await prisma.tenantClient.deleteMany({ where: { id: { in: clients.map(c => c.id) } } });
    }

    await prisma.tenant.delete({ where: { id: tenantId } });
    // `User` ne porte pas de `tenantId` : on ne peut le retrouver que par le
    // prefixe de courriel du tour. Lecon du parcours du lot 4.
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-lot4-assoc-', endsWith: '@immotopia.invalid' } }
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
      where: { slug: { startsWith: 'e2e-finance-lot4-assoc-jetable-' } },
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
    // -----------------------------------------------------------------------
    // Le decor
    // -----------------------------------------------------------------------
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Agence jetable — associations (lot 4)',
        slug: TENANT_SLUG,
        type: 'AGENCY',
        website: 'https://e2e.invalid/finance-lot4-associations',
        status: 'ACTIVE'
      }
    });
    tenantId = tenant.id;

    const gestionnaire = await prisma.user.create({
      data: {
        email: `${PREFIXE_COURRIEL}gestionnaire@immotopia.invalid`,
        fullName: 'Gestionnaire jetable',
        isActive: true
      }
    });

    const locataireUser = await prisma.user.create({
      data: {
        email: `${PREFIXE_COURRIEL}locataire@immotopia.invalid`,
        fullName: 'Aminata Sylla',
        isActive: true
      }
    });
    const locataire = await prisma.tenantClient.create({
      data: { userId: locataireUser.id, tenantId: tenant.id, clientType: 'RENTER' }
    });

    const locataireSolo = await prisma.user.create({
      data: {
        email: `${PREFIXE_COURRIEL}locataire-solo@immotopia.invalid`,
        fullName: 'Ibrahima Sow',
        isActive: true
      }
    });
    const clientSolo = await prisma.tenantClient.create({
      data: { userId: locataireSolo.id, tenantId: tenant.id, clientType: 'RENTER' }
    });

    /** Le bien detenu en association. */
    const bienPartage = await prisma.property.create({
      data: {
        internalReference: `E2E-ASSOC-${RUN_ID}`,
        propertyType: 'IMMEUBLE',
        ownershipType: 'TENANT',
        tenantId: tenant.id,
        title: 'Immeuble Nongo — detenu en association',
        description: 'Bien jetable du parcours des associations.',
        address: 'Nongo, Conakry',
        currency: 'XOF',
        status: 'DRAFT'
      }
    });

    /** Le temoin : un bien sans association, qui doit se facturer normalement. */
    const bienSolo = await prisma.property.create({
      data: {
        internalReference: `E2E-SOLO-${RUN_ID}`,
        propertyType: 'IMMEUBLE',
        ownershipType: 'TENANT',
        tenantId: tenant.id,
        title: 'Villa Kipe — sans association',
        description: 'Bien temoin : aucune association, aucune ventilation attendue.',
        address: 'Kipe, Conakry',
        currency: 'XOF',
        status: 'DRAFT'
      }
    });

    const debutBail = new Date(Date.UTC(PERIODE.annee, PERIODE.mois - 2, 1));

    async function creerBail(numero: string, propertyId: string, clientId: string): Promise<string> {
      const bail = await prisma.rentalLease.create({
        data: {
          tenant_id: tenant.id,
          property_id: propertyId,
          primary_renter_client_id: clientId,
          lease_number: numero,
          status: 'ACTIVE',
          start_date: debutBail,
          billing_frequency: 'MONTHLY',
          due_day_of_month: 5,
          currency: 'XOF',
          rent_amount: new Prisma.Decimal(LOYER),
          service_charge_amount: new Prisma.Decimal(0),
          security_deposit_amount: new Prisma.Decimal(0),
          penalty_grace_days: 0,
          penalty_mode: 'PERCENT_OF_BALANCE',
          penalty_rate: new Prisma.Decimal(0),
          penalty_fixed_amount: new Prisma.Decimal(0),
          created_by_user_id: gestionnaire.id
        }
      });
      return bail.id;
    }

    await creerBail(`BAIL-ASSOC-${RUN_ID}`, bienPartage.id, locataire.id);
    await creerBail(`BAIL-SOLO-${RUN_ID}`, bienSolo.id, clientSolo.id);

    // -----------------------------------------------------------------------
    // L'association et ses deux associes
    // -----------------------------------------------------------------------
    console.log("\nL'association");

    const association = await prisma.$transaction(async tx => {
      const cree = await createPartnershipTx(tx, tenant.id, { label: 'Indivision Nongo' });
      await addPartnershipShareTx(tx, tenant.id, {
        partnershipId: cree.id,
        partnerName: 'Mamadou Camara',
        sharePercent: PART_CAMARA
      });
      await addPartnershipShareTx(tx, tenant.id, {
        partnershipId: cree.id,
        partnerName: 'Fatoumata Diallo',
        sharePercent: PART_DIALLO
      });
      return attachPropertyToPartnershipTx(tx, tenant.id, bienPartage.id, cree.id);
    });

    if (!association) {
      throw new Error("L'association n'a pas ete rattachee au bien.");
    }

    constater('deux associes, cent pour cent repartis', 100, association.totalSharePercent);
    constater("la part de l'entreprise est nulle", 0, association.companySharePercent);
    constater('le bien est rattache', 1, association.properties.length);

    const partCamara = association.shares.find(s => s.partnerName === 'Mamadou Camara');
    const partDiallo = association.shares.find(s => s.partnerName === 'Fatoumata Diallo');
    if (!partCamara || !partDiallo) {
      throw new Error('Les deux parts sont introuvables apres creation.');
    }

    constater('chaque associe a son compte de tiers', true, Boolean(partCamara.partnerAccountId));

    // -----------------------------------------------------------------------
    // La campagne — LE point de ce script
    // -----------------------------------------------------------------------
    console.log('\nLa campagne de facturation');

    const campagne = await runRentBilling(
      tenant.id,
      { periodYear: PERIODE.annee, periodMonth: PERIODE.mois },
      gestionnaire.id
    );

    constater('les deux baux sont factures', 2, campagne.summary?.billed.length ?? 0);

    const ventilations = await prisma.partnershipDistribution.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'asc' }
    });

    // C'EST LE CONSTAT QUI COMPTE. S'il tombe a zero, la ventilation n'est
    // appelee par personne — et c'etait exactement le cas avant l'integration.
    constater('la campagne a ventile', 2, ventilations.length);

    const montants = ventilations.map(v => nombre(v.amount)).sort((a, b) => b - a);
    constater('la somme des parts vaut le loyer entier', LOYER, montants[0] + montants[1]);
    // 333 333 x 60 % = 199 999,8 -> 200 000 apres arrondi, et le premier
    // associe absorbe le reliquat. Le second recoit ce qui reste.
    constater('le reliquat va au premier associe', [200_000, 133_333], montants);

    const soldeCamara = await soldeDeCompte(partCamara.partnerAccountId);
    const soldeDiallo = await soldeDeCompte(partDiallo.partnerAccountId);
    constater('le compte de Camara porte sa part', 200_000, soldeCamara);
    constater('le compte de Diallo porte la sienne', 133_333, soldeDiallo);

    // -----------------------------------------------------------------------
    // Le locataire doit le loyer ENTIER
    // -----------------------------------------------------------------------
    console.log('\nCe que le locataire doit');

    const compteLocataire = await prisma.thirdPartyAccount.findFirst({
      where: { tenantId: tenant.id, kind: 'TENANT', tenantClientId: locataire.id },
      select: { id: true, balance: true }
    });

    // Une agence qui se tromperait ici reclamerait 60 % du loyer a son
    // locataire, et perdrait 40 % de son chiffre sans le voir.
    constater('le locataire doit le loyer entier, pas une quote-part', LOYER, nombre(compteLocataire?.balance));

    // -----------------------------------------------------------------------
    // Le temoin : pas d'association, pas de ventilation
    // -----------------------------------------------------------------------
    const ventilationsDuSolo = await prisma.partnershipDistribution.count({
      where: { tenantId: tenant.id, rentalInstallment: { lease: { property_id: bienSolo.id } } }
    });
    constater('un bien sans association ne ventile rien', 0, ventilationsDuSolo);

    // -----------------------------------------------------------------------
    // Rejouer la campagne ne double rien
    // -----------------------------------------------------------------------
    console.log('\nLa campagne rejouee');

    await runRentBilling(tenant.id, { periodYear: PERIODE.annee, periodMonth: PERIODE.mois }, gestionnaire.id);

    const apresRejeu = await prisma.partnershipDistribution.count({ where: { tenantId: tenant.id } });
    constater('rejouer ne redistribue rien', 2, apresRejeu);
    constater('le compte de Camara n a pas bouge', 200_000, await soldeDeCompte(partCamara.partnerAccountId));

    // -----------------------------------------------------------------------
    // L'etat de quote-part
    // -----------------------------------------------------------------------
    console.log('\nL etat de quote-part');

    const releve = await getPartnerStatement(tenant.id, partCamara.id);
    constater('une ligne, celle du mois facture', 1, releve.lines.length);
    constater('le loyer facture y figure en entier', LOYER, releve.lines[0]?.rentBilled);
    constater('sa part y figure', 200_000, releve.totalShare);
    constater('rien ne lui a encore ete reverse', 0, releve.totalPaidOut);
    // Le champ ajoute a la relecture : le contrat evoquait cette grandeur en
    // prose sans jamais l'exposer.
    constater('son solde dit ce qui lui reste du', 200_000, releve.accountBalance);
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

    // On ne pretend jamais avoir nettoye ce qui ne l'a pas ete : un reste non
    // signale se retrouve un jour dans une mesure et fausse tout.
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
