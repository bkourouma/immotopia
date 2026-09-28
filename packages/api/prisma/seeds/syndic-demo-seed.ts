/**
 * Jeu de démonstration — module Syndic (copropriété), agence « Ivoire Résidences ».
 *
 * Pose deux copropriétés complètes et crédibles, à Abidjan :
 *
 *   1. « Résidence Les Perles de la Riviera » (Cocody Riviera 3) — 15 lots,
 *      historique complet 2023 → 2026 : budgets votés qui évoluent (inflation,
 *      nouveau contrat d'ascenseur, nouveau gardiennage avec vidéosurveillance),
 *      AG annuelles et une AGE de travaux (étanchéité + ravalement financés par
 *      deux appels exceptionnels et le fonds de travaux), appels trimestriels,
 *      paiements (ponctuels, retardataires, impayés chroniques), relances,
 *      pénalités, échéanciers, comptabilité complète, contrats, incidents,
 *      historique du fonds de travaux (`SyndicateFundMovement` : solde repris,
 *      part de chaque paiement versée au fonds, prélèvements votés).
 *   2. « Résidence Les Jardins d'Angré » (Cocody Angré 8e Tranche) — 50 lots,
 *      reprise de gestion au 01/01/2026 : arriérés repris de l'ancien syndic,
 *      budget 2026 voté à la première AG, appels T1 → T3 2026, etc.
 *
 * Usage (depuis packages/api) :
 *
 *     npm run db:seed:syndic-demo
 *     # équivalent : npx ts-node -T prisma/seeds/syndic-demo-seed.ts
 *
 * Le script charge DATABASE_URL depuis packages/api/.env (dotenv), contrairement
 * aux seeds de permissions. Variables facultatives : DEMO_TENANT_ID (agence
 * cible, défaut Ivoire Résidences), UPLOADS_DIR (racine des fichiers déposés,
 * défaut <racine du dépôt>/uploads).
 *
 * IDEMPOTENT et NON DESTRUCTIF :
 *   - les deux copropriétés ont des identifiants FIXES (SYNDIC_*_ID ci-dessous) ;
 *     à chaque passage, le script supprime puis recrée UNIQUEMENT ces deux
 *     copropriétés (la cascade Prisma emporte leurs lots, appels, AG, budgets,
 *     plan comptable, écritures…) et les tickets de maintenance de leurs deux
 *     immeubles ;
 *   - l'immeuble support de chaque copropriété (Property IMMEUBLE, id fixe),
 *     les contacts CRM (copropriétaires, locataires, gestionnaires — marqués
 *     « [seed:syndic-demo] » dans leurs notes internes) et les prestataires
 *     sont créés ou mis à jour (upsert), jamais supprimés ;
 *   - la copropriété « Résidence Les Rôniers » et toute autre donnée ne sont
 *     jamais lues en écriture ;
 *   - les PDF de démonstration sont écrits sous uploads/syndics/<id fixe>/documents.
 *
 * La date de référence est figée au 24/09/2026 (REFERENCE_DATE) : les paiements,
 * relances et pénalités sont générés jusqu'à cette date. Le hasard est
 * déterministe (graine fixe) : deux passages produisent les mêmes montants.
 *
 * Refuse de tourner si NODE_ENV=production.
 */

import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import { Prisma, PrismaClient } from '@prisma/client';
import { parsePeriodBounds } from '../../src/lib/syndics/period';
import { buildSyndicFundMovements, type FundPaymentInput } from './syndic-demo-fund-movements';

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

if (process.env.NODE_ENV === 'production') {
  console.error('syndic-demo-seed : refus de tourner en production.');
  process.exit(1);
}

const prisma = new PrismaClient({ log: [] });

const TENANT_ID = process.env.DEMO_TENANT_ID || '385a1e76-ac08-4db5-9802-8b2ddfb1672b';
const SEED_TAG = '[seed:syndic-demo]';
const REFERENCE_DATE = d(2026, 9, 24, 8);
const UPLOADS_ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, '../../../../uploads');

const SYNDIC_PERLES_ID = '5e1d1c01-2023-4a6e-9c0f-7065726c6573';
const SYNDIC_JARDINS_ID = '5e1d1c02-2026-4a6e-9c0f-6a617264696e';
const PROPERTY_PERLES_ID = '5e1d1c01-b41d-4a6e-9c0f-000000000001';
const PROPERTY_JARDINS_ID = '5e1d1c02-b41d-4a6e-9c0f-000000000002';

// ═══════════════════════════════════════════════════════════════ utilitaires

function d(y: number, m: number, day: number, h = 10, mi = 0): Date {
  return new Date(Date.UTC(y, m - 1, day, h, mi));
}
function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 86400000);
}
function lastDayOfMonth(y: number, m: number): Date {
  return new Date(Date.UTC(y, m, 0, 17, 0));
}
function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}
function fmtDate(date: Date): string {
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}
function fcfa(n: number): string {
  const s = Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${s} F CFA`;
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rint(r: () => number, min: number, max: number): number {
  return min + Math.floor(r() * (max - min + 1));
}
function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Incohérence du jeu de démonstration : ${message}`);
}
function chunk<T>(items: T[], size = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ═══════════════════════════════════════════════════════════════ types

type Profile = 'ponctuel' | 'normal' | 'lent' | 'retardataire';
type Method = 'VIREMENT' | 'CHEQUE' | 'ESPECES' | 'ORANGE' | 'MTN' | 'WAVE';
type DistKey = 'GENERAL_SHARES' | 'SPECIAL_SHARES' | 'EQUAL';
type Billing = 'monthly' | 'bimonthly' | 'quarterly' | 'annual' | 'bankfees' | 'none';
type JournalCode = 'CH' | 'BQ' | 'MM' | 'CA' | 'AC' | 'OD';
type LotKind = 'APARTMENT' | 'PARKING' | 'CELLAR' | 'COMMERCIAL';
type Majority = 'SIMPLE' | 'ABSOLUE' | 'DOUBLE';

const METHOD_LABEL: Record<Method, string> = {
  VIREMENT: 'Virement bancaire',
  CHEQUE: 'Chèque',
  ESPECES: 'Espèces',
  ORANGE: 'Orange Money',
  MTN: 'MTN MoMo',
  WAVE: 'Wave'
};
const METHOD_TREASURY: Record<Method, { account: string; journal: JournalCode }> = {
  VIREMENT: { account: '512', journal: 'BQ' },
  CHEQUE: { account: '512', journal: 'BQ' },
  ESPECES: { account: '531', journal: 'CA' },
  ORANGE: { account: '5171', journal: 'MM' },
  MTN: { account: '5171', journal: 'MM' },
  WAVE: { account: '5171', journal: 'MM' }
};
const MAJORITY_LABEL: Record<Majority, string> = {
  SIMPLE: 'Majorité simple des voix exprimées',
  ABSOLUE: 'Majorité absolue des voix de tous les copropriétaires',
  DOUBLE: 'Double majorité (majorité des copropriétaires représentant les 2/3 des voix)'
};

interface ContactDef {
  key: string;
  company?: { legalName: string; legalForm: 'SARL' | 'SA' | 'OTHER'; rccm: string; rep: string; repRole: string };
  civility?: 'MR' | 'MRS' | 'MS' | 'DR';
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profession?: string;
  nationality?: string;
  address?: string;
  district?: string;
  city?: string;
  channel: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'SMS';
  role?: 'COOWNER' | 'TENANT';
  roleEndedAt?: Date;
  profile?: Profile;
  methods?: Method[];
  note: string;
}

interface LotOwnerDef {
  key: string;
  from: Date;
  until?: Date;
  pct?: number;
  portal?: boolean;
}
interface LotDef {
  num: string;
  type: LotKind;
  desc: string;
  surface: number;
  shares: number;
  special?: number | null;
  owners: LotOwnerDef[];
  tenants?: { key: string; from: Date; until?: Date; billed: boolean; notes?: string }[];
}

interface SupplierDef {
  key: string;
  account: string;
  name: string;
  provider?: { specialty: string; email: string; phone: string };
}

interface LineDef {
  code: string;
  category: string;
  description: string;
  account: string;
  key: DistKey;
  billing: Billing;
  variance: number;
  supplier?: string;
}

interface BudgetDef {
  year: number;
  label: string;
  status: 'APPROVED' | 'CLOSED' | 'DRAFT';
  approvedAt: Date;
  resolution?: string; // "<clé AG>#<index de résolution>"
  amounts: Record<string, number>;
  suppliers?: Record<string, string>;
  descriptions?: Record<string, string>;
  quartersIssued: number;
}

interface ExceptionalCallDef {
  period: string;
  label: string;
  issue: Date;
  due: Date;
  amount: number;
  account: string;
}
interface RepriseCallDef {
  period: string;
  label: string;
  issue: Date;
  due: Date;
  amounts: Record<string, number>;
}

interface ResolutionDef {
  title: string;
  description: string;
  majority: Majority;
  result: 'APPROVED' | 'REJECTED' | 'DEFERRED' | null;
  against?: string[];
  abstain?: string[];
  forOnly?: string[]; // si renseigné : seuls ces copropriétaires votent pour, les autres présents contre
  noVote?: boolean;
}
interface MeetingDef {
  key: string;
  type: 'ORDINARY' | 'EXTRAORDINARY';
  date: Date;
  end?: Date;
  location: string;
  status: 'COMPLETED' | 'PLANNED';
  absent: string[];
  proxies: [string, string][];
  resolutions: ResolutionDef[];
  agendaExtra: { title: string; discussions: string[] }[];
  discussions: string[][]; // discussions par résolution (même index)
}

interface ContractDef {
  key: string;
  supplier: string;
  nature: string;
  start: Date;
  end: Date | null;
  annual: number;
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  alertDays: number;
  lineCode?: string;
}

interface IncidentCostDef {
  type: 'SYNDICATE_BUDGET' | 'INSURANCE' | 'LOT_OWNER' | 'THIRD_PARTY';
  amount: number;
  supplier?: string;
  lot?: string;
  contract?: string;
  notes: string;
  reimbursedAt?: Date;
}
interface IncidentDef {
  type: 'BREAKDOWN' | 'LEAK' | 'VANDALISM' | 'SAFETY' | 'OTHER';
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'REPORTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  reportedAt: Date;
  resolvedAt?: Date;
  reporter: string;
  lot?: string;
  asset?: string;
  provider?: string;
  description: string;
  costs?: IncidentCostDef[];
  ticket?: {
    title: string;
    category: 'PLUMBING' | 'ELECTRICITY' | 'AC' | 'OTHER';
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    status: 'DECLARED' | 'IN_PROGRESS' | 'ASSIGNED' | 'RESOLVED' | 'CANCELED';
    location: string;
    resolution?: string;
    imputation: 'SYNDICATE' | 'LOT_OWNER' | 'LOT_TENANT' | 'MIXED';
  };
}

interface SpecialInvoiceDef {
  date: Date;
  payDate?: Date;
  supplier: string;
  account: string;
  lineCode?: string;
  amount: number;
  label: string;
}

interface ScheduleDef {
  lot: string;
  period: string;
  agreedAt: Date;
  status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED';
  instalments: { due: Date; paidAt?: Date }[];
}

interface OverridePayment {
  date: Date;
  frac?: number;
  rest?: boolean;
  amount?: number;
  method?: Method;
}

interface DocumentDef {
  title: string;
  type: 'REGULATION' | 'GENERAL_MEETING_MINUTES' | 'DIAGNOSTIC' | 'INSURANCE' | 'BUDGET' | 'OTHER';
  date: Date;
  expiresAt?: Date;
  body: string[];
  meeting?: string;
}

interface CoproDef {
  id: string;
  code: string;
  name: string;
  address: string;
  registrationNo: string;
  cadastral: string;
  buildings: number;
  manager: string;
  managementStart: Date;
  property: {
    id: string;
    reference: string;
    title: string;
    description: string;
    address: string;
    zone: string;
    commune: string;
    surface: number;
    floors: number;
    units: number;
    parkings: number;
    elevator: boolean;
    createdAt: Date;
  };
  contacts: ContactDef[];
  lots: LotDef[];
  totalShares: number;
  suppliers: SupplierDef[];
  lines: LineDef[];
  budgets: BudgetDef[];
  exceptional: ExceptionalCallDef[];
  reprise?: RepriseCallDef;
  years: number[];
  opening: { date: Date; label: string; bank: number; roulement: number; travaux: number };
  meetings: MeetingDef[];
  contracts: ContractDef[];
  assets: { key: string; name: string; category: string; last?: Date; next?: Date; notes: string }[];
  incidents: IncidentDef[];
  specialInvoices: SpecialInvoiceDef[];
  fundTransfers: { date: Date; amount: number; label: string }[];
  schedules: ScheduleDef[];
  overrides: Record<string, OverridePayment[]>; // clé : "<lot>|<période>"
  waivers: Record<string, { date: Date; reason: string }>; // clé : "<lot>|<période>"
  waiveFirstPenalty: string[]; // clés de copropriétaires
  documents: DocumentDef[];
  bank: { name: string; iban: string };
  mobileNumbers: { orange: string; mtn: string; wave: string };
}

// ═══════════════════════════════════════════════════════════════ copropriété 1 — Les Perles de la Riviera

function contactsPerles(): ContactDef[] {
  const tag = `${SEED_TAG} Résidence Les Perles de la Riviera`;
  return [
    {
      key: 'kouadio_estelle',
      civility: 'MRS',
      firstName: 'Estelle',
      lastName: 'Kouadio',
      email: 'estelle.kouadio.syndic@example.ci',
      phone: '+2250707215584',
      profession: 'Gestionnaire de copropriété — Ivoire Résidences',
      district: 'Cocody',
      channel: 'EMAIL',
      note: `${tag} — gestionnaire de la copropriété`
    },
    {
      key: 'sci_akwaba',
      company: {
        legalName: 'SCI Akwaba Invest',
        legalForm: 'OTHER',
        rccm: 'CI-ABJ-2016-B-14872',
        rep: 'Didier Aka',
        repRole: 'Gérant'
      },
      firstName: 'SCI',
      lastName: 'Akwaba Invest',
      email: 'gerance.sci-akwaba@example.ci',
      phone: '+2252722441290',
      profession: 'Société civile immobilière (bailleur)',
      address: 'Immeuble Alpha 2000, Plateau',
      district: 'Plateau',
      channel: 'EMAIL',
      role: 'COOWNER',
      profile: 'ponctuel',
      methods: ['VIREMENT'],
      note: `${tag} — lots C01, A22, P01`
    },
    {
      key: 'kone_aya',
      civility: 'MRS',
      firstName: 'Aya',
      lastName: 'Koné',
      email: 'aya.kone.riviera@example.ci',
      phone: '+2250505873316',
      profession: 'Commerçante (boutique de prêt-à-porter, lot C02)',
      district: 'Cocody Riviera',
      channel: 'WHATSAPP',
      role: 'COOWNER',
      profile: 'normal',
      methods: ['ORANGE', 'ESPECES'],
      note: `${tag} — lot C02, impayés depuis 2025, échéanciers en cours`
    },
    {
      key: 'kouassi_yao',
      civility: 'MR',
      firstName: 'Yao',
      lastName: 'Kouassi',
      email: 'yao.kouassi.riviera@example.ci',
      phone: '+2250708192245',
      profession: 'Enseignant-chercheur',
      district: 'Cocody Riviera',
      channel: 'SMS',
      role: 'COOWNER',
      profile: 'normal',
      methods: ['MTN', 'ESPECES'],
      note: `${tag} — lot A11, paiements partiels depuis 2026`
    },
    {
      key: 'diallo_fatoumata',
      civility: 'DR',
      firstName: 'Fatoumata',
      lastName: 'Diallo',
      email: 'fatoumata.diallo.riviera@example.ci',
      phone: '+2250707664410',
      profession: 'Médecin pédiatre',
      nationality: 'Guinéenne',
      district: 'Cocody Riviera',
      channel: 'EMAIL',
      role: 'COOWNER',
      profile: 'ponctuel',
      methods: ['WAVE', 'VIREMENT'],
      note: `${tag} — lots A12, P04 ; présidente du conseil syndical`
    },
    {
      key: 'bamba_souleymane',
      civility: 'MR',
      firstName: 'Souleymane',
      lastName: 'Bamba',
      email: 'souleymane.bamba.riviera@example.ci',
      phone: '+2250103557728',
      profession: 'Cadre bancaire',
      district: 'Cocody Riviera',
      channel: 'EMAIL',
      role: 'COOWNER',
      profile: 'normal',
      methods: ['CHEQUE', 'VIREMENT'],
      note: `${tag} — lot A21 (en indivision avec son épouse)`
    },
    {
      key: 'bamba_mariam',
      civility: 'MRS',
      firstName: 'Mariam',
      lastName: 'Bamba-Cissé',
      email: 'mariam.bamba-cisse@example.ci',
      phone: '+2250505226671',
      profession: 'Architecte',
      district: 'Cocody Riviera',
      channel: 'WHATSAPP',
      role: 'COOWNER',
      note: `${tag} — lot A21 (indivision 50 %)`
    },
    {
      key: 'koffi_herve',
      civility: 'MR',
      firstName: 'Hervé',
      lastName: "Koffi N'Guessan",
      email: 'herve.koffi-nguessan@example.ci',
      phone: '+2250709318854',
      profession: 'Ingénieur génie civil',
      district: 'Cocody Riviera',
      channel: 'WHATSAPP',
      role: 'COOWNER',
      profile: 'normal',
      methods: ['MTN', 'VIREMENT'],
      note: `${tag} — lots A31, P02 ; membre du conseil syndical`
    },
    {
      key: 'sow_ibrahima',
      civility: 'MR',
      firstName: 'Ibrahima',
      lastName: 'Sow',
      email: 'ibrahima.sow.dakar@example.ci',
      phone: '+221775481203',
      profession: 'Consultant',
      nationality: 'Sénégalaise',
      address: 'Dakar, Mermoz',
      channel: 'EMAIL',
      role: 'COOWNER',
      roleEndedAt: d(2025, 6, 30),
      profile: 'normal',
      methods: ['VIREMENT'],
      note: `${tag} — ancien propriétaire du lot A32 (vendu le 30/06/2025)`
    },
    {
      key: 'mensah_akouvi',
      civility: 'MRS',
      firstName: 'Akouvi',
      lastName: 'Mensah',
      email: 'akouvi.mensah@example.ci',
      phone: '+2250707904417',
      profession: 'Directrice administrative et financière',
      nationality: 'Togolaise',
      district: 'Cocody Riviera',
      channel: 'EMAIL',
      role: 'COOWNER',
      profile: 'ponctuel',
      methods: ['VIREMENT', 'WAVE'],
      note: `${tag} — lot A32 depuis le 01/07/2025`
    },
    {
      key: 'traore_moussa',
      civility: 'MR',
      firstName: 'Moussa',
      lastName: 'Traoré',
      email: 'moussa.traore.bamako@example.ci',
      phone: '+22376452190',
      profession: 'Commerçant import-export',
      nationality: 'Malienne',
      address: 'Bamako, ACI 2000',
      channel: 'WHATSAPP',
      role: 'COOWNER',
      profile: 'retardataire',
      methods: ['WAVE', 'VIREMENT'],
      note: `${tag} — lot A41 (loué), retardataire chronique`
    },
    {
      key: 'ahoua_jeanmarc',
      civility: 'MR',
      firstName: 'Jean-Marc',
      lastName: 'Ahoua',
      email: 'jeanmarc.ahoua@example.ci',
      phone: '+2250707118802',
      profession: "Chef d'entreprise (BTP)",
      district: 'Cocody Riviera',
      channel: 'CALL',
      role: 'COOWNER',
      profile: 'ponctuel',
      methods: ['VIREMENT'],
      note: `${tag} — lots A42 (duplex), P03, K01`
    },
    {
      key: 'gnagne_serge',
      civility: 'MR',
      firstName: 'Serge',
      lastName: 'Gnagne',
      email: 'serge.gnagne.riviera@example.ci',
      phone: '+2250141278830',
      profession: 'Ingénieur informaticien',
      district: 'Cocody Riviera',
      channel: 'WHATSAPP',
      role: 'TENANT',
      note: `${tag} — locataire du lot A22`
    },
    {
      key: 'coulibaly_awa',
      civility: 'MS',
      firstName: 'Awa',
      lastName: 'Coulibaly',
      email: 'awa.coulibaly.riviera@example.ci',
      phone: '+2250576610924',
      profession: 'Juriste',
      district: 'Cocody Riviera',
      channel: 'SMS',
      role: 'TENANT',
      note: `${tag} — locataire du lot A41`
    },
    {
      key: 'kouao_mathieu',
      civility: 'MR',
      firstName: 'Mathieu',
      lastName: 'Kouao',
      email: 'mathieu.kouao@example.ci',
      phone: '+2250709887123',
      profession: 'Comptable',
      channel: 'CALL',
      role: 'TENANT',
      roleEndedAt: d(2023, 8, 31),
      note: `${tag} — ancien locataire du lot A41 (sorti le 31/08/2023)`
    },
    {
      key: 'pharmacie_riviera',
      company: {
        legalName: 'Pharmacie Riviera Palmeraie SARL',
        legalForm: 'SARL',
        rccm: 'CI-ABJ-2018-B-20931',
        rep: 'Dr Rosine Achi-Kouamé',
        repRole: 'Pharmacienne titulaire'
      },
      firstName: 'Pharmacie',
      lastName: 'Riviera Palmeraie',
      email: 'pharmacie.riviera-palmeraie@example.ci',
      phone: '+2252722475566',
      profession: 'Officine de pharmacie',
      district: 'Cocody Riviera',
      channel: 'EMAIL',
      role: 'TENANT',
      note: `${tag} — locataire commercial du lot C01`
    }
  ];
}

function defPerles(): CoproDef {
  const since = d(2019, 3, 1);
  const lots: LotDef[] = [
    {
      num: 'C01',
      type: 'COMMERCIAL',
      desc: 'Rez-de-chaussée sur rue — local commercial (pharmacie)',
      surface: 85,
      shares: 80,
      owners: [{ key: 'sci_akwaba', from: since, portal: true }],
      tenants: [{ key: 'pharmacie_riviera', from: d(2019, 6, 1), billed: true, notes: 'Bail commercial 3-6-9' }]
    },
    {
      num: 'C02',
      type: 'COMMERCIAL',
      desc: 'Rez-de-chaussée sur rue — boutique',
      surface: 55,
      shares: 50,
      owners: [{ key: 'kone_aya', from: d(2020, 11, 15), portal: true }]
    },
    {
      num: 'A11',
      type: 'APARTMENT',
      desc: '1er étage — F3, 95 m², balcon',
      surface: 95,
      shares: 85,
      special: 85,
      owners: [{ key: 'kouassi_yao', from: since }]
    },
    {
      num: 'A12',
      type: 'APARTMENT',
      desc: '1er étage — F4, 120 m², 2 balcons',
      surface: 120,
      shares: 110,
      special: 105,
      owners: [{ key: 'diallo_fatoumata', from: since, portal: true }]
    },
    {
      num: 'A21',
      type: 'APARTMENT',
      desc: '2e étage — F3, 95 m², balcon',
      surface: 95,
      shares: 85,
      special: 100,
      owners: [
        { key: 'bamba_souleymane', from: d(2019, 7, 1), pct: 50, portal: true },
        { key: 'bamba_mariam', from: d(2019, 7, 1), pct: 50 }
      ]
    },
    {
      num: 'A22',
      type: 'APARTMENT',
      desc: '2e étage — F4, 120 m², 2 balcons',
      surface: 120,
      shares: 110,
      special: 125,
      owners: [{ key: 'sci_akwaba', from: since, portal: true }],
      tenants: [
        { key: 'gnagne_serge', from: d(2024, 3, 1), billed: false, notes: 'Bail d’habitation 1 an renouvelable' }
      ]
    },
    {
      num: 'A31',
      type: 'APARTMENT',
      desc: '3e étage — F3, 95 m², balcon',
      surface: 95,
      shares: 85,
      special: 115,
      owners: [{ key: 'koffi_herve', from: d(2019, 5, 10), portal: true }]
    },
    {
      num: 'A32',
      type: 'APARTMENT',
      desc: '3e étage — F4, 120 m², 2 balcons',
      surface: 120,
      shares: 110,
      special: 140,
      owners: [
        { key: 'sow_ibrahima', from: since, until: d(2025, 7, 1) },
        { key: 'mensah_akouvi', from: d(2025, 7, 1), portal: true }
      ]
    },
    {
      num: 'A41',
      type: 'APARTMENT',
      desc: '4e étage — F2, 70 m²',
      surface: 70,
      shares: 65,
      special: 90,
      owners: [{ key: 'traore_moussa', from: d(2020, 2, 1) }],
      tenants: [
        { key: 'kouao_mathieu', from: d(2021, 9, 1), until: d(2023, 8, 31), billed: true },
        { key: 'coulibaly_awa', from: d(2023, 9, 1), billed: true, notes: 'Charges refacturées au locataire' }
      ]
    },
    {
      num: 'A42',
      type: 'APARTMENT',
      desc: '4e et 5e étages — duplex F5, 185 m², terrasse',
      surface: 185,
      shares: 170,
      special: 240,
      owners: [{ key: 'ahoua_jeanmarc', from: since, portal: true }]
    },
    {
      num: 'K01',
      type: 'CELLAR',
      desc: 'Sous-sol — cave n° 1, 8 m²',
      surface: 8,
      shares: 6,
      owners: [{ key: 'ahoua_jeanmarc', from: since }]
    },
    {
      num: 'P01',
      type: 'PARKING',
      desc: 'Sous-sol — place de parking n° 1',
      surface: 12.5,
      shares: 11,
      owners: [{ key: 'sci_akwaba', from: since }]
    },
    {
      num: 'P02',
      type: 'PARKING',
      desc: 'Sous-sol — place de parking n° 2',
      surface: 12.5,
      shares: 11,
      owners: [{ key: 'koffi_herve', from: d(2019, 5, 10) }]
    },
    {
      num: 'P03',
      type: 'PARKING',
      desc: 'Sous-sol — place de parking n° 3',
      surface: 12.5,
      shares: 11,
      owners: [{ key: 'ahoua_jeanmarc', from: since }]
    },
    {
      num: 'P04',
      type: 'PARKING',
      desc: 'Sous-sol — place de parking n° 4',
      surface: 12.5,
      shares: 11,
      owners: [{ key: 'diallo_fatoumata', from: since }]
    }
  ];

  const suppliers: SupplierDef[] = [
    {
      key: 'VIG',
      account: '401VIG',
      name: 'Vigilance Sécurité Privée',
      provider: { specialty: 'Gardiennage', email: 'contact@vigilance-securite.example.ci', phone: '+2252722411890' }
    },
    {
      key: 'SIG',
      account: '401SIG',
      name: 'Groupe SIGMA Sécurité',
      provider: {
        specialty: 'Gardiennage et vidéosurveillance',
        email: 'commercial@sigma-securite.example.ci',
        phone: '+2252721350077'
      }
    },
    {
      key: 'CLE',
      account: '401CLE',
      name: 'Clean Plus Services',
      provider: {
        specialty: 'Nettoyage des parties communes',
        email: 'devis@cleanplus.example.ci',
        phone: '+2250707550312'
      }
    },
    {
      key: 'ETC',
      account: '401ETC',
      name: 'Élévation Technique CI',
      provider: { specialty: 'Ascenseurs', email: 'sav@elevation-technique.example.ci', phone: '+2252722508844' }
    },
    {
      key: 'ALM',
      account: '401ALM',
      name: 'Ascenseurs Lagune Maintenance (ALM)',
      provider: {
        specialty: 'Ascenseurs — maintenance complète',
        email: 'astreinte@alm.example.ci',
        phone: '+2252721247710'
      }
    },
    {
      key: 'ELP',
      account: '401ELP',
      name: 'Électro-Power Services',
      provider: {
        specialty: 'Groupes électrogènes et surpresseurs',
        email: 'maintenance@electropower.example.ci',
        phone: '+2250505481276'
      }
    },
    {
      key: 'JAR',
      account: '401JAR',
      name: "Jardins d'Éburnie",
      provider: { specialty: 'Espaces verts', email: 'contact@jardins-eburnie.example.ci', phone: '+2250707339048' }
    },
    {
      key: 'HYG',
      account: '401HYG',
      name: 'Hygiène Pro 3D',
      provider: {
        specialty: 'Désinsectisation, dératisation, désinfection',
        email: 'interventions@hygienepro3d.example.ci',
        phone: '+2250101447263'
      }
    },
    {
      key: 'ASA',
      account: '401ASA',
      name: 'Atlantique Courtage Assurances',
      provider: {
        specialty: 'Assurance multirisque immeuble',
        email: 'iard@atlantique-courtage.example.ci',
        phone: '+2252720316655'
      }
    },
    {
      key: 'EBI',
      account: '401EBI',
      name: 'Étanchéité Bâtiment Ivoire (EBI)',
      provider: {
        specialty: 'Étanchéité et ravalement de façades',
        email: 'chantiers@ebi.example.ci',
        phone: '+2250707962241'
      }
    },
    {
      key: 'BEI',
      account: '401BEI',
      name: "Bureau d'études Ivoire Structures",
      provider: {
        specialty: 'Diagnostics et expertises du bâti',
        email: 'etudes@ivoire-structures.example.ci',
        phone: '+2252722493318'
      }
    },
    {
      key: 'SOT',
      account: '401SOT',
      name: 'Sotelec Services',
      provider: {
        specialty: 'Électricité et dépannage du bâtiment',
        email: 'depannage@sotelec.example.ci',
        phone: '+2250505902214'
      }
    },
    { key: 'CIE', account: '401CIE', name: 'CIE — électricité des parties communes' },
    { key: 'SOD', account: '401SOD', name: 'SODECI — eau des parties communes' },
    { key: 'SYN', account: '401SYN', name: 'Ivoire Résidences — honoraires de syndic' },
    { key: 'DIV', account: '401DIV', name: 'Artisans et fournisseurs divers' }
  ];

  const lines: LineDef[] = [
    {
      code: 'GARD',
      category: 'Sécurité',
      description: 'Gardiennage 24h/24 (2 agents)',
      account: '6141',
      key: 'GENERAL_SHARES',
      billing: 'monthly',
      variance: 0,
      supplier: 'VIG'
    },
    {
      code: 'NETT',
      category: 'Entretien',
      description: 'Nettoyage des parties communes (6 jours sur 7)',
      account: '6142',
      key: 'GENERAL_SHARES',
      billing: 'monthly',
      variance: 0,
      supplier: 'CLE'
    },
    {
      code: 'ELEC',
      category: 'Fluides',
      description: 'Électricité des parties communes (CIE)',
      account: '6012',
      key: 'GENERAL_SHARES',
      billing: 'monthly',
      variance: 0.14,
      supplier: 'CIE'
    },
    {
      code: 'EAU',
      category: 'Fluides',
      description: 'Eau des parties communes et arrosage (SODECI)',
      account: '6011',
      key: 'GENERAL_SHARES',
      billing: 'bimonthly',
      variance: 0.15,
      supplier: 'SOD'
    },
    {
      code: 'ASC',
      category: 'Maintenance',
      description: "Contrat d'entretien de l'ascenseur (charges spéciales : appartements)",
      account: '6143',
      key: 'SPECIAL_SHARES',
      billing: 'quarterly',
      variance: 0,
      supplier: 'ALM'
    },
    {
      code: 'GE',
      category: 'Maintenance',
      description: 'Maintenance du groupe électrogène et du surpresseur',
      account: '6144',
      key: 'GENERAL_SHARES',
      billing: 'quarterly',
      variance: 0.06,
      supplier: 'ELP'
    },
    {
      code: 'JARD',
      category: 'Entretien',
      description: 'Entretien des espaces verts',
      account: '6145',
      key: 'GENERAL_SHARES',
      billing: 'monthly',
      variance: 0,
      supplier: 'JAR'
    },
    {
      code: 'DESI',
      category: 'Hygiène',
      description: 'Désinsectisation et dératisation (4 passages par an)',
      account: '6146',
      key: 'GENERAL_SHARES',
      billing: 'quarterly',
      variance: 0,
      supplier: 'HYG'
    },
    {
      code: 'ASSU',
      category: 'Assurance',
      description: 'Assurance multirisque immeuble',
      account: '616',
      key: 'GENERAL_SHARES',
      billing: 'annual',
      variance: 0,
      supplier: 'ASA'
    },
    {
      code: 'HONO',
      category: 'Administration',
      description: 'Honoraires du syndic (Ivoire Résidences)',
      account: '621',
      key: 'GENERAL_SHARES',
      billing: 'monthly',
      variance: 0,
      supplier: 'SYN'
    },
    {
      code: 'FRAIS',
      category: 'Administration',
      description: "Frais bancaires, d'envoi et de tenue de compte (répartis à parts égales)",
      account: '627',
      key: 'EQUAL',
      billing: 'bankfees',
      variance: 0.2
    },
    {
      code: 'TRAV',
      category: 'Travaux',
      description: 'Petits travaux, dépannages et interventions imprévues',
      account: '615',
      key: 'GENERAL_SHARES',
      billing: 'quarterly',
      variance: 0.3,
      supplier: 'DIV'
    },
    {
      code: 'FTRAV',
      category: 'Travaux',
      description: 'Cotisation annuelle au fonds de travaux',
      account: '105',
      key: 'GENERAL_SHARES',
      billing: 'none',
      variance: 0
    }
  ];

  const budgets: BudgetDef[] = [
    {
      year: 2023,
      label: 'Budget prévisionnel 2023',
      status: 'CLOSED',
      approvedAt: d(2022, 6, 18),
      amounts: {
        GARD: 2880000,
        NETT: 1080000,
        ELEC: 960000,
        EAU: 360000,
        ASC: 720000,
        GE: 540000,
        JARD: 300000,
        DESI: 240000,
        ASSU: 450000,
        HONO: 1200000,
        FRAIS: 120000,
        TRAV: 300000,
        FTRAV: 450000
      },
      suppliers: { ASC: 'ETC' },
      descriptions: { ASC: "Contrat d'entretien simple de l'ascenseur (charges spéciales : appartements)" },
      quartersIssued: 4
    },
    {
      year: 2024,
      label: 'Budget prévisionnel 2024',
      status: 'CLOSED',
      approvedAt: d(2023, 6, 17),
      resolution: 'AGO2023#4',
      amounts: {
        GARD: 3000000,
        NETT: 1140000,
        ELEC: 1020000,
        EAU: 380000,
        ASC: 1080000,
        GE: 600000,
        JARD: 300000,
        DESI: 240000,
        ASSU: 470000,
        HONO: 1200000,
        FRAIS: 130000,
        TRAV: 360000,
        FTRAV: 480000
      },
      descriptions: {
        ASC: "Maintenance complète de l'ascenseur — nouveau contrat ALM (charges spéciales : appartements)"
      },
      quartersIssued: 4
    },
    {
      year: 2025,
      label: 'Budget prévisionnel 2025',
      status: 'CLOSED',
      approvedAt: d(2024, 5, 25),
      resolution: 'AGO2024#3',
      amounts: {
        GARD: 3120000,
        NETT: 1200000,
        ELEC: 1080000,
        EAU: 400000,
        ASC: 1120000,
        GE: 640000,
        JARD: 330000,
        DESI: 260000,
        ASSU: 490000,
        HONO: 1260000,
        FRAIS: 140000,
        TRAV: 360000,
        FTRAV: 500000
      },
      descriptions: {
        ASC: "Maintenance complète de l'ascenseur — contrat ALM (charges spéciales : appartements)"
      },
      quartersIssued: 4
    },
    {
      year: 2026,
      label: 'Budget prévisionnel 2026',
      status: 'APPROVED',
      approvedAt: d(2025, 5, 24),
      resolution: 'AGO2025#3',
      amounts: {
        GARD: 3960000,
        NETT: 1260000,
        ELEC: 1140000,
        EAU: 420000,
        ASC: 1160000,
        GE: 680000,
        JARD: 360000,
        DESI: 280000,
        ASSU: 520000,
        HONO: 1320000,
        FRAIS: 150000,
        TRAV: 400000,
        FTRAV: 550000
      },
      suppliers: { GARD: 'SIG' },
      descriptions: {
        GARD: 'Gardiennage 24h/24 (3 agents) et vidéosurveillance — nouveau contrat Groupe SIGMA',
        ASC: "Maintenance complète de l'ascenseur — contrat ALM (charges spéciales : appartements)"
      },
      quartersIssued: 3
    },
    {
      year: 2027,
      label: 'Budget prévisionnel 2027',
      status: 'APPROVED',
      approvedAt: d(2026, 5, 30),
      resolution: 'AGO2026#3',
      amounts: {
        GARD: 4080000,
        NETT: 1320000,
        ELEC: 1200000,
        EAU: 440000,
        ASC: 1200000,
        GE: 720000,
        JARD: 360000,
        DESI: 300000,
        ASSU: 540000,
        HONO: 1380000,
        FRAIS: 160000,
        TRAV: 450000,
        FTRAV: 650000
      },
      suppliers: { GARD: 'SIG' },
      descriptions: {
        GARD: 'Gardiennage 24h/24 (3 agents) et vidéosurveillance — Groupe SIGMA',
        ASC: "Maintenance complète de l'ascenseur — contrat ALM (charges spéciales : appartements)"
      },
      quartersIssued: 0
    }
  ];

  const hall = 'Hall de la résidence — rez-de-chaussée';
  const meetings: MeetingDef[] = [
    {
      key: 'AGO2023',
      type: 'ORDINARY',
      date: d(2023, 6, 17, 9, 30),
      end: d(2023, 6, 17, 12, 45),
      location: hall,
      status: 'COMPLETED',
      absent: ['kone_aya'],
      proxies: [['traore_moussa', 'koffi_herve']],
      resolutions: [
        {
          title: 'Désignation du président de séance',
          description:
            'M. Jean-Marc Ahoua est désigné président de séance ; Mme Estelle Kouadio (syndic) assure le secrétariat.',
          majority: 'SIMPLE',
          result: 'APPROVED',
          abstain: ['ahoua_jeanmarc']
        },
        {
          title: "Approbation des comptes de l'exercice 2022",
          description:
            "Comptes de l'exercice 2022 arrêtés à 9 184 300 F CFA de charges pour 9 000 000 F CFA de budget.",
          majority: 'SIMPLE',
          result: 'APPROVED',
          abstain: ['kouassi_yao']
        },
        {
          title: 'Quitus au syndic pour sa gestion 2022',
          description: 'Quitus donné au syndic Ivoire Résidences pour sa gestion de l’exercice 2022.',
          majority: 'SIMPLE',
          result: 'APPROVED',
          against: ['sow_ibrahima']
        },
        {
          title: "Changement de prestataire de maintenance de l'ascenseur",
          description:
            "Résiliation du contrat simple d'Élévation Technique CI au 31/12/2023 et souscription d'un contrat de maintenance complète (pièces, main-d'œuvre, astreinte 24h/24) auprès d'Ascenseurs Lagune Maintenance, 1 080 000 F CFA HT par an, à compter du 01/01/2024.",
          majority: 'ABSOLUE',
          result: 'APPROVED',
          against: ['kouassi_yao']
        },
        {
          title: 'Vote du budget prévisionnel 2024',
          description:
            'Budget prévisionnel 2024 intégrant le nouveau contrat ascenseur et une revalorisation du gardiennage.',
          majority: 'SIMPLE',
          result: 'APPROVED',
          against: ['kouassi_yao'],
          abstain: ['traore_moussa']
        },
        {
          title: "Installation d'un système de vidéosurveillance",
          description: 'Devis Groupe SIGMA : 8 caméras, enregistreur et écran au poste de garde, 3 200 000 F CFA TTC.',
          majority: 'ABSOLUE',
          result: 'REJECTED',
          forOnly: ['diallo_fatoumata', 'ahoua_jeanmarc'],
          abstain: ['koffi_herve']
        },
        {
          title: 'Élection des membres du conseil syndical',
          description: 'Sont élus : Dr Fatoumata Diallo (présidente), M. Hervé Koffi N’Guessan, M. Souleymane Bamba.',
          majority: 'SIMPLE',
          result: 'APPROVED'
        }
      ],
      agendaExtra: [
        {
          title: 'Questions diverses',
          discussions: [
            'Rappel du règlement intérieur sur le stationnement des visiteurs dans la cour.',
            'Demande de remplacement des ampoules du parking par des LED (à chiffrer par le syndic).'
          ]
        }
      ],
      discussions: [
        ['Le président rappelle que 14 lots sur 15 sont présents ou représentés.'],
        ['Le syndic présente les comptes : dépassement de 184 300 F CFA lié aux dépannages de l’ascenseur.'],
        ['M. Sow regrette les délais de réponse du syndic aux courriels.'],
        [
          'Trois pannes longues de l’ascenseur en 2022.',
          'Comparaison de trois offres : ALM retenue pour son astreinte 24h/24.'
        ],
        ['Le budget passe de 9 600 000 à 10 400 000 F CFA (+8,3 %).'],
        ['Plusieurs copropriétaires jugent l’investissement prématuré ; sujet à représenter ultérieurement.'],
        []
      ]
    },
    {
      key: 'AGO2024',
      type: 'ORDINARY',
      date: d(2024, 5, 25, 9, 30),
      end: d(2024, 5, 25, 12, 15),
      location: hall,
      status: 'COMPLETED',
      absent: ['traore_moussa', 'sow_ibrahima'],
      proxies: [['kone_aya', 'sci_akwaba']],
      resolutions: [
        {
          title: 'Désignation du président de séance',
          description: 'Dr Fatoumata Diallo est désignée présidente de séance.',
          majority: 'SIMPLE',
          result: 'APPROVED'
        },
        {
          title: "Approbation des comptes de l'exercice 2023",
          description: 'Comptes 2023 approuvés tels que présentés par le syndic et vérifiés par le conseil syndical.',
          majority: 'SIMPLE',
          result: 'APPROVED',
          abstain: ['kone_aya']
        },
        {
          title: 'Quitus au syndic pour sa gestion 2023',
          description: 'Quitus donné au syndic pour sa gestion de l’exercice 2023.',
          majority: 'SIMPLE',
          result: 'APPROVED'
        },
        {
          title: 'Vote du budget prévisionnel 2025',
          description: 'Budget prévisionnel 2025, en hausse de 4,8 % (indexation des contrats).',
          majority: 'SIMPLE',
          result: 'APPROVED',
          against: ['kouassi_yao']
        },
        {
          title: 'Remplacement du surpresseur',
          description:
            'Remplacement du surpresseur hors d’usage par Électro-Power Services : 1 350 000 F CFA TTC, financés par prélèvement sur le fonds de travaux.',
          majority: 'ABSOLUE',
          result: 'APPROVED'
        },
        {
          title: "Diagnostic d'étanchéité de la toiture-terrasse",
          description:
            "Mission confiée au Bureau d'études Ivoire Structures : 450 000 F CFA TTC, imputés sur le poste petits travaux.",
          majority: 'SIMPLE',
          result: 'APPROVED'
        }
      ],
      agendaExtra: [
        {
          title: 'Questions diverses',
          discussions: ['Signalement d’infiltrations ponctuelles au 4e étage après les pluies de mai.']
        }
      ],
      discussions: [
        [],
        [
          'Exercice 2023 : {{charges:2023}} de charges courantes pour un budget de {{budgetCourant:2023}} ({{ecart:2023}}), dépassement dû à la panne de l’ascenseur de novembre.'
        ],
        [],
        ['Le budget passe de 10 400 000 à 10 900 000 F CFA.'],
        ['Deux devis comparés ; le fonds de travaux sera reconstitué par les cotisations annuelles.'],
        ['Le diagnostic conditionnera un éventuel programme de travaux soumis à une AG extraordinaire.']
      ]
    },
    {
      key: 'AGE2025',
      type: 'EXTRAORDINARY',
      date: d(2025, 2, 22, 10, 0),
      end: d(2025, 2, 22, 12, 30),
      location: hall,
      status: 'COMPLETED',
      absent: ['kone_aya', 'sow_ibrahima'],
      proxies: [['traore_moussa', 'koffi_herve']],
      resolutions: [
        {
          title: 'Désignation du président de séance',
          description: 'M. Jean-Marc Ahoua est désigné président de séance.',
          majority: 'SIMPLE',
          result: 'APPROVED'
        },
        {
          title: "Travaux de réfection de l'étanchéité de la toiture-terrasse et de ravalement des façades",
          description:
            "Au vu du diagnostic du Bureau d'études Ivoire Structures, l'assemblée décide les travaux et retient l'offre d'Étanchéité Bâtiment Ivoire (EBI) : 14 500 000 F CFA TTC, délai 6 mois.",
          majority: 'ABSOLUE',
          result: 'APPROVED',
          against: ['kouassi_yao'],
          abstain: ['traore_moussa']
        },
        {
          title: 'Financement des travaux',
          description:
            'Deux appels de fonds exceptionnels de 6 250 000 F CFA chacun (échéances 30/04/2025 et 31/07/2025), répartis aux tantièmes généraux, et prélèvement de 2 000 000 F CFA sur le fonds de travaux.',
          majority: 'ABSOLUE',
          result: 'APPROVED',
          against: ['kouassi_yao', 'traore_moussa']
        },
        {
          title: 'Mission de maîtrise d’œuvre et de suivi de chantier',
          description: "Proposition du Bureau d'études Ivoire Structures : 1 100 000 F CFA TTC.",
          majority: 'SIMPLE',
          result: 'REJECTED',
          forOnly: ['koffi_herve', 'ahoua_jeanmarc'],
          abstain: ['diallo_fatoumata']
        }
      ],
      agendaExtra: [],
      discussions: [
        [],
        [
          'Le diagnostic de septembre 2024 relève un relevé d’étanchéité décollé et des fissures en façade nord.',
          'Trois entreprises consultées : EBI (14,5 M), Batiplus (16,2 M), Sotraco (15,8 M).'
        ],
        [
          'Le fonds de travaux s’élève à {{fonds:2025-02-22}} ; un prélèvement de 2 000 000 F CFA est retenu, le fonds étant ensuite reconstitué par les cotisations annuelles.'
        ],
        ['M. Koffi N’Guessan (ingénieur) propose d’assurer bénévolement un suivi avec le conseil syndical.']
      ]
    },
    {
      key: 'AGO2025',
      type: 'ORDINARY',
      date: d(2025, 5, 24, 9, 30),
      end: d(2025, 5, 24, 12, 0),
      location: hall,
      status: 'COMPLETED',
      absent: ['traore_moussa', 'sow_ibrahima'],
      proxies: [['kone_aya', 'bamba_souleymane']],
      resolutions: [
        {
          title: 'Désignation du président de séance',
          description: 'M. Hervé Koffi N’Guessan est désigné président de séance.',
          majority: 'SIMPLE',
          result: 'APPROVED'
        },
        {
          title: "Approbation des comptes de l'exercice 2024",
          description:
            'Comptes 2024 approuvés, y compris le remplacement du surpresseur financé par le fonds de travaux.',
          majority: 'SIMPLE',
          result: 'APPROVED'
        },
        {
          title: 'Quitus au syndic pour sa gestion 2024',
          description: 'Quitus donné au syndic pour sa gestion de l’exercice 2024.',
          majority: 'SIMPLE',
          result: 'APPROVED',
          abstain: ['kouassi_yao']
        },
        {
          title: 'Vote du budget prévisionnel 2026',
          description:
            'Budget prévisionnel 2026 intégrant le nouveau contrat de gardiennage avec vidéosurveillance (+27 % sur ce poste).',
          majority: 'SIMPLE',
          result: 'APPROVED',
          against: ['kouassi_yao', 'kone_aya']
        },
        {
          title: 'Nouveau contrat de gardiennage avec vidéosurveillance',
          description:
            'Contrat Groupe SIGMA Sécurité à compter du 01/01/2026 : 3 agents en rotation 24h/24, 8 caméras et enregistreur, 3 960 000 F CFA TTC par an.',
          majority: 'ABSOLUE',
          result: 'APPROVED',
          against: ['kouassi_yao']
        },
        {
          title: 'Renouvellement du mandat du syndic',
          description: 'Mandat d’Ivoire Résidences renouvelé pour trois ans, du 01/07/2025 au 30/06/2028.',
          majority: 'ABSOLUE',
          result: 'APPROVED',
          abstain: ['kone_aya']
        }
      ],
      agendaExtra: [
        {
          title: 'Point sur le chantier d’étanchéité',
          discussions: ['EBI annonce un achèvement fin octobre 2025 ; premier acompte versé le 15/05/2025.']
        },
        { title: 'Questions diverses', discussions: ['Vente du lot A32 : M. Sow cède son appartement au 30/06/2025.'] }
      ],
      discussions: [
        [],
        [
          'Exercice 2024 : {{charges:2024}} de charges courantes pour {{budgetCourant:2024}} ({{ecart:2024}}) ; le dégât des eaux d’avril a été en grande partie remboursé par l’assureur.'
        ],
        [],
        ['Le budget passe de 10 900 000 à 12 200 000 F CFA.'],
        ['Deux cambriolages de véhicules en 2024 motivent le renforcement du gardiennage.'],
        []
      ]
    },
    {
      key: 'AGO2026',
      type: 'ORDINARY',
      date: d(2026, 5, 30, 9, 30),
      end: d(2026, 5, 30, 12, 40),
      location: hall,
      status: 'COMPLETED',
      absent: ['kone_aya'],
      proxies: [['traore_moussa', 'mensah_akouvi']],
      resolutions: [
        {
          title: 'Désignation du président de séance',
          description: 'Dr Fatoumata Diallo est désignée présidente de séance.',
          majority: 'SIMPLE',
          result: 'APPROVED'
        },
        {
          title: "Approbation des comptes de l'exercice 2025",
          description:
            'Comptes 2025 approuvés, dont le compte travaux d’étanchéité et de ravalement (14 500 000 F CFA, réceptionnés le 30/10/2025).',
          majority: 'SIMPLE',
          result: 'APPROVED',
          abstain: ['kouassi_yao']
        },
        {
          title: 'Quitus au syndic pour sa gestion 2025',
          description: 'Quitus donné au syndic pour sa gestion de l’exercice 2025.',
          majority: 'SIMPLE',
          result: 'APPROVED'
        },
        {
          title: 'Vote du budget prévisionnel 2027',
          description: 'Budget prévisionnel 2027, en hausse de 4,9 % (indexation des contrats et du gardiennage).',
          majority: 'SIMPLE',
          result: 'APPROVED',
          against: ['kouassi_yao']
        },
        {
          title: 'Remplacement du groupe électrogène — accord de principe',
          description:
            'Le groupe de 100 kVA (2012) sera remplacé ; le choix de l’entreprise et le financement seront soumis à une assemblée générale extraordinaire.',
          majority: 'SIMPLE',
          result: 'APPROVED'
        },
        {
          title: 'Autorisation d’agir en recouvrement contre le lot C02',
          description:
            'Le syndic est autorisé à engager une procédure de recouvrement judiciaire si l’échéancier accordé au lot C02 n’est pas respecté.',
          majority: 'SIMPLE',
          result: 'APPROVED',
          abstain: ['bamba_souleymane']
        },
        {
          title: 'Renouvellement du conseil syndical',
          description: 'Sont élus : Dr Fatoumata Diallo (présidente), M. Hervé Koffi N’Guessan, Mme Akouvi Mensah.',
          majority: 'SIMPLE',
          result: 'APPROVED'
        }
      ],
      agendaExtra: [
        {
          title: 'Questions diverses',
          discussions: [
            'Bilan de la vidéosurveillance : aucun incident de sécurité depuis janvier 2026.',
            'Demande d’installation de bornes de recharge au parking (à étudier).'
          ]
        }
      ],
      discussions: [
        [],
        [
          'Exercice 2025 : {{charges:2025}} de charges courantes pour {{budgetCourant:2025}} ({{ecart:2025}}), hors travaux votés.'
        ],
        [],
        ['Le budget passe de 12 200 000 à 12 800 000 F CFA.'],
        ['Pannes répétées lors des délestages ; trois devis seront présentés en AGE.'],
        ['Arriérés du lot C02 : {{solde:C02:2026-05-30}} au jour de l’assemblée, malgré deux échéanciers accordés.'],
        []
      ]
    },
    {
      key: 'AGE2026',
      type: 'EXTRAORDINARY',
      date: d(2026, 11, 14, 10, 0),
      location: hall,
      status: 'PLANNED',
      absent: [],
      proxies: [],
      resolutions: [
        {
          title: "Choix de l'entreprise pour le remplacement du groupe électrogène",
          description: 'Trois devis reçus : Électro-Power Services, Sotelec Services, Energy Plus CI.',
          majority: 'ABSOLUE',
          result: null
        },
        {
          title: 'Modalités de financement du remplacement du groupe électrogène',
          description: 'Appel de fonds exceptionnel complété par un prélèvement sur le fonds de travaux.',
          majority: 'ABSOLUE',
          result: null
        }
      ],
      agendaExtra: [
        { title: 'Calendrier des travaux et coupures programmées', discussions: [] },
        { title: 'Questions diverses', discussions: [] }
      ],
      discussions: [[], []]
    }
  ];

  const contracts: ContractDef[] = [
    {
      key: 'c_vig',
      supplier: 'VIG',
      nature: 'Gardiennage 24h/24 — 2 agents en rotation',
      start: d(2023, 1, 1),
      end: d(2025, 12, 31),
      annual: 3120000,
      status: 'EXPIRED',
      alertDays: 60
    },
    {
      key: 'c_sig',
      supplier: 'SIG',
      nature: 'Gardiennage 24h/24 (3 agents) et vidéosurveillance (8 caméras)',
      start: d(2026, 1, 1),
      end: d(2026, 12, 31),
      annual: 3960000,
      status: 'ACTIVE',
      alertDays: 60,
      lineCode: 'GARD'
    },
    {
      key: 'c_cle',
      supplier: 'CLE',
      nature: 'Nettoyage des parties communes, 6 jours sur 7',
      start: d(2023, 1, 1),
      end: d(2026, 12, 31),
      annual: 1260000,
      status: 'ACTIVE',
      alertDays: 45,
      lineCode: 'NETT'
    },
    {
      key: 'c_etc',
      supplier: 'ETC',
      nature: "Entretien simple de l'ascenseur (visites mensuelles)",
      start: d(2021, 1, 1),
      end: d(2023, 12, 31),
      annual: 720000,
      status: 'TERMINATED',
      alertDays: 30
    },
    {
      key: 'c_alm',
      supplier: 'ALM',
      nature: "Maintenance complète de l'ascenseur (pièces, main-d'œuvre, astreinte 24h/24)",
      start: d(2024, 1, 1),
      end: d(2026, 12, 31),
      annual: 1160000,
      status: 'ACTIVE',
      alertDays: 90,
      lineCode: 'ASC'
    },
    {
      key: 'c_elp',
      supplier: 'ELP',
      nature: 'Maintenance du groupe électrogène 100 kVA et du surpresseur (visites trimestrielles)',
      start: d(2023, 11, 1),
      end: d(2026, 10, 31),
      annual: 680000,
      status: 'ACTIVE',
      alertDays: 60,
      lineCode: 'GE'
    },
    {
      key: 'c_jar',
      supplier: 'JAR',
      nature: 'Entretien des espaces verts (2 passages par mois)',
      start: d(2023, 1, 1),
      end: d(2026, 12, 31),
      annual: 360000,
      status: 'ACTIVE',
      alertDays: 30,
      lineCode: 'JARD'
    },
    {
      key: 'c_hyg',
      supplier: 'HYG',
      nature: 'Désinsectisation et dératisation (4 passages par an)',
      start: d(2024, 1, 1),
      end: d(2026, 12, 31),
      annual: 280000,
      status: 'ACTIVE',
      alertDays: 30,
      lineCode: 'DESI'
    },
    {
      key: 'c_asa',
      supplier: 'ASA',
      nature: 'Assurance multirisque immeuble — police MRI-2026-004517',
      start: d(2026, 1, 1),
      end: d(2026, 12, 31),
      annual: 520000,
      status: 'ACTIVE',
      alertDays: 45,
      lineCode: 'ASSU'
    },
    {
      key: 'c_ebi',
      supplier: 'EBI',
      nature: 'Marché de travaux : étanchéité de la toiture-terrasse et ravalement des façades (forfait)',
      start: d(2025, 5, 5),
      end: d(2025, 10, 31),
      annual: 14500000,
      status: 'EXPIRED',
      alertDays: 30
    }
  ];

  const incidents: IncidentDef[] = [
    {
      type: 'BREAKDOWN',
      urgency: 'HIGH',
      status: 'CLOSED',
      reportedAt: d(2023, 3, 10, 19, 20),
      resolvedAt: d(2023, 3, 11, 11),
      reporter: 'koffi_herve',
      asset: 'asc',
      provider: 'ETC',
      description: "Ascenseur bloqué entre le 2e et le 3e étage, deux occupants dégagés par l'astreinte."
    },
    {
      type: 'BREAKDOWN',
      urgency: 'CRITICAL',
      status: 'CLOSED',
      reportedAt: d(2023, 11, 6, 8, 15),
      resolvedAt: d(2023, 11, 18, 16),
      reporter: 'ahoua_jeanmarc',
      asset: 'asc',
      provider: 'ETC',
      description: "Panne de la carte électronique de l'ascenseur : arrêt de 12 jours, pièce importée.",
      costs: [
        {
          type: 'SYNDICATE_BUDGET',
          amount: 780000,
          supplier: 'ETC',
          contract: 'c_etc',
          notes: 'Pièce hors contrat simple (carte de manœuvre) et main-d’œuvre.'
        }
      ]
    },
    {
      type: 'LEAK',
      urgency: 'HIGH',
      status: 'CLOSED',
      reportedAt: d(2024, 4, 18, 7, 40),
      resolvedAt: d(2024, 4, 22, 15),
      reporter: 'bamba_souleymane',
      lot: 'A21',
      provider: 'SOT',
      description:
        'Fuite sur la colonne montante d’eau froide (gaine palière du 2e étage) : dégât des eaux dans le lot A21.',
      costs: [
        {
          type: 'INSURANCE',
          amount: 700000,
          supplier: 'SOT',
          notes: 'Sinistre dégât des eaux pris en charge par la police multirisque (dossier ACA-24-1187).',
          reimbursedAt: d(2024, 7, 10, 11)
        },
        {
          type: 'SYNDICATE_BUDGET',
          amount: 150000,
          supplier: 'SOT',
          notes: 'Franchise contractuelle restée à la charge du syndicat.'
        }
      ]
    },
    {
      type: 'LEAK',
      urgency: 'HIGH',
      status: 'CLOSED',
      reportedAt: d(2024, 9, 2, 9),
      resolvedAt: d(2025, 10, 30, 16),
      reporter: 'ahoua_jeanmarc',
      lot: 'A42',
      asset: 'toit',
      provider: 'EBI',
      description:
        'Infiltrations au plafond du duplex A42 après de fortes pluies : étanchéité de la toiture-terrasse dégradée. Traitée par les travaux votés en AGE du 22/02/2025.'
    },
    {
      type: 'VANDALISM',
      urgency: 'MEDIUM',
      status: 'CLOSED',
      reportedAt: d(2024, 12, 14, 8),
      resolvedAt: d(2024, 12, 20, 14),
      reporter: 'diallo_fatoumata',
      provider: 'SOT',
      description: 'Boîtes aux lettres du hall forcées pendant la nuit ; serrures et portillons à remplacer.',
      costs: [
        {
          type: 'SYNDICATE_BUDGET',
          amount: 120000,
          supplier: 'DIV',
          notes: 'Remplacement de 6 serrures et 2 portillons.'
        }
      ]
    },
    {
      type: 'BREAKDOWN',
      urgency: 'HIGH',
      status: 'RESOLVED',
      reportedAt: d(2025, 6, 9, 6, 30),
      resolvedAt: d(2025, 6, 10, 12),
      reporter: 'mensah_akouvi',
      asset: 'surp',
      provider: 'ELP',
      description: 'Surpresseur en défaut : pression d’eau insuffisante à partir du 3e étage.',
      costs: [
        {
          type: 'SYNDICATE_BUDGET',
          amount: 95000,
          supplier: 'ELP',
          contract: 'c_elp',
          notes: 'Remplacement du pressostat (pièce hors forfait).'
        }
      ]
    },
    {
      type: 'OTHER',
      urgency: 'MEDIUM',
      status: 'RESOLVED',
      reportedAt: d(2025, 9, 15, 18),
      resolvedAt: d(2025, 9, 17, 11),
      reporter: 'bamba_mariam',
      lot: 'A31',
      description: "Fuite sous l'évier du lot A31 infiltrant le plafond de la cuisine du lot A21.",
      costs: [
        {
          type: 'LOT_OWNER',
          amount: 65000,
          lot: 'A31',
          notes: 'Réparation privative réglée directement par le copropriétaire du lot A31 au plombier.'
        }
      ],
      ticket: {
        title: 'Fuite privative A31 → plafond A21',
        category: 'PLUMBING',
        priority: 'MEDIUM',
        status: 'RESOLVED',
        location: '3e étage, lot A31 — cuisine',
        resolution: 'Siphon et flexible remplacés par le plombier du copropriétaire.',
        imputation: 'LOT_OWNER'
      }
    },
    {
      type: 'SAFETY',
      urgency: 'HIGH',
      status: 'RESOLVED',
      reportedAt: d(2026, 3, 3, 21, 10),
      resolvedAt: d(2026, 3, 5, 10),
      reporter: 'ahoua_jeanmarc',
      asset: 'portail',
      provider: 'SOT',
      description: 'Portail motorisé du parking bloqué en position ouverte (carte de commande grillée).',
      costs: [
        { type: 'SYNDICATE_BUDGET', amount: 210000, supplier: 'SOT', notes: 'Carte de commande et télécommandes.' }
      ]
    },
    {
      type: 'BREAKDOWN',
      urgency: 'CRITICAL',
      status: 'IN_PROGRESS',
      reportedAt: d(2026, 8, 18, 20, 5),
      reporter: 'koffi_herve',
      asset: 'ge',
      provider: 'ELP',
      description:
        'Groupe électrogène : le démarrage automatique ne se déclenche plus lors des délestages ; ascenseur et surpresseur à l’arrêt pendant les coupures.',
      ticket: {
        title: 'Groupe électrogène — démarrage automatique défaillant',
        category: 'ELECTRICITY',
        priority: 'URGENT',
        status: 'IN_PROGRESS',
        location: 'Local technique du sous-sol',
        imputation: 'SYNDICATE'
      }
    },
    {
      type: 'OTHER',
      urgency: 'MEDIUM',
      status: 'ASSIGNED',
      reportedAt: d(2026, 9, 12, 9),
      reporter: 'diallo_fatoumata',
      provider: 'HYG',
      description: 'Présence de cafards dans les gaines techniques et le local poubelles.',
      ticket: {
        title: 'Cafards — gaines techniques et local poubelles',
        category: 'OTHER',
        priority: 'MEDIUM',
        status: 'ASSIGNED',
        location: 'Gaines techniques (tous étages) et local poubelles',
        imputation: 'SYNDICATE'
      }
    },
    {
      type: 'SAFETY',
      urgency: 'MEDIUM',
      status: 'REPORTED',
      reportedAt: d(2026, 9, 22, 19, 45),
      reporter: 'mensah_akouvi',
      asset: 'eclair',
      description: 'Éclairage du parking du sous-sol hors service (3 projecteurs sur 5).',
      ticket: {
        title: 'Éclairage du parking hors service',
        category: 'ELECTRICITY',
        priority: 'MEDIUM',
        status: 'DECLARED',
        location: 'Sous-sol — parking',
        imputation: 'SYNDICATE'
      }
    }
  ];

  const documents: DocumentDef[] = [
    {
      title: 'Règlement de copropriété et état descriptif de division',
      type: 'REGULATION',
      date: d(2023, 1, 9),
      body: [
        'Règlement de copropriété établi le 12/02/2019 par Maître Adjoua N’Dri, notaire à Abidjan.',
        'État descriptif de division : 15 lots (2 commerces, 8 appartements, 1 cave, 4 parkings), 1 000 tantièmes généraux.',
        'Charges spéciales d’ascenseur réparties entre les seuls appartements (1 000 tantièmes spéciaux).',
        'Pénalité de retard : 1,5 % par mois après mise en demeure restée sans effet.'
      ]
    },
    {
      title: 'Passation de gestion — procès-verbal de reprise des archives',
      type: 'OTHER',
      date: d(2023, 1, 12),
      body: [
        'Remise des archives par le syndic sortant au 01/01/2023.',
        'Soldes repris : banque 4 000 000 F CFA ; fonds de roulement 1 600 000 F CFA ; fonds de travaux 2 400 000 F CFA.'
      ]
    },
    {
      title: 'Procès-verbal — AG ordinaire du 17/06/2023',
      type: 'GENERAL_MEETING_MINUTES',
      date: d(2023, 6, 26),
      meeting: 'AGO2023',
      body: []
    },
    {
      title: 'Procès-verbal — AG ordinaire du 25/05/2024',
      type: 'GENERAL_MEETING_MINUTES',
      date: d(2024, 6, 3),
      meeting: 'AGO2024',
      body: []
    },
    {
      title: "Rapport de diagnostic d'étanchéité de la toiture-terrasse",
      type: 'DIAGNOSTIC',
      date: d(2024, 9, 27),
      body: [
        "Bureau d'études Ivoire Structures — visite du 18/09/2024.",
        'Relevés d’étanchéité décollés sur 40 % du périmètre, fissures en façade nord.',
        'Préconisation : réfection complète de l’étanchéité et ravalement des façades sous 12 mois.'
      ]
    },
    {
      title: 'Procès-verbal — AG extraordinaire du 22/02/2025 (travaux)',
      type: 'GENERAL_MEETING_MINUTES',
      date: d(2025, 3, 3),
      meeting: 'AGE2025',
      body: []
    },
    {
      title: 'Procès-verbal — AG ordinaire du 24/05/2025',
      type: 'GENERAL_MEETING_MINUTES',
      date: d(2025, 6, 2),
      meeting: 'AGO2025',
      body: []
    },
    {
      title: 'Procès-verbal de réception des travaux d’étanchéité et de ravalement',
      type: 'OTHER',
      date: d(2025, 10, 31),
      body: [
        'Réception prononcée sans réserve le 30/10/2025 en présence du conseil syndical.',
        'Garantie décennale EBI — police n° RCD-2025-0932.'
      ]
    },
    {
      title: 'Attestation d’assurance multirisque immeuble 2025',
      type: 'INSURANCE',
      date: d(2025, 1, 6),
      expiresAt: d(2025, 12, 31, 23, 59),
      body: [
        'Atlantique Courtage Assurances — police MRI-2025-003981.',
        'Période de garantie : 01/01/2025 – 31/12/2025.'
      ]
    },
    {
      title: 'Attestation d’assurance multirisque immeuble 2026',
      type: 'INSURANCE',
      date: d(2026, 1, 5),
      expiresAt: d(2026, 12, 31, 23, 59),
      body: [
        'Atlantique Courtage Assurances — police MRI-2026-004517.',
        'Période de garantie : 01/01/2026 – 31/12/2026.'
      ]
    },
    {
      title: 'Budget prévisionnel 2026 (voté le 24/05/2025)',
      type: 'BUDGET',
      date: d(2025, 6, 2),
      body: []
    },
    {
      title: 'Procès-verbal — AG ordinaire du 30/05/2026',
      type: 'GENERAL_MEETING_MINUTES',
      date: d(2026, 6, 8),
      meeting: 'AGO2026',
      body: []
    },
    {
      title: 'Budget prévisionnel 2027 (voté le 30/05/2026)',
      type: 'BUDGET',
      date: d(2026, 6, 8),
      body: []
    },
    {
      title: "Rapport de contrôle technique de l'ascenseur 2026",
      type: 'DIAGNOSTIC',
      date: d(2026, 3, 18),
      expiresAt: d(2027, 3, 17),
      body: ['Contrôle périodique réalisé le 16/03/2026 : appareil conforme, 2 observations mineures levées.']
    },
    {
      title: 'Contrat de gardiennage et vidéosurveillance — Groupe SIGMA Sécurité',
      type: 'OTHER',
      date: d(2025, 12, 15),
      expiresAt: d(2026, 12, 31, 23, 59),
      body: ['Contrat du 01/01/2026 au 31/12/2026, 3 960 000 F CFA TTC par an, reconductible.']
    }
  ];

  return {
    id: SYNDIC_PERLES_ID,
    code: 'PERLES-RIVIERA',
    name: 'Résidence Les Perles de la Riviera',
    address: 'Riviera 3, rue des Jardins, lot 1245 îlot 97, Cocody — Abidjan',
    registrationNo: 'CI-ABJ-COP-2019-0231',
    cadastral: 'TF n° 142 857 — Circonscription foncière de Bingerville (Cocody Riviera 3)',
    buildings: 1,
    manager: 'kouadio_estelle',
    managementStart: d(2023, 1, 1),
    property: {
      id: PROPERTY_PERLES_ID,
      reference: 'SYND-PERLES-RIVIERA',
      title: 'Immeuble R+5 « Les Perles de la Riviera » — Cocody Riviera 3',
      description:
        'Immeuble résidentiel R+5 livré en 2019 : 2 commerces en rez-de-chaussée sur rue, 8 appartements du F2 au duplex F5, sous-sol avec 4 places de parking et une cave. Ascenseur, groupe électrogène, surpresseur, gardiennage 24h/24 et vidéosurveillance. Géré en copropriété par Ivoire Résidences depuis le 01/01/2023.',
      address: 'Riviera 3, rue des Jardins, lot 1245 îlot 97, Cocody — Abidjan',
      zone: 'Cocody Riviera 3',
      commune: 'Cocody',
      surface: 1180,
      floors: 6,
      units: 10,
      parkings: 4,
      elevator: true,
      createdAt: d(2023, 1, 5)
    },
    contacts: contactsPerles(),
    lots,
    totalShares: 1000,
    suppliers,
    lines,
    budgets,
    exceptional: [
      {
        period: '2025-TRAV1',
        label: 'Appel exceptionnel travaux d’étanchéité et ravalement — 1/2',
        issue: d(2025, 3, 10),
        due: d(2025, 4, 30),
        amount: 6250000,
        account: '702'
      },
      {
        period: '2025-TRAV2',
        label: 'Appel exceptionnel travaux d’étanchéité et ravalement — 2/2',
        issue: d(2025, 6, 16),
        due: d(2025, 7, 31),
        amount: 6250000,
        account: '702'
      }
    ],
    years: [2023, 2024, 2025, 2026],
    opening: {
      date: d(2023, 1, 1, 8),
      label: 'Reprise des soldes au 01/01/2023 (passation de gestion)',
      bank: 4000000,
      roulement: 1600000,
      travaux: 2400000
    },
    meetings,
    contracts,
    assets: [
      {
        key: 'asc',
        name: 'Ascenseur 630 kg — 8 personnes (R+5)',
        category: 'Ascenseur',
        last: d(2026, 9, 2),
        next: d(2026, 12, 2),
        notes: 'Contrat de maintenance complète ALM ; contrôle technique annuel en mars.'
      },
      {
        key: 'ge',
        name: 'Groupe électrogène 100 kVA (secours ascenseur, surpresseur, éclairage)',
        category: 'Énergie',
        last: d(2026, 6, 18),
        next: d(2026, 9, 30),
        notes: 'Mis en service en 2012 — remplacement décidé en principe par l’AG du 30/05/2026.'
      },
      {
        key: 'surp',
        name: 'Surpresseur et bâche à eau de 15 m³',
        category: 'Eau',
        last: d(2026, 6, 18),
        next: d(2026, 9, 30),
        notes: 'Surpresseur remplacé en août 2024 (fonds de travaux).'
      },
      {
        key: 'portail',
        name: 'Portail motorisé du parking',
        category: 'Accès',
        last: d(2026, 3, 5),
        next: d(2027, 3, 5),
        notes: 'Carte de commande remplacée en mars 2026.'
      },
      {
        key: 'video',
        name: 'Vidéosurveillance — 8 caméras et enregistreur',
        category: 'Sécurité',
        last: d(2026, 1, 15),
        next: d(2026, 10, 15),
        notes: 'Installée par Groupe SIGMA en janvier 2026, incluse au contrat de gardiennage.'
      },
      {
        key: 'toit',
        name: 'Toiture-terrasse (étanchéité refaite en 2025)',
        category: 'Clos et couvert',
        last: d(2025, 10, 30),
        next: d(2026, 10, 30),
        notes: 'Garantie décennale EBI jusqu’au 30/10/2035. Visite annuelle avant la saison des pluies.'
      },
      {
        key: 'jardin',
        name: 'Espaces verts et arrosage automatique',
        category: 'Espaces verts',
        last: d(2026, 9, 15),
        next: d(2026, 9, 29),
        notes: 'Deux passages par mois.'
      },
      {
        key: 'eclair',
        name: 'Éclairage des parties communes et du parking',
        category: 'Électricité',
        last: d(2026, 3, 5),
        next: d(2026, 12, 1),
        notes: 'Passage aux LED des paliers en 2024.'
      }
    ],
    incidents,
    specialInvoices: [
      {
        date: d(2024, 8, 20),
        payDate: d(2024, 9, 2),
        supplier: 'ELP',
        account: '671',
        amount: 1350000,
        label: 'Remplacement du surpresseur (AG du 25/05/2024)'
      },
      {
        date: d(2024, 9, 27),
        payDate: d(2024, 10, 8),
        supplier: 'BEI',
        account: '615',
        lineCode: 'TRAV',
        amount: 450000,
        label: "Diagnostic d'étanchéité de la toiture-terrasse"
      },
      {
        date: d(2025, 5, 12),
        payDate: d(2025, 5, 15),
        supplier: 'EBI',
        account: '671',
        amount: 5800000,
        label: 'Travaux d’étanchéité et ravalement — acompte 40 %'
      },
      {
        date: d(2025, 8, 18),
        payDate: d(2025, 8, 28),
        supplier: 'EBI',
        account: '671',
        amount: 5800000,
        label: 'Travaux d’étanchéité et ravalement — situation n° 2 (40 %)'
      },
      {
        date: d(2025, 10, 30),
        payDate: d(2025, 11, 12),
        supplier: 'EBI',
        account: '671',
        amount: 2900000,
        label: 'Travaux d’étanchéité et ravalement — solde 20 % après réception'
      }
    ],
    fundTransfers: [
      {
        date: d(2024, 8, 20, 12),
        amount: 1350000,
        label: 'Financement du remplacement du surpresseur par le fonds de travaux'
      },
      {
        date: d(2025, 10, 30, 12),
        amount: 2000000,
        label: 'Quote-part du fonds de travaux affectée aux travaux d’étanchéité'
      }
    ],
    schedules: [
      {
        lot: 'C02',
        period: '2025-T2',
        agreedAt: d(2026, 1, 20),
        status: 'COMPLETED',
        instalments: [
          { due: d(2026, 2, 28), paidAt: d(2026, 2, 26, 11) },
          { due: d(2026, 3, 31), paidAt: d(2026, 3, 30, 15) },
          { due: d(2026, 4, 30), paidAt: d(2026, 5, 8, 10) },
          { due: d(2026, 5, 31), paidAt: d(2026, 5, 29, 16) }
        ]
      },
      {
        lot: 'C02',
        period: '2025-T3',
        agreedAt: d(2026, 5, 25),
        status: 'ACTIVE',
        instalments: [
          { due: d(2026, 6, 30), paidAt: d(2026, 6, 29, 12) },
          { due: d(2026, 7, 31), paidAt: d(2026, 7, 30, 17) },
          { due: d(2026, 8, 31) },
          { due: d(2026, 9, 30) }
        ]
      },
      {
        lot: 'A41',
        period: '2024-T1',
        agreedAt: d(2024, 4, 5),
        status: 'DEFAULTED',
        instalments: [
          { due: d(2024, 4, 30), paidAt: d(2024, 4, 29, 18) },
          { due: d(2024, 5, 31) },
          { due: d(2024, 6, 30) }
        ]
      }
    ],
    overrides: {
      'C02|2025-T2': [],
      'C02|2025-T3': [],
      'C02|2025-T4': [],
      'C02|2025-TRAV1': [{ date: d(2025, 6, 20, 12), frac: 1 }],
      'C02|2025-TRAV2': [],
      'C02|2026-T1': [{ date: d(2026, 4, 10, 11), frac: 1 }],
      'C02|2026-T2': [{ date: d(2026, 6, 20, 10), frac: 0.5 }],
      'C02|2026-T3': [],
      'A11|2026-T1': [{ date: d(2026, 2, 18, 13), frac: 0.6 }],
      'A11|2026-T2': [{ date: d(2026, 5, 22, 9), frac: 0.4 }],
      'A11|2026-T3': [],
      'A41|2024-T1': [{ date: d(2024, 9, 12, 10), rest: true, method: 'VIREMENT' }],
      'A41|2026-T3': [],
      'A31|2024-T3': [{ date: d(2024, 8, 9, 12), frac: 1 }],
      'P02|2024-T3': [{ date: d(2024, 8, 9, 12), frac: 1 }]
    },
    waivers: {
      'C02|2025-T2': {
        date: d(2026, 1, 20, 12),
        reason: 'Remise accordée par le conseil syndical en contrepartie de l’échéancier signé le 20/01/2026'
      }
    },
    waiveFirstPenalty: ['traore_moussa', 'kouassi_yao'],
    documents,
    bank: { name: "Ecobank Côte d'Ivoire — agence Riviera 3", iban: 'CI93 CI059 01023 121045670012 38' },
    mobileNumbers: { orange: '+225 07 07 45 12 31', mtn: '+225 05 05 45 12 31', wave: '+225 07 07 45 12 31' }
  };
}

// ═══════════════════════════════════════════════════════════════ copropriété 2 — Les Jardins d'Angré

interface PersonSeed {
  key: string;
  civ: 'MR' | 'MRS' | 'MS' | 'DR';
  first: string;
  last: string;
  job: string;
  nat?: string;
  profile: Profile;
  methods: Method[];
  channel: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'SMS';
  address?: string;
}

function phoneFor(key: string): string {
  const r = mulberry32(hash(`tel|${key}`));
  const prefix = ['07', '05', '01'][rint(r, 0, 2)];
  let digits = '';
  for (let i = 0; i < 8; i++) digits += String(rint(r, 0, 9));
  return `+225${prefix}${digits}`;
}
function emailFor(first: string, last: string, suffix: string): string {
  return `${slug(first).replace(/-/g, '')}.${slug(last).replace(/-/g, '')}.${suffix}@example.ci`;
}

function defJardins(): CoproDef {
  const tag = `${SEED_TAG} Résidence Les Jardins d'Angré`;
  const persons: PersonSeed[] = [
    {
      key: 'ake_christelle',
      civ: 'MRS',
      first: 'Christelle',
      last: "Aké-N'Dri",
      job: 'Magistrate',
      profile: 'ponctuel',
      methods: ['VIREMENT'],
      channel: 'EMAIL'
    },
    {
      key: 'yapo_arsene',
      civ: 'MR',
      first: 'Arsène',
      last: 'Yapo',
      job: 'Fonctionnaire (ministère des Finances)',
      profile: 'normal',
      methods: ['ORANGE', 'ESPECES'],
      channel: 'SMS'
    },
    {
      key: 'coulibaly_drissa',
      civ: 'MR',
      first: 'Drissa',
      last: 'Coulibaly',
      job: 'Transitaire',
      profile: 'normal',
      methods: ['WAVE'],
      channel: 'WHATSAPP'
    },
    {
      key: 'assi_nadege',
      civ: 'DR',
      first: 'Nadège',
      last: 'Assi',
      job: 'Chirurgienne-dentiste',
      profile: 'ponctuel',
      methods: ['VIREMENT', 'WAVE'],
      channel: 'EMAIL'
    },
    {
      key: 'diarra_oumar',
      civ: 'MR',
      first: 'Oumar',
      last: 'Diarra',
      job: 'Ingénieur télécoms (Paris)',
      nat: 'Malienne',
      profile: 'retardataire',
      methods: ['VIREMENT'],
      channel: 'WHATSAPP',
      address: 'Paris 13e, France'
    },
    {
      key: 'konan_bertin',
      civ: 'MR',
      first: 'Bertin',
      last: 'Kouamé Konan',
      job: 'Directeur commercial',
      profile: 'ponctuel',
      methods: ['VIREMENT'],
      channel: 'EMAIL'
    },
    {
      key: 'fofana_salimata',
      civ: 'MRS',
      first: 'Salimata',
      last: 'Fofana',
      job: 'Infirmière',
      profile: 'normal',
      methods: ['ORANGE'],
      channel: 'WHATSAPP'
    },
    {
      key: 'owusu_kofi',
      civ: 'MR',
      first: 'Kofi',
      last: 'Owusu',
      job: 'Négociant en cacao (Accra)',
      nat: 'Ghanéenne',
      profile: 'normal',
      methods: ['VIREMENT'],
      channel: 'EMAIL',
      address: 'Accra, East Legon'
    },
    {
      key: 'zadi_gilbert',
      civ: 'MR',
      first: 'Gilbert',
      last: 'Zadi',
      job: 'Entrepreneur',
      profile: 'lent',
      methods: ['ESPECES'],
      channel: 'CALL'
    },
    {
      key: 'dago_prisca',
      civ: 'MS',
      first: 'Prisca',
      last: 'Dago',
      job: 'Chargée de communication',
      profile: 'lent',
      methods: ['MTN'],
      channel: 'WHATSAPP'
    },
    {
      key: 'soro_siaka',
      civ: 'MR',
      first: 'Siaka',
      last: 'Soro',
      job: 'Professeur de lycée',
      profile: 'ponctuel',
      methods: ['MTN', 'ESPECES'],
      channel: 'SMS'
    },
    {
      key: 'ouattara_lassina',
      civ: 'MR',
      first: 'Lassina',
      last: 'Ouattara',
      job: 'Commerçant (bailleur)',
      profile: 'normal',
      methods: ['ORANGE', 'VIREMENT'],
      channel: 'WHATSAPP'
    },
    {
      key: 'kouadio_amenan',
      civ: 'MRS',
      first: 'Amenan',
      last: 'Kouadio',
      job: 'Retraitée de l’enseignement',
      profile: 'normal',
      methods: ['ESPECES', 'CHEQUE'],
      channel: 'CALL'
    },
    {
      key: 'houngbedji_pascal',
      civ: 'MR',
      first: 'Pascal',
      last: 'Houngbédji',
      job: 'Expert-comptable',
      nat: 'Béninoise',
      profile: 'ponctuel',
      methods: ['VIREMENT'],
      channel: 'EMAIL'
    },
    {
      key: 'sawadogo_adama',
      civ: 'MR',
      first: 'Adama',
      last: 'Sawadogo',
      job: 'Chauffeur-transporteur',
      nat: 'Burkinabè',
      profile: 'lent',
      methods: ['ORANGE'],
      channel: 'WHATSAPP'
    },
    {
      key: 'brou_ahou',
      civ: 'MRS',
      first: 'Ahou',
      last: 'Brou',
      job: 'Couturière',
      profile: 'normal',
      methods: ['WAVE', 'ESPECES'],
      channel: 'WHATSAPP'
    },
    {
      key: 'ndiaye_mamadou',
      civ: 'MR',
      first: 'Mamadou',
      last: 'Ndiaye',
      job: 'Cadre dans une banque régionale',
      nat: 'Sénégalaise',
      profile: 'ponctuel',
      methods: ['VIREMENT'],
      channel: 'EMAIL'
    },
    {
      key: 'seri_hyacinthe',
      civ: 'MR',
      first: 'Hyacinthe',
      last: 'Séri',
      job: 'Pharmacien',
      profile: 'normal',
      methods: ['CHEQUE', 'VIREMENT'],
      channel: 'EMAIL'
    },
    {
      key: 'sylla_fatou',
      civ: 'MRS',
      first: 'Fatou',
      last: 'Sylla',
      job: 'Assistante de direction',
      profile: 'normal',
      methods: ['WAVE'],
      channel: 'SMS'
    },
    {
      key: 'tape_eric',
      civ: 'MR',
      first: 'Éric',
      last: 'Tapé',
      job: 'Technicien en froid et climatisation',
      profile: 'lent',
      methods: ['MTN', 'ESPECES'],
      channel: 'WHATSAPP'
    },
    {
      key: 'achi_yves',
      civ: 'MR',
      first: 'Yves',
      last: 'Achi',
      job: 'Avocat au barreau d’Abidjan',
      profile: 'ponctuel',
      methods: ['CHEQUE', 'VIREMENT'],
      channel: 'EMAIL'
    },
    {
      key: 'mobio_carine',
      civ: 'MRS',
      first: 'Carine',
      last: 'Mobio',
      job: 'Restauratrice',
      profile: 'lent',
      methods: ['ORANGE', 'ESPECES'],
      channel: 'WHATSAPP'
    },
    {
      key: 'diabate_bakary',
      civ: 'MR',
      first: 'Bakary',
      last: 'Diabaté',
      job: 'Agent immobilier',
      profile: 'normal',
      methods: ['WAVE'],
      channel: 'WHATSAPP'
    },
    {
      key: 'guehi_rodrigue',
      civ: 'MR',
      first: 'Rodrigue',
      last: 'Guéhi',
      job: 'Développeur informatique',
      profile: 'normal',
      methods: ['WAVE', 'ORANGE'],
      channel: 'EMAIL'
    },
    {
      key: 'cisse_ousmane',
      civ: 'MR',
      first: 'Ousmane',
      last: 'Cissé',
      job: 'Imam et commerçant',
      profile: 'normal',
      methods: ['ESPECES'],
      channel: 'CALL'
    },
    {
      key: 'nando_edwige',
      civ: 'MRS',
      first: 'Edwige',
      last: 'Nando',
      job: 'Contrôleuse de gestion',
      profile: 'normal',
      methods: ['VIREMENT', 'MTN'],
      channel: 'EMAIL'
    },
    {
      key: 'agbodjan_kwame',
      civ: 'MR',
      first: 'Kwamé',
      last: 'Agbodjan',
      job: 'Architecte',
      nat: 'Togolaise',
      profile: 'ponctuel',
      methods: ['VIREMENT'],
      channel: 'EMAIL'
    },
    {
      key: 'dosso_mariam',
      civ: 'MRS',
      first: 'Mariam',
      last: 'Dosso',
      job: 'Sage-femme',
      profile: 'normal',
      methods: ['ORANGE'],
      channel: 'SMS'
    },
    {
      key: 'adjoumani_theodore',
      civ: 'MR',
      first: 'Théodore',
      last: 'Adjoumani',
      job: 'Colonel à la retraite',
      profile: 'ponctuel',
      methods: ['CHEQUE'],
      channel: 'CALL'
    },
    {
      key: 'kabore_rachelle',
      civ: 'MRS',
      first: 'Rachelle',
      last: 'Kaboré',
      job: 'Commerçante',
      nat: 'Burkinabè',
      profile: 'normal',
      methods: ['MTN'],
      channel: 'WHATSAPP'
    },
    {
      key: 'yapi_rosine',
      civ: 'MRS',
      first: 'Rosine',
      last: 'Yapi',
      job: 'Gérante de pressing (lot M02)',
      profile: 'normal',
      methods: ['ORANGE', 'ESPECES'],
      channel: 'WHATSAPP'
    },
    {
      key: 'kacou_arnaud',
      civ: 'MR',
      first: 'Arnaud',
      last: 'Kacou',
      job: 'Cadre commercial',
      profile: 'normal',
      methods: ['VIREMENT'],
      channel: 'EMAIL'
    }
  ];

  const contacts: ContactDef[] = [
    {
      key: 'aboa_hermann',
      civility: 'MR',
      firstName: 'Hermann',
      lastName: 'Aboa',
      email: 'hermann.aboa.syndic@example.ci',
      phone: '+2250709453317',
      profession: 'Gestionnaire de copropriété — Ivoire Résidences',
      district: 'Cocody',
      channel: 'EMAIL',
      note: `${tag} — gestionnaire de la copropriété`
    },
    ...persons.map<ContactDef>(p => ({
      key: p.key,
      civility: p.civ,
      firstName: p.first,
      lastName: p.last,
      email: emailFor(p.first, p.last, 'angre'),
      phone: phoneFor(p.key),
      profession: p.job,
      nationality: p.nat,
      address: p.address,
      district: p.address ? undefined : 'Cocody Angré',
      city: p.address ? undefined : 'Abidjan',
      channel: p.channel,
      role: 'COOWNER',
      roleEndedAt: p.key === 'kacou_arnaud' ? d(2025, 11, 30) : undefined,
      profile: p.profile,
      methods: p.methods,
      note:
        p.key === 'kacou_arnaud'
          ? `${tag} — ancien propriétaire du lot B10 (vendu le 30/11/2025)`
          : `${tag} — copropriétaire`
    })),
    {
      key: 'sci_cocotiers',
      company: {
        legalName: 'SCI Les Cocotiers',
        legalForm: 'OTHER',
        rccm: 'CI-ABJ-2019-B-08812',
        rep: 'Mme Géraldine Kassi',
        repRole: 'Cogérante'
      },
      firstName: 'SCI',
      lastName: 'Les Cocotiers',
      email: 'gestion.sci-lescocotiers@example.ci',
      phone: '+2252722519043',
      profession: 'Société civile immobilière (bailleur de 3 appartements)',
      district: 'Cocody II Plateaux',
      channel: 'EMAIL',
      role: 'COOWNER',
      profile: 'lent',
      methods: ['VIREMENT', 'CHEQUE'],
      note: `${tag} — lots A03, A07, B11, P02`
    },
    {
      key: 'sci_amani',
      company: {
        legalName: 'SCI Famille Amani',
        legalForm: 'OTHER',
        rccm: 'CI-ABJ-2020-B-11476',
        rep: 'M. Paul Amani',
        repRole: 'Gérant'
      },
      firstName: 'SCI',
      lastName: 'Famille Amani',
      email: 'contact.sci-famille-amani@example.ci',
      phone: '+2250707228815',
      profession: 'Société civile immobilière familiale',
      district: 'Marcory Zone 4',
      channel: 'EMAIL',
      role: 'COOWNER',
      profile: 'ponctuel',
      methods: ['VIREMENT'],
      note: `${tag} — lots C05, C06, P09`
    },
    {
      key: 'kanga_distribution',
      company: {
        legalName: 'Kanga Distribution SARL',
        legalForm: 'SARL',
        rccm: 'CI-ABJ-2021-B-30455',
        rep: 'M. Firmin Kanga',
        repRole: 'Gérant'
      },
      firstName: 'Kanga',
      lastName: 'Distribution SARL',
      email: 'direction.kanga-distribution@example.ci',
      phone: '+2252722501177',
      profession: 'Supérette de proximité (lot M01)',
      district: 'Cocody Angré',
      channel: 'EMAIL',
      role: 'COOWNER',
      profile: 'ponctuel',
      methods: ['VIREMENT'],
      note: `${tag} — lots M01, P11`
    }
  ];

  const tenantSeeds: [string, string, string, string, string][] = [
    ['loukou_stephane', 'MR', 'Stéphane', 'Loukou', 'Comptable'],
    ['bakayoko_aicha', 'MS', 'Aïcha', 'Bakayoko', 'Étudiante en master'],
    ['kra_jonathan', 'MR', 'Jonathan', 'Kra', 'Technicien réseau'],
    ['gadji_ines', 'MRS', 'Inès', 'Gadji', 'Enseignante'],
    ['beugre_wilfried', 'MR', 'Wilfried', 'Beugré', 'Commercial'],
    ['ehui_grace', 'MS', 'Grâce', 'Ehui', 'Infographiste'],
    ['atse_fabrice', 'MR', 'Fabrice', 'Atsé', 'Agent de banque'],
    ['yeo_nathalie', 'MRS', 'Nathalie', 'Yéo', 'Pharmacienne assistante']
  ];
  for (const [key, civ, first, last, job] of tenantSeeds) {
    contacts.push({
      key,
      civility: civ as 'MR' | 'MRS' | 'MS',
      firstName: first,
      lastName: last,
      email: emailFor(first, last, 'angre'),
      phone: phoneFor(key),
      profession: job,
      district: 'Cocody Angré',
      city: 'Abidjan',
      channel: 'WHATSAPP',
      role: 'TENANT',
      note: `${tag} — locataire`
    });
  }

  // ── lots : 3 bâtiments R+3 de 12 appartements, 2 commerces, 12 parkings
  const owners: Record<string, string> = {
    A01: 'ake_christelle',
    A02: 'yapo_arsene',
    A03: 'sci_cocotiers',
    A04: 'coulibaly_drissa',
    A05: 'assi_nadege',
    A06: 'diarra_oumar',
    A07: 'sci_cocotiers',
    A08: 'konan_bertin',
    A09: 'fofana_salimata',
    A10: 'owusu_kofi',
    A11: 'zadi_gilbert',
    A12: 'dago_prisca',
    B01: 'soro_siaka',
    B02: 'ouattara_lassina',
    B03: 'kouadio_amenan',
    B04: 'houngbedji_pascal',
    B05: 'sawadogo_adama',
    B06: 'brou_ahou',
    B07: 'ndiaye_mamadou',
    B08: 'ouattara_lassina',
    B09: 'seri_hyacinthe',
    B10: 'sylla_fatou',
    B11: 'sci_cocotiers',
    B12: 'tape_eric',
    C01: 'achi_yves',
    C02: 'mobio_carine',
    C03: 'diabate_bakary',
    C04: 'guehi_rodrigue',
    C05: 'sci_amani',
    C06: 'sci_amani',
    C07: 'cisse_ousmane',
    C08: 'nando_edwige',
    C09: 'agbodjan_kwame',
    C10: 'dosso_mariam',
    C11: 'adjoumani_theodore',
    C12: 'kabore_rachelle',
    M01: 'kanga_distribution',
    M02: 'yapi_rosine',
    P01: 'ake_christelle',
    P02: 'sci_cocotiers',
    P03: 'assi_nadege',
    P04: 'konan_bertin',
    P05: 'ouattara_lassina',
    P06: 'houngbedji_pascal',
    P07: 'ndiaye_mamadou',
    P08: 'achi_yves',
    P09: 'sci_amani',
    P10: 'adjoumani_theodore',
    P11: 'kanga_distribution',
    P12: 'owusu_kofi'
  };
  const tenancy: Record<string, { key: string; from: Date }> = {
    A03: { key: 'loukou_stephane', from: d(2024, 10, 1) },
    A07: { key: 'bakayoko_aicha', from: d(2025, 3, 1) },
    B11: { key: 'kra_jonathan', from: d(2023, 6, 1) },
    B02: { key: 'gadji_ines', from: d(2022, 9, 1) },
    B08: { key: 'beugre_wilfried', from: d(2025, 8, 15) },
    C05: { key: 'ehui_grace', from: d(2024, 1, 15) },
    C06: { key: 'atse_fabrice', from: d(2023, 11, 1) },
    A10: { key: 'yeo_nathalie', from: d(2022, 5, 1) }
  };
  const floorLabel = ['rez-de-chaussée', '1er étage', '2e étage', '3e étage'];
  const kinds = [
    { t: 'F2', label: 'F2 (2 pièces)', surface: 55, shares: 180 },
    { t: 'F3', label: 'F3 (3 pièces)', surface: 78, shares: 250 },
    { t: 'F4', label: 'F4 (4 pièces)', surface: 105, shares: 330 }
  ];
  const lots: LotDef[] = [];
  const delivery = d(2021, 7, 1);
  for (const b of ['A', 'B', 'C']) {
    for (let i = 1; i <= 12; i++) {
      const num = `${b}${pad(i)}`;
      const k = kinds[(i - 1) % 3];
      const floor = Math.floor((i - 1) / 3);
      const ownerKey = owners[num];
      const r = mulberry32(hash(`since|${num}`));
      const from = addDays(delivery, rint(r, 0, 900));
      const lot: LotDef = {
        num,
        type: 'APARTMENT',
        desc: `Bâtiment ${b} — ${floorLabel[floor]} — ${k.label}, ${k.surface} m²`,
        surface: k.surface,
        shares: k.shares,
        special: k.shares,
        owners:
          num === 'B10'
            ? [
                { key: 'kacou_arnaud', from: d(2021, 9, 1), until: d(2025, 12, 1) },
                { key: 'sylla_fatou', from: d(2025, 12, 1), portal: true }
              ]
            : [{ key: ownerKey, from, portal: rint(r, 0, 2) > 0 }]
      };
      if (tenancy[num]) {
        lot.tenants = [{ key: tenancy[num].key, from: tenancy[num].from, billed: rint(r, 0, 1) === 1 }];
      }
      lots.push(lot);
    }
  }
  lots.push({
    num: 'M01',
    type: 'COMMERCIAL',
    desc: 'Pavillon commercial sur voie — supérette, 120 m²',
    surface: 120,
    shares: 380,
    special: null,
    owners: [{ key: 'kanga_distribution', from: d(2021, 10, 1), portal: true }]
  });
  lots.push({
    num: 'M02',
    type: 'COMMERCIAL',
    desc: 'Pavillon commercial sur voie — pressing, 45 m²',
    surface: 45,
    shares: 140,
    special: null,
    owners: [{ key: 'yapi_rosine', from: d(2022, 2, 1), portal: true }]
  });
  for (let i = 1; i <= 12; i++) {
    const num = `P${pad(i)}`;
    lots.push({
      num,
      type: 'PARKING',
      desc: `Parking extérieur couvert — place n° ${i}`,
      surface: 12.5,
      shares: 30,
      special: null,
      owners: [{ key: owners[num], from: addDays(delivery, rint(mulberry32(hash(`p|${num}`)), 0, 600)) }]
    });
  }

  const suppliers: SupplierDef[] = [
    {
      key: 'VIG',
      account: '401VIG',
      name: 'Vigilance Sécurité Privée',
      provider: { specialty: 'Gardiennage', email: 'contact@vigilance-securite.example.ci', phone: '+2252722411890' }
    },
    {
      key: 'CLE',
      account: '401CLE',
      name: 'Clean Plus Services',
      provider: {
        specialty: 'Nettoyage des parties communes',
        email: 'devis@cleanplus.example.ci',
        phone: '+2250707550312'
      }
    },
    {
      key: 'ELP',
      account: '401ELP',
      name: 'Électro-Power Services',
      provider: {
        specialty: 'Groupes électrogènes et surpresseurs',
        email: 'maintenance@electropower.example.ci',
        phone: '+2250505481276'
      }
    },
    {
      key: 'HYD',
      account: '401HYD',
      name: 'Hydro-Pompes Services',
      provider: {
        specialty: 'Pompes, bâches à eau et traitement',
        email: 'sav@hydropompes.example.ci',
        phone: '+2250101662290'
      }
    },
    {
      key: 'JAR',
      account: '401JAR',
      name: "Jardins d'Éburnie",
      provider: { specialty: 'Espaces verts', email: 'contact@jardins-eburnie.example.ci', phone: '+2250707339048' }
    },
    {
      key: 'HYG',
      account: '401HYG',
      name: 'Hygiène Pro 3D',
      provider: {
        specialty: 'Désinsectisation, dératisation, désinfection',
        email: 'interventions@hygienepro3d.example.ci',
        phone: '+2250101447263'
      }
    },
    {
      key: 'CUR',
      account: '401CUR',
      name: 'Assainissement Lagunaire SARL',
      provider: {
        specialty: 'Curage des caniveaux et vidange',
        email: 'exploitation@assainissement-lagunaire.example.ci',
        phone: '+2252721336040'
      }
    },
    {
      key: 'ASA',
      account: '401ASA',
      name: 'Atlantique Courtage Assurances',
      provider: {
        specialty: 'Assurance multirisque immeuble',
        email: 'iard@atlantique-courtage.example.ci',
        phone: '+2252720316655'
      }
    },
    {
      key: 'SOT',
      account: '401SOT',
      name: 'Sotelec Services',
      provider: {
        specialty: 'Électricité et dépannage du bâtiment',
        email: 'depannage@sotelec.example.ci',
        phone: '+2250505902214'
      }
    },
    { key: 'CIE', account: '401CIE', name: 'CIE — électricité des parties communes' },
    { key: 'SOD', account: '401SOD', name: 'SODECI — eau des parties communes' },
    { key: 'SYN', account: '401SYN', name: 'Ivoire Résidences — honoraires de syndic' },
    { key: 'DIV', account: '401DIV', name: 'Artisans et fournisseurs divers' }
  ];

  const lines: LineDef[] = [
    {
      code: 'GARD',
      category: 'Sécurité',
      description: 'Gardiennage 24h/24 — 2 postes (entrée principale et parking)',
      account: '6141',
      key: 'GENERAL_SHARES',
      billing: 'monthly',
      variance: 0,
      supplier: 'VIG'
    },
    {
      code: 'NETT',
      category: 'Entretien',
      description: 'Nettoyage des espaces extérieurs et de la voirie',
      account: '6142',
      key: 'GENERAL_SHARES',
      billing: 'monthly',
      variance: 0,
      supplier: 'CLE'
    },
    {
      code: 'CAGE',
      category: 'Entretien',
      description: "Entretien des cages d'escalier des bâtiments A, B et C (charges spéciales : appartements)",
      account: '6148',
      key: 'SPECIAL_SHARES',
      billing: 'monthly',
      variance: 0,
      supplier: 'CLE'
    },
    {
      code: 'ELEC',
      category: 'Fluides',
      description: 'Électricité des parties communes et éclairage extérieur (CIE)',
      account: '6012',
      key: 'GENERAL_SHARES',
      billing: 'monthly',
      variance: 0.14,
      supplier: 'CIE'
    },
    {
      code: 'EAU',
      category: 'Fluides',
      description: 'Eau des parties communes et arrosage (SODECI)',
      account: '6011',
      key: 'GENERAL_SHARES',
      billing: 'bimonthly',
      variance: 0.15,
      supplier: 'SOD'
    },
    {
      code: 'GE',
      category: 'Maintenance',
      description: 'Maintenance du groupe électrogène 150 kVA',
      account: '6144',
      key: 'GENERAL_SHARES',
      billing: 'quarterly',
      variance: 0.05,
      supplier: 'ELP'
    },
    {
      code: 'POMP',
      category: 'Maintenance',
      description: 'Entretien des pompes et de la bâche à eau',
      account: '6149',
      key: 'GENERAL_SHARES',
      billing: 'quarterly',
      variance: 0,
      supplier: 'HYD'
    },
    {
      code: 'JARD',
      category: 'Entretien',
      description: 'Entretien des espaces verts et de l’aire de jeux',
      account: '6145',
      key: 'GENERAL_SHARES',
      billing: 'monthly',
      variance: 0,
      supplier: 'JAR'
    },
    {
      code: 'DESI',
      category: 'Hygiène',
      description: 'Désinsectisation et dératisation (4 passages par an)',
      account: '6146',
      key: 'GENERAL_SHARES',
      billing: 'quarterly',
      variance: 0,
      supplier: 'HYG'
    },
    {
      code: 'CURA',
      category: 'Hygiène',
      description: 'Curage des caniveaux et vidange des fosses',
      account: '6147',
      key: 'GENERAL_SHARES',
      billing: 'quarterly',
      variance: 0,
      supplier: 'CUR'
    },
    {
      code: 'ASSU',
      category: 'Assurance',
      description: 'Assurance multirisque immeuble (4 bâtiments)',
      account: '616',
      key: 'GENERAL_SHARES',
      billing: 'annual',
      variance: 0,
      supplier: 'ASA'
    },
    {
      code: 'HONO',
      category: 'Administration',
      description: 'Honoraires du syndic (Ivoire Résidences)',
      account: '621',
      key: 'GENERAL_SHARES',
      billing: 'monthly',
      variance: 0,
      supplier: 'SYN'
    },
    {
      code: 'FRAIS',
      category: 'Administration',
      description: "Frais bancaires, d'envoi des appels et relances (répartis à parts égales)",
      account: '627',
      key: 'EQUAL',
      billing: 'bankfees',
      variance: 0.2
    },
    {
      code: 'TRAV',
      category: 'Travaux',
      description: 'Petits travaux, dépannages et interventions imprévues',
      account: '615',
      key: 'GENERAL_SHARES',
      billing: 'quarterly',
      variance: 0.3,
      supplier: 'DIV'
    },
    {
      code: 'FTRAV',
      category: 'Travaux',
      description: 'Cotisation annuelle au fonds de travaux',
      account: '105',
      key: 'GENERAL_SHARES',
      billing: 'none',
      variance: 0
    }
  ];

  const budgets: BudgetDef[] = [
    {
      year: 2026,
      label: 'Budget prévisionnel 2026',
      status: 'APPROVED',
      approvedAt: d(2026, 3, 28, 12),
      resolution: 'AGO2026#3',
      amounts: {
        GARD: 5760000,
        NETT: 1560000,
        CAGE: 1080000,
        ELEC: 2160000,
        EAU: 720000,
        GE: 960000,
        POMP: 720000,
        JARD: 900000,
        DESI: 480000,
        CURA: 600000,
        ASSU: 960000,
        HONO: 2400000,
        FRAIS: 240000,
        TRAV: 600000,
        FTRAV: 1020000
      },
      quartersIssued: 3
    }
  ];

  const salle = 'Salle polyvalente de la résidence — bâtiment A';
  const meetings: MeetingDef[] = [
    {
      key: 'AGO2026',
      type: 'ORDINARY',
      date: d(2026, 3, 28, 9, 0),
      end: d(2026, 3, 28, 13, 10),
      location: salle,
      status: 'COMPLETED',
      absent: ['zadi_gilbert', 'kabore_rachelle', 'sawadogo_adama', 'tape_eric', 'dago_prisca', 'guehi_rodrigue'],
      proxies: [
        ['diarra_oumar', 'coulibaly_drissa'],
        ['owusu_kofi', 'konan_bertin'],
        ['sci_amani', 'achi_yves'],
        ['ouattara_lassina', 'soro_siaka']
      ],
      resolutions: [
        {
          title: 'Désignation du président de séance et du scrutateur',
          description:
            'Me Yves Achi est désigné président de séance, Mme Edwige Nando scrutatrice ; le syndic assure le secrétariat.',
          majority: 'SIMPLE',
          result: 'APPROVED'
        },
        {
          title: 'Ratification de la désignation du syndic Ivoire Résidences',
          description:
            'Contrat de syndic de trois ans à compter du 01/01/2026, honoraires de base 2 400 000 F CFA TTC par an.',
          majority: 'ABSOLUE',
          result: 'APPROVED',
          against: ['sci_cocotiers'],
          abstain: ['mobio_carine']
        },
        {
          title: "Approbation des comptes 2025 de l'ancien syndic bénévole",
          description:
            'Ajournée : les pièces justificatives de 2025 remises lors de la passation sont incomplètes ; un audit est confié au conseil syndical.',
          majority: 'SIMPLE',
          result: 'DEFERRED',
          noVote: true
        },
        {
          title: 'Vote du budget prévisionnel 2026 et ratification de l’appel provisionnel du 1er trimestre',
          description:
            'Budget prévisionnel 2026 et ratification de l’appel provisionnel du 1er trimestre émis le 05/01/2026 sur la base de ce projet de budget.',
          majority: 'SIMPLE',
          result: 'APPROVED',
          against: ['sci_cocotiers', 'mobio_carine'],
          abstain: ['ndiaye_mamadou']
        },
        {
          title: 'Fixation de la cotisation annuelle au fonds de travaux',
          description: 'Cotisation annuelle fixée à 1 020 000 F CFA pour 2026 (environ 5 % du budget prévisionnel).',
          majority: 'ABSOLUE',
          result: 'APPROVED',
          against: ['sci_cocotiers']
        },
        {
          title: 'Élection des membres du conseil syndical',
          description: 'Sont élus : Dr Nadège Assi (présidente), M. Siaka Soro, M. Pascal Houngbédji, Me Yves Achi.',
          majority: 'SIMPLE',
          result: 'APPROVED'
        },
        {
          title: "Installation d'une barrière levante et d'un contrôle d'accès par badge",
          description: 'Devis Groupe SIGMA Sécurité : 7 800 000 F CFA TTC.',
          majority: 'ABSOLUE',
          result: 'REJECTED',
          forOnly: [
            'assi_nadege',
            'achi_yves',
            'konan_bertin',
            'houngbedji_pascal',
            'agbodjan_kwame',
            'nando_edwige',
            'soro_siaka',
            'sci_amani',
            'owusu_kofi'
          ],
          abstain: ['ake_christelle', 'seri_hyacinthe']
        }
      ],
      agendaExtra: [
        {
          title: 'Compte rendu de la passation de gestion',
          discussions: [
            'Soldes repris au 01/01/2026 : banque 3 133 000 F CFA, fonds de travaux 1 800 000 F CFA.',
            'Arriérés repris de l’ancienne gestion : 517 000 F CFA sur trois lots (A11, B06, C02).'
          ]
        },
        {
          title: 'Questions diverses',
          discussions: [
            'Plaintes sur des infiltrations dans la cage d’escalier du bâtiment C : le syndic fera établir des devis.'
          ]
        }
      ],
      discussions: [
        ['44 lots sur 50 présents ou représentés.'],
        ['Présentation de l’offre de service et du portail copropriétaire.'],
        ['Le conseil syndical rendra son rapport d’audit avant l’AG de 2027.'],
        ['Budget de 20 160 000 F CFA ; appels trimestriels échéance le 15 du premier mois.'],
        [],
        [],
        ['Plusieurs copropriétaires jugent l’investissement prioritaire après les travaux du bâtiment C.']
      ]
    },
    {
      key: 'AGE2026',
      type: 'EXTRAORDINARY',
      date: d(2026, 10, 24, 9, 30),
      location: salle,
      status: 'PLANNED',
      absent: [],
      proxies: [],
      resolutions: [
        {
          title: "Travaux d'étanchéité de la toiture et de la cage d'escalier du bâtiment C",
          description: 'Trois devis à présenter (estimation 6 à 8 millions F CFA).',
          majority: 'ABSOLUE',
          result: null
        },
        {
          title: 'Financement des travaux du bâtiment C',
          description:
            'Appel de fonds exceptionnel réparti aux tantièmes et prélèvement partiel sur le fonds de travaux.',
          majority: 'ABSOLUE',
          result: null
        }
      ],
      agendaExtra: [{ title: 'Questions diverses', discussions: [] }],
      discussions: [[], []]
    }
  ];

  const contracts: ContractDef[] = [
    {
      key: 'j_vig',
      supplier: 'VIG',
      nature: 'Gardiennage 24h/24 — 2 postes, 4 agents',
      start: d(2026, 1, 1),
      end: d(2026, 12, 31),
      annual: 5760000,
      status: 'ACTIVE',
      alertDays: 60,
      lineCode: 'GARD'
    },
    {
      key: 'j_cle',
      supplier: 'CLE',
      nature: "Nettoyage des extérieurs, de la voirie et des cages d'escalier",
      start: d(2026, 1, 1),
      end: d(2026, 12, 31),
      annual: 2640000,
      status: 'ACTIVE',
      alertDays: 45,
      lineCode: 'NETT'
    },
    {
      key: 'j_elp',
      supplier: 'ELP',
      nature: 'Maintenance du groupe électrogène 150 kVA (visites trimestrielles)',
      start: d(2026, 2, 1),
      end: d(2027, 1, 31),
      annual: 960000,
      status: 'ACTIVE',
      alertDays: 60,
      lineCode: 'GE'
    },
    {
      key: 'j_hyd',
      supplier: 'HYD',
      nature: 'Entretien des pompes et de la bâche à eau (contrat repris de l’ancienne gestion)',
      start: d(2024, 6, 1),
      end: d(2026, 11, 30),
      annual: 720000,
      status: 'ACTIVE',
      alertDays: 90,
      lineCode: 'POMP'
    },
    {
      key: 'j_jar',
      supplier: 'JAR',
      nature: 'Entretien des espaces verts et de l’aire de jeux',
      start: d(2026, 1, 1),
      end: d(2026, 12, 31),
      annual: 900000,
      status: 'ACTIVE',
      alertDays: 30,
      lineCode: 'JARD'
    },
    {
      key: 'j_hyg',
      supplier: 'HYG',
      nature: 'Désinsectisation et dératisation (4 passages par an)',
      start: d(2026, 1, 1),
      end: d(2026, 12, 31),
      annual: 480000,
      status: 'ACTIVE',
      alertDays: 30,
      lineCode: 'DESI'
    },
    {
      key: 'j_cur',
      supplier: 'CUR',
      nature: 'Curage des caniveaux et vidange des fosses (trimestriel)',
      start: d(2026, 1, 1),
      end: d(2026, 12, 31),
      annual: 600000,
      status: 'ACTIVE',
      alertDays: 30,
      lineCode: 'CURA'
    },
    {
      key: 'j_asa',
      supplier: 'ASA',
      nature: 'Assurance multirisque immeuble — police MRI-2026-005102',
      start: d(2026, 1, 1),
      end: d(2026, 12, 31),
      annual: 960000,
      status: 'ACTIVE',
      alertDays: 45,
      lineCode: 'ASSU'
    }
  ];

  const incidents: IncidentDef[] = [
    {
      type: 'LEAK',
      urgency: 'HIGH',
      status: 'CLOSED',
      reportedAt: d(2026, 1, 20, 7, 30),
      resolvedAt: d(2026, 1, 24, 16),
      reporter: 'soro_siaka',
      asset: 'bache',
      provider: 'HYD',
      description: 'Fuite sur la bâche à eau enterrée : pompes en marche continue et facture SODECI anormale.',
      costs: [
        {
          type: 'SYNDICATE_BUDGET',
          amount: 340000,
          supplier: 'HYD',
          notes: 'Reprise de l’étanchéité de la bâche et remplacement d’une vanne.'
        }
      ]
    },
    {
      type: 'BREAKDOWN',
      urgency: 'HIGH',
      status: 'RESOLVED',
      reportedAt: d(2026, 2, 14, 18),
      resolvedAt: d(2026, 2, 16, 12),
      reporter: 'houngbedji_pascal',
      asset: 'bache',
      provider: 'HYD',
      description: 'Pompe de relevage du bâtiment B hors service : plus d’eau au 3e étage.',
      costs: [
        {
          type: 'SYNDICATE_BUDGET',
          amount: 185000,
          supplier: 'HYD',
          contract: 'j_hyd',
          notes: 'Bobinage du moteur (hors forfait).'
        }
      ]
    },
    {
      type: 'VANDALISM',
      urgency: 'MEDIUM',
      status: 'RESOLVED',
      reportedAt: d(2026, 5, 7, 6, 45),
      resolvedAt: d(2026, 5, 15, 15),
      reporter: 'achi_yves',
      asset: 'eclairage',
      provider: 'SOT',
      description: 'Vol de câbles de l’éclairage extérieur (4 candélabres hors service).',
      costs: [
        {
          type: 'SYNDICATE_BUDGET',
          amount: 260000,
          supplier: 'SOT',
          notes: 'Remplacement des câbles et pose de trappes sécurisées.'
        },
        {
          type: 'THIRD_PARTY',
          amount: 0,
          notes: 'Plainte déposée au commissariat du 30e arrondissement (auteur non identifié).'
        }
      ]
    },
    {
      type: 'LEAK',
      urgency: 'HIGH',
      status: 'IN_PROGRESS',
      reportedAt: d(2026, 7, 22, 8),
      reporter: 'nando_edwige',
      asset: 'cageC',
      description:
        "Infiltrations dans la cage d'escalier du bâtiment C à chaque pluie (3e étage et toiture). Travaux soumis à l'AGE du 24/10/2026.",
      ticket: {
        title: "Infiltrations cage d'escalier bâtiment C",
        category: 'PLUMBING',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        location: 'Bâtiment C — cage d’escalier, 3e étage et toiture',
        imputation: 'SYNDICATE'
      }
    },
    {
      type: 'SAFETY',
      urgency: 'LOW',
      status: 'REPORTED',
      reportedAt: d(2026, 9, 5, 10),
      reporter: 'ake_christelle',
      asset: 'voirie',
      description: 'Nids-de-poule et affaissement de la voirie devant le bâtiment A.',
      ticket: {
        title: 'Voirie dégradée devant le bâtiment A',
        category: 'OTHER',
        priority: 'LOW',
        status: 'DECLARED',
        location: 'Voirie interne — entrée du bâtiment A',
        imputation: 'SYNDICATE'
      }
    },
    {
      type: 'OTHER',
      urgency: 'LOW',
      status: 'ASSIGNED',
      reportedAt: d(2026, 9, 19, 17),
      reporter: 'dosso_mariam',
      provider: 'CUR',
      description: 'Dépôts sauvages d’ordures à côté du local poubelles ; caniveau obstrué.'
    }
  ];

  const documents: DocumentDef[] = [
    {
      title: 'Règlement de copropriété et état descriptif de division',
      type: 'REGULATION',
      date: d(2026, 1, 6),
      body: [
        'Règlement de copropriété du 14/05/2021, Maître Konan Brou, notaire à Abidjan.',
        '50 lots : 36 appartements (bâtiments A, B, C), 2 commerces, 12 parkings — 10 000 tantièmes généraux.',
        "Charges spéciales d'entretien des cages d'escalier réparties entre les seuls appartements."
      ]
    },
    {
      title: 'Procès-verbal de passation de gestion (ancien syndic bénévole → Ivoire Résidences)',
      type: 'OTHER',
      date: d(2026, 1, 8),
      body: [
        'Passation au 01/01/2026 en présence du président du conseil syndical sortant.',
        'Soldes repris : banque 3 133 000 F CFA ; fonds de travaux 1 800 000 F CFA ; fonds de roulement 1 850 000 F CFA.',
        'Arriérés des copropriétaires repris : A11 240 000 F CFA ; B06 92 000 F CFA ; C02 185 000 F CFA.'
      ]
    },
    {
      title: 'État des lieux technique à la reprise de gestion',
      type: 'DIAGNOSTIC',
      date: d(2026, 2, 3),
      body: [
        'Visite du 27/01/2026 : bâche à eau fuyarde (réparée), éclairage extérieur vétuste, toiture du bâtiment C à surveiller.',
        'Priorités : étanchéité du bâtiment C, sécurisation de l’éclairage, contrôle d’accès.'
      ]
    },
    {
      title: 'Procès-verbal — AG ordinaire du 28/03/2026',
      type: 'GENERAL_MEETING_MINUTES',
      date: d(2026, 4, 6),
      meeting: 'AGO2026',
      body: []
    },
    { title: 'Budget prévisionnel 2026 (voté le 28/03/2026)', type: 'BUDGET', date: d(2026, 4, 6), body: [] },
    {
      title: 'Attestation d’assurance multirisque immeuble 2026',
      type: 'INSURANCE',
      date: d(2026, 1, 12),
      expiresAt: d(2026, 12, 31, 23, 59),
      body: [
        'Atlantique Courtage Assurances — police MRI-2026-005102 (4 bâtiments).',
        'Période de garantie : 01/01/2026 – 31/12/2026.'
      ]
    },
    {
      title: 'Contrat de gardiennage — Vigilance Sécurité Privée',
      type: 'OTHER',
      date: d(2025, 12, 20),
      expiresAt: d(2026, 12, 31, 23, 59),
      body: ['Contrat du 01/01/2026 au 31/12/2026 : 2 postes 24h/24, 5 760 000 F CFA TTC par an.']
    }
  ];

  return {
    id: SYNDIC_JARDINS_ID,
    code: 'JARDINS-ANGRE',
    name: "Résidence Les Jardins d'Angré",
    address: 'Angré 8e Tranche, îlot 312, Cocody — Abidjan',
    registrationNo: 'CI-ABJ-COP-2021-0587',
    cadastral: 'TF n° 217 406 — Circonscription foncière de Bingerville (Cocody Angré)',
    buildings: 4,
    manager: 'aboa_hermann',
    managementStart: d(2026, 1, 1),
    property: {
      id: PROPERTY_JARDINS_ID,
      reference: 'SYND-JARDINS-ANGRE',
      title: "Ensemble résidentiel « Les Jardins d'Angré » — 3 bâtiments R+3",
      description:
        'Ensemble livré en 2021 : 3 bâtiments R+3 de 12 appartements (F2 à F4), un pavillon commercial (supérette et pressing) et 12 parkings couverts, sur un terrain clos et gardé avec espaces verts et aire de jeux. Gestion reprise par Ivoire Résidences au 01/01/2026.',
      address: 'Angré 8e Tranche, îlot 312, Cocody — Abidjan',
      zone: 'Cocody Angré 8e Tranche',
      commune: 'Cocody',
      surface: 3350,
      floors: 4,
      units: 38,
      parkings: 12,
      elevator: false,
      createdAt: d(2026, 1, 5)
    },
    contacts,
    lots,
    totalShares: 10000,
    suppliers,
    lines,
    budgets,
    exceptional: [],
    reprise: {
      period: '2025-REPRISE',
      label: 'Arriérés repris de la gestion antérieure',
      issue: d(2026, 1, 1, 9),
      due: d(2026, 1, 31),
      amounts: { A11: 240000, B06: 92000, C02: 185000 }
    },
    years: [2026],
    opening: {
      date: d(2026, 1, 1, 8),
      label: 'Reprise des soldes au 01/01/2026 (passation de gestion)',
      bank: 3133000,
      roulement: 1850000,
      travaux: 1800000
    },
    meetings,
    contracts,
    assets: [
      {
        key: 'ge',
        name: 'Groupe électrogène 150 kVA (parties communes et pompes)',
        category: 'Énergie',
        last: d(2026, 8, 12),
        next: d(2026, 11, 12),
        notes: 'Contrat Électro-Power depuis février 2026.'
      },
      {
        key: 'bache',
        name: 'Bâche à eau enterrée de 30 m³ et 3 pompes de relevage',
        category: 'Eau',
        last: d(2026, 6, 20),
        next: d(2026, 9, 20),
        notes: 'Étanchéité de la bâche reprise en janvier 2026.'
      },
      {
        key: 'portail',
        name: 'Portail principal et guérite de gardiennage',
        category: 'Accès',
        last: d(2026, 4, 2),
        next: d(2026, 10, 2),
        notes: 'Projet de barrière levante rejeté par l’AG du 28/03/2026.'
      },
      {
        key: 'eclairage',
        name: 'Éclairage extérieur — 14 candélabres',
        category: 'Électricité',
        last: d(2026, 5, 15),
        next: d(2026, 11, 15),
        notes: 'Câbles remplacés après le vol de mai 2026.'
      },
      {
        key: 'aire',
        name: 'Aire de jeux pour enfants',
        category: 'Espaces verts',
        last: d(2026, 7, 1),
        next: d(2027, 1, 1),
        notes: 'Contrôle semestriel des équipements.'
      },
      {
        key: 'voirie',
        name: 'Voirie interne et caniveaux',
        category: 'Voirie',
        last: d(2026, 6, 30),
        next: d(2026, 9, 30),
        notes: 'Curage trimestriel des caniveaux.'
      },
      {
        key: 'cageC',
        name: "Cage d'escalier et toiture du bâtiment C",
        category: 'Clos et couvert',
        last: d(2026, 7, 25),
        notes: 'Infiltrations — travaux soumis à l’AGE du 24/10/2026.'
      }
    ],
    incidents,
    specialInvoices: [],
    // Résidence Les Jardins d'Angré n'a pas encore de travaux votés (l'AGE du
    // 24/10/2026 sur l'étanchéité du bâtiment C est encore PLANNED à la date de
    // référence) : seule dépense déjà réalisée sur le fonds de travaux, le
    // remplacement des câbles d'éclairage extérieur après le vol de mai 2026
    // (voir l'actif « Éclairage extérieur », `last: d(2026, 5, 15)`).
    fundTransfers: [
      {
        date: d(2026, 5, 15, 15),
        amount: 380000,
        label: "Prélèvement sur le fonds de travaux — remplacement des câbles d'éclairage extérieur après vol"
      }
    ],
    schedules: [
      {
        lot: 'C02',
        period: '2026-T2',
        agreedAt: d(2026, 6, 10),
        status: 'ACTIVE',
        instalments: [
          { due: d(2026, 6, 30), paidAt: d(2026, 6, 30, 16) },
          { due: d(2026, 7, 31), paidAt: d(2026, 7, 29, 12) },
          { due: d(2026, 8, 31) }
        ]
      }
    ],
    overrides: {
      'A11|2025-REPRISE': [],
      'A11|2026-T1': [],
      'A11|2026-T2': [],
      'A11|2026-T3': [],
      'B06|2025-REPRISE': [{ date: d(2026, 2, 10, 11), frac: 1 }],
      'C02|2025-REPRISE': [{ date: d(2026, 3, 12, 15), amount: 100000 }],
      'C02|2026-T1': [{ date: d(2026, 2, 25, 10), frac: 1 }],
      'C02|2026-T2': [],
      'C02|2026-T3': [{ date: d(2026, 8, 5, 12), frac: 0.5 }]
    },
    waivers: {},
    waiveFirstPenalty: ['diarra_oumar', 'sci_cocotiers'],
    documents,
    bank: { name: 'Société Générale Côte d’Ivoire — agence Angré', iban: 'CI93 CI008 01112 012457896300 71' },
    mobileNumbers: { orange: '+225 07 08 12 44 90', mtn: '+225 05 06 12 44 90', wave: '+225 07 08 12 44 90' }
  };
}

// ═══════════════════════════════════════════════════════════════ contacts, prestataires, immeubles (upsert)

async function upsertContacts(defs: ContactDef[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const c of defs) {
    const existing = await prisma.crmContact.findUnique({
      where: { tenantId_email: { tenantId: TENANT_ID, email: c.email } },
      select: { id: true, internalNotes: true }
    });
    if (existing && !(existing.internalNotes ?? '').includes(SEED_TAG)) {
      throw new Error(`Le contact ${c.email} existe déjà sans le marqueur ${SEED_TAG} : le seed refuse de l'écraser.`);
    }
    const data = {
      contactType: c.company ? ('COMPANY' as const) : ('PERSON' as const),
      civility: c.civility ?? null,
      firstName: c.firstName,
      lastName: c.lastName,
      legalName: c.company?.legalName ?? null,
      legalForm: c.company?.legalForm ?? null,
      rccm: c.company?.rccm ?? null,
      representativeName: c.company?.rep ?? null,
      representativeRole: c.company?.repRole ?? null,
      phonePrimary: c.phone,
      whatsappNumber: c.channel === 'WHATSAPP' ? c.phone : null,
      address: c.address ?? null,
      city: c.city ?? (c.address ? null : 'Abidjan'),
      district: c.district ?? null,
      country: c.address && !c.address.includes('Abidjan') ? null : "Côte d'Ivoire",
      nationality: c.nationality ?? (c.company ? null : 'Ivoirienne'),
      profession: c.profession ?? null,
      preferredLanguage: 'fr',
      preferredContactChannel: c.channel,
      status: 'ACTIVE_CLIENT' as const,
      source: 'Syndic de copropriété',
      internalNotes: c.note
    };
    const row = existing
      ? await prisma.crmContact.update({ where: { id: existing.id }, data, select: { id: true } })
      : await prisma.crmContact.create({
          data: { ...data, tenantId: TENANT_ID, email: c.email },
          select: { id: true }
        });
    ids.set(c.key, row.id);

    if (c.role) {
      const role = await prisma.crmContactRole.findFirst({
        where: { tenantId: TENANT_ID, contactId: row.id, role: c.role },
        select: { id: true }
      });
      const roleData = {
        active: !c.roleEndedAt,
        endedAt: c.roleEndedAt ?? null,
        metadata: { source: SEED_TAG }
      };
      if (role) {
        await prisma.crmContactRole.update({ where: { id: role.id }, data: roleData });
      } else {
        await prisma.crmContactRole.create({
          data: { ...roleData, tenantId: TENANT_ID, contactId: row.id, role: c.role, startedAt: d(2023, 1, 1) }
        });
      }
    }
  }
  return ids;
}

async function upsertProviders(defs: SupplierDef[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const s of defs) {
    if (!s.provider) continue;
    const existing = await prisma.serviceProvider.findFirst({
      where: { tenantId: TENANT_ID, name: s.name },
      select: { id: true }
    });
    const row = existing
      ? await prisma.serviceProvider.update({
          where: { id: existing.id },
          data: { specialty: s.provider.specialty, email: s.provider.email, phone: s.provider.phone },
          select: { id: true }
        })
      : await prisma.serviceProvider.create({
          data: {
            tenantId: TENANT_ID,
            name: s.name,
            specialty: s.provider.specialty,
            email: s.provider.email,
            phone: s.provider.phone
          },
          select: { id: true }
        });
    ids.set(s.key, row.id);
  }
  return ids;
}

async function upsertProperty(def: CoproDef, ownerUserId: string | null) {
  const p = def.property;
  const clash = await prisma.property.findFirst({
    where: { tenantId: TENANT_ID, internalReference: p.reference, NOT: { id: p.id } },
    select: { id: true }
  });
  if (clash) throw new Error(`La référence ${p.reference} est déjà portée par un autre bien (${clash.id}).`);
  const data = {
    internalReference: p.reference,
    propertyType: 'IMMEUBLE' as const,
    ownershipType: 'TENANT' as const,
    tenantId: TENANT_ID,
    ownerUserId,
    title: p.title,
    description: p.description,
    address: p.address,
    locationZone: p.zone,
    surfaceArea: p.surface,
    status: 'AVAILABLE' as const,
    isPublished: false,
    availability: 'UNAVAILABLE' as const,
    typeSpecificData: {
      region: "District Autonome d'Abidjan",
      commune: p.commune,
      country: "Côte d'Ivoire",
      elevator: p.elevator,
      units_count: p.units,
      floors_count: p.floors,
      parking_spaces: p.parkings,
      copropriete: def.name,
      seed: SEED_TAG
    }
  };
  await prisma.property.upsert({
    where: { id: p.id },
    create: { id: p.id, ...data, createdAt: p.createdAt },
    update: data
  });
}

// ═══════════════════════════════════════════════════════════════ PDF

const WINANSI_EXTRA = '’‘“”–—…•œŒ€«»';
function pdfSafe(s: string): string {
  return s
    .replace(/[\u202f\u00a0]/g, ' ')
    .split('')
    .map(ch => {
      const c = ch.charCodeAt(0);
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.includes(ch)) return ch;
      return '-';
    })
    .join('');
}

async function writePdf(filePath: string, header: string, title: string, paragraphs: string[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 790;
  const margin = 50;
  const width = 495;
  const newPage = () => {
    page = doc.addPage([595, 842]);
    y = 790;
  };
  const write = (text: string, f: PDFFont, size: number, color = rgb(0.1, 0.1, 0.15)) => {
    const words = pdfSafe(text).split(' ');
    let line = '';
    const flush = () => {
      if (y < 60) newPage();
      page.drawText(line, { x: margin, y, size, font: f, color });
      y -= size + 5;
      line = '';
    };
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(candidate, size) > width && line) {
        flush();
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) flush();
  };
  write(header, bold, 10, rgb(0.05, 0.2, 0.45));
  write('Syndic : Ivoire Résidences — Abidjan', font, 9, rgb(0.35, 0.35, 0.4));
  y -= 14;
  write(title, bold, 15);
  y -= 8;
  for (const p of paragraphs) {
    if (p.startsWith('## ')) {
      y -= 6;
      write(p.slice(3), bold, 11);
    } else {
      write(p, font, 10);
    }
    y -= 3;
  }
  y -= 20;
  write('Document de démonstration généré par ImmoTopia.', font, 8, rgb(0.5, 0.5, 0.55));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, await doc.save());
}

// ═══════════════════════════════════════════════════════════════ moteur

interface Summary {
  name: string;
  id: string;
  address: string;
  lots: number;
  years: { year: number; budget: number; called: number; collected: number; outstanding: number; meetings: number }[];
  counts: Record<string, number>;
  funds: { roulement: number; travaux: number };
  bank: number;
}

async function seedCopro(
  def: CoproDef,
  contactIds: Map<string, string>,
  providerIds: Map<string, string>
): Promise<Summary> {
  const rng = mulberry32(hash(def.code));
  const cid = (key: string): string => {
    const id = contactIds.get(key);
    assert(id, `contact inconnu ${key}`);
    return id;
  };
  const contactByKey = new Map(def.contacts.map(c => [c.key, c]));
  const supplierByKey = new Map(def.suppliers.map(s => [s.key, s]));

  // ─────────────────────────────── lots
  assert(sum(def.lots.map(l => l.shares)) === def.totalShares, `${def.name} : tantièmes ≠ ${def.totalShares}`);
  const lots = def.lots.map(l => ({ ...l, id: randomUUID() }));
  const lotByNum = new Map(lots.map(l => [l.num, l]));
  const sortedLots = [...lots].sort((a, b) => a.num.localeCompare(b.num));
  const primaryAt = (lot: LotDef, date: Date): LotOwnerDef => {
    const current = lot.owners.filter(o => o.from <= date && (!o.until || date < o.until));
    return current[0] ?? lot.owners.find(o => !o.until) ?? lot.owners[0];
  };
  const currentOwner = (lot: LotDef): LotOwnerDef =>
    lot.owners.find(o => !o.until) ?? lot.owners[lot.owners.length - 1];
  const ownerName = (key: string): string => {
    const c = contactByKey.get(key);
    if (!c) return key;
    return c.company ? c.company.legalName : `${c.firstName} ${c.lastName}`;
  };

  const lotRows: Prisma.SyndicateLotCreateManyInput[] = lots.map(l => {
    const owner = currentOwner(l);
    return {
      id: l.id,
      syndicateId: def.id,
      coownerId: cid(owner.key),
      ownerContactId: cid(owner.key),
      lotNumber: l.num,
      lotType: l.type,
      generalShares: l.shares,
      specialShares: l.special ?? null,
      ownerSince: owner.from,
      createdAt: def.managementStart
    };
  });

  const ownerProfiles: Prisma.LotOwnerProfileCreateManyInput[] = [];
  const tenantProfiles: Prisma.LotTenantProfileCreateManyInput[] = [];
  const assignments: Prisma.LotTenantAssignmentCreateManyInput[] = [];
  for (const l of lots) {
    for (const o of l.owners) {
      const c = contactByKey.get(o.key);
      ownerProfiles.push({
        lotId: l.id,
        contactId: cid(o.key),
        ownershipPercentage: o.pct ?? 100,
        ownedSince: o.from,
        ownedUntil: o.until ?? null,
        portalAccessEnabled: Boolean(o.portal) && !o.until,
        portalAccessToken: o.portal && !o.until ? randomUUID() : null,
        notificationPrefs: {
          email: true,
          sms: c?.channel === 'SMS' || c?.channel === 'CALL',
          whatsapp: c?.channel === 'WHATSAPP'
        },
        isActive: !o.until,
        createdAt: o.from > def.managementStart ? o.from : def.managementStart
      });
    }
    for (const t of l.tenants ?? []) {
      tenantProfiles.push({
        lotId: l.id,
        contactId: cid(t.key),
        tenantSince: t.from,
        tenantUntil: t.until ?? null,
        chargesBilledToTenant: t.billed,
        isCurrent: !t.until,
        createdAt: t.from > def.managementStart ? t.from : def.managementStart
      });
      assignments.push({
        lotId: l.id,
        tenantId: cid(t.key),
        startDate: t.from,
        endDate: t.until ?? null,
        isActive: !t.until,
        notes: t.notes ?? (t.billed ? 'Charges récupérables refacturées au locataire' : null),
        createdAt: t.from > def.managementStart ? t.from : def.managementStart
      });
    }
  }

  // ─────────────────────────────── plan comptable & journaux
  const accounts: Prisma.ChartOfAccountCreateManyInput[] = [];
  const accountId = new Map<string, string>();
  const addAccount = (
    num: string,
    name: string,
    cls: number,
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE',
    parent?: string,
    aux = false
  ) => {
    const id = randomUUID();
    accountId.set(num, id);
    accounts.push({
      id,
      syndicateId: def.id,
      tenantId: TENANT_ID,
      scope: 'SYNDICATE',
      accountNumber: num,
      accountName: name,
      accountClass: cls,
      accountType: type,
      isAuxiliary: aux,
      parentAccountId: parent ? (accountId.get(parent) ?? null) : null,
      createdAt: def.managementStart
    });
  };
  addAccount('103', 'Avances — fonds de roulement', 1, 'LIABILITY');
  addAccount('105', 'Fonds de travaux', 1, 'LIABILITY');
  addAccount('401', 'Fournisseurs', 4, 'LIABILITY');
  addAccount('450', 'Copropriétaires', 4, 'ASSET');
  addAccount('512', `Banque — ${def.bank.name}`, 5, 'ASSET');
  addAccount('5171', 'Monnaie électronique (Orange Money, MTN MoMo, Wave)', 5, 'ASSET');
  addAccount('531', 'Caisse', 5, 'ASSET');
  const expenseNames: Record<string, string> = {
    '6011': 'Eau des parties communes',
    '6012': 'Électricité des parties communes',
    '6141': 'Contrat de gardiennage',
    '6142': 'Contrat de nettoyage',
    '6143': "Contrat d'entretien de l'ascenseur",
    '6144': 'Maintenance groupe électrogène et surpresseur',
    '6145': 'Entretien des espaces verts',
    '6146': 'Désinsectisation et dératisation',
    '6147': 'Curage et vidange',
    '6148': "Entretien des cages d'escalier",
    '6149': 'Entretien des pompes et de la bâche à eau',
    '615': 'Entretien et petites réparations',
    '616': "Primes d'assurance",
    '621': 'Honoraires du syndic',
    '627': "Frais bancaires et d'administration",
    '671': "Travaux décidés par l'assemblée générale"
  };
  const usedExpense = new Set<string>(def.lines.map(l => l.account).filter(a => a.startsWith('6')));
  usedExpense.add('615');
  if (def.specialInvoices.some(s => s.account === '671')) usedExpense.add('671');
  for (const num of [...usedExpense].sort()) addAccount(num, expenseNames[num] ?? num, 6, 'EXPENSE');
  addAccount('701', 'Provisions sur opérations courantes', 7, 'INCOME');
  if (def.exceptional.length || def.fundTransfers.length)
    addAccount('702', 'Provisions sur travaux décidés', 7, 'INCOME');
  addAccount('716', 'Pénalités et intérêts de retard', 7, 'INCOME');
  if (def.incidents.some(i => (i.costs ?? []).some(c => c.type === 'INSURANCE'))) {
    addAccount('718', "Indemnités d'assurance", 7, 'INCOME');
  }
  const parentCount = accounts.length;
  for (const l of sortedLots) {
    addAccount(
      `450${l.num}`,
      `Copropriétaire lot ${l.num} — ${ownerName(currentOwner(l).key)}`,
      4,
      'ASSET',
      '450',
      true
    );
  }
  for (const s of def.suppliers) addAccount(s.account, `Fournisseur — ${s.name}`, 4, 'LIABILITY', '401', true);

  const journals: Prisma.AccountingJournalCreateManyInput[] = [];
  const journalId = new Map<string, string>();
  const journalDefs: { code: JournalCode; type: 'GENERAL' | 'BANK' | 'CASH' | 'CHARGES'; label: string }[] = [
    { code: 'AC', type: 'GENERAL', label: 'Achats — factures fournisseurs' },
    { code: 'BQ', type: 'BANK', label: `Banque — ${def.bank.name}` },
    { code: 'CA', type: 'CASH', label: 'Caisse (espèces)' },
    { code: 'CH', type: 'CHARGES', label: 'Appels de fonds' },
    { code: 'MM', type: 'BANK', label: 'Monnaie électronique (Orange Money, MTN MoMo, Wave)' },
    { code: 'OD', type: 'GENERAL', label: 'Opérations diverses' }
  ];
  for (const y of def.years) {
    for (const j of journalDefs) {
      const id = randomUUID();
      journalId.set(`${y}:${j.code}`, id);
      journals.push({
        id,
        syndicateId: def.id,
        tenantId: TENANT_ID,
        scope: 'SYNDICATE',
        journalType: j.type,
        label: j.label,
        code: j.code,
        fiscalYear: y,
        createdAt: d(y, 1, 1, 7)
      });
    }
  }

  // Écritures : construites en mémoire, références attribuées à la fin par ordre chronologique.
  type EntryDraft = {
    row: Prisma.JournalEntryCreateManyInput & { id: string };
    journal: JournalCode;
    year: number;
    order: number;
    explicitRef?: string;
  };
  const entryDrafts: EntryDraft[] = [];
  const entryLines: Prisma.JournalEntryLineCreateManyInput[] = [];
  const accBalance = new Map<string, number>();
  let entryOrder = 0;
  const addEntry = (o: {
    date: Date;
    journal: JournalCode;
    description: string;
    sourceType: 'CHARGE_PAYMENT' | 'MANUAL' | 'PENALTY' | 'FUND';
    sourceId?: string;
    ref?: string;
    lines: { acc: string; debit?: number; credit?: number; label: string; lotId?: string }[];
  }): string => {
    const year = o.date.getUTCFullYear();
    const jid = journalId.get(`${year}:${o.journal}`);
    assert(jid, `journal ${o.journal} ${year} absent pour ${def.name}`);
    const debit = sum(o.lines.map(l => l.debit ?? 0));
    const credit = sum(o.lines.map(l => l.credit ?? 0));
    assert(debit === credit && debit > 0, `écriture déséquilibrée « ${o.description} » (${debit} / ${credit})`);
    const id = randomUUID();
    entryDrafts.push({
      row: {
        id,
        journalId: jid,
        tenantId: TENANT_ID,
        entryDate: o.date,
        reference: '',
        description: o.description,
        sourceType: o.sourceType,
        sourceId: o.sourceId ?? null,
        isLocked: year < 2026,
        createdAt: o.date
      },
      journal: o.journal,
      year,
      order: entryOrder++,
      explicitRef: o.ref
    });
    o.lines.forEach((l, i) => {
      const acc = accountId.get(l.acc);
      assert(acc, `compte ${l.acc} absent du plan de ${def.name}`);
      entryLines.push({
        entryId: id,
        accountId: acc,
        lotId: l.lotId ?? null,
        debit: l.debit ?? 0,
        credit: l.credit ?? 0,
        label: l.label,
        createdAt: new Date(o.date.getTime() + i)
      });
      accBalance.set(l.acc, (accBalance.get(l.acc) ?? 0) + (l.debit ?? 0) - (l.credit ?? 0));
    });
    return id;
  };

  // Soldes d'ouverture
  const openingLines: { acc: string; debit?: number; credit?: number; label: string; lotId?: string }[] = [
    { acc: '512', debit: def.opening.bank, label: 'Solde bancaire repris' }
  ];
  if (def.reprise) {
    for (const [num, amount] of Object.entries(def.reprise.amounts)) {
      const lot = lotByNum.get(num);
      assert(lot, `lot ${num} inconnu (reprise)`);
      openingLines.push({ acc: `450${num}`, debit: amount, label: `Arriérés repris — lot ${num}`, lotId: lot.id });
    }
  }
  openingLines.push({ acc: '103', credit: def.opening.roulement, label: 'Fonds de roulement repris' });
  openingLines.push({ acc: '105', credit: def.opening.travaux, label: 'Fonds de travaux repris' });
  addEntry({
    date: def.opening.date,
    journal: 'OD',
    description: def.opening.label,
    sourceType: 'FUND',
    lines: openingLines
  });

  // ─────────────────────────────── assemblées générales
  const meetingRows: Prisma.GeneralMeetingCreateManyInput[] = [];
  const agendaRows: Prisma.GMAgendaItemCreateManyInput[] = [];
  const resolutionRows: Prisma.GMResolutionCreateManyInput[] = [];
  const voteRows: Prisma.GMVoteCreateManyInput[] = [];
  const proxyRows: Prisma.GMProxyCreateManyInput[] = [];
  const resolutionIds = new Map<string, string>();
  const meetingIds = new Map<string, string>();
  const meetingSummaries = new Map<string, string[]>();
  for (const m of def.meetings) {
    const id = randomUUID();
    meetingIds.set(m.key, id);
    const presentLots = sortedLots.filter(l => !m.absent.includes(primaryAt(l, m.date).key));
    const presentShares = sum(presentLots.map(l => l.shares));
    const quorum = m.status === 'COMPLETED' ? Math.round((presentShares / def.totalShares) * 10000) / 100 : null;
    meetingRows.push({
      id,
      syndicateId: def.id,
      type: m.type,
      scheduledAt: m.date,
      startTime: m.status === 'COMPLETED' ? m.date : null,
      endTime: m.end ?? null,
      location: m.location,
      quorum,
      status: m.status,
      minutesUrl: m.status === 'COMPLETED' ? `/uploads/syndics/${def.id}/documents/pv-${slug(m.key)}.pdf` : null,
      createdAt: addDays(m.date, -30)
    });
    const pv: string[] = [
      `${m.type === 'ORDINARY' ? 'Assemblée générale ordinaire' : 'Assemblée générale extraordinaire'} du ${fmtDate(m.date)}, ${m.location}.`,
      `Lots présents ou représentés : ${presentLots.length} sur ${lots.length}, soit ${presentShares} / ${def.totalShares} tantièmes (${quorum ?? 0} %).`
    ];
    for (const [g, r] of m.proxies) pv.push(`Pouvoir : ${ownerName(g)} représenté(e) par ${ownerName(r)}.`);
    let order = 1;
    m.resolutions.forEach((res, idx) => {
      agendaRows.push({
        meetingId: id,
        orderIndex: order++,
        title: res.title,
        discussions: m.discussions[idx] ?? [],
        createdAt: addDays(m.date, -30)
      });
      const rid = randomUUID();
      resolutionIds.set(`${m.key}#${idx}`, rid);
      let votesFor = 0;
      let votesAgainst = 0;
      let votesAbstain = 0;
      let sharesFor = 0;
      let sharesAgainst = 0;
      if (m.status === 'COMPLETED' && !res.noVote) {
        for (const l of presentLots) {
          const voter = primaryAt(l, m.date).key;
          let choice: 'FOR' | 'AGAINST' | 'ABSTAIN';
          if ((res.abstain ?? []).includes(voter)) choice = 'ABSTAIN';
          else if (res.forOnly) choice = res.forOnly.includes(voter) ? 'FOR' : 'AGAINST';
          else choice = (res.against ?? []).includes(voter) ? 'AGAINST' : 'FOR';
          voteRows.push({ resolutionId: rid, lotId: l.id, vote: choice, createdAt: m.end ?? m.date });
          if (choice === 'FOR') {
            votesFor++;
            sharesFor += l.shares;
          } else if (choice === 'AGAINST') {
            votesAgainst++;
            sharesAgainst += l.shares;
          } else votesAbstain++;
        }
        const passes =
          res.majority === 'SIMPLE'
            ? sharesFor > sharesAgainst
            : res.majority === 'ABSOLUE'
              ? sharesFor * 2 > def.totalShares
              : sharesFor * 3 >= def.totalShares * 2 && votesFor * 2 > lots.length;
        if (res.result === 'APPROVED') {
          assert(passes && votesFor > votesAgainst, `${m.key} « ${res.title} » devrait être adoptée (${sharesFor})`);
        } else if (res.result === 'REJECTED') {
          assert(!passes && votesFor < votesAgainst, `${m.key} « ${res.title} » devrait être rejetée (${sharesFor})`);
        }
      }
      resolutionRows.push({
        id: rid,
        meetingId: id,
        title: res.title,
        description: res.description,
        majorityRule: MAJORITY_LABEL[res.majority],
        result: res.result,
        votesFor,
        votesAgainst,
        votesAbstain,
        sharesFor,
        createdAt: addDays(m.date, -30)
      });
      if (m.status === 'COMPLETED') {
        const verdict = res.result === 'APPROVED' ? 'ADOPTÉE' : res.result === 'REJECTED' ? 'REJETÉE' : 'AJOURNÉE';
        pv.push(`## Résolution n° ${idx + 1} — ${res.title}`);
        pv.push(res.description);
        pv.push(...(m.discussions[idx] ?? []).map(x => `Débats : ${x}`));
        pv.push(`${MAJORITY_LABEL[res.majority]}.`);
        if (!res.noVote) {
          pv.push(
            `Pour : ${votesFor} lots (${sharesFor} tantièmes) — Contre : ${votesAgainst} lots (${sharesAgainst} tantièmes) — Abstention : ${votesAbstain} lots.`
          );
        }
        pv.push(`Résolution ${verdict}.`);
      }
    });
    for (const extra of m.agendaExtra) {
      agendaRows.push({
        meetingId: id,
        orderIndex: order++,
        title: extra.title,
        discussions: extra.discussions,
        createdAt: addDays(m.date, -30)
      });
      if (m.status === 'COMPLETED' && extra.discussions.length) {
        pv.push(`## ${extra.title}`);
        pv.push(...extra.discussions);
      }
    }
    for (const [g, r] of m.proxies) {
      proxyRows.push({
        meetingId: id,
        grantorContactId: cid(g),
        representativeContactId: cid(r),
        createdAt: addDays(m.date, -3)
      });
    }
    if (m.end) pv.push(`La séance est levée à ${pad(m.end.getUTCHours())}h${pad(m.end.getUTCMinutes())}.`);
    meetingSummaries.set(m.key, pv);
  }

  // ─────────────────────────────── budgets & allocations
  const distribute = (amount: number, key: DistKey): Map<string, number> => {
    let weights = sortedLots.map(() => 1);
    if (key === 'GENERAL_SHARES') weights = sortedLots.map(l => l.shares);
    if (key === 'SPECIAL_SHARES') {
      const w = sortedLots.map(l => l.special ?? 0);
      if (w.some(x => x > 0)) weights = w;
    }
    const total = sum(weights);
    let last = -1;
    weights.forEach((w, i) => {
      if (w > 0) last = i;
    });
    const out = new Map<string, number>();
    let acc = 0;
    sortedLots.forEach((l, i) => {
      if (i === last) return;
      const v = Math.round((amount * weights[i]) / total);
      out.set(l.id, v);
      acc += v;
    });
    out.set(sortedLots[last].id, amount - acc);
    return out;
  };

  const budgetRows: Prisma.SyndicateBudgetCreateManyInput[] = [];
  const budgetLineRows: (Prisma.BudgetLineItemCreateManyInput & { id: string })[] = [];
  const allocationRows: Prisma.BudgetAllocationCreateManyInput[] = [];
  const budgetId = new Map<number, string>();
  const lineItemId = new Map<string, string>(); // "<année>:<code>"
  const lotAnnual = new Map<string, Map<string, number>>(); // année → lot → total
  const fundAnnual = new Map<number, number>();
  // Part annuelle de chaque lot au poste « Fonds de travaux » : c'est elle qui
  // fixe la fraction de ses paiements versée au fonds (année → lot → montant).
  const fundLotAnnual = new Map<number, Map<string, number>>();
  const fundRoulementId = randomUUID();
  const fundTravauxId = randomUUID();
  const budgetTotals = new Map<number, number>();
  for (const b of def.budgets) {
    const id = randomUUID();
    budgetId.set(b.year, id);
    const total = sum(Object.values(b.amounts));
    budgetTotals.set(b.year, total);
    const resolutionId = b.resolution ? (resolutionIds.get(b.resolution) ?? null) : null;
    if (b.resolution) assert(resolutionId, `résolution ${b.resolution} introuvable`);
    budgetRows.push({
      id,
      syndicateId: def.id,
      fiscalYear: b.year,
      label: b.label,
      status: b.status,
      approvedAt: b.approvedAt,
      approvedByResolutionId: resolutionId,
      totalAmount: total,
      currency: 'XOF',
      createdAt: addDays(b.approvedAt, -40)
    });
    const perLot = new Map<string, number>();
    const breakdown = new Map<
      string,
      { lineId: string; category: string; distributionKey: string; allocated: number }[]
    >();
    for (const line of def.lines) {
      const amount = b.amounts[line.code];
      if (amount === undefined) continue;
      const lid = randomUUID();
      lineItemId.set(`${b.year}:${line.code}`, lid);
      budgetLineRows.push({
        id: lid,
        budgetId: id,
        category: line.category,
        description: b.descriptions?.[line.code] ?? line.description,
        amountForecast: amount,
        amountActual: 0,
        distributionKey: line.key,
        accountId: accountId.get(line.account) ?? null,
        // Le poste « fonds de travaux » alimente le fonds de travaux : les
        // paiements affectés à ce poste (via `BudgetAllocation.breakdown`)
        // le créditent au prorata, comme `fund-credits.ts` (`budgetSharesTx`).
        fundId: line.code === 'FTRAV' ? fundTravauxId : null,
        createdAt: addDays(b.approvedAt, -40)
      });
      for (const [lotId, v] of distribute(amount, line.key)) {
        perLot.set(lotId, (perLot.get(lotId) ?? 0) + v);
        if (line.code === 'FTRAV') {
          const byLot = fundLotAnnual.get(b.year) ?? new Map<string, number>();
          byLot.set(lotId, (byLot.get(lotId) ?? 0) + v);
          fundLotAnnual.set(b.year, byLot);
        }
        const arr = breakdown.get(lotId) ?? [];
        arr.push({ lineId: lid, category: line.category, distributionKey: line.key, allocated: v });
        breakdown.set(lotId, arr);
      }
      if (line.code === 'FTRAV') fundAnnual.set(b.year, amount);
    }
    assert(sum([...perLot.values()]) === total, `${def.name} ${b.year} : allocations ≠ budget`);
    lotAnnual.set(String(b.year), perLot);
    for (const l of sortedLots) {
      allocationRows.push({
        budgetId: id,
        lotId: l.id,
        totalAllocated: perLot.get(l.id) ?? 0,
        breakdown: breakdown.get(l.id) ?? [],
        createdAt: b.approvedAt
      });
    }
  }

  // ─────────────────────────────── appels de fonds
  type CallDraft = {
    id: string;
    lot: LotDef & { id: string };
    batchId: string;
    period: string;
    amount: number;
    issue: Date;
    due: Date;
    year: number;
    kind: 'REGULAR' | 'EXCEPTIONAL' | 'REPRISE';
  };
  const batchRows: Prisma.ChargeCallBatchCreateManyInput[] = [];
  const calls: CallDraft[] = [];
  const ordinal = ['1er', '2e', '3e', '4e'];
  for (const b of def.budgets) {
    const perLot = lotAnnual.get(String(b.year));
    assert(perLot, 'allocations manquantes');
    const fundLine = fundAnnual.get(b.year) ?? 0;
    const fundQ = Math.round(fundLine / 4);
    for (let q = 1; q <= b.quartersIssued; q++) {
      const month = (q - 1) * 3 + 1;
      const issue = d(b.year, month, q === 1 ? 5 : 2, 9);
      const due = d(b.year, month, 15, 23, 59);
      const period = `${b.year}-T${q}`;
      const batchId = randomUUID();
      const batchCalls: CallDraft[] = sortedLots.map(l => {
        const annual = perLot.get(l.id) ?? 0;
        const base = Math.round(annual / 4);
        const amount = q < 4 ? base : annual - 3 * base;
        return {
          id: randomUUID(),
          lot: l,
          batchId,
          period,
          amount,
          issue,
          due,
          year: b.year,
          kind: 'REGULAR' as const
        };
      });
      calls.push(...batchCalls);
      const total = sum(batchCalls.map(c => c.amount));
      batchRows.push({
        id: batchId,
        syndicateId: def.id,
        label: `Appel de fonds — ${ordinal[q - 1]} trimestre ${b.year}`,
        period,
        dueDate: due,
        batchType: 'REGULAR',
        budgetId: budgetId.get(b.year) ?? null,
        totalAmount: total,
        currency: 'XOF',
        status: 'SENT',
        createdAt: issue
      });
      const fundPart = q < 4 ? fundQ : fundLine - 3 * fundQ;
      addEntry({
        date: issue,
        journal: 'CH',
        ref: `APP-${period}`,
        description: `Appel de fonds du ${ordinal[q - 1]} trimestre ${b.year} (budget prévisionnel)`,
        sourceType: 'MANUAL',
        sourceId: batchId,
        lines: [
          ...batchCalls.map(c => ({
            acc: `450${c.lot.num}`,
            debit: c.amount,
            label: `Appel ${period} — lot ${c.lot.num}`,
            lotId: c.lot.id
          })),
          { acc: '701', credit: total - fundPart, label: `Provisions sur opérations courantes ${period}` },
          ...(fundPart > 0 ? [{ acc: '105', credit: fundPart, label: `Cotisation au fonds de travaux ${period}` }] : [])
        ]
      });
    }
  }
  for (const ex of def.exceptional) {
    const batchId = randomUUID();
    const alloc = distribute(ex.amount, 'GENERAL_SHARES');
    const batchCalls: CallDraft[] = sortedLots.map(l => ({
      id: randomUUID(),
      lot: l,
      batchId,
      period: ex.period,
      amount: alloc.get(l.id) ?? 0,
      issue: ex.issue,
      due: ex.due,
      year: ex.issue.getUTCFullYear(),
      kind: 'EXCEPTIONAL' as const
    }));
    calls.push(...batchCalls);
    batchRows.push({
      id: batchId,
      syndicateId: def.id,
      label: ex.label,
      period: ex.period,
      dueDate: ex.due,
      batchType: 'EXCEPTIONAL',
      budgetId: null,
      totalAmount: ex.amount,
      currency: 'XOF',
      status: 'SENT',
      createdAt: ex.issue
    });
    addEntry({
      date: ex.issue,
      journal: 'CH',
      ref: `APP-${ex.period}`,
      description: ex.label,
      sourceType: 'MANUAL',
      sourceId: batchId,
      lines: [
        ...batchCalls.map(c => ({
          acc: `450${c.lot.num}`,
          debit: c.amount,
          label: `${ex.period} — lot ${c.lot.num}`,
          lotId: c.lot.id
        })),
        { acc: ex.account, credit: ex.amount, label: ex.label }
      ]
    });
  }
  if (def.reprise) {
    const rp = def.reprise;
    const batchId = randomUUID();
    const batchCalls: CallDraft[] = Object.entries(rp.amounts).map(([num, amount]) => {
      const lot = lotByNum.get(num);
      assert(lot, `lot ${num}`);
      return {
        id: randomUUID(),
        lot,
        batchId,
        period: rp.period,
        amount,
        issue: rp.issue,
        due: rp.due,
        year: 2026,
        kind: 'REPRISE' as const
      };
    });
    calls.push(...batchCalls);
    batchRows.push({
      id: batchId,
      syndicateId: def.id,
      label: rp.label,
      period: rp.period,
      dueDate: rp.due,
      batchType: 'EXCEPTIONAL',
      budgetId: null,
      totalAmount: sum(batchCalls.map(c => c.amount)),
      currency: 'XOF',
      status: 'SENT',
      createdAt: rp.issue
    });
  }

  // ─────────────────────────────── paiements, relances, pénalités, échéanciers
  const paymentRows: Prisma.ChargePaymentCreateManyInput[] = [];
  // Lot S2 : chaque paiement de la demo est affecte en entier a son appel.
  const paymentAllocationRows: Prisma.ChargePaymentAllocationCreateManyInput[] = [];
  const reminderRows: Prisma.PaymentReminderCreateManyInput[] = [];
  const penaltyRows: Prisma.LatePaymentPenaltyCreateManyInput[] = [];
  const scheduleRows: Prisma.PaymentScheduleCreateManyInput[] = [];
  const instalmentRows: Prisma.PaymentScheduleInstalmentCreateManyInput[] = [];
  const callRows: Prisma.ChargeCallCreateManyInput[] = [];
  type OwnerEvent = {
    date: Date;
    type: 'CHARGE_CALL' | 'PAYMENT' | 'PENALTY' | 'WAIVER';
    debit?: number;
    credit?: number;
    label: string;
    reference?: string;
    sourceId: string;
    seq: number;
  };
  const ownerEvents = new Map<string, OwnerEvent[]>();
  let eventSeq = 0;
  const pushEvent = (lotId: string, e: Omit<OwnerEvent, 'seq'>) => {
    const arr = ownerEvents.get(lotId) ?? [];
    arr.push({ ...e, seq: eventSeq++ });
    ownerEvents.set(lotId, arr);
  };
  const treasuryByMonth = new Map<string, number>(); // "<compte>|<aaaa-mm>" → montant
  const firstPenaltyDone = new Set<string>();
  const scheduleByCall = new Map<string, ScheduleDef>();
  for (const s of def.schedules) scheduleByCall.set(`${s.lot}|${s.period}`, s);
  const collectedByCall = new Map<string, number>();

  const makeRef = (method: Method, date: Date, r: () => number): string => {
    const yy = String(date.getUTCFullYear()).slice(2);
    const ymd = `${yy}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
    const digits = (n: number) => Array.from({ length: n }, () => String(rint(r, 0, 9))).join('');
    const alnum = (n: number) =>
      Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[rint(r, 0, 31)]).join('');
    switch (method) {
      case 'VIREMENT':
        return `VIR ${ymd} ${digits(6)}`;
      case 'CHEQUE':
        return `CHQ n° ${digits(7)}`;
      case 'ESPECES':
        return `Reçu caisse n° ${date.getUTCFullYear()}-${digits(4)}`;
      case 'ORANGE':
        return `CI${ymd}.${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}.A${digits(5)}`;
      case 'MTN':
        return `MoMo ${digits(10)}`;
      case 'WAVE':
        return `T_${alnum(12)}`;
    }
  };
  const delayFor = (profile: Profile, r: () => number): number => {
    const x = r();
    switch (profile) {
      case 'ponctuel':
        return x < 0.04 ? rint(r, 8, 20) : rint(r, -9, 2);
      case 'normal':
        return x < 0.12 ? rint(r, 18, 40) : rint(r, -6, 14);
      case 'lent':
        return x < 0.3 ? rint(r, -2, 12) : rint(r, 16, 45);
      case 'retardataire':
        return rint(r, 22, 85);
    }
  };

  for (const call of calls) {
    const lot = call.lot;
    const ownerKey = primaryAt(lot, call.issue).key;
    const owner = contactByKey.get(ownerKey);
    assert(owner, `contact ${ownerKey}`);
    const methods = owner.methods ?? ['VIREMENT'];
    const r = mulberry32(hash(`${def.code}|${ownerKey}|${call.period}`));
    const payments: { date: Date; amount: number; method: Method }[] = [];
    const key = `${lot.num}|${call.period}`;
    const schedule = scheduleByCall.get(key);
    const pickMethod = (): Method => (methods.length > 1 && r() < 0.15 ? methods[1] : methods[0]);

    // Échéancier : chaque échéance réglée devient un paiement de l'appel.
    let scheduleTotal = 0;
    const scheduleInst: { due: Date; amount: number; paidAt?: Date }[] = [];
    if (schedule) {
      scheduleTotal = call.amount;
      const n = schedule.instalments.length;
      const base = Math.round(scheduleTotal / n);
      schedule.instalments.forEach((inst, i) => {
        const amount = i < n - 1 ? base : scheduleTotal - base * (n - 1);
        scheduleInst.push({ due: inst.due, amount, paidAt: inst.paidAt });
        if (inst.paidAt) payments.push({ date: inst.paidAt, amount, method: methods[0] });
      });
    }
    const override = def.overrides[key];
    if (override) {
      for (const o of override) {
        const already = sum(payments.map(p => p.amount));
        const amount = o.amount ?? (o.rest ? call.amount - already : Math.round(call.amount * (o.frac ?? 1)));
        payments.push({ date: o.date, amount, method: o.method ?? methods[0] });
      }
    } else if (!schedule) {
      const delay = delayFor(owner.profile ?? 'normal', r);
      let date = addDays(call.due, delay);
      date = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), rint(r, 8, 17), rint(r, 0, 59))
      );
      if (date <= call.issue) date = addDays(call.issue, 1);
      if (date < REFERENCE_DATE) payments.push({ date, amount: call.amount, method: pickMethod() });
    }
    payments.sort((a, b) => a.date.getTime() - b.date.getTime());
    const paidTotal = sum(payments.map(p => p.amount));
    assert(paidTotal <= call.amount, `paiements > appel pour ${key}`);
    assert(
      payments.every(p => p.date < REFERENCE_DATE),
      `paiement futur pour ${key}`
    );
    collectedByCall.set(call.id, paidTotal);

    const status =
      paidTotal === call.amount
        ? 'PAID'
        : paidTotal > 0
          ? 'PARTIAL'
          : call.due < REFERENCE_DATE
            ? 'OVERDUE'
            : 'PENDING';
    const callBounds = parsePeriodBounds(call.period);
    callRows.push({
      id: call.id,
      syndicateId: def.id,
      lotId: lot.id,
      batchId: call.batchId,
      period: call.period,
      periodStart: callBounds?.start ?? null,
      periodEnd: callBounds?.end ?? null,
      amount: call.amount,
      currency: 'XOF',
      dueDate: call.due,
      status,
      createdAt: call.issue
    });
    const callLabel =
      call.kind === 'REGULAR'
        ? `Appel de fonds ${call.period}`
        : call.kind === 'REPRISE'
          ? 'Arriérés repris de la gestion antérieure'
          : `Appel exceptionnel travaux ${call.period}`;
    pushEvent(lot.id, {
      date: call.kind === 'REPRISE' ? def.opening.date : call.issue,
      type: 'CHARGE_CALL',
      debit: call.amount,
      label: callLabel,
      reference: `APP-${call.period}-${lot.num}`,
      sourceId: call.id
    });

    let cumul = 0;
    let fullyPaidAt: Date | null = null;
    for (const p of payments) {
      const pid = randomUUID();
      const ref = makeRef(p.method, p.date, r);
      paymentRows.push({
        id: pid,
        lotId: lot.id,
        chargeCallId: call.id,
        amount: p.amount,
        paidAt: p.date,
        method: METHOD_LABEL[p.method],
        reference: ref,
        createdAt: p.date
      });
      paymentAllocationRows.push({
        id: pid,
        paymentId: pid,
        chargeCallId: call.id,
        amount: p.amount,
        source: 'PAYMENT'
      });
      pushEvent(lot.id, {
        date: p.date,
        type: 'PAYMENT',
        credit: p.amount,
        label: `Règlement ${call.period} (${METHOD_LABEL[p.method]})`,
        reference: ref,
        sourceId: pid
      });
      const t = METHOD_TREASURY[p.method];
      addEntry({
        date: p.date,
        journal: t.journal,
        description: `Règlement ${call.period} — lot ${lot.num} (${ownerName(ownerKey)}) — ${METHOD_LABEL[p.method]} ${ref}`,
        sourceType: 'CHARGE_PAYMENT',
        sourceId: pid,
        lines: [
          { acc: t.account, debit: p.amount, label: `${METHOD_LABEL[p.method]} ${ref}` },
          { acc: `450${lot.num}`, credit: p.amount, label: `Règlement ${call.period} — lot ${lot.num}`, lotId: lot.id }
        ]
      });
      if (t.account !== '512') {
        const mk = `${t.account}|${p.date.getUTCFullYear()}-${pad(p.date.getUTCMonth() + 1)}`;
        treasuryByMonth.set(mk, (treasuryByMonth.get(mk) ?? 0) + p.amount);
      }
      cumul += p.amount;
      if (cumul === call.amount && !fullyPaidAt) fullyPaidAt = p.date;
    }

    // Relances : J+15 (courriel ou SMS), J+30 (WhatsApp), J+50 (mise en demeure).
    const levels = [
      { level: 1, offset: 15, channel: owner.channel === 'EMAIL' ? ('EMAIL' as const) : ('SMS' as const) },
      { level: 2, offset: 30, channel: 'WHATSAPP' as const },
      { level: 3, offset: 50, channel: 'EMAIL' as const }
    ];
    const sent: { level: number; date: Date; id: string }[] = [];
    for (const lv of levels) {
      const at = new Date(
        Date.UTC(call.due.getUTCFullYear(), call.due.getUTCMonth(), call.due.getUTCDate() + lv.offset, 8, 30)
      );
      if (at >= REFERENCE_DATE) break;
      if (fullyPaidAt && fullyPaidAt <= at) break;
      if (schedule && schedule.agreedAt <= at) break;
      const id = randomUUID();
      sent.push({ level: lv.level, date: at, id });
      const failed = lv.channel === 'SMS' && r() < 0.12;
      reminderRows.push({
        id,
        chargeCallId: call.id,
        lotId: lot.id,
        reminderLevel: lv.level,
        sentAt: at,
        channel: lv.channel,
        status: failed ? 'FAILED' : lv.channel === 'EMAIL' && r() < 0.3 ? 'SENT' : 'DELIVERED',
        responseAction: failed ? 'Numéro injoignable — relance renvoyée par courriel' : null,
        createdAt: at
      });
    }
    if (sent.length) {
      const lastSent = sent[sent.length - 1];
      const row = reminderRows.find(x => x.id === lastSent.id);
      if (row && !row.responseAction) {
        if (fullyPaidAt) row.responseAction = `Règlement reçu le ${fmtDate(fullyPaidAt)}`;
        else if (schedule) row.responseAction = `Échéancier accordé le ${fmtDate(schedule.agreedAt)}`;
        else if (paidTotal > 0) row.responseAction = 'Règlement partiel reçu — solde toujours dû';
        else if (lastSent.level === 3) row.responseAction = 'Mise en demeure restée sans effet';
        else row.responseAction = 'Promesse de règlement du copropriétaire';
      }
    }

    // Pénalité de retard appliquée à la mise en demeure (1,5 %/mois, formule de l'API).
    const l3 = sent.find(s => s.level === 3);
    if (l3) {
      const paidBefore = sum(payments.filter(p => p.date <= l3.date).map(p => p.amount));
      const outstanding = call.amount - paidBefore;
      if (outstanding > 0) {
        const penaltyRate = 1.5;
        const daysLate = 50;
        const penaltyAmount = Math.round((outstanding * penaltyRate * daysLate) / 3000);
        const pid = randomUUID();
        let waiver = def.waivers[key];
        if (!waiver && def.waiveFirstPenalty.includes(ownerKey) && !firstPenaltyDone.has(ownerKey)) {
          const at = addDays(l3.date, 21);
          if (at < REFERENCE_DATE)
            waiver = { date: at, reason: 'Remise gracieuse accordée par le conseil syndical (premier retard)' };
        }
        firstPenaltyDone.add(ownerKey);
        const entryId = addEntry({
          date: l3.date,
          journal: 'OD',
          description: `Pénalité de retard ${call.period} — lot ${lot.num} (${ownerName(ownerKey)})`,
          sourceType: 'PENALTY',
          sourceId: pid,
          lines: [
            {
              acc: `450${lot.num}`,
              debit: penaltyAmount,
              label: `Pénalité ${call.period} — lot ${lot.num}`,
              lotId: lot.id
            },
            { acc: '716', credit: penaltyAmount, label: `Pénalité de retard ${call.period}` }
          ]
        });
        penaltyRows.push({
          id: pid,
          chargeCallId: call.id,
          lotId: lot.id,
          daysLate,
          penaltyRate,
          penaltyAmount,
          currency: 'XOF',
          appliedAt: l3.date,
          waived: Boolean(waiver),
          waivedAt: waiver?.date ?? null,
          waivedReason: waiver?.reason ?? null,
          journalEntryId: entryId,
          createdAt: l3.date
        });
        pushEvent(lot.id, {
          date: l3.date,
          type: 'PENALTY',
          debit: penaltyAmount,
          label: `Pénalité de retard ${call.period}`,
          sourceId: pid
        });
        if (waiver) {
          addEntry({
            date: waiver.date,
            journal: 'OD',
            description: `Remise de pénalité ${call.period} — lot ${lot.num}`,
            sourceType: 'PENALTY',
            sourceId: pid,
            lines: [
              { acc: '716', debit: penaltyAmount, label: `Remise de pénalité ${call.period}` },
              {
                acc: `450${lot.num}`,
                credit: penaltyAmount,
                label: `Remise de pénalité — lot ${lot.num}`,
                lotId: lot.id
              }
            ]
          });
          pushEvent(lot.id, {
            date: waiver.date,
            type: 'WAIVER',
            credit: penaltyAmount,
            label: 'Remise de pénalité',
            sourceId: pid
          });
        }
      }
    }

    if (schedule) {
      const sid = randomUUID();
      scheduleRows.push({
        id: sid,
        chargeCallId: call.id,
        lotId: lot.id,
        agreedAt: schedule.agreedAt,
        totalAmount: scheduleTotal,
        status: schedule.status,
        createdAt: schedule.agreedAt
      });
      for (const inst of scheduleInst) {
        instalmentRows.push({
          scheduleId: sid,
          dueDate: inst.due,
          amount: inst.amount,
          paidAt: inst.paidAt ?? null,
          paidAmount: inst.paidAt ? inst.amount : null,
          status: inst.paidAt ? 'PAID' : inst.due < REFERENCE_DATE ? 'LATE' : 'PENDING',
          createdAt: schedule.agreedAt
        });
      }
    }
  }
  for (const s of def.schedules) {
    assert(
      calls.some(c => `${c.lot.num}|${c.period}` === `${s.lot}|${s.period}`),
      `échéancier sans appel ${s.lot}|${s.period}`
    );
  }
  // Batch clos quand tous ses appels sont soldés.
  for (const b of batchRows) {
    const batchCalls = callRows.filter(c => c.batchId === b.id);
    if (batchCalls.every(c => c.status === 'PAID')) b.status = 'CLOSED';
  }

  // Remises mensuelles de la caisse et de la monnaie électronique en banque.
  for (const [mk, amount] of [...treasuryByMonth.entries()].sort()) {
    const [acc, ym] = mk.split('|');
    const [y, m] = ym.split('-').map(Number);
    const at = lastDayOfMonth(y, m);
    if (at >= REFERENCE_DATE) continue;
    addEntry({
      date: at,
      journal: 'BQ',
      description:
        acc === '531'
          ? `Remise des espèces en banque — ${pad(m)}/${y}`
          : `Virement des comptes marchands mobile money vers la banque — ${pad(m)}/${y}`,
      sourceType: 'MANUAL',
      lines: [
        { acc: '512', debit: amount, label: acc === '531' ? 'Remise d’espèces' : 'Transfert mobile money' },
        { acc, credit: amount, label: acc === '531' ? 'Sortie de caisse vers la banque' : 'Transfert vers la banque' }
      ]
    });
  }

  // ─────────────────────────────── comptes copropriétaires (grand livre de lot)
  const ownerAccountRows: Prisma.OwnerAccountCreateManyInput[] = [];
  const ownerTxRows: Prisma.OwnerAccountTransactionCreateManyInput[] = [];
  const ownerBalance = new Map<string, number>();
  for (const l of sortedLots) {
    const aid = randomUUID();
    const events = (ownerEvents.get(l.id) ?? []).sort((a, b) => a.date.getTime() - b.date.getTime() || a.seq - b.seq);
    let bal = 0;
    events.forEach((e, i) => {
      bal += (e.debit ?? 0) - (e.credit ?? 0);
      ownerTxRows.push({
        accountId: aid,
        transactionDate: e.date,
        type: e.type,
        debit: e.debit ?? null,
        credit: e.credit ?? null,
        balanceAfter: bal,
        label: e.label,
        reference: e.reference ?? null,
        sourceId: e.sourceId,
        createdAt: new Date(e.date.getTime() + i)
      });
    });
    ownerBalance.set(l.num, bal);
    ownerAccountRows.push({
      id: aid,
      syndicateId: def.id,
      lotId: l.id,
      contactId: cid(currentOwner(l).key),
      balance: bal,
      currency: 'XOF',
      createdAt: def.managementStart
    });
  }

  // ─────────────────────────────── contrats
  const contractRows: Prisma.MaintenanceContractCreateManyInput[] = [];
  const contractId = new Map<string, string>();
  const contractLinkRows: Prisma.SyndicateContractLinkCreateManyInput[] = [];
  for (const c of def.contracts) {
    const id = randomUUID();
    contractId.set(c.key, id);
    const providerId = providerIds.get(c.supplier);
    assert(providerId, `prestataire ${c.supplier}`);
    contractRows.push({
      id,
      syndicateId: def.id,
      providerId,
      nature: c.nature,
      startDate: c.start,
      endDate: c.end,
      annualAmount: c.annual,
      currency: 'XOF',
      renewalAlertDays: c.alertDays,
      status: c.status,
      createdAt: addDays(c.start, -20) > def.managementStart ? addDays(c.start, -20) : def.managementStart
    });
    if (c.status === 'ACTIVE' && c.lineCode) {
      contractLinkRows.push({
        syndicateId: def.id,
        maintenanceContractId: id,
        scope: 'Parties communes générales',
        budgetLineItemId: lineItemId.get(`2026:${c.lineCode}`) ?? null,
        createdAt: c.start > def.managementStart ? c.start : def.managementStart
      });
    }
  }

  // ─────────────────────────────── équipements communs
  const assetId = new Map<string, string>();
  const assetRows: Prisma.CommonAreaAssetCreateManyInput[] = def.assets.map(a => {
    const id = randomUUID();
    assetId.set(a.key, id);
    return {
      id,
      syndicateId: def.id,
      name: a.name,
      category: a.category,
      lastMaintenanceDate: a.last ?? null,
      nextMaintenanceDate: a.next ?? null,
      notes: a.notes,
      createdAt: def.managementStart
    };
  });

  // ─────────────────────────────── factures fournisseurs & dépenses
  const actual = new Map<string, number>(); // "<année>:<code>"
  const addActual = (year: number, code: string, v: number) =>
    actual.set(`${year}:${code}`, (actual.get(`${year}:${code}`) ?? 0) + v);
  const invoice = (o: {
    date: Date;
    payDate?: Date;
    supplier: string;
    account: string;
    amount: number;
    label: string;
    year: number;
    lineCode?: string;
  }): string => {
    const s = supplierByKey.get(o.supplier);
    assert(s, `fournisseur ${o.supplier}`);
    const id = addEntry({
      date: o.date,
      journal: 'AC',
      description: `Facture ${s.name} — ${o.label}`,
      sourceType: 'MANUAL',
      lines: [
        { acc: o.account, debit: o.amount, label: o.label },
        { acc: s.account, credit: o.amount, label: `Facture ${s.name}` }
      ]
    });
    if (o.lineCode) addActual(o.year, o.lineCode, o.amount);
    const pay = o.payDate ?? addDays(o.date, rint(rng, 8, 20));
    if (pay < REFERENCE_DATE) {
      addEntry({
        date: pay,
        journal: 'BQ',
        description: `Règlement ${s.name} — ${o.label}`,
        sourceType: 'MANUAL',
        lines: [
          { acc: s.account, debit: o.amount, label: `Règlement ${s.name}` },
          { acc: '512', credit: o.amount, label: `Virement ${s.name}` }
        ]
      });
    }
    return id;
  };

  // Incidents : coûts imputés au budget (petits travaux) ou à l'assurance.
  const incidentCostByYear = new Map<number, number>();
  for (const inc of def.incidents) {
    for (const c of inc.costs ?? []) {
      if ((c.type === 'SYNDICATE_BUDGET' || c.type === 'INSURANCE') && inc.resolvedAt) {
        const y = inc.resolvedAt.getUTCFullYear();
        incidentCostByYear.set(y, (incidentCostByYear.get(y) ?? 0) + c.amount);
      }
    }
  }
  const specialTravByYear = new Map<number, number>();
  for (const s of def.specialInvoices) {
    if (s.lineCode === 'TRAV') {
      const y = s.date.getUTCFullYear();
      specialTravByYear.set(y, (specialTravByYear.get(y) ?? 0) + s.amount);
    }
  }

  const monthsFor = (billing: Billing): number[] => {
    switch (billing) {
      case 'monthly':
      case 'bankfees':
        return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      case 'bimonthly':
        return [2, 4, 6, 8, 10, 12];
      case 'quarterly':
        return [3, 6, 9, 12];
      case 'annual':
        return [1];
      case 'none':
        return [];
    }
  };
  for (const b of def.budgets) {
    if (!def.years.includes(b.year)) continue;
    for (const line of def.lines) {
      const forecast = b.amounts[line.code];
      if (forecast === undefined || line.billing === 'none') continue;
      const months = monthsFor(line.billing);
      let base = forecast / months.length;
      if (line.code === 'TRAV') {
        const reserved = (incidentCostByYear.get(b.year) ?? 0) + (specialTravByYear.get(b.year) ?? 0);
        base = Math.max(0, forecast - reserved) / months.length;
      }
      const supplierKey = b.suppliers?.[line.code] ?? line.supplier;
      months.forEach((m, i) => {
        const date = line.billing === 'bankfees' ? lastDayOfMonth(b.year, m) : d(b.year, m, 20, 11);
        if (date >= REFERENCE_DATE) return;
        let amount: number;
        if (line.variance === 0) {
          const rounded = Math.round(base);
          amount = i < months.length - 1 ? rounded : forecast - rounded * (months.length - 1);
        } else {
          amount = Math.round((base * (1 + (rng() * 2 - 1) * line.variance)) / 100) * 100;
        }
        if (amount <= 0) return;
        if (line.billing === 'bankfees') {
          addEntry({
            date,
            journal: 'BQ',
            description: `Frais bancaires, SMS et envois — ${pad(m)}/${b.year}`,
            sourceType: 'MANUAL',
            lines: [
              { acc: line.account, debit: amount, label: 'Frais de tenue de compte et d’envoi' },
              { acc: '512', credit: amount, label: 'Prélèvement bancaire' }
            ]
          });
          addActual(b.year, line.code, amount);
        } else {
          assert(supplierKey, `fournisseur manquant pour ${line.code}`);
          const period =
            line.billing === 'annual'
              ? `année ${b.year}`
              : line.billing === 'quarterly'
                ? `${ordinal[m / 3 - 1]} trimestre ${b.year}`
                : `${pad(m)}/${b.year}`;
          invoice({
            date,
            supplier: supplierKey,
            account: line.account,
            amount,
            label: `${b.descriptions?.[line.code] ?? line.description} — ${period}`,
            year: b.year,
            lineCode: line.code
          });
        }
      });
    }
  }
  for (const s of def.specialInvoices) {
    invoice({
      date: s.date,
      payDate: s.payDate,
      supplier: s.supplier,
      account: s.account,
      amount: s.amount,
      label: s.label,
      year: s.date.getUTCFullYear(),
      lineCode: s.lineCode
    });
  }
  for (const t of def.fundTransfers) {
    addEntry({
      date: t.date,
      journal: 'OD',
      description: t.label,
      sourceType: 'FUND',
      lines: [
        { acc: '105', debit: t.amount, label: 'Prélèvement sur le fonds de travaux' },
        { acc: '702', credit: t.amount, label: 'Financement des travaux votés' }
      ]
    });
  }
  // Cotisation au fonds de travaux : « réalisé » = montant appelé.
  for (const b of def.budgets) {
    if (b.quartersIssued === 0) continue;
    const fundLine = fundAnnual.get(b.year) ?? 0;
    const q = Math.round(fundLine / 4);
    const called = b.quartersIssued === 4 ? fundLine : q * b.quartersIssued;
    addActual(b.year, 'FTRAV', called);
  }

  // ─────────────────────────────── incidents, tickets de maintenance
  const incidentRows: Prisma.SyndicateIncidentCreateManyInput[] = [];
  const imputationRows: Prisma.IncidentCostImputationCreateManyInput[] = [];
  const ticketRows: Prisma.MaintenanceTicketCreateManyInput[] = [];
  const ticketHistoryRows: Prisma.MaintenanceTicketStatusHistoryCreateManyInput[] = [];
  const maintenanceLinkRows: Prisma.SyndicateMaintenanceLinkCreateManyInput[] = [];
  for (const inc of def.incidents) {
    const id = randomUUID();
    const lot = inc.lot ? lotByNum.get(inc.lot) : undefined;
    const providerId = inc.provider ? (providerIds.get(inc.provider) ?? null) : null;
    let ticketId: string | null = null;
    if (inc.ticket) {
      ticketId = randomUUID();
      const tk = inc.ticket;
      const resolvedAt = tk.status === 'RESOLVED' ? (inc.resolvedAt ?? null) : null;
      ticketRows.push({
        id: ticketId,
        tenant_id: TENANT_ID,
        property_id: def.property.id,
        created_by_contact_id: cid(inc.reporter),
        title: tk.title,
        category: tk.category,
        priority: tk.priority,
        description: inc.description,
        location_details: tk.location,
        status: tk.status,
        resolution_notes: tk.resolution ?? null,
        declared_at: inc.reportedAt,
        assigned_at: tk.status !== 'DECLARED' ? addDays(inc.reportedAt, 0.2) : null,
        in_progress_at: tk.status === 'IN_PROGRESS' || tk.status === 'RESOLVED' ? addDays(inc.reportedAt, 0.5) : null,
        resolved_at: resolvedAt,
        created_at: inc.reportedAt
      });
      const steps: ('DECLARED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED')[] = ['DECLARED'];
      if (tk.status !== 'DECLARED') steps.push('ASSIGNED');
      if (tk.status === 'IN_PROGRESS' || tk.status === 'RESOLVED') steps.push('IN_PROGRESS');
      if (tk.status === 'RESOLVED') steps.push('RESOLVED');
      steps.forEach((s, i) => {
        ticketHistoryRows.push({
          tenant_id: TENANT_ID,
          ticket_id: ticketId as string,
          from_status: i === 0 ? null : steps[i - 1],
          to_status: s,
          note:
            s === 'DECLARED'
              ? 'Signalement reçu par le syndic'
              : s === 'ASSIGNED'
                ? 'Prestataire missionné'
                : s === 'IN_PROGRESS'
                  ? 'Intervention en cours'
                  : 'Intervention terminée',
          changed_at: s === 'RESOLVED' && resolvedAt ? resolvedAt : addDays(inc.reportedAt, i * 0.25)
        });
      });
      maintenanceLinkRows.push({
        syndicateId: def.id,
        maintenanceRequestId: ticketId,
        lotId: lot?.id ?? null,
        isCommonArea: !lot || tk.imputation === 'SYNDICATE',
        costImputation: tk.imputation,
        imputationDetail:
          tk.imputation === 'LOT_OWNER'
            ? `Réparation privative à la charge du lot ${inc.lot}`
            : 'Parties communes — budget du syndicat',
        createdAt: inc.reportedAt
      });
    }
    incidentRows.push({
      id,
      syndicateId: def.id,
      reportedByContactId: cid(inc.reporter),
      lotId: lot?.id ?? null,
      assetId: inc.asset ? (assetId.get(inc.asset) ?? null) : null,
      incidentType: inc.type,
      description: inc.description,
      urgency: inc.urgency,
      status: inc.status,
      reportedAt: inc.reportedAt,
      resolvedAt: inc.resolvedAt ?? null,
      maintenanceWorkOrderId: ticketId,
      providerId,
      createdAt: inc.reportedAt
    });
    for (const c of inc.costs ?? []) {
      let entryId: string | null = null;
      let budgetLineId: string | null = null;
      if ((c.type === 'SYNDICATE_BUDGET' || c.type === 'INSURANCE') && inc.resolvedAt && c.amount > 0) {
        const y = inc.resolvedAt.getUTCFullYear();
        const invoiceId = invoice({
          date: addDays(inc.resolvedAt, 2),
          supplier: c.supplier ?? 'DIV',
          account: '615',
          amount: c.amount,
          label: `Intervention du ${fmtDate(inc.reportedAt)} — ${inc.description.slice(0, 70)}`,
          year: y,
          lineCode: 'TRAV'
        });
        budgetLineId = lineItemId.get(`${y}:TRAV`) ?? null;
        entryId = invoiceId;
        if (c.type === 'INSURANCE' && c.reimbursedAt) {
          entryId = addEntry({
            date: c.reimbursedAt,
            journal: 'BQ',
            description: `Indemnité d'assurance — sinistre du ${fmtDate(inc.reportedAt)}`,
            sourceType: 'MANUAL',
            lines: [
              { acc: '512', debit: c.amount, label: 'Virement de l’assureur' },
              { acc: '718', credit: c.amount, label: 'Indemnité dégât des eaux' }
            ]
          });
          budgetLineId = null;
        }
      }
      imputationRows.push({
        incidentId: id,
        imputationType: c.type,
        amount: c.amount,
        currency: 'XOF',
        budgetLineId,
        lotId: c.lot ? (lotByNum.get(c.lot)?.id ?? null) : null,
        contractId: c.contract ? (contractId.get(c.contract) ?? null) : null,
        journalEntryId: entryId,
        notes: c.notes,
        createdAt: inc.resolvedAt ?? inc.reportedAt
      });
    }
  }

  for (const row of budgetLineRows) {
    const b = def.budgets.find(x => budgetId.get(x.year) === row.budgetId);
    const code = def.lines.find(l => lineItemId.get(`${b?.year}:${l.code}`) === row.id)?.code;
    row.amountActual = b && code ? (actual.get(`${b.year}:${code}`) ?? 0) : 0;
  }

  // ─────────────────────────────── textes d'AG calculés sur les données générées
  const entryTime = new Map(entryDrafts.map(e => [e.row.id, new Date(e.row.entryDate).getTime()]));
  const fundAccountId = accountId.get('105');
  const endOf = (iso: string) => new Date(`${iso}T23:59:59Z`).getTime();
  const fundAt = (iso: string): number =>
    -sum(
      entryLines
        .filter(l => l.accountId === fundAccountId && (entryTime.get(l.entryId) ?? Infinity) <= endOf(iso))
        .map(l => Number(l.debit ?? 0) - Number(l.credit ?? 0))
    );
  const soldeAt = (num: string, iso: string): number => {
    const lot = lotByNum.get(num);
    assert(lot, `lot ${num} inconnu (texte d'AG)`);
    return sum(
      (ownerEvents.get(lot.id) ?? [])
        .filter(e => e.date.getTime() <= endOf(iso))
        .map(e => (e.debit ?? 0) - (e.credit ?? 0))
    );
  };
  const chargesOf = (y: number) =>
    sum(def.lines.filter(l => l.code !== 'FTRAV').map(l => actual.get(`${y}:${l.code}`) ?? 0));
  const courantOf = (y: number) =>
    sum(
      Object.entries(def.budgets.find(b => b.year === y)?.amounts ?? {})
        .filter(([k]) => k !== 'FTRAV')
        .map(([, v]) => v)
    );
  const resolveText = (text: string): string =>
    text.replace(/\{\{(\w+):([^}]+)\}\}/g, (_m: string, kind: string, arg: string) => {
      if (kind === 'charges') return fcfa(chargesOf(Number(arg)));
      if (kind === 'budgetCourant') return fcfa(courantOf(Number(arg)));
      if (kind === 'ecart') {
        const pct = ((chargesOf(Number(arg)) - courantOf(Number(arg))) / courantOf(Number(arg))) * 100;
        return `${pct >= 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')} %`;
      }
      if (kind === 'fonds') return fcfa(fundAt(arg));
      if (kind === 'solde') {
        const [num, iso] = arg.split(':');
        return fcfa(soldeAt(num, iso));
      }
      throw new Error(`Marqueur de texte inconnu : ${kind}`);
    });
  for (const row of agendaRows) row.discussions = ((row.discussions ?? []) as string[]).map(resolveText);
  for (const [k, v] of meetingSummaries) meetingSummaries.set(k, v.map(resolveText));

  // ─────────────────────────────── références chronologiques des écritures
  entryDrafts.sort(
    (a, b) => new Date(a.row.entryDate).getTime() - new Date(b.row.entryDate).getTime() || a.order - b.order
  );
  const seq = new Map<string, number>();
  for (const e of entryDrafts) {
    if (e.explicitRef) {
      e.row.reference = e.explicitRef;
      continue;
    }
    const k = `${e.year}:${e.journal}`;
    const n = (seq.get(k) ?? 0) + 1;
    seq.set(k, n);
    e.row.reference = `${e.journal}-${e.year}-${pad(n, 4)}`;
  }

  // ─────────────────────────────── contrôles de cohérence
  for (const l of sortedLots) {
    const acc = accBalance.get(`450${l.num}`) ?? 0;
    assert(
      acc === ownerBalance.get(l.num),
      `lot ${l.num} : compte 450 (${acc}) ≠ compte copropriétaire (${ownerBalance.get(l.num)})`
    );
  }
  const totalDebit = sum(entryLines.map(x => Number(x.debit ?? 0)));
  const totalCredit = sum(entryLines.map(x => Number(x.credit ?? 0)));
  assert(totalDebit === totalCredit, 'balance générale déséquilibrée');
  // Solde comptable (provisions) des fonds, compte 103/105 : sert au texte des
  // AG (`fundAt`, marqueur {{fonds:...}}), qui reflète les cotisations APPELÉES
  // (constatées à l'émission de l'appel), pas l'argent réellement encaissé.
  // Distinct du solde de TRÉSORERIE du fonds (`fundCashRoulement`/`fundCashTravaux`
  // plus bas), qui est celui affiché à l'écran (`SyndicateFund.balance`) et qui
  // ne bouge qu'à l'encaissement d'un paiement — comme le fait l'application
  // (`lib/syndics/fund-credits.ts`, crédit au paiement, pas à l'appel). Les deux
  // soldes divergent normalement (un appel émis n'est pas forcément payé) ; ce
  // n'est pas une incohérence à corriger.
  const fundRoulement = -(accBalance.get('103') ?? 0);
  const fundTravaux = -(accBalance.get('105') ?? 0);
  assert(fundTravaux >= 0 && fundRoulement >= 0, 'fonds négatifs (comptabilité)');
  for (const acc of ['512', '531', '5171']) {
    assert((accBalance.get(acc) ?? 0) >= 0, `trésorerie ${acc} négative`);
  }
  for (const b of batchRows) {
    const total = sum(callRows.filter(c => c.batchId === b.id).map(c => Number(c.amount)));
    assert(total === Number(b.totalAmount), `batch ${b.period} : total ≠ somme des appels`);
  }

  // ─────────────────────────────── documents
  const docRows: Prisma.SyndicateDocumentCreateManyInput[] = [];
  const pdfJobs: { file: string; title: string; body: string[] }[] = [];
  const docDir = path.join(UPLOADS_ROOT, 'syndics', def.id, 'documents');
  const budgetBody = (year: number): string[] => {
    const b = def.budgets.find(x => x.year === year);
    if (!b) return [];
    const out = [
      `Budget prévisionnel ${year} : ${fcfa(sum(Object.values(b.amounts)))}, approuvé le ${fmtDate(b.approvedAt)}.`
    ];
    for (const line of def.lines) {
      const v = b.amounts[line.code];
      if (v !== undefined) out.push(`• ${b.descriptions?.[line.code] ?? line.description} : ${fcfa(v)}`);
    }
    out.push('Appels de fonds trimestriels, échéance le 15 du premier mois de chaque trimestre.');
    return out;
  };
  for (const doc of def.documents) {
    let file: string;
    let body = doc.body;
    if (doc.meeting) {
      file = `pv-${slug(doc.meeting)}.pdf`;
      body = meetingSummaries.get(doc.meeting) ?? [];
    } else {
      file = `${slug(doc.title).slice(0, 70)}.pdf`;
      if (doc.type === 'BUDGET') {
        const y = Number((doc.title.match(/(20\d\d)/) ?? [])[1]);
        body = budgetBody(y);
      }
    }
    docRows.push({
      syndicateId: def.id,
      title: doc.title,
      type: doc.type,
      fileUrl: `/uploads/syndics/${def.id}/documents/${file}`,
      expiresAt: doc.expiresAt ?? null,
      createdAt: doc.date
    });
    pdfJobs.push({ file: path.join(docDir, file), title: doc.title, body });
  }

  // ─────────────────────────────── historique des fonds (journal de trésorerie)
  // Solde repris + part « fonds de travaux » de chaque paiement encaissé sur un
  // appel régulier + dépenses votées (`def.fundTransfers`) — même journal que
  // l'application (`lib/syndics/fund-credits.ts`, `recordFundMovementTx`),
  // ici calculé par la fonction pure testée dans
  // `__tests__/unit/syndics.demo-seed-funds.test.ts`.
  const callById = new Map(calls.map(c => [c.id, c]));
  const fundPayments: FundPaymentInput[] = paymentRows.flatMap(p => {
    const call = callById.get(p.chargeCallId as string);
    if (!call) return [];
    return [
      {
        paymentId: p.id as string,
        chargeCallId: call.id,
        amount: Number(p.amount),
        paidAt: p.paidAt as Date,
        lotId: call.lot.id,
        lotNum: call.lot.num,
        period: call.period,
        year: call.year,
        kind: call.kind
      }
    ];
  });
  const { movements: fundMovementRows, balances: fundCashBalances } = buildSyndicFundMovements({
    tenantId: TENANT_ID,
    travauxFundId: fundTravauxId,
    openings: [
      { fundId: fundRoulementId, amount: def.opening.roulement, date: def.opening.date, label: def.opening.label },
      { fundId: fundTravauxId, amount: def.opening.travaux, date: def.opening.date, label: def.opening.label }
    ],
    payments: fundPayments,
    lotAnnualByYear: lotAnnual,
    fundLotAnnualByYear: fundLotAnnual,
    expenses: def.fundTransfers.map(t => ({ fundId: fundTravauxId, amount: t.amount, date: t.date, label: t.label }))
  });
  const fundCashRoulement = fundCashBalances.get(fundRoulementId) ?? 0;
  const fundCashTravaux = fundCashBalances.get(fundTravauxId) ?? 0;
  assert(fundCashRoulement >= 0 && fundCashTravaux >= 0, 'fonds négatifs (trésorerie)');
  const fundMovementSum = (fundId: string) =>
    sum(fundMovementRows.filter(m => m.fundId === fundId).map(m => (m.direction === 'CREDIT' ? m.amount : -m.amount)));
  assert(
    Math.round(fundMovementSum(fundRoulementId) * 100) === Math.round(fundCashRoulement * 100),
    'fonds de roulement : solde ≠ somme du journal'
  );
  assert(
    Math.round(fundMovementSum(fundTravauxId) * 100) === Math.round(fundCashTravaux * 100),
    'fonds de travaux : solde ≠ somme du journal'
  );

  // ─────────────────────────────── écriture en base (une transaction par copropriété)
  const fundRows: Prisma.SyndicateFundCreateManyInput[] = [
    {
      id: fundRoulementId,
      syndicateId: def.id,
      name: 'Fonds de roulement',
      balance: fundCashRoulement,
      currency: 'XOF',
      createdAt: def.managementStart
    },
    {
      id: fundTravauxId,
      syndicateId: def.id,
      name: 'Fonds de travaux',
      balance: fundCashTravaux,
      currency: 'XOF',
      createdAt: def.managementStart
    }
  ];
  const paymentMethodRows: Prisma.SyndicPaymentMethodCreateManyInput[] = [
    {
      syndicateId: def.id,
      type: 'BANK_TRANSFER',
      provider: def.bank.name,
      accountRef: def.bank.iban,
      label: 'Virement bancaire',
      isDefault: true
    },
    {
      syndicateId: def.id,
      type: 'MOBILE_MONEY',
      provider: 'Orange Money',
      accountRef: def.mobileNumbers.orange,
      label: 'Orange Money (compte marchand)'
    },
    {
      syndicateId: def.id,
      type: 'MOBILE_MONEY',
      provider: 'MTN MoMo',
      accountRef: def.mobileNumbers.mtn,
      label: 'MTN Mobile Money (compte marchand)'
    },
    {
      syndicateId: def.id,
      type: 'MOBILE_MONEY',
      provider: 'Wave',
      accountRef: def.mobileNumbers.wave,
      label: 'Wave (paiement marchand)'
    },
    {
      syndicateId: def.id,
      type: 'CHECK',
      provider: def.bank.name,
      accountRef: null,
      label: `Chèque à l'ordre du « Syndicat des copropriétaires ${def.name} »`
    },
    {
      syndicateId: def.id,
      type: 'CASH',
      provider: 'Ivoire Résidences',
      accountRef: null,
      label: 'Espèces au bureau du syndic (reçu remis)'
    }
  ];
  const reminderConfigRows: Prisma.ReminderConfigCreateManyInput[] = [
    {
      syndicateId: def.id,
      level: 1,
      delayDays: 15,
      channels: ['EMAIL', 'SMS'],
      templateSubject: 'Rappel — appel de fonds {{period}} non réglé',
      templateBody:
        'Bonjour {{ownerName}}, sauf erreur de notre part, l’appel de fonds {{period}} du lot {{lotNumber}} ({{amount}}) reste impayé. Merci de procéder au règlement par virement, Orange Money, MTN MoMo ou Wave.',
      autoSend: true,
      penaltyRateMonthly: null
    },
    {
      syndicateId: def.id,
      level: 2,
      delayDays: 30,
      channels: ['WHATSAPP', 'EMAIL'],
      templateSubject: 'Deuxième relance — appel de fonds {{period}}',
      templateBody:
        'Bonjour {{ownerName}}, malgré notre premier rappel, le solde de {{outstanding}} du lot {{lotNumber}} reste dû. Contactez le syndic si vous souhaitez un échéancier.',
      autoSend: true,
      penaltyRateMonthly: null
    },
    {
      syndicateId: def.id,
      level: 3,
      delayDays: 50,
      channels: ['EMAIL'],
      templateSubject: 'Mise en demeure — lot {{lotNumber}}',
      templateBody:
        'Madame, Monsieur, nous vous mettons en demeure de régler sous huit jours la somme de {{outstanding}}. À défaut, une pénalité de 1,5 % par mois sera appliquée conformément au règlement de copropriété, et le dossier pourra être transmis au conseil syndical pour recouvrement.',
      autoSend: false,
      penaltyRateMonthly: 1.5
    }
  ];

  await prisma.$transaction(
    async tx => {
      await tx.maintenanceTicket.deleteMany({ where: { tenant_id: TENANT_ID, property_id: def.property.id } });
      await tx.syndicate.deleteMany({ where: { id: def.id, tenantId: TENANT_ID } });

      await tx.syndicate.create({
        data: {
          id: def.id,
          tenantId: TENANT_ID,
          propertyId: def.property.id,
          name: def.name,
          registrationNo: def.registrationNo,
          fiscalYear: 2026,
          syndicManagerId: cid(def.manager),
          address: def.address,
          cadastralReference: def.cadastral,
          totalLots: lots.length,
          totalBuildings: def.buildings,
          status: 'ACTIVE',
          regulationDocUrl: docRows.find(x => x.type === 'REGULATION')?.fileUrl ?? null,
          createdAt: def.managementStart
        }
      });
      const insert = async <T>(label: string, rows: T[], fn: (data: T[]) => Promise<unknown>) => {
        for (const part of chunk(rows)) await fn(part);
        void label;
      };
      await insert('lots', lotRows, data => tx.syndicateLot.createMany({ data }));
      await insert('ownerProfiles', ownerProfiles, data => tx.lotOwnerProfile.createMany({ data }));
      await insert('tenantProfiles', tenantProfiles, data => tx.lotTenantProfile.createMany({ data }));
      await insert('assignments', assignments, data => tx.lotTenantAssignment.createMany({ data }));
      await tx.syndicPaymentMethod.createMany({ data: paymentMethodRows });
      await tx.reminderConfig.createMany({ data: reminderConfigRows });
      await tx.commonAreaAsset.createMany({ data: assetRows });
      await tx.chartOfAccount.createMany({ data: accounts.slice(0, parentCount) });
      await tx.chartOfAccount.createMany({ data: accounts.slice(parentCount) });
      await tx.accountingJournal.createMany({ data: journals });
      await tx.generalMeeting.createMany({ data: meetingRows });
      await tx.gMAgendaItem.createMany({ data: agendaRows });
      await tx.gMResolution.createMany({ data: resolutionRows });
      await insert('votes', voteRows, data => tx.gMVote.createMany({ data }));
      if (proxyRows.length) await tx.gMProxy.createMany({ data: proxyRows });
      await tx.syndicateBudget.createMany({ data: budgetRows });
      // Les fonds sont créés ici (avant les postes de budget) : un poste FTRAV
      // porte `fundId` (contrainte FK) dès sa création, comme le ferait l'app.
      await tx.syndicateFund.createMany({ data: fundRows });
      await tx.budgetLineItem.createMany({ data: budgetLineRows });
      await insert('allocations', allocationRows, data => tx.budgetAllocation.createMany({ data }));
      await tx.chargeCallBatch.createMany({ data: batchRows });
      await insert('calls', callRows, data => tx.chargeCall.createMany({ data }));
      await insert('payments', paymentRows, data => tx.chargePayment.createMany({ data }));
      await insert('paymentAllocations', paymentAllocationRows, data =>
        tx.chargePaymentAllocation.createMany({ data })
      );
      await insert('reminders', reminderRows, data => tx.paymentReminder.createMany({ data }));
      await insert(
        'entries',
        entryDrafts.map(e => e.row),
        data => tx.journalEntry.createMany({ data })
      );
      await insert('lines', entryLines, data => tx.journalEntryLine.createMany({ data }));
      if (penaltyRows.length) await tx.latePaymentPenalty.createMany({ data: penaltyRows });
      if (scheduleRows.length) await tx.paymentSchedule.createMany({ data: scheduleRows });
      if (instalmentRows.length) await tx.paymentScheduleInstalment.createMany({ data: instalmentRows });
      await tx.ownerAccount.createMany({ data: ownerAccountRows });
      await insert('ownerTx', ownerTxRows, data => tx.ownerAccountTransaction.createMany({ data }));
      await tx.maintenanceContract.createMany({ data: contractRows });
      if (contractLinkRows.length) await tx.syndicateContractLink.createMany({ data: contractLinkRows });
      if (ticketRows.length) {
        await tx.maintenanceTicket.createMany({ data: ticketRows });
        await tx.maintenanceTicketStatusHistory.createMany({ data: ticketHistoryRows });
        await tx.syndicateMaintenanceLink.createMany({ data: maintenanceLinkRows });
      }
      await tx.syndicateIncident.createMany({ data: incidentRows });
      if (imputationRows.length) await tx.incidentCostImputation.createMany({ data: imputationRows });
      await insert('fundMovements', fundMovementRows, data => tx.syndicateFundMovement.createMany({ data }));
      await tx.syndicateDocument.createMany({ data: docRows });
    },
    { timeout: 600000, maxWait: 60000 }
  );

  // ─────────────────────────────── fichiers PDF (répertoire propre à la copropriété)
  fs.rmSync(docDir, { recursive: true, force: true });
  for (const job of pdfJobs) {
    await writePdf(
      job.file,
      `Syndicat des copropriétaires — ${def.name}`,
      job.title,
      job.body.length ? job.body : [job.title]
    );
  }

  // ─────────────────────────────── synthèse
  const years = [...new Set([...def.years, ...def.budgets.map(b => b.year)])].sort();
  const summaryYears = years.map(year => {
    const yearCalls = calls.filter(c => c.year === year);
    const called = sum(yearCalls.map(c => c.amount));
    const collected = sum(yearCalls.map(c => collectedByCall.get(c.id) ?? 0));
    return {
      year,
      budget: budgetTotals.get(year) ?? 0,
      called,
      collected,
      outstanding: called - collected,
      meetings: def.meetings.filter(m => m.status === 'COMPLETED' && m.date.getUTCFullYear() === year).length
    };
  });
  return {
    name: def.name,
    id: def.id,
    address: def.address,
    lots: lots.length,
    years: summaryYears,
    counts: {
      lots: lotRows.length,
      lot_owner_profiles: ownerProfiles.length,
      lot_tenant_profiles: tenantProfiles.length,
      lot_tenant_assignments: assignments.length,
      payment_methods: paymentMethodRows.length,
      reminder_configs: reminderConfigRows.length,
      common_area_assets: assetRows.length,
      chart_of_accounts: accounts.length,
      accounting_journals: journals.length,
      general_meetings: meetingRows.length,
      gm_agenda_items: agendaRows.length,
      gm_resolutions: resolutionRows.length,
      gm_votes: voteRows.length,
      gm_proxies: proxyRows.length,
      syndicate_budgets: budgetRows.length,
      budget_line_items: budgetLineRows.length,
      budget_allocations: allocationRows.length,
      charge_call_batches: batchRows.length,
      charge_calls: callRows.length,
      charge_payments: paymentRows.length,
      charge_payment_allocations: paymentAllocationRows.length,
      payment_reminders: reminderRows.length,
      late_payment_penalties: penaltyRows.length,
      payment_schedules: scheduleRows.length,
      payment_schedule_instalments: instalmentRows.length,
      owner_accounts: ownerAccountRows.length,
      owner_account_transactions: ownerTxRows.length,
      journal_entries: entryDrafts.length,
      journal_entry_lines: entryLines.length,
      maintenance_contracts: contractRows.length,
      syndicate_contract_links: contractLinkRows.length,
      syndicate_incidents: incidentRows.length,
      incident_cost_imputations: imputationRows.length,
      maintenance_tickets: ticketRows.length,
      syndicate_maintenance_links: maintenanceLinkRows.length,
      syndicate_funds: fundRows.length,
      syndicate_fund_movements: fundMovementRows.length,
      syndicate_documents: docRows.length
    },
    funds: { roulement: fundCashRoulement, travaux: fundCashTravaux },
    bank: accBalance.get('512') ?? 0
  };
}

// ═══════════════════════════════════════════════════════════════ point d'entrée

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { name: true } });
  if (!tenant) throw new Error(`Agence ${TENANT_ID} introuvable`);
  console.log(`Agence : ${tenant.name} (${TENANT_ID})`);
  console.log(`Date de référence : ${fmtDate(REFERENCE_DATE)} — fichiers : ${UPLOADS_ROOT}\n`);

  for (const [id, name] of [
    [SYNDIC_PERLES_ID, 'Résidence Les Perles de la Riviera'],
    [SYNDIC_JARDINS_ID, "Résidence Les Jardins d'Angré"]
  ]) {
    const homonyme = await prisma.syndicate.findFirst({
      where: { tenantId: TENANT_ID, name, NOT: { id } },
      select: { id: true }
    });
    if (homonyme)
      throw new Error(
        `Une autre copropriété « ${name} » existe déjà (${homonyme.id}) : le seed ne la touche pas et s'arrête.`
      );
  }

  const defs = [defPerles(), defJardins()];
  const summaries: Summary[] = [];
  for (const def of defs) {
    const contactIds = await upsertContacts(def.contacts);
    const providerIds = await upsertProviders(def.suppliers);
    await upsertProperty(def, null);
    const s = await seedCopro(def, contactIds, providerIds);
    summaries.push(s);
  }

  for (const s of summaries) {
    console.log(`══ ${s.name}`);
    console.log(`   id ${s.id} — ${s.address} — ${s.lots} lots`);
    for (const y of s.years) {
      console.log(
        `   ${y.year} : budget ${fcfa(y.budget)} | appelé ${fcfa(y.called)} | encaissé ${fcfa(y.collected)} | impayés ${fcfa(y.outstanding)} | AG tenues ${y.meetings}`
      );
    }
    console.log(
      `   Fonds de roulement ${fcfa(s.funds.roulement)} — fonds de travaux ${fcfa(s.funds.travaux)} — banque ${fcfa(s.bank)}`
    );
    console.log(
      `   ${Object.entries(s.counts)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')}\n`
    );
  }
}

main()
  .catch(e => {
    console.error('ÉCHEC :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
