/**
 * Rafraichissement des modeles par defaut deja semes en base.
 *
 * Le seed ne recreait un modele que s'il n'existait pas : un modele corrige
 * dans `assets/modeles_documents/` n'atteignait donc jamais les bases
 * existantes. La decision est pure (testable) ; l'ecriture est dans le seed.
 */

export type TemplateRefreshDecision =
  /** Aucun modele par defaut : le creer. */
  | 'CREATE'
  /** Modele livre inchange : rien a faire (idempotence). */
  | 'UP_TO_DATE'
  /** Ancienne version livree, non personnalisee : remplacer le fichier. */
  | 'REFRESH'
  /** Modele d'agence, ou global personnalise : ne jamais y toucher. */
  | 'KEEP_CUSTOM';

export interface ExistingDefaultTemplate {
  tenant_id: string | null;
  is_default: boolean;
  file_hash_sha256: string;
}

/**
 * Empreintes SHA-256 des versions precedentes livrees, par fichier livre.
 * A completer a chaque modification d'un modele livre (ajouter l'empreinte de
 * l'ancienne version avant de la remplacer).
 */
export const PREVIOUS_SHIPPED_HASHES: Record<string, string[]> = {
  'contrat_bail_habitation.docx': ['7a0e73cae14fd7b882c0f0220f6175feaccc57d6bd6a239fe84b4756f41eb02b'],
  'contrat_bail_commercial.docx': ['77eab5eaaec6afa4c5cbbfb60c8f58b032c8fe8c4f82c5b5660f7d74a7289f04']
};

/**
 * @param existing modele par defaut actif en base (ou null)
 * @param shippedHash empreinte du fichier livre aujourd'hui
 * @param previousShippedHashes empreintes des versions livrees auparavant
 * @param force remplace aussi un global d'empreinte inconnue (jamais un modele d'agence)
 */
export function decideTemplateRefresh(
  existing: ExistingDefaultTemplate | null,
  shippedHash: string,
  previousShippedHashes: readonly string[] = [],
  force = false
): TemplateRefreshDecision {
  if (!existing) return 'CREATE';
  // Un modele d'agence appartient a l'agence : jamais rafraichi.
  if (existing.tenant_id !== null) return 'KEEP_CUSTOM';
  if (existing.file_hash_sha256 === shippedHash) return 'UP_TO_DATE';
  if (previousShippedHashes.includes(existing.file_hash_sha256) || force) return 'REFRESH';
  // Empreinte inconnue : modele global personnalise par la plateforme.
  return 'KEEP_CUSTOM';
}
