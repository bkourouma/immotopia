/**
 * Fait enregistrer par le navigateur un fichier reçu de l'API (`responseType:
 * 'blob'`). Pour les documents privés, servis par une route authentifiée et
 * jamais par un lien direct vers `/uploads/...`.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Nom de fichier de `Content-Disposition` (`filename*=UTF-8''…` d'abord), sinon `fallback`. */
export function filenameFromDisposition(disposition: unknown, fallback: string): string {
  const header = String(disposition ?? '');
  const extended = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1]);
    } catch {
      return extended[1];
    }
  }
  const simple = header.match(/filename="?([^";]+)"?/i);
  return simple?.[1] ?? fallback;
}
