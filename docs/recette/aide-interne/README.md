# Recette : aide interne contextuelle

**Périmètre.** La recette porte sur ces fonctions (PR `orch/2026-11-14-aide-interne`) :

- le bouton « ? » d'en-tête de page, de tableau, de carte, de section et d'onglet ;
- le panneau d'aide ;
- les infobulles de colonnes ;
- les visites guidées ;
- le centre d'aide `/aide` et la touche F1 ;
- « Demander à ImmoCopilot » ;
- l'avis « utile ? » ;
- les écrans « Avis sur l'aide » (agence et plateforme) ;
- l'anglais, l'arabe (RTL) et le mobile.

Le contenu des fiches n'est pas relu ici en entier. La recette se limite à vérifier que chaque fiche ouverte correspond bien à l'écran ou au bloc.

Les cas se nomment `AI-<numéro>`.

## Environnement

| Élément  | Valeur                                                                                       |
| -------- | -------------------------------------------------------------------------------------------- |
| Instance | démo figée `.claude/worktrees/demo` (`npm run demo:status`), API `8800`, web `3300`          |
| Base     | base de démo dédiée (`immotopia_demo`), jamais le développement, le staging ni la production |
| Comptes  | agences de test par pack (`prisma/seeds/pack-test-tenants.ts`, mot de passe public de test)  |

| Rôle symbolique | Compte                                                             | Agence, rôle                                        |
| --------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| ADMIN_A         | `agence-3ans@packs.immotopia.test`                                 | A = « Test — Pack Agence · 3 ans », `TENANT_ADMIN`  |
| ADMIN_B         | `agence@packs.immotopia.test`                                      | B = « Test — Pack Agence · 6 mois », `TENANT_ADMIN` |
| SANS_AUDIT_A    | un membre de A sans `TENANT_AUDIT_VIEW` (s'il existe dans la base) | A                                                   |
| LOCATAIRE       | un compte de portail locataire de A (s'il existe dans la base)     | portail locataire                                   |
| SUPER_ADMIN     | super-admin de la plateforme de démo (s'il est connu)              | plateforme                                          |

Les onglets du navigateur partagent les cookies de `localhost` : une seule session à la fois. On se déconnecte avant de changer de compte.

La visite guidée est mémorisée dans le `localStorage` du navigateur. Pour rejouer AI-06, on supprime les clés de visite.

## Cas

### A. Panneau et boutons « ? » (ADMIN_A, français)

**AI-01 — Fiche de page.**

- Étapes : ouvrir Gestion locative › Baux, puis cliquer le « ? » de l'en-tête de page.
- Attendu :
  - un panneau « Aide » s'ouvre à droite, sur l'onglet « Cette page » ;
  - il présente le titre de l'écran, « À quoi ça sert », « Comment lire », « Procédure », « Conséquences », « Questions fréquentes », « Droits et pack nécessaires » et « Voir aussi » (selon la fiche) ;
  - Échap le ferme ; la croix aussi.

**AI-02 — Fiche de bloc et colonnes.**

- Étapes : sur Baux, cliquer le « ? » à côté du titre du tableau, puis survoler les en-têtes de colonnes.
- Attendu :
  - le panneau affiche l'onglet « Ce bloc » avec la fiche du tableau, et l'onglet « Cette page » reste accessible ;
  - les colonnes documentées montrent une infobulle d'explication.

**AI-03 — Panneau au-dessus d'une modale.**

- Étapes : ouvrir une modale ou un tiroir qui porte un « ? » (par exemple la création d'un bail, ou un formulaire de paiement), puis cliquer ce « ? ».
- Attendu :
  - le panneau s'affiche au-dessus de la modale, lisible et cliquable ;
  - fermer le panneau laisse la modale ouverte, sans perte de saisie.

**AI-04 — Onglets et clavier.**

- Étapes : ouvrir un écran à onglets (par exemple la fiche d'un bien en Patrimoine, ou un écran Finance à onglets). Au clavier, aller sur un libellé d'onglet et appuyer sur Entrée, puis tabuler jusqu'au « ? » de l'onglet et appuyer sur Entrée.
- Attendu :
  - aucun « ? » dans les libellés d'onglets : il est en tête du contenu de l'onglet ;
  - Entrée sur un libellé change d'onglet ;
  - Entrée sur le « ? » ouvre l'aide sans changer d'onglet.

**AI-05 — Rangées d'indicateurs.**

- Étapes : ouvrir le tableau de bord des ventes ou du CRM.
- Attendu : un seul « ? » par rangée de cartes d'indicateurs, pas un par carte. Le « ? » ouvre la fiche de la rangée.

**AI-06 — Visite guidée proposée une fois.**

- Étapes :
  1. Effacer les clés de visite du `localStorage`.
  2. Ouvrir un écran à visite automatique (`autoStart: true` dans les fiches) : création d'un bail (`/rental/leases/new`) ou Paiements (`/rental/payments`), par un chargement direct de l'URL puis par un lien du menu, et attendre quelques secondes.
  3. Suivre la visite jusqu'au bout.
  4. Recharger la page.
  5. Rouvrir la visite depuis le panneau (bouton « Visite guidée »).
- Attendu :
  - la visite est proposée seule, et chaque étape met en évidence un élément visible de l'écran ;
  - après rechargement, elle n'est plus proposée ;
  - le bouton du panneau la relance.
- Même contrôle, sans tout rejouer, sur un écran clé d'un autre module : caisse Finance, accueil Patrimoine ou création d'un bien.
- La visite automatique exige une largeur d'au moins 768 px.

**AI-07 — F1 et centre d'aide.**

- Étapes :
  1. Sur un écran, appuyer sur F1, puis de nouveau sur F1.
  2. Ouvrir `/aide`.
  3. Chercher « bail », ouvrir un résultat.
  4. Parcourir un autre module.
- Attendu :
  - F1 ouvre la fiche de page, puis la referme ;
  - `/aide` liste les modules et trouve des fiches pertinentes ;
  - un résultat ouvert affiche sa fiche complète.

**AI-08 — Demander à ImmoCopilot.**

- Étapes : dans une fiche, cliquer « Demander à ImmoCopilot ».
- Attendu :
  - ImmoCopilot s'ouvre avec une question pré-remplie sur la fiche (« Pouvez-vous m'expliquer « … » ? ») ;
  - la requête envoyée porte la fiche courante (`helpId`) ;
  - si l'assistant n'est pas disponible dans la démo, le bouton est absent, ou un message clair s'affiche.

**AI-09 — Avis « utile ? ».**

- Étapes : en bas d'une fiche, cliquer « Non », écrire « [REC-AIDE] question de test », puis « Envoyer ».
- Attendu :
  - « Merci pour votre retour. » s'affiche ;
  - aucune erreur dans la console ni dans le réseau (réponse 2xx).
- Refaire « Oui » sur une autre fiche.

**AI-10 — Échantillon par module.**

- Étapes : ouvrir une page de chaque module (Locatif, Syndic, Finance, Patrimoine, Commercial, Communication, Paramètres ou Administration), cliquer le « ? » de page et un « ? » de bloc.
- Attendu :
  - chaque fiche correspond à l'écran ou au bloc ;
  - aucun « ? » orphelin (qui ouvre une fiche vide), aucune erreur console ;
  - le titre de la fiche de page correspond au titre de l'écran.

### B. Écrans « Avis sur l'aide » et droits

**AI-11 — Écran agence.**

- Étapes : en ADMIN_A, ouvrir le menu Administration › « Avis sur l'aide ».
- Attendu :
  - l'entrée de menu existe ;
  - l'écran liste les avis de AI-09 : fiches, compte utile ou non, question « [REC-AIDE]… » ;
  - aucun nom ni e-mail d'utilisateur n'est affiché.

**AI-12 — Isolation entre agences.**

- Étapes : se connecter en ADMIN_B et ouvrir « Avis sur l'aide ». Puis ouvrir l'URL de l'écran d'avis de l'agence A avec l'identifiant de A.
- Attendu :
  - les avis de A sont invisibles depuis B ;
  - l'URL de A est refusée, ou renvoie vers une page d'erreur ou d'accès.

**AI-13 — Sans droit d'audit.**

- Étapes : en SANS_AUDIT_A, chercher l'entrée de menu, puis ouvrir l'URL directe.
- Attendu : l'entrée est absente et l'URL est refusée. Si le compte n'existe pas, le cas est **bloqué**.

**AI-14 — Écran plateforme.**

- Étapes : en SUPER_ADMIN, ouvrir `/admin/help-feedback`.
- Attendu : l'écran montre les avis de toutes les agences. En ADMIN_A, l'URL est refusée.

### C. Langues, mise en page, portails

**AI-15 — Anglais.**

- Étapes : passer l'interface en anglais, rouvrir la fiche de Baux et une fiche de bloc.
- Attendu :
  - fiches en anglais, sans phrase française résiduelle ;
  - les libellés cités (colonnes, boutons) sont ceux affichés à l'écran ;
  - le panneau lui-même (« Help », « This page »…) est traduit.

**AI-16 — Arabe et sens de lecture.**

- Étapes : passer en arabe, ouvrir le « ? » de page, un « ? » de bloc et une visite guidée.
- Attendu :
  - le panneau s'ouvre à gauche, texte aligné à droite ;
  - les « ? » sont placés en miroir et ne chevauchent rien ;
  - la visite reste lisible et ses bulles pointent les bons éléments.

**AI-17 — Mobile 375 px.**

- Étapes : en largeur 375 px, ouvrir une fiche de page et une fiche de bloc.
- Attendu :
  - le panneau est lisible sans défilement horizontal et se ferme facilement ;
  - les « ? » restent cliquables.

**AI-18 — Portail locataire.**

- Étapes : en LOCATAIRE, ouvrir l'accueil du portail.
- Attendu :
  - des « ? » sont présents et leurs fiches sont rédigées pour un locataire, sans jargon d'agence ;
  - la visite du portail est proposée une fois.
- Si aucun compte de portail n'est utilisable, le cas est **bloqué**.

## Données créées

Avis d'aide marqués `[REC-AIDE]` dans la base de démo. Il n'y a rien à nettoyer ailleurs.
