# ImmoTopia — Liste des fonctionnalités

**Version** 2.0 — 22 septembre 2026
**Branche** `claude/dazzling-poincare-ed5cfd` (superset : contient le module financier et chantiers, absent de `feat/design-system-navy-orange`)

Établi à partir du code (routes, contrôleurs, services, schéma Prisma, modèle de
navigation) **et vérifié écran par écran** sur l'application en fonctionnement,
agence de démonstration « Ivoire Résidences ».

Les éléments marqués 👁 ont été constatés dans l'interface et n'étaient pas
visibles à la seule lecture du code.

---

## 0. Socle

- **Multi-tenant** — une instance, plusieurs agences (`Tenant`), données et paramètres cloisonnés.
- **Modules activables par tenant** — `MODULE_AGENCY`, `MODULE_SYNDIC`, `MODULE_PROMOTER`.
- **4 personas de navigation** — super-administrateur plateforme, collaborateur d'agence, propriétaire, locataire. Arbre de menus et barre d'onglets mobile propres à chacun.
- **RBAC** — rôles × permissions fines, plus un réglage des menus visibles par rôle (`RoleMenuAccess`). Un menu absent est une permission manquante, pas un défaut d'affichage.
- **Journal d'audit** — traçabilité des actions sensibles.
- 👁 **Multilingue** — français, anglais, arabe, avec sélecteur de langue en barre supérieure.
- 👁 **Barre d'onglets mobile** — Accueil, Biens, Baux, Encaisser, Plus.
- 👁 **Page 404 traitée** — message explicite et référence technique (`Réf. HTTP-404 · <chemin>`).

---

## 1. Authentification et comptes

- Inscription, connexion, rafraîchissement de session, déconnexion.
- Vérification d'adresse e-mail par jeton.
- Mot de passe oublié et réinitialisation.
- Connexion Google (OAuth).
- Invitation de collaborateurs et acceptation d'invitation.
- Limitation de débit sur les routes sensibles.
- Jeton porté par un **cookie httpOnly** — pas de jeton en `localStorage`.
- Profil utilisateur et préférences.
- 👁 Panneau « Comptes par tenant » en mode développement, couvrant les quatre personas.

---

## 2. Tableau de bord — poste de travail 👁

Bien plus qu'un écran d'accueil : **quatorze blocs** qui composent un véritable poste de travail.

**Indicateurs de tête** — Impayés (montant + nombre d'échéances en retard) · À encaisser sous 7 jours · Encaissé sur le mois, comparé à un **objectif mensuel** · Biens (nombre, taux d'occupation, nombre publiés) · Contacts et transactions suivies · Tickets ouverts et déclarations à valider.

**« À traiter aujourd'hui »** — file de travail unifiée qui mélange les genres à dessein : échéances en retard (référence du bail, bien, montant, jours de retard), tickets de maintenance, déclarations de paiement à valider. C'est la liste d'actions de la journée, pas un rapport.

**Analyses** — Trésorerie sur 12 mois (encaissé face à attendu) · Échéances par statut (en retard, partiel, à échoir, payé, avec reste à encaisser) · **Moyens de paiement** (Mobile Money, Virement, Chèque, Espèces) · Parc par statut · Types de biens · Entonnoir commercial par étape · Contacts par catégorie · Tickets par priorité · **Appels de charges** (taux de recouvrement) · **Programmes de travaux** par statut · Activité récente.

> Le suivi du **Mobile Money** comme moyen de paiement est déjà en place — c'est le premier poste d'encaissement dans les données de démonstration.

---

## 3. Biens immobiliers

- Fiche complète : création, modification, archivage.
- Modèles de type de bien (`PropertyTypeTemplate`).
- Médias (photos, ordre), documents du bien.
- Historique des changements de statut.
- Mandats de gestion et de vente.
- Publication et retrait d'annonce, avec API publique (`/public/properties`) pour un site vitrine.
- Score de qualité de l'annonce.
- Recherche multi-critères.
- Visites : planification, collaborateurs affectés, calendrier dédié.
- Référentiel géographique : pays, régions, communes.

---

## 4. Gestion locative

- **Baux** — création, modification, colocataires, fiche détaillée.
- **Échéances** — génération automatique, lignes de détail, fiche d'échéance.
- **Paiements** — saisie, allocation sur une ou plusieurs échéances, fiche paiement.
- **Déclarations de paiement** — le locataire déclare, l'agence valide. 👁 Mobile Money en tête des moyens déclarés.
- **Remboursements**.
- **Pénalités de retard** — règles paramétrables, calcul automatique par tâche planifiée, ajustement manuel.
- **Dépôts de garantie** — constitution, mouvements, restitutions.
- **Documents locatifs** — génération, consultation, modification.

---

## 5. Finance opérationnelle 👁 _(nouveau — absent de la v1)_

> Doctrine affichée dans l'interface : l'utilisateur **facture** et **règle**. Aucun écran n'expose « débit » ni « crédit ».

### 5.1 Volet clients

- **Balance clients** — une ligne par tiers : total facturé, total réglé, solde. Produite sans aucune saisie, dérivée des échéances et paiements existants. Filtre et **export**.
- **Balance âgée** — ventilation de l'antériorité des créances. Filtre et export.
- **Relevé de compte** — chronologique, avec solde après chaque mouvement, imprimable.
- **Facturation du mois** — campagne de facturation mensuelle, 👁 avec action « Relancer la campagne ».
- **Avances**.

### 5.2 Volet fournisseurs

- **Fournisseurs** — annuaire typé (Matériaux, Prestation, Matériaux et prestation), actif/inactif.
- **Factures fournisseurs** — lignes avec quantité et prix unitaire, annulation.
- **Règlements fournisseurs** et allocation sur factures.
- 👁 **Balance fournisseurs** — par tiers : facturé, réglé, solde, avec **total de contrôle** en pied. Gère les soldes négatifs (avances).

### 5.3 Caisse et contrôle

- **Pièces de caisse** — bons de caisse numérotés, impression, annulation, duplication.
- 👁 **File de validation** — pièces en attente réparties par type (facture fournisseur, règlement, pièce de caisse), avec compteurs. Chaque pièce porte son saisisseur et sa date.
  > « Valider une pièce est définitif : une fois validée, elle ne se modifie plus. Pour la corriger, il faut l'annuler par une pièce liée. »
- **Annulation par pièce liée** (`VoidDocument`) plutôt que modification.
- 👁 **Importation** — assistant en **5 étapes** (le document → le fichier → les colonnes → l'aperçu → l'import) avec **mapping de colonnes** et date par défaut. Les pièces sont importées **en brouillon, jamais validées**. Conçu pour reprendre un suivi Excel existant.

---

## 6. Chantiers 👁 _(nouveau — absent de la v1)_

- **Chantier comme objet financier de première classe** — 👁 peut exister **sans bien rattaché**, sur terrain loué.
- **Coût réel entièrement dérivé des imputations**, jamais saisi.
- 👁 **Sous-totaux par poste** — Gros œuvre, Toiture, Plomberie, Électricité, Main-d'œuvre, Matériaux, Divers.
- 👁 **Imputations tracées jusqu'à la pièce d'origine** — chaque ligne dit sa nature, sa date, son montant et le document dont elle vient (note de salaire, facture fournisseur, pièce de caisse, sortie de stock).
- **Catégories de coûts** paramétrables, avec rattachement comptable.
- **Budgets de chantier** et **avenants** — 👁 budget initial, budget révisé, réalisé, écart, signalement de **dépassement**.
- **Bons de commande** et suivi de l'engagé — 👁 statuts Brouillon / Émis / Annulé, état de facturation, **reste à facturer**.
- **Avancement** (`SiteProgressEntry`) et **alertes de dépassement**.
- **Tableau de bord des chantiers** — vue consolidée budget / réalisé / écart.
- **Lots de chantier** — répartition par surface ou par quote-part manuelle, somme des parts contrôlée à 100.
- **Coût de revient par lot** et **clôture** du chantier, avec blocages de clôture explicites.
- **Bascule au patrimoine** (`capitalize`) — un lot de chantier devient un bien, **une seule fois**, contrainte d'unicité à l'appui.
- **Réouverture** d'un chantier clôturé.

---

## 7. Périphérie BTP 👁 _(nouveau — absent de la v1)_

### 7.1 Stock de matériaux

> Doctrine affichée : « C'est la sortie qui impute le chantier, pas la livraison. »

- **État du stock** et **journal des mouvements**.
- **Réceptions** et **sorties** — la sortie impute le chantier au coût moyen du moment.
- 👁 **Coût moyen pondéré par (article, lieu)** — quantité et valeur par dépôt et par chantier.
- **Transferts entre lieux** — écrits en deux mouvements liés. 👁 « Un transfert n'impute rien : ce n'est pas une dépense. »
- **Inventaire physique** et **rapprochement**.
- **Paramétrage** — articles (code, unité libre, famille, poste proposé à la sortie), lieux de stockage, méthode de valorisation.
- **Bascule au stock irréversible par chantier** — au-delà, le coût matière vient des sorties, plus des factures, pour éviter le double comptage.

### 7.2 Personnel et sous-traitance

- **Salariés et notes de salaire** — 👁 solde « ce qu'on lui doit », gestion des **avances à retenir**.
- **Tâcherons** — contrats, **situations de travaux** (`ProgressStatement`), paiements, 👁 solde dû par tâcheron.
- **Retenues de garantie** — 👁 taux, montant détenu, déjà libéré, en retard ; rattachées à leur pièce et à leur chantier.
  > « Une retenue ne diminue pas le coût du chantier : l'ouvrage a coûté son prix entier. Ce qu'elle change, c'est seulement ce qu'on doit maintenant. »

### 7.3 Foncier et partenariats

- **Baux de terrain** — 👁 bailleur, loyer annuel, mensualité, poste d'imputation, chantiers rattachés ; paiements et charges à payer (`LandLeaseAccrual`).
- **Associations** — parts (`PartnershipShare`) et distributions aux associés.

---

## 8. Patrimoine

- 👁 **Vue consolidée** — biens au portefeuille, dont occupés · taux d'occupation · **valeur estimée totale** · **encours de crédits** · charges de l'année · **loyers annuels**.
- **Performance** — rendement par bien et indicateurs consolidés.
- **Valorisations** — historique de valeur.
- **Emprunts** rattachés aux biens.
- **Dépenses** par catégorie.
- 👁 **Programmes de travaux** — par bien, avec statut (Planifié, En cours, Terminé, Annulé), date et montant.
- **Relevés propriétaire** — constitution, consultation et **envoi** au propriétaire.
- **Documents patrimoniaux**.

---

## 9. Maintenance

- **Tickets** — création par le locataire ou l'agence, cycle de vie complet, priorités (Urgente, Haute, Moyenne, Basse).
- Pièces jointes et fil de commentaires.
- Historique des changements de statut.
- **Prestataires** — annuaire et affectation.
- Notifications automatiques aux parties prenantes.
- Deux angles : « Tickets de l'agence » et « Mes demandes ».

---

## 10. CRM

- **Contacts** — rôles multiples, étiquettes, zones cibles, notes, archivage.
- **Affaires** — pipeline (Nouveau, Qualifiée, Visite, Négociation, Gagnée, Perdue), biens rattachés, 👁 entonnoir valorisé par étape.
- **Activités** — appels, tâches, notes.
- **Calendrier** et rendez-vous.
- **Appariement biens ↔ affaires**.
- **Tableau de bord CRM**.
- **Recherches de contacts enregistrées**.

---

## 11. Communication

- **Notifications e-mail** — configuration par événement métier, modèles par défaut, écran unifié.
- **Notifications WhatsApp** — configuration par événement, modèles, variables, envoi par fournisseur (Twilio).
- **Message groupé WhatsApp** — diffusion, automatisation de groupe, webhook entrant, journal des invitations.
- **Résolution de contact** — rapprochement d'un numéro entrant avec un contact ou un bail.
- **Newsletter** — listes, abonnés, campagnes planifiées, modèles, pages publiques d'inscription, de confirmation et de désinscription.
- **Préférences de communication** par contact et historique des envois.
- **Relances planifiées**.

---

## 12. Syndic / copropriété

- 👁 **Copropriétés** — adresse, statut, nombre de lots, nombre de bâtiments, référence cadastrale.
- **Lots** — tantièmes, profils propriétaire et locataire, affectations. Import des lots depuis les biens existants.
- **Charges** — appels de charges, lots d'appels, paiements. 👁 Suivi du taux de recouvrement.
- **Recouvrement** — relances, pénalités de retard, échéanciers, moyens de paiement.
- **Assemblées générales** — ordre du jour, résolutions, votes, pouvoirs.
- **Budgets** — lignes budgétaires et ventilations.
- **Comptabilité** — plan de comptes, journaux, écritures en partie double.
- **Comptes propriétaires** et écran Finances.
- **Prestataires et contrats**, **équipements des parties communes**.
- **Incidents** avec imputation des coûts, lien vers la maintenance.
- **Documents** et **fonds**.

---

## 13. Documents et modèles

- 👁 **Modèles DOCX téléversés par l'agence**, avec sa propre mise en page.
- 👁 **Variables `{{AGENCE_NOM}}`, `{{BAIL_LOYER_MENSUEL}}`…** substituées à la génération ; nombre de variables affiché par modèle (22 sur le contrat de bail professionnel).
- 👁 Typage par nature (Bail Commercial, …), modèle par défaut, actif/inactif, filtre par type.
- 👁 **Guide d'utilisation intégré** listant les variables disponibles.
- Numérotation automatique des documents.
- Moteur de génération avec construction du contexte métier.

---

## 14. Portails

**Propriétaire** — tableau de bord, mes biens et fiche bien, baux et détail, revenus, paiements, échéances, dépôts de garantie, incidents, documents, rapports, préférences.

**Locataire** — tableau de bord, mon bail, paiements et déclaration de règlement, dépôt de garantie, incidents, documents.

---

## 15. Administration

**Plateforme** — agences, modules par agence, abonnements, factures, rôles et permissions, menus par rôle, statistiques, journaux d'audit.

**Agence** — paramètres, collaborateurs, invitations, modèles de documents, configurations de notification.

---

## 16. Technique

- Monorepo npm : `packages/api` (Express + Prisma + PostgreSQL, port 8001) et `apps/web` (React + Vite + Ant Design + Tailwind, port 3000 par défaut).
- Tâches planifiées : calcul des pénalités, campagnes de newsletter, relances.
- Déploiement conteneurisé.
- ESLint, Prettier, TypeScript, tests API et web, vérification de contraste d'accessibilité.

---

## 17. Observations relevées pendant l'inspection

**Une pédagogie inhabituelle dans les écrans financiers.** Chaque écran sensible porte un encadré qui explique _pourquoi_ la règle est ce qu'elle est — pourquoi une sortie de stock impute et pas une livraison, pourquoi une retenue ne diminue pas le coût, pourquoi une validation est définitive. C'est un différenciateur commercial réel face à un ERP classique, et cela mérite d'être mis en avant en démonstration.

**`/finance` renvoie une 404.** Le groupe « Finance » de la barre latérale pointe vers la balance clients, et les sous-écrans affichent un bouton « Retour à Finance » — mais l'adresse `/tenant/:tenantId/finance` ne correspond à aucun écran. Il n'existe pas de page d'accueil du module. À trancher : créer un hub, ou renommer le bouton.

**Le module n'est pas sur la ligne principale.** Tout ce qui est décrit aux sections 5, 6 et 7 vit sur `claude/dazzling-poincare-ed5cfd`. La branche `feat/design-system-navy-orange` ne le connaît pas — et la v1 de ce document, écrite depuis elle, l'ignorait entièrement.

**Le maillon « vente » est absent.** `CrmDealType.VENTE` et `CrmDealStage.WON` existent, mais aucun contrat de vente, échéancier acquéreur, transfert de propriété ni création de copropriétaire ne s'ensuit. Pour une entreprise qui construit puis vend puis gère la copropriété, c'est la charnière qui manque. Voir `docs/MODELE_ECONOMIQUE.md`, §10.5.
