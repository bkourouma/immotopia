/**
 * Jeu de données de présentation — états des lieux des baux `PRES-NNN`.
 *
 * Suite de `seed-demo-presentation-locative.ts` : l'onglet « États des lieux » du
 * bail montre deux cartes « Non réalisé » tant que rien n'a été saisi. Ce script
 * construit de quoi dérouler tout le parcours :
 *
 *   - 14 états des lieux d'ENTRÉE finalisés (dont 2 meublés, avec mobilier,
 *     quantités et valeurs de remplacement) ;
 *   - 2 entrées laissées en BROUILLON (bouton « Continuer ») ;
 *   - 2 baux sans aucun état des lieux (bouton « Commencer ») ;
 *   - 2 états des lieux de SORTIE finalisés, avec dégradations, éléments
 *     manquants, clé non restituée et retenues sur le dépôt de garantie : c'est
 *     ce qui alimente « Comparer entrée et sortie » et le solde de tout compte ;
 *   - 1 sortie en brouillon, à moitié évaluée.
 *
 * Tout passe par le service (`createInspection`, `updateInspection`,
 * `finalizeInspection`), donc par ses règles : éléments tous évalués, signataires
 * renseignés, sortie reprenant les pièces de l'entrée.
 *
 * Idempotent : un bail qui porte déjà un état des lieux du même type est ignoré.
 *
 * Usage : npm run db:seed:presentation-edl -w @immotopia/api
 */

// ⚠ Avant tout import : les services lisent ces variables au premier envoi.
process.env.EMAIL_SMTP_HOST = '127.0.0.1';
process.env.EMAIL_SMTP_PORT = '1';
process.env.EMAIL_SMTP_USER = '';
process.env.EMAIL_SMTP_PASS = '';
delete process.env.SENDGRID_API_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;

import { PrismaClient } from '@prisma/client';
import {
  createInspection,
  updateInspection,
  finalizeInspection,
  type LeaseInspectionDto,
  type InspectionRoom,
  type InspectionItem,
  type Condition,
  type Deduction
} from '../../src/lib/lease-inspections/service';

const prisma = new PrismaClient({ log: [] });
const TENANT_ID = process.env.DEMO_TENANT_ID || 'de9ee249-d2dd-45c7-a5c2-f55b15a03969';

const AUJOURDHUI = new Date();

function jour(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function ilYA(jours: number): Date {
  const d = new Date(AUJOURDHUI);
  d.setDate(d.getDate() - jours);
  return d;
}

/** Suite déterministe : deux exécutions produisent le même jeu. */
let graine = 20261103;
function alea(max: number): number {
  graine = (graine * 1103515245 + 12345) % 2147483648;
  return Math.floor((graine / 2147483648) * max);
}

// ──────────────────────────────────────────────────────────────── le plan

interface PlanEdl {
  ref: string;
  modele: 'STANDARD' | 'FURNISHED';
  entree: 'finalisee' | 'brouillon' | 'aucune';
  sortie?: 'finalisee' | 'brouillon';
  cles: number;
  compteurs: { electricity: string; water: string; gas?: string };
  commentaire: string;
}

const PLAN: PlanEdl[] = [
  {
    ref: '001',
    modele: 'STANDARD',
    entree: 'finalisee',
    cles: 3,
    compteurs: { electricity: '12458', water: '231' },
    commentaire: 'Logement remis propre et repeint. Deux jeux de clés plus la clé du portail.'
  },
  {
    ref: '002',
    modele: 'STANDARD',
    entree: 'finalisee',
    cles: 3,
    compteurs: { electricity: '8902', water: '154' },
    commentaire: 'Appartement en très bon état, climatiseurs révisés avant l’entrée.'
  },
  {
    ref: '003',
    modele: 'STANDARD',
    entree: 'finalisee',
    cles: 2,
    compteurs: { electricity: '15331', water: '402' },
    commentaire: 'Quelques traces d’usure normales sur les murs.'
  },
  {
    ref: '004',
    modele: 'STANDARD',
    entree: 'finalisee',
    cles: 2,
    compteurs: { electricity: '6120', water: '98' },
    commentaire: 'Carreau de la salle de bain ébréché, signalé à l’entrée.'
  },
  {
    ref: '005',
    modele: 'STANDARD',
    entree: 'finalisee',
    sortie: 'finalisee',
    cles: 3,
    compteurs: { electricity: '4870', water: '76' },
    commentaire: 'Logement en bon état à l’entrée.'
  },
  {
    ref: '006',
    modele: 'STANDARD',
    entree: 'finalisee',
    cles: 2,
    compteurs: { electricity: '3215', water: '61' },
    commentaire: 'RAS.'
  },
  {
    ref: '007',
    modele: 'STANDARD',
    entree: 'finalisee',
    cles: 4,
    compteurs: { electricity: '22640', water: '510', gas: '35' },
    commentaire: 'Grand appartement, interphone testé et fonctionnel.'
  },
  {
    ref: '008',
    modele: 'STANDARD',
    entree: 'finalisee',
    cles: 2,
    compteurs: { electricity: '9780', water: '188' },
    commentaire: 'Peinture récente, sols en bon état.'
  },
  {
    ref: '010',
    modele: 'STANDARD',
    entree: 'finalisee',
    cles: 5,
    compteurs: { electricity: '31205', water: '842' },
    commentaire: 'Villa remise avec jardin entretenu et piscine traitée.'
  },
  {
    ref: '011',
    modele: 'STANDARD',
    entree: 'finalisee',
    cles: 3,
    compteurs: { electricity: '14560', water: '276' },
    commentaire: 'Terrasse étanchéifiée, portail motorisé testé.'
  },
  {
    ref: '013',
    modele: 'FURNISHED',
    entree: 'finalisee',
    sortie: 'brouillon',
    cles: 2,
    compteurs: { electricity: '1980', water: '24' },
    commentaire: 'Studio meublé : inventaire complet remis au locataire.'
  },
  {
    ref: '014',
    modele: 'FURNISHED',
    entree: 'finalisee',
    sortie: 'finalisee',
    cles: 2,
    compteurs: { electricity: '2410', water: '31' },
    commentaire: 'Studio meublé et équipé, internet fibre inclus.'
  },
  {
    ref: '016',
    modele: 'STANDARD',
    entree: 'finalisee',
    cles: 3,
    compteurs: { electricity: '18330', water: '365' },
    commentaire: 'Duplex en bon état, terrasse à surveiller (étanchéité).'
  },
  {
    ref: '018',
    modele: 'STANDARD',
    entree: 'finalisee',
    cles: 6,
    compteurs: { electricity: '27910', water: '120' },
    commentaire: 'Plateau de bureaux livré cloisonné, climatisation centralisée.'
  },
  {
    ref: '017',
    modele: 'STANDARD',
    entree: 'brouillon',
    cles: 2,
    compteurs: { electricity: '5240', water: '88' },
    commentaire: 'Visite d’entrée commencée, à terminer avec le locataire.'
  },
  {
    ref: '019',
    modele: 'STANDARD',
    entree: 'brouillon',
    cles: 3,
    compteurs: { electricity: '7115', water: '140' },
    commentaire: 'Visite d’entrée commencée.'
  },
  {
    ref: '021',
    modele: 'STANDARD',
    entree: 'aucune',
    cles: 0,
    compteurs: { electricity: '', water: '' },
    commentaire: ''
  },
  {
    ref: '022',
    modele: 'STANDARD',
    entree: 'aucune',
    cles: 0,
    compteurs: { electricity: '', water: '' },
    commentaire: ''
  }
];

/** Valeur de remplacement (FCFA) d'un meuble, à défaut 12 000. */
const VALEUR: Record<string, number> = {
  Canapé: 250000,
  Fauteuils: 90000,
  'Table basse': 60000,
  'Table à manger': 180000,
  Chaises: 25000,
  Téléviseur: 180000,
  Télécommandes: 8000,
  Climatiseur: 280000,
  Ventilateur: 35000,
  Rideaux: 40000,
  Lampes: 15000,
  Réfrigérateur: 220000,
  'Cuisinière ou plaques de cuisson': 150000,
  'Bouteille de gaz': 20000,
  'Four à micro-ondes': 60000,
  Bouilloire: 12000,
  Assiettes: 1500,
  Verres: 800,
  Couverts: 1200,
  'Casseroles et poêles': 18000,
  'Ustensiles de cuisine': 15000,
  Poubelle: 8000,
  Lit: 150000,
  Matelas: 90000,
  Oreillers: 6000,
  'Jeux de draps': 18000,
  Couvertures: 15000,
  'Armoire ou penderie': 130000,
  Cintres: 500,
  'Table de chevet': 25000,
  Moustiquaire: 12000,
  Serviettes: 5000,
  'Tapis de bain': 7000,
  Miroir: 20000,
  'Chauffe-eau': 120000,
  'Fer à repasser': 15000,
  'Planche à repasser': 12000,
  'Balai et serpillière': 5000,
  Extincteur: 30000,
  'Décodeur TV': 35000,
  'Box internet': 40000
};

const QUANTITE: Record<string, number> = {
  Fauteuils: 2,
  Chaises: 4,
  Lampes: 2,
  Assiettes: 6,
  Verres: 6,
  Couverts: 6,
  'Casseroles et poêles': 3,
  Oreillers: 2,
  'Jeux de draps': 2,
  Couvertures: 2,
  Cintres: 10,
  Serviettes: 3,
  Télécommandes: 2
};

/** État tiré à l'entrée : surtout bon, un peu d'usé, très rarement mauvais. */
function etatEntree(): Condition {
  const t = alea(100);
  if (t < 18) return 'NEW';
  if (t < 72) return 'GOOD';
  if (t < 96) return 'FAIR';
  return 'POOR';
}

const REMARQUES: Partial<Record<Condition, string[]>> = {
  FAIR: ['Légères traces d’usure.', 'Quelques marques d’utilisation.', 'Peinture un peu ternie.'],
  POOR: ['Éclat visible, signalé à l’entrée.', 'Trace d’humidité ancienne.']
};

/** Évalue tous les éléments d'une entrée ; le mobilier reçoit quantité et valeur de remplacement. */
function evaluerEntree(rooms: InspectionRoom[]): InspectionRoom[] {
  return rooms.map(room => ({
    ...room,
    items: room.items.map(item => {
      const condition = etatEntree();
      const remarques = REMARQUES[condition];
      const commentaire = remarques ? remarques[alea(remarques.length)] : null;
      if (item.kind === 'FURNITURE') {
        return {
          ...item,
          condition,
          comment: commentaire,
          quantity: QUANTITE[item.label] ?? 1,
          replacementValue: VALEUR[item.label] ?? 12000
        };
      }
      return { ...item, condition, comment: commentaire };
    })
  }));
}

interface Alteration {
  piece: string;
  /** Libellé de l'élément, ou « premier mobilier » pour le premier élément de mobilier de la pièce. */
  element: string;
  condition: Condition;
  commentaire: string;
}

/**
 * Sortie : on repart de l'entrée (mêmes états), puis on applique les altérations.
 * Un élément `limite` (brouillon) n'est évalué que dans les premières pièces.
 */
function evaluerSortie(
  entree: InspectionRoom[],
  sortie: InspectionRoom[],
  alterations: Alteration[],
  limite?: number
): InspectionRoom[] {
  const parId = new Map<string, InspectionItem>();
  for (const room of entree) for (const item of room.items) parId.set(item.id, item);

  return sortie.map((room, indexPiece) => ({
    ...room,
    items: room.items.map(item => {
      if (limite !== undefined && indexPiece >= limite) return item;
      const avant = parId.get(item.id);
      const alteration = alterations.find(
        a =>
          a.piece === room.name &&
          (a.element === item.label || (a.element === 'premier mobilier' && item.kind === 'FURNITURE'))
      );
      // « premier mobilier » ne vise que le premier élément de mobilier de la pièce.
      const premier = room.items.find(i => i.kind === 'FURNITURE');
      const touche = alteration && (alteration.element !== 'premier mobilier' || premier?.id === item.id);
      const condition: Condition = touche ? alteration!.condition : (avant?.condition ?? 'GOOD');
      const absent = condition === 'MISSING';
      return {
        ...item,
        condition,
        comment: touche ? alteration!.commentaire : null,
        ...(item.kind === 'FURNITURE' ? { quantity: absent ? 0 : (avant?.quantity ?? 1) } : {})
      };
    })
  }));
}

/** Retenues : une ligne par dégradation ou manquant, avec leur montant. */
function retenues(
  entree: InspectionRoom[],
  sortie: InspectionRoom[],
  montantsDegradation: Record<string, number>
): Deduction[] {
  const lignes: Deduction[] = [];
  const avant = new Map<string, InspectionItem>();
  for (const room of entree) for (const item of room.items) avant.set(item.id, item);

  for (const room of sortie) {
    for (const item of room.items) {
      const a = avant.get(item.id);
      if (!a || !item.condition) continue;
      if (item.condition === 'MISSING') {
        const valeur = (a.replacementValue ?? 15000) * (a.quantity ?? 1);
        lignes.push({
          id: `ded-${item.id}`,
          label: `${item.label} manquant (${room.name})`,
          amount: valeur,
          roomId: room.id,
          itemId: item.id,
          source: 'MISSING',
          proposedAmount: valeur
        });
        continue;
      }
      const montant = montantsDegradation[`${room.name}|${item.label}`];
      if (montant !== undefined) {
        lignes.push({
          id: `ded-${item.id}`,
          label: `${item.label} dégradé (${room.name})`,
          amount: montant,
          roomId: room.id,
          itemId: item.id,
          source: 'DEGRADED',
          proposedAmount: 0
        });
      }
    }
  }
  return lignes;
}

// ──────────────────────────────────────────────────────────────── main

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { name: true } });
  if (!tenant) throw new Error(`Agence ${TENANT_ID} introuvable`);
  const membre = await prisma.membership.findFirst({
    where: { tenantId: TENANT_ID },
    select: { userId: true, user: { select: { email: true, fullName: true } } }
  });
  if (!membre) throw new Error('Aucun collaborateur sur cette agence');
  const acteur = membre.userId;
  const agent = membre.user?.fullName || membre.user?.email || 'Agent';
  console.log(`Agence : ${tenant.name}\nAgent signataire : ${agent}\n`);

  let entrees = 0;
  let brouillonsEntree = 0;
  let sorties = 0;
  let brouillonsSortie = 0;

  for (const plan of PLAN) {
    const bien = await prisma.property.findFirst({
      where: { tenantId: TENANT_ID, internalReference: `PRES-${plan.ref}` },
      select: { id: true, title: true }
    });
    if (!bien) {
      console.log(`  ⨯ PRES-${plan.ref} introuvable`);
      continue;
    }
    const bail = await prisma.rentalLease.findFirst({
      where: { tenant_id: TENANT_ID, property_id: bien.id },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        lease_number: true,
        start_date: true,
        primaryRenter: { select: { user: { select: { fullName: true, email: true } } } }
      }
    });
    if (!bail) {
      console.log(`  ⨯ PRES-${plan.ref} sans bail`);
      continue;
    }
    if (plan.entree === 'aucune') {
      console.log(`  ○ ${bail.lease_number} PRES-${plan.ref} : aucun état des lieux (pour montrer « Commencer »)`);
      continue;
    }

    const locataire = bail.primaryRenter?.user?.fullName || bail.primaryRenter?.user?.email || 'Locataire';
    const existantes = await prisma.leaseInspection.findMany({
      where: { tenantId: TENANT_ID, leaseId: bail.id },
      select: { type: true }
    });
    const aEntree = existantes.some(e => e.type === 'ENTRY');
    const aSortie = existantes.some(e => e.type === 'EXIT');

    // ------------------------------------------------------------- entrée
    let entree: LeaseInspectionDto | null = null;
    if (!aEntree) {
      const creee = await createInspection(
        TENANT_ID,
        bail.id,
        { type: 'ENTRY', inspectionDate: jour(bail.start_date), template: plan.modele },
        acteur
      );
      const rooms = evaluerEntree(creee.rooms);
      const brouillon = plan.entree === 'brouillon';
      // Un brouillon : seules les deux premières pièces sont évaluées.
      const piecesSaisies = brouillon ? rooms.map((r, i) => (i < 2 ? r : creee.rooms[i])) : rooms;

      entree = await updateInspection(TENANT_ID, bail.id, creee.id, {
        inspectionDate: jour(bail.start_date),
        rooms: piecesSaisies,
        meters: {
          electricity: plan.compteurs.electricity,
          water: plan.compteurs.water,
          gas: plan.compteurs.gas ?? null
        },
        keysCount: plan.cles,
        generalComment: plan.commentaire,
        tenantPresent: true,
        tenantSignatoryName: locataire,
        agentSignatoryName: agent,
        deductions: []
      });
      if (brouillon) {
        brouillonsEntree++;
        console.log(`  ~ ${bail.lease_number} PRES-${plan.ref} entrée en brouillon`);
      } else {
        entree = await finalizeInspection(TENANT_ID, bail.id, creee.id, acteur);
        entrees++;
        console.log(
          `  + ${bail.lease_number} PRES-${plan.ref} entrée finalisée (${plan.modele === 'FURNISHED' ? 'meublé' : 'standard'})`
        );
      }
    } else if (plan.sortie) {
      // L'entrée existe déjà (reprise après arrêt) : on la relit pour préparer la sortie.
      const row = await prisma.leaseInspection.findFirst({
        where: { tenantId: TENANT_ID, leaseId: bail.id, type: 'ENTRY' },
        select: { id: true }
      });
      if (row) {
        const liste = await import('../../src/lib/lease-inspections/service').then(m =>
          m.listInspections(TENANT_ID, bail.id)
        );
        entree = liste.find(i => i.id === row.id) ?? null;
      }
    }

    // ------------------------------------------------------------- sortie
    if (!plan.sortie || aSortie || !entree || entree.status !== 'FINALIZED') continue;

    const finalisee = plan.sortie === 'finalisee';
    const dateSortie = finalisee ? ilYA(5) : AUJOURDHUI;
    const creee = await createInspection(
      TENANT_ID,
      bail.id,
      { type: 'EXIT', inspectionDate: jour(dateSortie), template: plan.modele },
      acteur
    );

    let alterations: Alteration[] = [];
    let montants: Record<string, number> = {};
    let clesRendues = plan.cles;
    if (plan.ref === '005') {
      alterations = [
        {
          piece: 'Chambre 1',
          element: 'Murs',
          condition: 'POOR',
          commentaire: 'Traces de chocs et peinture écaillée.'
        },
        { piece: 'Entrée/Séjour', element: 'Fenêtres', condition: 'BROKEN', commentaire: 'Vitre fêlée, à remplacer.' }
      ];
      montants = { 'Chambre 1|Murs': 55000, 'Entrée/Séjour|Fenêtres': 40000 };
      clesRendues = plan.cles - 1;
    } else if (plan.ref === '014') {
      alterations = [
        { piece: 'Cuisine', element: 'Sol', condition: 'POOR', commentaire: 'Carreau fendu près de l’évier.' },
        {
          piece: 'Entrée/Séjour',
          element: 'Murs',
          condition: 'POOR',
          commentaire: 'Traces de fixation et de graisse.'
        },
        {
          piece: 'Cuisine',
          element: 'Ustensiles de cuisine',
          condition: 'MISSING',
          commentaire: 'Non restitué par le locataire.'
        },
        {
          piece: 'Salle de bain',
          element: 'premier mobilier',
          condition: 'MISSING',
          commentaire: 'Non restitué par le locataire.'
        }
      ];
      montants = { 'Cuisine|Sol': 35000, 'Entrée/Séjour|Murs': 60000 };
    } else if (plan.ref === '013') {
      alterations = [
        {
          piece: 'Entrée/Séjour',
          element: 'Prises et interrupteurs',
          condition: 'FAIR',
          commentaire: 'Prise légèrement desserrée.'
        }
      ];
    }

    // Brouillon : seules les deux premières pièces sont évaluées.
    const rooms = evaluerSortie(entree.rooms, creee.rooms, alterations, finalisee ? undefined : 2);
    const lignes = finalisee ? retenues(entree.rooms, rooms, montants) : [];
    if (finalisee && clesRendues < plan.cles) {
      lignes.push({
        id: 'ded-cles',
        label: `${plan.cles - clesRendues} clé non restituée`,
        amount: 15000,
        roomId: null,
        itemId: null,
        source: 'KEYS',
        proposedAmount: 0
      });
    }

    await updateInspection(TENANT_ID, bail.id, creee.id, {
      inspectionDate: jour(dateSortie),
      rooms,
      meters: finalisee
        ? {
            // Un relevé est un nombre seul : l'écran en calcule la différence avec l'entrée.
            electricity: String(parseInt(plan.compteurs.electricity, 10) + 1850),
            water: String(parseInt(plan.compteurs.water, 10) + 32),
            gas: null
          }
        : null,
      keysCount: finalisee ? clesRendues : null,
      generalComment: finalisee
        ? 'Logement rendu avec quelques dégradations constatées contradictoirement.'
        : 'Visite de sortie commencée, à terminer avec le locataire.',
      tenantPresent: true,
      tenantSignatoryName: locataire,
      agentSignatoryName: agent,
      deductions: lignes
    });

    if (finalisee) {
      await finalizeInspection(TENANT_ID, bail.id, creee.id, acteur);
      sorties++;
      const total = lignes.reduce((s, l) => s + l.amount, 0);
      console.log(
        `  + ${bail.lease_number} PRES-${plan.ref} sortie finalisée, retenues ${total.toLocaleString('fr-FR')} FCFA`
      );
    } else {
      brouillonsSortie++;
      console.log(`  ~ ${bail.lease_number} PRES-${plan.ref} sortie en brouillon`);
    }
  }

  // `finalizeInspection` date la finalisation du jour où le script tourne ; un
  // état des lieux se finalise en fin de visite. Sans effet si c'est déjà le cas.
  const recales = await prisma.$executeRaw`
    UPDATE lease_inspections i SET finalized_at = date_trunc('day', i.inspection_date) + interval '17 hours'
    FROM rental_leases l JOIN properties p ON p.id = l.property_id
    WHERE i.lease_id = l.id AND i.tenant_id = ${TENANT_ID} AND p.internal_reference LIKE 'PRES-%'
      AND i.status = 'FINALIZED' AND i.finalized_at::date <> i.inspection_date::date`;
  if (recales > 0) console.log(`\n${recales} finalisation(s) recalée(s) au jour de la visite.`);

  const [nbEntrees, nbSorties, nbBrouillons] = await Promise.all([
    prisma.leaseInspection.count({ where: { tenantId: TENANT_ID, type: 'ENTRY' } }),
    prisma.leaseInspection.count({ where: { tenantId: TENANT_ID, type: 'EXIT' } }),
    prisma.leaseInspection.count({ where: { tenantId: TENANT_ID, status: 'DRAFT' } })
  ]);
  console.log('\n──────────── BILAN ────────────');
  console.log(`Créés dans cette exécution : ${entrees} entrées finalisées, ${brouillonsEntree} entrées en brouillon,`);
  console.log(`                             ${sorties} sorties finalisées, ${brouillonsSortie} sortie en brouillon`);
  console.log(`Total sur l'agence : ${nbEntrees} entrées, ${nbSorties} sorties, dont ${nbBrouillons} brouillon(s)`);
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
