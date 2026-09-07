# Workflow de test simple - Module Patrimoine

## Comment utiliser ce document
Pour chaque page:
1. Lire "Cette page permet de faire".
2. Faire les actions dans "Ce qu'on doit faire".
3. Vérifier "Résultat attendu".

---

## 1) Page: /tenant/:tenantId/patrimoine
Exemple: `http://localhost:3000/tenant/b391be0f-76ea-4998-886b-f1d8451f7bd7/patrimoine`

### Cette page permet de faire
1. Voir une vue globale du patrimoine.
2. Voir les indicateurs principaux:
- nombre de biens
- taux d'occupation
- valeur totale estimée
- encours des crédits
- charges annuelles
- loyers annuels
3. Voir la liste chronologique des travaux (timeline).

### Ce qu'on doit faire
1. Ouvrir la page.
2. Vérifier que les cartes de synthèse s'affichent.
3. Vérifier que les montants ne sont pas vides quand des données existent.
4. Vérifier que la timeline des travaux affiche des éléments si des travaux existent.
5. Cliquer "Voir les biens (/properties)" et vérifier la redirection.

### Résultat attendu
1. La page charge sans erreur.
2. Les chiffres sont cohérents avec les données du tenant.
3. Aucun bouton "Nouveau bien" n'est présent dans ce module.

---

## 2) Page: /tenant/:tenantId/patrimoine/performance

### Cette page permet de faire
1. Choisir un bien.
2. Voir le rendement:
- brut
- net
- net-net
- plus-value latente
3. Simuler une projection sur plusieurs années.

### Ce qu'on doit faire
1. Ouvrir la page.
2. Vérifier le message "Sélectionnez un bien" quand aucun bien n'est choisi.
3. Choisir un bien dans la liste.
4. Vérifier l'affichage des indicateurs et du graphique.
5. Modifier les hypothèses:
- années
- croissance valeur
- croissance loyers
- croissance charges
- vacance
6. Cliquer "Recalculer".

### Résultat attendu
1. Les indicateurs se mettent à jour.
2. Le graphique de projection se met à jour.

---

## 3) Page: /tenant/:tenantId/patrimoine/work-programs

### Cette page permet de faire
1. Voir tous les programmes de travaux de tous les biens.
2. Filtrer par statut:
- Planifié
- En cours
- Terminé
- Annulé

### Ce qu'on doit faire
1. Ouvrir la page.
2. Changer le filtre de statut.
3. Vérifier que la liste/timeline change selon le filtre.

### Résultat attendu
1. Le filtre fonctionne.
2. Les informations affichées sont correctes (titre, date, coût, statut, bien).

---

## 4) Page: /tenant/:tenantId/patrimoine/statements

### Cette page permet de faire
1. Générer un relevé de gérance.
2. Voir l'historique des relevés.
3. Ouvrir le détail d'un relevé.
4. Envoyer un relevé.

### Ce qu'on doit faire
1. Remplir le formulaire "Générer un relevé de gérance":
- propriétaire (liste déroulante)
- période (YYYY-MM)
- biens concernés
2. Cliquer "Générer le relevé".
3. Vérifier qu'une nouvelle ligne apparaît dans le tableau.
4. Cliquer "Détails".
5. Revenir et cliquer "Envoyer".

### Résultat attendu
1. Le relevé est créé.
2. Le détail affiche les lignes du relevé.
3. L'envoi retourne un statut clair (envoyé ou raison du refus).

---

## 5) Page: /tenant/:tenantId/patrimoine/statements/:id

### Cette page permet de faire
1. Voir le détail complet d'un relevé.
2. Voir les montants et les lignes associées.

### Ce qu'on doit faire
1. Vérifier:
- statut
- période
- propriétaire
- total revenus
- total charges
- montant net
2. Vérifier la table des lignes (type, libellé, montant).

### Résultat attendu
1. Les montants correspondent au relevé généré.
2. Les lignes sont présentes et cohérentes.

---

## 6) Onglet bien: /tenant/:tenantId/properties/:id -> onglet "Patrimoine"
Exemple: `http://localhost:3000/tenant/b391be0f-76ea-4998-886b-f1d8451f7bd7/properties/267e90d5-d2b2-4d56-b63c-1871ce73f920` puis onglet `Patrimoine`.

### Objectif de cet onglet
Cet onglet sert à enrichir un bien existant avec des données financières et documentaires:
1. Valorisations du bien (historique de valeur).
2. Crédits immobiliers (encours, mensualités, progression).
3. Charges et dépenses du bien.
4. Programmes de travaux (planification + suivi).
5. Documents patrimoniaux.
6. Indicateurs de rendement et projection.

### Préparation avant test
1. Vérifier que le bien existe déjà dans `Propriétés`.
2. Vérifier qu'au moins un contact propriétaire existe dans CRM (rôle `PROPRIETAIRE`) pour tester la sélection propriétaire des documents.
3. Ouvrir l'onglet `Patrimoine` du bien.

### Interface A - Historique des valorisations
#### Utilité
1. Voir comment la valeur du bien évolue dans le temps.
2. Comparer la valeur estimée et la méthode utilisée.

#### Ce qu'on doit faire
1. Dans `Gérer les valorisations`, cliquer `Ajouter`.
2. Saisir:
- Date valorisation: `2026-03-10T10:00`
- Valeur estimée: `45000000`
- Devise: `XOF`
- Coût d'acquisition: `38000000`
- Date d'acquisition: `2023-01-15T09:00`
- Méthode: `Estimation de marché`
- Notes: `Révision annuelle du portefeuille`
3. Valider.
4. Vérifier la nouvelle ligne dans:
- `Historique des valorisations`
- `Gérer les valorisations`
5. Cliquer `Modifier`, passer la valeur à `47000000`, valider.
6. Cliquer `Supprimer` sur la ligne de test.

#### Résultat attendu
1. Les montants sont formatés correctement.
2. Modifier/Supprimer met à jour les tableaux sans rechargement manuel.

### Interface B - Crédits immobiliers
#### Utilité
1. Suivre les prêts liés au bien.
2. Visualiser la progression de remboursement.
3. Contrôler le capital restant dû et les mensualités.

#### Ce qu'on doit faire
1. Dans `Gérer les crédits`, cliquer `Ajouter`.
2. Saisir:
- Prêteur: `NSIA Banque`
- Capital initial: `30000000`
- Capital restant: `24500000`
- Taux d'intérêt: `7.5`
- Mensualité: `350000`
- Devise: `XOF`
- Date de début: `2024-01-01T00:00`
- Date de fin: `2034-01-01T00:00`
- Statut: `Actif`
3. Valider.
4. Vérifier:
- la carte `Crédits immobiliers` (progression + tableau)
- le tableau `Gérer les crédits`
5. Modifier le statut en `Clôturé` puis remettre `Actif`.
6. Supprimer la ligne de test.

#### Résultat attendu
1. Le crédit apparaît sur une ligne lisible.
2. Les statuts sont en français (`Actif`, `Clôturé`, `Défaillant`).

### Interface C - Charges et dépenses
#### Utilité
1. Suivre les sorties de trésorerie du bien.
2. Identifier les charges capitalisables.

#### Ce qu'on doit faire
1. Dans `Gérer les dépenses`, cliquer `Ajouter`.
2. Saisir:
- Catégorie: `Charges de copropriété`
- Libellé: `Charges T1 2026`
- Montant: `125000`
- Devise: `XOF`
- Date de paiement: `2026-03-01T08:30`
- Capitalisée: `Non`
- URL justificatif: `https://example.com/charges-t1-2026.pdf`
- Notes: `Payé par virement`
3. Valider.
4. Vérifier la présence dans:
- `Charges et dépenses`
- `Gérer les dépenses`
5. Modifier le montant (`130000`), valider.
6. Supprimer la ligne de test.

#### Résultat attendu
1. Les catégories s'affichent en français.
2. Le total des charges de l'année se met à jour.

### Interface D - Programmes de travaux
#### Utilité
1. Planifier les travaux.
2. Suivre l'avancement et les coûts estimés/réels.

#### Ce qu'on doit faire
1. Dans `Gérer les programmes de travaux`, cliquer `Ajouter`.
2. Saisir:
- Titre: `Réfection façade`
- Description: `Peinture extérieure complète`
- Coût estimé: `2500000`
- Coût réel: laisser vide
- Devise: `XOF`
- Date prévue: `2026-06-15T09:00`
- Date de complétion: laisser vide
- Statut: `Planifié`
- Capitalisé: `Oui`
3. Valider.
4. Vérifier:
- la ligne dans `Gérer les programmes de travaux`
- l'élément dans la timeline `Programme de travaux`
5. Modifier le statut en `En cours`, puis `Terminé` (avec coût réel `2750000`).
6. Supprimer la ligne de test.

#### Résultat attendu
1. Les statuts sont en français (`Planifié`, `En cours`, `Terminé`, `Annulé`).
2. La timeline reflète les changements.

### Interface E - Rendement et projection
#### Utilité
1. Visualiser rendement brut/net/net-net.
2. Simuler des scénarios de projection.

#### Ce qu'on doit faire
1. Dans `Hypothèses de projection`, saisir:
- Années: `15`
- Croissance valeur: `0.03`
- Croissance loyers: `0.02`
- Croissance charges: `0.025`
- Vacance locative: `0.05`
2. Cliquer `Recalculer`.
3. Vérifier que:
- indicateurs `Brut`, `Net`, `Net-Net`, `Plus-value latente` changent
- graphique `Projection de rendement` se met à jour
4. Rafraîchir la page et vérifier la conservation des hypothèses pour ce bien.

#### Résultat attendu
1. Les calculs sont cohérents et réactifs.
2. Les hypothèses restent persistées pour le même bien.

### Interface F - Documents patrimoniaux
#### Utilité
1. Centraliser les documents du bien.
2. Suivre les expirations.
3. Associer (optionnellement) un propriétaire.

#### Ce qu'on doit faire
1. Dans `Ajouter document patrimoine`, cliquer `Ajouter`.
2. Saisir:
- Titre: `Titre foncier principal`
- Type: `Titre de propriété`
- Fichier: sélectionner un PDF local (ex: `titre-foncier-test.pdf`)
- Date expiration: laisser vide (ou mettre `2027-12-31T00:00`)
- Propriétaire (optionnel): sélectionner un contact dans la liste
3. Valider.
4. Vérifier l'apparition dans `Coffre-fort documentaire`.
5. Cliquer `Ouvrir` et vérifier que le document s'ouvre dans un nouvel onglet.
6. Cliquer `Supprimer` puis confirmer.

#### Résultat attendu
1. L'upload fonctionne sans URL manuelle.
2. Le lien ouvre un fichier serveur (`/uploads/...`) et pas une route React.
3. Le badge d'expiration (`Valide`, `Expire`, `Expire dans Xj`) est cohérent.

### Validation de fin de section
1. [ ] Chaque bloc (valorisations, crédits, dépenses, travaux, documents) accepte une création.
2. [ ] Chaque bloc supporte la modification/suppression quand applicable.
3. [ ] Les statuts et libellés sont en français avec accents.
4. [ ] Les montants et dates sont correctement formatés.
5. [ ] Aucun champ ne demande de créer un nouveau bien depuis cet onglet.

---

## 7) Contrôles obligatoires de sécurité

### Ce qu'on doit faire
1. Tester avec 2 tenants différents (Tenant A et Tenant B).
2. Depuis Tenant A, tenter d'appeler l'API Patrimoine d'un bien de Tenant B.

### Résultat attendu
1. Accès refusé (403/404).
2. Aucune fuite de données entre tenants.

---

## 8) Vérifications formulaires (erreurs)

### Ce qu'on doit faire
1. Essayer d'envoyer des données invalides:
- montant négatif
- date de fin crédit avant date de début
- document sans fichier uploadé
- période relevé invalide

### Résultat attendu
1. Le formulaire refuse la saisie.
2. Un message d'erreur compréhensible est affiché.

---

## 9) Ordre conseillé des tests
1. Vue consolidée
2. Travaux
3. Performance
4. Relevés
5. Onglet Patrimoine sur un bien
6. Sécurité multi-tenant

---

## 10) Validation finale (checklist)
1. [ ] Menus Patrimoine visibles dans la barre latérale.
2. [ ] Toutes les pages Patrimoine s'ouvrent sans erreur.
3. [ ] CRUD complet sur l'onglet Patrimoine d'un bien.
4. [ ] Rendement et projection fonctionnels.
5. [ ] Relevés: génération, détail, envoi.
6. [ ] Contrôles d'erreurs formulaires OK.
7. [ ] Isolation multi-tenant OK.
8. [ ] Décision finale: GO / NO-GO.
