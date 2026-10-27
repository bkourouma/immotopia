import * as path from 'path';
import { env } from '../config/env';
import { getProjectRoot } from './project-root';

/**
 * Emplacements des dossiers `assets/` de l'API.
 *
 * Deux natures de fichiers, deux emplacements :
 *
 * - **Modèles livrés** (`assets/modeles_documents/*.docx`) : en LECTURE SEULE,
 *   embarqués dans l'image Docker sous `/app/assets/` (le répertoire courant
 *   du conteneur est `/app`, `dist/` s'y trouve). En développement, c'est
 *   `<racine du monorepo>/assets/`.
 * - **Écriture à l'exécution** (documents générés, modèles importés par une
 *   agence) : sur le volume des fichiers, sous `UPLOADS_DIR`, jamais dans la
 *   couche de l'image (perdue à chaque recréation du conteneur, et `/app`
 *   appartient à root alors que le conteneur tourne en `node`). Sans
 *   `UPLOADS_DIR` (développement), on garde l'ancien emplacement
 *   `<racine>/assets/...`.
 *
 * Les fichiers déjà générés avant ce changement portent un chemin absolu en
 * base (ancien emplacement) : les lecteurs essaient d'abord le chemin stocké,
 * puis l'ancien dossier (`legacy*`), sans migration de données.
 */

/** `<racine>/assets` : modèles livrés (lecture seule) et ancien emplacement d'écriture. */
export function getShippedAssetsRoot(): string {
  return path.join(getProjectRoot(), 'assets');
}

/** Modèles `.docx` livrés avec l'application. */
export function getShippedTemplatesDir(): string {
  return path.join(getShippedAssetsRoot(), 'modeles_documents');
}

/** Ancien dossier des documents générés (`<racine>/assets/generated_documents`). */
export function getLegacyGeneratedDocumentsDir(): string {
  return path.join(getShippedAssetsRoot(), 'generated_documents');
}

/** Dossier d'écriture des documents générés : volume des fichiers si `UPLOADS_DIR` est posé. */
export function getGeneratedDocumentsDir(): string {
  return env.UPLOADS_DIR
    ? path.join(path.resolve(env.UPLOADS_DIR), 'generated_documents')
    : getLegacyGeneratedDocumentsDir();
}

/**
 * Dossier d'un document généré : `<dossier des documents générés>/<agence>/<type>/<AAAA>/<MM>`.
 * Découpage unique, partagé par `saveGeneratedDocument` et par les seeds de recette : un
 * fichier semé atterrit là où l'API d'exécution le relit.
 */
export function getGeneratedDocumentDir(tenantId: string, docType: string, year: number, month: number): string {
  return path.join(getGeneratedDocumentsDir(), tenantId, docType, String(year), String(month).padStart(2, '0'));
}

/** Dossier d'écriture des modèles importés (agences, défauts semés) : volume si `UPLOADS_DIR` est posé. */
export function getTemplatesWriteDir(): string {
  return env.UPLOADS_DIR ? path.join(path.resolve(env.UPLOADS_DIR), 'modeles_documents') : getShippedTemplatesDir();
}

/** Vrai si `filePath` est dans `base` (ou égal à `base`). */
export function isInsideDir(filePath: string, base: string): boolean {
  const rel = path.relative(path.resolve(base), path.resolve(filePath));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
