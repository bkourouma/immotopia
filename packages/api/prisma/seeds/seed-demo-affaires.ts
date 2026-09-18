/**
 * Jeu de démonstration — CRM, pipeline des affaires.
 *
 * L'écran des affaires est un kanban : sans affaires, il affiche six colonnes
 * vides, ce qui est pire qu'une liste vide — on voit la structure sans jamais
 * voir à quoi elle sert.
 *
 * Trois partis pris.
 *
 *   1. **Le pipeline suit les métiers du prospect.** Terrains à vendre, lots de
 *      programme neuf, entrepôts et bureaux à louer, mandats de gestion confiés
 *      par des propriétaires. Un pipeline générique d'appartements ne lui
 *      parlerait pas.
 *
 *   2. **Les affaires sont cousues aux visites déjà en base.** Une affaire à
 *      l'étape « Visite » dont le contact a effectivement un rendez-vous au
 *      calendrier, et la visite pointe l'affaire en retour. C'est ce qui fait
 *      qu'un clic depuis le kanban mène quelque part.
 *
 *   3. **Les affaires gagnées correspondent aux baux réels.** L'entrepôt de
 *      Treichville et le duplex de Bonoumin ont été signés : leurs affaires
 *      sont au stade « Gagné », avec la date de clôture. Un prospect qui suit
 *      le fil de l'entrepôt depuis la visite jusqu'au bail voit la plateforme
 *      tenir d'un bout à l'autre.
 *
 * Idempotent : si des affaires existent déjà sur l'agence, le script s'arrête.
 */

import {
  PrismaClient,
  CrmDealType as Type,
  CrmDealStage as Etape,
  CrmActivityType as Acte,
  CrmActivityDirection as Sens,
  CrmDealPropertyStatus as EtatBien
} from '@prisma/client';

const prisma = new PrismaClient({ log: [] });
const TENANT_ID = process.env.DEMO_TENANT_ID || '385a1e76-ac08-4db5-9802-8b2ddfb1672b';

const MAINTENANT = new Date();

function ilYA(jours: number, heure = 10): Date {
  const d = new Date(MAINTENANT);
  d.setDate(d.getDate() - jours);
  d.setHours(heure, 0, 0, 0);
  return d;
}

function dans(jours: number, heure = 10): Date {
  return ilYA(-jours, heure);
}

interface Trace {
  type: Acte;
  sens: Sens;
  objet: string;
  contenu: string;
  /** Jours avant aujourd'hui. */
  jours: number;
  issue?: string;
}

interface PlanAffaire {
  /** E-mail du contact CRM porteur de l'affaire. */
  contact: string;
  type: Type;
  etape: Etape;
  zone: string;
  budgetMin?: number;
  budgetMax?: number;
  valeur: number;
  probabilite: number;
  /** Ancienneté de l'affaire, en jours. */
  ouverteIlYA: number;
  /** Fragments de titres des biens présentés, avec leur état. */
  biens?: { titre: string; etat: EtatBien; score?: number }[];
  /** Rôle CRM à poser sur le contact s'il ne l'a pas. */
  role?: 'ACQUEREUR' | 'PROPRIETAIRE' | 'LOCATAIRE';
  motifCloture?: string;
  clotureIlYA?: number;
  traces: Trace[];
}

const AFFAIRES: PlanAffaire[] = [
  // ───────────────────────────── NOUVEAU
  {
    contact: 'edwige.kouakou@example.ci',
    type: Type.LOCATION,
    etape: Etape.NEW,
    zone: 'Attécoubé',
    budgetMin: 300000,
    budgetMax: 400000,
    valeur: 350000,
    probabilite: 0.2,
    ouverteIlYA: 3,
    role: 'LOCATAIRE',
    traces: [
      {
        type: Acte.WHATSAPP,
        sens: Sens.IN,
        objet: 'Première prise de contact',
        contenu: 'Bonjour, je cherche une villa à louer vers Attécoubé pour début du mois prochain.',
        jours: 3
      }
    ]
  },
  {
    contact: 'ramata.diarrassouba@example.ci',
    type: Type.LOCATION,
    etape: Etape.NEW,
    zone: 'Marcory Zone 4',
    budgetMin: 30000,
    budgetMax: 50000,
    valeur: 35000,
    probabilite: 0.25,
    ouverteIlYA: 2,
    role: 'LOCATAIRE',
    traces: [
      {
        type: Acte.CALL,
        sens: Sens.IN,
        objet: 'Demande de place de parking',
        contenu: "Travaille en Zone 4, cherche une place couverte à l'année.",
        jours: 2,
        issue: 'Visite à proposer'
      }
    ]
  },
  {
    contact: 'affoue.brou@example.ci',
    type: Type.GESTION,
    etape: Etape.NEW,
    zone: 'Cocody',
    valeur: 1800000,
    probabilite: 0.3,
    ouverteIlYA: 6,
    role: 'PROPRIETAIRE',
    traces: [
      {
        type: Acte.EMAIL,
        sens: Sens.IN,
        objet: 'Demande de mandat de gestion',
        contenu:
          "Propriétaire de trois appartements à Cocody, souhaite déléguer la gestion locative. Demande une proposition d'honoraires.",
        jours: 6
      }
    ]
  },

  // ───────────────────────────── QUALIFIÉ
  {
    contact: 'mireille.attoungbre@example.ci',
    type: Type.LOCATION,
    etape: Etape.QUALIFIED,
    zone: 'Adjamé Liberté',
    budgetMin: 100000,
    budgetMax: 140000,
    valeur: 120000,
    probabilite: 0.45,
    ouverteIlYA: 12,
    role: 'LOCATAIRE',
    biens: [{ titre: 'Appartement D9', etat: EtatBien.PROPOSED, score: 88 }],
    traces: [
      {
        type: Acte.CALL,
        sens: Sens.OUT,
        objet: 'Qualification du besoin',
        contenu: 'Famille de quatre personnes, trois pièces minimum, emménagement au 1er du mois.',
        jours: 11,
        issue: 'Dossier complet, visite à caler'
      },
      {
        type: Acte.WHATSAPP,
        sens: Sens.OUT,
        objet: 'Proposition de bien',
        contenu: "Je vous envoie les photos de l'appartement D9, 3 pièces au 3e étage.",
        jours: 9
      }
    ]
  },
  {
    contact: 'laetitia.assi@example.ci',
    type: Type.LOCATION,
    etape: Etape.QUALIFIED,
    zone: 'Cocody Deux-Plateaux',
    budgetMin: 600000,
    budgetMax: 800000,
    valeur: 750000,
    probabilite: 0.5,
    ouverteIlYA: 15,
    role: 'LOCATAIRE',
    biens: [{ titre: 'Bureau aménagé 90', etat: EtatBien.VISITED, score: 92 }],
    traces: [
      {
        type: Acte.MEETING,
        sens: Sens.OUT,
        objet: 'Rendez-vous à l’agence',
        contenu: 'Cabinet de conseil, six postes. Cherche un bureau déjà aménagé.',
        jours: 14
      }
    ]
  },
  {
    contact: 'desire.gbane@example.ci',
    type: Type.LOCATION,
    etape: Etape.QUALIFIED,
    zone: 'Cocody Danga',
    budgetMin: 60000,
    budgetMax: 90000,
    valeur: 75000,
    probabilite: 0.4,
    ouverteIlYA: 8,
    role: 'LOCATAIRE',
    biens: [
      { titre: 'Chambre privée en colocation', etat: EtatBien.PROPOSED, score: 80 },
      { titre: 'Studio étudiant', etat: EtatBien.SHORTLISTED, score: 72 }
    ],
    traces: [
      {
        type: Acte.SMS,
        sens: Sens.OUT,
        objet: 'Deux options envoyées',
        contenu: 'Une chambre en colocation à Danga et un studio à Danga Nord. Dites-moi ce qui vous convient.',
        jours: 7
      }
    ]
  },

  // ───────────────────────────── VISITE
  {
    contact: 'wilfried.anoh@example.ci',
    type: Type.LOCATION,
    etape: Etape.VISIT,
    zone: 'Adjamé Liberté',
    budgetMin: 150000,
    budgetMax: 200000,
    valeur: 180000,
    probabilite: 0.55,
    ouverteIlYA: 10,
    role: 'LOCATAIRE',
    biens: [{ titre: 'Magasin M4', etat: EtatBien.PROPOSED, score: 85 }],
    traces: [
      {
        type: Acte.CALL,
        sens: Sens.IN,
        objet: 'Recherche de local de stockage',
        contenu: 'Commerçant au marché, cherche un local attenant à sa boutique.',
        jours: 10,
        issue: 'Visite fixée'
      }
    ]
  },
  {
    contact: 'gerard.adou@example.ci',
    type: Type.LOCATION,
    etape: Etape.VISIT,
    zone: 'Marcory Zone 4',
    budgetMin: 1200000,
    budgetMax: 1600000,
    valeur: 1400000,
    probabilite: 0.6,
    ouverteIlYA: 18,
    role: 'LOCATAIRE',
    biens: [{ titre: 'Plateau de bureaux 3e étage', etat: EtatBien.PROPOSED, score: 90 }],
    traces: [
      {
        type: Acte.EMAIL,
        sens: Sens.OUT,
        objet: 'Envoi du plan du plateau',
        contenu: "Plan et surface utile du 3e étage de l'immeuble VGE. Quinze postes tiennent sans difficulté.",
        jours: 5
      }
    ]
  },
  {
    contact: 'fabrice.aka@example.ci',
    type: Type.ACHAT,
    etape: Etape.VISIT,
    zone: 'Songon Dagbé',
    budgetMin: 40000000,
    budgetMax: 55000000,
    valeur: 48000000,
    probabilite: 0.5,
    ouverteIlYA: 25,
    role: 'ACQUEREUR',
    biens: [{ titre: 'Terrain commercial 1 200', etat: EtatBien.PROPOSED, score: 94 }],
    traces: [
      {
        type: Acte.MEETING,
        sens: Sens.OUT,
        objet: 'Projet de construction d’entrepôt',
        contenu:
          "Souhaite acquérir un terrain viabilisé pour y bâtir un entrepôt de 800 m². Demande l'ACD avant la visite.",
        jours: 22,
        issue: 'ACD transmis, visite programmée'
      }
    ]
  },
  {
    contact: 'konan.kouame@example.ci',
    type: Type.ACHAT,
    etape: Etape.VISIT,
    zone: 'Bingerville',
    budgetMin: 40000000,
    budgetMax: 50000000,
    valeur: 48000000,
    probabilite: 0.45,
    ouverteIlYA: 20,
    role: 'ACQUEREUR',
    biens: [{ titre: 'Lot A12', etat: EtatBien.PROPOSED, score: 86 }],
    traces: [
      {
        type: Acte.WHATSAPP,
        sens: Sens.IN,
        objet: 'Intérêt pour le programme neuf',
        contenu: "Le lot A12 m'intéresse. Peut-on voir la maquette du programme sur place ?",
        jours: 14
      }
    ]
  },
  {
    contact: 'serge.kouadio@example.ci',
    type: Type.ACHAT,
    etape: Etape.VISIT,
    zone: 'Marcory Zone 4',
    budgetMin: 700000000,
    budgetMax: 900000000,
    valeur: 850000000,
    probabilite: 0.35,
    ouverteIlYA: 30,
    role: 'ACQUEREUR',
    biens: [{ titre: 'Immeuble de bureaux R+5', etat: EtatBien.PROPOSED, score: 91 }],
    traces: [
      {
        type: Acte.MEETING,
        sens: Sens.OUT,
        objet: 'Rendez-vous investisseur',
        contenu: "Investisseur institutionnel. Examine le rendement locatif de l'immeuble avant de se positionner.",
        jours: 28,
        issue: 'Visite complète du bâtiment à organiser'
      },
      {
        type: Acte.EMAIL,
        sens: Sens.OUT,
        objet: 'Dossier de rendement',
        contenu: "État locatif des cinq plateaux, taux d'occupation et charges de l'exercice.",
        jours: 12
      }
    ]
  },

  // ───────────────────────────── NÉGOCIATION
  {
    contact: 'aya.koffi@example.ci',
    type: Type.ACHAT,
    etape: Etape.NEGOTIATION,
    zone: 'Marcory Résidentiel',
    budgetMin: 180000000,
    budgetMax: 210000000,
    valeur: 195000000,
    probabilite: 0.7,
    ouverteIlYA: 40,
    role: 'ACQUEREUR',
    biens: [{ titre: 'Triplex 7 pièces', etat: EtatBien.SELECTED, score: 95 }],
    traces: [
      {
        type: Acte.CALL,
        sens: Sens.OUT,
        objet: 'Contre-proposition',
        contenu: 'Offre à 195 M contre 210 M demandés. Le vendeur étudie, réponse sous huitaine.',
        jours: 6,
        issue: 'En attente du vendeur'
      }
    ]
  },
  {
    contact: 'souleymane.doumbia@example.ci',
    type: Type.VENTE,
    etape: Etape.NEGOTIATION,
    zone: 'Abobo Baoulé',
    valeur: 95000000,
    probabilite: 0.6,
    ouverteIlYA: 35,
    role: 'PROPRIETAIRE',
    biens: [{ titre: 'Immeuble R+2', etat: EtatBien.SELECTED, score: 88 }],
    traces: [
      {
        type: Acte.MEETING,
        sens: Sens.OUT,
        objet: 'Mandat de vente',
        contenu: 'Discussion sur le prix de présentation et la durée du mandat exclusif.',
        jours: 4,
        issue: 'Mandat à signer'
      }
    ]
  },

  // ───────────────────────────── GAGNÉ
  {
    contact: 'aboubacar.sylla@example.ci',
    type: Type.LOCATION,
    etape: Etape.WON,
    zone: 'Treichville',
    budgetMin: 4000000,
    budgetMax: 5000000,
    valeur: 4500000,
    probabilite: 1,
    ouverteIlYA: 60,
    clotureIlYA: 20,
    motifCloture: 'Bail signé — entrepôt zone portuaire',
    role: 'LOCATAIRE',
    biens: [{ titre: 'Entrepôt 1 200', etat: EtatBien.SELECTED, score: 97 }],
    traces: [
      {
        type: Acte.VISIT,
        sens: Sens.OUT,
        objet: 'Visite de l’entrepôt',
        contenu: "Visite concluante. Le preneur valide la surface et l'accès poids lourds.",
        jours: 21,
        issue: 'Bail à rédiger'
      },
      {
        type: Acte.NOTE,
        sens: Sens.INTERNAL,
        objet: 'Signature',
        contenu: 'Bail trimestriel signé, dépôt de garantie encaissé le jour même.',
        jours: 20
      }
    ]
  },
  {
    contact: 'carine.ehouman@example.ci',
    type: Type.LOCATION,
    etape: Etape.WON,
    zone: 'Riviera Bonoumin',
    budgetMin: 650000,
    budgetMax: 750000,
    valeur: 700000,
    probabilite: 1,
    ouverteIlYA: 45,
    clotureIlYA: 8,
    motifCloture: 'Bail signé — duplex avec terrasse',
    role: 'LOCATAIRE',
    biens: [{ titre: 'Duplex 5 pièces avec terrasse', etat: EtatBien.SELECTED, score: 93 }],
    traces: [
      {
        type: Acte.NOTE,
        sens: Sens.INTERNAL,
        objet: 'État des lieux',
        contenu: "État des lieux d'entrée réalisé, remise des clés effectuée.",
        jours: 8
      }
    ]
  },

  // ───────────────────────────── PERDU
  {
    contact: 'ibrahim.toure@example.ci',
    type: Type.ACHAT,
    etape: Etape.LOST,
    zone: 'Bingerville',
    budgetMin: 30000000,
    budgetMax: 38000000,
    valeur: 35000000,
    probabilite: 0,
    ouverteIlYA: 28,
    clotureIlYA: 5,
    motifCloture: 'Injoignable après la visite manquée',
    role: 'ACQUEREUR',
    biens: [{ titre: 'Terrain 500 m²', etat: EtatBien.REJECTED, score: 78 }],
    traces: [
      {
        type: Acte.CALL,
        sens: Sens.OUT,
        objet: 'Relance après rendez-vous manqué',
        contenu: 'Client absent à la visite du terrain. Deux relances sans réponse.',
        jours: 5,
        issue: 'Affaire close'
      }
    ]
  }
];

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { name: true } });
  if (!tenant) throw new Error(`Agence ${TENANT_ID} introuvable`);

  const dejaLa = await prisma.crmDeal.count({ where: { tenantId: TENANT_ID } });
  if (dejaLa > 0) {
    console.log(`${dejaLa} affaire(s) déjà présentes sur ${tenant.name} — rien à faire.`);
    return;
  }

  const membre = await prisma.membership.findFirst({ where: { tenantId: TENANT_ID }, select: { userId: true } });
  if (!membre) throw new Error('Aucun collaborateur : il en faut un comme commercial');
  const commercial = membre.userId;

  console.log(`Agence : ${tenant.name}\n`);

  let creees = 0;
  let traces = 0;
  let rapprochements = 0;
  let visitesLiees = 0;
  let rolesPoses = 0;
  const ignorees: string[] = [];

  for (const a of AFFAIRES) {
    const contact = await prisma.crmContact.findFirst({
      where: { tenantId: TENANT_ID, email: a.contact },
      select: { id: true, firstName: true, lastName: true, roles: { select: { role: true } } }
    });
    if (!contact) {
      ignorees.push(a.contact);
      continue;
    }

    // Un acquéreur qui n'a que le rôle « locataire » fausse les filtres du CRM.
    if (a.role && !contact.roles.some(r => r.role === a.role)) {
      await prisma.crmContactRole.create({
        data: { tenantId: TENANT_ID, contactId: contact.id, role: a.role, startedAt: ilYA(a.ouverteIlYA) }
      });
      rolesPoses++;
    }

    const affaire = await prisma.crmDeal.create({
      data: {
        tenantId: TENANT_ID,
        contactId: contact.id,
        type: a.type,
        stage: a.etape,
        budgetMin: a.budgetMin ?? null,
        budgetMax: a.budgetMax ?? null,
        locationZone: a.zone,
        expectedValue: a.valeur,
        probability: a.probabilite,
        assignedToUserId: commercial,
        closedReason: a.motifCloture ?? null,
        closedAt: a.clotureIlYA != null ? ilYA(a.clotureIlYA) : null,
        createdAt: ilYA(a.ouverteIlYA)
      }
    });
    creees++;

    // Biens présentés au client.
    for (const b of a.biens ?? []) {
      const bien = await prisma.property.findFirst({
        where: { tenantId: TENANT_ID, title: { contains: b.titre } },
        select: { id: true }
      });
      if (!bien) continue;
      await prisma.crmDealProperty.create({
        data: {
          tenantId: TENANT_ID,
          dealId: affaire.id,
          propertyId: bien.id,
          matchScore: b.score ?? null,
          status: b.etat
        }
      });
      rapprochements++;
    }

    // Échanges.
    for (const t of a.traces) {
      await prisma.crmActivity.create({
        data: {
          tenantId: TENANT_ID,
          contactId: contact.id,
          dealId: affaire.id,
          activityType: t.type,
          direction: t.sens,
          subject: t.objet,
          content: t.contenu,
          outcome: t.issue ?? null,
          occurredAt: ilYA(t.jours, 11),
          createdByUserId: commercial,
          // Prochaine action : c'est elle qui alimente la colonne du même nom
          // dans la liste des contacts, et la file de travail du tableau de
          // bord CRM. Une affaire ouverte sans prochaine action n'y apparaît
          // pas — et c'est justement ce qu'on veut montrer.
          nextActionAt: a.etape === Etape.WON || a.etape === Etape.LOST ? null : dans(2 + (creees % 5), 9),
          nextActionType: a.etape === Etape.WON || a.etape === Etape.LOST ? null : 'Relance téléphonique'
        }
      });
      traces++;
    }

    // La visite déjà au calendrier pointe désormais son affaire.
    const lien = await prisma.propertyVisit.updateMany({
      where: { tenantId: TENANT_ID, contactId: contact.id, dealId: null },
      data: { dealId: affaire.id }
    });
    visitesLiees += lien.count;

    console.log(
      `+ [${String(a.etape).padEnd(11)}] ${String(a.type).padEnd(8)} ${(contact.firstName + ' ' + contact.lastName).padEnd(24)} ${a.valeur.toLocaleString('fr-FR').padStart(12)} F`
    );
  }

  if (ignorees.length > 0) console.log(`\nContacts introuvables : ${ignorees.join(', ')}`);

  // ───────────────────────────────────────────────────────── bilan
  const parEtape = await prisma.crmDeal.groupBy({ by: ['stage'], where: { tenantId: TENANT_ID }, _count: true });
  const parType = await prisma.crmDeal.groupBy({ by: ['type'], where: { tenantId: TENANT_ID }, _count: true });
  const enCours = await prisma.crmDeal.aggregate({
    where: { tenantId: TENANT_ID, stage: { notIn: [Etape.WON, Etape.LOST] } },
    _sum: { expectedValue: true }
  });
  const gagne = await prisma.crmDeal.aggregate({
    where: { tenantId: TENANT_ID, stage: Etape.WON },
    _sum: { expectedValue: true }
  });

  console.log('\n──────────── BILAN ────────────');
  console.log(`Affaires   : ${creees} — ${parEtape.map(s => `${s.stage}=${s._count}`).join(' ')}`);
  console.log(`Types      : ${parType.map(s => `${s.type}=${s._count}`).join(' ')}`);
  console.log(`Pipeline   : ${Number(enCours._sum.expectedValue || 0).toLocaleString('fr-FR')} F en cours`);
  console.log(`Gagné      : ${Number(gagne._sum.expectedValue || 0).toLocaleString('fr-FR')} F`);
  console.log(`Biens présentés : ${rapprochements} · Échanges : ${traces}`);
  console.log(`Visites rattachées à une affaire : ${visitesLiees} · Rôles CRM posés : ${rolesPoses}`);
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
