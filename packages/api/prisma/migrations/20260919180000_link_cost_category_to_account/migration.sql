-- Un poste de depense peut porter son compte de charge.
--
-- Sans ce lien, toute depense de chantier frappait le MEME compte, quel que
-- soit le poste : le grand livre ne distinguait pas le ciment de la
-- main-d'oeuvre. L'imputation analytique et l'imputation comptable etaient
-- deux mondes separes.
--
-- La limite etait consignee au lot 2, promise au lot 3 par son rapport, et
-- oubliee de la specification du lot 3. Tenue ici.
--
-- NULLABLE A DESSEIN. Un poste sans compte retombe sur le compte de charge par
-- defaut, exactement comme avant : aucune donnee existante ne change de
-- comportement du seul fait de cette colonne.
ALTER TABLE "cost_categories" ADD COLUMN "chart_of_account_id" UUID;

-- ON DELETE SET NULL : desactiver ou supprimer un compte du plan ne doit pas
-- emporter le poste de depense avec lui. Le poste retombe alors sur le compte
-- par defaut, ce qui est degrade mais jamais bloquant.
ALTER TABLE "cost_categories"
  ADD CONSTRAINT "cost_categories_chart_of_account_id_fkey"
  FOREIGN KEY ("chart_of_account_id") REFERENCES "chart_of_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
