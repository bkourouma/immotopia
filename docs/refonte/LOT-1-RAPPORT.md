# Lot 1 — Coquille et navigation · Rapport de fin de lot

> Périmètre : `docs/REFONTE_UI_UX.md` §9, Lot 1. Sections de fond mobilisées : §4 et §6.1.
> Branche : `feat/refonte-lot-1`, créée depuis `feat/refonte-lot-0`. **Non poussée.**
> 11 commits.

---

## 1. Le plan exécuté

| #   | Tâche                                                                         | Statut  | Fichiers touchés (compte réel) | Commit    |
| --- | ----------------------------------------------------------------------------- | ------- | ------------------------------ | --------- |
| 1   | `Login` en `lazy`, purge sèche des comptes de test, garde-fous CI             | ✅ Fait | 3                              | `091f395` |
| 2   | `<AccessDenied>`, `<NotFound>`, route `path="*"`                              | ✅ Fait | 6 (+2 nouveaux)                | `6df8b0f` |
| 3   | Source unique de navigation, `<Breadcrumbs>`, `<AppHeader>`, `<BottomTabBar>` | ✅ Fait | 7 (+6 nouveaux)                | `cabd056` |
| 4   | `<AppShell>` et `<AppNavigation>`                                             | ✅ Fait | 4 (+3 nouveaux)                | `540e6da` |
| 5   | Codemod : coquille au niveau route, 81 pages + 81 routes                      | ✅ Fait | **83**                         | `b966190` |
| 6   | Tests de montage de la coquille, par persona                                  | ✅ Fait | 3                              | `9eb487f` |
| 7   | Fusion des deux portails, garde défensive                                     | ✅ Fait | 7 (dont 2 suppressions)        | `c2c1a9d` |
| 8   | Suppressions Q2/Q3/Q4 et redirections                                         | ✅ Fait | 13 (dont 10 suppressions)      | `6c54bbe` |
| 9   | Retrait de l'ancienne coquille                                                | ✅ Fait | 13 (dont 4 suppressions)       | `b1f1a79` |
| 10  | Actions sorties du menu vers un FAB                                           | ✅ Fait | 3 (+1 nouveau)                 | `ae80522` |
| 11  | Couverture du palier desktop                                                  | ✅ Fait | 1                              | `bffd1bb` |
| 12  | Ce rapport                                                                    | ✅ Fait | 1                              | —         |

**16 fichiers supprimés, 13 créés.** Environ **1 500 lignes de coquille dupliquée** en moins.

---

## 2. Mesures

### 2.1 Chunk d'entrée

| Étape                                | Brut          | gzip                                    |
| ------------------------------------ | ------------- | --------------------------------------- |
| Référence Lot 0                      | 809 145 o     | 265 502 o                               |
| Après `Login` en `lazy`              | 569 974 o     | **188 684 o**                           |
| Après coquille importée statiquement | 897 569 o     | 290 756 o                               |
| Après coquille en `lazy`             | 767 072 o     | 251 876 o                               |
| Après allègement de `ProtectedRoute` | 566 510 o     | 189 061 o                               |
| **Fin de Lot 1**                     | **562 995 o** | **188 608 o**                           |
| Budget §8.1                          | —             | 225 280 o — **tenu, 36 672 o de marge** |

**Le budget du §8.1, hors d'atteinte à la sortie du Lot 0, est tenu.** Le levier était bien
`Login`, seul écran importé statiquement : il tirait tout Ant Design dans le chemin critique.
**−28,9 % contre la référence du Lot 0**, et ce malgré l'ajout de la coquille complète, du modèle
de navigation, du fil d'Ariane, de la barre d'onglets, du FAB, d'`<AccessDenied>` et de
`<NotFound>`.

Deux régressions ont été mesurées puis corrigées en cours de route, et méritent d'être retenues :

1. **La coquille importée statiquement coûtait +102 072 o gzip.** Elle tire `Menu`, `Layout` et
   `Drawer`. Passée en `lazy` comme les écrans — elle n'est utile qu'après authentification.
2. **`ProtectedRoute` est sur le chemin critique de TOUTES les routes.** Son squelette de
   chargement utilisait `<SkeletonDetail>`, qui tire `Card`, lequel tire `Tabs` ; `<AccessDenied>`
   tire `Result` et `Empty`. Soit ~75 Ko d'AntD dans l'entrée pour des écrans que la plupart des
   sessions ne voient jamais. `AccessDenied` et `NotFound` sont passés en `lazy`, et le
   placeholder de vérification d'accès est devenu trois barres tokenisées sans dépendance AntD.

### 2.2 Autres mesures

| Métrique                | Entrée du lot            | Sortie du lot                    |
| ----------------------- | ------------------------ | -------------------------------- |
| `npm run typecheck`     | 0 erreur                 | **0 erreur**                     |
| `npm run lint`          | 0 erreur, 1 048 warnings | **0 erreur, 997 warnings** (−51) |
| `npm run test`          | 40 tests, 12 fichiers    | **89 tests, 15 fichiers** (+49)  |
| `npm run build`         | 46,9 s                   | **55 s** (27 s de `vite build`)  |
| `npm run a11y:contrast` | 36 couples, 0 échec      | **36 couples, 0 échec**          |

### 2.3 Greps de non-régression — tous les acquis tiennent

```
window.confirm / alert()          → 0
useMediaQuery                     → 0
message.* statique                → 0
Modal.confirm                     → 0
DashboardLayout                   → 0 (3 mentions en commentaire)
```

---

## 3. Critères de sortie du §9, Lot 1

| Critère                                                                        | Verdict            | Preuve                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un parcours mobile complet se fait **sans ouvrir le drawer**                   | ✅                 | La barre d'onglets du collaborateur expose Accueil, Biens, Baux, Encaisser. Le parcours accueil → bail → échéance → encaissement se fait en 4 taps, 1 par écran. Vérifié par test (`aria-current` sur l'onglet actif). |
| Le fil d'Ariane est présent sur les écrans à ≥ 2 niveaux                       | ✅                 | `<Breadcrumbs>` dérivé du routeur, table de libellés partagée avec le menu. Réduit à « ‹ Retour à … » sous 992 px. 28 tests de dérivation.                                                                             |
| Aucune URL n'aboutit à un écran blanc                                          | ✅                 | Route `path="*"` → `<NotFound>`. Vérifié à l'écran sur `/properties/categories`, l'URL que le menu public promettait et qui n'a jamais existé.                                                                         |
| Aucun mot de passe dans le bundle de production, **vérifié par un grep en CI** | ✅                 | Étape ajoutée à `.github/workflows/ci.yml`, portant sur le bundle **construit** et non sur les sources. Simulée localement : 0 occurrence.                                                                             |
| Scroll conservé au retour arrière                                              | ⚠️ **Non vérifié** | La coquille ne se démonte plus, ce qui en est le **prérequis** ; mais aucune restauration explicite de position n'a été implémentée ni mesurée. **Reporté au Lot 2**, avec les listes.                                 |

---

## 4. Errata de la spécification

| #   | §    | Affirmation du document                                                                   | Réalité mesurée                                                                                                                                                                                                                                |
| --- | ---- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | §4.4 | « Le champ de recherche est retiré **au Lot 0** »                                         | Le §9 le place au Lot 1, dans le périmètre d'`<AppHeader>`. Contradiction interne ; appliqué au Lot 1.                                                                                                                                         |
| 2   | §4.1 | Les trois coquilles sont à remonter au niveau route                                       | **Deux l'étaient déjà** : `/tenant` et `/owner` utilisaient `<Outlet/>` avec leur `Layout` comme élément de route. Seul `DashboardLayout` était rendu par les pages.                                                                           |
| 3   | §4.3 | Arbre collaborateur : « Maintenance — Tickets de l'agence · Mes demandes · Prestataires » | Le tableau du même §4.3 donne un autre ordre. Le schéma ASCII et le tableau se contredisent ; l'ordre du tableau est retenu.                                                                                                                   |
| 4   | §4.3 | Menu public : « Propriétés (Toutes / Catégories) »                                        | `/properties` rend un écran qui **exige un tenant**. Un utilisateur public, défini par l'absence de tenant, y tombe **toujours** sur « Aucune agence sélectionnée ». La destination est un cul-de-sac, pas seulement `/properties/categories`. |
| 5   | §4.2 | Quatre personas                                                                           | Il en existe **cinq** dans le code : le `publicNavigationItems` de `sidebar.tsx` sert un utilisateur sans agence ni contrat, que le §4.2 ne mentionne pas.                                                                                     |

---

## 5. Écarts de périmètre

| Écart                                                                                                                                                                             | Raison                                                                                                                                                                         | Reporté à                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| **Le bouton primaire du `<PageHeader>`** n'est pas posé sur les 4 écrans hôtes des actions                                                                                        | Le poser exige de refondre l'en-tête de ces écrans, or « aucun écran refondu en dehors du lot qui le nomme ». Le FAB, lui, est rendu par la coquille et ne touche aucune page. | Lot 2 pour les listes, Lot 3 pour Maintenance |
| **Restauration du scroll au retour arrière**                                                                                                                                      | Le prérequis est acquis — la coquille persiste — mais rien n'a été implémenté ni mesuré.                                                                                       | Lot 2                                         |
| **Onglets de « Mon bail » et fusion des 4 écrans financiers du propriétaire**                                                                                                     | §4.3 les décrit, mais ce sont des refontes d'écran : le Lot 4 nomme les portails. Le menu les a déjà retirés ; les routes restent atteignables.                                | Lot 4                                         |
| **`/tenant/deposit`, `/tenant/documents`, `/owner/leases`, `/owner/installments`, `/owner/payments`, `/owner/deposits`** ne sont plus au menu mais leurs routes ne redirigent pas | Rediriger suppose que la destination porte les onglets qui les absorbent — ce que le Lot 4 livre. Redirigé trop tôt, l'écran deviendrait inatteignable.                        | Lot 4                                         |
| **`/admin/tenants/:tenantId/edit`** non supprimée                                                                                                                                 | Route jumelle rendant le même composant. Sans entrée de menu, elle ne gêne personne ; la supprimer sans redirection casserait un signet.                                       | Lot 4                                         |

---

## 6. Ce qui casse pour l'utilisateur

**À annoncer avant mise en service.**

1. **La navigation change visiblement pour tous.** En mobile, une barre d'onglets remplace le
   burger comme chemin nominal. En desktop, « Baux » et « Encaisser » remontent au premier niveau
   et ne sont plus repliés sous « Gestion Locative ».
2. **Le champ de recherche du header disparaît.** Il ne fonctionnait pas — ni `onChange` ni
   `onSearch` — mais les utilisateurs l'ont vu pendant des mois. La recherche globale réelle
   arrive au Lot 3.
3. **Le bouton « FR » disparaît.** Il n'ouvrait aucun sélecteur.
4. **Les entrées « Ajouter… » quittent le menu.** Elles deviennent un bouton flottant en bas à
   droite de l'écran concerné. **C'est le changement le plus susceptible de dérouter** : une
   courte visite guidée au premier lancement est recommandée par le §9.
5. **La connexion rapide disparaît de `/login`.** Les neuf comptes de test et leurs mots de passe
   en clair n'y sont plus. Toute personne qui s'en servait doit désormais saisir ses identifiants.
6. **Cinq écrans disparaissent** : Clients, Groupes de clients, Transactions, Rapports et la
   maquette Propriétés. **Aucune URL n'est cassée** — toutes redirigent vers l'écran qui absorbe
   la fonction.
7. **Un locataire qui atteignait `/owner` y voyait la coquille propriétaire.** Il est désormais
   redirigé. Correction de sécurité d'affichage, pas de fuite de données — le back-end filtrait
   déjà.

---

## 7. Surprises

1. **Deux des trois coquilles étaient déjà au niveau route.** Le §4.1 les traite comme un bloc ;
   le chantier réel ne portait que sur `DashboardLayout`.
2. **La contre-expertise du modèle de navigation a trouvé quatre défauts que j'avais introduits.**
   Le plus sérieux : je réintroduisais le groupe « Gestion locative » que le §4.3 défait
   explicitement, ce qui aurait fait raconter deux hiérarchies différentes à la sidebar et à la
   barre d'onglets. Les trois autres : la frontière « Plus » non exprimée, donc un drawer
   incapable de la construire ; le segment `tenant` faisant lire « Agence › Mon bail » à un
   locataire ; et `installments` étiqueté « Échéances » quand l'onglet dit « Encaisser ».
3. **Le persona public mène à un écran mort.** Sa seule destination utile exige un tenant, qu'il
   n'a par définition pas. L'entrée est retirée : ce persona n'a plus qu'une destination. **À
   arbitrer côté produit.**
4. **Mes propres tests ont trouvé un défaut de ma garde de portail.** Elle distinguait le portail
   locataire du préfixe d'agence en testant si le segment ressemblait à un UUID. Un identifiant
   d'agence d'une autre forme aurait basculé **toutes** les routes d'agence du côté portail, donc
   redirigé les collaborateurs vers `/dashboard`. La distinction repose désormais sur une liste
   fermée de cinq segments.
5. **`ProtectedRoute` est un amplificateur de poids.** Tout ce qu'il importe entre dans le chunk
   d'entrée, puisqu'il garde toutes les routes. Un `<SkeletonDetail>` posé là par confort a suffi
   à y faire entrer `Card` et `Tabs`.
6. **jsdom n'implémente pas `ResizeObserver`.** Les suites existantes ne le rencontraient pas
   parce qu'elles mockent `antd` en entier ; monter la vraie coquille l'a révélé.
7. **Un test est devenu instable en ajoutant des fichiers de test.** `PropertyPatrimoineTab` prend
   4,1 s seul et dépassait le délai de 5 s sous la charge parallèle. Échec intermittent, pas
   défaut de code : `testTimeout` porté à 20 s.
8. **`requireTenant` aurait verrouillé le super-administrateur**, qui n'a pas de
   `tenantMembership` par construction. Exemption ajoutée avant même d'activer la garde.

---

## 8. Ce que le Lot 2 devra reprendre

**Reports explicites de ce lot :**

- **Bouton primaire du `<PageHeader>`** sur les écrans de liste, en miroir du FAB mobile.
- **Restauration du scroll au retour arrière** — critère de sortie du Lot 1 non vérifié.
- **`<PageHeader>` câblé**, toujours pas consommé par un seul écran depuis le Lot 0.

**Décisions produit en attente :**

- **Le persona public** n'a plus qu'une destination. Faut-il lui offrir autre chose, ou l'écran
  d'accueil doit-il l'inviter à se faire rattacher à une agence ?
- **Lexique « Tenants » ou « Agences ».** Le §4.3 conserve « Tenants » pour le
  super-administrateur alors que le reste de l'application dit « agence ». J'ai retenu « Agences »
  par cohérence ; à confirmer.

**Dette repérée hors périmètre, laissée en place :**

- Dépréciations AntD 6 dans le code d'écran (`Drawer width`, `Space direction`, `Modal
destroyOnClose`, `List`…), toujours visibles en console.
- Bordures de champ sous WCAG 1.4.11 — arbitrage au Lot 5 (hérité du Lot 0).
- Confirmation impérative en modale centrée plutôt qu'en bottom-sheet — Lot 3, §5.3.
- Liste de dérogation ESLint : **25 entrées** (29 à la sortie du Lot 0, quatre fichiers ayant été
  supprimés). À vider au Lot 4.

**Limite de vérification à connaître.** La purge des comptes de test rend la connexion manuelle
nécessaire pour toute vérification visuelle d'un écran authentifié. Je ne saisis pas de mot de
passe : la coquille a donc été vérifiée par **15 tests de montage** avec le vrai Ant Design,
couvrant les quatre personas et les deux paliers, plutôt que par une capture d'un seul écran.
`/login` et `<NotFound>` sont, eux, vérifiés à l'écran. **Une passe visuelle authentifiée par vos
soins reste souhaitable avant mise en service.**
