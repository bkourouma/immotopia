-- Spec 043 (signature electronique) : durcissement du noyau apres revue.
--  - signature sur place : utilisateur qui a remis le jeton (preuve) ;
--  - SG-R2 : empreinte du DOCX source, comparee a la signature ;
--  - piste de preuve : suppression aussi interdite, sauf cascade.

ALTER TABLE "signature_signers" ADD COLUMN "in_person_issued_by" TEXT;
ALTER TABLE "signature_requests" ADD COLUMN "source_doc_hash" CHAR(64);

-- Une suppression directe d'un evenement est refusee comme sa modification. Sont
-- admises : la cascade (la demande, ou l'agence, n'existe deja plus au moment ou
-- la contrainte supprime ses evenements : les declencheurs referentiels
-- s'executent APRES la suppression du parent) et une purge explicite posee par
-- `set_config('app.signature_purge', 'on', true)`, sur le modele de
-- `app.audit_purge` du journal d'audit.
CREATE OR REPLACE FUNCTION "signature_events_refuse_delete"() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.signature_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "signature_requests" WHERE "id" = OLD."request_id") THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'signature_events est append-only : suppression refusee';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "signature_events_no_delete"
  BEFORE DELETE ON "signature_events"
  FOR EACH ROW EXECUTE FUNCTION "signature_events_refuse_delete"();
