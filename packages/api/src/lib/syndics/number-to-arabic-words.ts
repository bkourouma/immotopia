/** Montants en lettres arabes pour les copies de lecture des pièces de charges. */

const UNITS = [
  'صفر',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر'
];

const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];

function belowThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest) {
    if (rest < 20) parts.push(UNITS[rest]);
    else {
      const units = rest % 10;
      const tens = TENS[Math.floor(rest / 10)];
      parts.push(units ? `${UNITS[units]} و${tens}` : tens);
    }
  }
  return parts.join(' و');
}

const SCALES = [
  { value: 1_000_000_000, singular: 'مليار', dual: 'ملياران', plural: 'مليارات', counted: 'مليارًا' },
  { value: 1_000_000, singular: 'مليون', dual: 'مليونان', plural: 'ملايين', counted: 'مليونًا' },
  { value: 1_000, singular: 'ألف', dual: 'ألفان', plural: 'آلاف', counted: 'ألفًا' }
] as const;

function scaleWords(count: number, scale: (typeof SCALES)[number], nounFollows = false): string {
  if (count === 1) return scale.singular;
  if (count === 2) return nounFollows ? scale.dual.slice(0, -1) : scale.dual;
  if (count <= 10) return `${belowThousand(count)} ${scale.plural}`;
  if (count >= 100) {
    const hundreds = Math.floor(count / 100) * 100;
    const rest = count % 100;
    // « مئة ألف وألف » explicite 101 000, sans ambiguïté avec 1 100.
    if (rest) return `${scaleWords(hundreds, scale)} و${scaleWords(rest, scale, nounFollows)}`;
    return `${belowThousand(hundreds).replace(/مئتان$/, 'مئتا')} ${scale.singular}`;
  }
  // 11–99 : forme accusative en fin de groupe, sans tanwin si une devise suit.
  return `${belowThousand(count)} ${nounFollows ? scale.singular : scale.counted}`;
}

/** Entier non négatif jusqu'à 999 999 999 999, avec rejet des valeurs non sûres. */
export function integerToArabicWords(value: number): string {
  return integerWords(value, false);
}

function integerWords(value: number, nounFollows: boolean): string {
  if (!Number.isSafeInteger(value) || value < 0 || value > 999_999_999_999) {
    throw new RangeError(`Nombre non convertible en lettres arabes : ${value}`);
  }
  if (value === 0) return UNITS[0];

  let rest = value;
  const parts: string[] = [];
  for (const scale of SCALES) {
    const count = Math.floor(rest / scale.value);
    rest %= scale.value;
    if (count) parts.push(scaleWords(count, scale, nounFollows && rest === 0));
  }
  if (rest) {
    const words = belowThousand(rest);
    parts.push(nounFollows ? words.replace(/مئتان$/, 'مئتا') : words);
  }
  return parts.join(' و');
}

const CURRENCIES: Record<
  string,
  { unit: string; fraction: string; fractionDual: string; fractionPlural: string; fractionCounted: string }
> = {
  XOF: {
    unit: 'فرنك غرب أفريقيا',
    fraction: 'سنتيم',
    fractionDual: 'سنتيمان',
    fractionPlural: 'سنتيمات',
    fractionCounted: 'سنتيمًا'
  },
  XAF: {
    unit: 'فرنك وسط أفريقيا',
    fraction: 'سنتيم',
    fractionDual: 'سنتيمان',
    fractionPlural: 'سنتيمات',
    fractionCounted: 'سنتيمًا'
  },
  EUR: { unit: 'يورو', fraction: 'سنت', fractionDual: 'سنتان', fractionPlural: 'سنتات', fractionCounted: 'سنتًا' },
  USD: {
    unit: 'دولار أمريكي',
    fraction: 'سنت',
    fractionDual: 'سنتان',
    fractionPlural: 'سنتات',
    fractionCounted: 'سنتًا'
  }
};

function fractionWords(cents: number, names: (typeof CURRENCIES)[string]): string {
  if (cents === 1) return `${names.fraction} واحد`;
  if (cents === 2) return names.fractionDual;
  if (cents <= 10) return `${integerToArabicWords(cents)} ${names.fractionPlural}`;
  return `${integerToArabicWords(cents)} ${names.fractionCounted}`;
}

/** Même contrat que `amountToFrenchWords` : devise et centimes, arrondis au centième. */
export function amountToArabicWords(amount: number, currency = 'XOF'): string {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`Montant non convertible en lettres arabes : ${amount}`);
  }
  const totalCents = Math.round(amount * 100);
  const integer = Math.floor(totalCents / 100);
  const cents = totalCents % 100;
  const names = CURRENCIES[currency.toUpperCase()] ?? {
    unit: currency,
    fraction: 'جزء من مئة',
    fractionDual: 'جزآن من مئة',
    fractionPlural: 'أجزاء من مئة',
    fractionCounted: 'جزءًا من مئة'
  };
  let text = `${integerWords(integer, true)} ${names.unit}`;
  if (cents) text += ` و${fractionWords(cents, names)}`;
  return text;
}
