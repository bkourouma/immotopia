# Partie B — Plateforme et opérateur

Création de l'opérateur « Groupe Intégré Recette OI » (pack **Opérateur
intégré**) par le super-admin, invitation et prise en main par
l'administrateur de l'agence, puis mise en place des trois collaborateurs et
vérification des droits d'un Agent. Couvre les sous-fonctionnalités du domaine
« Administration plateforme » (`docs/fonctionnalites/sous-fonctionnalites.md`)
qu'un super-admin ou un administrateur d'agence utilise pour créer et faire
vivre cet opérateur — y compris celles dont la colonne Pack(s) ne cite pas
« Opérateur intégré » (elles sont génériques à toute agence).

Respecte le cadre commun du scénario (comptes, jeu de données, environnement
isolé 3311/8811, `SUBSCRIPTION_ENFORCEMENT=enforce`).

---

## Prérequis

- Base neuve du scénario (seeds rbac, principal, géographie, catalogue,
  gabarits) ; aucune agence « Groupe Intégré Recette OI » déjà créée.
- Aucun e-mail ne part réellement : le lien d'invitation se lit sur l'écran de
  résultat du tiroir de création, puis sur l'écran de connexion du
  destinataire.

## Réalité de l'environnement

- **Essai automatique non désactivable.** Dans le tiroir « Nouvelle agence »,
  l'interrupteur « Essai gratuit d'un mois inclus » est coché et grisé
  (`apps/web/src/components/admin/CreateTenantDrawer.tsx`, `trialEnabled`
  posé à `true` sans `onChange`) : impossible de le décocher, c'est voulu.
- **Opérateur intégré exclusif.** Cocher la carte « Opérateur intégré » grise
  et décoche les cartes Agence/Syndic/Promoteur (`exclusiveGroup: 'INTEGRE'`
  dans `packages/api/src/lib/subscription/catalog.ts`) : aucune combinaison
  possible avec les autres packs.
- **Pas de remise de combinaison ici.** La « Remise de combinaison » (10 % par
  défaut, `DEFAULT_COMBO_DISCOUNT_PERCENT`) ne s'applique qu'en cumulant
  plusieurs packs de base distincts ; un opérateur qui ne souscrit que
  l'Intégré seul ne la voit jamais appliquée, même si le champ existe sur la
  fiche abonnement.
- **Politique de dépassement — ne pas y toucher ici.** Le provisioning pose
  `Facturer le dépassement` par défaut
  (`subscription-provisioning-service.ts`, secours `BILL_OVERAGE` dans
  `entitlements.ts`). Cette partie se contente de la lire ; son changement et
  ses effets sont testés dans la partie 09 (Abonnement, quotas et limites).
- **Aucune facture pendant l'essai.** La carte « Prochaine facture (aperçu) »
  et l'onglet Factures de l'agence restent à vide ou à zéro tant que l'essai
  n'est pas terminé — ce n'est pas un défaut.
- **Modules déjà tous ouverts.** L'Opérateur intégré porte nativement
  `MODULE_AGENCY` + `MODULE_SYNDIC` + `MODULE_PROMOTER`
  (`catalog.ts`) : « Forcer un module » (dérogation) et « Lever une
  dérogation » n'ont aucun usage pour cet opérateur — rien à dériger.
- **Identité des documents (signature/cachet) séparée du logo.** Sur
  `Agence > Paramètres de l'agence`, la carte « Signature et cachet pour les
  documents » (`apps/web/src/pages/tenant/TenantSettings.tsx`) appelle une
  route dédiée (`/tenants/:tenantId/document-identity`), différente de celle
  du logo ; l'écriture exige `TENANT_SETTINGS_EDIT` (Admin), la lecture
  `TENANT_SETTINGS_VIEW` (Admin, Gestionnaire, Agent).
- **Droits de l'Agent.** Le rôle `TENANT_AGENT` (seed
  `packages/api/src/prisma/seeds/rbac-seed.ts`, en clair
  `packages/api/prisma/seeds/rbac-seed.ts:268-321`) ne reçoit que
  `TENANT_SETTINGS_VIEW`, `USERS_VIEW`, les permissions Biens
  (voir/créer/modifier/visites) et CRM (contacts + affaires en
  voir/créer/modifier, `CRM_MATCHING_VIEW` mais pas `CRM_MATCHING_RUN`),
  jamais de permission Finance (`finance-permissions-seed.ts` : « TENANT_AGENT
  ne reçoit aucun droit financier »), jamais `USERS_CREATE`/`USERS_EDIT`, ni
  `TENANT_SETTINGS_EDIT`, ni `PROPERTIES_PUBLISH` (réservée par défaut à
  TENANT_ADMIN). C'est ce que l'étape B.15 vérifie à l'écran.

---

### B.1 — Connexion super-admin et liste des agences

**Compte :** admin@immobillier.com
**Action :** `/login` → e-mail/mot de passe → bouton « Se connecter »
(`apps/web/src/pages/Login.tsx`). Menu **Administration > Agences**
(`/admin/tenants`).
**Attendu :** liste paginée des agences existantes (au moins « Agence Mali »,
« Bamako Immo » du seed) ; bouton « Nouvelle agence » visible en haut de page
(`apps/web/src/pages/admin/TenantsList.tsx`).
**Couvre :** Administration plateforme / Gestion des agences / Lister les
agences ; Authentification / Se connecter.

### B.2 — Tiroir « Nouvelle agence » : pack Opérateur intégré

**Compte :** admin@immobillier.com
**Action :** bouton « Nouvelle agence » → tiroir. Renseigner « Nom de
l'agence » = `Groupe Intégré Recette OI`, « Nom de l'administrateur » =
`Awa Konaté OI`, « E-mail de l'administrateur » = `admin.oi@recette.test`.
Section « Packs » : cliquer la carte **Opérateur intégré**. Laisser les
extensions à 0, cycle « Mensuel ». Ouvrir « Plus d'options » : e-mail de
contact `contact.oi@recette.test`, ville `Abidjan`, pays `Côte d'Ivoire`.
**Attendu :**

- La carte « Opérateur intégré » affiche `249 900` FCFA « / mois » et se
  coche ; les cartes Agence/Syndic/Promoteur se grisent et se décochent.
- Section « Extensions » propose les trois lignes : « Lots supplémentaires
  (blocs de 10) », « Copropriétés supplémentaires », « Chantiers
  supplémentaires » (les trois, à la différence d'un pack Syndic ou Agence
  seul qui n'en proposerait qu'une partie).
- « Essai gratuit d'un mois inclus (automatique, non désactivable) » : coché,
  grisé.
- « Récapitulatif » (calculé en direct via `POST /api/admin/catalog/quote`) :
  ligne `Opérateur intégré 249 900`, « Total HT mensuel » **249 900**,
  « Total HT annuel (11 mois) » **2 748 900**.
  **Couvre :** Administration plateforme / Abonnements par packs / Consulter le
  catalogue ; Estimer une composition (devis).

### B.3 — Création et écran de résultat

**Compte :** admin@immobillier.com
**Action :** bouton « Créer l'agence » (au bas du tiroir).
**Attendu :**

- Le tiroir devient « Agence créée » : bandeau de succès
  « {{name}} ({{slug}}) est prête à l'usage. ».
- « Modules et offre » : tags `Agence`, `Syndic`, `Promoteur`, texte
  « Packs INTEGRE, cycle mensuel — fin d'essai le {{J+30}} ».
- « Administrateur » : `Awa Konaté OI — admin.oi@recette.test`.
- « Lien d'invitation » : champ en lecture seule
  `http://localhost:3311/auth/accept-invite?token=<uuid>` + bouton « Copier »
  (`apps/web/src/components/admin/TenantCreatedResult.tsx`). **Copier ce
  lien : c'est `INVITE` pour B.7.**
- « E-mail d'invitation envoyé. » (ou le message de repli si l'envoi échoue —
  les deux sont acceptables, aucun fournisseur n'est configuré ici).
- Boutons « Renvoyer l'invitation », « Ouvrir la fiche », « Créer une autre
  agence » présents (ne pas cliquer « Créer une autre agence » ici).
- « Ouvrir la fiche » mène à `/admin/tenants/<TENANT>` : noter `TENANT`.
  **Couvre :** Administration plateforme / Gestion des agences / Créer une
  agence (provisioning en un clic) ; Collaborateurs / (préparation de)
  Renvoyer une invitation.

### B.4 — Fiche agence côté super-admin : onglets et abonnement

**Compte :** admin@immobillier.com
**Action :** `/admin/tenants/<TENANT>`. Parcourir les onglets « Vue
d'ensemble », « Statistiques », « Activité », puis ouvrir l'onglet
« Abonnement » (`apps/web/src/components/admin/tenant-detail/SubscriptionTab.tsx`).
**Attendu :**

- Onglets disponibles : Vue d'ensemble, Collaborateurs, Abonnement, Factures,
  Activité, Statistiques, Export des données.
- « Statistiques » : effectifs (0 ou 1 selon l'admin déjà accepté ou non),
  modules actifs, abonnement, dernière connexion.
- « Activité » : historique d'activité de l'agence (probablement vide à ce
  stade).
- Carte « Abonnement » : Statut **Essai**, Phase **Essai**, Cycle
  **Mensuel**, Période en cours (J → J+30), « Fin d'essai » + bouton
  « Prolonger », « Jours de grâce » **7**, « Remise de combinaison »
  **10 %** (affichée mais sans effet, un seul pack), « Politique de
  dépassement » sur une valeur par défaut (normalement **Facturer le
  dépassement**) — **ne pas la changer ici**, « Packs en vigueur »
  **Opérateur intégré**.
- Carte « Consommation » : jauges **Lots 0 / 300**, **Copropriétés 0 / 3**,
  **Chantiers 0 / 3**.
- Carte « Packs et extensions » : une ligne `Opérateur intégré`, quantité 1,
  prix mensuel figé 249 900, statut **Actif**.
- Carte « Modules inclus » : Agence, Syndic, Promoteur tous **Ouvert**.
- Carte « Prochaine facture (aperçu) » : ligne(s) chiffrée(s) ou message
  « Aperçu indisponible. » selon que le calcul s'applique pendant l'essai —
  consigner ce qui s'affiche réellement, ce n'est pas un échec dans les deux
  cas.
  **Couvre :** Administration plateforme / Gestion des agences / Consulter le
  détail d'une agence ; Consulter les statistiques d'une agence ; Consulter les
  modules d'une agence ; Statistiques et audit / Consulter l'activité d'une
  agence ; Abonnements par packs / Consulter la vue d'ensemble de l'abonnement ;
  Consulter ses droits (entitlements, côté super-admin) ; Prévisualiser la
  prochaine facture.

### B.5 — Administration > Rôles et permissions : consulter le rôle Agent

**Compte :** admin@immobillier.com
**Action :** menu **Administration > Rôles et permissions**
(`/admin/roles-permissions`, `apps/web/src/pages/admin/RolesPermissions.tsx`).
Sélectionner le rôle **Agent tenant** dans la liste des rôles de portée
Agence. Consulter le panneau « Permissions — Agent tenant » puis le panneau
« Menus — Agent tenant » (ne rien enregistrer).
**Attendu :** liste des rôles (Super administrateur plateforme,
Administrateur tenant, Gestionnaire tenant, Agent tenant, Comptable tenant —
`apps/web/src/constants/permissions-labels.ts`) ; le panneau Permissions
affiche les cases cochées pour l'Agent (Biens voir/créer/modifier/visites,
CRM contacts et affaires en voir/créer/modifier, `CRM_MATCHING_VIEW`) et
décochées pour les droits Finance, Publication et Utilisateurs — à retenir
pour B.15.
**Couvre :** Administration plateforme / Rôles et permissions / Lister les
rôles ; Consulter un rôle et ses permissions ; Lister toutes les
permissions ; Consulter la carte des menus par rôle (vue seule — les
permissions et les menus ne sont pas modifiés dans ce scénario).

### B.6 — Journaux d'audit de l'opérateur

**Compte :** admin@immobillier.com
**Action :** menu **Administration > Journaux d'audit** (`/admin/audit`).
Filtrer par agence = « Groupe Intégré Recette OI ».
**Attendu :** au moins une entrée correspondant à la création de l'agence
(action de provisioning), horodatée, avec l'acteur `admin@immobillier.com`.
**Couvre :** Administration plateforme / Statistiques et audit / Consulter
les journaux d'audit ; Consulter les statistiques globales (aperçu rapide de
la page `/admin/statistics`, à visiter en passant).

### B.7 — Acceptation de l'invitation par l'administrateur de l'agence

**Compte :** aucun (page publique) — se déconnecter du compte super-admin ou
ouvrir une fenêtre de navigation privée.
**Action :** ouvrir `INVITE` (le lien copié en B.3). Saisir d'abord un mot de
passe faible (`faible`), valider. Puis saisir `RecetteOI#2026` et le nom
complet `Awa Konaté OI` si demandé, valider
(`apps/web/src/pages/auth/AcceptInvitePage.tsx`).
**Attendu :**

- Mot de passe faible refusé : messages de règle (8 caractères minimum, une
  majuscule, une minuscule, un chiffre, un caractère spécial — règles de
  `packages/api/src/utils/password-utils.ts::validatePasswordStrength`,
  `RecetteOI#2026` les respecte).
- Mot de passe conforme : écran de résultat « Invitation acceptée » avec
  sous-titre « Votre compte est prêt. Redirection vers la connexion... »,
  puis redirection.
- Rouvrir `INVITE` après coup : refusé, l'invitation est déjà acceptée.
  **Couvre :** Administration plateforme / Authentification / Accepter une
  invitation.

### B.8 — Première connexion de l'administrateur, menu attendu

**Compte :** admin.oi@recette.test / RecetteOI#2026
**Action :** `/login`, se connecter.
**Attendu :**

- Connexion réussie, arrivée sur le tableau de bord de l'agence
  (`/tenant/<TENANT>/...`), pas d'écran « vérifiez votre e-mail ».
- Sidebar : les trois zones primaires (Biens, Baux, Encaisser) et, dans
  « Plus », les groupes Finance (cinq espaces), Patrimoine, Maintenance,
  Documents, Agence, **Ventes** et **CRM** tous visibles (les trois modules
  du pack sont ouverts) ; dans le domaine Syndic (menu « Plus »), l'entrée
  Copropriété avec ses sous-entrées Copropriétés/Copropriété/
  Finances/Assemblées et documents — puisque `SUBSCRIPTION_ENFORCEMENT=enforce`
  et que l'Intégré ouvre les trois modules, rien n'est masqué pour cet
  opérateur (contrairement à un pack partiel, qui masquerait les modules non
  souscrits).
  **Couvre :** Administration plateforme / Authentification / Se connecter.

### B.9 — Page Abonnement côté agence

**Compte :** admin.oi@recette.test
**Action :** menu **Agence > Paramètres de l'agence**, bouton « Voir mon
abonnement » (ou directement `/tenant/<TENANT>/settings/abonnement`,
`apps/web/src/pages/tenant/TenantSubscriptionSettings.tsx`).
**Attendu :**

- Carte « Formule » : Statut **Essai**, Cycle **Mensuel**, Packs
  **INTEGRE**, « Période en cours » J → J+30, jours d'essai restants.
- Carte « Consommation » : jauges **Lots 0/300**, **Copropriétés 0/3**,
  **Chantiers 0/3**.
- Carte « Modules » : Agence, Syndic, Promoteur.
- Section Factures : vide (essai en cours).
- Carte « Demander une extension » : formulaire présent (Offre souhaitée,
  Quantité, Votre demande), « Mes demandes » vide — **ne pas envoyer de
  demande ici**, elle est testée dans la partie 09.
  **Couvre :** Abonnements par packs / Gestion de l'abonnement d'une agence /
  Consulter ses droits (entitlements, côté agence) ; Facturation plateforme /
  Factures d'abonnement / Consulter ses factures (agence — liste vide
  constatée) ; Demandes d'extension / (formulaire visible, non envoyé ici, voir
  partie 09).

### B.10 — Paramètres de l'agence : profil, logo, identité des documents

**Compte :** admin.oi@recette.test
**Action :** menu **Agence > Paramètres de l'agence** (`/tenant/<TENANT>/settings`,
`apps/web/src/pages/tenant/TenantSettings.tsx`). Compléter « Dénomination
légale », vérifier les textes d'aide sous e-mail/téléphone/adresse
(« Utilisé dans les documents générés »), téléverser un logo (PNG/JPEG/WebP,
2 Mo max), puis dans la carte « Signature et cachet pour les documents »
téléverser une image pour « Signature » et une pour « Cachet ». Enregistrer.
**Attendu :**

- Message « Informations mises à jour avec succès ! ».
- Logo affiché en vignette 80×80 après téléversement.
- Cartes Signature/Cachet passent de « pas d'image » à une prévisualisation
  après upload (composant `BrandingImageField`) ; ces images sont privées
  (jamais un `<img src>` direct sur une URL publique).
  **Couvre :** Administration plateforme / Gestion des agences / Modifier son
  agence (auto-édition) ; Déposer le logo d'une agence ; Identité des documents
  (agence) / Consulter la signature et le cachet de l'agence ; Gérer la
  signature et le cachet de l'agence.

### B.11 — Inviter les trois collaborateurs

**Compte :** admin.oi@recette.test
**Action :** menu **Agence > Collaborateurs > Inviter**
(`/tenant/<TENANT>/collaborators/invite`,
`apps/web/src/pages/tenant/InviteCollaborator.tsx`). Répéter trois fois :

- `manager.oi@recette.test` → rôle **Gestionnaire tenant**.
- `agent.oi@recette.test` → rôle **Agent tenant**.
- `compta.oi@recette.test` → rôle **Comptable tenant**.
  **Attendu :** les rôles proposés (cases à cocher) affichent les libellés
  français « Administrateur tenant », « Gestionnaire tenant », « Agent
  tenant », « Comptable tenant » avec leur description ; message « Invitation
  envoyée avec succès » après chaque envoi, retour sur la liste des
  invitations.
  **Couvre :** Administration plateforme / Collaborateurs / Inviter un
  collaborateur ; Rôles et permissions / Lister les rôles (vue depuis
  l'invitation).

### B.12 — Liste des invitations en attente

**Compte :** admin.oi@recette.test
**Action :** menu **Agence > Invitations** (`/tenant/<TENANT>/invitations`).
**Attendu :** trois lignes en attente (manager.oi, agent.oi, compta.oi),
chacune avec des actions « Renvoyer » et « Révoquer » disponibles (ne pas les
utiliser ici, sauf si une invitation semble bloquée — dans ce cas noter le
texte affiché et renvoyer).
**Couvre :** Administration plateforme / Collaborateurs / Lister les
invitations ; Renvoyer une invitation (bouton constaté présent, non
actionné) ; Révoquer une invitation (idem).

### B.13 — Acceptation par les trois collaborateurs et connexion

**Compte :** aucun, puis chacun des trois comptes.
**Action :** pour chaque invitation, ouvrir son lien (à copier depuis la
liste ou, si l'interface ne l'affiche pas en clair, renvoyer l'invitation
depuis B.12 pour obtenir un lien copiable), saisir le mot de passe
`RecetteOI#2026`, valider, puis se connecter avec le compte correspondant.
**Attendu :** même parcours qu'en B.7 pour chacun (mot de passe conforme
accepté, connexion réussie sur le tableau de bord de l'agence). Si l'écran ne
propose nulle part de lien copiable pour une invitation de collaborateur
(à la différence du tiroir de création d'agence), le consigner dans
« Réalité de l'environnement » de cette exécution plutôt que de bloquer le
scénario.
**Couvre :** Administration plateforme / Authentification / Accepter une
invitation (×3) ; Se connecter (×3).

### B.14 — Liste des collaborateurs et fiche d'un membre

**Compte :** admin.oi@recette.test
**Action :** menu **Agence > Collaborateurs** (`/tenant/<TENANT>/collaborators`).
Ouvrir la fiche de Salif Coulibaly OI (Agent).
**Attendu :** quatre membres actifs (Awa admin, Moussa gestionnaire, Salif
agent, Fanta comptable) ; la fiche de Salif affiche son rôle « Agent
tenant », son statut actif, avec les actions « Modifier les rôles »,
« Désactiver », « Réinitialiser le mot de passe », « Révoquer les sessions »
visibles mais **non utilisées ici** (elles casseraient la vérification des
droits de l'étape suivante).
**Couvre :** Administration plateforme / Collaborateurs / Lister les
collaborateurs ; Consulter un collaborateur.

### B.15 — Vérification des droits d'un Agent

**Compte :** agent.oi@recette.test
**Action :** se connecter. Observer le menu (sidebar), ouvrir **Agence >
Paramètres de l'agence**, **Agence > Collaborateurs > Inviter**, une fiche de
bien, et **CRM > Affaires**.
**Attendu :**

- Paramètres de l'agence : page consultable (lecture, `TENANT_SETTINGS_VIEW`)
  mais le formulaire ne s'enregistre pas / les champs sensibles ne sont pas
  modifiables en pratique pour ce rôle (`TENANT_SETTINGS_EDIT` manquant) — à
  constater précisément à l'écran (formulaire grisé, bouton absent, ou
  écriture refusée avec une notification : consigner ce qui apparaît vraiment).
- « Agence > Collaborateurs > Inviter » : soit l'entrée de menu est absente,
  soit la page refuse l'envoi (l'Agent n'a pas `USERS_CREATE`) — consigner le
  comportement réel.
- Fiche d'un bien : pas de bouton de publication sur le portail public
  (`PROPERTIES_PUBLISH` réservé par défaut à TENANT_ADMIN).
- CRM > Affaires : l'Agent peut créer/consulter une affaire mais, sur son
  détail, le bouton « Rechercher des correspondances » (matching) est
  absent ou son clic est refusé (`CRM_MATCHING_RUN` manquant, seule
  `CRM_MATCHING_VIEW` est accordée) ; aucun accès aux espaces Finance
  (menu « Plus » sans les groupes Finance, ou accès refusé si l'URL est
  tapée directement).
  **Couvre :** Administration plateforme / Rôles et permissions (vérification
  concrète des permissions du rôle Agent tenant décrites en B.5) ; ferme la
  boucle sur les droits par rôle pour cet opérateur.

---

## Hors interface

Sous-fonctionnalités du domaine « Administration plateforme » non testées
par clic dans cette partie, avec la raison :

- **Suspendre / Réactiver une agence** — nettoyage de fin de scénario
  (relève d'une autre partie, pas de la création/mise en vie de l'opérateur).
- **Forcer un module / Lever une dérogation de module** — sans objet : les
  trois modules sont déjà ouverts nativement par le pack Opérateur intégré.
- **Lister les agences (vitrine publique) / Consulter une agence par slug** —
  page publique du site vitrine, pas un écran de gestion de l'opérateur.
- **Modifier les permissions d'un rôle / Remplacer les menus d'un rôle** —
  consultés en B.5 mais non modifiés, pour ne pas fausser la vérification des
  droits par défaut en B.15.
- **Consulter ses menus coupés** (`GET /api/roles/menu-access/me`) — lu en
  silence par la coquille applicative à chaque chargement, aucun écran dédié.
- **S'inscrire / Vérifier l'e-mail / Renvoyer la vérification / Se connecter
  via Google / Consulter les fournisseurs d'authentification** — flux
  d'inscription publique et OAuth non utilisés ici (tous les comptes de ce
  scénario naissent d'une invitation).
- **Rafraîchir la session / Se déconnecter** — appels automatiques de la
  coquille applicative (le second sert implicitement entre B.6 et B.7, B.13).
- **Demander / Réinitialiser le mot de passe** — non utilisé, tous les mots
  de passe sont fixés à l'acceptation de l'invitation.
- **Renvoyer/révoquer une invitation de collaborateur, modifier ses rôles,
  le désactiver/réactiver, réinitialiser son mot de passe, révoquer ses
  sessions** — boutons constatés présents (B.12, B.14) mais non actionnés
  pour ne pas perturber le jeu de données des parties suivantes.
- **Ajouter/retirer un pack ou une extension, changer de pack, modifier les
  réglages d'abonnement (politique de dépassement, jours de grâce...),
  passer/lever la lecture seule manuelle, dérogations de capacité, demandes
  d'extension (envoi et traitement), réconciliation des lots** — délibérément
  reportés à la partie 09 (Abonnement, quotas et limites), qui les teste sur
  cet opérateur une fois le parc et les données en place.
- **Modifier une offre du catalogue** — modifierait le catalogue pour tous
  les tenants, jamais fait depuis un scénario de recette.
- **Générer/émettre/marquer payée une facture, avoir, PDF, paiement manuel ou
  en ligne (agence ou plateforme), IPN, simulateur de paiement** — aucune
  facture n'existe pendant l'essai ; le paiement en ligne (plateforme)
  n'est testé dans aucune partie de ce scénario.
- **Paramètres financiers de l'agence, passerelle de paiement (consulter,
  modifier, tester)** — relèvent du module Finance (partie 05), pas de la
  création de l'opérateur.
- **Abonnement « v1 » et facturation « v1 » (legacy)** — non exposés dans
  l'interface actuelle (confirmé par le wiki lui-même : « Non exposé dans
  l'UI actuelle »), aucune route front ne les appelle.

---

## Couverture

| Fonctionnalité (wiki)           | Sous-fonctionnalités couvertes                                                                                                                                                                 | Étapes                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Gestion des agences             | Créer une agence, Lister les agences, Consulter le détail, Consulter les statistiques, Consulter les modules, Modifier son agence (auto-édition), Déposer le logo, Consulter sa fiche (membre) | B.1–B.4, B.8–B.10         |
| Rôles et permissions            | Lister les rôles, Consulter un rôle et ses permissions, Lister toutes les permissions, Consulter la carte des menus par rôle                                                                   | B.5, B.11, B.15           |
| Authentification                | Se connecter (×5), Accepter une invitation (×4)                                                                                                                                                | B.1, B.7, B.8, B.13, B.15 |
| Collaborateurs                  | Inviter un collaborateur, Lister les invitations, Lister les collaborateurs, Consulter un collaborateur                                                                                        | B.11, B.12, B.14          |
| Statistiques et audit           | Consulter les statistiques globales, Consulter l'activité d'une agence, Consulter les journaux d'audit                                                                                         | B.4, B.6                  |
| Abonnements par packs           | Consulter le catalogue, Estimer une composition, Consulter la vue d'ensemble de l'abonnement, Consulter ses droits (super-admin et agence), Prévisualiser la prochaine facture                 | B.2, B.4, B.9             |
| Facturation plateforme          | Consulter ses factures (agence, liste vide constatée)                                                                                                                                          | B.9                       |
| Demandes d'extension            | Formulaire visible côté agence (non envoyé)                                                                                                                                                    | B.9                       |
| Identité des documents (agence) | Consulter et gérer la signature/le cachet                                                                                                                                                      | B.10                      |

**Non couvertes ici, avec raison :** voir la section « Hors interface »
ci-dessus — l'essentiel des retraits d'items reportés le sont explicitement
vers la partie 09 (quotas/abonnement) ou hors périmètre de la création d'un
opérateur (facturation réelle, legacy, OAuth, paiement).
