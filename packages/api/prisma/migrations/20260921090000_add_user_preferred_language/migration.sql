-- Langue choisie par l'utilisateur pour l'interface et les e-mails.
--
-- Volontairement NULLABLE et sans valeur par defaut : une colonne
-- `DEFAULT 'fr'` aurait fait passer les comptes existants pour ayant choisi le
-- francais, et le serveur ne saurait plus distinguer ce choix d'une absence de
-- choix — cas ou c'est la langue du navigateur qui doit s'appliquer.
ALTER TABLE "users" ADD COLUMN "preferred_language" TEXT;
