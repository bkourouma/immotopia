import { t } from '../../../i18n';
import type { CopilotToolName, LlmBlock, LlmMessage, LlmProvider, LlmToolSpec, LlmTurnResult } from '../contracts';

/**
 * Faux fournisseur déterministe (`AI_PROVIDER=fake`, interdit en production).
 *
 * Il sert aux tests, à la démo et à la recette sans clé. Il n'exécute jamais
 * rien : il ne fait qu'émettre des appels d'outils, dont
 * `propose_rental_document`, qui ne fait que proposer. Le jeton et la
 * confirmation humaine restent seuls maîtres de la génération.
 *
 * Sans script, des règles par mots-clés lisent le dernier message utilisateur :
 * - « quittance » (+ `L-\d+` ou le bail actif, + période `YYYY-MM` ou mois en
 *   lettres) : search_leases puis propose_rental_document ;
 * - « documents » : search_leases puis list_lease_documents (bail cité) ou
 *   search_properties puis list_property_documents ;
 * - « biens » (+ commune ou quartier) : search_properties.
 * Une fois les `tool_result` revenus, il répond en texte, découpé en morceaux
 * de 20 caractères via `onTextDelta`.
 */

export interface FakeStep {
  /** Texte de l'assistant pour ce tour (découpé en morceaux de 20 caractères). */
  text?: string;
  /** Appels d'outils émis ; le tour se termine alors sur `tool_use`. */
  toolCalls?: Array<{ name: CopilotToolName; input: unknown }>;
}

export const FAKE_CHUNK_SIZE = 20;

type ToolResult = { name: string; data: unknown; isError: boolean };

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

/** Minuscules sans accents, pour comparer des mots-clés. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const MONTHS = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre'
];

const MONTH_LABELS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
];

function textOf(message: LlmMessage): string {
  return message.content
    .filter((block): block is Extract<LlmBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join(' ');
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** Premier élément d'un tableau d'objets quelconque du résultat d'outil. */
function firstItem(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
  }
  if (data && typeof data === 'object') {
    for (const value of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(value)) return firstItem(value);
    }
  }
  return null;
}

function countItems(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    for (const value of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(value)) return value.length;
    }
  }
  return 0;
}

function idOf(item: Record<string, unknown> | null): string | null {
  const id = item?.id ?? item?.leaseId ?? item?.propertyId;
  return typeof id === 'string' ? id : null;
}

/** Commune ou quartier cité après une préposition (« à Cocody », « dans le quartier X »). */
function extractPlace(text: string): string | null {
  const match =
    /(?<![\p{L}])(?:à|dans|au|en|sur|quartier|commune de|ville de)\s+(?:(?:le|la|l'|les|du|de)\s+)?(?:(?:quartier|commune)\s+(?:de\s+)?)?([\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,2})/iu.exec(
      text
    );
  if (!match) return null;
  const stop = new Set(['avec', 'pour', 'et', 'ou', 'qui', 'de', 'du', 'a', 'à', 'en', 'sur', 'dans']);
  const words = match[1].split(/\s+/);
  const kept: string[] = [];
  for (const word of words) {
    if (stop.has(word.toLowerCase())) break;
    kept.push(word);
  }
  const place = kept.join(' ').replace(/[’']$/, '').trim();
  return place || null;
}

function extractPeriod(text: string, now: Date): { period: string; label: string } | null {
  const iso = /\b(20\d{2})-(0[1-9]|1[0-2])\b/.exec(text);
  if (iso) {
    const monthIndex = Number(iso[2]) - 1;
    return { period: `${iso[1]}-${iso[2]}`, label: `${MONTH_LABELS[monthIndex]} ${iso[1]}` };
  }
  const normalized = normalize(text);
  for (let index = 0; index < MONTHS.length; index += 1) {
    if (new RegExp(`\\b${MONTHS[index]}\\b`).test(normalized)) {
      const year = /\b(20\d{2})\b/.exec(normalized)?.[1] ?? String(now.getFullYear());
      return { period: `${year}-${String(index + 1).padStart(2, '0')}`, label: `${MONTH_LABELS[index]} ${year}` };
    }
  }
  return null;
}

export class FakeProvider implements LlmProvider {
  readonly id = 'fake' as const;

  constructor(
    private readonly script?: FakeStep[],
    private readonly now: () => Date = () => new Date()
  ) {}

  async runTurn(
    req: { system: string; messages: LlmMessage[]; tools: LlmToolSpec[]; maxOutputTokens: number },
    onTextDelta: (text: string) => void,
    signal: AbortSignal
  ): Promise<LlmTurnResult> {
    if (signal.aborted) throw abortError();

    const { question, round, results } = this.analyse(req.messages);
    const step = this.script ? (this.script[round] ?? {}) : this.decide(question, round, results);

    const blocks: LlmBlock[] = [];
    if (step.text) {
      for (let offset = 0; offset < step.text.length; offset += FAKE_CHUNK_SIZE) {
        if (signal.aborted) throw abortError();
        onTextDelta(step.text.slice(offset, offset + FAKE_CHUNK_SIZE));
      }
      blocks.push({ type: 'text', text: step.text });
    }

    const toolCalls = (step.toolCalls ?? []).map((call, index) => ({
      id: `fake_tool_${round}_${index}`,
      name: call.name,
      input: call.input
    }));
    for (const call of toolCalls) blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });

    return {
      stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
      assistantContent: blocks,
      toolCalls
    };
  }

  /** Dernière question de l'utilisateur, tour courant et résultats d'outils déjà reçus. */
  private analyse(messages: LlmMessage[]): { question: string; round: number; results: ToolResult[] } {
    let questionIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === 'user' && message.content.some(block => block.type === 'text')) {
        questionIndex = index;
        break;
      }
    }
    const question = questionIndex >= 0 ? textOf(messages[questionIndex]) : '';
    const after = questionIndex >= 0 ? messages.slice(questionIndex + 1) : [];

    const names = new Map<string, string>();
    let round = 0;
    const results: ToolResult[] = [];
    for (const message of after) {
      if (message.role === 'assistant') {
        round += 1;
        for (const block of message.content) if (block.type === 'tool_use') names.set(block.id, block.name);
      } else {
        for (const block of message.content) {
          if (block.type === 'tool_result') {
            results.push({
              name: names.get(block.toolUseId) ?? '',
              data: parseJson(block.content),
              isError: Boolean(block.isError)
            });
          }
        }
      }
    }
    return { question, round, results };
  }

  private decide(question: string, round: number, results: ToolResult[]): FakeStep {
    const normalized = normalize(question);
    const leaseNumber = /\bL-\d+\b/i.exec(question)?.[0].toUpperCase() ?? null;
    const call = (name: CopilotToolName, input: unknown): FakeStep => ({ toolCalls: [{ name, input }] });
    const leaseSearch = (): FakeStep => call('search_leases', leaseNumber ? { leaseNumber } : { status: 'ACTIVE' });

    if (results.some(result => result.isError)) {
      return { text: t("Je n'ai pas pu terminer cette recherche : un outil a renvoyé une erreur.") };
    }

    // 1. Quittance
    if (normalized.includes('quittance')) {
      const period = extractPeriod(question, this.now());
      if (!period)
        return { text: t('Pour quelle période souhaitez-vous la quittance ? Indiquez le mois (par exemple 2026-03).') };
      if (round === 0) return leaseSearch();
      if (round === 1) {
        const leaseId = idOf(firstItem(results[0]?.data));
        if (!leaseId) return { text: t("Je n'ai trouvé aucun bail correspondant.") };
        return call('propose_rental_document', { docType: 'RENT_RECEIPT', leaseId, period: period.period });
      }
      return {
        text: t(
          'Je vous propose la quittance de loyer de {{period}}. Elle ne sera générée qu’après votre confirmation.',
          { period: period.label }
        )
      };
    }

    // 2. Documents
    if (normalized.includes('document')) {
      const forLease = leaseNumber !== null || normalized.includes('bail');
      if (round === 0) {
        if (forLease) return leaseSearch();
        const place = extractPlace(question);
        return call('search_properties', place ? { city: place } : {});
      }
      if (round === 1) {
        const id = idOf(firstItem(results[0]?.data));
        if (!id)
          return {
            text: forLease
              ? t("Je n'ai trouvé aucun bail correspondant.")
              : t("Je n'ai trouvé aucun bien correspondant.")
          };
        return forLease
          ? call('list_lease_documents', { leaseId: id })
          : call('list_property_documents', { propertyId: id });
      }
      return { text: t('Voici les documents trouvés ({{count}}).', { count: countItems(results[1]?.data) }) };
    }

    // 3. Biens
    if (
      /\b(bien|biens|appartement|appartements|villa|villas|maison|maisons|studio|studios|terrain|terrains|local|locaux)\b/.test(
        normalized
      )
    ) {
      if (round === 0) {
        const place = extractPlace(question);
        return call('search_properties', place ? { city: place } : {});
      }
      const total = (results[0]?.data as { total?: unknown } | null)?.total;
      const count = typeof total === 'number' ? total : countItems(results[0]?.data);
      return { text: t("J'ai trouvé {{count}} bien(s) correspondant à votre recherche.", { count }) };
    }

    return {
      text: t(
        'Je peux rechercher des biens, retrouver des baux, lister des documents et proposer une quittance de loyer.'
      )
    };
  }
}
