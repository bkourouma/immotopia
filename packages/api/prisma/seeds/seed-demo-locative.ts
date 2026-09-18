/**
 * Jeu de données de démonstration — module Gestion locative.
 *
 * Construit, sur une agence qui a déjà ses biens et ses contacts, le cycle
 * locatif complet que suit la démonstration client : baux, échéances, dépôts de
 * garantie, encaissements (Mobile Money en tête), affectations, retards,
 * pénalités, déclarations de paiement en attente et programmes de travaux.
 *
 * Deux partis pris.
 *
 *   1. **Tout passe par les services de l'application**, jamais par des
 *      insertions directes. Les échéances sont générées par
 *      `generateInstallments`, les affectations par `allocatePayment`, les
 *      pénalités par `calculatePenaltiesForOverdueInstallments`. Un jeu de
 *      données écrit à la main finit toujours par diverger de ce que le produit
 *      sait produire, et la démonstration bute alors sur une incohérence que
 *      personne n'avait vue.
 *
 *   2. **Aucun envoi sortant.** Le SMTP de l'agence est configuré : créer un
 *      bail déclenche un e-mail de bail activé, et créer un compte portail
 *      déclenche une invitation avec jeton de réinitialisation. Sur dix-sept
 *      baux, cela ferait partir une trentaine de messages réels, dont la
 *      plupart vers des adresses `@example.ci` qui rebondiraient. Les variables
 *      d'environnement sont donc neutralisées avant tout import de service —
 *      les envois échouent en local, et les services les rattrapent déjà.
 *
 * Le script est **idempotent** : un bien qui porte déjà un bail est ignoré.
 * On peut le relancer sans dupliquer quoi que ce soit.
 *
 * Usage : npm run db:seed:demo-locative -w @immotopia/api
 */

// ⚠ Avant tout import : les services lisent ces variables au premier envoi.
process.env.EMAIL_SMTP_HOST = '127.0.0.1';
process.env.EMAIL_SMTP_PORT = '1';
process.env.EMAIL_SMTP_USER = '';
process.env.EMAIL_SMTP_PASS = '';
delete process.env.SENDGRID_API_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;

import {
  PrismaClient,
  RentalBillingFrequency,
  RentalPenaltyMode,
  RentalPaymentMethod,
  RentalDepositMovementType,
  PaymentDeclarationStatus,
  WorkProgramStatus
} from '@prisma/client';

import { createLease } from '../../src/services/rental-lease-service';
import { generateInstallments, recalculateInstallmentStatuses } from '../../src/services/rental-installment-service';
import { createPayment, allocatePayment } from '../../src/services/rental-payment-service';
import { createDeposit, createDepositMovement } from '../../src/services/rental-deposit-service';
import { calculatePenaltiesForOverdueInstallments } from '../../src/services/rental-penalty-service';

const prisma = new PrismaClient();

const TENANT_ID = process.env.DEMO_TENANT_ID || '385a1e76-ac08-4db5-9802-8b2ddfb1672b';

/** Aujourd'hui, ramené à minuit : toutes les dates du jeu en dépendent. */
const AUJOURDHUI = new Date();
AUJOURDHUI.setHours(0, 0, 0, 0);

function ilYAMois(n: number): Date {
  const d = new Date(AUJOURDHUI);
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return d;
}

function dansMois(depuis: Date, n: number): Date {
  const d = new Date(depuis);
  d.setMonth(d.getMonth() + n);
  return d;
}

/**
 * Scénario d'un bail. C'est lui qui décide de ce que la démonstration pourra
 * montrer sur l'écran concerné.
 *
 *   `a_jour`      — toutes les échéances échues sont soldées.
 *   `retard`      — les N dernières échues restent impayées : pénalités.
 *   `partiel`     — la dernière échue n'est couverte qu'à moitié.
 *   `declaration` — à jour, plus une déclaration du locataire à valider.
 */
type Scenario = 'a_jour' | 'retard' | 'partiel' | 'declaration';

interface PlanBail {
  /** Fragment distinctif du titre du bien, tel qu'il existe en base. */
  bien: string;
  /** E-mail du contact CRM locataire. */
  locataire: string;
  frequence: RentalBillingFrequency;
  /** Ancienneté du bail, en mois. */
  depuisMois: number;
  /** Durée du bail, en mois. */
  dureeMois: number;
  loyer: number;
  charges: number;
  caution: number;
  jourEcheance: number;
  scenario: Scenario;
  /** Pour `retard` : nombre d'échéances échues laissées impayées. */
  impayees?: number;
  note: string;
}

/**
 * Le plan. Dix-sept baux, choisis pour couvrir ce que la démonstration
 * traverse : les deux entrepôts et les bureaux en trimestriel (le rythme d'un
 * bailleur de locaux professionnels), les logements et les magasins en mensuel,
 * et un échantillon de situations — à jour, en retard, partiel, en attente de
 * validation.
 */
const PLAN: PlanBail[] = [
  // — Le bail du portail locataire : c'est celui qu'on ouvre côté locataire.
  {
    bien: 'Appartement D1',
    locataire: 'scolarflow@gmail.com',
    frequence: RentalBillingFrequency.MONTHLY,
    depuisMois: 14,
    dureeMois: 24,
    loyer: 120000,
    charges: 15000,
    caution: 240000,
    jourEcheance: 5,
    scenario: 'declaration',
    note: 'Bail habitation — locataire à jour, une déclaration de paiement à valider.'
  },

  // — Les deux entrepôts : le besoin exprimé par le prospect.
  {
    bien: 'Magasin de stockage 500',
    locataire: 'seydou.traore@example.ci',
    frequence: RentalBillingFrequency.QUARTERLY,
    depuisMois: 12,
    dureeMois: 36,
    loyer: 1500000,
    charges: 120000,
    caution: 3000000,
    jourEcheance: 5,
    scenario: 'declaration',
    note: 'Entrepôt Yopougon Zone Industrielle — facturation trimestrielle.'
  },
  {
    bien: 'Entrepôt 1 200',
    locataire: 'aboubacar.sylla@example.ci',
    frequence: RentalBillingFrequency.QUARTERLY,
    depuisMois: 10,
    dureeMois: 36,
    loyer: 4500000,
    charges: 350000,
    caution: 9000000,
    jourEcheance: 10,
    scenario: 'a_jour',
    note: 'Entrepôt zone portuaire Treichville — le plus gros loyer du portefeuille.'
  },

  // — Bureaux : trimestriel également.
  {
    bien: 'Plateau de bureaux 1er étage',
    locataire: 'olivier.seri@example.ci',
    frequence: RentalBillingFrequency.QUARTERLY,
    depuisMois: 12,
    dureeMois: 36,
    loyer: 1400000,
    charges: 150000,
    caution: 2800000,
    jourEcheance: 5,
    scenario: 'a_jour',
    note: 'Immeuble VGE Marcory — plateau du 1er étage.'
  },
  {
    bien: 'Plateau de bureaux 2e étage',
    locataire: 'patrick.dago@example.ci',
    frequence: RentalBillingFrequency.QUARTERLY,
    depuisMois: 9,
    dureeMois: 36,
    loyer: 1400000,
    charges: 150000,
    caution: 2800000,
    jourEcheance: 5,
    scenario: 'retard',
    impayees: 1,
    note: 'Immeuble VGE Marcory — plateau du 2e étage, un trimestre impayé.'
  },
  {
    bien: 'Plateau de bureaux 200',
    locataire: 'rodrigue.gogoua@example.ci',
    frequence: RentalBillingFrequency.QUARTERLY,
    depuisMois: 6,
    dureeMois: 36,
    loyer: 2000000,
    charges: 200000,
    caution: 4000000,
    jourEcheance: 5,
    scenario: 'a_jour',
    note: 'Plateau Centre — bureaux 200 m².'
  },

  // — Commerces.
  {
    bien: 'Magasin M1',
    locataire: 'salimata.kone@example.ci',
    frequence: RentalBillingFrequency.MONTHLY,
    depuisMois: 13,
    dureeMois: 24,
    loyer: 180000,
    charges: 20000,
    caution: 360000,
    jourEcheance: 5,
    scenario: 'a_jour',
    note: 'Magasin en rez-de-chaussée — Adjamé Liberté.'
  },
  {
    bien: 'Magasin M2',
    locataire: 'eric.zoro@example.ci',
    frequence: RentalBillingFrequency.MONTHLY,
    depuisMois: 13,
    dureeMois: 24,
    loyer: 180000,
    charges: 20000,
    caution: 360000,
    jourEcheance: 5,
    scenario: 'retard',
    impayees: 3,
    note: 'Magasin M2 — trois mois impayés, le dossier de recouvrement de la démo.'
  },
  {
    bien: 'Boutique 60',
    locataire: 'prisca.kacou@example.ci',
    frequence: RentalBillingFrequency.MONTHLY,
    depuisMois: 8,
    dureeMois: 24,
    loyer: 450000,
    charges: 45000,
    caution: 900000,
    jourEcheance: 5,
    scenario: 'a_jour',
    note: 'Boutique sur boulevard — Marcory Zone 4.'
  },

  // — Logements.
  {
    bien: 'Appartement D2',
    locataire: 'solange.gnahore@example.ci',
    frequence: RentalBillingFrequency.MONTHLY,
    depuisMois: 11,
    dureeMois: 24,
    loyer: 90000,
    charges: 10000,
    caution: 180000,
    jourEcheance: 5,
    scenario: 'retard',
    impayees: 2,
    note: 'Deux mois impayés.'
  },
  {
    bien: 'Appartement D3',
    locataire: 'kadiatou.cisse@example.ci',
    frequence: RentalBillingFrequency.MONTHLY,
    depuisMois: 10,
    dureeMois: 24,
    loyer: 120000,
    charges: 15000,
    caution: 240000,
    jourEcheance: 5,
    scenario: 'a_jour',
    note: 'Bail habitation à jour.'
  },
  {
    bien: 'Appartement D4',
    locataire: 'herve.digbeu@example.ci',
    frequence: RentalBillingFrequency.MONTHLY,
    depuisMois: 9,
    dureeMois: 24,
    loyer: 90000,
    charges: 10000,
    caution: 180000,
    jourEcheance: 5,
    scenario: 'partiel',
    note: 'Dernière échéance réglée à moitié — statut partiel.'
  },
  {
    bien: 'Appartement E1',
    locataire: 'estelle.loukou@example.ci',
    frequence: RentalBillingFrequency.MONTHLY,
    depuisMois: 7,
    dureeMois: 24,
    loyer: 120000,
    charges: 15000,
    caution: 240000,
    jourEcheance: 5,
    scenario: 'a_jour',
    note: 'Bail habitation à jour.'
  },
  {
    bien: 'Appartement E2',
    locataire: 'landry.tape@example.ci',
    frequence: RentalBillingFrequency.MONTHLY,
    depuisMois: 6,
    dureeMois: 24,
    loyer: 120000,
    charges: 15000,
    caution: 240000,
    jourEcheance: 5,
    scenario: 'retard',
    impayees: 1,
    note: 'Un mois impayé.'
  },
  {
    bien: 'Appartement E3',
    locataire: 'nadege.amani@example.ci',
    frequence: RentalBillingFrequency.MONTHLY,
    depuisMois: 5,
    dureeMois: 24,
    loyer: 120000,
    charges: 15000,
    caution: 240000,
    jourEcheance: 5,
    scenario: 'a_jour',
    note: 'Bail habitation à jour.'
  },
  {
    bien: 'Villa jumelée 5 pièces',
    locataire: 'rokia.ouattara@example.ci',
    frequence: RentalBillingFrequency.MONTHLY,
    depuisMois: 4,
    dureeMois: 24,
    loyer: 350000,
    charges: 30000,
    caution: 700000,
    jourEcheance: 5,
    scenario: 'a_jour',
    note: 'Villa jumelée — Attécoubé Locodjro.'
  },
  {
    bien: 'Duplex 5 pièces avec terrasse',
    locataire: 'carine.ehouman@example.ci',
    frequence: RentalBillingFrequency.MONTHLY,
    depuisMois: 2,
    dureeMois: 24,
    loyer: 700000,
    charges: 60000,
    caution: 1400000,
    jourEcheance: 5,
    scenario: 'a_jour',
    note: 'Duplex avec terrasse — Riviera Bonoumin.'
  },
  {
    bien: 'Studio étudiant',
    locataire: 'aicha.silue@example.ci',
    frequence: RentalBillingFrequency.MONTHLY,
    depuisMois: 1,
    dureeMois: 12,
    loyer: 95000,
    charges: 8000,
    caution: 190000,
    jourEcheance: 5,
    scenario: 'a_jour',
    note: 'Bail récent — le portefeuille bouge encore.'
  }
];

/** Opérateurs Mobile Money, tels que l'application les propose. */
const OPERATEURS = ['ORANGE', 'MTN', 'MOOV', 'WAVE'];

/**
 * Méthodes d'encaissement du portefeuille. Le Mobile Money domine, comme dans
 * la réalité ivoirienne — c'est ce que la démonstration doit refléter.
 */
const METHODES: RentalPaymentMethod[] = [
  RentalPaymentMethod.MOBILE_MONEY,
  RentalPaymentMethod.MOBILE_MONEY,
  RentalPaymentMethod.MOBILE_MONEY,
  RentalPaymentMethod.MOBILE_MONEY,
  RentalPaymentMethod.BANK_TRANSFER,
  RentalPaymentMethod.BANK_TRANSFER,
  RentalPaymentMethod.CASH,
  RentalPaymentMethod.CHECK
];

/**
 * Reste dû d'une échéance.
 *
 * `total_due` est calculé par le service au moment de la lecture, il n'existe
 * pas en colonne. Le lire directement sur une ligne Prisma renvoie `undefined`
 * — silencieusement, puisque rien ne type ces objets.
 */
function montantDu(e: {
  amount_rent: unknown;
  amount_service: unknown;
  amount_other_fees: unknown;
  penalty_amount: unknown;
  amount_paid: unknown;
}): number {
  return (
    Number(e.amount_rent) +
    Number(e.amount_service) +
    Number(e.amount_other_fees) +
    Number(e.penalty_amount) -
    Number(e.amount_paid)
  );
}

/** Suite déterministe : deux exécutions produisent le même jeu. */
let graine = 20260915;
function alea(max: number): number {
  graine = (graine * 1103515245 + 12345) % 2147483648;
  return Math.floor((graine / 2147483648) * max);
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { name: true } });
  if (!tenant) throw new Error(`Agence ${TENANT_ID} introuvable`);

  const membre = await prisma.membership.findFirst({
    where: { tenantId: TENANT_ID },
    select: { userId: true, user: { select: { email: true } } }
  });
  if (!membre) throw new Error('Aucun collaborateur sur cette agence : il en faut un comme auteur des écritures');
  const acteur = membre.userId;

  console.log(`Agence : ${tenant.name}`);
  console.log(`Auteur des écritures : ${membre.user?.email}\n`);

  // ---------------------------------------------------------------- règle
  // Sans règle active, le calcul de pénalité crée une règle par défaut à 2 %
  // sans délai de grâce — ce qui pénaliserait dès le premier jour de retard.
  const regle = await prisma.rentalPenaltyRule.findFirst({ where: { tenant_id: TENANT_ID, is_active: true } });
  if (!regle) {
    await prisma.rentalPenaltyRule.create({
      data: {
        tenant_id: TENANT_ID,
        is_active: true,
        grace_days: 5,
        mode: RentalPenaltyMode.PERCENT_OF_BALANCE,
        fixed_amount: 0,
        // Le service applique `solde x (taux / 100)` : le taux se saisit en
        // points de pourcentage. 0.05 vaudrait 0,05 %, soit 100 F sur 200 000.
        rate: 5,
        cap_amount: 250000,
        min_balance_to_apply: 5000
      }
    });
    console.log('Règle de pénalité créée : 5 jours de grâce, 5 % du solde, plafond 250 000.');
  } else {
    console.log('Règle de pénalité déjà en place, conservée.');
  }

  let creesBaux = 0;
  let creesEcheances = 0;
  let creesPaiements = 0;
  const bauxCrees: { id: string; plan: PlanBail; renterClientId: string }[] = [];

  for (const plan of PLAN) {
    const bien = await prisma.property.findFirst({
      where: { tenantId: TENANT_ID, title: { contains: plan.bien } },
      select: { id: true, title: true }
    });
    if (!bien) {
      console.log(`  ⨯ bien introuvable : « ${plan.bien} » — ignoré`);
      continue;
    }

    const dejaLoue = await prisma.rentalLease.findFirst({
      where: { tenant_id: TENANT_ID, property_id: bien.id }
    });
    if (dejaLoue) {
      console.log(`  = ${bien.title} porte déjà ${dejaLoue.lease_number} — ignoré`);
      continue;
    }

    const contact = await prisma.crmContact.findFirst({
      where: { tenantId: TENANT_ID, email: plan.locataire },
      select: { id: true, firstName: true, lastName: true }
    });
    if (!contact) {
      console.log(`  ⨯ locataire introuvable : ${plan.locataire} — bien « ${bien.title} » ignoré`);
      continue;
    }

    const debut = ilYAMois(plan.depuisMois);
    const fin = dansMois(debut, plan.dureeMois);

    const bail = await createLease(
      TENANT_ID,
      {
        propertyId: bien.id,
        primaryRenterContactId: contact.id,
        startDate: debut,
        endDate: fin,
        billingFrequency: plan.frequence,
        dueDayOfMonth: plan.jourEcheance,
        currency: 'XOF',
        rentAmount: plan.loyer,
        serviceChargeAmount: plan.charges,
        securityDepositAmount: plan.caution,
        penaltyGraceDays: 5,
        penaltyMode: RentalPenaltyMode.PERCENT_OF_BALANCE,
        penaltyRate: 5,
        penaltyCapAmount: 250000,
        moveInDate: debut,
        notes: plan.note
      },
      acteur
    );

    const echeances = await generateInstallments(TENANT_ID, bail.id, acteur);
    creesBaux++;
    creesEcheances += echeances.length;

    const clientId = (bail as unknown as { primary_renter_client_id: string }).primary_renter_client_id;
    bauxCrees.push({ id: bail.id, plan, renterClientId: clientId });

    console.log(
      `  + ${bail.lease_number}  ${bien.title.slice(0, 46).padEnd(46)} ${String(plan.frequence).padEnd(9)} ${echeances.length} échéances`
    );

    // ------------------------------------------------------------- caution
    const depot = await createDeposit(TENANT_ID, bail.id, acteur);
    const paiementCaution = await createPayment(
      TENANT_ID,
      {
        leaseId: bail.id,
        renterClientId: clientId,
        method: RentalPaymentMethod.MOBILE_MONEY,
        amount: plan.caution,
        currency: 'XOF',
        mmOperator: OPERATEURS[alea(OPERATEURS.length)],
        mmPhone: `07${String(10000000 + alea(89999999)).slice(0, 8)}`,
        pspName: 'CinetPay',
        pspTransactionId: `TXN-CAUTION-${bail.lease_number}`,
        pspReference: `REF-CAUTION-${bail.lease_number}`,
        idempotencyKey: `caution-${bail.id}`
      },
      acteur
    );
    await createDepositMovement(
      TENANT_ID,
      depot.id,
      RentalDepositMovementType.COLLECT,
      plan.caution,
      paiementCaution.id,
      undefined,
      "Dépôt de garantie encaissé à l'entrée dans les lieux",
      acteur
    );
    creesPaiements++;

    // ---------------------------------------------------------- règlements
    const echues = echeances
      .filter(e => new Date(e.due_date) <= AUJOURDHUI)
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

    const impayees = plan.scenario === 'retard' ? (plan.impayees ?? 1) : 0;
    const aRegler = echues.slice(0, Math.max(0, echues.length - impayees));

    for (let i = 0; i < aRegler.length; i++) {
      const ech = aRegler[i];
      const derniere = i === aRegler.length - 1;
      // `total_due` n'existe pas en base : c'est un calcul. Le lire renvoie
      // `undefined`, et l'echeance se retrouve reglee au mauvais montant.
      const total = montantDu(ech);
      const montant = plan.scenario === 'partiel' && derniere ? Math.round(total / 2) : total;
      const methode = METHODES[alea(METHODES.length)];
      const estMM = methode === RentalPaymentMethod.MOBILE_MONEY;

      const paiement = await createPayment(
        TENANT_ID,
        {
          leaseId: bail.id,
          renterClientId: clientId,
          method: methode,
          amount: montant,
          currency: 'XOF',
          mmOperator: estMM ? OPERATEURS[alea(OPERATEURS.length)] : undefined,
          mmPhone: estMM ? `07${String(10000000 + alea(89999999)).slice(0, 8)}` : undefined,
          pspName: estMM ? 'CinetPay' : undefined,
          pspTransactionId: estMM ? `TXN-${bail.lease_number}-${i + 1}` : undefined,
          pspReference: `REF-${bail.lease_number}-${i + 1}`,
          idempotencyKey: `reglement-${ech.id}`
        },
        acteur
      );

      await allocatePayment(TENANT_ID, paiement.id, { installmentIds: [ech.id] }, acteur);
      creesPaiements++;
    }

    await recalculateInstallmentStatuses(TENANT_ID, bail.id);
  }

  // ------------------------------------------------------------- pénalités
  console.log('\nCalcul des pénalités sur les échéances en retard…');
  const penalites = await calculatePenaltiesForOverdueInstallments(TENANT_ID, acteur);
  const nbPenalites = Array.isArray(penalites) ? penalites.length : 0;
  console.log(`  ${nbPenalites} pénalité(s) calculée(s).`);

  // ----------------------------------------------------- déclarations
  // Le circuit « le locataire déclare, l'agence valide » n'a rien à montrer si
  // la file d'attente est vide. On y dépose les déclarations des baux marqués.
  let declarations = 0;
  for (const { id, plan, renterClientId } of bauxCrees) {
    if (plan.scenario !== 'declaration') continue;

    const prochaine = await prisma.rentalInstallment.findFirst({
      where: { tenant_id: TENANT_ID, lease_id: id, status: { in: ['DUE', 'OVERDUE', 'PARTIAL'] } },
      orderBy: { due_date: 'asc' }
    });
    if (!prochaine) continue;

    const dejaLa = await prisma.rentalPaymentDeclaration.findFirst({
      where: { tenant_id: TENANT_ID, lease_id: id, status: PaymentDeclarationStatus.PENDING }
    });
    if (dejaLa) continue;

    await prisma.rentalPaymentDeclaration.create({
      data: {
        tenant_id: TENANT_ID,
        lease_id: id,
        installment_id: prochaine.id,
        declared_by: renterClientId,
        amount: montantDu(prochaine),
        payment_date: new Date(AUJOURDHUI.getTime() - 2 * 24 * 3600 * 1000),
        payment_method: RentalPaymentMethod.MOBILE_MONEY,
        mobile_operator: 'ORANGE',
        transaction_phone: '0707081234',
        reference: `OM${String(200000000 + alea(99999999))}`,
        notes: 'Transfert effectué depuis mon compte Orange Money, capture jointe.',
        status: PaymentDeclarationStatus.PENDING
      }
    });
    declarations++;
  }
  console.log(`${declarations} déclaration(s) de paiement en attente de validation.`);

  // ---------------------------------------------------------------- travaux
  // Le pont vers le métier de constructeur du prospect : un chantier sur un
  // terrain, un autre sur un immeuble.
  const chantiers: {
    bien: string;
    titre: string;
    cout: number;
    reel: number | null;
    statut: WorkProgramStatus;
    mois: number;
  }[] = [
    {
      bien: 'Terrain 500',
      titre: 'Construction entrepôt 600 m² — gros œuvre',
      cout: 85000000,
      reel: 42000000,
      statut: WorkProgramStatus.IN_PROGRESS,
      mois: -4
    },
    {
      bien: 'Terrain commercial 1 200',
      titre: 'Viabilisation et clôture du terrain',
      cout: 24000000,
      reel: null,
      statut: WorkProgramStatus.PLANNED,
      mois: 2
    },
    {
      bien: 'Immeuble R+2',
      titre: 'Réfection de la toiture et des descentes',
      cout: 12500000,
      reel: 13200000,
      statut: WorkProgramStatus.COMPLETED,
      mois: -8
    },
    {
      bien: 'Immeuble de bureaux R+5',
      titre: 'Remplacement du groupe électrogène',
      cout: 18000000,
      reel: null,
      statut: WorkProgramStatus.IN_PROGRESS,
      mois: -1
    }
  ];

  let travaux = 0;
  for (const c of chantiers) {
    const bien = await prisma.property.findFirst({
      where: { tenantId: TENANT_ID, title: { contains: c.bien } },
      select: { id: true }
    });
    if (!bien) continue;

    const deja = await prisma.workProgram.findFirst({
      where: { tenantId: TENANT_ID, propertyId: bien.id, title: c.titre }
    });
    if (deja) continue;

    const prevue = new Date(AUJOURDHUI);
    prevue.setMonth(prevue.getMonth() + c.mois);

    await prisma.workProgram.create({
      data: {
        tenantId: TENANT_ID,
        propertyId: bien.id,
        title: c.titre,
        description: 'Programme de travaux suivi depuis la fiche du bien.',
        estimatedCost: c.cout,
        actualCost: c.reel,
        currency: 'XOF',
        plannedDate: prevue,
        completedDate: c.statut === WorkProgramStatus.COMPLETED ? prevue : null,
        status: c.statut,
        isCapitalized: c.statut === WorkProgramStatus.COMPLETED
      }
    });
    travaux++;
  }
  console.log(`${travaux} programme(s) de travaux créé(s).`);

  // ----------------------------------------------------------------- bilan
  const [nbBaux, nbEch, nbPay, nbPen, nbDep, nbDecl] = await Promise.all([
    prisma.rentalLease.count({ where: { tenant_id: TENANT_ID } }),
    prisma.rentalInstallment.count({ where: { tenant_id: TENANT_ID } }),
    prisma.rentalPayment.count({ where: { tenant_id: TENANT_ID } }),
    prisma.rentalPenalty.count({ where: { tenant_id: TENANT_ID } }),
    prisma.rentalDepositMovement.count({ where: { tenant_id: TENANT_ID } }),
    prisma.rentalPaymentDeclaration.count({ where: { tenant_id: TENANT_ID } })
  ]);

  const parStatut = await prisma.rentalInstallment.groupBy({
    by: ['status'],
    where: { tenant_id: TENANT_ID },
    _count: true
  });

  console.log('\n──────────── BILAN ────────────');
  console.log(`Baux créés dans cette exécution : ${creesBaux}`);
  console.log(`Échéances créées                : ${creesEcheances}`);
  console.log(`Paiements créés                 : ${creesPaiements}`);
  console.log('');
  console.log(`Total baux            : ${nbBaux}`);
  console.log(`Total échéances       : ${nbEch}  (${parStatut.map(s => `${s.status}=${s._count}`).join(' ')})`);
  console.log(`Total paiements       : ${nbPay}`);
  console.log(`Total pénalités       : ${nbPen}`);
  console.log(`Mouvements de caution : ${nbDep}`);
  console.log(`Déclarations          : ${nbDecl}`);
}

main()
  .catch(e => {
    // Message ET pile : les erreurs Prisma commencent par un saut de ligne,
    // et n'afficher que `.message` donne une premiere ligne vide.
    console.error('ÉCHEC :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // Sortie explicite : `utils/database` enregistre un gestionnaire
    // `beforeExit` asynchrone qui refait de l'I/O, ce qui redeclenche
    // l'evenement sans fin. Sans ce `exit`, le script tourne en boucle.
    process.exit(process.exitCode ?? 0);
  });
