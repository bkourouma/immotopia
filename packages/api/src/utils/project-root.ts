import * as path from 'path';

/**
 * Racine du monorepo, quel que soit le répertoire de lancement.
 *
 * L'API peut être démarrée depuis la racine du dépôt (process.cwd() est déjà la
 * racine) ou depuis packages/api (il faut alors remonter deux niveaux : api puis
 * packages). Cette détection était recopiée dans une quinzaine de fichiers, dont
 * plusieurs ne remontaient que d'un niveau et visaient donc packages/ : les
 * fichiers déposés se retrouvaient dans packages/uploads pendant que le serveur
 * statique les cherchait à la racine.
 */
export function getProjectRoot(): string {
  const cwd = process.cwd();
  return path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages'
    ? path.resolve(cwd, '..', '..')
    : cwd;
}

/**
 * Répertoire racine des fichiers déposés : UPLOADS_DIR s'il est configuré,
 * sinon <racine du dépôt>/uploads.
 */
export function getUploadsRoot(uploadsDir?: string): string {
  return uploadsDir ? path.resolve(uploadsDir) : path.join(getProjectRoot(), 'uploads');
}
