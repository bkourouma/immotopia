/**
 * Jeu de démonstration — module Copropriété (syndic).
 *
 * Le module était entièrement vide : l'ouvrir pendant une démonstration
 * affichait une liste sans copropriété. Ce script en pose une, complète, avec
 * l'histoire qui la rend crédible pour ce prospect-là.
 *
 * **L'histoire.** L'entreprise a construit l'immeuble résidentiel R+3 de
 * Bingerville, puis en a vendu les huit logements à huit acquéreurs. L'immeuble
 * est devenu une copropriété — et c'est le constructeur qu'on a sollicité pour
 * en assurer le syndic. C'est exactement le prolongement de métier dont parle
 * le scénario de démonstration : on ne raconte pas une fonctionnalité, on
 * raconte une ligne de revenus qui naît du bâtiment qu'on vient de livrer.
 *
 * L'immeuble retenu est **volontairement étranger au parc locatif** : les
 * appartements de Yopougon sont loués par l'agence pour un propriétaire unique,
 * les mêler à une copropriété rendrait les deux démonstrations confuses.
 *
 * Écritures directes : le module syndic n'expose pas de service de création
 * équivalent à `createLease`, et reconstituer trois trimestres d'appels de
 * charges déjà soldés passe de toute façon par des dates antérieures.
 *
 * Idempotent : si une copropriété existe déjà sur l'agence, le script s'arrête.
 */

import { parsePeriodBounds } from '../../src/lib/syndics/period';
import {
  PrismaClient,
  SyndicateStatus,
  LotType,
  ChargeCallStatus,
  BatchType,
  BatchStatus,
  BudgetStatus,
  DistributionKey,
  MeetingType,
  MeetingStatus,
  ResolutionResult,
  IncidentType,
  IncidentUrgency,
  IncidentStatus,
  TransactionType
} from '@prisma/client';

const prisma = new PrismaClient({ log: [] });
const TENANT_ID = process.env.DEMO_TENANT_ID || '385a1e76-ac08-4db5-9802-8b2ddfb1672b';

const MAINTENANT = new Date();

function mois(decalage: number, jourDuMois = 1): Date {
  const d = new Date(MAINTENANT);
  d.setMonth(d.getMonth() + decalage);
  d.setDate(jourDuMois);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Clé de période telle que l'affichent les écrans : `AAAA-TN`. */
function periode(d: Date): string {
  return `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`;
}

/**
 * Les dix lots, et leurs tantièmes.
 *
 * Les tantièmes généraux totalisent exactement 1 000 — c'est la règle, et c'est
 * la première chose qu'un copropriétaire vérifie. Un jeu de démonstration qui
 * totalise 998 se fait reprendre en séance.
 */
const LOTS: { numero: string; type: LotType; tantiemes: number; etage: string }[] = [
  { numero: 'A01', type: LotType.APARTMENT, tantiemes: 120, etage: 'Rez-de-chaussée — 3 pièces' },
  { numero: 'A02', type: LotType.APARTMENT, tantiemes: 105, etage: 'Rez-de-chaussée — 2 pièces' },
  { numero: 'A03', type: LotType.APARTMENT, tantiemes: 125, etage: '1er étage — 3 pièces' },
  { numero: 'A04', type: LotType.APARTMENT, tantiemes: 110, etage: '1er étage — 2 pièces' },
  { numero: 'A05', type: LotType.APARTMENT, tantiemes: 125, etage: '2e étage — 3 pièces' },
  { numero: 'A06', type: LotType.APARTMENT, tantiemes: 110, etage: '2e étage — 2 pièces' },
  { numero: 'A07', type: LotType.APARTMENT, tantiemes: 130, etage: '3e étage — 3 pièces avec terrasse' },
  { numero: 'A08', type: LotType.APARTMENT, tantiemes: 115, etage: '3e étage — 2 pièces' },
  { numero: 'P01', type: LotType.PARKING, tantiemes: 30, etage: 'Cour — place couverte' },
  { numero: 'P02', type: LotType.PARKING, tantiemes: 30, etage: 'Cour — place couverte' }
];

/** Le budget voté : six postes, pour 7 200 000 F sur l'exercice. */
const POSTES_BUDGET: { categorie: string; libelle: string; prevu: number; reel: number; cle: DistributionKey }[] = [
  {
    categorie: 'Entretien',
    libelle: 'Nettoyage des parties communes',
    prevu: 1800000,
    reel: 1350000,
    cle: DistributionKey.GENERAL_SHARES
  },
  {
    categorie: 'Sécurité',
    libelle: 'Gardiennage de jour et de nuit',
    prevu: 2400000,
    reel: 1800000,
    cle: DistributionKey.GENERAL_SHARES
  },
  {
    categorie: 'Fluides',
    libelle: 'Eau et électricité des communs',
    prevu: 1200000,
    reel: 940000,
    cle: DistributionKey.GENERAL_SHARES
  },
  {
    categorie: 'Maintenance',
    libelle: 'Entretien du groupe électrogène',
    prevu: 900000,
    reel: 620000,
    cle: DistributionKey.GENERAL_SHARES
  },
  {
    categorie: 'Assurance',
    libelle: 'Police multirisque immeuble',
    prevu: 600000,
    reel: 600000,
    cle: DistributionKey.GENERAL_SHARES
  },
  {
    categorie: 'Parking',
    libelle: 'Réfection du marquage de la cour',
    prevu: 300000,
    reel: 0,
    cle: DistributionKey.SPECIAL_SHARES
  }
];

/** Appel de charges trimestriel : 1 800 000 F répartis aux tantièmes. */
const APPEL_TRIMESTRIEL = 1800000;

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { name: true } });
  if (!tenant) throw new Error(`Agence ${TENANT_ID} introuvable`);

  const dejaLa = await prisma.syndicate.count({ where: { tenantId: TENANT_ID } });
  if (dejaLa > 0) {
    console.log(`${dejaLa} copropriété(s) déjà présentes sur ${tenant.name} — rien à faire.`);
    return;
  }

  const immeuble = await prisma.property.findFirst({
    where: { tenantId: TENANT_ID, title: { contains: 'Immeuble résidentiel R+3' } },
    select: { id: true, title: true, address: true }
  });
  if (!immeuble) throw new Error("L'immeuble résidentiel R+3 de Bingerville est introuvable");

  const proprietaires = await prisma.crmContact.findMany({
    where: { tenantId: TENANT_ID, roles: { some: { role: 'PROPRIETAIRE', endedAt: null } } },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { createdAt: 'asc' },
    take: 10
  });
  if (proprietaires.length < LOTS.length) {
    throw new Error(`Il faut au moins ${LOTS.length} contacts propriétaires, ${proprietaires.length} trouvés`);
  }

  console.log(`Agence : ${tenant.name}`);
  console.log(`Immeuble support : ${immeuble.title}\n`);

  // ─────────────────────────────────────────────── la copropriété
  const syndic = await prisma.syndicate.create({
    data: {
      tenantId: TENANT_ID,
      propertyId: immeuble.id,
      name: 'Résidence Les Rôniers',
      registrationNo: 'CI-ABJ-2024-00418',
      fiscalYear: MAINTENANT.getFullYear(),
      syndicManagerId: proprietaires[0].id,
      address: immeuble.address || 'Bingerville, quartier résidentiel',
      cadastralReference: 'BGV-1274-LOT-06',
      totalLots: LOTS.length,
      totalBuildings: 1,
      status: SyndicateStatus.ACTIVE
    }
  });
  console.log(`+ Copropriété « ${syndic.name} » — ${LOTS.length} lots`);

  // ───────────────────────────────────────────────────── les lots
  const lotsCrees: { id: string; numero: string; tantiemes: number; proprietaireId: string }[] = [];
  let totalTantiemes = 0;

  for (let i = 0; i < LOTS.length; i++) {
    const l = LOTS[i];
    const proprio = proprietaires[i];
    const lot = await prisma.syndicateLot.create({
      data: {
        syndicateId: syndic.id,
        ownerContactId: proprio.id,
        coownerId: proprio.id,
        lotNumber: l.numero,
        lotType: l.type,
        generalShares: l.tantiemes,
        specialShares: l.type === LotType.PARKING ? l.tantiemes : null,
        ownerSince: mois(-30, 1)
      }
    });
    lotsCrees.push({ id: lot.id, numero: l.numero, tantiemes: l.tantiemes, proprietaireId: proprio.id });
    totalTantiemes += l.tantiemes;

    // Profil d'occupant : c'est lui qui porte l'accès au portail.
    await prisma.lotOwnerProfile.create({
      data: {
        lotId: lot.id,
        contactId: proprio.id,
        ownershipPercentage: Math.round((l.tantiemes / 1000) * 10000) / 100,
        ownedSince: mois(-30, 1),
        portalAccessEnabled: i < 6,
        isActive: true
      }
    });

    // Compte propriétaire : le solde se remplira avec les appels de charges.
    await prisma.ownerAccount.create({
      data: { syndicateId: syndic.id, lotId: lot.id, contactId: proprio.id, balance: 0, currency: 'XOF' }
    });
  }
  console.log(`+ ${lotsCrees.length} lots — tantièmes : ${totalTantiemes}/1000`);

  // ──────────────────────────────────────────────────── les fonds
  await prisma.syndicateFund.createMany({
    data: [
      { syndicateId: syndic.id, name: 'Fonds de roulement', balance: 3600000, currency: 'XOF' },
      { syndicateId: syndic.id, name: 'Fonds de travaux', balance: 8450000, currency: 'XOF' }
    ]
  });
  console.log('+ 2 fonds : roulement 3 600 000, travaux 8 450 000');

  // ─────────────────────────────────── l'assemblée qui a tout voté
  const agPassee = await prisma.generalMeeting.create({
    data: {
      syndicateId: syndic.id,
      type: MeetingType.ORDINARY,
      scheduledAt: mois(-7, 14),
      startTime: mois(-7, 14),
      endTime: mois(-7, 14),
      location: 'Salle de réunion de la résidence — rez-de-chaussée',
      quorum: 78.5,
      status: MeetingStatus.COMPLETED
    }
  });

  const ordreDuJour = [
    'Approbation des comptes de l’exercice écoulé',
    'Vote du budget prévisionnel',
    'Réfection de l’étanchéité de la terrasse',
    'Renouvellement du contrat de gardiennage',
    'Questions diverses'
  ];
  for (let i = 0; i < ordreDuJour.length; i++) {
    await prisma.gMAgendaItem.create({
      data: { meetingId: agPassee.id, orderIndex: i + 1, title: ordreDuJour[i] }
    });
  }

  const resolutionBudget = await prisma.gMResolution.create({
    data: {
      meetingId: agPassee.id,
      title: 'Vote du budget prévisionnel',
      description: 'Budget de fonctionnement de 7 200 000 F pour l’exercice en cours.',
      majorityRule: 'Majorité simple',
      result: ResolutionResult.APPROVED,
      votesFor: 7,
      votesAgainst: 1,
      votesAbstain: 2,
      sharesFor: 760
    }
  });

  await prisma.gMResolution.create({
    data: {
      meetingId: agPassee.id,
      title: 'Réfection de l’étanchéité de la terrasse',
      description: 'Devis retenu : 4 200 000 F, prélevés sur le fonds de travaux.',
      majorityRule: 'Majorité absolue',
      result: ResolutionResult.APPROVED,
      votesFor: 8,
      votesAgainst: 2,
      votesAbstain: 0,
      sharesFor: 815
    }
  });

  await prisma.gMResolution.create({
    data: {
      meetingId: agPassee.id,
      title: 'Renouvellement du contrat de gardiennage',
      description: 'Report à la prochaine assemblée, en attente de deux devis comparatifs.',
      majorityRule: 'Majorité simple',
      result: ResolutionResult.DEFERRED,
      votesFor: 3,
      votesAgainst: 4,
      votesAbstain: 3,
      sharesFor: 310
    }
  });

  const agFuture = await prisma.generalMeeting.create({
    data: {
      syndicateId: syndic.id,
      type: MeetingType.EXTRAORDINARY,
      scheduledAt: mois(2, 18),
      location: 'Salle de réunion de la résidence — rez-de-chaussée',
      status: MeetingStatus.PLANNED
    }
  });
  await prisma.gMAgendaItem.create({
    data: { meetingId: agFuture.id, orderIndex: 1, title: 'Choix du prestataire de gardiennage' }
  });
  await prisma.gMAgendaItem.create({
    data: { meetingId: agFuture.id, orderIndex: 2, title: 'Installation d’un portail automatique' }
  });
  console.log('+ 2 assemblées : une tenue (3 résolutions), une convoquée');

  // ─────────────────────────────────────────────────── le budget
  const budget = await prisma.syndicateBudget.create({
    data: {
      syndicateId: syndic.id,
      fiscalYear: MAINTENANT.getFullYear(),
      label: `Budget de fonctionnement ${MAINTENANT.getFullYear()}`,
      status: BudgetStatus.APPROVED,
      approvedAt: mois(-7, 14),
      approvedByResolutionId: resolutionBudget.id,
      totalAmount: POSTES_BUDGET.reduce((s, p) => s + p.prevu, 0),
      currency: 'XOF'
    }
  });
  for (const poste of POSTES_BUDGET) {
    await prisma.budgetLineItem.create({
      data: {
        budgetId: budget.id,
        category: poste.categorie,
        description: poste.libelle,
        amountForecast: poste.prevu,
        amountActual: poste.reel,
        distributionKey: poste.cle
      }
    });
  }
  // Répartition du budget par lot, aux tantièmes.
  for (const lot of lotsCrees) {
    const part = Math.round((Number(budget.totalAmount) * lot.tantiemes) / 1000);
    await prisma.budgetAllocation.create({
      data: {
        budgetId: budget.id,
        lotId: lot.id,
        totalAllocated: part,
        breakdown: { tantiemes: lot.tantiemes, base: Number(budget.totalAmount), cle: 'GENERAL_SHARES' }
      }
    });
  }
  console.log(
    `+ Budget voté : ${Number(budget.totalAmount).toLocaleString('fr-FR')} F, ${POSTES_BUDGET.length} postes, réparti sur ${lotsCrees.length} lots`
  );

  // ─────────────────────────────────────── les appels de charges
  //
  // Trois trimestres : deux soldés, le dernier en cours de recouvrement. Un
  // syndic dont tout est payé ne ressemble à aucune copropriété réelle.
  let appels = 0;
  let reglements = 0;
  const soldes = new Map<string, number>();

  for (const decalage of [-6, -3, 0]) {
    const debut = mois(decalage, 1);
    const echeance = mois(decalage, 15);
    const cle = periode(debut);
    const dernier = decalage === 0;

    const lot = await prisma.chargeCallBatch.create({
      data: {
        syndicateId: syndic.id,
        label: `Appel de charges ${cle}`,
        period: cle,
        dueDate: echeance,
        batchType: BatchType.REGULAR,
        budgetId: budget.id,
        totalAmount: APPEL_TRIMESTRIEL,
        currency: 'XOF',
        status: dernier ? BatchStatus.SENT : BatchStatus.CLOSED
      }
    });

    for (let i = 0; i < lotsCrees.length; i++) {
      const l = lotsCrees[i];
      const montant = Math.round((APPEL_TRIMESTRIEL * l.tantiemes) / 1000);

      // Le dernier trimestre porte les impayés : deux lots n'ont rien versé,
      // un troisième n'a réglé que la moitié.
      let statut = ChargeCallStatus.PAID;
      let verse = montant;
      if (dernier) {
        if (i === 2 || i === 5) {
          statut = new Date() > echeance ? ChargeCallStatus.OVERDUE : ChargeCallStatus.PENDING;
          verse = 0;
        } else if (i === 7) {
          statut = ChargeCallStatus.PARTIAL;
          verse = Math.round(montant / 2);
        }
      }

      const appel = await prisma.chargeCall.create({
        data: {
          syndicateId: syndic.id,
          lotId: l.id,
          batchId: lot.id,
          period: cle,
          // Lot S2 : bornes du trimestre, lues par le suivi mensuel.
          periodStart: parsePeriodBounds(cle)?.start ?? null,
          periodEnd: parsePeriodBounds(cle)?.end ?? null,
          amount: montant,
          currency: 'XOF',
          dueDate: echeance,
          status: statut
        }
      });
      appels++;

      if (verse > 0) {
        // Lot S2 : le paiement appartient au lot et s'affecte en entier a son appel.
        await prisma.chargePayment.create({
          data: {
            lotId: l.id,
            chargeCallId: appel.id,
            allocations: { create: { chargeCallId: appel.id, amount: verse, source: 'PAYMENT' } },
            amount: verse,
            paidAt: new Date(echeance.getTime() - 3 * 86400000),
            method: i % 3 === 0 ? 'MOBILE_MONEY' : i % 3 === 1 ? 'BANK_TRANSFER' : 'CASH',
            reference: `CH-${cle}-${l.numero}`
          }
        });
        reglements++;
      }

      // Compte propriétaire : appelé au débit, versé au crédit.
      //
      // `balanceAfter` est stocké sur chaque écriture, pas recalculé à la
      // lecture : le solde courant se tient donc au fil de la boucle, sans quoi
      // la colonne « Solde » du relevé afficherait n'importe quoi.
      const compte = await prisma.ownerAccount.findUnique({ where: { lotId: l.id }, select: { id: true } });
      if (compte) {
        let solde = soldes.get(l.id) ?? 0;

        solde += montant;
        await prisma.ownerAccountTransaction.create({
          data: {
            accountId: compte.id,
            transactionDate: echeance,
            type: TransactionType.CHARGE_CALL,
            debit: montant,
            credit: null,
            balanceAfter: solde,
            label: `Appel de charges ${cle}`,
            reference: `CH-${cle}-${l.numero}`
          }
        });

        if (verse > 0) {
          solde -= verse;
          await prisma.ownerAccountTransaction.create({
            data: {
              accountId: compte.id,
              transactionDate: new Date(echeance.getTime() + 3 * 86400000),
              type: TransactionType.PAYMENT,
              debit: null,
              credit: verse,
              balanceAfter: solde,
              label: `Règlement ${cle}`,
              reference: `CH-${cle}-${l.numero}`
            }
          });
        }
        soldes.set(l.id, solde);
      }
    }
  }

  for (const [lotId, solde] of soldes) {
    await prisma.ownerAccount.update({ where: { lotId }, data: { balance: solde } });
  }
  console.log(`+ 3 trimestres d'appels : ${appels} appels, ${reglements} règlements`);

  // ─────────────────────────────────────────────────── incidents
  const incidents = [
    {
      type: IncidentType.LEAK,
      description: 'Infiltration au plafond du hall, sous la terrasse du 3e étage.',
      urgence: IncidentUrgency.HIGH,
      statut: IncidentStatus.RESOLVED,
      moisDecalage: -5,
      lot: 6
    },
    {
      type: IncidentType.BREAKDOWN,
      description: 'Le groupe électrogène ne démarre plus lors des coupures.',
      urgence: IncidentUrgency.CRITICAL,
      statut: IncidentStatus.IN_PROGRESS,
      moisDecalage: -1,
      lot: null
    },
    {
      type: IncidentType.SAFETY,
      description: 'Portail de la cour qui ne se verrouille plus la nuit.',
      urgence: IncidentUrgency.MEDIUM,
      statut: IncidentStatus.REPORTED,
      moisDecalage: 0,
      lot: null
    }
  ];

  for (const inc of incidents) {
    const signale = mois(inc.moisDecalage, 8);
    await prisma.syndicateIncident.create({
      data: {
        syndicateId: syndic.id,
        reportedByContactId: proprietaires[inc.lot ?? 1].id,
        lotId: inc.lot !== null ? lotsCrees[inc.lot].id : null,
        incidentType: inc.type,
        description: inc.description,
        urgency: inc.urgence,
        status: inc.statut,
        reportedAt: signale,
        resolvedAt: inc.statut === IncidentStatus.RESOLVED ? mois(inc.moisDecalage + 1, 3) : null
      }
    });
  }
  console.log(`+ ${incidents.length} incidents`);

  // ────────────────────────────────────────────────────── bilan
  const [nbLots, nbAppels, nbAg, nbInc, nbFonds] = await Promise.all([
    prisma.syndicateLot.count({ where: { syndicateId: syndic.id } }),
    prisma.chargeCall.count({ where: { syndicateId: syndic.id } }),
    prisma.generalMeeting.count({ where: { syndicateId: syndic.id } }),
    prisma.syndicateIncident.count({ where: { syndicateId: syndic.id } }),
    prisma.syndicateFund.count({ where: { syndicateId: syndic.id } })
  ]);
  const parStatut = await prisma.chargeCall.groupBy({
    by: ['status'],
    where: { syndicateId: syndic.id },
    _count: true
  });
  const appele = await prisma.chargeCall.aggregate({ where: { syndicateId: syndic.id }, _sum: { amount: true } });

  console.log('\n──────────── BILAN ────────────');
  console.log(`Copropriété      : ${syndic.name} (${syndic.registrationNo})`);
  console.log(`Lots             : ${nbLots}`);
  console.log(`Appels de charges: ${nbAppels} — ${parStatut.map(s => `${s.status}=${s._count}`).join(' ')}`);
  console.log(`Total appelé     : ${Number(appele._sum.amount || 0).toLocaleString('fr-FR')} XOF`);
  console.log(`Assemblées       : ${nbAg}`);
  console.log(`Incidents        : ${nbInc}`);
  console.log(`Fonds            : ${nbFonds}`);
}

main()
  .catch(e => {
    console.error('ÉCHEC :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
