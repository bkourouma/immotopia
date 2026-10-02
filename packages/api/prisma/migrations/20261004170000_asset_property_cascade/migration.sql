-- Un actif REAL_ESTATE ne porte jamais de ligne par asset_id : ses valorisations,
-- prêts et parts restent sur property_id et suivent le bien en cascade.
-- Supprimer le bien supprime donc son actif sans rien perdre (ADR-005).
ALTER TABLE "assets" DROP CONSTRAINT "assets_property_id_fkey",
  ADD CONSTRAINT "assets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
