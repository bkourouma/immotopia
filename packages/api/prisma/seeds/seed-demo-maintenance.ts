/**
 * Jeu de démonstration — module Maintenance.
 *
 * Le module avait ses écrans mais aucune donnée : ni prestataire, ni ticket.
 * Or il sert deux publics dans la démonstration, et pas au même moment :
 *
 *   - **côté locataire**, l'onglet « Incidents » du portail. C'est Mariam
 *     Diomandé qu'on ouvre en séance : son appartement porte donc trois
 *     tickets, dont un en cours et un résolu, pour que l'écran raconte une
 *     relation suivie et pas une boîte vide ;
 *   - **côté agence**, « Tickets de l'agence » et « Prestataires ». Un
 *     gestionnaire y voit une file de travail, pas une liste plate.
 *
 * Chaque ticket porte **son historique de statuts** et **ses échanges**. C'est
 * ce qui distingue un outil de suivi d'un formulaire : sans la trace, personne
 * ne sait qui a dit quoi, ni quand la panne a été prise en charge.
 *
 * Idempotent : si des tickets existent déjà sur l'agence, le script s'arrête.
 */

import {
  PrismaClient,
  MaintenanceTicketCategory as Categorie,
  MaintenanceTicketPriority as Priorite,
  MaintenanceTicketStatus as Statut,
  MaintenanceTicketCommentAuthorType as Auteur
} from '@prisma/client';

const prisma = new PrismaClient({ log: [] });
const TENANT_ID = process.env.DEMO_TENANT_ID || '385a1e76-ac08-4db5-9802-8b2ddfb1672b';

const MAINTENANT = new Date();

/** Date à J-n, à l'heure voulue. */
function ilYA(jours: number, heure = 9): Date {
  const d = new Date(MAINTENANT);
  d.setDate(d.getDate() - jours);
  d.setHours(heure, 0, 0, 0);
  return d;
}

/** Les prestataires de l'agence, avec leurs spécialités. */
const PRESTATAIRES = [
  {
    nom: 'Plomberie Express CI',
    tel: '+225 07 08 11 22 33',
    email: 'contact@plomberie-express.ci',
    adresse: 'Zone 4, Marcory — Abidjan',
    specialites: ['plumbing', 'water_heater']
  },
  {
    nom: 'Ivoire Électricité Services',
    tel: '+225 05 06 44 55 66',
    email: 'depannage@ivoire-elec.ci',
    adresse: 'Adjamé Liberté — Abidjan',
    specialites: ['electricity', 'generator']
  },
  {
    nom: 'Froid & Clim Abidjan',
    tel: '+225 01 02 77 88 99',
    email: 'interventions@froidclim.ci',
    adresse: 'Cocody Deux-Plateaux — Abidjan',
    specialites: ['ac', 'ventilation']
  },
  {
    nom: 'BTP Rénovation Baoulé',
    tel: '+225 07 09 33 44 55',
    email: 'chantiers@btp-baoule.ci',
    adresse: 'Yopougon Zone Industrielle — Abidjan',
    specialites: ['masonry', 'painting', 'roofing']
  },
  {
    nom: 'Sécurité Plus Gardiennage',
    tel: '+225 05 07 66 77 88',
    email: 'operations@securite-plus.ci',
    adresse: 'Plateau — Abidjan',
    specialites: ['security', 'access_control'],
    actif: false
  }
];

interface Echange {
  auteur: Auteur;
  texte: string;
  /** Jours avant aujourd'hui. */
  jours: number;
}

interface PlanTicket {
  /** Numéro du bail concerné, tel qu'il existe en base. */
  bail: string;
  titre: string;
  categorie: Categorie;
  priorite: Priorite;
  description: string;
  localisation?: string;
  statut: Statut;
  /** Nom du prestataire assigné, si le ticket l'est. */
  prestataire?: string;
  /** Jours avant aujourd'hui pour la déclaration. */
  declareIlYA: number;
  resolution?: string;
  echanges: Echange[];
}

/**
 * Douze tickets.
 *
 * Les trois premiers portent sur l'appartement de Mariam Diomandé : c'est le
 * compte locataire qu'on ouvre pendant la démonstration, et son portail ne doit
 * pas être vide au moment où on y bascule.
 */
const TICKETS: PlanTicket[] = [
  // ───────────── le locataire du portail : BAIL-2026-0002, Appartement D1
  {
    bail: 'BAIL-2026-0002',
    titre: 'Fuite sous l’évier de la cuisine',
    categorie: Categorie.PLUMBING,
    priorite: Priorite.HIGH,
    description:
      'De l’eau s’écoule du siphon depuis hier soir. J’ai placé une bassine, mais le placard commence à gonfler.',
    localisation: 'Cuisine, placard sous l’évier',
    statut: Statut.RESOLVED,
    prestataire: 'Plomberie Express CI',
    declareIlYA: 34,
    resolution: 'Siphon et joint remplacés. Fond de placard séché et traité.',
    echanges: [
      { auteur: Auteur.TENANT, texte: 'La fuite s’aggrave, l’eau atteint le carrelage.', jours: 34 },
      { auteur: Auteur.MANAGER, texte: 'Bien reçu. Plomberie Express passe demain matin entre 8h et 10h.', jours: 33 },
      { auteur: Auteur.TENANT, texte: 'Le plombier est passé, tout est sec. Merci.', jours: 31 }
    ]
  },
  {
    bail: 'BAIL-2026-0002',
    titre: 'Climatiseur du salon qui ne refroidit plus',
    categorie: Categorie.AC,
    priorite: Priorite.MEDIUM,
    description:
      'L’appareil souffle de l’air tiède depuis une semaine. Le voyant reste vert, il n’y a pas de code d’erreur.',
    localisation: 'Salon, unité murale au-dessus du canapé',
    statut: Statut.ASSIGNED,
    prestataire: 'Froid & Clim Abidjan',
    declareIlYA: 6,
    echanges: [
      {
        auteur: Auteur.MANAGER,
        texte: 'Intervention programmée jeudi après-midi. Merci de laisser l’accès.',
        jours: 4
      },
      { auteur: Auteur.TENANT, texte: 'Je serai présente jeudi à partir de 14h.', jours: 4 }
    ]
  },
  {
    bail: 'BAIL-2026-0002',
    titre: 'Ampoule grillée dans la cage d’escalier',
    categorie: Categorie.ELECTRICITY,
    priorite: Priorite.LOW,
    description: 'L’éclairage du palier du 1er étage ne fonctionne plus. C’est sombre le soir.',
    localisation: 'Palier du 1er étage',
    statut: Statut.DECLARED,
    declareIlYA: 1,
    echanges: []
  },

  // ───────────── le reste du parc
  {
    bail: 'BAIL-2026-0004',
    titre: 'Panne du groupe électrogène de l’entrepôt',
    categorie: Categorie.ELECTRICITY,
    priorite: Priorite.URGENT,
    description:
      'Le groupe ne prend plus le relais lors des coupures. La chambre froide est restée à l’arrêt deux heures ce matin.',
    localisation: 'Local technique, façade nord',
    statut: Statut.IN_PROGRESS,
    declareIlYA: 2,
    echanges: [
      {
        auteur: Auteur.TENANT,
        texte: 'Deux heures d’arrêt ce matin. Il nous faut une solution aujourd’hui.',
        jours: 2
      },
      {
        auteur: Auteur.MANAGER,
        texte: 'Technicien sur place cet après-midi. Un groupe de secours est mobilisable si besoin.',
        jours: 2
      }
    ]
  },
  {
    bail: 'BAIL-2026-0003',
    titre: 'Infiltration en toiture du magasin de stockage',
    categorie: Categorie.OTHER,
    priorite: Priorite.HIGH,
    description: 'Trois gouttières apparaissent après chaque pluie. Des cartons de marchandise ont été mouillés.',
    localisation: 'Travée centrale, sous la verrière',
    statut: Statut.ASSIGNED,
    prestataire: 'BTP Rénovation Baoulé',
    declareIlYA: 9,
    echanges: [
      { auteur: Auteur.TENANT, texte: 'Photos jointes après la pluie de mardi.', jours: 9 },
      { auteur: Auteur.MANAGER, texte: 'Devis reçu, intervention validée pour la semaine prochaine.', jours: 5 }
    ]
  },
  {
    bail: 'BAIL-2026-0005',
    titre: 'Climatisation du plateau insuffisante en après-midi',
    categorie: Categorie.AC,
    priorite: Priorite.MEDIUM,
    description: 'Les bureaux côté ouest deviennent difficilement tenables après 14h.',
    localisation: 'Open space ouest',
    statut: Statut.RESOLVED,
    prestataire: 'Froid & Clim Abidjan',
    declareIlYA: 45,
    resolution: 'Recharge en fluide et nettoyage des filtres des quatre splits.',
    echanges: [
      { auteur: Auteur.MANAGER, texte: 'Entretien annuel avancé. Intervention la semaine prochaine.', jours: 43 }
    ]
  },
  {
    bail: 'BAIL-2026-0008',
    titre: 'Rideau métallique bloqué à mi-hauteur',
    categorie: Categorie.OTHER,
    priorite: Priorite.URGENT,
    description: 'Le rideau ne descend plus complètement. Le magasin ne peut pas être fermé le soir.',
    localisation: 'Devanture, rue principale',
    statut: Statut.RESOLVED,
    prestataire: 'BTP Rénovation Baoulé',
    declareIlYA: 21,
    resolution: 'Ressort de rappel remplacé, rails nettoyés et graissés.',
    echanges: [
      { auteur: Auteur.TENANT, texte: 'Je ne peux pas fermer ce soir, c’est un vrai problème de sécurité.', jours: 21 },
      { auteur: Auteur.MANAGER, texte: 'Prestataire dépêché en urgence dans la soirée.', jours: 21 },
      { auteur: Auteur.TENANT, texte: 'Réparé, le rideau descend bien. Merci pour la réactivité.', jours: 20 }
    ]
  },
  {
    bail: 'BAIL-2026-0011',
    titre: 'Chasse d’eau qui fuit en continu',
    categorie: Categorie.PLUMBING,
    priorite: Priorite.MEDIUM,
    description: 'Le réservoir se remplit sans arrêt. La facture d’eau va s’en ressentir.',
    localisation: 'Salle de bain',
    statut: Statut.ASSIGNED,
    prestataire: 'Plomberie Express CI',
    declareIlYA: 4,
    echanges: [{ auteur: Auteur.MANAGER, texte: 'Passage prévu vendredi matin.', jours: 3 }]
  },
  {
    bail: 'BAIL-2026-0014',
    titre: 'Prise électrique du salon qui ne fonctionne plus',
    categorie: Categorie.ELECTRICITY,
    priorite: Priorite.MEDIUM,
    description: 'La prise près de la fenêtre a cessé de fonctionner. Les autres sont normales.',
    localisation: 'Salon, mur côté fenêtre',
    statut: Statut.IN_PROGRESS,
    declareIlYA: 3,
    echanges: [
      {
        auteur: Auteur.MANAGER,
        texte: 'Vérification du tableau prévue. Ne rien brancher sur cette prise d’ici là.',
        jours: 2
      }
    ]
  },
  {
    bail: 'BAIL-2026-0017',
    titre: 'Portail d’entrée difficile à manœuvrer',
    categorie: Categorie.OTHER,
    priorite: Priorite.LOW,
    description: 'Le portail frotte au sol et demande beaucoup d’effort.',
    localisation: 'Entrée de la cour',
    statut: Statut.DECLARED,
    declareIlYA: 5,
    echanges: []
  },
  {
    bail: 'BAIL-2026-0018',
    titre: 'Chauffe-eau sans eau chaude',
    categorie: Categorie.PLUMBING,
    priorite: Priorite.HIGH,
    description: 'Plus d’eau chaude depuis deux jours dans toute la maison.',
    localisation: 'Buanderie',
    statut: Statut.RESOLVED,
    prestataire: 'Plomberie Express CI',
    declareIlYA: 12,
    resolution: 'Résistance et thermostat remplacés. Cuve détartrée.',
    echanges: [
      { auteur: Auteur.TENANT, texte: 'Deux jours sans eau chaude avec deux enfants, c’est compliqué.', jours: 12 },
      { auteur: Auteur.MANAGER, texte: 'Nous comprenons. Intervention demandée en priorité.', jours: 12 }
    ]
  },
  {
    bail: 'BAIL-2026-0019',
    titre: 'Bruit de ventilation dans le studio',
    categorie: Categorie.AC,
    priorite: Priorite.LOW,
    description: 'La ventilation fait un bruit de vibration, surtout la nuit.',
    localisation: 'Pièce principale',
    statut: Statut.CANCELED,
    declareIlYA: 16,
    echanges: [
      { auteur: Auteur.TENANT, texte: 'Finalement le bruit a cessé de lui-même, je retire ma demande.', jours: 14 }
    ]
  }
];

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { name: true } });
  if (!tenant) throw new Error(`Agence ${TENANT_ID} introuvable`);

  const dejaLa = await prisma.maintenanceTicket.count({ where: { tenant_id: TENANT_ID } });
  if (dejaLa > 0) {
    console.log(`${dejaLa} ticket(s) déjà présents sur ${tenant.name} — rien à faire.`);
    return;
  }

  const membre = await prisma.membership.findFirst({ where: { tenantId: TENANT_ID }, select: { userId: true } });
  if (!membre) throw new Error('Aucun collaborateur : il en faut un comme gestionnaire des tickets');
  const gestionnaire = membre.userId;

  console.log(`Agence : ${tenant.name}\n`);

  // ─────────────────────────────────────────────── les prestataires
  const parNom = new Map<string, string>();
  for (const p of PRESTATAIRES) {
    const v = await prisma.maintenanceVendor.create({
      data: {
        tenant_id: TENANT_ID,
        name: p.nom,
        phone: p.tel,
        email: p.email,
        address: p.adresse,
        specialties: p.specialites,
        is_active: p.actif ?? true
      }
    });
    parNom.set(p.nom, v.id);
    console.log(`+ prestataire ${p.nom}${p.actif === false ? ' (inactif)' : ''}`);
  }

  // ───────────────────────────────────────────────────── les tickets
  let crees = 0;
  let commentaires = 0;
  let etapes = 0;
  const ignores: string[] = [];

  for (const t of TICKETS) {
    const bail = await prisma.rentalLease.findFirst({
      where: { tenant_id: TENANT_ID, lease_number: t.bail },
      select: {
        id: true,
        property_id: true,
        primaryRenter: { select: { user: { select: { email: true, fullName: true } } } }
      }
    });
    if (!bail) {
      ignores.push(t.bail);
      continue;
    }

    // Le ticket pointe le contact CRM, pas le client du portail : on le
    // retrouve par l'adresse, seule clé commune entre les deux.
    const contact = bail.primaryRenter?.user?.email
      ? await prisma.crmContact.findFirst({
          where: { tenantId: TENANT_ID, email: bail.primaryRenter.user.email },
          select: { id: true }
        })
      : null;

    const declare = ilYA(t.declareIlYA);
    const prisEnCharge = t.statut !== Statut.DECLARED ? ilYA(t.declareIlYA - 1, 10) : null;
    const assigne = t.prestataire ? ilYA(Math.max(t.declareIlYA - 2, 0), 11) : null;
    const resolu = t.statut === Statut.RESOLVED ? ilYA(Math.max(t.declareIlYA - 3, 0), 16) : null;
    const annule = t.statut === Statut.CANCELED ? ilYA(Math.max(t.declareIlYA - 2, 0), 12) : null;

    const ticket = await prisma.maintenanceTicket.create({
      data: {
        tenant_id: TENANT_ID,
        property_id: bail.property_id,
        lease_id: bail.id,
        tenant_contact_id: contact?.id ?? null,
        created_by_contact_id: contact?.id ?? null,
        title: t.titre,
        category: t.categorie,
        priority: t.priorite,
        description: t.description,
        location_details: t.localisation ?? null,
        status: t.statut,
        assigned_vendor_id: t.prestataire ? (parNom.get(t.prestataire) ?? null) : null,
        assigned_to_user_id: t.statut === Statut.DECLARED ? null : gestionnaire,
        resolution_notes: t.resolution ?? null,
        declared_at: declare,
        in_progress_at: prisEnCharge,
        assigned_at: assigne,
        resolved_at: resolu,
        canceled_at: annule
      }
    });
    crees++;

    // Historique : la trace de ce qui s'est passé, dans l'ordre.
    const parcours: { de: Statut | null; vers: Statut; quand: Date; note: string }[] = [
      { de: null, vers: Statut.DECLARED, quand: declare, note: 'Signalé depuis le portail locataire.' }
    ];
    if (prisEnCharge) {
      parcours.push({
        de: Statut.DECLARED,
        vers: Statut.IN_PROGRESS,
        quand: prisEnCharge,
        note: 'Pris en charge par l’agence.'
      });
    }
    if (assigne) {
      parcours.push({
        de: Statut.IN_PROGRESS,
        vers: Statut.ASSIGNED,
        quand: assigne,
        note: `Confié à ${t.prestataire}.`
      });
    }
    if (resolu) {
      parcours.push({
        de: assigne ? Statut.ASSIGNED : Statut.IN_PROGRESS,
        vers: Statut.RESOLVED,
        quand: resolu,
        note: t.resolution ?? 'Intervention terminée.'
      });
    }
    if (annule) {
      parcours.push({
        de: Statut.IN_PROGRESS,
        vers: Statut.CANCELED,
        quand: annule,
        note: 'Annulé à la demande du locataire.'
      });
    }

    for (const e of parcours) {
      await prisma.maintenanceTicketStatusHistory.create({
        data: {
          tenant_id: TENANT_ID,
          ticket_id: ticket.id,
          from_status: e.de,
          to_status: e.vers,
          note: e.note,
          changed_by_user_id: e.de === null ? null : gestionnaire,
          changed_at: e.quand
        }
      });
      etapes++;
    }

    for (const c of t.echanges) {
      await prisma.maintenanceTicketComment.create({
        data: {
          tenant_id: TENANT_ID,
          ticket_id: ticket.id,
          author_type: c.auteur,
          content: c.texte,
          author_user_id: c.auteur === Auteur.MANAGER ? gestionnaire : null,
          author_contact_id: c.auteur === Auteur.TENANT ? (contact?.id ?? null) : null,
          created_at: ilYA(c.jours, 15)
        }
      });
      commentaires++;
    }

    console.log(`+ [${String(t.statut).padEnd(11)}] ${t.titre.slice(0, 46)}`);
  }

  if (ignores.length > 0) console.log(`\nBaux introuvables : ${ignores.join(', ')}`);

  // ───────────────────────────────────────────────────────── bilan
  const parStatut = await prisma.maintenanceTicket.groupBy({
    by: ['status'],
    where: { tenant_id: TENANT_ID },
    _count: true
  });
  const parPriorite = await prisma.maintenanceTicket.groupBy({
    by: ['priority'],
    where: { tenant_id: TENANT_ID },
    _count: true
  });
  const parCategorie = await prisma.maintenanceTicket.groupBy({
    by: ['category'],
    where: { tenant_id: TENANT_ID },
    _count: true
  });

  console.log('\n──────────── BILAN ────────────');
  console.log(`Prestataires : ${PRESTATAIRES.length}`);
  console.log(`Tickets      : ${crees} — ${parStatut.map(s => `${s.status}=${s._count}`).join(' ')}`);
  console.log(`Priorités    : ${parPriorite.map(s => `${s.priority}=${s._count}`).join(' ')}`);
  console.log(`Catégories   : ${parCategorie.map(s => `${s.category}=${s._count}`).join(' ')}`);
  console.log(`Étapes d'historique : ${etapes} · Commentaires : ${commentaires}`);
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
