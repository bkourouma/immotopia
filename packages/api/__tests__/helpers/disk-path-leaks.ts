/**
 * Fuites de chemins dans une réponse d'API de portail.
 *
 * Une réponse de portail ne porte jamais :
 *   - de clé `filePath` / `file_path` / `storage_path` / `proofPath` (chemin disque) ;
 *   - de chaîne qui ressemble à un chemin disque (`C:\…`, `D:/…`) ;
 *   - de chaîne contenant `/uploads/`, sauf l'URL publique d'un média
 *     d'annonce (`/uploads/properties/<bien>/<fichier>`) ou d'un logo
 *     d'agence (`/uploads/properties/agency-logos/<agence>/<fichier>`). Un
 *     chemin absolu (`/srv/app/uploads/…`) ou l'identifiant de stockage d'un
 *     fichier privé (`/uploads/maintenance/…`) sont des fuites.
 *
 * Rend la liste des fuites trouvées, chacune avec son chemin JSON.
 */

const PATH_KEYS = new Set(['filePath', 'file_path', 'storage_path', 'proofPath']);
// Une lettre de lecteur seule (`C:\`, `D:/`), pas le `s:/` de `https://`.
const DRIVE_PATH = /(?:^|[^A-Za-z])[A-Za-z]:(?:\\|\/)/;
const PUBLIC_UPLOAD = /^\/uploads\/properties\/(?:agency-logos\/[^/]+|[^/]+)\/[^/]+$/;

function isPublicUpload(value: string): boolean {
  return PUBLIC_UPLOAD.test(value) && !/\/documents\//.test(value) && !value.endsWith('/documents');
}

export function findDiskPathLeaks(value: unknown, at = '$'): string[] {
  if (typeof value === 'string') {
    if (DRIVE_PATH.test(value)) return [`${at} = ${value}`];
    if (value.includes('/uploads/') && !isPublicUpload(value)) return [`${at} = ${value}`];
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findDiskPathLeaks(item, `${at}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => [
      ...(PATH_KEYS.has(key) ? [`${at}.${key} (clé interdite)`] : []),
      ...findDiskPathLeaks(item, `${at}.${key}`)
    ]);
  }
  return [];
}
