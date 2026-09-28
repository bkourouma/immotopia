-- CreateEnum
CREATE TYPE "HoldingEntityForm" AS ENUM ('SCI', 'HOLDING', 'COMPANY', 'INDIVIDUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "FiscalCountry" AS ENUM ('CI', 'ML');

-- CreateEnum
CREATE TYPE "TaxKind" AS ENUM ('PROPERTY_TAX', 'RENTAL_INCOME_TAX');

-- CreateEnum
CREATE TYPE "TaxPropertyKind" AS ENUM ('ANY', 'BUILT', 'UNBUILT');

-- CreateEnum
CREATE TYPE "TaxOccupancy" AS ENUM ('ANY', 'MAIN_RESIDENCE', 'OWNER_OCCUPIED', 'RENTED', 'VACANT');

-- CreateEnum
CREATE TYPE "TaxOwnerKind" AS ENUM ('ANY', 'INDIVIDUAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "TaxParameterUnit" AS ENUM ('PERCENT', 'AMOUNT', 'YEARS', 'BOOLEAN', 'CODE');

-- CreateEnum
CREATE TYPE "TaxParameterStatus" AS ENUM ('A_VALIDER', 'VALIDE');

-- CreateTable
CREATE TABLE "holding_entities" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_form" "HoldingEntityForm" NOT NULL,
    "country" "FiscalCountry" NOT NULL,
    "rccm" TEXT,
    "tax_id" TEXT,
    "contact_id" TEXT,
    "parent_entity_id" UUID,
    "fiscal_owner_kind" "TaxOwnerKind",
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holding_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_holdings" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "share_percent" DECIMAL(7,4) NOT NULL,
    "effective_from" DATE,
    "notes" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_tax_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "country" "FiscalCountry",
    "built_status" "TaxPropertyKind",
    "occupancy" "TaxOccupancy",
    "declared_rental_value" DECIMAL(14,2),
    "exempt_until_year" INTEGER,
    "exemption_reason" TEXT,
    "notes" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_tax_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_parameters" (
    "id" UUID NOT NULL,
    "country" "FiscalCountry" NOT NULL,
    "year" INTEGER NOT NULL,
    "tax_kind" "TaxKind" NOT NULL,
    "param_key" TEXT NOT NULL,
    "property_kind" "TaxPropertyKind" NOT NULL DEFAULT 'ANY',
    "occupancy" "TaxOccupancy" NOT NULL DEFAULT 'ANY',
    "owner_kind" "TaxOwnerKind" NOT NULL DEFAULT 'ANY',
    "bracket_index" INTEGER NOT NULL DEFAULT 0,
    "lower_bound" DECIMAL(16,2),
    "upper_bound" DECIMAL(16,2),
    "value" DECIMAL(16,6),
    "value_text" TEXT,
    "unit" "TaxParameterUnit" NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_url" TEXT,
    "status" "TaxParameterStatus" NOT NULL DEFAULT 'A_VALIDER',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "holding_entities_tenant_id_is_active_idx" ON "holding_entities"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "holding_entities_parent_entity_id_idx" ON "holding_entities"("parent_entity_id");

-- CreateIndex
CREATE INDEX "holding_entities_contact_id_idx" ON "holding_entities"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "holding_entities_tenant_id_name_key" ON "holding_entities"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "property_holdings_tenant_id_idx" ON "property_holdings"("tenant_id");

-- CreateIndex
CREATE INDEX "property_holdings_entity_id_idx" ON "property_holdings"("entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_holdings_property_id_entity_id_key" ON "property_holdings"("property_id", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_tax_profiles_property_id_key" ON "property_tax_profiles"("property_id");

-- CreateIndex
CREATE INDEX "property_tax_profiles_tenant_id_idx" ON "property_tax_profiles"("tenant_id");

-- CreateIndex
CREATE INDEX "tax_parameters_country_year_idx" ON "tax_parameters"("country", "year");

-- CreateIndex
CREATE UNIQUE INDEX "tax_parameters_selector_key" ON "tax_parameters"("country", "year", "tax_kind", "param_key", "property_kind", "occupancy", "owner_kind", "bracket_index");

-- AddForeignKey
ALTER TABLE "holding_entities" ADD CONSTRAINT "holding_entities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holding_entities" ADD CONSTRAINT "holding_entities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holding_entities" ADD CONSTRAINT "holding_entities_parent_entity_id_fkey" FOREIGN KEY ("parent_entity_id") REFERENCES "holding_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_holdings" ADD CONSTRAINT "property_holdings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_holdings" ADD CONSTRAINT "property_holdings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_holdings" ADD CONSTRAINT "property_holdings_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "holding_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_tax_profiles" ADD CONSTRAINT "property_tax_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_tax_profiles" ADD CONSTRAINT "property_tax_profiles_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Référentiel fiscal 2026 (Côte d'Ivoire / Mali), lot P4. Toutes les lignes
-- partent au statut A_VALIDER : à valider par un conseil fiscal avant mise en
-- production (voir docs du lot). ON CONFLICT : cette migration est rejouable
-- sans dupliquer un référentiel déjà inséré.

INSERT INTO "tax_parameters" (id, country, year, tax_kind, param_key, property_kind, occupancy, owner_kind, bracket_index, lower_bound, upper_bound, value, value_text, unit, label, source, source_url, status, notes, created_at, updated_at)
VALUES
(gen_random_uuid(), 'CI', 2026, 'PROPERTY_TAX', 'base', 'BUILT', 'ANY', 'ANY', 0, NULL, NULL, NULL, 'RENTAL_VALUE', 'CODE', 'Base : valeur locative (loyer de l''année N-1)', 'CGI CI 2026, art. 152, 153 et 157', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', 'Valeur locative au moins égale au barème de la Commission (art. 161 bis), non publié : saisir la valeur locative si elle diffère du loyer.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'PROPERTY_TAX', 'base', 'BUILT', 'MAIN_RESIDENCE', 'ANY', 0, NULL, NULL, NULL, 'MARKET_VALUE', 'CODE', 'Base : valeur marchande (habitation principale)', 'CGI CI 2026, art. 157 al. 2-3 et 158 al. 2', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'PROPERTY_TAX', 'base', 'BUILT', 'VACANT', 'ANY', 0, NULL, NULL, NULL, 'MARKET_VALUE', 'CODE', 'Base : valeur marchande (bien vacant)', 'CGI CI 2026, art. 157 al. 2-3 et 158 al. 2', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'PROPERTY_TAX', 'base', 'BUILT', 'OWNER_OCCUPIED', 'INDIVIDUAL', 0, NULL, NULL, NULL, 'MARKET_VALUE', 'CODE', 'Base : valeur marchande (résidence secondaire)', 'CGI CI 2026, art. 157 al. 2-3 et 158 al. 2', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'PROPERTY_TAX', 'base', 'BUILT', 'OWNER_OCCUPIED', 'COMPANY', 0, NULL, NULL, NULL, 'RENTAL_VALUE', 'CODE', 'Base : appréciation directe (valeur marchande × taux de rendement)', 'CGI CI 2026, art. 153 al. 3 et 158 dernier al.', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', 'Taux de rendement non publié : saisir la valeur locative estimée du bien.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'PROPERTY_TAX', 'rate', 'BUILT', 'RENTED', 'INDIVIDUAL', 0, NULL, NULL, 9, NULL, 'PERCENT', 'Impôt sur le patrimoine foncier bâti loué, personne physique', 'CGI CI 2026, art. 158 al. 1 (loi de finances 2026 n° 2025-987 du 19/12/2025, art. 18-2)', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'PROPERTY_TAX', 'rate', 'BUILT', 'RENTED', 'COMPANY', 0, NULL, NULL, 11, NULL, 'PERCENT', 'Impôt sur le patrimoine foncier bâti loué, personne morale', 'CGI CI 2026, art. 158 al. 1 (LF 2026, art. 18-2)', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'PROPERTY_TAX', 'rate', 'BUILT', 'MAIN_RESIDENCE', 'ANY', 0, NULL, NULL, 0.5, NULL, 'PERCENT', 'Taux réduit : habitation principale occupée par le propriétaire', 'CGI CI 2026, art. 158 al. 2 (LF 2025, art. 28-4)', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', 'Une seule habitation principale. Le montant ne peut être inférieur à celui de l''année précédente (plancher non géré).', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'PROPERTY_TAX', 'rate', 'BUILT', 'VACANT', 'ANY', 0, NULL, NULL, 0.5, NULL, 'PERCENT', 'Taux réduit : bien vacant', 'CGI CI 2026, art. 158 al. 2 (LF 2025, art. 28-4)', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', 'Vacance d''au moins 6 mois consécutifs dans l''année.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'PROPERTY_TAX', 'rate', 'BUILT', 'OWNER_OCCUPIED', 'INDIVIDUAL', 0, NULL, NULL, 0.5, NULL, 'PERCENT', 'Taux réduit : résidence secondaire', 'CGI CI 2026, art. 158 al. 2', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', 'Une seule résidence secondaire, avec certificat de la DGI ; sinon le texte ne prévoit pas de taux.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'PROPERTY_TAX', 'rate', 'BUILT', 'OWNER_OCCUPIED', 'COMPANY', 0, NULL, NULL, 13, NULL, 'PERCENT', 'Immeubles des entreprises affectés ou non à leur activité', 'CGI CI 2026, art. 158 dernier al. (LF 2026, art. 34-1 : 15 % → 13 %)', 'https://www.dgbf.ci/wp-content/uploads/2025/12/Annexe-1-Annexe-Fiscale-2026.pdf', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'PROPERTY_TAX', 'base', 'UNBUILT', 'ANY', 'ANY', 0, NULL, NULL, NULL, 'MARKET_VALUE', 'CODE', 'Base : valeur marchande du terrain au 1er janvier', 'CGI CI 2026, art. 161 et 165-1°', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'PROPERTY_TAX', 'rate', 'UNBUILT', 'ANY', 'ANY', 0, NULL, NULL, 1, NULL, 'PERCENT', 'Impôt foncier sur les terrains urbains non bâtis', 'CGI CI 2026, art. 161 et 165-1° (LF 2025 ; LF 2026, art. 34-3)', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', 'Hausse encadrée entre +10 % et +25 % par rapport à l''impôt 2024 (non géré). Emphytéote : 0,2 % (non géré).', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'PROPERTY_TAX', 'acquisition_exemption_years', 'UNBUILT', 'ANY', 'ANY', 0, NULL, NULL, 2, NULL, 'YEARS', 'Exonération des terrains urbains nus acquis depuis 2025 (informatif)', 'CGI CI 2026, art. 162 l) (LF 2025, art. 28-7)', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', 'À compter de l''année d''acquisition : renseigner « exonéré jusqu''à » sur le bien.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'RENTAL_INCOME_TAX', 'base', 'ANY', 'ANY', 'ANY', 0, NULL, NULL, NULL, 'RENTAL_VALUE', 'CODE', 'Base : valeur locative (loyer de l''année N-1)', 'CGI CI 2026, art. 152 et 153 (LF 2026, art. 18-1)', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'RENTAL_INCOME_TAX', 'abatement_rate', 'ANY', 'ANY', 'ANY', 0, NULL, NULL, 0, NULL, 'PERCENT', 'Aucun abattement pour charges', 'CGI CI 2026, art. 152 à 156', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'RENTAL_INCOME_TAX', 'rate', 'ANY', 'ANY', 'INDIVIDUAL', 0, NULL, NULL, 3, NULL, 'PERCENT', 'Impôt sur le revenu foncier, personne physique', 'CGI CI 2026, art. 156', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', 'S''ajoute à l''impôt foncier (9 %) : 12 % de la valeur locative au total.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'RENTAL_INCOME_TAX', 'rate', 'ANY', 'ANY', 'COMPANY', 0, NULL, NULL, 4, NULL, 'PERCENT', 'Impôt sur le revenu foncier, personne morale', 'CGI CI 2026, art. 156', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', 'SCI de copropriété : taux des personnes physiques (régler le statut fiscal de l''entité). Sociétés dont le seul objet est la gestion de leur patrimoine foncier : exonérées (art. 151-22°), non géré automatiquement. Loyers d''une société également soumis à l''IS (25 %), hors périmètre.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'RENTAL_INCOME_TAX', 'applicable', 'ANY', 'MAIN_RESIDENCE', 'ANY', 0, NULL, NULL, 0, NULL, 'BOOLEAN', 'Non dû : l''occupation personnelle ne crée pas de valeur locative', 'CGI CI 2026, art. 153 (LF 2026, art. 18-1)', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'RENTAL_INCOME_TAX', 'applicable', 'ANY', 'OWNER_OCCUPIED', 'ANY', 0, NULL, NULL, 0, NULL, 'BOOLEAN', 'Non dû : bien occupé par son propriétaire', 'CGI CI 2026, art. 153 (LF 2026, art. 18-1)', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'CI', 2026, 'RENTAL_INCOME_TAX', 'applicable', 'ANY', 'VACANT', 'ANY', 0, NULL, NULL, 0, NULL, 'BOOLEAN', 'Non dû : bien non productif de revenus', 'CGI CI 2026, art. 152', 'https://dgi.cgici.com/indexs.htm', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'ML', 2026, 'PROPERTY_TAX', 'base', 'ANY', 'ANY', 'ANY', 0, NULL, NULL, NULL, 'RENTAL_VALUE', 'CODE', 'Base : valeur locative au 1er janvier de l''année N-1', 'CGI Mali, art. 185-H et 185-I', 'https://www.dgi.gouv.ml/CGI/', 'A_VALIDER', 'Bail ou location verbale, sinon comparaison ou valeur vénale × taux d''intérêt : saisir la valeur locative d''un bien non loué.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'ML', 2026, 'PROPERTY_TAX', 'abatement_rate', 'ANY', 'ANY', 'ANY', 0, NULL, NULL, 0, NULL, 'PERCENT', 'Aucun abattement', 'CGI Mali, art. 185-E à 185-M', 'https://www.dgi.gouv.ml/CGI/', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'ML', 2026, 'PROPERTY_TAX', 'rate', 'ANY', 'ANY', 'ANY', 0, NULL, NULL, 3, NULL, 'PERCENT', 'Taxe foncière, taux unique', 'CGI Mali, art. 185-L ; DGI Mali « Les impôts à payer »', 'https://www.dgi.gouv.ml/les-impots-a-payer/', 'A_VALIDER', 'Réforme de la taxation des propriétés bâties et non bâties annoncée, non adoptée au 28/09/2026.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'ML', 2026, 'PROPERTY_TAX', 'exempt', 'ANY', 'MAIN_RESIDENCE', 'ANY', 0, NULL, NULL, 1, NULL, 'BOOLEAN', 'Exonération : immeuble occupé par le propriétaire ou sa famille', 'CGI Mali, art. 185-G 10°', 'https://www.dgi.gouv.ml/CGI/', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'ML', 2026, 'PROPERTY_TAX', 'exempt', 'ANY', 'OWNER_OCCUPIED', 'ANY', 0, NULL, NULL, 1, NULL, 'BOOLEAN', 'Exonération : immeuble occupé par le propriétaire ou sa famille', 'CGI Mali, art. 185-G 10°', 'https://www.dgi.gouv.ml/CGI/', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'ML', 2026, 'PROPERTY_TAX', 'taxable_after_holding_years', 'UNBUILT', 'ANY', 'ANY', 0, NULL, NULL, 3, NULL, 'YEARS', 'Terrains nus imposables après 3 ans de détention (informatif)', 'CGI Mali, art. 185-F', 'https://www.dgi.gouv.ml/CGI/', 'A_VALIDER', 'Terrains nus improductifs en commune rurale et terrains agricoles exonérés (art. 185-G 8° et 13°).', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'ML', 2026, 'RENTAL_INCOME_TAX', 'base', 'ANY', 'ANY', 'ANY', 0, NULL, NULL, NULL, 'GROSS_RENT', 'CODE', 'Base : loyers bruts encaissés', 'CGI Mali, art. 17 et 18', 'https://www.dgi.gouv.ml/CGI/', 'A_VALIDER', 'Plus les charges du propriétaire supportées par le locataire, moins l''inverse.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'ML', 2026, 'RENTAL_INCOME_TAX', 'abatement_rate', 'ANY', 'ANY', 'ANY', 0, NULL, NULL, 0, NULL, 'PERCENT', 'Aucune réfaction', 'CGI Mali, art. 19', 'https://www.dgi.gouv.ml/CGI/', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'ML', 2026, 'RENTAL_INCOME_TAX', 'base_rounding_down', 'ANY', 'ANY', 'ANY', 0, NULL, NULL, 1000, NULL, 'AMOUNT', 'Base arrondie au millier de francs inférieur', 'CGI Mali, art. 22', 'https://www.dgi.gouv.ml/CGI/', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'ML', 2026, 'RENTAL_INCOME_TAX', 'rate', 'ANY', 'ANY', 'ANY', 0, NULL, NULL, 12, NULL, 'PERCENT', 'Impôt sur les revenus fonciers, immeubles en dur et semi-dur', 'CGI Mali, art. 22 (loi de finances 2012) ; confirmé par le projet de loi de finances 2026', 'https://www.dgi.gouv.ml/impots-sur-les-revenus-fonciers/', 'A_VALIDER', 'Immeubles en banco : 8 % (non géré).', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'ML', 2026, 'RENTAL_INCOME_TAX', 'exempt', 'ANY', 'MAIN_RESIDENCE', 'ANY', 0, NULL, NULL, 1, NULL, 'BOOLEAN', 'Exonération : bien occupé par le propriétaire ou sa famille', 'CGI Mali, art. 16', 'https://www.dgi.gouv.ml/CGI/', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'ML', 2026, 'RENTAL_INCOME_TAX', 'exempt', 'ANY', 'OWNER_OCCUPIED', 'ANY', 0, NULL, NULL, 1, NULL, 'BOOLEAN', 'Exonération : bien occupé par le propriétaire ou sa famille', 'CGI Mali, art. 16', 'https://www.dgi.gouv.ml/CGI/', 'A_VALIDER', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'ML', 2026, 'RENTAL_INCOME_TAX', 'applicable', 'ANY', 'ANY', 'COMPANY', 0, NULL, NULL, 0, NULL, 'BOOLEAN', 'Non dû : immeubles inscrits au bilan d''une société soumise à l''IS', 'CGI Mali, art. 14 et 16-3°', 'https://www.dgi.gouv.ml/CGI/', 'A_VALIDER', 'Loyers imposés à l''IS (30 %, minimum égal à l''IRF théorique, art. 86-A), hors périmètre.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (country, year, tax_kind, param_key, property_kind, occupancy, owner_kind, bracket_index) DO NOTHING;
