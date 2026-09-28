/**
 * Prix des abonnements par packs — calcul PUR, montants en FCFA HT entiers.
 *
 * Regles (docs/architecture/PLAN-ABONNEMENTS.md) :
 * - prix mensuel = packs + extensions, chacun au prix FIGE de son element ;
 * - remise de combinaison (D6) : `comboDiscountPercent` % du prix de BASE du
 *   pack le moins cher, des 2 packs ; extensions exclues ;
 * - annuel = 11 mensualites ;
 * - prorata (D7) : jours restants de la periode, jour d'ajout compris ;
 * - lot en depassement (D5) : prix d'un bloc de 10 lots / 10, selon les packs
 *   detenus et le rang du lot (calque de `agencePrice` du site) ;
 * - TVA (D9) : 18 %, en ligne separee, calculee sur le total HT.
 *
 * Arrondi : a l'unite FCFA la plus proche, ligne par ligne.
 */

import {
  ANNUAL_MONTHS,
  CapacityKeyCode,
  CatalogItemKindCode,
  CatalogRules,
  EXTENSION,
  PLATFORM_TAX_RATE_PERCENT
} from './catalog';

export type InvoiceLineKindCode =
  'PACK' | 'EXTENSION' | 'PRORATA' | 'DISCOUNT' | 'SETUP' | 'OVERAGE' | 'CREDIT' | 'USAGE' | 'TAX';

export type BillingCycleCode = 'MONTHLY' | 'ANNUAL';

/** Ce que le calcul des prix a besoin de savoir d'un element du catalogue. */
export interface PricingCatalogItem {
  code: string;
  kind: CatalogItemKindCode;
  name: string;
  monthlyPrice: number;
  setupPrice: number;
  capacities: Partial<Record<CapacityKeyCode, number>>;
  rules: CatalogRules | null;
}

/** Une ligne chiffree (facture ou apercu). `amount` est HT, negatif pour DISCOUNT et CREDIT. */
export interface ChargeLine {
  kind: InvoiceLineKindCode;
  label: string;
  code?: string;
  subscriptionItemId?: string;
  capacityKey?: CapacityKeyCode;
  quantity: number;
  unitPrice: number;
  amount: number;
  periodStart?: Date;
  periodEnd?: Date;
}

export const roundFcfa = (value: number): number => Math.round(value);

// ------------------------------------------------------------- prix unitaire

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every(x => sb.has(x));
}

/**
 * Prix mensuel d'UNE unite d'un element, selon les packs detenus et, pour un
 * bloc de lots, le rang du premier lot qu'il couvre.
 */
export function resolveUnitMonthlyPrice(
  item: Pick<PricingCatalogItem, 'monthlyPrice' | 'rules'>,
  context: { heldPacks: readonly string[]; firstLotRank?: number }
): number {
  const rules = item.rules;
  const rank = context.firstLotRank;
  if (rules?.lotTiers && rank !== undefined) {
    const tier = rules.lotTiers.find(t => sameSet(t.onlyPacks, context.heldPacks) && rank >= t.fromLot);
    if (tier) return tier.monthlyPrice;
  }
  if (rules?.byHeldPacks) {
    const rule = rules.byHeldPacks.find(r => r.anyOf.some(code => context.heldPacks.includes(code)));
    if (rule) return rule.monthlyPrice;
  }
  return item.monthlyPrice;
}

/** L'extension est-elle vendable avec ces packs (`rules.requiresAnyOf`) ? */
export function isExtensionAllowed(item: Pick<PricingCatalogItem, 'rules'>, heldPacks: readonly string[]): boolean {
  const required = item.rules?.requiresAnyOf;
  return !required || required.length === 0 || required.some(code => heldPacks.includes(code));
}

export interface UnitSegment {
  quantity: number;
  unitMonthlyPrice: number;
  /** Rang du premier lot couvert par le segment (blocs de lots seulement). */
  firstLotRank?: number;
}

/**
 * Decoupe l'ajout de `quantity` unites d'une extension en segments de prix
 * homogene. Pour un bloc de lots, chaque bloc est price selon le rang de son
 * premier lot : `capacityBefore` = lots deja ACHETES (packs + blocs, hors
 * derogations). Le service cree un SubscriptionItem par segment.
 */
export function planExtensionUnits(
  item: Pick<PricingCatalogItem, 'monthlyPrice' | 'rules' | 'capacities'>,
  heldPacks: readonly string[],
  quantity: number,
  capacityBefore = 0
): UnitSegment[] {
  const blockSize = item.capacities.LOTS ?? 0;
  if (blockSize <= 0) {
    return quantity > 0 ? [{ quantity, unitMonthlyPrice: resolveUnitMonthlyPrice(item, { heldPacks }) }] : [];
  }
  const segments: UnitSegment[] = [];
  for (let i = 0; i < quantity; i += 1) {
    const firstLotRank = capacityBefore + i * blockSize + 1;
    const price = resolveUnitMonthlyPrice(item, { heldPacks, firstLotRank });
    const last = segments[segments.length - 1];
    if (last && last.unitMonthlyPrice === price) last.quantity += 1;
    else segments.push({ quantity: 1, unitMonthlyPrice: price, firstLotRank });
  }
  return segments;
}

// ------------------------------------------------------------- recurrent

export interface ChargeableItem {
  code: string;
  kind: CatalogItemKindCode;
  name: string;
  quantity: number;
  unitMonthlyPrice: number;
  /** Frais uniques figes (elements SETUP). */
  unitSetupPrice?: number;
  discountPercent?: number;
  subscriptionItemId?: string;
}

export interface RecurringCharges {
  lines: ChargeLine[];
  /** Somme HT des lignes (remise comprise), pour UN mois. */
  subtotal: number;
  comboDiscount: number;
}

/** Remise de combinaison (D6) : % du prix de base du pack le moins cher, des 2 packs distincts. */
export function computeComboDiscount(packBasePrices: readonly number[], percent: number): number {
  if (packBasePrices.length < 2 || percent <= 0) return 0;
  return roundFcfa((Math.min(...packBasePrices) * percent) / 100);
}

/** Lignes mensuelles recurrentes : packs, extensions, remise de combinaison. Les SETUP sont exclus. */
export function computeRecurringLines(
  items: readonly ChargeableItem[],
  options: { comboDiscountPercent: number }
): RecurringCharges {
  const lines: ChargeLine[] = [];
  for (const item of items) {
    if (item.kind === 'SETUP' || item.quantity <= 0) continue;
    const gross = item.quantity * item.unitMonthlyPrice;
    const amount = roundFcfa(gross * (1 - (item.discountPercent ?? 0) / 100));
    lines.push({
      kind: item.kind === 'PACK' ? 'PACK' : 'EXTENSION',
      label: item.name,
      code: item.code,
      subscriptionItemId: item.subscriptionItemId,
      quantity: item.quantity,
      unitPrice: item.unitMonthlyPrice,
      amount
    });
  }

  const packs = [...new Map(items.filter(i => i.kind === 'PACK').map(i => [i.code, i])).values()];
  const comboDiscount = computeComboDiscount(
    packs.map(p => p.unitMonthlyPrice),
    options.comboDiscountPercent
  );
  if (comboDiscount > 0) {
    const cheapest = packs.reduce((a, b) => (b.unitMonthlyPrice < a.unitMonthlyPrice ? b : a));
    lines.push({
      kind: 'DISCOUNT',
      label: `Remise de combinaison (${options.comboDiscountPercent} % sur ${cheapest.name})`,
      code: cheapest.code,
      quantity: 1,
      unitPrice: -comboDiscount,
      amount: -comboDiscount
    });
  }

  return { lines, subtotal: lines.reduce((s, l) => s + l.amount, 0), comboDiscount };
}

/** Lignes SETUP (mise en route) non encore facturees. */
export function computeSetupLines(items: readonly ChargeableItem[]): ChargeLine[] {
  return items
    .filter(i => i.kind === 'SETUP' && i.quantity > 0 && (i.unitSetupPrice ?? 0) > 0)
    .map(i => ({
      kind: 'SETUP' as const,
      label: i.name,
      code: i.code,
      subscriptionItemId: i.subscriptionItemId,
      quantity: i.quantity,
      unitPrice: i.unitSetupPrice ?? 0,
      amount: roundFcfa(i.quantity * (i.unitSetupPrice ?? 0))
    }));
}

// ------------------------------------------------------------- cycle

/** Mois factures par cycle : 1 en mensuel, 11 en annuel (12 mois pour 11). */
export function cycleMultiplier(cycle: BillingCycleCode): number {
  return cycle === 'ANNUAL' ? ANNUAL_MONTHS : 1;
}

export function annualPrice(monthly: number): number {
  return monthly * ANNUAL_MONTHS;
}

/** Recurrent d'un mois -> recurrent du cycle (prix unitaire et montant multiplies). */
export function scaleLinesForCycle(lines: readonly ChargeLine[], cycle: BillingCycleCode): ChargeLine[] {
  const factor = cycleMultiplier(cycle);
  if (factor === 1) return lines.map(l => ({ ...l }));
  return lines.map(l => ({ ...l, unitPrice: l.unitPrice * factor, amount: l.amount * factor }));
}

/** Fin de periode : +1 mois (MONTHLY) ou +12 mois (ANNUAL), en UTC. */
export function addBillingPeriod(start: Date, cycle: BillingCycleCode): Date {
  const end = new Date(start.getTime());
  end.setUTCMonth(end.getUTCMonth() + (cycle === 'ANNUAL' ? 12 : 1));
  return end;
}

// ------------------------------------------------------------- prorata (D7)

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Jours restants de [periodStart, periodEnd[ a partir de `from`, jour de
 * `from` COMPRIS. Un ajout le 16 d'un mois de 30 jours laisse 15 jours.
 */
export function prorataDays(
  periodStart: Date,
  periodEnd: Date,
  from: Date
): { remainingDays: number; totalDays: number } {
  const totalDays = Math.max(0, Math.round((utcDay(periodEnd) - utcDay(periodStart)) / DAY_MS));
  const raw = Math.round((utcDay(periodEnd) - utcDay(from)) / DAY_MS);
  return { remainingDays: Math.min(totalDays, Math.max(0, raw)), totalDays };
}

/** Montant du cycle ramene aux jours restants (0 hors periode). */
export function prorateAmount(cycleAmount: number, periodStart: Date, periodEnd: Date, from: Date): number {
  const { remainingDays, totalDays } = prorataDays(periodStart, periodEnd, from);
  if (totalDays === 0) return 0;
  return roundFcfa((cycleAmount * remainingDays) / totalDays);
}

// ------------------------------------------------------------- depassement (D4, D5)

/**
 * Lignes de depassement d'une capacite (politique BILL_OVERAGE). `extension`
 * est l'element du catalogue qui vend cette capacite (EXT_LOTS_10,
 * EXT_COPRO, EXT_CHANTIER) : le prix d'un lot en trop est celui d'un bloc
 * divise par sa taille, au rang du lot (Agence seule : 75 FCFA au-dela du
 * 300e). Montants MENSUELS.
 */
export function computeOverageLines(input: {
  capacityKey: CapacityKeyCode;
  limit: number;
  used: number;
  heldPacks: readonly string[];
  extension: Pick<PricingCatalogItem, 'monthlyPrice' | 'rules' | 'capacities'>;
}): ChargeLine[] {
  const over = input.used - input.limit;
  if (over <= 0) return [];
  const unitSize = input.extension.capacities[input.capacityKey] ?? 1;

  if (input.capacityKey === 'BIENS_DETENUS') {
    const unit = roundFcfa(resolveUnitMonthlyPrice(input.extension, { heldPacks: input.heldPacks }) / unitSize);
    return [
      {
        kind: 'OVERAGE',
        label: `Dépassement : ${over} bien(s) détenu(s) au-delà de l'abonnement`,
        capacityKey: input.capacityKey,
        quantity: over,
        unitPrice: unit,
        amount: over * unit
      }
    ];
  }

  if (input.capacityKey !== 'LOTS') {
    const unit = roundFcfa(resolveUnitMonthlyPrice(input.extension, { heldPacks: input.heldPacks }) / unitSize);
    const label = input.capacityKey === 'COPROPRIETES' ? 'copropriété(s)' : 'chantier(s)';
    return [
      {
        kind: 'OVERAGE',
        label: `Dépassement : ${over} ${label} au-delà de l'abonnement`,
        capacityKey: input.capacityKey,
        quantity: over,
        unitPrice: unit,
        amount: over * unit
      }
    ];
  }

  // Lots : regrouper par prix unitaire selon le rang.
  const groups: Array<{ from: number; count: number; unit: number }> = [];
  for (let rank = input.limit + 1; rank <= input.used; rank += 1) {
    const blockPrice = resolveUnitMonthlyPrice(input.extension, { heldPacks: input.heldPacks, firstLotRank: rank });
    const unit = blockPrice / unitSize;
    const last = groups[groups.length - 1];
    if (last && last.unit === unit) last.count += 1;
    else groups.push({ from: rank, count: 1, unit });
  }
  return groups.map(g => ({
    kind: 'OVERAGE' as const,
    label: `Dépassement : ${g.count} lot(s) au-delà de la réserve (${g.from}e à ${g.from + g.count - 1}e)`,
    capacityKey: 'LOTS' as const,
    quantity: g.count,
    unitPrice: g.unit,
    amount: roundFcfa(g.count * g.unit)
  }));
}

// ------------------------------------------------------------- TVA (D9)

export interface InvoiceTotals {
  lines: ChargeLine[];
  amountExclTax: number;
  taxRate: number;
  taxAmount: number;
  amountTotal: number;
}

/** Ajoute la ligne TVA (separee) et calcule les totaux. Un total HT negatif (avoir) n'a pas de TVA negative ici. */
export function finalizeInvoice(lines: readonly ChargeLine[], taxRate = PLATFORM_TAX_RATE_PERCENT): InvoiceTotals {
  const amountExclTax = lines.reduce((s, l) => s + l.amount, 0);
  const taxAmount = roundFcfa((Math.max(0, amountExclTax) * taxRate) / 100);
  const out = lines.map(l => ({ ...l }));
  if (taxAmount > 0) {
    out.push({
      kind: 'TAX',
      label: `TVA ${taxRate} %`,
      quantity: 1,
      unitPrice: taxAmount,
      amount: taxAmount
    });
  }
  return { lines: out, amountExclTax, taxRate, taxAmount, amountTotal: amountExclTax + taxAmount };
}

// ------------------------------------------------------------- estimation

/**
 * Prix mensuel HT d'une composition de packs pour un volume donne, avec les
 * extensions strictement necessaires (blocs de 10 lots arrondis au-dessus,
 * coproprietes et chantiers en plus). Sert aux devis et aux tests de la
 * grille ; la facturation reelle part des SubscriptionItem.
 */
export function estimateMonthly(
  input: {
    packs: readonly string[];
    lots?: number;
    copros?: number;
    chantiers?: number;
    /** Biens detenus en propre (pack Patrimoine). */
    biens?: number;
    comboDiscountPercent?: number;
  },
  catalog: readonly PricingCatalogItem[]
): RecurringCharges & { extensions: Record<string, number> } {
  const byCode = new Map(catalog.map(c => [c.code, c]));
  const packItems = input.packs.map(code => {
    const item = byCode.get(code);
    if (!item || item.kind !== 'PACK') throw new Error(`Pack inconnu : ${code}`);
    return item;
  });

  const capacity = (key: CapacityKeyCode) => packItems.reduce((s, p) => s + (p.capacities[key] ?? 0), 0);
  const chargeable: ChargeableItem[] = packItems.map(p => ({
    code: p.code,
    kind: 'PACK',
    name: p.name,
    quantity: 1,
    unitMonthlyPrice: p.monthlyPrice
  }));
  const extensions: Record<string, number> = {};
  const overageLines: ChargeLine[] = [];

  const addExtension = (code: string, key: CapacityKeyCode, needed: number) => {
    const ext = byCode.get(code);
    if (!ext || needed <= 0) return;
    if (!isExtensionAllowed(ext, input.packs)) {
      // L'extension ne se vend pas avec ces packs (ex. le bloc de biens
      // n'est vendu qu'avec Patrimoine Essentiel) : le depassement est
      // chiffre directement, au prix `byHeldPacks` de l'extension.
      overageLines.push(
        ...computeOverageLines({
          capacityKey: key,
          limit: capacity(key),
          used: capacity(key) + needed,
          heldPacks: input.packs,
          extension: ext
        })
      );
      return;
    }
    const size = ext.capacities[key] ?? 1;
    const units = Math.ceil(needed / size);
    extensions[code] = units;
    for (const segment of planExtensionUnits(ext, input.packs, units, capacity(key))) {
      chargeable.push({
        code,
        kind: 'EXTENSION',
        name: ext.name,
        quantity: segment.quantity,
        unitMonthlyPrice: segment.unitMonthlyPrice
      });
    }
  };

  addExtension(EXTENSION.LOTS_10, 'LOTS', (input.lots ?? 0) - capacity('LOTS'));
  addExtension(EXTENSION.COPRO, 'COPROPRIETES', (input.copros ?? 0) - capacity('COPROPRIETES'));
  addExtension(EXTENSION.CHANTIER, 'CHANTIERS', (input.chantiers ?? 0) - capacity('CHANTIERS'));
  addExtension(EXTENSION.BIENS_10, 'BIENS_DETENUS', (input.biens ?? 0) - capacity('BIENS_DETENUS'));

  const result = computeRecurringLines(chargeable, { comboDiscountPercent: input.comboDiscountPercent ?? 10 });
  const lines = [...result.lines, ...overageLines];
  return { lines, subtotal: lines.reduce((s, l) => s + l.amount, 0), comboDiscount: result.comboDiscount, extensions };
}
