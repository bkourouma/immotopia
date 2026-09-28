# ADR-003 : laisser hors dépôt la migration 20260927080000 des fonds de copropriété

## Statut

Accepté

## Date

2026-09-28

## Contexte

Le 25/09/2026 (03:49 UTC), la production a reçu une migration qui n'a jamais
été commitée : `20260927080000_mouvements_fonds_copropriete`. Elle a créé les
enums `FundMovementDirection` et `FundMovementType`, une table
`syndicate_fund_movements` d'une structure abandonnée depuis, et les colonnes
`fund_id` de `charge_calls` et `budget_line_items` (index et clés étrangères
aux noms générés par Prisma). Son SQL exact est reproduit en annexe.

La branche principale a absorbé cet état sans ce dossier :

- `20260929145000_syndic_fonds_ancienne_table` renomme l'ancienne table en
  `syndicate_fund_movements_legacy` si elle existe avec l'ancienne structure ;
- `20260929150000_syndic_factures_prestataires` crée la nouvelle
  `syndicate_fund_movements` ;
- `20260930090000_syndic_fonds_paiements` crée `fund_id`, ses index et ses
  clés étrangères seulement s'ils manquent (mêmes noms) ;
- `20260930091000_syndic_fonds_reprise` recopie l'ancien journal.

État relevé en production le 28/09/2026 (lecture seule) :

| Élément                                           | Valeur                                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Ligne `_prisma_migrations` de `20260927080000_…`  | checksum `e21fbaaf036e3bfeeabc4c23534cfefce4816b1ecba65ecab1d8c67ca1e535f8`, terminée, 1 étape |
| `syndicate_fund_movements_legacy`                 | 72 lignes, archive (déjà recopiées par la reprise)                                             |
| Enums `FundMovementDirection`, `FundMovementType` | utilisés seulement par `_legacy`                                                               |
| `prisma migrate status` après le déploiement      | « Database schema is up to date! » (journal du déploiement du 28/09)                           |

Le checksum de production est le SHA-256 du fichier en fins de ligne LF (la
variante CRLF donne `62b5b398…`). Prisma 5.22 tolère la différence : un
dossier CRLF face à ce checksum n'est pas signalé comme modifié.

Comportement mesuré de Prisma 5.22 (reproduction sur base jetable) :

- `migrate deploy` ignore la ligne orpheline et applique normalement les
  migrations en attente ;
- `migrate status` n'affiche rien tant qu'aucune migration n'est en attente ;
  **dès qu'une migration est en attente** (donc avant chaque déploiement), il
  répond « Your local migration history and the migrations table from your
  database are different », cite `20260927080000_…` parmi les migrations
  « not found locally » et sort en code 1, au lieu du simple « Following
  migration have not yet been applied ».

## Décision

- Le dossier `20260927080000_mouvements_fonds_copropriete` **n'est pas
  ajouté** à `packages/api/prisma/migrations/`. Son SQL est conservé dans
  l'annexe de cet ADR, avec le checksum de production.
- `schema.prisma` ne décrit ni `syndicate_fund_movements_legacy` ni les deux
  anciens enums : ils restent, **en production seulement**, une archive hors
  schéma. `prisma migrate diff --from-url <prod> --to-schema-datamodel` y
  propose exactement : suppression des trois clés étrangères `_legacy`, de
  la table `_legacy` et des deux enums — rien d'autre. Ne jamais appliquer ce
  script tel quel.
- Aucune écriture en production n'est faite pour cette décision. La
  divergence affichée par `migrate status` avant un déploiement est attendue
  tant que la ligne orpheline existe ; elle ne bloque pas `migrate deploy`.
- Action facultative, à décider par le responsable de la production : retirer
  la ligne orpheline pour que `migrate status` redevienne net. Vérifiée sur
  une reproduction : statut net, déploiement suivant normal, archive `_legacy`
  intacte. À faire hors déploiement, en trois temps.

  1. Sauvegarde préalable, depuis le conteneur PostgreSQL, puis contrôle du
     fichier (taille non nulle, sommaire lisible). Un dump complet de la base
     est recommandé en plus :

     ```bash
     pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
       -t public._prisma_migrations -f prisma_migrations_20260928.dump
     test -s prisma_migrations_20260928.dump
     pg_restore --list prisma_migrations_20260928.dump
     # recommandé : dump complet
     pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f base_complete_20260928.dump
     test -s base_complete_20260928.dump
     pg_restore --list base_complete_20260928.dump > /dev/null
     ```

  2. Retrait, dans `psql`. Le script échoue de lui-même et annule tout si la
     ligne attendue n'est pas exactement unique :

     ```sql
     \set ON_ERROR_STOP on
     BEGIN;
     -- Verrou consultatif de Prisma Migrate : aucun migrate deploy concurrent.
     SELECT pg_advisory_xact_lock(72707369);
     CREATE SCHEMA IF NOT EXISTS maintenance;
     CREATE TABLE maintenance.prisma_migrations_orphelines_20260928 AS
       SELECT * FROM public._prisma_migrations
        WHERE migration_name = '20260927080000_mouvements_fonds_copropriete'
          AND checksum = 'e21fbaaf036e3bfeeabc4c23534cfefce4816b1ecba65ecab1d8c67ca1e535f8'
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL;
     DO $$
     DECLARE
       n INTEGER;
     BEGIN
       DELETE FROM public._prisma_migrations
        WHERE migration_name = '20260927080000_mouvements_fonds_copropriete'
          AND checksum = 'e21fbaaf036e3bfeeabc4c23534cfefce4816b1ecba65ecab1d8c67ca1e535f8'
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL;
       GET DIAGNOSTICS n = ROW_COUNT;
       IF n <> 1 THEN
         RAISE EXCEPTION 'Ligne orpheline : % ligne(s) supprimee(s) au lieu de 1, annulation', n;
       END IF;
     END
     $$;
     COMMIT;
     ```

  3. Retour arrière, si besoin :

     ```sql
     INSERT INTO public._prisma_migrations
       SELECT * FROM maintenance.prisma_migrations_orphelines_20260928;
     ```

  La copie vit dans le schéma `maintenance`, que Prisma ne lit pas (la
  datasource est en `schema=public`) : l'écart mesuré par la comparaison
  `migrate diff --from-url` reste celui décrit plus haut, rien d'autre. Supprimer la copie
  (`DROP TABLE maintenance.prisma_migrations_orphelines_20260928`, puis le
  schéma s'il est vide) après deux déploiements réussis sans incident.

## Conséquences positives

- Aucune base construite depuis `main` (développement, démonstration, base
  d'isolation, CI) ne change : `migrate diff --from-migrations` reste à « No
  difference detected ». Cette étape de la CI est en `continue-on-error: true`
  (`.github/workflows/ci.yml`) : elle n'est pas bloquante, mais elle reste un
  signal propre.
- Aucune donnée de production n'est touchée ; l'archive `_legacy` est
  conservée.
- Le SQL réellement exécuté en production reste traçable dans le dépôt.

## Conséquences négatives

- Tant que la ligne orpheline existe, `migrate status` lancé **avant** un
  déploiement sort en code 1 avec un message de divergence ; il faut lire la
  liste « not found locally » et vérifier qu'elle ne contient que
  `20260927080000_mouvements_fonds_copropriete`.
- La production garde une table et deux enums hors schéma ; toute
  comparaison `--from-url` de la production les fera apparaître.
- La tolérance repose sur un comportement **mesuré** de Prisma 5.22, alors
  que la CLI est déclarée en `^5.7.1` (`packages/api/package.json`).
  `infra/scripts/deploy.sh` tourne sous `set -Eeuo pipefail` et lance
  `migrate status` juste après `migrate deploy`, avant `compose up -d api
web` : si une version future signalait la ligne orpheline même sans
  migration en attente, le script s'arrêterait après les migrations et avant
  le redémarrage de l'API. C'est un argument pour réaliser le retrait
  facultatif ci-dessus.
- Les clés étrangères de `_legacy` gardent `ON DELETE CASCADE` vers
  `syndicate_funds` et `syndicates` : supprimer un fonds ou une copropriété
  efface aussi ses lignes d'archive. Figer l'archive (retirer ou modifier ces
  clés) serait une décision distincte, à soumettre à l'utilisateur ; rien
  n'est changé ici.

## Alternatives écartées

- **Ajouter le dossier octet pour octet** (checksum identique). En
  production, l'avertissement disparaît. Mais toute base existante construite
  depuis `main` le voit comme une migration en attente et l'exécute :
  `migrate deploy` échoue (`P3018`, « column "fund_id" of relation
  "charge_calls" already exists ») puis bloque tout déploiement suivant
  (`P3009`) tant qu'on n'a pas lancé `migrate resolve --applied` à la main
  sur chacune (base de démonstration, bases locales, base d'isolation). Sur
  une base neuve, il laisse `_legacy` et les deux enums, absents du schéma :
  il faudrait en plus une migration de nettoyage conditionnelle. La
  production garderait de toute façon son archive hors schéma.
- **Modéliser `_legacy` et les anciens enums dans `schema.prisma`** — ferait
  entrer dans le client Prisma une table morte sans `tenant_id` direct, à
  couvrir par l'inventaire tenant et l'extension de garde, pour une archive
  que le code ne lit pas.
- **Supprimer `_legacy` en production** — perte de l'archive d'origine alors
  que rien ne l'exige.

## Liens

- `packages/api/prisma/migrations/20260929145000_syndic_fonds_ancienne_table/`
- `packages/api/prisma/migrations/20260930090000_syndic_fonds_paiements/`
- `packages/api/prisma/migrations/20260930091000_syndic_fonds_reprise/`
- `.github/workflows/ci.yml` (étape « Check migrations match the schema »)
- `infra/scripts/deploy.sh` (étape « Etat des migrations »)

## Annexe — SQL exécuté en production

Copie conforme de
`packages/api/prisma/migrations/20260927080000_mouvements_fonds_copropriete/migration.sql`
retrouvée dans l'ancien dossier de déploiement du serveur (3 590 octets, LF,
SHA-256 `e21fbaaf036e3bfeeabc4c23534cfefce4816b1ecba65ecab1d8c67ca1e535f8`,
égal au checksum de production). Ne pas la rejouer.

```sql
-- Suivi des fonds de copropriété : chaque mouvement (reprise, part d'un
-- paiement, dépense, ajustement) est journalisé, et le solde du fonds en est
-- la somme.

-- CreateEnum
CREATE TYPE "FundMovementDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "FundMovementType" AS ENUM ('OPENING', 'PAYMENT', 'EXPENSE', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "charge_calls" ADD COLUMN     "fund_id" UUID;

-- AlterTable
ALTER TABLE "budget_line_items" ADD COLUMN     "fund_id" UUID;

-- CreateTable
CREATE TABLE "syndicate_fund_movements" (
    "id" UUID NOT NULL,
    "fund_id" UUID NOT NULL,
    "syndicate_id" UUID NOT NULL,
    "direction" "FundMovementDirection" NOT NULL,
    "type" "FundMovementType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "charge_payment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "syndicate_fund_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "syndicate_fund_movements_fund_id_occurred_at_idx" ON "syndicate_fund_movements"("fund_id", "occurred_at");

-- CreateIndex
CREATE INDEX "syndicate_fund_movements_syndicate_id_idx" ON "syndicate_fund_movements"("syndicate_id");

-- CreateIndex
CREATE INDEX "syndicate_fund_movements_charge_payment_id_idx" ON "syndicate_fund_movements"("charge_payment_id");

-- CreateIndex
CREATE INDEX "charge_calls_fund_id_idx" ON "charge_calls"("fund_id");

-- CreateIndex
CREATE INDEX "budget_line_items_fund_id_idx" ON "budget_line_items"("fund_id");

-- AddForeignKey
ALTER TABLE "charge_calls" ADD CONSTRAINT "charge_calls_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "syndicate_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_fund_movements" ADD CONSTRAINT "syndicate_fund_movements_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "syndicate_funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_fund_movements" ADD CONSTRAINT "syndicate_fund_movements_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_fund_movements" ADD CONSTRAINT "syndicate_fund_movements_charge_payment_id_fkey" FOREIGN KEY ("charge_payment_id") REFERENCES "charge_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "syndicate_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Reprise de l'existant : le solde actuel de chaque fonds devient son
-- mouvement d'ouverture, pour que solde et historique concordent dès le départ.
INSERT INTO "syndicate_fund_movements" ("id", "fund_id", "syndicate_id", "direction", "type", "amount", "occurred_at", "label")
SELECT gen_random_uuid(),
       f."id",
       f."syndicate_id",
       (CASE WHEN f."balance" >= 0 THEN 'CREDIT' ELSE 'DEBIT' END)::"FundMovementDirection",
       'OPENING'::"FundMovementType",
       abs(f."balance"),
       f."created_at",
       'Solde repris'
FROM "syndicate_funds" f
WHERE f."balance" <> 0;

-- Un poste de budget qui porte le nom d'un fonds de la copropriété
-- (« Fonds de travaux ») alimente désormais ce fonds.
UPDATE "budget_line_items" l
SET "fund_id" = f."id"
FROM "syndicate_budgets" b, "syndicate_funds" f
WHERE l."budget_id" = b."id"
  AND f."syndicate_id" = b."syndicate_id"
  AND lower(trim(l."category")) = lower(trim(f."name"))
  AND l."fund_id" IS NULL;
```
