-- À lancer comme administrateur PostgreSQL après les migrations.
-- Puis configurer l'authentification du rôle (p. ex. \password dans psql).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'immotopia_assistant_reader') THEN
    CREATE ROLE immotopia_assistant_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4;
  END IF;
END
$$;

ALTER ROLE immotopia_assistant_reader SET default_transaction_read_only = on;
ALTER ROLE immotopia_assistant_reader SET statement_timeout = '2s';
ALTER ROLE immotopia_assistant_reader SET search_path = pg_catalog;
GRANT USAGE ON SCHEMA assistant_read TO immotopia_assistant_reader;
GRANT SELECT ON assistant_read.rental_receipts, assistant_read.rental_installments TO immotopia_assistant_reader;
