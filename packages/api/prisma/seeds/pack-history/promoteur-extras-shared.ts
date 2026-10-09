/**
 * Outillage commun des compléments PROMOTEUR (`promoteur-extras*.ts`) :
 * contexte d'exécution (transactions, dates relatives, équipe), horloge d'audit,
 * catalogue d'articles de chantier et photos de démonstration.
 *
 * Aucun envoi sortant ; toutes les dates sont relatives à `ctx.end` / `ctx.start`.
 */
import type { PrismaClient } from '@prisma/client';
import { MembershipStatus } from '@prisma/client';
import { addDays } from './types';
import type { HistoryContext } from './types';
import { encodePng } from './property-images';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = any;

export interface Svc {
  suppliers: any;
  budgets: any;
  orders: any;
  contractors: any;
  progress: any;
  closing: any;
  retentions: any;
  cash: any;
  accounting: any;
  stockRef: any;
  stockMov: any;
  stockTransfer: any;
  stockCount: any;
  stockCtl: any;
  stockSlips: any;
  stockAlert: any;
  budgetAlerts: any;
  siteCost: any;
  money: any;
  attach: any;
  rapprochement: any;
  partnerships: any;
}

export interface Env {
  ctx: HistoryContext;
  prisma: PrismaClient;
  tenantId: string;
  admin: string;
  rng: () => number;
  /** Membres actifs (l'administrateur en tête). */
  staff: string[];
  /** Libellés (nom complet) des membres, pour les textes libres. */
  staffNames: Map<string, string>;
  /** Vrai pour l'opérateur intégré (3 modules) : il a la place d'un chantier actif de plus. */
  isIntegrated: boolean;
  svc: Svc;
  categories: Map<string, string>;
  /** Transaction ; `clock` date les événements d'audit écrits par les services. */
  run: <T>(fn: (tx: Tx) => Promise<T>, clock?: Date) => Promise<T>;
  at: (monthOffset: number, day: number, hour?: number) => Date;
  clampPast: (d: Date) => Date;
  inPast: (d: Date) => boolean;
  cat: (label: string) => string;
  pickStaff: () => string;
}

/** Enveloppe une transaction pour que `recordAuditEvent` date l'événement à `clock` (le journal d'audit est immuable). */
export function withAuditClock(tx: Tx, clock: Date): Tx {
  return new Proxy(tx, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop === 'auditLog' && value) {
        return new Proxy(value, {
          get(t2, p2) {
            const f = Reflect.get(t2, p2, t2);
            if (p2 === 'create' && typeof f === 'function') {
              return (args: any) => f.call(t2, { ...args, data: { ...args.data, createdAt: clock } });
            }
            return typeof f === 'function' ? f.bind(t2) : f;
          }
        });
      }
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

export const CATEGORY_LABELS = [
  'Gros œuvre',
  'Toiture',
  'Plomberie',
  'Électricité',
  "Main-d'œuvre",
  'Matériaux',
  'Divers'
] as const;

export async function buildEnv(ctx: HistoryContext): Promise<Env> {
  const [
    suppliers,
    budgets,
    orders,
    contractors,
    progress,
    closing,
    retentions,
    cash,
    accounting,
    stockRef,
    stockMov,
    stockTransfer,
    stockCount,
    stockCtl,
    stockSlips,
    stockAlert,
    budgetAlerts,
    siteCost,
    money,
    attach,
    rapprochement,
    partnerships
  ] = await Promise.all([
    import('../../../src/lib/finance/suppliers'),
    import('../../../src/lib/finance/budgets'),
    import('../../../src/lib/finance/purchase-orders'),
    import('../../../src/lib/finance/contractors'),
    import('../../../src/lib/finance/site-progress'),
    import('../../../src/lib/finance/site-closing'),
    import('../../../src/lib/finance/retentions'),
    import('../../../src/lib/finance/cash'),
    import('../../../src/lib/finance/accounting'),
    import('../../../src/lib/finance/stock-referentiel'),
    import('../../../src/lib/finance/stock-mouvements'),
    import('../../../src/lib/finance/stock-transferts'),
    import('../../../src/lib/finance/stock-inventaire'),
    import('../../../src/lib/finance/stock-controles'),
    import('../../../src/lib/finance/stock-bons'),
    import('../../../src/lib/finance/stock-alertes'),
    import('../../../src/lib/finance/budget-alerts'),
    import('../../../src/lib/finance/site-cost'),
    import('../../../src/lib/finance/money'),
    import('../../../src/lib/finance/stock-pieces-jointes'),
    import('../../../src/lib/finance/stock-rapprochement'),
    import('../../../src/lib/finance/partnerships')
  ]);

  const prisma = ctx.prisma;
  const tenantId = ctx.tenantId;
  const members = await prisma.membership.findMany({
    where: { tenantId, status: MembershipStatus.ACTIVE },
    select: { userId: true, user: { select: { fullName: true, email: true } } }
  });
  const staff = Array.from(new Set([ctx.adminUserId, ...members.map(m => m.userId)]));
  const staffNames = new Map<string, string>();
  for (const m of members) staffNames.set(m.userId, m.user?.fullName || m.user?.email || 'Collaborateur');
  const modules = await prisma.tenantModule.count({ where: { tenantId, enabled: true } });

  const categoriesRows = await prisma.costCategory.findMany({ where: { tenantId } });
  const categories = new Map(categoriesRows.map(c => [c.label, c.id]));

  const run = <T>(fn: (tx: Tx) => Promise<T>, clock?: Date): Promise<T> =>
    prisma.$transaction(async tx => fn(clock ? withAuditClock(tx, clock) : tx), {
      timeout: 120_000,
      maxWait: 30_000
    }) as Promise<T>;

  return {
    ctx,
    prisma,
    tenantId,
    admin: ctx.adminUserId,
    rng: ctx.rng,
    staff,
    staffNames,
    isIntegrated: modules >= 3,
    svc: {
      suppliers,
      budgets,
      orders,
      contractors,
      progress,
      closing,
      retentions,
      cash,
      accounting,
      stockRef,
      stockMov,
      stockTransfer,
      stockCount,
      stockCtl,
      stockSlips,
      stockAlert,
      budgetAlerts,
      siteCost,
      money,
      attach,
      rapprochement,
      partnerships
    },
    categories,
    run,
    at: (monthOffset, day, hour = 10) =>
      new Date(ctx.start.getFullYear(), ctx.start.getMonth() + monthOffset, day, hour, 0, 0, 0),
    clampPast: d => (d > ctx.end ? addDays(ctx.end, -1) : d),
    inPast: d => d <= ctx.end,
    cat: label => {
      const id = categories.get(label);
      if (!id) throw new Error(`Poste de dépense « ${label} » introuvable`);
      return id;
    },
    pickStaff: () => staff[Math.floor(ctx.rng() * staff.length) % staff.length]
  };
}

export const round5k = (n: number): number => Math.max(5_000, Math.round(n / 5_000) * 5_000);
export const round1k = (n: number): number => Math.max(1_000, Math.round(n / 1_000) * 1_000);

/** Courbe en S : fraction d'avancement à la fraction de durée t (0..1). */
export function curve(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

// ===========================================================================
// Catalogue d'articles de chantier
// ===========================================================================

export type CategoryLabel = (typeof CATEGORY_LABELS)[number];

export interface CatalogItem {
  reference: string;
  label: string;
  unit: string;
  family: string;
  category: CategoryLabel;
  /** Prix unitaire de référence, en XOF. */
  price: number;
  /** Seuil de réapprovisionnement (alerte de stock bas côté écran). */
  min: number;
  supplier: 'MAT' | 'PLB' | 'ELE' | 'FER';
}

export const STOCK_CATALOG: readonly CatalogItem[] = [
  {
    reference: 'CIM-425',
    label: 'Ciment CPJ 42,5 — sac de 50 kg',
    unit: 'sac',
    family: 'Ciment',
    category: 'Matériaux',
    price: 6_300,
    min: 150,
    supplier: 'MAT'
  },
  {
    reference: 'SAB-LAG',
    label: 'Sable lagunaire lavé',
    unit: 'm³',
    family: 'Granulats',
    category: 'Matériaux',
    price: 11_000,
    min: 10,
    supplier: 'MAT'
  },
  {
    reference: 'GRA-1525',
    label: 'Gravier concassé 15/25',
    unit: 'm³',
    family: 'Granulats',
    category: 'Matériaux',
    price: 19_000,
    min: 8,
    supplier: 'MAT'
  },
  {
    reference: 'PAR-15',
    label: 'Parpaing creux 15 cm',
    unit: 'unité',
    family: 'Agglomérés',
    category: 'Gros œuvre',
    price: 480,
    min: 500,
    supplier: 'MAT'
  },
  {
    reference: 'PAR-20',
    label: 'Parpaing creux 20 cm',
    unit: 'unité',
    family: 'Agglomérés',
    category: 'Gros œuvre',
    price: 560,
    min: 400,
    supplier: 'MAT'
  },
  {
    reference: 'FER-08',
    label: 'Fer à béton HA 8 — barre de 12 m',
    unit: 'barre',
    family: 'Fer à béton',
    category: 'Gros œuvre',
    price: 2_900,
    min: 100,
    supplier: 'FER'
  },
  {
    reference: 'FER-10',
    label: 'Fer à béton HA 10 — barre de 12 m',
    unit: 'barre',
    family: 'Fer à béton',
    category: 'Gros œuvre',
    price: 4_500,
    min: 100,
    supplier: 'FER'
  },
  {
    reference: 'FER-12',
    label: 'Fer à béton HA 12 — barre de 12 m',
    unit: 'barre',
    family: 'Fer à béton',
    category: 'Gros œuvre',
    price: 6_400,
    min: 80,
    supplier: 'FER'
  },
  {
    reference: 'FER-14',
    label: 'Fer à béton HA 14 — barre de 12 m',
    unit: 'barre',
    family: 'Fer à béton',
    category: 'Gros œuvre',
    price: 8_600,
    min: 60,
    supplier: 'FER'
  },
  {
    reference: 'FIL-LIG',
    label: 'Fil de ligature recuit',
    unit: 'kg',
    family: 'Quincaillerie',
    category: 'Gros œuvre',
    price: 1_100,
    min: 50,
    supplier: 'FER'
  },
  {
    reference: 'TOL-BAC',
    label: 'Tôle bac alu 0,45 mm',
    unit: 'ml',
    family: 'Couverture',
    category: 'Toiture',
    price: 5_800,
    min: 100,
    supplier: 'MAT'
  },
  {
    reference: 'CHE-BOI',
    label: 'Chevron bois rouge 6 × 8',
    unit: 'pièce',
    family: 'Couverture',
    category: 'Toiture',
    price: 7_500,
    min: 40,
    supplier: 'MAT'
  },
  {
    reference: 'CAR-6060',
    label: 'Carrelage grès cérame 60 × 60',
    unit: 'm²',
    family: 'Finition',
    category: 'Matériaux',
    price: 9_500,
    min: 60,
    supplier: 'MAT'
  },
  {
    reference: 'PEI-VIN',
    label: 'Peinture vinylique intérieure — seau 25 L',
    unit: 'seau',
    family: 'Finition',
    category: 'Matériaux',
    price: 42_000,
    min: 6,
    supplier: 'MAT'
  },
  {
    reference: 'PLB-PVC32',
    label: 'Tube PVC pression Ø 32 — barre de 6 m',
    unit: 'barre',
    family: 'Plomberie',
    category: 'Plomberie',
    price: 4_200,
    min: 30,
    supplier: 'PLB'
  },
  {
    reference: 'PLB-WC',
    label: 'Ensemble WC complet à poser',
    unit: 'unité',
    family: 'Plomberie',
    category: 'Plomberie',
    price: 68_000,
    min: 4,
    supplier: 'PLB'
  },
  {
    reference: 'PLB-LAV',
    label: 'Lavabo avec mitigeur',
    unit: 'unité',
    family: 'Plomberie',
    category: 'Plomberie',
    price: 54_000,
    min: 4,
    supplier: 'PLB'
  },
  {
    reference: 'ELE-CAB25',
    label: 'Câble U1000 R2V 2,5 mm² — couronne 100 m',
    unit: 'couronne',
    family: 'Électricité',
    category: 'Électricité',
    price: 38_500,
    min: 6,
    supplier: 'ELE'
  },
  {
    reference: 'ELE-DIS20',
    label: 'Disjoncteur 20 A',
    unit: 'unité',
    family: 'Électricité',
    category: 'Électricité',
    price: 4_800,
    min: 20,
    supplier: 'ELE'
  },
  {
    reference: 'ELE-TAB',
    label: 'Tableau électrique 3 rangées équipé',
    unit: 'unité',
    family: 'Électricité',
    category: 'Électricité',
    price: 96_000,
    min: 2,
    supplier: 'ELE'
  }
];

export function formatXof(n: number): string {
  return `${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F CFA`;
}

// ===========================================================================
// Photos de démonstration (PNG dessinés, sans dépendance)
// ===========================================================================

type RGB = readonly [number, number, number];

class Pix {
  readonly data: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
    bg: RGB
  ) {
    this.data = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      const k = y / h;
      const c: RGB = [bg[0] * (1 - 0.18 * k), bg[1] * (1 - 0.18 * k), bg[2] * (1 - 0.18 * k)];
      for (let x = 0; x < w; x++) this.set(x, y, c);
    }
  }
  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(Math.round(x + i), Math.round(y + j), c);
  }
}

const shadeC = (c: RGB, f: number): RGB => [
  Math.max(0, Math.min(255, Math.round(c[0] * f))),
  Math.max(0, Math.min(255, Math.round(c[1] * f))),
  Math.max(0, Math.min(255, Math.round(c[2] * f)))
];

export type PhotoKind = 'SACKS' | 'BARS' | 'BLOCKS' | 'NOTE' | 'TILES';

/** Photo ou scan dessiné de façon déterministe à partir de `seed`. */
export function renderStockPhoto(kind: PhotoKind, seed: number): Buffer {
  const W = 640;
  const H = 480;
  const r = (n: number): number => {
    const x = Math.sin(seed * 9.1 + n * 7.7) * 10000;
    return x - Math.floor(x);
  };
  if (kind === 'NOTE') {
    const p = new Pix(W, H, [233, 228, 214]);
    p.rect(70, 30, 500, 420, [252, 251, 247]);
    p.rect(70, 30, 500, 6, [40, 70, 130]);
    p.rect(90, 60, 190, 14, [60, 60, 70]);
    p.rect(420, 60, 130, 14, [60, 60, 70]);
    for (let i = 0; i < 12; i++) {
      p.rect(90, 110 + i * 26, 300 + Math.round(r(i) * 120), 7, [150, 150, 160]);
      p.rect(470, 110 + i * 26, 70, 7, [110, 110, 125]);
    }
    p.rect(90, 420, 140, 3, [70, 70, 80]);
    p.rect(400, 380, 120, 50, [200, 70, 70]);
    p.rect(405, 385, 110, 40, [252, 251, 247]);
    return encodePng(W, H, p.data);
  }
  const p = new Pix(W, H, [186, 174, 150]);
  p.rect(0, 330, W, 150, shadeC([150, 128, 98], 0.9 + r(1) * 0.1)); // sol de terre battue
  p.rect(0, 0, W, 40, [141, 170, 196]);
  if (kind === 'SACKS') {
    for (let row = 0; row < 6; row++) {
      const cols = 6 - Math.floor(row / 2);
      for (let c = 0; c < cols; c++) {
        const x = 90 + c * 76 + (row % 2) * 30 + Math.round(r(row * 9 + c) * 5);
        const y = 330 - (row + 1) * 42;
        p.rect(x, y, 72, 40, shadeC([208, 206, 200], 0.9 + r(row + c) * 0.12));
        p.rect(x, y + 12, 72, 14, [38, 84, 150]);
        p.rect(x + 10, y + 16, 30, 6, [240, 240, 240]);
      }
    }
  } else if (kind === 'BARS') {
    for (let i = 0; i < 26; i++) {
      const y = 250 + Math.round(i * 3.1) + Math.round(r(i) * 3);
      p.rect(
        60 + Math.round(r(i + 40) * 20),
        y,
        520 - Math.round(r(i + 20) * 30),
        3,
        shadeC([92, 84, 78], 0.8 + r(i) * 0.5)
      );
    }
    p.rect(150, 238, 8, 110, [50, 45, 40]);
    p.rect(420, 238, 8, 110, [50, 45, 40]);
  } else if (kind === 'BLOCKS') {
    p.rect(60, 300, 520, 28, [132, 96, 62]); // palette bois
    for (let row = 0; row < 8; row++) {
      for (let c = 0; c < 10; c++) {
        const x = 70 + c * 50 + (row % 2) * 25;
        const y = 300 - (row + 1) * 26;
        if (x + 48 > 580) continue;
        p.rect(x, y, 48, 24, shadeC([158, 158, 156], 0.88 + r(row * 11 + c) * 0.18));
        p.rect(x + 8, y + 7, 12, 10, [112, 112, 110]);
        p.rect(x + 28, y + 7, 12, 10, [112, 112, 110]);
      }
    }
  } else {
    for (let row = 0; row < 7; row++) {
      for (let c = 0; c < 8; c++) {
        p.rect(110 + c * 52, 330 - (row + 1) * 10, 50, 9, shadeC([220, 214, 202], 0.92 + r(row + c * 3) * 0.1));
      }
    }
    p.rect(110, 200, 416, 4, [90, 90, 90]);
  }
  return encodePng(W, H, p.data);
}
