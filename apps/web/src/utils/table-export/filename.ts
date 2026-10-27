import { safeFilename } from '../copilot-artifact';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `<base assainie>-AAAA-MM-JJ.<ext>` (date locale du poste). */
export function exportFilename(base: string, ext: string, now: Date = new Date()): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${safeFilename(base, 'export')}-${date}.${ext}`;
}
