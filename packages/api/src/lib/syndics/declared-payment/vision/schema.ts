import { z } from 'zod';
import { MAX_DECLARATION_AMOUNT } from '../types';

/**
 * Sortie du modèle de vision pour une capture de paiement mobile money
 * (spec 047, D9, R27, R28).
 *
 * Deux garanties :
 * - le JSON Schema envoyé aux fournisseurs est strict (toutes les propriétés
 *   requises, `additionalProperties: false`, absence = `null`) ;
 * - la validation Zod côté serveur fait seule autorité. Elle est « champ par
 *   champ » : une valeur invalide est abandonnée (`null`) sans invalider les
 *   autres ; une clé inconnue est ignorée, jamais copiée. Seul un objet
 *   racine illisible ou une `quality` inconnue rend la sortie inutilisable.
 *
 * Le modèle ne décide de rien : ses valeurs sont des PROPOSITIONS, modifiables
 * par la personne et revérifiées par le gestionnaire.
 */

export const PROOF_QUALITIES = ['OK', 'UNREADABLE', 'NOT_A_PAYMENT'] as const;
export type ProofQuality = (typeof PROOF_QUALITIES)[number];

export const PROOF_OPERATORS = ['ORANGE', 'MTN', 'MOOV', 'WAVE', 'OTHER'] as const;
export type ProofOperator = (typeof PROOF_OPERATORS)[number];

/** Champs dont la certitude est rapportée (sous-ensemble de `PrefillField`). */
export const CONFIDENCE_FIELDS = ['operator', 'amount', 'paidAt', 'transactionReference', 'payerPhone'] as const;
export type ConfidenceField = (typeof CONFIDENCE_FIELDS)[number];

/** Nom du schéma chez OpenRouter. */
export const PAYMENT_PROOF_SCHEMA_NAME = 'payment_proof_reading';

const nullableString = (description: string) => ({ type: ['string', 'null'], description });
const nullableConfidence = {
  type: ['number', 'null'],
  minimum: 0,
  maximum: 1,
  description: 'Certitude de 0 à 1, ou null si la valeur est absente.'
};

/** JSON Schema commun à Gemini (`responseJsonSchema`) et OpenRouter (`strict: true`). */
export const PAYMENT_PROOF_JSON_SCHEMA = {
  type: 'object',
  properties: {
    quality: {
      type: 'string',
      enum: [...PROOF_QUALITIES],
      description:
        'OK si la capture est la preuve lisible d’un paiement mobile money ; UNREADABLE si elle est illisible ; NOT_A_PAYMENT si ce n’est pas un reçu ou une confirmation de paiement.'
    },
    operator: {
      type: ['string', 'null'],
      enum: [...PROOF_OPERATORS, null],
      description: 'Opérateur mobile money (ORANGE, MTN, MOOV, WAVE, OTHER), ou null.'
    },
    amount: {
      type: ['integer', 'null'],
      minimum: 1,
      maximum: MAX_DECLARATION_AMOUNT,
      description: 'Montant payé en francs CFA, entier, sans frais, ou null.'
    },
    paidAt: nullableString('Date et heure du paiement au format ISO 8601, ou null.'),
    transactionReference: nullableString('Identifiant de la transaction tel qu’imprimé, ou null.'),
    payerPhone: nullableString('Numéro de téléphone de l’expéditeur, ou null.'),
    recipientPhone: nullableString('Numéro de téléphone du bénéficiaire, ou null.'),
    recipientName: nullableString('Nom du bénéficiaire tel qu’imprimé, ou null.'),
    confidence: {
      type: 'object',
      properties: Object.fromEntries(CONFIDENCE_FIELDS.map(field => [field, nullableConfidence])),
      required: [...CONFIDENCE_FIELDS],
      additionalProperties: false
    }
  },
  required: [
    'quality',
    'operator',
    'amount',
    'paidAt',
    'transactionReference',
    'payerPhone',
    'recipientPhone',
    'recipientName',
    'confidence'
  ],
  additionalProperties: false
} as const;

/** Lecture validée : chaque champ vaut `null` quand le modèle n'en a pas rendu de valide. */
export interface ProofModelRead {
  quality: ProofQuality;
  operator: ProofOperator | null;
  amount: number | null;
  paidAt: string | null;
  transactionReference: string | null;
  payerPhone: string | null;
  recipientPhone: string | null;
  recipientName: string | null;
  confidence: Partial<Record<ConfidenceField, number>>;
}

/** Texte court sans caractère de commande (jamais rendu en HTML, mais jamais de balisage non plus). */
function cleanText(max: number) {
  return z
    .string()
    .transform(value =>
      value
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .pipe(z.string().min(1).max(max));
}

const FIELD_SCHEMAS = {
  operator: z.enum(PROOF_OPERATORS),
  amount: z.number().int().min(1).max(MAX_DECLARATION_AMOUNT),
  paidAt: z
    .string()
    .trim()
    .min(10)
    .max(40)
    .refine(value => !Number.isNaN(Date.parse(value))),
  transactionReference: cleanText(60),
  payerPhone: cleanText(40),
  recipientPhone: cleanText(40),
  recipientName: cleanText(80)
} as const;

const confidenceValue = z.number().min(0).max(1);

function pick<K extends keyof typeof FIELD_SCHEMAS>(
  record: Record<string, unknown>,
  key: K
): z.infer<(typeof FIELD_SCHEMAS)[K]> | null {
  const parsed = FIELD_SCHEMAS[key].safeParse(record[key]);
  return parsed.success ? (parsed.data as z.infer<(typeof FIELD_SCHEMAS)[K]>) : null;
}

/**
 * Valide la sortie brute du modèle, champ par champ. Rend `null` si ce n'est pas
 * un objet ou si `quality` est inconnue. Une qualité autre que `OK` rend tous les
 * champs à `null` (une capture illisible ou étrangère ne propose rien).
 */
export function parseProofModelOutput(raw: unknown): ProofModelRead | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const quality = z.enum(PROOF_QUALITIES).safeParse(record.quality);
  if (!quality.success) return null;

  const empty: ProofModelRead = {
    quality: quality.data,
    operator: null,
    amount: null,
    paidAt: null,
    transactionReference: null,
    payerPhone: null,
    recipientPhone: null,
    recipientName: null,
    confidence: {}
  };
  if (quality.data !== 'OK') return empty;

  const read: ProofModelRead = {
    ...empty,
    operator: pick(record, 'operator'),
    amount: pick(record, 'amount'),
    paidAt: pick(record, 'paidAt'),
    transactionReference: pick(record, 'transactionReference'),
    payerPhone: pick(record, 'payerPhone'),
    recipientPhone: pick(record, 'recipientPhone'),
    recipientName: pick(record, 'recipientName')
  };
  const rawConfidence =
    record.confidence && typeof record.confidence === 'object' && !Array.isArray(record.confidence)
      ? (record.confidence as Record<string, unknown>)
      : {};
  for (const field of CONFIDENCE_FIELDS) {
    const value = confidenceValue.safeParse(rawConfidence[field]);
    // Une certitude n'a de sens que pour une valeur retenue.
    if (value.success && read[field] !== null) read.confidence[field] = value.data;
  }
  return read;
}
