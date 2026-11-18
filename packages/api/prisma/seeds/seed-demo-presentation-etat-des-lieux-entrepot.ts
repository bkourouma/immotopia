/**
 * Jeu de données de présentation — état des lieux d'entrée de l'entrepôt
 * (BAIL-2026-0026, bien `PRES-022`).
 *
 * `seed-demo-presentation-etats-des-lieux.ts` laisse ce bail sans état des lieux
 * pour montrer le bouton « Commencer ». Une fois l'entrée commencée, le modèle
 * « logement » (séjour, cuisine, chambre…) ne convient pas à un entrepôt
 * industriel : ce script remplace ses pièces par celles d'un entrepôt, évalue
 * chaque élément et finalise l'état des lieux.
 *
 * Tout passe par le service (`updateInspection`, `finalizeInspection`), donc par
 * ses règles : éléments tous évalués, signataires renseignés.
 *
 * Idempotent et prudent : un état des lieux d'entrée déjà finalisé, ou un
 * brouillon dont des éléments sont déjà évalués, n'est pas touché.
 *
 * Usage : npm run db:seed:presentation-edl-entrepot -w @immotopia/api
 */

// ⚠ Avant tout import : les services lisent ces variables au premier envoi.
process.env.EMAIL_SMTP_HOST = '127.0.0.1';
process.env.EMAIL_SMTP_PORT = '1';
process.env.EMAIL_SMTP_USER = '';
process.env.EMAIL_SMTP_PASS = '';
delete process.env.SENDGRID_API_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;

import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  createInspection,
  updateInspection,
  finalizeInspection,
  type Condition,
  type InspectionItem,
  type InspectionRoom
} from '../../src/lib/lease-inspections/service';

const prisma = new PrismaClient({ log: [] });
const TENANT_ID = process.env.DEMO_TENANT_ID || 'de9ee249-d2dd-45c7-a5c2-f55b15a03969';
const LEASE_NUMBER = 'BAIL-2026-0026';

function jour(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function element(
  label: string,
  condition: Condition,
  comment: string | null = null,
  mobilier?: { quantity: number; replacementValue: number }
): InspectionItem {
  return {
    id: randomUUID(),
    label,
    condition,
    comment,
    ...(mobilier ? { kind: 'FURNITURE' as const, ...mobilier } : { kind: 'FIXTURE' as const })
  };
}

function piece(name: string, items: InspectionItem[]): InspectionRoom {
  return { id: randomUUID(), name, items };
}

/** Pièces d'un entrepôt industriel de 600 m² (zone industrielle). */
function piecesEntrepot(): InspectionRoom[] {
  return [
    piece('Zone de stockage', [
      element('Dalle béton', 'GOOD', 'Quelques traces d’huile près du quai nord, aucune fissure.'),
      element('Murs et bardage', 'GOOD'),
      element('Charpente métallique et toiture', 'GOOD', 'Aucune infiltration constatée.'),
      element('Éclairage LED du hall', 'GOOD'),
      element('Armoire électrique et prises industrielles', 'GOOD'),
      element('Rayonnages métalliques', 'GOOD', null, { quantity: 24, replacementValue: 85000 }),
      element('Extincteurs', 'GOOD', 'Vérifiés, étiquette de contrôle à jour.', {
        quantity: 6,
        replacementValue: 45000
      })
    ]),
    piece('Quai de chargement', [
      element('Quai surélevé et rampe d’accès', 'GOOD'),
      element('Portes sectionnelles du quai', 'GOOD'),
      element('Niveleur de quai', 'FAIR', 'Légère usure des charnières, fonctionne normalement.'),
      element('Butoirs en caoutchouc', 'FAIR', 'Deux butoirs usés sur le quai sud.')
    ]),
    piece('Bureau', [
      element('Porte et serrure', 'GOOD'),
      element('Fenêtres', 'GOOD'),
      element('Sol carrelé', 'GOOD'),
      element('Peinture des murs', 'NEW', 'Repeint avant l’entrée.'),
      element('Climatiseur', 'GOOD', 'Révisé avant l’entrée.'),
      element('Prises et éclairage', 'GOOD')
    ]),
    piece('Sanitaires', [
      element('Lavabo et robinetterie', 'GOOD'),
      element('WC', 'GOOD'),
      element('Chauffe-eau', 'GOOD'),
      element('Carrelage', 'GOOD'),
      element('Ventilation', 'GOOD')
    ]),
    piece('Extérieur et parking', [
      element('Clôture et portail d’entrée', 'GOOD'),
      element('Revêtement de la cour', 'FAIR', 'Quelques nids-de-poule près du portail.'),
      element('Aire de manœuvre des camions', 'GOOD'),
      element('Éclairage extérieur', 'GOOD')
    ])
  ];
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { name: true } });
  if (!tenant) throw new Error(`Agence ${TENANT_ID} introuvable`);
  const membre = await prisma.membership.findFirst({
    where: { tenantId: TENANT_ID },
    select: { userId: true, user: { select: { email: true, fullName: true } } }
  });
  if (!membre) throw new Error('Aucun collaborateur sur cette agence');
  const agent = membre.user?.fullName || membre.user?.email || 'Agent';

  const bail = await prisma.rentalLease.findFirst({
    where: { tenant_id: TENANT_ID, lease_number: LEASE_NUMBER },
    select: {
      id: true,
      start_date: true,
      primaryRenter: { select: { user: { select: { fullName: true, email: true } } } }
    }
  });
  if (!bail) throw new Error(`${LEASE_NUMBER} introuvable`);
  const locataire = bail.primaryRenter?.user?.fullName || bail.primaryRenter?.user?.email || 'Locataire';

  console.log(`Agence : ${tenant.name}\nBail : ${LEASE_NUMBER}\nAgent signataire : ${agent}\n`);

  const existante = await prisma.leaseInspection.findFirst({
    where: { tenantId: TENANT_ID, leaseId: bail.id, type: 'ENTRY' },
    select: { id: true, status: true, rooms: true }
  });

  if (existante?.status === 'FINALIZED') {
    console.log('  = entrée déjà finalisée : rien à faire');
    return;
  }

  let inspectionId = existante?.id;
  if (existante) {
    const pieces = (existante.rooms as unknown as InspectionRoom[]) ?? [];
    const evalues = pieces.reduce((n, r) => n + r.items.filter(i => i.condition).length, 0);
    if (evalues > 0) {
      console.log(`  = un brouillon déjà rempli (${evalues} éléments évalués) : non touché`);
      return;
    }
  } else {
    const creee = await createInspection(
      TENANT_ID,
      bail.id,
      { type: 'ENTRY', inspectionDate: jour(bail.start_date), template: 'STANDARD' },
      membre.userId
    );
    inspectionId = creee.id;
  }

  await updateInspection(TENANT_ID, bail.id, inspectionId!, {
    inspectionDate: jour(bail.start_date),
    rooms: piecesEntrepot(),
    meters: { electricity: '48210', water: '1394', gas: null },
    keysCount: 4,
    generalComment:
      'Entrepôt remis vide et balayé. Quatre clés remises : deux pour le portail principal, une pour le bureau, une pour les sanitaires. Quai de chargement opérationnel.',
    tenantPresent: true,
    tenantSignatoryName: locataire,
    agentSignatoryName: agent,
    deductions: []
  });
  await finalizeInspection(TENANT_ID, bail.id, inspectionId!, membre.userId);
  console.log(`  + ${LEASE_NUMBER} : état des lieux d'entrée de l'entrepôt rempli et finalisé`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
