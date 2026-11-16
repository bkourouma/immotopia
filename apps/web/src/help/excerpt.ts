import type { HelpEntry } from './types';

/**
 * Texte brut lisible d'une fiche (pour ImmoCopilot). Pas de troncature ici :
 * `truncateHelpExcerpt` (copilot-bridge.ts) s'en charge.
 */
export function helpEntryToPlainText(entry: HelpEntry): string {
  const sections: string[] = [];
  const add = (text: string | undefined) => {
    const value = text?.trim();
    if (value) sections.push(value);
  };

  add(entry.title);
  add(entry.summary);
  add(entry.purpose);

  const columns = entry.howToRead?.columns ?? [];
  if (columns.length > 0) add(columns.map(c => `${c.label} : ${c.description}`).join('\n'));
  const statuses = entry.howToRead?.statuses ?? [];
  if (statuses.length > 0) add(statuses.map(s => `${s.label} : ${s.description}`).join('\n'));
  const notes = entry.howToRead?.notes ?? [];
  if (notes.length > 0) add(notes.join('\n'));

  const steps = entry.steps ?? [];
  if (steps.length > 0) {
    add(steps.map((s, i) => `${i + 1}. ${s.title}${s.detail ? ` : ${s.detail}` : ''}`).join('\n'));
  }

  const consequences = entry.consequences ?? [];
  if (consequences.length > 0) add(consequences.join('\n'));

  const faq = entry.faq ?? [];
  if (faq.length > 0) add(faq.map(f => `${f.q}\n${f.a}`).join('\n\n'));

  return sections.join('\n\n');
}
