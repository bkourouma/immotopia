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
  'contrat_bail_habitation.docx': [
    '7a0e73cae14fd7b882c0f0220f6175feaccc57d6bd6a239fe84b4756f41eb02b',
    // Version sans en-tete ni logo, remplacee par `assets/modeles_standard/bail_habitation.docx`.
    '9b82587a85c753e1a52e87045d4a2f4ff04ca2283c0ec6fc61f39dfee2bf9bf8'
  ],
  'contrat_bail_commercial.docx': [
    '77eab5eaaec6afa4c5cbbfb60c8f58b032c8fe8c4f82c5b5660f7d74a7289f04',
    // Version sans en-tete ni logo, remplacee par `assets/modeles_standard/bail_commercial.docx`.
    'a9efc972b9a635c4b9028746a26907b29f932f7d1ec5c72f459db05175280220'
  ],
  // Versions sans en-tete ni logo, remplacees par les modeles de `assets/modeles_standard/`.
  'Reçu_Loyer.docx': ['c109f874963385c7a4f703247149e99ca8957d8cf765481d2cf6c72c278ca592'],
  'Releve_Compte.docx': ['30bcf661336aeeda86172d4268959f0ac656dba20f329d037df8b27153d4c080']
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
