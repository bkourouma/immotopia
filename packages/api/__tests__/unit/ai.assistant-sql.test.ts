import { compileAssistantSql, sqlViews } from '../../src/lib/ai/assistant-sql';

it('lie les valeurs et conserve le regroupement des montants par devise', () => {
  const compiled = compileAssistantSql(
    "SELECT currency, SUM(amount) AS total FROM rental_receipts WHERE received_on >= '2026-01-01' AND method = 'CASH' GROUP BY currency ORDER BY total DESC LIMIT 12",
    sqlViews.receipts
  );
  expect(compiled.sql.text).toContain('FROM assistant_read."rental_receipts"');
  expect(compiled.sql.text).toContain('GROUP BY "currency"');
  expect(compiled.sql.text).toContain('ORDER BY "total" DESC');
  expect(compiled.sql.text).not.toContain('CASH');
  expect(compiled.sql.values).toEqual(['2026-01-01', 'CASH', 12]);
  expect(compiled.rowLimit).toBe(12);
});

it.each([
  'SELECT * FROM rental_receipts',
  'SELECT COUNT(*) FROM public.rental_payments',
  'SELECT COUNT(*) FROM rental_installments',
  'SELECT tenant_id FROM rental_receipts',
  'SELECT count(*) FROM rental_receipts; SELECT count(*) FROM rental_receipts',
  'SELECT count(*) FROM rental_receipts JOIN rental_receipts r ON true',
  'SELECT count(*) FROM rental_receipts WHERE amount = (SELECT 1)',
  'SELECT count(*) FROM rental_receipts OFFSET 5',
  'SELECT count(*) FROM rental_receipts FOR UPDATE',
  'SELECT lower(currency) FROM rental_receipts',
  'SELECT SUM(amount) FROM rental_receipts',
  'SELECT amount FROM rental_receipts',
  'SELECT currency, count(*) OVER () FROM rental_receipts'
])('refuse %s', sql => {
  expect(() => compileAssistantSql(sql, sqlViews.receipts)).toThrow();
});

it('plafonne un résultat demandé au-delà de 200 lignes et détecte la troncature', () => {
  const compiled = compileAssistantSql('SELECT currency, amount FROM rental_receipts LIMIT 999', sqlViews.receipts);
  expect(compiled.rowLimit).toBe(200);
  expect(compiled.sql.values).toEqual([201]);
});
