import type { ChatRequest } from './contracts';

export const MODEL_HISTORY_BUDGET = 400_000;
const RECENT_EXCHANGES = 8;
const COMPACT_TEXT_LIMIT = 1_500;

type HistoricalTurn = { question: string; response: string };
type Message = ChatRequest['messages'][number];

function historyText(value: string, compact: boolean): string {
  const text = value.replace(/\bdata:[^\s<>"')]+/giu, url => (url.length > 2_000 ? '' : url)).trim();
  if (!compact || text.length <= COMPACT_TEXT_LIMIT) return text;
  return (
    text
      .slice(0, COMPACT_TEXT_LIMIT - 1)
      .replace(/[\uD800-\uDBFF]$/u, '')
      .trimEnd() + '…'
  );
}

/** Le tour en cours compte comme un échange. Les autres arrivent du plus récent au plus ancien. */
export async function buildTurnHistory(
  question: string,
  previous: AsyncIterable<HistoricalTurn>
): Promise<ChatRequest['messages']> {
  const messages: Message[] = [{ role: 'user', content: question }];
  const size = (message: Message) => JSON.stringify(message).length + 1;
  let remaining = MODEL_HISTORY_BUDGET - 1 - size(messages[0]);
  let exchanges = 1;
  for await (const row of previous) {
    const compact = exchanges >= RECENT_EXCHANGES;
    const content = historyText(row.question, compact);
    if (!content) continue;
    const user: Message = { role: 'user', content };
    const answer = historyText(row.response, compact);
    const assistant: Message = { role: 'assistant', content: answer };
    const cost = size(user) + (answer ? size(assistant) : 0);
    if (cost > remaining) break;
    if (answer) messages.push(assistant);
    messages.push(user);
    remaining -= cost;
    exchanges += 1;
  }
  return messages.reverse();
}
