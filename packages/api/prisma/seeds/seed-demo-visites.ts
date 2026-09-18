/**
 * Jeu de démonstration — calendrier des visites.
 *
 * `Biens › Calendrier des visites` était vide. C'est l'écran qui montre que la
 * plateforme ne sert pas qu'à encaisser : elle porte aussi le travail
 * commercial qui précède le bail.
 *
 * Deux chemins d'écriture, pour une raison de fond.
 *
 *   - **Les visites à venir passent par `scheduleVisit`**, le service du
 *     produit : c'est lui qui valide le bien, refuse un créneau incohérent et
 *     rattache les collaborateurs.
 *   - **Les visites passées sont écrites directement.** `scheduleVisit` refuse
 *     toute date antérieure à maintenant — règle juste pour un utilisateur qui
 *     planifie, mais qui empêche de reconstituer un historique. Un calendrier
 *     qui ne montre que l'avenir n'a pas l'air d'un calendrier utilisé.
 *
 * Idempotent : si des visites existent déjà sur l'agence, le script s'arrête.
 */

import { PrismaClient, PropertyVisitType, PropertyVisitGoal, PropertyVisitStatus } from '@prisma/client';
import { scheduleVisit } from '../../src/services/property-visit-service';

const prisma = new PrismaClient({ log: [] });
const TENANT_ID = process.env.DEMO_TENANT_ID || '385a1e76-ac08-4db5-9802-8b2ddfb1672b';

const MAINTENANT = new Date();

/** Date à J±n, à l'heure et la minute voulues. */
function jour(decalage: number, heure: number, minute = 0): Date {
  const d = new Date(MAINTENANT);
  d.setDate(d.getDate() + decalage);
  d.setHours(heure, minute, 0, 0);
  return d;
}

interface PlanVisite {
  /** Fragment distinctif du titre du bien. */
  bien: string;
  /** E-mail du contact CRM visiteur. */
  visiteur: string;
  type: PropertyVisitType;
  but: PropertyVisitGoal;
  /** Décalage en jours par rapport à aujourd'hui. Négatif = passé. */
  jours: number;
  heure: number;
  minute?: number;
  /** Durée en minutes. */
  duree: number;
  lieu: string;
  /** Uniquement pour les visites passées : leur issue. */
  statut?: PropertyVisitStatus;
  notes: string;
}

/**
 * Trois semaines derrière, trois semaines devant.
 *
 * Le passé porte des issues variées — des visites faites, une annulée, un
 * client qui ne s'est pas présenté. Un historique où tout s'est bien passé ne
 * ressemble à aucune agence réelle, et le prospect le sent.
 */
const PLAN: PlanVisite[] = [
  // ─────────────────────────── passé ───────────────────────────
  {
    bien: 'Entrepôt 1 200',
    visiteur: 'aboubacar.sylla@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.CONTRACT_SIGNING,
    jours: -21,
    heure: 9,
    duree: 90,
    lieu: 'Sur site — portail de la zone portuaire',
    statut: PropertyVisitStatus.DONE,
    notes: 'Visite concluante, bail signé dans la foulée.'
  },
  {
    bien: 'Plateau de bureaux 200',
    visiteur: 'rodrigue.gogoua@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.EVALUATION,
    jours: -18,
    heure: 11,
    duree: 60,
    lieu: 'Sur site — accueil du rez-de-chaussée',
    statut: PropertyVisitStatus.DONE,
    notes: 'Le client a mesuré les plateaux, demande un devis de cloisonnement.'
  },
  {
    bien: 'Villa 7 pièces avec piscine',
    visiteur: 'akissi.tanoh@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.FOLLOW_UP,
    jours: -14,
    heure: 15,
    minute: 30,
    duree: 60,
    lieu: 'Sur site — Songon Dagbé',
    statut: PropertyVisitStatus.DONE,
    notes: 'Deuxième visite avec l’épouse. Réserve sur la distance au centre.'
  },
  {
    bien: 'Boutique 60 m²',
    visiteur: 'prisca.kacou@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.NEGOTIATION,
    jours: -11,
    heure: 10,
    duree: 45,
    lieu: 'Sur site — boulevard, devant la vitrine',
    statut: PropertyVisitStatus.DONE,
    notes: 'Négociation sur les trois premiers mois de loyer. Accord trouvé.'
  },
  {
    bien: 'Duplex 5 pièces avec terrasse',
    visiteur: 'carine.ehouman@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.CONTRACT_SIGNING,
    jours: -8,
    heure: 16,
    duree: 60,
    lieu: 'Sur site — Riviera Bonoumin',
    statut: PropertyVisitStatus.DONE,
    notes: 'État des lieux d’entrée réalisé, remise des clés.'
  },
  {
    bien: 'Terrain 500 m²',
    visiteur: 'ibrahim.toure@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.EVALUATION,
    jours: -6,
    heure: 8,
    minute: 30,
    duree: 45,
    lieu: 'Sur site — Bingerville, borne d’angle',
    statut: PropertyVisitStatus.NO_SHOW,
    notes: 'Client injoignable sur place. Relancé le lendemain, sans réponse.'
  },
  {
    bien: 'Immeuble R+2',
    visiteur: 'souleymane.doumbia@example.ci',
    type: PropertyVisitType.APPOINTMENT,
    but: PropertyVisitGoal.NETWORKING,
    jours: -4,
    heure: 14,
    duree: 60,
    lieu: 'Bureaux de l’agence — Cocody II Plateaux',
    statut: PropertyVisitStatus.CANCELED,
    notes: 'Reporté à la demande du client, nouvelle date à fixer.'
  },
  {
    bien: 'Studio meublé courte durée',
    visiteur: 'bintou.soro@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.CONTACT_TAKING,
    jours: -2,
    heure: 17,
    duree: 30,
    lieu: 'Sur site — Plateau Dokui',
    statut: PropertyVisitStatus.DONE,
    notes: 'Premier contact. Cherche un meublé pour une mission de trois mois.'
  },

  // ─────────────────────────── à venir ───────────────────────────
  {
    bien: 'Magasin M4',
    visiteur: 'wilfried.anoh@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.CONTACT_TAKING,
    jours: 1,
    heure: 9,
    duree: 45,
    lieu: 'Sur site — marché d’Adjamé Liberté',
    notes: 'Commerçant en recherche d’un local de stockage attenant.'
  },
  {
    bien: 'Appartement D9',
    visiteur: 'mireille.attoungbre@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.CONTACT_TAKING,
    jours: 1,
    heure: 15,
    duree: 45,
    lieu: 'Sur site — entrée principale de l’immeuble',
    notes: 'Famille de quatre personnes, emménagement souhaité au 1er du mois.'
  },
  {
    bien: 'Plateau de bureaux 3e étage',
    visiteur: 'gerard.adou@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.EVALUATION,
    jours: 2,
    heure: 10,
    minute: 30,
    duree: 90,
    lieu: 'Sur site — Immeuble VGE, accueil',
    notes: 'Société de services, quinze postes à installer. Demande le plan.'
  },
  {
    bien: 'Terrain commercial 1 200',
    visiteur: 'fabrice.aka@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.EVALUATION,
    jours: 3,
    heure: 8,
    duree: 60,
    lieu: 'Sur site — Songon Dagbé, entrée du lot',
    notes: 'Projet de construction d’un entrepôt. Vérifier l’ACD avant la visite.'
  },
  {
    bien: 'Bureau aménagé 90 m²',
    visiteur: 'laetitia.assi@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.FOLLOW_UP,
    jours: 4,
    heure: 11,
    duree: 45,
    lieu: 'Sur site — Deux-Plateaux',
    notes: 'Deuxième visite, vient avec son associé.'
  },
  {
    bien: 'Chambre privée en colocation',
    visiteur: 'desire.gbane@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.CONTACT_TAKING,
    jours: 5,
    heure: 16,
    minute: 30,
    duree: 30,
    lieu: 'Sur site — Cocody Danga',
    notes: 'Étudiant, budget serré. Présenter aussi le studio de Danga Nord.'
  },
  {
    bien: 'Triplex 7 pièces',
    visiteur: 'aya.koffi@example.ci',
    type: PropertyVisitType.APPOINTMENT,
    but: PropertyVisitGoal.NEGOTIATION,
    jours: 8,
    heure: 14,
    duree: 60,
    lieu: 'Bureaux de l’agence — Cocody II Plateaux',
    notes: 'Discussion sur le prix de vente et le calendrier de paiement.'
  },
  {
    bien: 'Lot A12',
    visiteur: 'konan.kouame@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.CONTACT_TAKING,
    jours: 10,
    heure: 9,
    minute: 30,
    duree: 60,
    lieu: 'Sur site — programme Les Jardins de Bingerville',
    notes: 'Visite du lot et de la maquette du programme.'
  },
  {
    bien: 'Place de parking couverte',
    visiteur: 'ramata.diarrassouba@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.CONTACT_TAKING,
    jours: 12,
    heure: 12,
    duree: 20,
    lieu: 'Sur site — Marcory Zone 4, niveau -1',
    notes: 'Visite rapide, décision attendue le jour même.'
  },
  {
    bien: 'Immeuble de bureaux R+5',
    visiteur: 'serge.kouadio@example.ci',
    type: PropertyVisitType.APPOINTMENT,
    but: PropertyVisitGoal.EVALUATION,
    jours: 15,
    heure: 10,
    duree: 120,
    lieu: 'Sur site — Marcory Zone 4, hall',
    notes: 'Investisseur : visite complète du bâtiment et examen du rendement.'
  },
  {
    bien: 'Villa jumelée 5 pièces',
    visiteur: 'edwige.kouakou@example.ci',
    type: PropertyVisitType.VISIT,
    but: PropertyVisitGoal.FOLLOW_UP,
    jours: 18,
    heure: 15,
    duree: 45,
    lieu: 'Sur site — Attécoubé Locodjro',
    notes: 'Visite de courtoisie avant la fin du bail en cours.'
  }
];

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { name: true } });
  if (!tenant) throw new Error(`Agence ${TENANT_ID} introuvable`);

  const dejaLa = await prisma.propertyVisit.count({ where: { tenantId: TENANT_ID } });
  if (dejaLa > 0) {
    console.log(`${dejaLa} visite(s) déjà présentes sur ${tenant.name} — rien à faire.`);
    return;
  }

  const membre = await prisma.membership.findFirst({ where: { tenantId: TENANT_ID }, select: { userId: true } });
  if (!membre) throw new Error('Aucun collaborateur : il en faut un comme commercial assigné');
  const commercial = membre.userId;

  console.log(`Agence : ${tenant.name}\n`);

  let passees = 0;
  let futures = 0;
  const introuvables: string[] = [];

  for (const v of PLAN) {
    const bien = await prisma.property.findFirst({
      where: { tenantId: TENANT_ID, title: { contains: v.bien } },
      select: { id: true, title: true }
    });
    if (!bien) {
      introuvables.push(`bien « ${v.bien} »`);
      continue;
    }

    const contact = await prisma.crmContact.findFirst({
      where: { tenantId: TENANT_ID, email: v.visiteur },
      select: { id: true, firstName: true, lastName: true }
    });
    if (!contact) {
      introuvables.push(`contact ${v.visiteur}`);
      continue;
    }

    const quand = jour(v.jours, v.heure, v.minute ?? 0);
    const etiquette = `${quand.toLocaleDateString('fr-FR')} ${String(v.heure).padStart(2, '0')}h${String(v.minute ?? 0).padStart(2, '0')}`;

    if (v.jours < 0) {
      // Le service refuse le passé : écriture directe, assumée.
      await prisma.propertyVisit.create({
        data: {
          propertyId: bien.id,
          tenantId: TENANT_ID,
          contactId: contact.id,
          visitType: v.type,
          goal: v.but,
          scheduledAt: quand,
          duration: v.duree,
          location: v.lieu,
          status: v.statut ?? PropertyVisitStatus.DONE,
          assignedToUserId: commercial,
          notes: v.notes
        }
      });
      passees++;
      console.log(`  · ${etiquette}  ${String(v.statut).padEnd(9)} ${bien.title.slice(0, 44)}`);
    } else {
      await scheduleVisit(
        bien.id,
        {
          contactId: contact.id,
          visitType: v.type,
          goal: v.but,
          scheduledAt: quand,
          duration: v.duree,
          location: v.lieu,
          assignedToUserId: commercial,
          notes: v.notes
        },
        TENANT_ID,
        commercial
      );
      futures++;
      console.log(`  + ${etiquette}  À VENIR   ${bien.title.slice(0, 44)}`);
    }
  }

  if (introuvables.length > 0) {
    console.log(`\nIgnorés : ${introuvables.join(', ')}`);
  }

  const parStatut = await prisma.propertyVisit.groupBy({
    by: ['status'],
    where: { tenantId: TENANT_ID },
    _count: true
  });

  console.log('\n──────────── BILAN ────────────');
  console.log(`Visites passées : ${passees}`);
  console.log(`Visites à venir : ${futures}`);
  console.log(`Par statut      : ${parStatut.map(s => `${s.status}=${s._count}`).join(' ')}`);
}

main()
  .catch(e => {
    console.error('ÉCHEC :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // `utils/database` enregistre un `beforeExit` asynchrone qui refait de
    // l'I/O : sans sortie explicite, l'événement se redéclenche sans fin.
    process.exit(process.exitCode ?? 0);
  });
