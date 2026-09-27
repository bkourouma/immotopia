import type { DmmfField, DmmfModel } from './model-registry';

/**
 * Champs retires de l'export (lot S7), partout ou ils apparaissent.
 *
 * 1. Par le nom : tout champ dont le nom contient `password`, `hash`,
 *    `token`, `secret`, `apikey`/`api_key`, `credential` ou `encrypted`
 *    (insensible a la casse), ou dont un MOT vaut `iv` ou `salt` — par mot
 *    et non par sous-chaine, sinon `isActive` ou `activity` tomberaient.
 * 2. Par une liste explicite : charges brutes et codes de l'agregateur de
 *    paiement, liens d'invitation, que la regle de nom ne voit pas.
 * 3. `User` : liste blanche (aucun hash, aucun identifiant Google, aucun role
 *    plateforme).
 */

const SENSITIVE_SUBSTRINGS = ['password', 'hash', 'token', 'secret', 'apikey', 'api_key', 'credential', 'encrypted'];
const SENSITIVE_WORDS = new Set(['iv', 'salt']);

/** Champs sensibles que la regle de nom ne voit pas, par modele. */
export const EXPLICIT_SENSITIVE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  // PaySecureHub : le code de paiement sert de jeton au simulateur, l'URL de
  // paiement l'embarque, et la charge brute de l'agregateur peut porter ses
  // identifiants techniques.
  OnlinePaymentCheckout: ['codePaiement', 'checkoutUrl', 'lastProviderPayload'],
  PlatformPaymentCheckout: ['codePaiement', 'checkoutUrl', 'lastProviderPayload'],
  RentalPayment: ['raw_event_payload'],
  RentalRefund: ['raw_event_payload'],
  // Le lien d'invitation a un groupe WhatsApp donne l'acces au groupe.
  WhatsappGroupInviteLog: ['invite_link'],
  // Identifiants chiffres de la passerelle (deja couverts par la regle de nom,
  // listes ici pour qu'un renommage ne les fasse pas fuiter).
  PaymentGatewayConfig: ['apiKeyEncrypted', 'apiKeyLast4', 'merchantId']
};

/** Seuls champs exportes d'un compte utilisateur. */
export const USER_EXPORT_FIELDS: readonly string[] = [
  'id',
  'email',
  'fullName',
  'avatarUrl',
  'emailVerified',
  'isActive',
  'preferredLanguage',
  'lastLoginAt',
  'createdAt',
  'updatedAt'
];

function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function isSensitiveFieldName(name: string): boolean {
  const lower = name.toLowerCase();
  if (SENSITIVE_SUBSTRINGS.some(part => lower.includes(part))) return true;
  return words(name).some(word => SENSITIVE_WORDS.has(word));
}

function isScalar(field: DmmfField): boolean {
  return field.kind === 'scalar' || field.kind === 'enum';
}

/** Champs scalaires exportables d'un modele, dans l'ordre du schema. */
export function exportableFields(model: DmmfModel): string[] {
  if (model.name === 'User') {
    const present = new Set(model.fields.filter(isScalar).map(f => f.name));
    return USER_EXPORT_FIELDS.filter(name => present.has(name));
  }
  const explicit = new Set(EXPLICIT_SENSITIVE_FIELDS[model.name] ?? []);
  return model.fields
    .filter(isScalar)
    .map(f => f.name)
    .filter(name => !explicit.has(name) && !isSensitiveFieldName(name));
}
