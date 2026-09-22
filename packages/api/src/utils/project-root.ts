import * as path from 'path';

/**
 * Racine du monorepo, quel que soit le repertoire de lancement.
 *
 * `npm run dev:api` passe par les workspaces npm, qui placent toujours le
 * processus dans `packages/api` ; un lancement depuis la racine, lui, y reste.
 * Les deux cas doivent donner la meme racine, puisque c'est la que vivent
 * `uploads/` et `assets/`.
 *
 * Ce calcul etait recopie a une quinzaine d'endroits, et six d'entre eux ne
 * remontaient que d'un niveau : ils visaient `packages/` au lieu de la racine.
 * Les pieces jointes des tickets de maintenance, ecrites a la racine par leur
 * service mais servies depuis `packages/uploads` par le serveur statique,
 * revenaient introuvables — vignettes cassees a l'ecran. Un seul endroit pour
 * ce calcul supprime la question.
 */
export function getProjectRoot(): string {
  const cwd = process.cwd();
  return path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages'
    ? path.resolve(cwd, '..', '..')
    : cwd;
}

/** Racine des fichiers deposes, `UPLOADS_DIR` ayant le dernier mot. */
export function getUploadsRoot(uploadsDir?: string | null): string {
  return uploadsDir ? path.resolve(uploadsDir) : path.join(getProjectRoot(), 'uploads');
}
