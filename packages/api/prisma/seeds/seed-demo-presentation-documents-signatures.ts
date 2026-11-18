/**
 * Jeu de données de présentation — onglets « Documents » et « Signatures » des
 * baux `PRES-NNN`, signatures des états des lieux et des mandats de gestion.
 *
 * Suite de `seed-demo-presentation-locative.ts` (biens, baux, échéances,
 * paiements), `…-annexes.ts` (mandats de gestion) et `…-etats-des-lieux.ts`
 * (états des lieux). Ce script remplit :
 *
 *   DOCUMENTS (onglet « Documents » du bail)
 *   - un contrat de bail FINAL par bail (modèle habitation ou commercial) ;
 *   - des reçus de loyer des échéances payées (les trois dernières de chaque bail,
 *     toutes pour les baux vitrines), des quittances, un reçu de dépôt de garantie
 *     par bail, des relevés de compte, des avenants ;
 *   - des statuts variés : brouillon, annulé, révision (régénération).
 *
 *   SIGNATURES (onglet « Signatures », « États des lieux », « Mandat de gestion »)
 *   - états des lieux : signé sur place et scellé, signé par code et scellé,
 *     envoyé en attente (par e-mail, et « à signer sur place » pour la démonstration
 *     en direct), partiellement signé (+ refusé, annulé, expiré quand les contrats
 *     ne peuvent pas être convertis en PDF) ;
 *   - mandats de gestion : la signature posée à la main par `…-annexes.ts`
 *     (`signedAt` sans demande) est remplacée par une vraie demande signée et
 *     scellée ; une demande reste en attente ;
 *   - contrats de bail à tous les stades (envoyé, partiel, signé sur place,
 *     signé par code, refusé, annulé, expiré) SI la conversion DOCX→PDF est
 *     disponible (`DOCX_PDF_CONVERTER=libreoffice` et LibreOffice installé) ; sinon
 *     l'étape est sautée avec un message.
 *
 * Partis pris :
 *   - tout ce qui a un service passe par le service : génération des contrats,
 *     reçus et relevés (`document-generation-service`), changement de statut
 *     (`rental-document-service`), création / annulation / expiration des demandes
 *     de signature (`signature-service`), parcours signataire — code, signature,
 *     refus (`signature-public-service`) — et scellement (`lib/signature/sealing`,
 *     déclenché par la dernière signature). Aucune signature n'est simulée en base ;
 *   - ne sont écrits « à la main » que les types que l'application ne produit plus
 *     avec un fichier : quittance (RENT_QUITTANCE), reçu de dépôt (DEPOSIT_RECEIPT),
 *     avenant (LEASE_ADDENDUM), comme le fait `pack-history/agence-locatif-documents.ts` ;
 *   - fournisseur de signature `log` forcé pour ce processus : RIEN ne part (ni
 *     e-mail, ni SMS, ni WhatsApp) ; les liens et codes sont lus dans le tampon
 *     du fournisseur pour dérouler le parcours signataire. Ce choix ne change pas
 *     la configuration de l'API ;
 *   - le quota mensuel de signatures (SIGNATURES_MENSUELLES) est respecté, jamais
 *     contourné : une marge est laissée pour envoyer une demande en direct ;
 *   - idempotent : chaque élément est retrouvé par sa clé naturelle avant d'être
 *     créé, on peut relancer sans rien dupliquer ;
 *   - une étape qui échoue n'arrête pas les autres : elle est signalée au bilan.
 *
 * Expiration : une demande est créée avec l'échéance la plus courte permise
 * (1 jour), un signataire signe, puis l'échéance est reculée en base ; c'est la
 * routine de l'application (`expireDueSignatureRequests`) qui passe la demande à
 * EXPIRED. Elle n'est appelée que si aucune demande d'une autre agence n'est échue.
 *
 * Réparation des modèles : les lignes `document_templates` globales peuvent pointer
 * un fichier absent (nom horodaté d'une autre installation). Le script recopie, sous
 * le nom attendu, le fichier livré de MÊME empreinte (SHA-256) ; rien n'est modifié en base.
 *
 * Usage : npm run db:seed:presentation-documents -w @immotopia/api
 */

// ⚠ Avant tout import : les services lisent ces variables au premier envoi.
process.env.EMAIL_SMTP_HOST = '127.0.0.1';
process.env.EMAIL_SMTP_PORT = '1';
process.env.EMAIL_SMTP_USER = '';
process.env.EMAIL_SMTP_PASS = '';
delete process.env.SENDGRID_API_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;
// Fournisseur de signature « log » : rien ne part, les messages restent en mémoire.
process.env.SIGNATURE_PROVIDER = 'log';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { deflateSync } from 'zlib';
import { DocumentType, Prisma, PrismaClient, RentalDocumentStatus, RentalDocumentType } from '@prisma/client';

import {
  generateDocument,
  regenerateDocument,
  resolveLeaseDocumentType
} from '../../src/services/document-generation-service';
import { updateDocumentStatus } from '../../src/services/rental-document-service';
import {
  cancelSignatureRequest,
  createSignatureRequest,
  expireDueSignatureRequests,
  getSignatureTargetContext
} from '../../src/services/signature-service';
import { declinePublic, sendPublicOtp, signPublic } from '../../src/services/signature-public-service';
import { countSignaturesThisMonth } from '../../src/services/subscription-v2-service';
import { resolveSignatureQuotaPolicy } from '../../src/lib/signature/quota';
import { takeLoggedSignatureMessages } from '../../src/lib/signature/provider/log';
import { isDocxPdfConversionAvailable } from '../../src/lib/pdf-convert';
import { getShippedTemplatesDir, getTemplatesWriteDir } from '../../src/utils/assets-paths';
import { prisma as appPrisma } from '../../src/utils/database';
import { runWithTenantContext } from '../../src/utils/tenant-context';
import { DOCX_MIME, saveRentalDocx } from './pack-history/agence-locatif-files';

const prisma = new PrismaClient({ log: [] });
const TENANT_ID = process.env.DEMO_TENANT_ID || 'de9ee249-d2dd-45c7-a5c2-f55b15a03969';

// Bruit filtré : requêtes Prisma (journal de développement de l'API), avertissement de
// docxtemplater, et échecs d'envoi d'e-mail (le SMTP est neutralisé exprès : ils sont
// attendus, et comptés au bilan).
const say = console.log.bind(console);
const direError = console.error.bind(console);
const direWarn = console.warn.bind(console);
let emailsRefuses = 0;
console.log = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('prisma:query')) return;
  say(...args);
};
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('Deprecated method')) return;
  direWarn(...args);
};
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('Error sending email')) {
    emailsRefuses++;
    return;
  }
  direError(...args);
};

const MAINTENANT = new Date();

function ilYA(jours: number): Date {
  const d = new Date(MAINTENANT);
  d.setDate(d.getDate() - jours);
  d.setHours(12, 0, 0, 0);
  return d;
}

// ──────────────────────────────────────────────────────────── bilan et utilitaires

const bilan: { etape: string; ok: number; echecs: string[] }[] = [];
const crees: Record<string, number> = {};
const dureesMs: number[] = [];

function compte(cle: string): void {
  crees[cle] = (crees[cle] ?? 0) + 1;
}

function dernierMessage(e: unknown): string {
  return e instanceof Error ? e.message.split('\n').filter(Boolean).slice(-1)[0] : String(e);
}

/** Une étape qui échoue est notée au bilan ; les autres continuent. */
async function etape(nom: string, fn: () => Promise<number>): Promise<void> {
  say(`\n── ${nom}`);
  const echecsAvant = echecsEtape.length;
  try {
    const ok = await fn();
    bilan.push({ etape: nom, ok, echecs: echecsEtape.slice(echecsAvant) });
  } catch (e) {
    const message = dernierMessage(e);
    say(`  ⨯ étape interrompue : ${message}`);
    bilan.push({ etape: nom, ok: 0, echecs: [message, ...echecsEtape.slice(echecsAvant)] });
  }
}

const echecsEtape: string[] = [];

/** Tente une écriture ; renvoie vrai si elle est passée, journalise sinon. Le texte rendu complète le libellé. */
async function essaie(libelle: string, fn: () => Promise<string | void>): Promise<boolean> {
  try {
    const detail = await fn();
    say(`  + ${libelle}${detail ? ` — ${detail}` : ''}`);
    return true;
  } catch (e) {
    const message = dernierMessage(e);
    say(`  ⨯ ${libelle} — ${message}`);
    echecsEtape.push(`${libelle} : ${message}`);
    return false;
  }
}

/** Compteur partagé (numérotation) en concurrence avec d'autres scripts : on relance. */
async function avecRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let essai = 0; ; essai++) {
    try {
      return await fn();
    } catch (e) {
      const unique =
        (e as { code?: string })?.code === 'P2002' || /Unique constraint/i.test((e as Error)?.message ?? '');
      if (!unique || essai >= 3) throw e;
      await new Promise(resolve => setTimeout(resolve, 300 * (essai + 1)));
    }
  }
}

function fcfa(montant: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(montant)).replace(/[\u202f\u00a0]/g, ' ')} F CFA`;
}

function dateFr(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
];

function periodeFr(annee: number, mois: number): string {
  return `${MOIS[mois - 1]} ${annee}`;
}

function aaaamm(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ──────────────────────────────────────────────────────────────── contexte

let acteur = '';
let agentNom = '';
let CTX: { tenantId: string; userId: string } = { tenantId: TENANT_ID, userId: '' };

/** Biens de la présentation dont le bail est « occupé » (les vacants n'ont pas de bail actif). */
const REFS_OCCUPES = [
  '001',
  '002',
  '003',
  '004',
  '005',
  '006',
  '007',
  '008',
  '010',
  '011',
  '013',
  '014',
  '016',
  '017',
  '018',
  '019',
  '021',
  '022'
];
/**
 * 005 (bail 0013) et 014 (bail 0020) sont traités en premier : un autre script va
 * les résilier, et la génération d'un document pourrait être refusée ensuite.
 */
const PRIORITE = ['005', '014'];
const ORDRE = [...PRIORITE, ...REFS_OCCUPES.filter(r => !PRIORITE.includes(r))];
/** Baux « vitrines » : tous leurs reçus sont générés. */
const VITRINES = ['001', '010', '021'];

interface Bail {
  ref: string;
  id: string;
  numero: string;
  statut: string;
  typeBien: string;
  locataire: string;
}

const baux = new Map<string, Bail>();
let brouillons: Bail[] = [];

async function chargerBaux(): Promise<void> {
  const biens = await prisma.property.findMany({
    where: { tenantId: TENANT_ID, internalReference: { startsWith: 'PRES-' } },
    select: {
      internalReference: true,
      propertyType: true,
      rentalLeases: {
        where: { tenant_id: TENANT_ID },
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          lease_number: true,
          status: true,
          primaryRenter: { select: { user: { select: { fullName: true, email: true } } } }
        }
      }
    }
  });
  baux.clear();
  brouillons = [];
  for (const b of biens) {
    const ref = b.internalReference.replace('PRES-', '');
    for (const l of b.rentalLeases) {
      const bail: Bail = {
        ref,
        id: l.id,
        numero: l.lease_number,
        statut: l.status,
        typeBien: String(b.propertyType),
        locataire: l.primaryRenter?.user?.fullName || l.primaryRenter?.user?.email || 'Locataire'
      };
      if (l.status === 'DRAFT') brouillons.push(bail);
      // Le bail « vivant » du bien : le premier qui n'est ni brouillon ni annulé.
      else if (l.status !== 'CANCELED' && !baux.has(ref)) baux.set(ref, bail);
    }
  }
}

function bail(ref: string): Bail | undefined {
  return baux.get(ref);
}

// ───────────────────────────────────────────────── modèles de documents (fichiers)

async function existe(chemin: string): Promise<boolean> {
  try {
    await fs.access(chemin);
    return true;
  } catch {
    return false;
  }
}

/**
 * Les modèles globaux (`tenant_id` nul) pointent parfois un fichier au nom horodaté qui
 * n'existe pas sur ce poste (autre installation) : toute génération échoue alors avec
 * « Modèle de document introuvable ». Le fichier livré de même empreinte existe sous un
 * autre nom : on le recopie sous le nom attendu (dossier livré, hors Git). Base intacte.
 */
async function reparerModeles(): Promise<number> {
  const modeles = await prisma.documentTemplate.findMany({
    where: { tenant_id: null, status: 'ACTIVE' },
    select: { doc_type: true, stored_filename: true, storage_path: true, file_hash_sha256: true }
  });
  const dossier = path.join(getShippedTemplatesDir(), 'default');
  let repares = 0;
  for (const m of modeles) {
    const attendus = [
      m.storage_path,
      path.join(getTemplatesWriteDir(), 'default', m.stored_filename),
      path.join(dossier, m.stored_filename)
    ].filter((p): p is string => Boolean(p));
    let sain = false;
    for (const p of attendus) if (await existe(p)) sain = true;
    if (sain) continue;

    let source: string | null = null;
    const fichiers = (await existe(dossier)) ? await fs.readdir(dossier) : [];
    for (const f of fichiers.filter(x => x.startsWith(`${m.doc_type}_`) && x.endsWith('.docx'))) {
      const contenu = await fs.readFile(path.join(dossier, f));
      if (createHash('sha256').update(contenu).digest('hex') === m.file_hash_sha256) {
        source = path.join(dossier, f);
        break;
      }
    }
    if (!source) {
      say(`  ⨯ modèle ${m.doc_type} : fichier introuvable et aucun fichier livré de même empreinte`);
      echecsEtape.push(`modèle ${m.doc_type} introuvable`);
      continue;
    }
    await fs.copyFile(source, path.join(dossier, m.stored_filename));
    repares++;
    say(`  + modèle ${m.doc_type} : fichier recopié sous le nom attendu (${m.stored_filename})`);
  }
  if (repares === 0) say('  modèles de documents : fichiers présents.');
  return repares;
}

// ───────────────────────────────────────────── documents locatifs : génération

async function generer(
  docType: DocumentType,
  sourceKey: string,
  params?: { installmentId?: string; startDate?: Date; endDate?: Date }
) {
  const debut = Date.now();
  const document = await avecRetry(() => generateDocument(TENANT_ID, docType, sourceKey, undefined, params, acteur));
  dureesMs.push(Date.now() - debut);
  return document;
}

async function aUneDemande(leaseId: string): Promise<boolean> {
  return (
    (await prisma.signatureRequest.count({
      where: { tenantId: TENANT_ID, targetType: 'RentalLease', targetId: leaseId }
    })) > 0
  );
}

async function seedContrats(): Promise<number> {
  let n = 0;
  for (const ref of ORDRE) {
    const b = bail(ref);
    if (!b) continue;
    const deja = await prisma.rentalDocument.findFirst({
      where: { tenant_id: TENANT_ID, lease_id: b.id, type: RentalDocumentType.LEASE_CONTRACT },
      select: { id: true }
    });
    if (deja) continue;
    const ok = await essaie(`contrat ${b.numero} (PRES-${ref})`, async () => {
      const choisi = await resolveLeaseDocumentType(TENANT_ID, b.id);
      // PRES-021 est un immeuble loué en bail commercial : le service ne range que bureau,
      // boutique et entrepôt parmi les baux commerciaux, on impose donc le modèle commercial.
      const docType = ref === '021' ? DocumentType.LEASE_COMMERCIAL : choisi;
      const d = await generer(docType, b.id);
      return `${d.document_number} (${docType === DocumentType.LEASE_COMMERCIAL ? 'modèle commercial' : 'modèle habitation'}${
        ref === '021' && choisi !== docType ? ', le service aurait pris le modèle habitation' : ''
      })`;
    });
    if (ok) {
      n++;
      compte('LEASE_CONTRACT/FINAL');
    }
  }

  // Bail BROUILLON (créé par le script de vie du bail, s'il existe) : contrat en brouillon.
  for (const b of brouillons) {
    const deja = await prisma.rentalDocument.findFirst({
      where: { tenant_id: TENANT_ID, lease_id: b.id, type: RentalDocumentType.LEASE_CONTRACT },
      select: { id: true }
    });
    if (deja) continue;
    const ok = await essaie(`contrat en brouillon ${b.numero} (PRES-${b.ref}, bail brouillon)`, async () => {
      const docType = await resolveLeaseDocumentType(TENANT_ID, b.id);
      const d = await generer(docType, b.id);
      await updateDocumentStatus(TENANT_ID, d.id, RentalDocumentStatus.DRAFT, acteur);
      return d.document_number ?? '';
    });
    if (ok) {
      n++;
      compte('LEASE_CONTRACT/DRAFT');
    }
  }
  if (brouillons.length === 0) say('  (aucun bail BROUILLON à ce jour : pas de contrat en brouillon)');
  return n;
}

// ───────────────────────────────────────── documents écrits à la main (types sans service)

interface DocManuel {
  type: RentalDocumentType;
  statut: RentalDocumentStatus;
  numero: string;
  emisLe: Date;
  titre: string;
  description?: string;
  lignes: string[];
  leaseId: string;
  installmentId?: string | null;
  paymentId?: string | null;
  metadata?: Record<string, unknown>;
}

const DOSSIER_TYPE: Record<string, string> = {
  LEASE_ADDENDUM: 'LEASE_ADDENDUM',
  RENT_QUITTANCE: 'RENT_QUITTANCE',
  DEPOSIT_RECEIPT: 'DEPOSIT_RECEIPT'
};

/** Écrit un vrai fichier Word minimal au chemin attendu par le téléchargement, puis la ligne. */
async function ecrireDocument(d: DocManuel): Promise<string> {
  const fichier = await saveRentalDocx({
    tenantId: TENANT_ID,
    typeDir: DOSSIER_TYPE[d.type] ?? d.type,
    issuedAt: d.emisLe,
    number: d.numero,
    keyPart: d.leaseId,
    title: d.titre,
    lines: d.lignes
  });
  const ligne = await prisma.rentalDocument.create({
    data: {
      tenant_id: TENANT_ID,
      type: d.type,
      status: d.statut,
      lease_id: d.leaseId,
      installment_id: d.installmentId ?? null,
      payment_id: d.paymentId ?? null,
      document_number: d.numero,
      file_path: fichier.filePath,
      file_hash: fichier.fileHash,
      content_hash: fichier.fileHash,
      mime_type: DOCX_MIME,
      issued_at: d.emisLe,
      title: d.titre,
      description: d.description ?? null,
      metadata: (d.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      revision: 1,
      created_by_user_id: acteur
    },
    select: { id: true }
  });
  return ligne.id;
}

/** Numéro séquentiel du mois (`QUI-202610-0003`) : le premier libre. */
async function prochainNumero(prefixe: string, date: Date): Promise<string> {
  const base = `${prefixe}-${aaaamm(date)}-`;
  let n = await prisma.rentalDocument.count({
    where: { tenant_id: TENANT_ID, document_number: { startsWith: base } }
  });
  for (;;) {
    n++;
    const numero = `${base}${String(n).padStart(4, '0')}`;
    const pris = await prisma.rentalDocument.findFirst({
      where: { tenant_id: TENANT_ID, document_number: numero },
      select: { id: true }
    });
    if (!pris) return numero;
  }
}

// ───────────────────────────────────────────────────────────────── avenants

async function seedAvenants(): Promise<number> {
  const PLAN: {
    ref: string;
    rang: number;
    statut: RentalDocumentStatus;
    titre: string;
    objet: string[];
    ilYaJours: number;
  }[] = [
    {
      ref: '013',
      rang: 1,
      statut: RentalDocumentStatus.FINAL,
      titre: 'Avenant n°1 — complément d’inventaire du mobilier',
      objet: [
        'Les parties conviennent d’ajouter à l’inventaire du studio meublé un réfrigérateur table-top, un ventilateur sur pied et une bouilloire.',
        'Le dépôt de garantie et le loyer restent inchangés.'
      ],
      ilYaJours: 75
    },
    {
      ref: '021',
      rang: 1,
      statut: RentalDocumentStatus.FINAL,
      titre: 'Avenant n°1 — renouvellement du bail commercial',
      objet: [
        'Les parties conviennent de renouveler le bail commercial pour une nouvelle période, aux conditions du bail initial sous réserve de la révision du loyer prévue au contrat.',
        'Les dates et montants applicables figurent à la chronologie du bail.'
      ],
      ilYaJours: 30
    },
    {
      ref: '021',
      rang: 2,
      statut: RentalDocumentStatus.DRAFT,
      titre: 'Avenant n°2 — mise à disposition d’un local de stockage (en préparation)',
      objet: [
        'Projet d’avenant : mise à disposition du preneur d’un local de stockage au sous-sol, moyennant un loyer complémentaire à fixer.',
        'Document en préparation, non communiqué au preneur.'
      ],
      ilYaJours: 3
    }
  ];
  let n = 0;
  for (const p of PLAN) {
    const b = bail(p.ref);
    if (!b) continue;
    const numero = `${b.numero}-AV${p.rang}`;
    const deja = await prisma.rentalDocument.findFirst({
      where: { tenant_id: TENANT_ID, document_number: numero },
      select: { id: true }
    });
    if (deja) continue;
    const evenement = await prisma.leaseEvent.findFirst({
      where: { tenantId: TENANT_ID, leaseId: b.id, type: { in: ['RENEWAL', 'AMENDMENT'] } },
      orderBy: { effectiveDate: 'asc' },
      select: { effectiveDate: true, newEndDate: true, newRent: true, summary: true }
    });
    const objet = [...p.objet];
    if (evenement && p.rang === 1 && p.ref === '021') {
      objet.push(
        `Prise d’effet : ${dateFr(evenement.effectiveDate)}.`,
        evenement.newEndDate ? `Nouvelle date de fin de bail : ${dateFr(evenement.newEndDate)}.` : '',
        evenement.newRent ? `Loyer applicable : ${fcfa(Number(evenement.newRent))}.` : '',
        evenement.summary ?? ''
      );
    }
    const emisLe = ilYA(p.ilYaJours);
    const ok = await essaie(`avenant ${numero} (${p.statut === 'DRAFT' ? 'brouillon' : 'final'})`, async () => {
      await ecrireDocument({
        type: RentalDocumentType.LEASE_ADDENDUM,
        statut: p.statut,
        numero,
        emisLe,
        titre: `${p.titre} — ${b.numero}`,
        description: `Avenant au bail ${b.numero}.`,
        lignes: [
          `Avenant au bail ${b.numero}`,
          `Établi à Abidjan, le ${dateFr(emisLe)}.`,
          '',
          '# Parties',
          `Le preneur : ${b.locataire}.`,
          'Le bailleur, représenté par l’agence gestionnaire.',
          '',
          '# Objet',
          ...objet.filter(Boolean),
          '',
          'Les autres clauses du bail initial demeurent inchangées.'
        ],
        leaseId: b.id,
        metadata: { leaseNumber: b.numero, rang: p.rang }
      });
    });
    if (ok) {
      n++;
      compte(`LEASE_ADDENDUM/${p.statut}`);
    }
  }
  return n;
}

// ─────────────────────────────────────────── échéances payées, reçus et quittances

interface Reglement {
  installmentId: string;
  annee: number;
  mois: number;
  paymentId: string;
  montant: number;
  methode: string;
  paye: Date;
}

const METHODES: Record<string, string> = {
  CASH: 'espèces',
  BANK_TRANSFER: 'virement bancaire',
  CHECK: 'chèque',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'carte bancaire',
  OTHER: 'autre moyen'
};

/** Échéances PAYÉES du bail avec leur dernier paiement, de la plus ancienne à la plus récente. */
async function reglements(leaseId: string): Promise<Reglement[]> {
  const lignes = await prisma.rentalPaymentAllocation.findMany({
    where: {
      tenant_id: TENANT_ID,
      installment: { lease_id: leaseId, tenant_id: TENANT_ID, status: 'PAID' },
      payment: { tenant_id: TENANT_ID, status: 'SUCCESS' }
    },
    select: {
      installment_id: true,
      installment: { select: { period_year: true, period_month: true } },
      payment: { select: { id: true, amount: true, method: true, succeeded_at: true, initiated_at: true } }
    }
  });
  const parEcheance = new Map<string, Reglement>();
  for (const l of lignes) {
    const paye = l.payment.succeeded_at ?? l.payment.initiated_at;
    const actuel = parEcheance.get(l.installment_id);
    if (actuel && actuel.paye >= paye) continue;
    parEcheance.set(l.installment_id, {
      installmentId: l.installment_id,
      annee: l.installment.period_year,
      mois: l.installment.period_month,
      paymentId: l.payment.id,
      montant: Number(l.payment.amount),
      methode: String(l.payment.method),
      paye
    });
  }
  return [...parEcheance.values()].sort((a, b) => a.annee * 100 + a.mois - (b.annee * 100 + b.mois));
}

async function seedRecus(): Promise<number> {
  let n = 0;
  for (const ref of ORDRE) {
    const b = bail(ref);
    if (!b) continue;
    const tous = await reglements(b.id);
    const retenus = VITRINES.includes(ref) ? tous : tous.slice(-3);
    for (const r of retenus) {
      const deja = await prisma.rentalDocument.findFirst({
        where: { tenant_id: TENANT_ID, type: RentalDocumentType.RENT_RECEIPT, payment_id: r.paymentId },
        select: { id: true }
      });
      if (deja) continue;
      const ok = await essaie(`reçu de loyer ${b.numero} — ${periodeFr(r.annee, r.mois)}`, async () => {
        const d = await generer(DocumentType.RENT_RECEIPT, r.paymentId, { installmentId: r.installmentId });
        return d.document_number ?? '';
      });
      if (ok) {
        n++;
        compte('RENT_RECEIPT/FINAL');
      }
    }
  }
  return n;
}

async function seedQuittances(): Promise<number> {
  let n = 0;
  for (const ref of ORDRE) {
    const b = bail(ref);
    if (!b) continue;
    const tous = await reglements(b.id);
    // Quittance de la dernière échéance soldée ; les baux vitrines gardent les quatre dernières.
    const retenus = VITRINES.includes(ref) ? tous.slice(-4) : tous.slice(-1);
    for (const r of retenus) {
      const deja = await prisma.rentalDocument.findFirst({
        where: { tenant_id: TENANT_ID, type: RentalDocumentType.RENT_QUITTANCE, installment_id: r.installmentId },
        select: { id: true }
      });
      if (deja) continue;
      const periode = periodeFr(r.annee, r.mois);
      const ok = await essaie(`quittance ${b.numero} — ${periode}`, async () => {
        const numero = await prochainNumero('QUI', r.paye);
        await ecrireDocument({
          type: RentalDocumentType.RENT_QUITTANCE,
          statut: RentalDocumentStatus.FINAL,
          numero,
          emisLe: r.paye,
          titre: `Quittance de loyer — ${periode}`,
          lignes: [
            `Quittance n° ${numero}`,
            '',
            `Je soussigné, gestionnaire du bien loué, reconnais avoir reçu de ${b.locataire} la somme de ${fcfa(r.montant)} au titre du loyer et des charges de ${periode}, et lui en donne quittance, sous réserve de tous mes droits.`,
            `Bail ${b.numero}. Règlement par ${METHODES[r.methode] ?? 'autre moyen'} le ${dateFr(r.paye)}.`,
            `Fait à Abidjan, le ${dateFr(r.paye)}.`
          ],
          leaseId: b.id,
          installmentId: r.installmentId,
          paymentId: r.paymentId,
          metadata: { period: periode, amount: r.montant }
        });
        return numero;
      });
      if (ok) {
        n++;
        compte('RENT_QUITTANCE/FINAL');
      }
    }
  }
  return n;
}

async function seedRecusDepot(): Promise<number> {
  let n = 0;
  const mouvements = await prisma.rentalDepositMovement.findMany({
    where: { tenant_id: TENANT_ID, type: 'COLLECT', payment_id: { not: null } },
    select: {
      amount: true,
      payment_id: true,
      payment: { select: { succeeded_at: true, initiated_at: true, method: true } },
      deposit: { select: { lease_id: true } }
    },
    orderBy: { created_at: 'asc' }
  });
  const parBail = new Map<string, Bail>();
  for (const b of baux.values()) parBail.set(b.id, b);
  const ordre = new Map(ORDRE.map((r, i) => [r, i]));
  mouvements.sort(
    (a, b) =>
      (ordre.get(parBail.get(a.deposit.lease_id)?.ref ?? '') ?? 99) -
      (ordre.get(parBail.get(b.deposit.lease_id)?.ref ?? '') ?? 99)
  );
  for (const m of mouvements) {
    const b = parBail.get(m.deposit.lease_id);
    if (!b || !m.payment_id || !m.payment) continue;
    const deja = await prisma.rentalDocument.findFirst({
      where: { tenant_id: TENANT_ID, type: RentalDocumentType.DEPOSIT_RECEIPT, payment_id: m.payment_id },
      select: { id: true }
    });
    if (deja) continue;
    const paye = m.payment.succeeded_at ?? m.payment.initiated_at;
    const methodeDepot = String(m.payment.method);
    const ok = await essaie(`reçu de dépôt de garantie ${b.numero}`, async () => {
      const numero = await prochainNumero('DEP', paye);
      await ecrireDocument({
        type: RentalDocumentType.DEPOSIT_RECEIPT,
        statut: RentalDocumentStatus.FINAL,
        numero,
        emisLe: paye,
        titre: `Reçu de dépôt de garantie — ${b.numero}`,
        lignes: [
          `Reçu n° ${numero}`,
          '',
          `Reçu de ${b.locataire} la somme de ${fcfa(Number(m.amount))} à titre de dépôt de garantie, réglée par ${METHODES[methodeDepot] ?? 'autre moyen'} le ${dateFr(paye)}.`,
          `Bail ${b.numero}.`,
          'Cette somme sera restituée à la sortie des lieux, déduction faite des éventuelles dégradations constatées.'
        ],
        leaseId: b.id,
        paymentId: m.payment_id,
        metadata: { amount: Number(m.amount) }
      });
      return numero;
    });
    if (ok) {
      n++;
      compte('DEPOSIT_RECEIPT/FINAL');
    }
  }
  return n;
}

async function seedReleves(): Promise<number> {
  // Relevés de l'année en cours : baux à jour, impayés et trimestriels.
  const REFS = ['001', '003', '005', '008', '010', '016', '019', '021'];
  const debut = new Date(Date.UTC(MAINTENANT.getUTCFullYear(), 0, 1));
  let n = 0;
  for (const ref of REFS) {
    const b = bail(ref);
    if (!b) continue;
    const deja = await prisma.rentalDocument.findFirst({
      where: { tenant_id: TENANT_ID, lease_id: b.id, type: RentalDocumentType.STATEMENT },
      select: { id: true }
    });
    if (deja) continue;
    const ok = await essaie(`relevé de compte ${b.numero}`, async () => {
      const d = await generer(DocumentType.RENT_STATEMENT, b.id, { startDate: debut, endDate: MAINTENANT });
      return d.document_number ?? '';
    });
    if (ok) {
      n++;
      compte('STATEMENT/FINAL');
    }
  }
  return n;
}

/** Statuts variés : brouillon, annulé, révision — par les services, sans toucher aux contrats signés. */
async function seedStatuts(): Promise<number> {
  let n = 0;

  // Quittance émise par erreur (doublon) puis annulée.
  for (const ref of ['006', '011']) {
    const b = bail(ref);
    if (!b) continue;
    const deja = await prisma.rentalDocument.findFirst({
      where: {
        tenant_id: TENANT_ID,
        lease_id: b.id,
        type: RentalDocumentType.RENT_RECEIPT,
        status: RentalDocumentStatus.VOID
      },
      select: { id: true }
    });
    if (deja) continue;
    const dernier = (await reglements(b.id)).at(-1);
    if (!dernier) continue;
    const ok = await essaie(
      `reçu en double puis annulé ${b.numero} — ${periodeFr(dernier.annee, dernier.mois)}`,
      async () => {
        const d = await generer(DocumentType.RENT_RECEIPT, dernier.paymentId, { installmentId: dernier.installmentId });
        await updateDocumentStatus(TENANT_ID, d.id, RentalDocumentStatus.VOID, acteur);
        return `${d.document_number} → VOID`;
      }
    );
    if (ok) {
      n++;
      compte('RENT_RECEIPT/VOID');
    }
  }

  // Reçu laissé en brouillon : une échéance plus ancienne que les trois dernières.
  {
    const b = bail('007');
    if (b) {
      const deja = await prisma.rentalDocument.findFirst({
        where: {
          tenant_id: TENANT_ID,
          lease_id: b.id,
          type: RentalDocumentType.RENT_RECEIPT,
          status: RentalDocumentStatus.DRAFT
        },
        select: { id: true }
      });
      const tous = await reglements(b.id);
      const ancienne = tous.length > 3 ? tous[0] : undefined;
      if (!deja && ancienne) {
        const ok = await essaie(
          `reçu en brouillon ${b.numero} — ${periodeFr(ancienne.annee, ancienne.mois)}`,
          async () => {
            const d = await generer(DocumentType.RENT_RECEIPT, ancienne.paymentId, {
              installmentId: ancienne.installmentId
            });
            await updateDocumentStatus(TENANT_ID, d.id, RentalDocumentStatus.DRAFT, acteur);
            return `${d.document_number} → DRAFT`;
          }
        );
        if (ok) {
          n++;
          compte('RENT_RECEIPT/DRAFT');
        }
      }
    }
  }

  // Révision : un contrat régénéré (révision 2), tant qu'aucune demande de signature ne l'utilise
  // (régénérer un contrat annule les demandes en cours du bail).
  {
    const b = bail('008');
    if (b && !(await aUneDemande(b.id))) {
      const contrat = await prisma.rentalDocument.findFirst({
        where: {
          tenant_id: TENANT_ID,
          lease_id: b.id,
          type: RentalDocumentType.LEASE_CONTRACT,
          status: RentalDocumentStatus.FINAL
        },
        orderBy: { created_at: 'desc' },
        select: { id: true, revision: true, document_number: true }
      });
      if (contrat && contrat.revision === 1) {
        const ok = await essaie(`contrat régénéré ${b.numero}`, async () => {
          const d = await avecRetry(() => regenerateDocument(TENANT_ID, contrat.id, undefined, acteur));
          return `${d.document_number} → révision ${d.revision}`;
        });
        if (ok) {
          n++;
          compte('LEASE_CONTRACT/révision 2');
        }
      }
    }
  }

  return n;
}

// ───────────────────────────────────────────────────────────── signatures

/** Les signatures « DRAWN » exigent un PNG : tracé fictif, déterministe (pas de dépendance). */
function crc32(buf: Buffer): number {
  let c: number;
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunkPng(type: string, data: Buffer): Buffer {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(data.length);
  const corps = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const somme = Buffer.alloc(4);
  somme.writeUInt32BE(crc32(corps));
  return Buffer.concat([longueur, corps, somme]);
}

function signatureDessinee(nom: string): string {
  const L = 320;
  const H = 110;
  const px = Buffer.alloc(L * H * 4);
  const graine = [...nom].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 997, 7);
  const point = (cx: number, cy: number, r: number): void => {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(L - 1, Math.ceil(cx + r)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
          const i = (y * L + x) * 4;
          px[i] = 20;
          px[i + 1] = 45;
          px[i + 2] = 120;
          px[i + 3] = 255;
        }
      }
    }
  };
  for (let s = 0; s <= 1; s += 0.0015) {
    const x = 14 + s * 290;
    const y = 52 + Math.sin(s * (7 + (graine % 5))) * 26 * (1 - s * 0.35) + Math.sin(s * 23 + graine) * 6;
    point(x, y, 1.9);
  }
  for (let s = 0; s <= 1; s += 0.004) point(30 + s * 250, 92 - s * 8 + Math.sin(s * 9) * 2, 1.3);
  const brut = Buffer.alloc((L * 4 + 1) * H);
  for (let y = 0; y < H; y++) px.copy(brut, y * (L * 4 + 1) + 1, y * L * 4, (y + 1) * L * 4);
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(L, 0);
  entete.writeUInt32BE(H, 4);
  entete[8] = 8; // profondeur
  entete[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunkPng('IHDR', entete),
    chunkPng('IDAT', deflateSync(brut)),
    chunkPng('IEND', Buffer.alloc(0))
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

type Canal = 'EMAIL' | 'IN_PERSON';
type Stade =
  'ENVOYEE' | 'ENVOYEE_PLACE' | 'PARTIELLE' | 'SCELLEE_CODE' | 'SCELLEE_PLACE' | 'REFUSEE' | 'ANNULEE' | 'EXPIREE';
type Genre = 'LEASE_CONTRACT' | 'LEASE_INSPECTION' | 'MANAGEMENT_MANDATE';

const STATUT_ATTENDU: Record<Stade, string> = {
  ENVOYEE: 'SENT',
  ENVOYEE_PLACE: 'SENT',
  PARTIELLE: 'PARTIALLY_SIGNED',
  SCELLEE_CODE: 'COMPLETED',
  SCELLEE_PLACE: 'COMPLETED',
  REFUSEE: 'DECLINED',
  ANNULEE: 'CANCELED',
  EXPIREE: 'EXPIRED'
};

/** Marge laissée dans le quota mensuel pour envoyer une demande en direct pendant la démo. */
const MARGE_QUOTA = 2;

interface Partie {
  role: string;
  nom: string;
  email: string | null;
}

interface Demande {
  id: string;
  tokens: string[];
  parties: Partie[];
  canaux: Canal[];
}

async function quotaRestant(): Promise<{ limite: number; utilise: number }> {
  const politique = await resolveSignatureQuotaPolicy(TENANT_ID);
  if (!politique.ok) return { limite: 0, utilise: 0 };
  return { limite: politique.limit, utilise: await countSignaturesThisMonth(appPrisma, TENANT_ID) };
}

/** Signataires proposés par la source (l'écran « Envoyer pour signature » s'en sert), restreints aux rôles voulus. */
async function parties(genre: Genre, cibleId: string, roles: string[]): Promise<Partie[]> {
  const contexte = await getSignatureTargetContext(CTX, genre, cibleId);
  const trouvees: Partie[] = [];
  for (const role of roles) {
    const s = contexte.signers.find(x => x.role === role && x.email);
    if (s) trouvees.push({ role, nom: s.fullName, email: s.email ?? null });
  }
  return trouvees;
}

async function envoyer(genre: Genre, cibleId: string, p: Partie[], canaux: Canal[], jours?: number): Promise<Demande> {
  const { limite, utilise } = await quotaRestant();
  if (limite - utilise < 1 + MARGE_QUOTA) {
    throw new Error(
      `quota mensuel de signatures presque atteint (${utilise}/${limite}) : marge de ${MARGE_QUOTA} conservée`
    );
  }
  takeLoggedSignatureMessages();
  const dto = await createSignatureRequest(CTX, {
    kind: genre,
    targetId: cibleId,
    signers: p.map((x, i) => ({
      role: x.role,
      fullName: x.nom,
      channel: canaux[i],
      contact: canaux[i] === 'EMAIL' ? (x.email as string) : ''
    })),
    ...(jours ? { expiresInDays: jours } : {})
  });
  const messages = takeLoggedSignatureMessages();
  const tokens = [...dto.signers]
    .sort((a, b) => a.position - b.position)
    .map((s, i) => {
      if (canaux[i] === 'IN_PERSON') return s.inPersonUrlToken ?? '';
      const message = messages.find(
        m => m.to.toLowerCase() === (p[i].email as string).toLowerCase() && m.text.includes('/signer/')
      );
      const trouve = message ? /\/signer\/([A-Za-z0-9_-]{20,})/.exec(message.text) : null;
      return trouve ? trouve[1] : '';
    });
  if (tokens.some(t => !t)) throw new Error('lien de signature introuvable dans les messages du fournisseur « log »');
  return { id: dto.id, tokens, parties: p, canaux };
}

const META = (i: number) => ({
  ip: `203.0.113.${20 + i}`,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36'
});

/** Parcours « par code » : le code part par le fournisseur `log`, on le lit dans son tampon. */
async function signerParCode(d: Demande, i: number): Promise<string> {
  takeLoggedSignatureMessages();
  await sendPublicOtp(d.tokens[i]);
  const message = takeLoggedSignatureMessages().find(
    m => m.to.toLowerCase() === (d.parties[i].email as string).toLowerCase()
  );
  const code = message ? /\b(\d{6})\b/.exec(message.text)?.[1] : undefined;
  if (!code) throw new Error('code de confirmation introuvable dans les messages du fournisseur « log »');
  const issue = await signPublic(
    d.tokens[i],
    { code, consent: true, signature: { mode: 'TYPED', value: d.parties[i].nom } },
    META(i)
  );
  return issue.requestStatus;
}

/** Parcours « signer sur place » : jeton remis à l'agent, signature dessinée, aucun code. */
async function signerSurPlace(d: Demande, i: number): Promise<string> {
  const issue = await signPublic(
    d.tokens[i],
    { consent: true, signature: { mode: 'DRAWN', value: signatureDessinee(d.parties[i].nom) } },
    META(i)
  );
  return issue.requestStatus;
}

async function statutDemande(id: string): Promise<string> {
  const r = await prisma.signatureRequest.findFirst({ where: { id, tenantId: TENANT_ID }, select: { status: true } });
  return r?.status ?? 'INTROUVABLE';
}

/**
 * EXPIRED par la routine de l'application : l'échéance est reculée en base, puis
 * `expireDueSignatureRequests` (routine planifiée, toutes agences) passe la demande à
 * EXPIRED. Elle n'est lancée que si aucune AUTRE demande n'est échue (elle ne toucherait
 * alors pas à une autre agence).
 */
async function faireExpirer(id: string): Promise<void> {
  const passe = new Date(Date.now() - 2 * 3600 * 1000);
  await prisma.signatureRequest.update({ where: { id }, data: { expiresAt: passe } });
  await prisma.signatureSigner.updateMany({
    where: { requestId: id, tenantId: TENANT_ID },
    data: { tokenExpiresAt: passe }
  });
  const echues = await prisma.signatureRequest.findMany({
    where: { status: { in: ['SENT', 'PARTIALLY_SIGNED'] }, expiresAt: { lt: new Date() } },
    select: { id: true }
  });
  if (echues.some(e => e.id !== id)) {
    throw new Error('des demandes d’une autre agence sont aussi échues : la routine d’expiration n’est pas lancée');
  }
  await expireDueSignatureRequests();
}

/** Joue un stade de signature sur une cible ; ne rejoue rien si une demande existe déjà pour cette cible. */
async function jouer(genre: Genre, cibleId: string, stade: Stade, roles: string[], libelle: string): Promise<boolean> {
  const existante = await prisma.signatureRequest.findFirst({
    where: { tenantId: TENANT_ID, kind: genre, targetId: cibleId },
    select: { id: true, status: true }
  });
  if (existante) return false;
  // Les signataires proposés se lisent APRÈS le contrôle d'existence : la source refuse une cible déjà signée.
  let p: Partie[];
  try {
    p = await parties(genre, cibleId, roles);
  } catch (e) {
    say(`  ⨯ ${libelle} — ${dernierMessage(e)}`);
    echecsEtape.push(`${libelle} : ${dernierMessage(e)}`);
    return false;
  }
  if (p.length === 0) {
    say(`  ⨯ ${libelle} — aucun signataire proposé par la source`);
    echecsEtape.push(`${libelle} : aucun signataire`);
    return false;
  }
  return essaie(`${libelle} → ${STATUT_ATTENDU[stade]}`, async () => {
    const tous = (c: Canal): Canal[] => p.map(() => c);
    let d: Demande;
    switch (stade) {
      case 'ENVOYEE':
        d = await envoyer(genre, cibleId, p, tous('EMAIL'));
        break;
      case 'ENVOYEE_PLACE':
        // Pour la démonstration en direct : « Signer sur place » depuis l'écran, sans code.
        d = await envoyer(genre, cibleId, p, tous('IN_PERSON'));
        break;
      case 'PARTIELLE':
        d = await envoyer(genre, cibleId, p, tous('EMAIL'));
        await signerParCode(d, 0);
        break;
      case 'SCELLEE_CODE':
        d = await envoyer(genre, cibleId, p, tous('EMAIL'));
        for (let i = 0; i < p.length; i++) await signerParCode(d, i);
        break;
      case 'SCELLEE_PLACE':
        d = await envoyer(genre, cibleId, p, tous('IN_PERSON'));
        for (let i = 0; i < p.length; i++) await signerSurPlace(d, i);
        break;
      case 'REFUSEE':
        d = await envoyer(genre, cibleId, p, tous('EMAIL'));
        await declinePublic(d.tokens[0], 'Je souhaite revoir certaines clauses avant de signer.');
        break;
      case 'ANNULEE':
        d = await envoyer(genre, cibleId, p, tous('EMAIL'));
        await cancelSignatureRequest(CTX, d.id);
        break;
      case 'EXPIREE':
        d = await envoyer(genre, cibleId, p, tous('EMAIL'), 1);
        await signerParCode(d, 0);
        await faireExpirer(d.id);
        break;
    }
    const statut = await statutDemande(d.id);
    compte(`${genre}/${statut}`);
    if (statut !== STATUT_ATTENDU[stade]) throw new Error(`statut obtenu ${statut}, attendu ${STATUT_ATTENDU[stade]}`);
    return p.map(x => `${x.nom} (${x.role})`).join(', ');
  });
}

// ───────────────────────────────── signatures : états des lieux

async function seedSignaturesEdl(avecContrats: boolean): Promise<number> {
  const PLAN: { ref: string; type: 'ENTRY' | 'EXIT'; stade: Stade }[] = [
    { ref: '001', type: 'ENTRY', stade: 'SCELLEE_PLACE' }, // bail 0009 : signé sur place, scellé
    { ref: '005', type: 'EXIT', stade: 'SCELLEE_CODE' }, // bail 0013 : sortie avec retenues, signée par code, scellée
    { ref: '014', type: 'EXIT', stade: 'ENVOYEE' }, // bail 0020 : envoyé, en attente
    { ref: '006', type: 'ENTRY', stade: 'PARTIELLE' }, // bail 0014 : le locataire a signé, l'agent pas encore
    { ref: '003', type: 'ENTRY', stade: 'ENVOYEE_PLACE' }, // bail 0011 : à signer sur place (démonstration en direct)
    // Sans conversion PDF, les contrats ne peuvent pas porter ces stades : les états des lieux les montrent.
    ...(avecContrats
      ? []
      : ([
          { ref: '011', type: 'ENTRY', stade: 'REFUSEE' }, // bail 0018
          { ref: '008', type: 'ENTRY', stade: 'ANNULEE' }, // bail 0016
          { ref: '016', type: 'ENTRY', stade: 'EXPIREE' } // bail 0021
        ] as { ref: string; type: 'ENTRY' | 'EXIT'; stade: Stade }[]))
  ];
  let n = 0;
  for (const p of PLAN) {
    const b = bail(p.ref);
    const inspection = b
      ? await prisma.leaseInspection.findFirst({
          where: { tenantId: TENANT_ID, leaseId: b.id, type: p.type, status: 'FINALIZED' },
          select: { id: true }
        })
      : null;
    if (!b || !inspection) {
      say(`  ⨯ PRES-${p.ref} : pas d'état des lieux ${p.type === 'ENTRY' ? 'd’entrée' : 'de sortie'} finalisé`);
      continue;
    }
    const libelle = `état des lieux ${p.type === 'ENTRY' ? 'd’entrée' : 'de sortie'} ${b.numero}`;
    if (await jouer('LEASE_INSPECTION', inspection.id, p.stade, ['LOCATAIRE', 'AGENT'], libelle)) n++;
  }
  return n;
}

// ───────────────────────────────── signatures : mandats de gestion

async function seedSignaturesMandats(): Promise<number> {
  const PLAN: { ref: string; stade: Stade }[] = [
    { ref: '010', stade: 'SCELLEE_CODE' },
    { ref: '002', stade: 'SCELLEE_CODE' },
    { ref: '011', stade: 'SCELLEE_PLACE' },
    { ref: '004', stade: 'SCELLEE_CODE' },
    { ref: '007', stade: 'SCELLEE_CODE' },
    { ref: '017', stade: 'ENVOYEE' } // mandat non signé : demande en attente
  ];
  let n = 0;
  for (const p of PLAN) {
    const mandat = await prisma.propertyMandate.findFirst({
      where: { tenantId: TENANT_ID, isActive: true, revokedAt: null, property: { internalReference: `PRES-${p.ref}` } },
      select: { id: true, signedAt: true, signatureRequestId: true }
    });
    if (!mandat) {
      say(`  ⨯ PRES-${p.ref} : aucun mandat actif`);
      continue;
    }
    const deja = await prisma.signatureRequest.findFirst({
      where: { tenantId: TENANT_ID, kind: 'MANAGEMENT_MANDATE', targetId: mandat.id },
      select: { id: true }
    });
    if (deja) continue;

    // La source refuse un mandat déjà signé : on retire d'abord la signature POSÉE À LA MAIN
    // (sans demande), que la vraie signature remplace ; restituée si le parcours échoue.
    const ancienne = mandat.signedAt && !mandat.signatureRequestId ? mandat.signedAt : null;
    if (ancienne) await prisma.propertyMandate.update({ where: { id: mandat.id }, data: { signedAt: null } });

    let ok = false;
    try {
      ok = await jouer(
        'MANAGEMENT_MANDATE',
        mandat.id,
        p.stade,
        ['MANDANT', 'AGENT'],
        `mandat de gestion PRES-${p.ref}`
      );
    } finally {
      if (ancienne) {
        const apres = await prisma.propertyMandate.findFirst({ where: { id: mandat.id }, select: { signedAt: true } });
        if (!apres?.signedAt) {
          await prisma.propertyMandate.update({ where: { id: mandat.id }, data: { signedAt: ancienne } });
          say(`    (signature manuelle de PRES-${p.ref} restituée : le parcours n'a pas abouti)`);
        }
      }
    }
    if (ok) n++;
  }
  return n;
}

// ───────────────────────────────── signatures : contrats de bail

async function seedSignaturesContrats(): Promise<number> {
  const PLAN: { ref: string; stade: Stade }[] = [
    { ref: '004', stade: 'ENVOYEE' }, // bail 0012
    { ref: '007', stade: 'PARTIELLE' }, // bail 0015
    { ref: '011', stade: 'SCELLEE_PLACE' }, // bail 0018
    { ref: '002', stade: 'SCELLEE_CODE' }, // bail 0010
    { ref: '017', stade: 'REFUSEE' }, // bail 0022
    { ref: '018', stade: 'ANNULEE' }, // bail 0023
    { ref: '010', stade: 'EXPIREE' } // bail 0017
  ];
  let n = 0;
  for (const p of PLAN) {
    const b = bail(p.ref);
    if (!b) continue;
    const contrat = await prisma.rentalDocument.findFirst({
      where: {
        tenant_id: TENANT_ID,
        lease_id: b.id,
        type: RentalDocumentType.LEASE_CONTRACT,
        status: RentalDocumentStatus.FINAL
      },
      select: { id: true }
    });
    if (!contrat) {
      say(`  ⨯ ${b.numero} : aucun contrat FINAL à envoyer en signature`);
      continue;
    }
    if (await jouer('LEASE_CONTRACT', b.id, p.stade, ['LOCATAIRE', 'BAILLEUR'], `contrat de bail ${b.numero}`)) n++;
  }
  return n;
}

// ───────────────────────────────────────────────────────────────── main

async function afficherTotaux(): Promise<void> {
  const documents = await prisma.rentalDocument.groupBy({
    by: ['type', 'status'],
    where: { tenant_id: TENANT_ID, lease: { property: { internalReference: { startsWith: 'PRES-' } } } },
    _count: { _all: true }
  });
  const total = documents.reduce((s, g) => s + g._count._all, 0);
  say(`\nDocuments locatifs des baux PRES-* (total ${total}) :`);
  for (const g of documents.sort((a, b) => `${a.type}${a.status}`.localeCompare(`${b.type}${b.status}`))) {
    say(`  ${g.type.padEnd(16)} ${g.status.padEnd(10)} ${String(g._count._all).padStart(4)}`);
  }
  const parBail = await prisma.rentalDocument.groupBy({
    by: ['lease_id'],
    where: { tenant_id: TENANT_ID, lease: { property: { internalReference: { startsWith: 'PRES-' } } } },
    _count: { _all: true }
  });
  // Minimum par bail « occupé » (les baux brouillon n'ont qu'un contrat en brouillon).
  const idsOccupes = new Set([...baux.values()].map(b => b.id));
  const comptes = parBail.filter(g => g.lease_id && idsOccupes.has(g.lease_id)).map(g => g._count._all);
  const minimum = comptes.length ? Math.min(...comptes) : 0;
  const moyenne = comptes.length ? comptes.reduce((s, v) => s + v, 0) / comptes.length : 0;
  say(
    `  ${comptes.length} baux occupés sur ${idsOccupes.size} ont des documents ; par bail : minimum ${minimum}, moyenne ${moyenne.toFixed(1)}`
  );

  const demandes = await prisma.signatureRequest.groupBy({
    by: ['kind', 'status'],
    where: { tenantId: TENANT_ID },
    _count: { _all: true }
  });
  say('\nDemandes de signature de l’agence :');
  for (const g of demandes.sort((a, b) => `${a.kind}${a.status}`.localeCompare(`${b.kind}${b.status}`))) {
    say(`  ${g.kind.padEnd(20)} ${g.status.padEnd(17)} ${String(g._count._all).padStart(3)}`);
  }
  const { limite, utilise } = await quotaRestant();
  say(`  Quota SIGNATURES_MENSUELLES : ${utilise} utilisée(s) sur ${limite} ce mois-ci (reste ${limite - utilise}).`);
  if (emailsRefuses > 0) {
    say(
      `  (${emailsRefuses} e-mail(s) d'information à l'émetteur refusé(s) par le SMTP neutralisé : attendu, rien n'est parti.)`
    );
  }
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { name: true } });
  if (!tenant) throw new Error(`Agence ${TENANT_ID} introuvable`);
  const membre = await prisma.membership.findFirst({
    where: { tenantId: TENANT_ID },
    select: { userId: true, user: { select: { email: true, fullName: true } } }
  });
  if (!membre) throw new Error('Aucun collaborateur sur cette agence');
  acteur = membre.userId;
  agentNom = membre.user?.fullName || membre.user?.email || 'Agent';
  CTX = { tenantId: TENANT_ID, userId: acteur };
  say(`Agence : ${tenant.name}\nAuteur des écritures : ${membre.user?.email} (${agentNom})`);

  await chargerBaux();
  if (baux.size === 0) throw new Error('Aucun bail PRES-NNN : lancer d’abord db:seed:presentation-locative');
  say(`${baux.size} baux de la présentation trouvés.`);

  const avecContrats = isDocxPdfConversionAvailable();
  const { limite, utilise } = await quotaRestant();
  say(`Quota de signatures : ${utilise} utilisée(s) sur ${limite} ce mois-ci ; marge conservée : ${MARGE_QUOTA}.`);
  say(
    avecContrats
      ? 'Conversion DOCX→PDF activée : les contrats de bail seront envoyés en signature.'
      : 'Conversion DOCX→PDF désactivée (DOCX_PDF_CONVERTER) : aucun contrat de bail ne peut être envoyé en signature.'
  );

  await runWithTenantContext({ tenantId: TENANT_ID, userId: acteur }, async () => {
    // Documents d'abord : générer un contrat annule les demandes de signature ouvertes du bail.
    await etape('Modèles de documents (fichiers)', reparerModeles);
    await etape('Contrats de bail', seedContrats);
    await etape('Avenants', seedAvenants);
    await etape('Reçus de loyer (service de génération)', seedRecus);
    await etape('Quittances de loyer', seedQuittances);
    await etape('Reçus de dépôt de garantie', seedRecusDepot);
    await etape('Relevés de compte', seedReleves);
    await etape('Statuts variés : brouillon, annulé, révision', seedStatuts);
    // Signatures ensuite.
    await etape('Signatures : états des lieux', () => seedSignaturesEdl(avecContrats));
    await etape('Signatures : mandats de gestion', seedSignaturesMandats);
    if (avecContrats) await etape('Signatures : contrats de bail', seedSignaturesContrats);
  });

  say('\n──────────── BILAN ────────────');
  for (const b of bilan) {
    say(
      `${b.etape.padEnd(52)} ${String(b.ok).padStart(4)} créés${b.echecs.length ? `   ⨯ ${b.echecs.length} échec(s) : ${b.echecs[0]}` : ''}`
    );
  }
  say('\nCréés dans cette exécution :');
  const lignes = Object.entries(crees).sort(([a], [b]) => a.localeCompare(b));
  if (lignes.length === 0) say('  (rien : tout existait déjà)');
  for (const [cle, valeur] of lignes) say(`  ${cle.padEnd(34)} ${String(valeur).padStart(4)}`);
  if (dureesMs.length) {
    const moyenne = dureesMs.reduce((s, v) => s + v, 0) / dureesMs.length;
    say(
      `\nGénération par le service : ${dureesMs.length} document(s), ${Math.round(moyenne)} ms en moyenne (DOCX, sans conversion PDF).`
    );
  }
  await afficherTotaux();
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
