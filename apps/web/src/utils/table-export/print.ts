import type { ExportTable, WriterOptions } from './types';
import { generatedOn, LANDSCAPE_THRESHOLD } from './pdf';

/**
 * Repli impression du PDF : le tableau est écrit en HTML dans un iframe caché,
 * puis `print()` ouvre la boîte d'impression du navigateur (l'utilisateur
 * choisit « Enregistrer en PDF »). Seul chemin possible pour l'arabe, que les
 * polices standard de jsPDF ne savent pas écrire.
 *
 * Tout contenu venant des données est ÉCHAPPÉ : aucune injection possible.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPrintHtml(table: ExportTable, opts: WriterOptions): string {
  const rtl = opts.language === 'ar';
  const landscape = table.columns.length > LANDSCAPE_THRESHOLD;
  const head = table.columns.map(c => `<th>${escapeHtml(c.header)}</th>`).join('');
  const body = table.rows
    .map(row => {
      const cells = row
        .map((cell, i) => {
          const style = [
            table.columns[i]?.numeric ? 'text-align:end' : '',
            cell.indent ? `padding-inline-start:${cell.indent * 12 + 6}px` : ''
          ]
            .filter(Boolean)
            .join(';');
          return `<td${style ? ` style="${style}"` : ''}>${escapeHtml(cell.text)}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="${escapeHtml(opts.language)}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(opts.title)}</title>
<style>
@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; }
body { font-family: Arial, "Segoe UI", Tahoma, sans-serif; font-size: 11px; color: #111; }
h1 { font-size: 16px; margin: 0 0 4px; }
p { margin: 0 0 12px; color: #666; font-size: 10px; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: start; vertical-align: top; }
th { background: #34495e; color: #fff; }
</style>
</head>
<body>
<h1>${escapeHtml(opts.title)}</h1>
<p>${escapeHtml(generatedOn(opts.locale))}</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body>
</html>`;
}

/** Ouvre la boîte d'impression sur le tableau. Rejette si l'iframe est inutilisable. */
export function printTable(table: ExportTable, opts: WriterOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    const cleanup = () => frame.remove();

    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        cleanup();
        reject(new Error('print-frame'));
        return;
      }
      win.addEventListener('afterprint', cleanup);
      // Filet de sécurité : certains navigateurs ne déclenchent pas `afterprint`.
      setTimeout(cleanup, 120_000);
      win.focus();
      win.print();
      resolve();
    };
    frame.srcdoc = buildPrintHtml(table, opts);
    document.body.appendChild(frame);
  });
}
