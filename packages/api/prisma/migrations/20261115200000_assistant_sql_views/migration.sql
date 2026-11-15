CREATE SCHEMA assistant_read;
REVOKE ALL ON SCHEMA assistant_read FROM PUBLIC;

CREATE VIEW assistant_read.rental_receipts WITH (security_barrier = true) AS
SELECT succeeded_at::date AS received_on,
       CASE WHEN currency = 'FCFA' THEN 'XOF' ELSE left(currency, 12) END AS currency,
       amount, method::text AS method
FROM public.rental_payments
WHERE tenant_id = nullif(current_setting('immotopia.assistant_tenant', true), '')
  AND status = 'SUCCESS'
  AND succeeded_at IS NOT NULL;

CREATE VIEW assistant_read.rental_installments WITH (security_barrier = true) AS
SELECT due_date::date AS due_on,
       CASE WHEN currency = 'FCFA' THEN 'XOF' ELSE left(currency, 12) END AS currency,
       status::text AS status,
       amount_rent + amount_service + amount_other_fees + penalty_amount AS gross_amount,
       amount_paid AS allocated_amount,
       greatest(0, amount_rent + amount_service + amount_other_fees + penalty_amount - amount_paid) AS outstanding_amount
FROM public.rental_installments
WHERE tenant_id = nullif(current_setting('immotopia.assistant_tenant', true), '')
  AND status <> 'CANCELED';

REVOKE ALL ON ALL TABLES IN SCHEMA assistant_read FROM PUBLIC;
