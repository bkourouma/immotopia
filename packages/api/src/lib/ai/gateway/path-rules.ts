/**
 * Règles de chemin de la passerelle IA : fonctions PURES (aucune dépendance), partagées
 * par le générateur de catalogue (`catalog-builder.ts`), les outils (`call_read`,
 * `plan_write`) et l'exécution confirmée (`actions/execute-capability.ts`), qui
 * revérifie à l'exécution ce que le catalogue a déjà exclu (défense en profondeur).
 */

/** Écriture destructrice déguisée en POST (ou autre méthode) : suffixe du chemin. */
const DESTRUCTIVE_SUFFIX = /\/(delete|remove|destroy|purge)$/i;

/**
 * Chemin évoquant un secret, un jeton ou un identifiant de connexion. Testé par
 * segment : « cash-sessions » (caisse, donnée métier) n'est PAS une session de
 * connexion, seul le segment `session(s)` seul l'est.
 */
const SENSITIVE_SEGMENT =
  /(secret|token|credential|password|passwd|api-?key|webhook|jwt|invitation|payment-gateway|payment-link|secure-link|private-key|otp)/i;
const SENSITIVE_EXACT_SEGMENTS = new Set(['session', 'sessions', 'login', 'sso', 'oauth']);

export function isSensitivePath(path: string): boolean {
  return path.split('/').some(segment => {
    const bare = segment.replace(/^:/, '').toLowerCase();
    if (segment.startsWith(':')) return false; // un paramètre n'est pas un mot du chemin
    return SENSITIVE_SEGMENT.test(bare) || SENSITIVE_EXACT_SEGMENTS.has(bare);
  });
}

export function isDestructive(method: string, path: string): boolean {
  return method === 'DELETE' || DESTRUCTIVE_SUFFIX.test(path);
}

// --- Écritures sensibles (étape 4) -------------------------------------------

export type WriteSensitivityCategory = 'payment' | 'sending' | 'signature' | 'accounting' | 'access' | 'bulk';

/**
 * Mots de chemin qui font d'une écriture une écriture SENSIBLE : plan en rouge et
 * saisie du mot de confirmation. Testés par MOT (un segment est découpé sur `-`, `_`
 * et les majuscules ; un paramètre `:id` n'est pas un mot du chemin), au singulier ou
 * au pluriel. Un mot absent de cette liste ne rend pas une écriture inoffensive : le
 * plan montre toujours les changements, et la route réelle reste garde de la permission.
 *
 * - payment    : paiement, remboursement, virement
 * - sending    : envois et notifications (e-mail, SMS, WhatsApp, relances, campagnes, newsletter)
 * - signature  : signature
 * - accounting : validation, clôture ou annulation comptable (valider, approuver, clôturer, verrouiller, facturer, annuler/void)
 * - access     : comptes et droits (rôles, permissions, invitation, activation, suspension, mot de passe)
 * - bulk       : imports et opérations en masse
 */
const SENSITIVE_WRITE_WORDS: Record<WriteSensitivityCategory, readonly string[]> = {
  payment: ['pay', 'payment', 'payout', 'refund', 'transfer', 'paiement', 'remboursement', 'virement'],
  sending: [
    'send',
    'sending',
    'email',
    'mail',
    'sms',
    'whatsapp',
    'notify',
    'notification',
    'remind',
    'reminder',
    'relance',
    'campaign',
    'newsletter'
  ],
  signature: ['sign', 'signing', 'signature'],
  accounting: [
    'validate',
    'validation',
    'approve',
    'approval',
    'close',
    'closing',
    'cloture',
    'lock',
    'invoice',
    'facture',
    'void',
    'annulation'
  ],
  access: ['role', 'permission', 'invite', 'activate', 'activation', 'suspend', 'password'],
  bulk: ['import', 'bulk', 'batch']
};

const WORD_TO_CATEGORY: ReadonlyMap<string, WriteSensitivityCategory> = new Map(
  (Object.entries(SENSITIVE_WRITE_WORDS) as Array<[WriteSensitivityCategory, readonly string[]]>).flatMap(
    ([category, words]) => words.flatMap(word => [[word, category] as const, [`${word}s`, category] as const])
  )
);

/** Mots (minuscules) des segments littéraux d'un chemin : `/a/:id/send-email` -> `a`, `send`, `email`. */
export function pathWords(path: string): string[] {
  return path
    .split('/')
    .filter(segment => segment.length > 0 && !segment.startsWith(':'))
    .flatMap(segment =>
      segment
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^A-Za-z0-9]+/)
        .map(word => word.toLowerCase())
        .filter(word => word.length > 0)
    );
}

/** Catégorie sensible d'une écriture selon son chemin, ou null. Première correspondance dans l'ordre du chemin. */
export function writeSensitivity(path: string): { category: WriteSensitivityCategory; word: string } | null {
  for (const word of pathWords(path)) {
    const category = WORD_TO_CATEGORY.get(word);
    if (category) return { category, word };
  }
  return null;
}
