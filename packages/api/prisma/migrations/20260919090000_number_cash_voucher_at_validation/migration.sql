-- Numerotation des pieces de caisse : a la VALIDATION, plus a la saisie.
--
-- Decision de la cliente du 19 septembre 2026, apres le rapport du lot 2 (§6).
-- Numeroter des la saisie faisait qu'un brouillon abandonne consommait son
-- numero et laissait un trou dans le carnet -- ce qu'un controle comptable
-- releve, et ce qu'un carnet a souches ne fait pas.
--
-- Deux etapes, et rien d'autre. La migration est reversible par une simple
-- reprise des colonnes en NOT NULL, a condition qu'aucun brouillon ne subsiste.

-- ETAPE 1 : les deux colonnes deviennent facultatives.
--
-- Elles ne le sont que pour les brouillons. Une piece validee en porte
-- toujours une valeur, ce que le service garantit et que l'etape 2 preserve.
ALTER TABLE "cash_vouchers" ALTER COLUMN "voucher_number" DROP NOT NULL;
ALTER TABLE "cash_vouchers" ALTER COLUMN "voucher_year" DROP NOT NULL;

-- ETAPE 2 : les brouillons existants rendent leur numero.
--
-- Sans cette etape, les pieces saisies sous l'ancienne regle garderaient un
-- numero attribue trop tot, et la base melerait deux regles. On ne touche
-- QUE les brouillons : `validated_at IS NULL`. Une piece validee garde le
-- sien, definitivement.
--
-- Aucun risque de collision a la prochaine validation : le service prend
-- toujours le plus grand numero de l'annee plus un, jamais un numero libere.
-- Les trous laisses par ces brouillons restent donc, mais ils datent de
-- l'ancienne regle -- la nouvelle n'en creera plus.
UPDATE "cash_vouchers"
SET "voucher_number" = NULL,
    "voucher_year" = NULL
WHERE "validated_at" IS NULL;

-- L'index unique (tenant_id, voucher_year, voucher_number) n'est pas touche :
-- PostgreSQL traite deux NULL comme distincts, si bien que les brouillons
-- coexistent sans se gener, et que les pieces validees restent contraintes.
