import { buildTurnHistory, MODEL_HISTORY_BUDGET } from '../../src/lib/ai/conversation-history';

async function* turns(rows: Array<{ question: string; response: string }>) {
  yield* rows;
}

it('garde sept échanges antérieurs intacts et compacte les plus anciens, dans l’ordre chronologique', async () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    question: `Question ${index}`,
    response: `Réponse ${index}: ${'a'.repeat(5_000)}`
  }));
  const messages = await buildTurnHistory('Suite ?', turns(rows));
  expect(messages).toHaveLength(41);
  expect(messages[0]).toEqual({ role: 'user', content: 'Question 19' });
  expect(messages[1].content).toHaveLength(1_500);
  expect(messages[1].content.endsWith('…')).toBe(true);
  expect(messages[27].content).toBe(rows[6].response);
  expect(messages.at(-2)?.content).toBe(rows[0].response);
  expect(messages.at(-1)).toEqual({ role: 'user', content: 'Suite ?' });
});

it('écarte des échanges entiers selon le budget sérialisé et conserve la nouvelle question', async () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({
    question: `Question ${index}`,
    response: '"'.repeat(100_000)
  }));
  const messages = await buildTurnHistory('Suite ?', turns(rows));
  expect(JSON.stringify(messages).length).toBeLessThanOrEqual(MODEL_HISTORY_BUDGET);
  expect(messages.map(message => message.role)).toEqual(['user', 'assistant', 'user']);
  expect(messages[0].content).toBe('Question 0');
  expect(messages.at(-1)?.content).toBe('Suite ?');
});

it('retire les grosses données incorporées et les réponses vides', async () => {
  const embedded = `data:image/png;base64,${'A'.repeat(2_050)}`;
  const messages = await buildTurnHistory(
    'Suite ?',
    turns([
      { question: 'Voir le document', response: embedded },
      { question: embedded, response: 'Réponse à une image' }
    ])
  );
  expect(messages).toEqual([
    { role: 'user', content: 'Voir le document' },
    { role: 'user', content: 'Suite ?' }
  ]);
});
