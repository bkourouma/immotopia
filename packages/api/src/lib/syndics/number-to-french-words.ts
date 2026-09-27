/**
 * Montants en toutes lettres, en français (lot S3 : reçus et quittances).
 *
 * Orthographe traditionnelle (celle des actes et des quittances) :
 * - trait d'union entre dizaines et unités sous cent (« dix-sept »,
 *   « quatre-vingt-onze »), « et » pour 21, 31, 41, 51, 61 et 71
 *   (« vingt et un », « soixante et onze »), jamais pour 81 et 91 ;
 * - « vingt » et « cent » prennent un « s » quand ils sont multipliés et
 *   terminent le nombre (« quatre-vingts », « deux cents »), y compris devant
 *   « millions » et « milliards » (des noms), mais pas devant « mille »
 *   (un adjectif numéral : « deux cent mille ») ;
 * - « mille » est invariable et jamais précédé de « un » ;
 * - « million » et « milliard » sont des noms : « un million », « deux
 *   millions », et « un million de francs » quand rien ne suit.
 */

const UNITS = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize'
];

const TENS: Record<number, string> = {
  2: 'vingt',
  3: 'trente',
  4: 'quarante',
  5: 'cinquante',
  6: 'soixante'
};

/** 0 à 99 ; `plural` : « quatre-vingts » quand 80 termine le nombre. */
function belowHundred(n: number, plural: boolean): string {
  if (n <= 16) return UNITS[n];
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  if (ten === 7 || ten === 9) {
    // 70-79 et 90-99 : soixante / quatre-vingt + 10 à 19.
    const base = ten === 7 ? 'soixante' : 'quatre-vingt';
    const rest = belowHundred(10 + unit, false);
    return ten === 7 && unit === 1 ? `${base} et ${rest}` : `${base}-${rest}`;
  }
  if (ten === 8) {
    return unit === 0 ? (plural ? 'quatre-vingts' : 'quatre-vingt') : `quatre-vingt-${UNITS[unit]}`;
  }
  const base = TENS[ten];
  if (unit === 0) return base;
  if (unit === 1) return `${base} et un`;
  return `${base}-${UNITS[unit]}`;
}

/** 0 à 999 (0 → chaîne vide) ; `plural` : accord de « cents » / « vingts » en fin de nombre. */
function belowThousand(n: number, plural: boolean): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) {
    const cent = hundreds > 1 && rest === 0 && plural ? 'cents' : 'cent';
    parts.push(hundreds === 1 ? cent : `${UNITS[hundreds]} ${cent}`);
  }
  if (rest > 0) parts.push(belowHundred(rest, plural));
  return parts.join(' ');
}

const SCALES: Array<{ value: number; singular: string; plural: string }> = [
  { value: 1_000_000_000, singular: 'milliard', plural: 'milliards' },
  { value: 1_000_000, singular: 'million', plural: 'millions' }
];

/**
 * Entier positif ou nul en toutes lettres (jusqu'à 999 999 999 999).
 * Lève sur une valeur négative, non entière ou trop grande.
 */
export function integerToFrenchWords(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 999_999_999_999) {
    throw new RangeError(`Nombre non convertible en lettres : ${value}`);
  }
  if (value === 0) return UNITS[0];

  const parts: string[] = [];
  let rest = value;
  for (const scale of SCALES) {
    const count = Math.floor(rest / scale.value);
    rest %= scale.value;
    if (count > 0) {
      // Devant un nom (million, milliard), « cents » / « vingts » s'accordent.
      parts.push(`${belowThousand(count, true)} ${count > 1 ? scale.plural : scale.singular}`);
    }
  }
  const thousands = Math.floor(rest / 1000);
  const units = rest % 1000;
  if (thousands > 0) {
    // « mille » est un adjectif : « deux cent mille », « quatre-vingt mille ».
    parts.push(thousands === 1 ? 'mille' : `${belowThousand(thousands, false)} mille`);
  }
  if (units > 0) parts.push(belowThousand(units, true));
  return parts.join(' ');
}

const CURRENCY_NAMES: Record<string, { singular: string; plural: string }> = {
  XOF: { singular: 'franc CFA', plural: 'francs CFA' },
  XAF: { singular: 'franc CFA', plural: 'francs CFA' },
  EUR: { singular: 'euro', plural: 'euros' },
  USD: { singular: 'dollar', plural: 'dollars' }
};

/**
 * Montant en toutes lettres avec sa devise, centimes compris :
 * « deux mille cinq cents francs CFA », « un million de francs CFA »,
 * « douze euros et cinquante centimes ». Arrondi au centime.
 */
export function amountToFrenchWords(amount: number, currency = 'XOF'): string {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`Montant non convertible en lettres : ${amount}`);
  }
  const totalCents = Math.round(amount * 100);
  const integer = Math.floor(totalCents / 100);
  const cents = totalCents % 100;

  const names = CURRENCY_NAMES[currency.toUpperCase()] ?? { singular: currency, plural: currency };
  const words = integerToFrenchWords(integer);
  // « un million de francs », « deux milliards d'euros » : rien après le nom.
  const endsWithNoun = integer >= 1_000_000 && integer % 1_000_000 === 0;
  const unit = integer > 1 ? names.plural : names.singular;
  const joiner = endsWithNoun ? (/^[aeiouyéèh]/i.test(unit) ? " d'" : ' de ') : ' ';
  let text = `${words}${joiner}${unit}`;
  if (cents > 0) {
    text += ` et ${integerToFrenchWords(cents)} ${cents > 1 ? 'centimes' : 'centime'}`;
  }
  return text;
}
