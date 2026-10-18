import { createHmac, hkdfSync } from 'node:crypto';
import { env } from '../../config/env';
import { t } from '../../i18n';
import { BadRequestError } from '../../middleware/error-middleware';

/**
 * Empreinte du fichier de remise (spec 042, P2).
 *
 * Le fichier contient les IBAN complets. Un SHA-256 non salé permettrait de
 * retrouver l'IBAN d'une remise à une ligne (essai exhaustif sur les IBAN d'un
 * pays) : l'empreinte est donc un HMAC-SHA-256 dont la clé est DÉRIVÉE (HKDF)
 * de `DIRECT_DEBIT_IBAN_KEY`, sans jamais servir telle quelle. C'est un HMAC,
 * pas un SHA-256 vérifiable de l'extérieur : seul le serveur peut la recalculer.
 * Sans clé courante, aucun fichier n'est produit.
 */

const KEY_INFO = 'immotopia:direct-debit:remittance-file-digest';

function digestKey(): Buffer {
  const raw = env.DIRECT_DEBIT_IBAN_KEY?.trim();
  const master = raw ? Buffer.from(raw, 'base64') : null;
  if (!master || master.length !== 32) {
    throw new BadRequestError(t("Le chiffrement des coordonnées bancaires n'est pas configuré sur ce serveur."));
  }
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), Buffer.from(KEY_INFO, 'utf8'), 32));
}

/** Lève une BadRequestError sans clé courante, avant tout déchiffrement d'IBAN. */
export function assertFileDigestAvailable(): void {
  digestKey();
}

/** HMAC-SHA-256 hexadécimal du fichier. Lève une BadRequestError sans clé courante. */
export function computeRemittanceFileDigest(content: Buffer): string {
  return createHmac('sha256', digestKey()).update(content).digest('hex');
}
