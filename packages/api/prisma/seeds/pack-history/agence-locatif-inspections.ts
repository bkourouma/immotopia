/**
 * États des lieux d'entrée et de sortie des baux, avec pièces, compteurs,
 * signatures, retenues sur dépôt de garantie et photos réelles.
 *
 * Les pièces reprennent les modèles du produit (`lib/lease-inspections/inventory`),
 * adaptés au type de bien ; la sortie reprend les identifiants de pièce et
 * d'élément de l'entrée (comparaison entrée/sortie) et ses retenues
 * correspondent aux conservations de dépôt déjà enregistrées (`FORFEIT`).
 */
import { LeaseEventType, LeaseInspectionStatus, LeaseInspectionType, Prisma } from '@prisma/client';
import { defaultRooms, furnishedRooms } from '../../../src/lib/lease-inspections/inventory';
import type {
  Condition,
  Deduction,
  InspectionItem,
  InspectionRoom
} from '../../../src/lib/lease-inspections/inventory';
import { writeScenePhoto } from './agence-locatif-files';
import type { Scene } from './agence-locatif-files';
import { noonUtc, pickOne, pickWeighted, plusDays, roundTo, slug } from './agence-locatif-base';
import type { LeaseRow, LocatifBase } from './agence-locatif-base';

const json = (value: unknown) => value as Prisma.InputJsonValue;

// ───────────────────────────────────────────────────────────── modèles de pièces

function item(label: string, kind: 'FIXTURE' | 'FURNITURE' = 'FIXTURE'): InspectionItem {
  return { id: '', label, condition: null, comment: null, kind, quantity: null, replacementValue: null };
}

const LOCAL_FIXTURES = ['Sol', 'Murs', 'Plafond', 'Portes', 'Fenêtres', 'Prises et interrupteurs', 'Éclairage'];

function customRooms(type: string): InspectionRoom[] | null {
  const room = (name: string, labels: string[]): InspectionRoom => ({
    id: '',
    name,
    items: labels.map(label => item(label))
  });
  switch (type) {
    case 'BUREAU':
      return [
        room('Open space', [...LOCAL_FIXTURES, 'Climatisation', 'Câblage réseau']),
        room('Bureaux fermés', ['Sol', 'Murs', 'Portes', 'Cloisons vitrées', 'Prises et interrupteurs']),
        room('Sanitaires', ['Sol', 'Murs', 'Lavabo', 'Cuvette et chasse d’eau']),
        room('Local technique', ['Tableau électrique', 'Compteur', 'Porte d’accès'])
      ];
    case 'BOUTIQUE_COMMERCIAL':
      return [
        room('Surface de vente', [...LOCAL_FIXTURES, 'Vitrine', 'Climatisation']),
        room('Réserve', ['Sol', 'Murs', 'Étagères', 'Porte de service']),
        room('Sanitaires', ['Sol', 'Murs', 'Lavabo', 'Cuvette et chasse d’eau']),
        room('Façade', ['Rideau métallique', 'Enseigne', 'Serrure principale'])
      ];
    case 'ENTREPOT_INDUSTRIEL':
      return [
        room('Hall de stockage', ['Dalle béton', 'Murs', 'Charpente et toiture', 'Éclairage', 'Portail coulissant']),
        room('Quai de chargement', ['Dalle béton', 'Auvent', 'Porte sectionnelle']),
        room('Bureau d’exploitation', ['Sol', 'Murs', 'Plafond', 'Climatisation', 'Prises et interrupteurs']),
        room('Sanitaires', ['Sol', 'Murs', 'Douche', 'Cuvette et chasse d’eau'])
      ];
    case 'PARKING_BOX':
      return [room('Emplacement', ['Sol', 'Porte ou portail', 'Éclairage', 'Numérotation au sol'])];
    case 'TERRAIN':
      return [room('Terrain', ['Clôture', 'Portail', 'Sol et drainage', 'Bornage'])];
    case 'IMMEUBLE':
      return [
        room('Parties communes', ['Hall d’entrée', 'Escalier', 'Toiture-terrasse', 'Compteurs', 'Boîtes aux lettres']),
        room('Cour et accès', ['Portail', 'Clôture', 'Éclairage extérieur', 'Revêtement de la cour'])
      ];
    default:
      return null;
  }
}

function residentialRooms(type: string, rooms: number | null): InspectionRoom[] {
  if (type === 'STUDIO') {
    return furnishedRooms({ withQuantities: true }).filter(r => r.name !== 'Chambre 1');
  }
  const base = defaultRooms();
  const bedroomTemplate = base.find(r => r.name === 'Chambre 1');
  const extraBedrooms = type === 'MAISON_VILLA' ? 2 : type === 'DUPLEX_TRIPLEX' ? 2 : (rooms ?? 3) >= 4 ? 1 : 0;
  const result = [...base];
  if (bedroomTemplate) {
    for (let i = 0; i < extraBedrooms; i++) {
      result.splice(3 + i, 0, {
        ...bedroomTemplate,
        id: '',
        name: `Chambre ${i + 2}`,
        items: bedroomTemplate.items.map(it => ({ ...it, id: '' }))
      });
    }
  }
  if (type === 'MAISON_VILLA' || type === 'DUPLEX_TRIPLEX') {
    result.push({
      id: '',
      name: type === 'MAISON_VILLA' ? 'Cour et clôture' : 'Terrasse',
      items: ['Sol', 'Garde-corps ou clôture', 'Portail ou porte-fenêtre', 'Éclairage extérieur'].map(l => item(l))
    });
  }
  return result;
}

/** Pièces d'un bien, avec des identifiants stables (repris de l'entrée à la sortie). */
export function roomsFor(lease: LeaseRow): InspectionRoom[] {
  const rooms = customRooms(lease.propertyType) ?? residentialRooms(lease.propertyType, null);
  return rooms.map((room, ri) => ({
    ...room,
    id: `piece-${ri + 1}`,
    items: room.items.map((it, ii) => ({ ...it, id: `piece-${ri + 1}-el-${ii + 1}` }))
  }));
}

// ───────────────────────────────────────────────────────────── évaluation

const WEAR_COMMENTS = [
  'Légère usure normale.',
  'Quelques traces d’usage.',
  'Petite rayure sans gravité.',
  'Peinture légèrement ternie.',
  'Joint à reprendre à terme.',
  'Trace d’humidité ancienne, sèche.',
  'Fonctionne, mais un peu dur.'
];

const QUANTITY_BY_LABEL: Record<string, number> = {
  Chaises: 4,
  Fauteuils: 2,
  Assiettes: 6,
  Verres: 6,
  Couverts: 6,
  Oreillers: 2,
  Cintres: 10,
  'Casseroles et poêles': 4,
  'Ustensiles de cuisine': 8,
  'Jeux de draps': 2,
  Couvertures: 2,
  Serviettes: 3,
  Lampes: 3,
  Rideaux: 3,
  Télécommandes: 2
};

function replacementValueFor(label: string): number {
  const l = label.toLowerCase();
  if (/canapé|armoire|réfrigérateur|lit$|climatiseur|téléviseur|chauffe-eau/.test(l)) return 250000;
  if (/matelas|cuisinière|table à manger|micro-ondes/.test(l)) return 120000;
  if (/table|fauteuil|ventilateur|décodeur|box/.test(l)) return 45000;
  return 12000;
}

const WORSE: Record<Condition, Condition> = {
  NEW: 'GOOD',
  GOOD: 'FAIR',
  FAIR: 'POOR',
  POOR: 'POOR',
  BROKEN: 'BROKEN',
  MISSING: 'MISSING'
};

function evaluateEntry(rooms: InspectionRoom[], rng: () => number, completeRatio = 1): InspectionRoom[] {
  let index = 0;
  const total = rooms.reduce((s, r) => s + r.items.length, 0);
  return rooms.map(room => ({
    ...room,
    items: room.items.map(it => {
      index += 1;
      if (index > total * completeRatio) return { ...it };
      const condition = pickWeighted<Condition>(rng, [
        ['NEW', 24],
        ['GOOD', 52],
        ['FAIR', 18],
        ['POOR', 6]
      ]);
      const furniture = it.kind === 'FURNITURE';
      return {
        ...it,
        condition,
        comment: condition === 'FAIR' || condition === 'POOR' ? pickOne(rng, WEAR_COMMENTS) : null,
        quantity: furniture ? (QUANTITY_BY_LABEL[it.label] ?? 1) : null,
        replacementValue: furniture ? replacementValueFor(it.label) : null
      };
    })
  }));
}

function deductionLabel(room: InspectionRoom, it: InspectionItem): string {
  const l = it.label.toLowerCase();
  if (l === 'murs') return `Remise en peinture — ${room.name}`;
  if (l === 'sol') return `Remplacement de carreaux — ${room.name}`;
  if (l.includes('fenêtre') || l.includes('vitr')) return `Remplacement d’une vitre — ${room.name}`;
  if (l.includes('robinet') || l.includes('évier')) return `Remplacement de la robinetterie — ${room.name}`;
  if (l.includes('porte') || l.includes('serrure')) return `Réparation de serrure et de porte — ${room.name}`;
  return `Remise en état — ${it.label} (${room.name})`;
}

interface ExitResult {
  rooms: InspectionRoom[];
  deductions: Deduction[];
  damaged: Array<{ roomId: string; itemId: string; label: string }>;
}

function evaluateExit(entryRooms: InspectionRoom[], rng: () => number, forfeit: number): ExitResult {
  const rooms: InspectionRoom[] = entryRooms.map(room => ({
    ...room,
    items: room.items.map(it => {
      const entry = (it.condition ?? 'GOOD') as Condition;
      const worn = rng() < 0.22 ? WORSE[entry] : entry;
      return {
        ...it,
        condition: worn,
        comment: worn !== entry ? pickOne(rng, WEAR_COMMENTS) : rng() < 0.3 ? it.comment : null
      };
    })
  }));

  const deductions: Deduction[] = [];
  const damaged: ExitResult['damaged'] = [];
  if (forfeit > 0) {
    const k = forfeit >= 60000 ? 3 : forfeit >= 30000 ? 2 : 1;
    const candidates: Array<{ room: InspectionRoom; it: InspectionItem }> = [];
    for (const room of rooms) {
      for (const it of room.items) {
        if (
          it.kind !== 'FURNITURE' &&
          /^(murs|sol|fenêtres|portes|robinetterie|évier et robinetterie)$/i.test(it.label)
        ) {
          candidates.push({ room, it });
        }
      }
    }
    const used = new Set<number>();
    let remaining = forfeit;
    for (let n = 0; n < k && candidates.length > 0; n++) {
      let pickIdx = Math.floor(rng() * candidates.length);
      let guard = 0;
      while (used.has(pickIdx) && guard++ < 20) pickIdx = (pickIdx + 1) % candidates.length;
      used.add(pickIdx);
      const { room, it } = candidates[pickIdx];
      const amount = n === k - 1 ? remaining : Math.min(remaining, Math.max(1000, roundTo(forfeit / k, 1000)));
      remaining -= amount;
      it.condition = rng() < 0.5 ? 'BROKEN' : 'POOR';
      it.comment = `Dégradation constatée à la sortie : ${it.condition === 'BROKEN' ? 'élément hors d’usage' : 'état très dégradé'}, au-delà de l’usure normale.`;
      deductions.push({
        id: `retenue-${n + 1}`,
        label: deductionLabel(room, it),
        amount,
        roomId: room.id,
        itemId: it.id,
        source: 'DEGRADED',
        proposedAmount: amount
      });
      damaged.push({ roomId: room.id, itemId: it.id, label: `${room.name} — ${it.label}` });
    }
    if (remaining > 0 && deductions.length > 0) deductions[deductions.length - 1].amount += remaining;
  }
  return { rooms, deductions, damaged };
}

function sceneFor(roomName: string): Scene {
  const n = roomName.toLowerCase();
  if (n.includes('séjour') || n.includes('surface de vente')) return 'SALON';
  if (n.includes('chambre')) return 'CHAMBRE';
  if (n.includes('cuisine')) return 'CUISINE';
  if (n.includes('bureau') || n.includes('open space')) return 'BUREAU';
  return 'EXTERIEUR';
}

// ───────────────────────────────────────────────────────────── écriture

export async function seedInspections(base: LocatifBase): Promise<void> {
  const { ctx } = base;
  const { prisma, tenantId, rng, log, end } = ctx;

  const existing = await prisma.leaseInspection.count({ where: { tenantId } });
  if (existing > 0) {
    log(`états des lieux : ${existing} déjà présents, bloc sauté.`);
    return;
  }

  const forfeits = await prisma.rentalDepositMovement.findMany({
    where: { tenant_id: tenantId, type: 'FORFEIT' },
    select: { amount: true, deposit: { select: { lease_id: true } } }
  });
  const forfeitByLease = new Map<string, number>();
  for (const f of forfeits) {
    forfeitByLease.set(f.deposit.lease_id, (forfeitByLease.get(f.deposit.lease_id) ?? 0) + Number(f.amount));
  }
  const terminations = await prisma.leaseEvent.findMany({
    where: { tenantId, type: LeaseEventType.TERMINATION },
    select: { leaseId: true, effectiveDate: true }
  });
  const noticeLeases = new Set(terminations.filter(t => t.effectiveDate > end).map(t => t.leaseId));

  const newest = base.leases.reduce((a, b) => (a.start > b.start ? a : b), base.leases[0]);
  let entryCount = 0;
  let exitCount = 0;
  let photoCount = 0;

  for (const lease of base.leases) {
    const agent = pickOne(rng, base.signers);
    const agentName = agent.name;
    const entryDate = noonUtc(lease.moveIn ?? lease.start);
    const isDraftEntry = lease.id === newest.id;

    const entryRooms = evaluateEntry(roomsFor(lease), rng, isDraftEntry ? 0.55 : 1);
    const entry = await prisma.leaseInspection.create({
      data: {
        tenantId,
        leaseId: lease.id,
        type: LeaseInspectionType.ENTRY,
        status: isDraftEntry ? LeaseInspectionStatus.DRAFT : LeaseInspectionStatus.FINALIZED,
        inspectionDate: entryDate,
        rooms: json(entryRooms),
        meters: json({
          electricity: `CIE — ${Math.floor(1000 + rng() * 8000)} kWh`,
          water: `SODECI — ${Math.floor(100 + rng() * 900)} m³`,
          gas: lease.propertyType === 'APPARTEMENT' || lease.propertyType === 'MAISON_VILLA' ? 'Bouteille pleine' : null
        }),
        keysCount: 2 + Math.floor(rng() * 3),
        generalComment: isDraftEntry
          ? 'État des lieux en cours : relevé des pièces à terminer avec le locataire.'
          : pickOne(rng, [
              'Logement remis propre, peintures récentes. Clés remises en main propre.',
              'Bien en bon état général, quelques retouches de peinture à prévoir par le bailleur.',
              'Entrée dans les lieux sans réserve majeure, compteurs relevés en présence des deux parties.',
              'Locataire satisfait de l’état du bien ; réserves mineures consignées ci-dessus.'
            ]),
        tenantPresent: true,
        tenantSignatoryName: isDraftEntry ? null : lease.renterName,
        agentSignatoryName: agentName,
        deductions: json([]),
        finalizedAt: isDraftEntry ? null : plusDays(entryDate, 0),
        finalizedByUserId: isDraftEntry ? null : agent.id,
        createdByUserId: agent.id,
        createdAt: plusDays(entryDate, isDraftEntry ? 0 : -1),
        updatedAt: entryDate
      },
      select: { id: true }
    });
    entryCount += 1;

    if (rng() < 0.55) {
      photoCount += await addPhotos(
        base,
        entry.id,
        lease,
        entryRooms,
        'entree',
        2 + Math.floor(rng() * 2),
        agent.id,
        entryDate
      );
    }

    const isEnded = lease.status === 'ENDED';
    const hasNotice = noticeLeases.has(lease.id);
    if (!isEnded && !hasNotice) continue;

    const forfeit = forfeitByLease.get(lease.id) ?? 0;
    const exitDate = noonUtc(isEnded ? (lease.moveOut ?? lease.end ?? end) : (lease.end ?? end));
    const isDraftExit = !isEnded;
    const exitEval = evaluateExit(entryRooms, rng, forfeit);
    const tenantAbsent = isEnded && forfeit === 0 && exitCount === 3;
    const exit = await prisma.leaseInspection.create({
      data: {
        tenantId,
        leaseId: lease.id,
        type: LeaseInspectionType.EXIT,
        status: isDraftExit ? LeaseInspectionStatus.DRAFT : LeaseInspectionStatus.FINALIZED,
        inspectionDate: exitDate,
        rooms: json(
          isDraftExit
            ? entryRooms.map(r => ({ ...r, items: r.items.map(i => ({ ...i, condition: null })) }))
            : exitEval.rooms
        ),
        meters: json({
          electricity: `CIE — ${Math.floor(9000 + rng() * 9000)} kWh`,
          water: `SODECI — ${Math.floor(1000 + rng() * 1500)} m³`,
          gas: null
        }),
        keysCount: isDraftExit ? null : 2 + Math.floor(rng() * 3),
        generalComment: isDraftExit
          ? 'Pré-visite de sortie planifiée avec le locataire avant la fin du préavis.'
          : tenantAbsent
            ? 'Locataire absent à la sortie : état des lieux établi en présence du gardien de l’immeuble.'
            : forfeit > 0
              ? 'Sortie avec dégradations au-delà de l’usure normale : retenues proposées sur le dépôt de garantie.'
              : 'Sortie sans dégradation notable ; restitution intégrale du dépôt de garantie.',
        tenantPresent: !tenantAbsent,
        tenantSignatoryName: isDraftExit || tenantAbsent ? null : lease.renterName,
        agentSignatoryName: isDraftExit ? null : agentName,
        deductions: json(isDraftExit ? [] : exitEval.deductions),
        finalizedAt: isDraftExit ? null : plusDays(exitDate, 0),
        finalizedByUserId: isDraftExit ? null : agent.id,
        createdByUserId: agent.id,
        createdAt: exitDate,
        updatedAt: exitDate
      },
      select: { id: true }
    });
    exitCount += 1;
    if (!isDraftExit) {
      photoCount += await addPhotos(
        base,
        exit.id,
        lease,
        exitEval.rooms,
        'sortie',
        forfeit > 0 ? 3 : 2,
        agent.id,
        exitDate,
        exitEval.damaged
      );
    }
  }
  log(`états des lieux : ${entryCount} entrées, ${exitCount} sorties, ${photoCount} photos.`);
}

async function addPhotos(
  base: LocatifBase,
  inspectionId: string,
  lease: LeaseRow,
  rooms: InspectionRoom[],
  phase: string,
  count: number,
  userId: string,
  at: Date,
  damaged: Array<{ roomId: string; itemId: string; label: string }> = []
): Promise<number> {
  const { prisma, tenantId, rng } = base.ctx;
  let written = 0;
  for (let n = 0; n < count; n++) {
    const target = damaged[n];
    const room = target
      ? (rooms.find(r => r.id === target.roomId) ?? rooms[0])
      : rooms[Math.floor(rng() * rooms.length)];
    const scene = sceneFor(room.name);
    const stored = await writeScenePhoto(
      ['lease-inspections', tenantId, inspectionId],
      `${phase}-${n + 1}-${slug(room.name)}.png`,
      lease.propertyType,
      `${lease.id}:${phase}`,
      scene,
      n
    );
    await prisma.leaseInspectionPhoto.create({
      data: {
        tenantId,
        inspectionId,
        roomId: room.id,
        itemId: target?.itemId ?? null,
        fileName: stored.fileName,
        filePath: stored.filePath,
        mimeType: stored.mimeType,
        sizeBytes: stored.fileSize,
        caption: target ? `${target.label} — dégradation constatée` : `${room.name} — vue d’ensemble`,
        uploadedByUserId: userId,
        createdAt: at
      }
    });
    written += 1;
  }
  return written;
}
