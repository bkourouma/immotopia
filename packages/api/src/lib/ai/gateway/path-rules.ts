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

/**
 * Suites de segments sensibles : les inscriptions WhatsApp de l'inventaire
 * (lot 041) portent le numéro des chefs de chantier et, à la création ou à la
 * régénération, le code d'activation en clair.
 */
const SENSITIVE_SEGMENT_PAIRS: ReadonlyArray<readonly [string, string]> = [['whatsapp', 'registrations']];

export function isSensitivePath(path: string): boolean {
  const segments = path.split('/').map(segment => segment.toLowerCase());
  for (const [first, second] of SENSITIVE_SEGMENT_PAIRS) {
    if (segments.some((segment, index) => segment === first && segments[index + 1] === second)) return true;
  }
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

export type WriteSensitivityCategory =
  'payment' | 'sending' | 'signature' | 'accounting' | 'access' | 'bulk' | 'lifecycle';

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
 * - bulk       : imports, opérations en masse, générations en lot (appels de fonds, manquantes)
 * - lifecycle  : changement d'état difficile à annuler (résiliation, annulation, archivage, cession,
 *                publication, clôture d'une opération, statut d'un bail, rebut, retour au fournisseur,
 *                mise à l'écart, retrait)
 *
 * Une écriture NON classée n'est pas pour autant sûre : elle reste soumise à l'accord simple (carte,
 * changements calculés par le serveur, bouton d'approbation) sans mot à saisir ; la route réelle garde
 * la permission. La liste est volontairement large (faux positifs acceptés : un mot de plus à saisir),
 * et complétée par `bodySensitivity` (clés du corps) et `SENSITIVE_PHRASES` (suites de mots).
 */
const SENSITIVE_WRITE_WORDS: Record<WriteSensitivityCategory, readonly string[]> = {
  payment: [
    'pay',
    'payment',
    'payout',
    'refund',
    'transfer',
    'paiement',
    'remboursement',
    'virement',
    'deposit',
    'movement',
    'remise',
    'upgrade',
    'release'
  ],
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
    'newsletter',
    'envoi',
    'convocation',
    'renvoyer',
    'resend'
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
    'annulation',
    'verrouiller',
    'ajustement',
    'billing',
    'issue',
    'ecriture'
  ],
  access: [
    'role',
    'permission',
    'invite',
    'activate',
    'activation',
    'suspend',
    'password',
    'users',
    'user',
    'disable',
    'enable',
    'revoke'
  ],
  bulk: ['import', 'bulk', 'batch'],
  lifecycle: [
    'resiliation',
    'termination',
    'terminate',
    'cancel',
    'dispose',
    'archive',
    'unarchive',
    'publish',
    'unpublish',
    'complete',
    // Lot 040, le stock : un rebut, un retour au fournisseur, une mise à
    // l'écart de ligne d'inventaire et un retrait de pièce jointe sortent de la
    // marchandise ou une preuve, et ne se défont pas d'un clic.
    'scrap',
    'return',
    'aside',
    'remove'
  ]
};

/**
 * Suites de mots consécutifs (après découpage) qui rendent une écriture sensible alors que chaque
 * mot, seul, serait trop banal : `external-access` (accès de tiers), `generer-appels` et
 * `generer-manquantes` (générations en lot).
 */
const SENSITIVE_PHRASES: ReadonlyArray<{ words: readonly string[]; category: WriteSensitivityCategory }> = [
  { words: ['external', 'access'], category: 'access' },
  { words: ['generer', 'appels'], category: 'bulk' },
  { words: ['generer', 'manquantes'], category: 'bulk' },
  { words: ['billing', 'runs'], category: 'accounting' }
];

/** `status` ne rend sensible que le statut d'un BAIL (`/leases/:id/status`) : ailleurs c'est un champ banal. */
const LEASE_WORDS = new Set(['lease', 'leases', 'bail', 'baux']);

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
  const words = pathWords(path);
  for (const word of words) {
    const category = WORD_TO_CATEGORY.get(word);
    if (category) return { category, word };
  }
  for (const { words: phrase, category } of SENSITIVE_PHRASES) {
    for (let index = 0; index + phrase.length <= words.length; index += 1) {
      if (phrase.every((word, offset) => words[index + offset] === word)) {
        return { category, word: phrase.join('-') };
      }
    }
  }
  if (words.includes('status') && words.some(word => LEASE_WORDS.has(word))) {
    return { category: 'lifecycle', word: 'status' };
  }
  return null;
}

/** Routes de comptes : utilisateurs, adhésions, collaborateurs (mots du chemin, singulier ou pluriel). */
const ACCOUNT_WORDS = new Set(['user', 'users', 'membership', 'memberships', 'collaborator', 'collaborators']);
/** Clés du corps (n'importe quelle profondeur) qui changent droits, état ou identité de connexion d'un compte. */
const ACCOUNT_BODY_KEYS = new Set(['roles', 'role', 'permissions', 'isactive', 'status', 'password', 'email']);

/**
 * Sensibilité par le CORPS : sur une route de comptes (users, memberships, collaborators), une clé
 * `roles`, `role`, `permissions`, `isActive`, `status`, `password` ou `email` rend l'écriture sensible
 * même si le chemin est banal (`PATCH /users/:userId` avec `{ roles: [...] }`). Fonction pure,
 * recalculée à l'identique à l'exécution depuis le corps signé.
 */
export function bodySensitivity(
  path: string,
  body: Record<string, unknown> | null
): { category: WriteSensitivityCategory; word: string } | null {
  if (!body || !pathWords(path).some(word => ACCOUNT_WORDS.has(word))) return null;
  const stack: unknown[] = [body];
  let visited = 0;
  while (stack.length > 0 && visited < 5000) {
    const node = stack.pop();
    visited += 1;
    if (Array.isArray(node)) {
      stack.push(...node);
    } else if (node !== null && typeof node === 'object') {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        if (ACCOUNT_BODY_KEYS.has(key.toLowerCase())) return { category: 'access', word: key };
        stack.push(child);
      }
    }
  }
  return null;
}
