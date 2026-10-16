# Scénario de recette — pack « Opérateur intégré »

On crée un opérateur avec le pack **Opérateur intégré** (code `INTEGRE` :
modules Agence + Syndic + Promoteur, 3 chantiers, 3 copropriétés, 300 lots,
249 900 FCFA HT/mois) et on déroule, par clics dans l'interface, toutes les
fonctionnalités que ce pack ouvre : environ 550 sous-fonctionnalités du wiki
(`docs/fonctionnalites/sous-fonctionnalites.md`, colonne Pack(s) contenant
« Opérateur intégré »), plus l'administration plateforme de l'opérateur.

Écrit le 2026-09-28 sur `test/recette-operateur-integre` (base `main`
`9ff3fe41`), pour être exécuté par un agent de navigateur.

## Parties et ordre d'exécution

Les parties s'exécutent dans l'ordre : chacune réutilise les objets créés par
les précédentes (tableau « qui crée quoi » plus bas).

| Partie | Fichier                                                            | Étapes | Domaine du wiki                                                          |
| ------ | ------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------ |
| B      | [01-plateforme-operateur.md](01-plateforme-operateur.md)           | 15     | Administration plateforme (création et vie de l'opérateur)               |
| C      | [02-parc-patrimoine.md](02-parc-patrimoine.md)                     | 13     | Parc immobilier (CORE, PATRIMOINE)                                       |
| D      | [03-crm-ventes.md](03-crm-ventes.md)                               | 15     | CRM et Ventes                                                            |
| E      | [04-gestion-locative-portails.md](04-gestion-locative-portails.md) | 21     | Gestion locative, portails Propriétaire et Locataire                     |
| F      | [05-finance.md](05-finance.md)                                     | 16     | Finance (hors CONSTRUCTION)                                              |
| G      | [06-maintenance-communication.md](06-maintenance-communication.md) | 16     | Maintenance, Communication et Documents                                  |
| H      | [07-promoteur-chantiers.md](07-promoteur-chantiers.md)             | 18     | Finance / CONSTRUCTION (chantiers, stock, salaires, tâcherons, retenues) |
| I      | [08-syndic.md](08-syndic.md)                                       | 17     | Syndic copropriété, portail Copropriétaire                               |
| J      | [09-abonnement-quotas.md](09-abonnement-quotas.md)                 | 7      | Abonnement : quotas, politique de dépassement, extensions, lecture seule |

Chaque partie commence par ses prérequis et la « Réalité de l'environnement »
(comportements voulus qui ne sont pas des anomalies), et finit par un tableau
de couverture et la liste de ce qui n'a pas d'écran (« Hors interface »).

## Consignes pour l'agent de navigateur

- Uniquement des clics et des saisies dans l'interface ; aucune requête API,
  aucune commande pour produire un résultat (observer le réseau est permis).
- N'invente jamais un résultat : noter ce que l'écran affiche réellement et un
  verdict par étape (OK / ÉCART / BLOQUÉ / NON FAISABLE).
- Une anomalie reproduite = une fiche dans le bus d'agents (`.agent-bus/`,
  `npm run agent-bus -- new-bug`), avec l'étape (`OI C.4`), la reproduction,
  l'attendu, l'obtenu et la requête en échec.
- Ne jamais déclencher un paiement réel ; ne rien supprimer que le scénario
  n'ait créé.

## Environnement de recette (isolé)

- Web : http://localhost:3311 — API : http://localhost:8811 (instance isolée, base PostgreSQL jetable).
- Code : worktree `D:\APP\Immobillier\.claude\worktrees\operateur-integre` (branche `test/recette-operateur-integre`, = origin/main 9ff3fe41).
- `SUBSCRIPTION_ENFORCEMENT=enforce` : modules non souscrits masqués, quotas BLOQUANTS selon la politique de dépassement.
- Aucun e-mail, SMS ni WhatsApp ne part (fournisseurs non configurés) : les liens d'invitation se lisent dans l'interface
  (écran de résultat de création d'agence « Lien d'invitation » / bouton Copier, résultat d'invitation d'un copropriétaire ;
  voir la « Réalité de l'environnement » de chaque partie pour les autres invitations).
- Paiement plateforme en SIMULATOR ; paiement des loyers : simulateur PaySecureHub disponible hors production.
- Base neuve : seeds rbac, principal (agences démo « Agence Mali », « Bamako Immo »), géographie (Côte d'Ivoire, 164 communes),
  super-admin, catalogue des packs, gabarits de biens et de documents, permissions maintenance et communication.

## Comptes

| Rôle                                    | Nom                 | E-mail                    | Mot de passe                           |
| --------------------------------------- | ------------------- | ------------------------- | -------------------------------------- |
| Super-admin plateforme                  | Super Administrator | admin@immobillier.com     | Admin@123456 (seed)                    |
| Administrateur de l'opérateur           | Awa Konaté OI       | admin.oi@recette.test     | RecetteOI#2026 (saisi à l'acceptation) |
| Gestionnaire (TENANT_MANAGER)           | Moussa Diarra OI    | manager.oi@recette.test   | RecetteOI#2026                         |
| Agent (TENANT_AGENT)                    | Salif Coulibaly OI  | agent.oi@recette.test     | RecetteOI#2026                         |
| Comptable (TENANT_ACCOUNTANT)           | Fanta Touré OI      | compta.oi@recette.test    | RecetteOI#2026                         |
| Propriétaire (portail propriétaire)     | Kouassi Yao OI      | proprio.oi@recette.test   | RecetteOI#2026                         |
| Locataire (portail locataire)           | Aminata Traoré OI   | locataire.oi@recette.test | RecetteOI#2026                         |
| Copropriétaire (portail copropriétaire) | Ibrahim Diallo OI   | copro.oi@recette.test     | RecetteOI#2026                         |

Téléphones fictifs : +225 0700000001 à +225 0700000009 (aucun SMS ne part).

## Opérateur

« Groupe Intégré Recette OI », pack **Opérateur intégré** (INTEGRE : 249 900 FCFA HT/mois, modules Agence + Syndic + Promoteur,
capacités 3 chantiers, 3 copropriétés, 300 lots), mensuel, sans mise en route, ville Abidjan, pays Côte d'Ivoire,
contact contact.oi@recette.test.

## Jeu de données — qui crée quoi (partie → objets)

| Partie                                   | Crée                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 Plateforme et opérateur               | l'opérateur, l'admin, les 3 collaborateurs                                                                                                                                                                                                                                                                                                                 |
| 02 Parc et patrimoine                    | Immeuble « Résidence Les Palmiers OI » (Cocody) + appartements « Palmiers A1 », « Palmiers A2 », « Palmiers A3 » (location) ; Villa « Villa Riviera OI » (propriétaire privé Kouassi Yao OI, ownershipType CLIENT, mandat de gestion, location) ; Terrain « Terrain Bingerville OI » (vente) ; client propriétaire Kouassi Yao OI si la fiche bien l'exige |
| 03 CRM et ventes                         | contacts Kouassi Yao OI (propriétaire), Aminata Traoré OI (locataire), Mariam Koné OI (acquéreuse, mariam.oi@recette.test), Ibrahim Diallo OI (copropriétaire) ; affaire de vente sur Terrain Bingerville OI, offre, compromis                                                                                                                             |
| 04 Gestion locative et portails          | bail « Palmiers A1 » → Aminata Traoré OI ; bail « Villa Riviera OI » (propriétaire Kouassi) ; paiements, pénalités, reversement ; portails propriétaire et locataire                                                                                                                                                                                       |
| 05 Finance                               | caisses, écritures, factures, fournisseur « BTP Sahel OI » et bons de commande                                                                                                                                                                                                                                                                             |
| 06 Maintenance, communication, documents | incidents sur « Palmiers A2 », campagnes, modèles de documents                                                                                                                                                                                                                                                                                             |
| 07 Promoteur                             | chantiers « Chantier Émeraude OI » (principal), « Chantier Saphir OI », « Chantier Rubis OI » ; stock, salaires, tâcheron « Yacouba Sanogo OI », retenues de garantie ; programmes de travaux patrimoniaux liés                                                                                                                                            |
| 08 Syndic                                | copropriétés « Copro Les Cocotiers OI » (principale, lots C01–C04), « Copro Plateau OI », « Copro Marcory OI » ; finances, AG, portail copropriétaire (Ibrahim Diallo OI)                                                                                                                                                                                  |
| 09 Abonnement, quotas et limites         | 4e copropriété « Copro Quota OI » et 4e chantier « Chantier Quota OI » (refus attendu), extensions, lecture seule manuelle puis retour à la normale                                                                                                                                                                                                        |

Préfixe « OI » sur tout ce qui est créé. Rien n'est supprimé sauf ce que le scénario crée pour tester une suppression (marqué « à supprimer »).

## Préparer l'environnement isolé (fait le 2026-09-28)

L'instance de démo figée exige `packages/api/.env.demo`, absent de ce poste.
La recette tourne donc sur une instance isolée, sans lire ni écrire de `.env` :

1. Cluster PostgreSQL jetable (`initdb -A trust`, port 55433), base
   `immotopia_oi`, `prisma migrate deploy` depuis le worktree.
2. Seeds : `db:seed:rbac`, `db:seed` (avec `ALLOW_DESTRUCTIVE_SEED=1`, sur
   cette base seulement), `db:seed:geographic`, `db:seed:super-admin`,
   `db:seed:catalog`, `db:seed:property-templates`,
   `db:seed:document-templates`, `db:seed:maintenance-permissions`,
   `db:seed:communication-permissions`.
3. API lancée depuis `packages/api` du worktree (aucun `.env` à cet endroit)
   avec ses seules variables : `DATABASE_URL`, un `JWT_SECRET` généré,
   `PORT=8811`, `FRONTEND_URL`/`CLIENT_URL=http://localhost:3311`,
   `SUBSCRIPTION_ENFORCEMENT=enforce`, SMTP vers un port fermé,
   `WHATSAPP_PROVIDER=none`, `PLATFORM_PAYSECUREHUB_MODE=SIMULATOR`.
4. Web lancé depuis `apps/web` du worktree avec `PORT=3311`,
   `VITE_API_ORIGIN=http://localhost:8811`,
   `VITE_API_URL=http://localhost:8811/api`.
